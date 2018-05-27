import {
  Chain, ValueConverter, Assign, Conditional,
  AccessThis, AccessScope, AccessMember, AccessKeyed,
  CallScope, CallFunction, CallMember,
  Unary, BindingBehavior, Binary,
  LiteralPrimitive, LiteralArray, LiteralObject, LiteralString, LiteralTemplate, Expression
} from './ast';

export class Parser {
  private cache: { [key: string]: Expression };
  constructor() {
    this.cache = Object.create(null);
  }

  public parse(input: string): Expression {
    input = input || '';

    return this.cache[input] || (this.cache[input] = parseChain(new ParserState(input)));
  }
}

export class ParserState {
  public index: number;
  public startIndex: number;
  public input: string;
  public lastIndex: number;
  public length: number;
  public currentToken: Token;
  public tokenValue: string | number;
  public currentChar: number;
  public get tokenRaw(): string {
    return this.input.slice(this.startIndex, this.index);
  }

  constructor(input: string) {
    this.index = 0;
    this.startIndex = 0;
    this.lastIndex = 0;
    this.input = input;
    this.length = input.length;
    this.currentToken = Token.EOF;
    this.tokenValue = '';
    this.currentChar = input.charCodeAt(0);
  }
}

export function parseChain(state: ParserState): Chain | ReturnType<typeof parseBindingBehavior> {
  nextToken(state);
  const expressions = [];

  while (!(state.currentToken & Token.ExpressionTerminal)) {
    expressions.push(parseBindingBehavior(state));
  }
  if (state.currentToken !== Token.EOF) {
    if (optional(state, Token.Semicolon)) {
      error(state, 'Multiple expressions are not allowed.');
    }
    if (state.currentToken & Token.ClosingToken) {
      error(state, `Unconsumed token ${state.tokenRaw}`);
    }
  }
  return (expressions.length === 1) ? expressions[0] : new Chain(expressions);
}

export function parseBindingBehavior(state: ParserState): BindingBehavior | ReturnType<typeof parseValueConverter> {
  let result: BindingBehavior | ReturnType<typeof parseValueConverter> = parseValueConverter(state);
  while (optional(state, Token.Ampersand)) {
    result = new BindingBehavior(result, <string>state.tokenValue, parseVariadicArguments(state));
  }
  return result;
}

export function parseValueConverter(state: ParserState): ValueConverter | ReturnType<typeof parseExpression> {
  let result: ValueConverter | ReturnType<typeof parseExpression> = parseExpression(state);
  while (optional(state, Token.Bar)) {
    result = new ValueConverter(result, <string>state.tokenValue, parseVariadicArguments(state));
  }
  return result;
}

export function parseVariadicArguments(state: ParserState): Array<ReturnType<typeof parseExpression>> {
  nextToken(state);
  const result = [];
  while (optional(state, Token.Colon)) {
    result.push(parseExpression(state));
  }
  return result;
}

export function parseExpression(state: ParserState): Assign | ReturnType<typeof parseConditional> {
  let exprStart = state.index;
  let result: ReturnType<typeof parseExpression> = parseConditional(state);

  while (state.currentToken === Token.Equals) {
    if (!result.isAssignable) {
      error(state, `Expression ${state.input.slice(exprStart, state.startIndex)} is not assignable`);
    }
    nextToken(state);
    exprStart = state.index;
    result = new Assign(result, parseConditional(state));
  }
  return result;
}

export function parseConditional(state: ParserState): Conditional | ReturnType<typeof parseBinary> {
  let result: ReturnType<typeof parseConditional> = parseBinary(state, 0);

  if (optional(state, Token.Question)) {
    const yes = parseExpression(state);
    expect(state, Token.Colon);
    result = new Conditional(result, yes, parseExpression(state));
  }
  return result;
}

export function parseBinary(state: ParserState, minPrecedence: number): Binary | ReturnType<typeof parseLeftHandSide> {
  let left = parseLeftHandSide(state, 0);

  while (state.currentToken & Token.BinaryOp) {
    const opToken = state.currentToken;
    if ((opToken & Token.Precedence) < minPrecedence) {
      break;
    }
    nextToken(state);
    left = new Binary(<string>TokenValues[opToken & Token.TokenMask], left, parseBinary(state, opToken & Token.Precedence));
  }
  return left;
}

export function parseLeftHandSide(state: ParserState, context: Context): Binary | Unary | AccessThis | AccessScope | AccessMember | AccessKeyed | LiteralArray | LiteralObject | LiteralPrimitive | LiteralString | LiteralTemplate | CallFunction | CallMember | CallScope {
  let result: ReturnType<typeof parseExpression> = undefined as any;

  // Unary + Primary expression
  primary: switch (state.currentToken) {
  case Token.Plus:
    nextToken(state);
    return parseLeftHandSide(state, 0);
  case Token.Minus:
    nextToken(state);
    return new Binary('-', new LiteralPrimitive(0), parseLeftHandSide(state, 0));
  case Token.Exclamation:
  case Token.TypeofKeyword:
  case Token.VoidKeyword:
    const op = TokenValues[state.currentToken & Token.TokenMask];
    nextToken(state);
    return new Unary(<any>op, parseLeftHandSide(state, 0));
  case Token.ParentScope: // $parent
    {
      do {
        nextToken(state);
        context++; // ancestor
        if (optional(state, Token.Dot)) {
          if (state.currentToken === <any>Token.Dot) {
            error(state);
          }
          continue;
        } else if (state.currentToken & Token.AccessScopeTerminal) {
          result = new AccessThis(context & Context.Ancestor);
          // Keep the ShorthandProp flag, clear all the others, and set context to This
          context = (context & Context.ShorthandProp) | Context.This;
          break primary;
        } else {
          error(state);
        }
      } while (state.currentToken === Token.ParentScope);
    }
  // falls through
  case Token.Identifier: // identifier
    {
      result = new AccessScope(<string>state.tokenValue, context & Context.Ancestor);
      nextToken(state);
      context = (context & Context.ShorthandProp) | Context.Scope;
      break;
    }
  case Token.ThisScope: // $this
    nextToken(state);
    result = new AccessThis(0);
    context = (context & Context.ShorthandProp) | Context.This;
    break;
  case Token.OpenParen: // parenthesized expression
    nextToken(state);
    result = parseExpression(state);
    expect(state, Token.CloseParen);
    break;
  case Token.OpenBracket: // literal array
    {
      nextToken(state);
      const elements = [];
      if (state.currentToken !== <any>Token.CloseBracket) {
        do {
          elements.push(parseExpression(state));
        } while (optional(state, Token.Comma));
      }
      expect(state, Token.CloseBracket);
      result = new LiteralArray(elements);
      break;
    }
  case Token.OpenBrace: // object
    {
      const keys = [];
      const values = [];
      nextToken(state);
      while (state.currentToken !== <any>Token.CloseBrace) {
        if (state.currentToken & Token.IdentifierOrKeyword) {
          const { currentChar, index } = state;
          const currentToken: Token = state.currentToken;
          keys.push(state.tokenValue);
          nextToken(state);
          if (optional(state, Token.Colon)) {
            values.push(parseExpression(state));
          } else {
            state.currentChar = currentChar;
            state.currentToken = currentToken;
            state.index = index;
            values.push(parseLeftHandSide(state, Context.ShorthandProp));
          }
        } else if (state.currentToken & Token.Literal) {
          keys.push(state.tokenValue);
          nextToken(state);
          expect(state, Token.Colon);
          values.push(parseExpression(state));
        } else {
          error(state);
        }
        if (state.currentToken !== <any>Token.CloseBrace) {
          expect(state, Token.Comma);
        }
      }
      expect(state, Token.CloseBrace);
      result = new LiteralObject(keys, values);
      break;
    }
  case Token.StringLiteral:
    result = new LiteralString(<string>state.tokenValue);
    nextToken(state);
    break;
  case Token.TemplateTail:
    result = new LiteralTemplate([<string>state.tokenValue], undefined, undefined, undefined);
    nextToken(state);
    break;
  case Token.TemplateContinuation:
    result = parseTemplate(state, 0);
    break;
  case Token.NumericLiteral:
    {
      result = new LiteralPrimitive(<any>state.tokenValue);
      nextToken(state);
      break;
    }
  case Token.NullKeyword:
  case Token.UndefinedKeyword:
  case Token.TrueKeyword:
  case Token.FalseKeyword:
    result = new LiteralPrimitive(<any>TokenValues[state.currentToken & Token.TokenMask]);
    nextToken(state);
    break;
  default:
    if (state.index >= state.length) {
      error(state, 'Unexpected end of expression');
    } else {
      error(state);
    }
  }

  // bail out here if it's an ES6 object shorthand property (and let the caller throw on periods etc)
  if (context & Context.ShorthandProp) {
    return <any>result;
  }

  let name = state.tokenValue;
  while (state.currentToken & Token.MemberOrCallExpression) {
    switch (state.currentToken) {
    case Token.Dot:
      nextToken(state);
      if (!(state.currentToken & Token.IdentifierOrKeyword)) {
        error(state);
      }
      name = state.tokenValue;
      nextToken(state);
      // Change $This to $Scope, change $Scope to $Member, keep $Member as-is, change $Keyed to $Member, disregard other flags
      context = ((context & (Context.This | Context.Scope)) << 1) | (context & Context.Member) | ((context & Context.Keyed) >> 1);
      if (state.currentToken === <any>Token.OpenParen) {
        continue;
      }
      if (context & Context.Scope) {
        result = new AccessScope(<string>name, (<any>result).ancestor);
      } else { // if it's not $Scope, it's $Member
        result = new AccessMember(result, <string>name);
      }
      continue;
    case Token.OpenBracket:
      nextToken(state);
      context = Context.Keyed;
      result = new AccessKeyed(result, parseExpression(state));
      expect(state, Token.CloseBracket);
      break;
    case Token.OpenParen:
      nextToken(state);
      const args = [];
      while (state.currentToken !== <any>Token.CloseParen) {
        args.push(parseExpression(state));
        if (!optional(state, Token.Comma)) {
          break;
        }
      }
      expect(state, Token.CloseParen);
      if (context & Context.Scope) {
        result = new CallScope(<string>name, args, (<any>result).ancestor);
      } else if (context & Context.Member) {
        result = new CallMember(result, <string>name, args);
      } else {
        result = new CallFunction(result, args);
      }
      context = 0;
      break;
    case Token.TemplateTail:
      result = new LiteralTemplate([<string>state.tokenValue], [], [state.tokenRaw], result);
      nextToken(state);
      break;
    case Token.TemplateContinuation:
      result = parseTemplate(state, context | Context.Tagged, <any>result);
    default:
    }
  }

  return <any>result;
}

export function parseTemplate(state: ParserState, context: Context, func?: AccessScope | AccessMember | AccessKeyed): LiteralTemplate {
  const cooked: Array<string> = [<string>state.tokenValue];
  const raw: string[] = context & Context.Tagged ? [state.tokenRaw] : undefined as any;
  expect(state, Token.TemplateContinuation);
  const expressions = [parseExpression(state)];

  while ((state.currentToken = scanTemplateTail(state)) !== Token.TemplateTail) {
    cooked.push(<string>state.tokenValue);
    if (context & Context.Tagged) {
      raw.push(state.tokenRaw);
    }
    expect(state, Token.TemplateContinuation);
    expressions.push(parseExpression(state));
  }

  cooked.push(<string>state.tokenValue);
  if (context & Context.Tagged) {
    raw.push(state.tokenRaw);
  }
  nextToken(state);
  return new LiteralTemplate(cooked, expressions, raw, func);
}

function nextToken(state: ParserState): void {
  /*
   * Each index in CharScanners (0-65535) contains a scan function for the charCode with that number.
   * The array is "zero-filled" with a throwing function and has functions for all ASCII chars (except ~@#`\)
   * and IdentifierParts from the Latin1 script (1314 in total).
   * Additional characters can be added via addIdentifierStart / addIdentifierPart.
   */
  while (state.index < state.length) {
    if (state.currentChar <= Char.Space) {
      nextChar(state);
      continue;
    }
    state.startIndex = state.index;
    if (state.currentChar === Char.Dollar || (state.currentChar >= Char.LowerA && state.currentChar <= Char.LowerZ)) {
      state.currentToken = scanIdentifier(state);
      return;
    }
    /*
     * Note: the lookup below could also handle the characters which are handled above. It's just a performance tweak (direct
     * comparisons are faster than array indexers)
     */
    if (((<any>state.currentToken) = CharScanners[state.currentChar](state)) !== null) { // a null token means the character must be skipped
      return;
    }
  }
  state.currentToken = Token.EOF;
}

function nextChar(state: ParserState): number {
  return state.currentChar = state.input.charCodeAt(++state.index);
}

function scanIdentifier(state: ParserState): Token.Identifier | typeof KeywordLookup[keyof typeof KeywordLookup] {
  // run to the next non-idPart
  while (AsciiIdParts.has(nextChar(state))
    // Note: "while(IdParts[nextChar(state)])" would be enough to make this work. This is just a performance
    // tweak, similar to the one in nextToken()
    || (state.currentChar > 0x7F && IdParts[state.currentChar])) { } // eslint-disable-line no-empty

  return KeywordLookup[state.tokenValue = state.tokenRaw] || Token.Identifier;
}

function scanNumber(state: ParserState, isFloat: boolean): Token.NumericLiteral {
  if (isFloat) {
    state.tokenValue = 0;
  } else {
    state.tokenValue = state.currentChar - Char.Zero;
    while (nextChar(state) <= Char.Nine && state.currentChar >= Char.Zero) {
      state.tokenValue = state.tokenValue * 10 + state.currentChar  - Char.Zero;
    }
  }

  if (isFloat || state.currentChar === Char.Dot) {
    // isFloat (coming from the period scanner) means the period was already skipped
    if (!isFloat) {
      nextChar(state);
    }
    const start = state.index;
    let value = state.currentChar - Char.Zero;
    while (nextChar(state) <= Char.Nine && state.currentChar >= Char.Zero) {
      value = value * 10 + state.currentChar  - Char.Zero;
    }
    state.tokenValue = state.tokenValue + value / 10 ** (state.index - start);
  }

  if (state.currentChar === Char.LowerE || state.currentChar === Char.UpperE) {
    const start = state.index;

    nextChar(state);
    if (state.currentChar === <any>Char.Minus || state.currentChar === <any>Char.Plus) {
      nextChar(state);
    }

    if (!(state.currentChar >= Char.Zero && state.currentChar <= Char.Nine)) {
      state.index = start;
      error(state, 'Invalid exponent');
    }
    while (nextChar(state) <= Char.Nine && state.currentChar >= Char.Zero) { } // eslint-disable-line no-empty
    state.tokenValue = parseFloat(state.input.slice(state.startIndex, state.index));
  }

  return Token.NumericLiteral;
}

function scanString(state: ParserState): Token.StringLiteral {
  const quote = state.currentChar;
  nextChar(state); // Skip initial quote.

  let unescaped = 0;
  const buffer = new Array<string>();
  let marker = state.index;

  while (state.currentChar !== quote) {
    if (state.currentChar === Char.Backslash) {
      buffer.push(state.input.slice(marker, state.index));

      nextChar(state);

      if (state.currentChar === <any>Char.LowerU) {
        nextChar(state);

        if (state.index + 4 < state.length) {
          const hex = state.input.slice(state.index, state.index + 4);

          if (!/[A-Z0-9]{4}/i.test(hex)) {
            error(state, `Invalid unicode escape [\\u${hex}]`);
          }

          unescaped = parseInt(hex, 16);
          state.index += 4;
          state.currentChar = state.input.charCodeAt(state.index);
        } else {
          error(state);
        }
      } else {
        unescaped = unescape(state.currentChar);
        nextChar(state);
      }

      buffer.push(String.fromCharCode(unescaped));
      marker = state.index;
    } else if (state.currentChar === /*EOF*/0) {
      error(state, 'Unterminated quote');
    } else {
      nextChar(state);
    }
  }

  const last = state.input.slice(marker, state.index);
  nextChar(state); // Skip terminating quote.

  // Compute the unescaped string value.
  let unescapedStr = last;

  if (buffer !== null && buffer !== undefined) {
    buffer.push(last);
    unescapedStr = buffer.join('');
  }

  state.tokenValue = unescapedStr;
  return Token.StringLiteral;
}

function scanTemplate(state: ParserState): Token.TemplateTail | Token.TemplateContinuation {
  let tail = true;
  let result = '';

  while (nextChar(state) !== Char.Backtick) {
    if (state.currentChar === Char.Dollar) {
      if ((state.index + 1) < state.length && state.input.charCodeAt(state.index + 1) === Char.OpenBrace) {
        state.index++;
        tail = false;
        break;
      } else {
        result += '$';
      }
    } else if (state.currentChar === Char.Backslash) {
      result += String.fromCharCode(unescape(nextChar(state)));
    } else {
      result += String.fromCharCode(state.currentChar);
    }
  }

  nextChar(state);
  state.tokenValue = result;
  if (tail) {
    return Token.TemplateTail;
  }
  return Token.TemplateContinuation;
}

function scanTemplateTail(state: ParserState): ReturnType<typeof scanTemplate> {
  if (state.index >= state.length) {
    error(state, 'Unterminated template');
  }
  state.index--;
  return scanTemplate(state);
}

function error(state: ParserState, message: string = `Unexpected token ${state.tokenRaw}`, column: number = state.startIndex): void {
  throw new Error(`Parser Error: ${message} at column ${column} in expression [${state.input}]`);
}

function optional(state: ParserState, token: Token): boolean {
  if (state.currentToken === token) {
    nextToken(state);
    return true;
  }

  return false;
}

function expect(state: ParserState, token: Token): void {
  if (state.currentToken === token) {
    nextToken(state);
  } else {
    error(state, `Missing expected token ${TokenValues[token & Token.TokenMask]}`, state.index);
  }
}

// todo: we're missing a few here (https://tc39.github.io/ecma262/#table-34)
// find out if the full list can be included without introducing a breaking change
function unescape(code: number): number {
  switch (code) {
  case Char.LowerF: return Char.FormFeed;
  case Char.LowerN: return Char.LineFeed;
  case Char.LowerR: return Char.CarriageReturn;
  case Char.LowerT: return Char.Tab;
  case Char.LowerV: return Char.VerticalTab;
  default: return code;
  }
}

// Context flags

export const enum Context {
  // The order of Context.This, Context.Scope, Context.Member and Context.Keyed affects their behavior due to the bitwise left shift
  // used in parseLeftHandSideExpresion
  This          = 0b00000000000000000000010000000000, //1 << 10;
  Scope         = 0b00000000000000000000100000000000, //1 << 11;
  Member        = 0b00000000000000000001000000000000, //1 << 12;
  Keyed         = 0b00000000000000000010000000000000, //1 << 13;
  ShorthandProp = 0b00000000000000000100000000000000, //1 << 14;
  Tagged        = 0b00000000000000001000000000000000, //1 << 15;
  // Performing a bitwise and (&) with this value (511) will return only the ancestor bit (is this limit high enough?)
  Ancestor      = 0b00000000000000000000000111111111 //(1 << 9) - 1;
}

// Tokens

export const enum Token {
  /* Performing a bitwise and (&) with this value (63) will return only the
   * token bit, which corresponds to the index of the token's value in the
   * TokenValues array */
  TokenMask                                  = 0b00000000000000000000000000111111, //(1 << 6) - 1,

  /* Shifting 6 bits to the left gives us a step size of 64 in a range of
   * 64 (1 << 6) to 448 (7 << 6) for our precedence bit
   * This is the lowest value which does not overlap with the token bits 0-38. */
  PrecShift                                  = 0b00000000000000000000000000000110, //6,

  /* Performing a bitwise and (&) with this value will return only the
   * precedence bit, which is used to determine the parsing order of binary
   * expressions */
  Precedence                                 = 0b00000000000000000000000111000000, //7 << PrecShift,

  // The tokens must start at 1 << 11 to avoid conflict with Precedence (1 << 10 === 16 << 6)
  // and can go up to 1 << 30 (1 << 31 rolls over to negative)
  ExpressionTerminal                         = 0b00000000000000000000100000000000, //1 << 11,
  /** ')' | '}' | ']' */
  ClosingToken                               = 0b00000000000000000001000000000000, //1 << 12,
  /** '(' | '{' | '[' */
  OpeningToken                               = 0b00000000000000000010000000000000, //1 << 13,
  /** EOF | '(' | '}' | ')' | ',' | '[' | '&' | '|' */
  AccessScopeTerminal                        = 0b00000000000000000100000000000000, //1 << 14,
  Keyword                                    = 0b00000000000000001000000000000000, //1 << 15,
  EOF                                        = 0b00000000000000010100100000000000, //1 << 16 | AccessScopeTerminal | ExpressionTerminal,
  Identifier                                 = 0b00000000000000100000000000000000, //1 << 17,
  IdentifierOrKeyword                        = 0b00000000000000101000000000000000, //Identifier | Keyword,
  Literal                                    = 0b00000000000001000000000000000000, //1 << 18,
  NumericLiteral                             = 0b00000000000011000000000000000000, //1 << 19 | Literal,
  StringLiteral                              = 0b00000000000101000000000000000000, //1 << 20 | Literal,
  BinaryOp                                   = 0b00000000001000000000000000000000, //1 << 21,
  /** '+' | '-' | '!' */
  UnaryOp                                    = 0b00000000010000000000000000000000, //1 << 22,
  /** '.' | '[' */
  MemberExpression                           = 0b00000000100000000000000000000000, //1 << 23,
  /** '.' | '[' | '(' */
  MemberOrCallExpression                     = 0b00000001000000000000000000000000, //1 << 24,
  TemplateTail                               = 0b00000011000000000000000000000000, //1 << 25 | MemberOrCallExpression,
  TemplateContinuation                       = 0b00000101000000000000000000000000, //1 << 26 | MemberOrCallExpression,

  /** false */      FalseKeyword             = 0b00000000000001001000000000000000, //0 | Keyword | Literal,
  /** true */       TrueKeyword              = 0b00000000000001001000000000000001, //1 | Keyword | Literal,
  /** null */       NullKeyword              = 0b00000000000001001000000000000010, //2 | Keyword | Literal,
  /** undefined */  UndefinedKeyword         = 0b00000000000001001000000000000011, //3 | Keyword | Literal,
  /** '$this' */    ThisScope                = 0b00000000000000101000000000000100, //4 | IdentifierOrKeyword,
  /** '$parent' */  ParentScope              = 0b00000000000000101000000000000101, //5 | IdentifierOrKeyword,

  /** '(' */  OpenParen                      = 0b00000001000000000110000000000110, // 6 | OpeningToken | AccessScopeTerminal | MemberOrCallExpression,
  /** '{' */  OpenBrace                      = 0b00000000000000000010000000000111, // 7 | OpeningToken,
  /** '.' */  Dot                            = 0b00000001100000000000000000001000, // 8 | MemberExpression | MemberOrCallExpression,
  /** '}' */  CloseBrace                     = 0b00000000000000000101100000001001, // 9 | AccessScopeTerminal | ClosingToken | ExpressionTerminal,
  /** ')' */  CloseParen                     = 0b00000000000000000101100000001010, //10 | AccessScopeTerminal | ClosingToken | ExpressionTerminal,
  /** ';' */  Semicolon                      = 0b00000000000000000000100000001011, //11 | ExpressionTerminal,
  /** ',' */  Comma                          = 0b00000000000000000100000000001100, //12 | AccessScopeTerminal,
  /** '[' */  OpenBracket                    = 0b00000001100000000110000000001101, //13 | OpeningToken | AccessScopeTerminal | MemberExpression | MemberOrCallExpression,
  /** ']' */  CloseBracket                   = 0b00000000000000000001100000001110, //14 | ClosingToken | ExpressionTerminal,
  /** ':' */  Colon                          = 0b00000000000000000100000000001111, //15 | AccessScopeTerminal,
  /** '?' */  Question                       = 0b00000000000000000000000000010000, //16,

  // Operator precedence: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Operator_Precedence#Table
  /** '&' */         Ampersand               = 0b00000000000000000100000000010011, //19 | AccessScopeTerminal,
  /** '|' */         Bar                     = 0b00000000000000000100000000010100, //20 | AccessScopeTerminal,
  /** '||' */        BarBar                  = 0b00000000001000000000000001010101, //21 /* 5*/ |  1 << PrecShift | BinaryOp,
  /** '&&' */        AmpersandAmpersand      = 0b00000000001000000000000010010110, //22 /* 6*/ |  2 << PrecShift | BinaryOp,
  /** '==' */        EqualsEquals            = 0b00000000001000000000000011010111, //23 /*10*/ |  3 << PrecShift | BinaryOp,
  /** '!=' */        ExclamationEquals       = 0b00000000001000000000000011011000, //24 /*10*/ |  3 << PrecShift | BinaryOp,
  /** '===' */       EqualsEqualsEquals      = 0b00000000001000000000000011011001, //25 /*10*/ |  3 << PrecShift | BinaryOp,
  /** '!== '*/       ExclamationEqualsEquals = 0b00000000001000000000000011011010, //26 /*10*/ |  3 << PrecShift | BinaryOp,
  /** '<' */         LessThan                = 0b00000000001000000000000100011011, //27 /*11*/ |  4 << PrecShift | BinaryOp,
  /** '>' */         GreaterThan             = 0b00000000001000000000000100011100, //28 /*11*/ |  4 << PrecShift | BinaryOp,
  /** '<=' */        LessThanEquals          = 0b00000000001000000000000100011101, //29 /*11*/ |  4 << PrecShift | BinaryOp,
  /** '>=' */        GreaterThanEquals       = 0b00000000001000000000000100011110, //30 /*11*/ |  4 << PrecShift | BinaryOp,
  /** 'in' */        InKeyword               = 0b00000000001000001000000100011111, //31 /*11*/ |  4 << PrecShift | BinaryOp | Keyword,
  /** 'instanceof' */InstanceOfKeyword       = 0b00000000001000001000000100100000, //32 /*11*/ |  4 << PrecShift | BinaryOp | Keyword,
  /** '+' */         Plus                    = 0b00000000011000000000000101100001, //33 /*13*/ |  5 << PrecShift | BinaryOp | UnaryOp,
  /** '-' */         Minus                   = 0b00000000011000000000000101100010, //34 /*13*/ |  5 << PrecShift | BinaryOp | UnaryOp,
  /** 'typeof' */    TypeofKeyword           = 0b00000000010000001000000000100011, //35 /*16*/ | UnaryOp | Keyword,
  /** 'void' */      VoidKeyword             = 0b00000000010000001000000000100100, //36 /*16*/ | UnaryOp | Keyword,
  /** '*' */         Asterisk                = 0b00000000001000000000000110100101, //37 /*14*/ |  6 << PrecShift | BinaryOp,
  /** '%' */         Percent                 = 0b00000000001000000000000110100110, //38 /*14*/ |  6 << PrecShift | BinaryOp,
  /** '/' */         Slash                   = 0b00000000001000000000000110100111, //39 /*14*/ |  6 << PrecShift | BinaryOp,
  /** '=' */         Equals                  = 0b00000000000000000000000000101000, //40,
  /** '!' */         Exclamation             = 0b00000000010000000000000000101001, //41 | UnaryOp
}

export const enum Char {
  Null           = 0x00,
  Tab            = 0x09,
  LineFeed       = 0x0A,
  VerticalTab    = 0x0B,
  FormFeed       = 0x0C,
  CarriageReturn = 0x0D,
  Space          = 0x20,
  Exclamation    = 0x21,
  DoubleQuote    = 0x22,
  Dollar         = 0x24,
  Percent        = 0x25,
  Ampersand      = 0x26,
  SingleQuote    = 0x27,
  OpenParen      = 0x28,
  CloseParen     = 0x29,
  Asterisk       = 0x2A,
  Plus           = 0x2B,
  Comma          = 0x2C,
  Minus          = 0x2D,
  Dot            = 0x2E,
  Slash          = 0x2F,
  Backtick       = 0x60,
  OpenBracket    = 0x5B,
  Backslash      = 0x5C,
  CloseBracket   = 0x5D,
  Caret          = 0x5E,
  Underscore     = 0x5F,
  OpenBrace      = 0x7B,
  Bar            = 0x7C,
  CloseBrace     = 0x7D,
  Colon          = 0x3A,
  Semicolon      = 0x3B,
  LessThan       = 0x3C,
  Equals         = 0x3D,
  GreaterThan    = 0x3E,
  Question       = 0x3F,

  Zero   = 0x30,
  One    = 0x31,
  Two    = 0x32,
  Three  = 0x33,
  Four   = 0x34,
  Five   = 0x35,
  Six    = 0x36,
  Seven  = 0x37,
  Eight  = 0x38,
  Nine   = 0x39,

  UpperA = 0x41,
  UpperB = 0x42,
  UpperC = 0x43,
  UpperD = 0x44,
  UpperE = 0x45,
  UpperF = 0x46,
  UpperG = 0x47,
  UpperH = 0x48,
  UpperI = 0x49,
  UpperJ = 0x4A,
  UpperK = 0x4B,
  UpperL = 0x4C,
  UpperM = 0x4D,
  UpperN = 0x4E,
  UpperO = 0x4F,
  UpperP = 0x50,
  UpperQ = 0x51,
  UpperR = 0x52,
  UpperS = 0x53,
  UpperT = 0x54,
  UpperU = 0x55,
  UpperV = 0x56,
  UpperW = 0x57,
  UpperX = 0x58,
  UpperY = 0x59,
  UpperZ = 0x5A,

  LowerA  = 0x61,
  LowerB  = 0x62,
  LowerC  = 0x63,
  LowerD  = 0x64,
  LowerE  = 0x65,
  LowerF  = 0x66,
  LowerG  = 0x67,
  LowerH  = 0x68,
  LowerI  = 0x69,
  LowerJ  = 0x6A,
  LowerK  = 0x6B,
  LowerL  = 0x6C,
  LowerM  = 0x6D,
  LowerN  = 0x6E,
  LowerO  = 0x6F,
  LowerP  = 0x70,
  LowerQ  = 0x71,
  LowerR  = 0x72,
  LowerS  = 0x73,
  LowerT  = 0x74,
  LowerU  = 0x75,
  LowerV  = 0x76,
  LowerW  = 0x77,
  LowerX  = 0x78,
  LowerY  = 0x79,
  LowerZ  = 0x7A
}

const KeywordLookup: {
  [key: string]: Token.TrueKeyword | Token.NullKeyword | Token.FalseKeyword | Token.UndefinedKeyword | Token.ThisScope | Token.ParentScope | Token.InKeyword | Token.InstanceOfKeyword | Token.TypeofKeyword | Token.VoidKeyword;
} = Object.create(null);
KeywordLookup.true = Token.TrueKeyword;
KeywordLookup.null = Token.NullKeyword;
KeywordLookup.false = Token.FalseKeyword;
KeywordLookup.undefined = Token.UndefinedKeyword;
KeywordLookup.$this = Token.ThisScope;
KeywordLookup.$parent = Token.ParentScope;
KeywordLookup.in = Token.InKeyword;
KeywordLookup.instanceof = Token.InstanceOfKeyword;
KeywordLookup.typeof = Token.TypeofKeyword;
KeywordLookup.void = Token.VoidKeyword;

/**
 * Array for mapping tokens to token values. The indices of the values
 * correspond to the token bits 0-38.
 * For this to work properly, the values in the array must be kept in
 * the same order as the token bits.
 * Usage: TokenValues[token & Token.TokenMask]
 */
const TokenValues = [
  false, true, null, undefined, '$this', '$parent',

  '(', '{', '.', '}', ')', ';', ',', '[', ']', ':', '?', '\'', '"',

  '&', '|', '||', '&&', '==', '!=', '===', '!==', '<', '>',
  '<=', '>=', 'in', 'instanceof', '+', '-', 'typeof', 'void', '*', '%', '/', '=', '!'
];

/**
 * Ranges of code points in pairs of 2 (eg 0x41-0x5B, 0x61-0x7B, ...) where the second value is not inclusive (5-7 means 5 and 6)
 * Single values are denoted by the second value being a 0
 *
 * Copied from output generated with "node build/generate-unicode.js"
 *
 * See also: https://en.wikibooks.org/wiki/Unicode/Character_reference/0000-0FFF
 */
const codes = {
  /* [$0-9A-Za_a-z] */
  AsciiIdPart: [0x24, 0, 0x30, 0x3A, 0x41, 0x5B, 0x5F, 0, 0x61, 0x7B],
  IdStart: /*IdentifierStart*/[0x24, 0, 0x41, 0x5B, 0x5F, 0, 0x61, 0x7B, 0xAA, 0, 0xBA, 0, 0xC0, 0xD7, 0xD8, 0xF7, 0xF8, 0x2B9, 0x2E0, 0x2E5, 0x1D00, 0x1D26, 0x1D2C, 0x1D5D, 0x1D62, 0x1D66, 0x1D6B, 0x1D78, 0x1D79, 0x1DBF, 0x1E00, 0x1F00, 0x2071, 0, 0x207F, 0, 0x2090, 0x209D, 0x212A, 0x212C, 0x2132, 0, 0x214E, 0, 0x2160, 0x2189, 0x2C60, 0x2C80, 0xA722, 0xA788, 0xA78B, 0xA7AF, 0xA7B0, 0xA7B8, 0xA7F7, 0xA800, 0xAB30, 0xAB5B, 0xAB5C, 0xAB65, 0xFB00, 0xFB07, 0xFF21, 0xFF3B, 0xFF41, 0xFF5B],
  Digit: /*DecimalNumber*/[0x30, 0x3A],
  Skip: /*Skippable*/[0, 0x21, 0x7F, 0xA1]
};

/**
 * Decompress the ranges into an array of numbers so that the char code
 * can be used as an index to the lookup
 */
function decompress(lookup: Array<CharScanner | number> | null, set: Set<number> | null, compressed: number[], value: CharScanner | number | boolean): void {
  const rangeCount = compressed.length;
  for (let i = 0; i < rangeCount; i += 2) {
    const start = compressed[i];
    let end = compressed[i + 1];
    end = end > 0 ? end : start + 1;
    if (lookup) {
      lookup.fill(<CharScanner | number>value, start, end);
    }
    if (set) {
      for (let ch = start; ch < end; ch++) {
        set.add(ch);
      }
    }
  }
}

// CharFuncLookup functions
function returnToken<T extends Token>(token: T): (s: ParserState) => T {
  return s => {
    nextChar(s);
    return token;
  };
}
const unexpectedCharacter: CharScanner = s => {
  error(s, `Unexpected character [${String.fromCharCode(s.currentChar)}]`);
  return null;
};
unexpectedCharacter.notMapped = true;

// ASCII IdentifierPart lookup
const AsciiIdParts = new Set();
decompress(null, AsciiIdParts, codes.AsciiIdPart, true);

// IdentifierPart lookup
const IdParts = new Uint8Array(0xFFFF);
decompress(<any>IdParts, null, codes.IdStart, 1);
decompress(<any>IdParts, null, codes.Digit, 1);

type CharScanner = ((p: ParserState) => Token | null) & { notMapped?: boolean };

// Character scanning function lookup
const CharScanners = new Array<CharScanner>(0xFFFF);
CharScanners.fill(unexpectedCharacter, 0, 0xFFFF);

decompress(CharScanners, null, codes.Skip, s => {
  nextChar(s);
  return null;
});
decompress(CharScanners, null, codes.IdStart, scanIdentifier);
decompress(CharScanners, null, codes.Digit, s => scanNumber(s, false));

CharScanners[Char.DoubleQuote] =
CharScanners[Char.SingleQuote] = s => {
  return scanString(s);
};
CharScanners[Char.Backtick] = s => {
  return scanTemplate(s);
};

// !, !=, !==
CharScanners[Char.Exclamation] = s => {
  if (nextChar(s) !== Char.Equals) {
    return Token.Exclamation;
  }
  if (nextChar(s) !== Char.Equals) {
    return Token.ExclamationEquals;
  }
  nextChar(s);
  return Token.ExclamationEqualsEquals;
};

// =, ==, ===
CharScanners[Char.Equals] =  s => {
  if (nextChar(s) !== Char.Equals) {
    return Token.Equals;
  }
  if (nextChar(s) !== Char.Equals) {
    return Token.EqualsEquals;
  }
  nextChar(s);
  return Token.EqualsEqualsEquals;
};

// &, &&
CharScanners[Char.Ampersand] = s => {
  if (nextChar(s) !== Char.Ampersand) {
    return Token.Ampersand;
  }
  nextChar(s);
  return Token.AmpersandAmpersand;
};

// |, ||
CharScanners[Char.Bar] = s => {
  if (nextChar(s) !== Char.Bar) {
    return Token.Bar;
  }
  nextChar(s);
  return Token.BarBar;
};

// .
CharScanners[Char.Dot] = s => {
  if (nextChar(s) <= Char.Nine && s.currentChar >= Char.Zero) {
    return scanNumber(s, true);
  }
  return Token.Dot;
};

// <, <=
CharScanners[Char.LessThan] =  s => {
  if (nextChar(s) !== Char.Equals) {
    return Token.LessThan;
  }
  nextChar(s);
  return Token.LessThanEquals;
};

// >, >=
CharScanners[Char.GreaterThan] =  s => {
  if (nextChar(s) !== Char.Equals) {
    return Token.GreaterThan;
  }
  nextChar(s);
  return Token.GreaterThanEquals;
};

CharScanners[Char.Percent]      = returnToken(Token.Percent);
CharScanners[Char.OpenParen]    = returnToken(Token.OpenParen);
CharScanners[Char.CloseParen]   = returnToken(Token.CloseParen);
CharScanners[Char.Asterisk]     = returnToken(Token.Asterisk);
CharScanners[Char.Plus]         = returnToken(Token.Plus);
CharScanners[Char.Comma]        = returnToken(Token.Comma);
CharScanners[Char.Minus]        = returnToken(Token.Minus);
CharScanners[Char.Slash]        = returnToken(Token.Slash);
CharScanners[Char.Colon]        = returnToken(Token.Colon);
CharScanners[Char.Semicolon]    = returnToken(Token.Semicolon);
CharScanners[Char.Question]     = returnToken(Token.Question);
CharScanners[Char.OpenBracket]  = returnToken(Token.OpenBracket);
CharScanners[Char.CloseBracket] = returnToken(Token.CloseBracket);
CharScanners[Char.OpenBrace]    = returnToken(Token.OpenBrace);
CharScanners[Char.CloseBrace]   = returnToken(Token.CloseBrace);

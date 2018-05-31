import {
  ValueConverterExpression, AssignmentExpression, ConditionalExpression,
  AccessThisExpression, AccessScopeExpression, AccessMemberExpression, AccessKeyedExpression,
  CallScopeExpression, CallFunctionExpression, CallMemberExpression,
  UnaryExpression, BindingBehaviorExpression, BinaryExpression,
  PrimitiveLiteralExpression, ArrayLiteralExpression, ObjectLiteralExpression, TemplateExpression, TaggedTemplateExpression,
  IsLeftHandSideExpression, IsAssignmentExpression, IsBinaryExpression, IsBindingBehaviorExpression, IsConditionalExpression,
  IsUnaryExpression, IsValueConverterExpression, IsAssignableExpression, IsPrimaryExpression
} from './ast';

export class Parser {
  private cache: { [key: string]: IsBindingBehaviorExpression };
  constructor() {
    this.cache = Object.create(null);
  }

  public parse(input: string): IsBindingBehaviorExpression {
    input = input || '';

    return this.cache[input] || (this.cache[input] = parse(new ParserState(input), Access.Reset, Precedence.Variadic));
  }
}

class ParserState {
  public index: number;
  public startIndex: number;
  public input: string;
  public lastIndex: number;
  public length: number;
  public currentToken: Token;
  public tokenValue: string | number;
  public currentChar: number;
  public assignable: boolean;
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
    this.assignable = true;
    nextToken(this);
    if (this.currentToken & Token.ExpressionTerminal) {
      error(this, 'Invalid start of expression');
    }
  }
}

function parse<T extends Precedence>(state: ParserState, access: Access, minPrecedence: T):
  T extends Precedence.Primary ? IsPrimaryExpression :
  T extends Precedence.LeftHandSide ? IsLeftHandSideExpression :
  T extends Precedence.Binary ? IsBinaryExpression :
  T extends Precedence.Conditional ? IsConditionalExpression :
  T extends Precedence.Assignment ? IsAssignmentExpression :
  T extends Precedence.Variadic ? IsBindingBehaviorExpression : IsBinaryExpression {

  let exprStart = state.index;
  state.assignable = Precedence.Binary > minPrecedence;
  let result = <any>undefined;

  if (state.currentToken & Token.UnaryOp) {
    /** parseUnaryExpression
     * https://tc39.github.io/ecma262/#sec-unary-operators
     *
     * UnaryExpression :
     *   1. LeftHandSideExpression
     *   2. void UnaryExpression
     *   3. typeof UnaryExpression
     *   4. + UnaryExpression
     *   5. - UnaryExpression
     *   6. ! UnaryExpression
     *
     * IsValidAssignmentTarget
     *   2,3,4,5,6 = false
     *   1 = see parseLeftHandSideExpression
     *
     * Note: technically we should throw on ++ / -- / +++ / ---, but there's nothing to gain from that
     */
    const op = TokenValues[state.currentToken & Token.Type];
    nextToken(state);
    result = new UnaryExpression(<any>op, parse(state, access, Precedence.Primary));
  } else {
    /** parsePrimaryExpression
     * https://tc39.github.io/ecma262/#sec-primary-expression
     *
     * PrimaryExpression :
     *   1. this
     *   2. IdentifierName
     *   3. Literal
     *   4. ArrayLiteral
     *   5. ObjectLiteral
     *   6. TemplateLiteral
     *   7. ParenthesizedExpression
     *
     * Literal :
     *    NullLiteral
     *    BooleanLiteral
     *    NumericLiteral
     *    StringLiteral
     *
     * ParenthesizedExpression :
     *   ( AssignmentExpression )
     *
     * IsValidAssignmentTarget
     *   1,3,4,5,6,7 = false
     *   2 = true
     */
    primary: switch (state.currentToken) {
    case Token.ParentScope: // $parent
      state.assignable = false;
      do {
        nextToken(state);
        access++; // ancestor
        if (optional(state, Token.Dot)) {
          if (state.currentToken === <any>Token.Dot) {
            error(state);
          }
          continue;
        } else if (state.currentToken & Token.AccessScopeTerminal) {
          result = new AccessThisExpression(access & Access.Ancestor);
          access = Access.This;
          break primary;
        } else {
          error(state);
        }
      } while (state.currentToken === Token.ParentScope);
    // falls through
    case Token.Identifier: // identifier
      result = new AccessScopeExpression(<string>state.tokenValue, access & Access.Ancestor);
      nextToken(state);
      access = Access.Scope;
      break;
    case Token.ThisScope: // $this
      state.assignable = false;
      nextToken(state);
      result = new AccessThisExpression(0);
      access = Access.This;
      break;
    case Token.OpenParen: // parenthesized expression
      nextToken(state);
      result = parse(state, Access.Reset, Precedence.Conditional);
      expect(state, Token.CloseParen);
      break;
    case Token.OpenBracket:
      /** parseArrayLiteralExpression
       * https://tc39.github.io/ecma262/#prod-ArrayLiteral
       *
       * ArrayLiteral :
       *   [ Elision(opt) ]
       *   [ ElementList ]
       *   [ ElementList, Elision(opt) ]
       *
       * ElementList :
       *   Elision(opt) AssignmentExpression
       *   ElementList, Elision(opt) AssignmentExpression
       *
       * Elision :
       *  ,
       *  Elision ,
       */
      nextToken(state);
      const elements = new Array<IsAssignmentExpression>();
      while (state.currentToken !== <any>Token.CloseBracket) {
        if (optional(state, Token.Comma)) {
          elements.push($undefined);
          if (state.currentToken === <any>Token.CloseBracket) {
            elements.push($undefined);
            break;
          }
        } else {
          elements.push(parse(state, access, Precedence.Assignment));
          if (!optional(state, Token.Comma)) {
            break;
          }
        }
      }
      expect(state, Token.CloseBracket);
      result = new ArrayLiteralExpression(elements);
      state.assignable = false;
      break;
    case Token.OpenBrace:
      /** parseObjectLiteralExpression
       * https://tc39.github.io/ecma262/#prod-Literal
       *
       * ObjectLiteral :
       *   { }
       *   { PropertyDefinitionList }
       *
       * PropertyDefinitionList :
       *   PropertyDefinition
       *   PropertyDefinitionList, PropertyDefinition
       *
       * PropertyDefinition :
       *   IdentifierName
       *   PropertyName : AssignmentExpression
       *
       * PropertyName :
       *   IdentifierName
       *   StringLiteral
       *   NumericLiteral
       */
      const keys = new Array<string | number>();
      const values = new Array<IsAssignmentExpression>();
      nextToken(state);
      while (state.currentToken !== Token.CloseBrace) {
        keys.push(state.tokenValue);
        // Literal = mandatory colon
        if (state.currentToken & Token.StringOrNumericLiteral) {
          nextToken(state);
          expect(state, Token.Colon);
          values.push(parse(state, Access.Reset, Precedence.Assignment));
        } else if (state.currentToken & Token.IdentifierName) {
          // IdentifierName = optional colon
          const { currentChar, currentToken, index } = <any>state;
          nextToken(state);
          if (optional(state, Token.Colon)) {
            values.push(parse(state, Access.Reset, Precedence.Assignment));
          } else {
            // Shorthand
            state.currentChar = currentChar;
            state.currentToken = currentToken;
            state.index = index;
            values.push(parse(state, Access.Reset, Precedence.Primary));
          }
        } else {
          error(state);
        }
        if (state.currentToken !== <any>Token.CloseBrace) {
          expect(state, Token.Comma);
        }
      }
      expect(state, Token.CloseBrace);
      result = new ObjectLiteralExpression(keys, values);
      state.assignable = false;
      break;
    case Token.TemplateTail:
      result = new TemplateExpression([<string>state.tokenValue]);
      state.assignable = false;
      nextToken(state);
      break;
    case Token.TemplateContinuation:
      /** parseTemplateLiteralExpression
       * https://tc39.github.io/ecma262/#prod-Literal
       *
       * Template :
       *   NoSubstitutionTemplate
       *   TemplateHead
       *
       * NoSubstitutionTemplate :
       *   ` TemplateCharacters(opt) `
       *
       * TemplateHead :
       *   ` TemplateCharacters(opt) ${
       *
       * TemplateSubstitutionTail :
       *   TemplateMiddle
       *   TemplateTail
       *
       * TemplateMiddle :
       *   } TemplateCharacters(opt) ${
       *
       * TemplateTail :
       *   } TemplateCharacters(opt) `
       *
       * TemplateCharacters :
       *   TemplateCharacter TemplateCharacters(opt)
       *
       * TemplateCharacter :
       *   $ [lookahead ≠ {]
       *   \ EscapeSequence
       *   SourceCharacter (but not one of ` or \ or $)
       *
       * TODO: de-duplicate template parsing logic
       */
      const cooked = [<string>state.tokenValue];
      expect(state, Token.TemplateContinuation);
      const expressions = [parse(state, access, Precedence.Assignment)];

      while ((state.currentToken = scanTemplateTail(state)) !== Token.TemplateTail) {
        cooked.push(<string>state.tokenValue);
        expect(state, Token.TemplateContinuation);
        expressions.push(parse(state, access, Precedence.Assignment));
      }

      cooked.push(<string>state.tokenValue);
      nextToken(state);
      result = new TemplateExpression(cooked, expressions);
      state.assignable = false;
      break;
    case Token.StringLiteral:
    case Token.NumericLiteral:
      result = new PrimitiveLiteralExpression(<any>state.tokenValue);
      state.assignable = false;
      nextToken(state);
      break;
    case Token.NullKeyword:
    case Token.UndefinedKeyword:
    case Token.TrueKeyword:
    case Token.FalseKeyword:
      result = TokenValues[state.currentToken & Token.Type];
      state.assignable = false;
      nextToken(state);
      break;
    default:
      if (state.index >= state.length) {
        error(state, 'Unexpected end of expression');
      } else {
        error(state);
      }
    }
    if (Precedence.LeftHandSide < minPrecedence) return result;

    /** parseMemberExpression (Token.Dot, Token.OpenBracket, Token.TemplateContinuation)
     * MemberExpression :
     *   1. PrimaryExpression
     *   2. MemberExpression [ AssignmentExpression ]
     *   3. MemberExpression . IdentifierName
     *   4. MemberExpression TemplateLiteral
     *
     * IsValidAssignmentTarget
     *   1,4 = false
     *   2,3 = true
     *
     *
     * parseCallExpression (Token.OpenParen)
     * CallExpression :
     *   1. MemberExpression Arguments
     *   2. CallExpression Arguments
     *   3. CallExpression [ AssignmentExpression ]
     *   4. CallExpression . IdentifierName
     *   5. CallExpression TemplateLiteral
     *
     * IsValidAssignmentTarget
     *   1,2,5 = false
     *   3,4 = true
     */
    let name = state.tokenValue;
    while (state.currentToken & Token.LeftHandSide) {
      switch (<any>state.currentToken) {
      case Token.Dot:
        state.assignable = true;
        nextToken(state);
        if (!(state.currentToken & Token.IdentifierName)) {
          error(state);
        }
        name = state.tokenValue;
        nextToken(state);
        // Change $This to $Scope, change $Scope to $Member, keep $Member as-is, change $Keyed to $Member, disregard other flags
        access = ((access & (Access.This | Access.Scope)) << 1) | (access & Access.Member) | ((access & Access.Keyed) >> 1);
        if (state.currentToken === <any>Token.OpenParen) {
          continue;
        }
        if (access & Access.Scope) {
          result = new AccessScopeExpression(<string>name, (<any>result).ancestor);
        } else { // if it's not $Scope, it's $Member
          result = new AccessMemberExpression(result, <string>name);
        }
        continue;
      case Token.OpenBracket:
        state.assignable = true;
        nextToken(state);
        access = Access.Keyed;
        result = new AccessKeyedExpression(result, parse(state, Access.Reset, Precedence.Conditional));
        expect(state, Token.CloseBracket);
        break;
      case Token.OpenParen:
        state.assignable = false;
        nextToken(state);
        const args = new Array<IsAssignmentExpression>();
        while (state.currentToken !== <any>Token.CloseParen) {
          args.push(parse(state, Access.Reset, Precedence.Conditional));
          if (!optional(state, Token.Comma)) {
            break;
          }
        }
        expect(state, Token.CloseParen);
        if (access & Access.Scope) {
          result = new CallScopeExpression(<string>name, args, (<any>result).ancestor);
        } else if (access & Access.Member) {
          result = new CallMemberExpression(result, <string>name, args);
        } else {
          result = new CallFunctionExpression(result, args);
        }
        access = 0;
        break;
      case Token.TemplateTail:
        state.assignable = false;
        result = new TaggedTemplateExpression([<string>state.tokenValue], [state.tokenRaw], result);
        nextToken(state);
        break;
      case Token.TemplateContinuation:
        /** parseTemplateLiteralExpression
         * https://tc39.github.io/ecma262/#prod-Literal
         *
         * Template :
         *   NoSubstitutionTemplate
         *   TemplateHead
         *
         * NoSubstitutionTemplate :
         *   ` TemplateCharacters(opt) `
         *
         * TemplateHead :
         *   ` TemplateCharacters(opt) ${
         *
         * TemplateSubstitutionTail :
         *   TemplateMiddle
         *   TemplateTail
         *
         * TemplateMiddle :
         *   } TemplateCharacters(opt) ${
         *
         * TemplateTail :
         *   } TemplateCharacters(opt) `
         *
         * TemplateCharacters :
         *   TemplateCharacter TemplateCharacters(opt)
         *
         * TemplateCharacter :
         *   $ [lookahead ≠ {]
         *   \ EscapeSequence
         *   SourceCharacter (but not one of ` or \ or $)
         *
         * TODO: de-duplicate template parsing logic
         */
        state.assignable = false;
        const cooked = [<string>state.tokenValue];
        const raw = [state.tokenRaw];
        expect(state, Token.TemplateContinuation);
        const expressions = [parse(state, access, Precedence.Assignment)];

        while ((state.currentToken = scanTemplateTail(state)) !== Token.TemplateTail) {
          cooked.push(<string>state.tokenValue);
          raw.push(state.tokenRaw);
          expect(state, Token.TemplateContinuation);
          expressions.push(parse(state, access, Precedence.Assignment));
        }

        cooked.push(<string>state.tokenValue);
        raw.push(state.tokenRaw);
        nextToken(state);
        result = new TaggedTemplateExpression(cooked, raw, result, expressions);
      default:
      }
    }
  }
  if (Precedence.Binary < minPrecedence) return result;

  /** parseBinaryExpression
   * https://tc39.github.io/ecma262/#sec-multiplicative-operators
   *
   * MultiplicativeExpression : (local precedence 6)
   *   UnaryExpression
   *   MultiplicativeExpression * / % UnaryExpression
   *
   * AdditiveExpression : (local precedence 5)
   *   MultiplicativeExpression
   *   AdditiveExpression + - MultiplicativeExpression
   *
   * RelationalExpression : (local precedence 4)
   *   AdditiveExpression
   *   RelationalExpression < > <= >= instanceof in AdditiveExpression
   *
   * EqualityExpression : (local precedence 3)
   *   RelationalExpression
   *   EqualityExpression == != === !== RelationalExpression
   *
   * LogicalANDExpression : (local precedence 2)
   *   EqualityExpression
   *   LogicalANDExpression && EqualityExpression
   *
   * LogicalORExpression : (local precedence 1)
   *   LogicalANDExpression
   *   LogicalORExpression || LogicalANDExpression
   */
  while (state.currentToken & Token.BinaryOp) {
    const opToken = state.currentToken;
    if ((opToken & Token.Precedence) < minPrecedence) {
      break;
    }
    nextToken(state);
    result = new BinaryExpression(<string>TokenValues[opToken & Token.Type], result, parse(state, access, opToken & Token.Precedence));
    state.assignable = false;
  }
  if (Precedence.Conditional < minPrecedence) return result;

  /** parseConditionalExpression
   * https://tc39.github.io/ecma262/#prod-ConditionalExpression
   *
   * ConditionalExpression :
   *   1. BinaryExpression
   *   2. BinaryExpression ? AssignmentExpression : AssignmentExpression
   *
   * IsValidAssignmentTarget
   *   1,2 = false
   */
  if (optional(state, Token.Question)) {
    const yes = parse(state, access, Precedence.Assignment);
    expect(state, Token.Colon);
    result = new ConditionalExpression(result, yes, parse(state, access, Precedence.Assignment));
    state.assignable = false;
  }

  /** parseAssignmentExpression
   * https://tc39.github.io/ecma262/#prod-AssignmentExpression
   * Note: AssignmentExpression here is equivalent to ES Expression because we don't parse the comma operator
   *
   * AssignmentExpression :
   *   1. ConditionalExpression
   *   2. LeftHandSideExpression = AssignmentExpression
   *
   * IsValidAssignmentTarget
   *   1,2 = false
   */
  if (optional(state, Token.Equals)) {
    if (!state.assignable) {
      error(state, `Expression ${state.input.slice(exprStart, state.startIndex)} is not assignable`);
    }
    exprStart = state.index;
    result = new AssignmentExpression(result, parse(state, access, Precedence.Assignment));
  }
  if (Precedence.Variadic < minPrecedence) return result;

  /** parseValueConverter
   */
  while (optional(state, Token.Bar)) {
    const name = <string>state.tokenValue;
    nextToken(state);
    const args = new Array<IsAssignmentExpression>();
    while (optional(state, Token.Colon)) {
      args.push(parse(state, access, Precedence.Assignment));
    }
    result = new ValueConverterExpression(result, name, args);
  }

  /** parseBindingBehavior
   */
  while (optional(state, Token.Ampersand)) {
    const name = <string>state.tokenValue;
    nextToken(state);
    const args = new Array<IsAssignmentExpression>();
    while (optional(state, Token.Colon)) {
      args.push(parse(state, access, Precedence.Assignment));
    }
    result = new BindingBehaviorExpression(result, name, args);
  }
  if (state.currentToken !== Token.EOF) {
    error(state, `Unconsumed token ${state.tokenRaw}`);
  }
  return result;
}

function nextToken(state: ParserState): void {
  while (state.index < state.length) {
    state.startIndex = state.index;
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
  while (IdParts[nextChar(state)]) {}

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
    error(state, `Missing expected token ${TokenValues[token & Token.Type]}`, state.index);
  }
}

function unescape(code: number): number {
  switch (code) {
  case Char.LowerB: return Char.Backspace;
  case Char.LowerT: return Char.Tab;
  case Char.LowerN: return Char.LineFeed;
  case Char.LowerV: return Char.VerticalTab;
  case Char.LowerF: return Char.FormFeed;
  case Char.LowerR: return Char.CarriageReturn;
  case Char.DoubleQuote: return Char.DoubleQuote;
  case Char.SingleQuote: return Char.SingleQuote;
  case Char.Backslash: return Char.Backslash;
  default: return code;
  }
}

const enum Access {
  Reset                   = 0b00000000000000000000000, // 0
  Ancestor                = 0b00000000000000111111111, // This - 1
  This                    = 0b00000000000001000000000, // 1 <<  9
  Scope                   = 0b00000000000010000000000, // 1 << 10
  Member                  = 0b00000000000100000000000, // 1 << 11
  Keyed                   = 0b00000000001000000000000  // 1 << 12
}
const enum Precedence {
  //                                        |
  Variadic                = 0b00000000000000000111101, // LogicalOR - 3
  Assignment              = 0b00000000000000000111110, // LogicalOR - 2
  Conditional             = 0b00000000000000000111111, // LogicalOR - 1
  LogicalOR               = 0b00000000000000001000000, // 1 << 6
  LogicalAND              = 0b00000000000000010000000, // 2 << 6
  Equality                = 0b00000000000000011000000, // 3 << 6
  Relational              = 0b00000000000000100000000, // 4 << 6
  Additive                = 0b00000000000000101000000, // 5 << 6
  Multiplicative          = 0b00000000000000110000000, // 6 << 6
  Binary                  = 0b00000000000000111000000, // 7 << 6
  LeftHandSide            = 0b00000000000000111000000, // Binary + 1
  Primary                 = 0b00000000000000111000001, // Binary + 2
  Unary                   = 0b00000000000000111000010, // Binary + 3
  //                                        |
}
const enum Token {
  //                                        |
  ExpressionTerminal      = 0b00000000000100000000000, // 1 << 11,
  AccessScopeTerminal     = 0b00000000100000000000000, // 1 << 14,
  EOF                     = 0b00000000100100000000000, // AccessScopeTerminal | ExpressionTerminal,
  ClosingToken            = 0b00000000001000000000000, // 1 << 12,
  OpeningToken            = 0b00000000010000000000000, // 1 << 13,
  Keyword                 = 0b00000001000000000000000, // 1 << 15,
  Identifier              = 0b00000010000000000000000, // 1 << 16,
  IdentifierName          = 0b00000011000000000000000, // Identifier | Keyword,
  NumericLiteral          = 0b00000100000000000000000, // 1 << 17,
  StringLiteral           = 0b00001000000000000000000, // 1 << 18,
  StringOrNumericLiteral  = 0b00001100000000000000000, // NumericLiteral | StringLiteral,
  PropertyName            = 0b00001111000000000000000, // IdentifierName | StringOrNumericLiteral,
  LeftHandSide            = 0b00010000000000000000000, // 1 << 19,
  BinaryOp                = 0b01000000000000000000000, // 1 << 21,
  UnaryOp                 = 0b10000000000000000000000, // 1 << 22,
  //                                        |
  Precedence              = 0b00000000000000111000000,
  //                                        |
  Type                    = 0b00000000000000000111111,
  //                                        |  |
  FalseKeyword            = 0b00000001000000000000000, //  0 |                      Keyword
  TrueKeyword             = 0b00000001000000000000001, //  1 |                      Keyword
  NullKeyword             = 0b00000001000000000000010, //  2 |                      Keyword
  UndefinedKeyword        = 0b00000001000000000000011, //  3 |                      Keyword
  ThisScope               = 0b00000011000000000000100, //  4 |                      IdentifierName
  ParentScope             = 0b00000011000000000000101, //  5 |                      IdentifierName
  OpenParen               = 0b00010000110000000000110, //  6 |                      LeftHandSide | OpeningToken | AccessScopeTerminal
  OpenBrace               = 0b00000000010000000000111, //  7 |                                     OpeningToken
  Dot                     = 0b00010000000000000001000, //  8 |                      LeftHandSide,
  //                                        |  |
  CloseBrace              = 0b00000000101100000001001, //  9 |                                     ClosingToken | AccessScopeTerminal | ExpressionTerminal
  CloseParen              = 0b00000000101100000001010, // 10 |                                     ClosingToken | AccessScopeTerminal | ExpressionTerminal
  Semicolon               = 0b00000000000100000001011, // 11 |                                                                          ExpressionTerminal
  Comma                   = 0b00000000100000000001100, // 12 |                                     AccessScopeTerminal
  OpenBracket             = 0b00010000110000000001101, // 13 |                      LeftHandSide | OpeningToken | AccessScopeTerminal
  CloseBracket            = 0b00000000001100000001110, // 14 |                                     ClosingToken |                       ExpressionTerminal
  Colon                   = 0b00000000100000000001111, // 15 |                                     AccessScopeTerminal,
  Question                = 0b00000000000000000010000, // 16,
  //                                        |  |
  Ampersand               = 0b00000000100000000010011, // 19 |                                     AccessScopeTerminal
  Bar                     = 0b00000000100000000010100, // 20 |                                     AccessScopeTerminal
  BarBar                  = 0b01000000000000010010101, // 21 |           BinaryOp |                Precedence.LogicalOR
  AmpersandAmpersand      = 0b01000000000000011010110, // 22 |           BinaryOp |                Precedence.LogicalAND
  EqualsEquals            = 0b01000000000000100010111, // 23 |           BinaryOp |                Precedence.Equality
  ExclamationEquals       = 0b01000000000000100011000, // 24 |           BinaryOp |                Precedence.Equality
  EqualsEqualsEquals      = 0b01000000000000100011001, // 25 |           BinaryOp |                Precedence.Equality
  ExclamationEqualsEquals = 0b01000000000000100011010, // 26 |           BinaryOp |                Precedence.Equality
  //                                        |  |
  LessThan                = 0b01000000000000101011011, // 27 |           BinaryOp |                Precedence.Relational
  GreaterThan             = 0b01000000000000101011100, // 28 |           BinaryOp |                Precedence.Relational
  LessThanEquals          = 0b01000000000000101011101, // 29 |           BinaryOp |                Precedence.Relational
  GreaterThanEquals       = 0b01000000000000101011110, // 30 |           BinaryOp |                Precedence.Relational
  InKeyword               = 0b01000001000000101011111, // 31 |           BinaryOp | Keyword |      Precedence.Relational
  InstanceOfKeyword       = 0b01000001000000101100000, // 32 |           BinaryOp | Keyword |      Precedence.Relational
  Plus                    = 0b11000000000000110100001, // 33 | UnaryOp | BinaryOp |                Precedence.Additive
  Minus                   = 0b11000000000000110100010, // 34 | UnaryOp | BinaryOp |                Precedence.Additive
  //                                        |  |
  TypeofKeyword           = 0b10000001000000000100011, // 35 | UnaryOp |            Keyword
  VoidKeyword             = 0b10000001000000000100100, // 36 | UnaryOp |            Keyword
  Asterisk                = 0b01000000000000111100101, // 37 |           BinaryOp |                Precedence.Multiplicative
  Percent                 = 0b01000000000000111100110, // 38 |           BinaryOp |                Precedence.Multiplicative
  Slash                   = 0b01000000000000111100111, // 39 |           BinaryOp |                Precedence.Multiplicative
  Equals                  = 0b00000000000000000101000, // 40
  Exclamation             = 0b10000000000000000101001, // 41 | UnaryOp
  TemplateTail            = 0b00010000000000000101010, // 42 |                      LeftHandSide
  TemplateContinuation    = 0b00010000000000000101011, // 43 |                      LeftHandSide
  //                                        |  |
}

const enum Char {
  Null           = 0x00,
  Backspace      = 0x08,
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

const $false = new PrimitiveLiteralExpression(false);
const $true = new PrimitiveLiteralExpression(true);
const $null = new PrimitiveLiteralExpression(null);
const $undefined = new PrimitiveLiteralExpression(undefined);
/**
 * Array for mapping tokens to token values. The indices of the values
 * correspond to the token bits 0-38.
 * For this to work properly, the values in the array must be kept in
 * the same order as the token bits.
 * Usage: TokenValues[token & Token.Type]
 */
const TokenValues = [
  $false, $true, $null, $undefined, '$this', '$parent',

  '(', '{', '.', '}', ')', ';', ',', '[', ']', ':', '?', '\'', '"',

  '&', '|', '||', '&&', '==', '!=', '===', '!==', '<', '>',
  '<=', '>=', 'in', 'instanceof', '+', '-', 'typeof', 'void', '*', '%', '/', '=', '!',
  Token.TemplateTail, Token.TemplateContinuation
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
CharScanners[Char.Question]     = returnToken(Token.Question);
CharScanners[Char.OpenBracket]  = returnToken(Token.OpenBracket);
CharScanners[Char.CloseBracket] = returnToken(Token.CloseBracket);
CharScanners[Char.OpenBrace]    = returnToken(Token.OpenBrace);
CharScanners[Char.CloseBrace]   = returnToken(Token.CloseBrace);

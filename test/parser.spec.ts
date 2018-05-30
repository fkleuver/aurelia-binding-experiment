import { Parser } from '../src/parser';
import { AccessKeyedExpression, AccessMemberExpression, AccessScopeExpression, AccessThisExpression,
  AssignmentExpression, BinaryExpression, BindingBehaviorExpression, CallFunctionExpression,
  CallMemberExpression, CallScopeExpression, ConditionalExpression,
  ArrayLiteralExpression, ObjectLiteralExpression, PrimitiveLiteralExpression, TemplateExpression,
  UnaryExpression, ValueConverterExpression } from '../src/ast';
import { latin1IdentifierStartChars, latin1IdentifierPartChars, otherBMPIdentifierPartChars } from './unicode';
import { expect } from 'chai';

/* eslint-disable no-loop-func, no-floating-decimal, key-spacing, new-cap, quotes, comma-spacing */

const $a = new AccessScopeExpression('a', 0);
const $b = new AccessScopeExpression('b', 0);
const $c = new AccessScopeExpression('c', 0);
const $x = new AccessScopeExpression('x', 0);
const $y = new AccessScopeExpression('y', 0);
const $z = new AccessScopeExpression('z', 0);
const $foo = new AccessScopeExpression('foo', 0);
const $bar = new AccessScopeExpression('bar', 0);
const $baz = new AccessScopeExpression('baz', 0);
const $true = new PrimitiveLiteralExpression(true);
const $false = new PrimitiveLiteralExpression(false);
const $null = new PrimitiveLiteralExpression(null);
const $undefined = new PrimitiveLiteralExpression(undefined);
const $str = new PrimitiveLiteralExpression('');
const $str1 = new PrimitiveLiteralExpression('1');
const $num0 = new PrimitiveLiteralExpression(0);
const $num1 = new PrimitiveLiteralExpression(1);
const $num2 = new PrimitiveLiteralExpression(2);
const $arr = new ArrayLiteralExpression([]);
const $obj = new ObjectLiteralExpression([], []);

const binaryOps = [
  '&&', '||',
  '==', '!=', '===', '!==',
  '<', '>', '<=', '>=',
  '+', '-',
  '*', '%', '/',
  'in', 'instanceof'
];
const unaryOps = [
  '!',
  'typeof',
  'void'
];

describe('Parser', () => {
  let parser: Parser;

  beforeEach(() => {
    console.log = function () {};
    parser = new Parser();
  });

  afterEach(() => {
    delete console.log;
  });

  describe('should parse', () => {
    describe('LiteralString', () => {
      // http://es5.github.io/x7.html#x7.8.4
      const tests = [
        { expr: '\'foo\'', expected: new PrimitiveLiteralExpression('foo') },
        { expr: `\'${unicodeEscape('äöüÄÖÜß')}\'`, expected: new PrimitiveLiteralExpression('äöüÄÖÜß') },
        { expr: `\'${unicodeEscape('ಠ_ಠ')}\'`, expected: new PrimitiveLiteralExpression('ಠ_ಠ') },
        { expr: '\'\\\\\'', expected: new PrimitiveLiteralExpression('\\') },
        { expr: '\'\\\'\'', expected: new PrimitiveLiteralExpression('\'') },
        { expr: '\'"\'', expected: new PrimitiveLiteralExpression('"') },
        { expr: '\'\\f\'', expected: new PrimitiveLiteralExpression('\f') },
        { expr: '\'\\n\'', expected: new PrimitiveLiteralExpression('\n') },
        { expr: '\'\\r\'', expected: new PrimitiveLiteralExpression('\r') },
        { expr: '\'\\t\'', expected: new PrimitiveLiteralExpression('\t') },
        { expr: '\'\\v\'', expected: new PrimitiveLiteralExpression('\v') },
        { expr: '\'\\v\'', expected: new PrimitiveLiteralExpression('\v') }
      ];

      for (const { expr, expected } of tests) {
        it(expr, () => {
          verifyEqual(parser.parse(expr), expected);
        });
      }
    });

    describe('Template', () => {
      const tests = [
        { expr: '`\r\n\t\n`', expected: new TemplateExpression(['\r\n\t\n']) },
        { expr: '`\n\r\n\r`', expected: new TemplateExpression(['\n\r\n\r']) },
        { expr: '`x\\r\\nx`', expected: new TemplateExpression(['x\r\nx']) },
        { expr: '`x\r\nx`', expected: new TemplateExpression(['x\r\nx']) },
        { expr: '``', expected: new TemplateExpression(['']) },
        { expr: '`foo`', expected: new TemplateExpression(['foo']) },
        { expr: '`$`', expected: new TemplateExpression(['$']) },
        { expr: '`a${foo}`', expected: new TemplateExpression(['a', ''], [$foo]) },
        { expr: '`${ {foo: 1} }`', expected: new TemplateExpression(['', ''], [new ObjectLiteralExpression(['foo'], [$num1])]) },
        { expr: '`a${"foo"}b`', expected: new TemplateExpression(['a', 'b'], [new PrimitiveLiteralExpression('foo')]) },
        { expr: '`a${"foo"}b${"foo"}c`', expected: new TemplateExpression(['a', 'b', 'c'], [new PrimitiveLiteralExpression('foo'), new PrimitiveLiteralExpression('foo')]) },
        { expr: 'foo`a${"foo"}b`', expected: new TemplateExpression(['a', 'b'], [new PrimitiveLiteralExpression('foo')], ['a', 'b'], $foo) },
        { expr: 'foo`bar`', expected: new TemplateExpression(['bar'], [], ['bar'], $foo) },
        { expr: 'foo`\r\n`', expected: new TemplateExpression(['\r\n'], [], ['\\r\\n'], $foo) }
      ];

      for (const { expr, expected } of tests) {
        it(expr, () => {
          verifyEqual(parser.parse(expr), expected);
        });
      }
    });

    describe('LiteralPrimitive', () => {
      // http://es5.github.io/x7.html#x7.8.4
      const tests = [
        { expr: 'true', expected: $true },
        { expr: 'false', expected: $false },
        { expr: 'null', expected: $null },
        { expr: 'undefined', expected: $undefined },
        { expr: '0', expected: $num0 },
        { expr: '1', expected: $num1 },
        { expr: '-1', expected: new UnaryExpression('-', $num1) },
        { expr: '(-1)', expected: new UnaryExpression('-', $num1) },
        { expr: '-(-1)', expected: new UnaryExpression('-', new UnaryExpression('-', $num1)) },
        { expr: '+(-1)', expected: new UnaryExpression('+', new UnaryExpression('-', $num1)) },
        { expr: '-(+1)', expected: new UnaryExpression('-', new UnaryExpression('+', $num1)) },
        { expr: '+(+1)', expected: new UnaryExpression('+', new UnaryExpression('+', $num1)) },
        { expr: '9007199254740992', expected: new PrimitiveLiteralExpression(9007199254740992) }, // Number.MAX_SAFE_INTEGER + 1
        { expr: '1.7976931348623157e+308', expected: new PrimitiveLiteralExpression(1.7976931348623157e+308) }, // Number.MAX_VALUE
        { expr: '1.7976931348623157E+308', expected: new PrimitiveLiteralExpression(1.7976931348623157e+308) }, // Number.MAX_VALUE
        { expr: '-9007199254740992', expected: new UnaryExpression('-', new PrimitiveLiteralExpression(9007199254740992)) }, // Number.MIN_SAFE_INTEGER - 1
        { expr: '5e-324', expected: new PrimitiveLiteralExpression(5e-324) }, // Number.MIN_VALUE
        { expr: '5E-324', expected: new PrimitiveLiteralExpression(5e-324) }, // Number.MIN_VALUE
        { expr: '2.2', expected: new PrimitiveLiteralExpression(2.2) },
        { expr: '2.2e2', expected: new PrimitiveLiteralExpression(2.2e2) },
        { expr: '.42', expected: new PrimitiveLiteralExpression(.42) },
        { expr: '0.42', expected: new PrimitiveLiteralExpression(.42) },
        { expr: '.42E10', expected: new PrimitiveLiteralExpression(.42e10) }
      ];

      for (const { expr, expected } of tests) {
        it(expr, () => {
          verifyEqual(parser.parse(expr), expected);
        });
      }
    });

    describe('LiteralArray', () => {
      const tests = [
        { expr: '[1 <= 0]', expected: new ArrayLiteralExpression([new BinaryExpression('<=', $num1, $num0)]) },
        { expr: '[0]', expected: new ArrayLiteralExpression([$num0])},
        { expr: '[]', expected: $arr},
        { expr: '[[[]]]', expected: new ArrayLiteralExpression([new ArrayLiteralExpression([$arr])])},
        { expr: '[[],[[]]]', expected: new ArrayLiteralExpression([$arr, new ArrayLiteralExpression([$arr])])},
        { expr: '[x()]', expected: new ArrayLiteralExpression([new CallScopeExpression('x', [], 0)]) },
        { expr: '[1, "z", "a", null]', expected: new ArrayLiteralExpression([$num1, new PrimitiveLiteralExpression('z'), new PrimitiveLiteralExpression('a'), $null]) }
      ];

      for (const { expr, expected } of tests) {
        it(expr, () => {
          verifyEqual(parser.parse(expr), expected);
        });
      }
    });

    describe('Conditional', () => {
      const tests = [
        { expr: '(false ? true : undefined)', paren: true, expected: new ConditionalExpression($false, $true, $undefined) },
        { expr: '("1" ? "" : "1")', paren: true, expected: new ConditionalExpression($str1, $str, $str1) },
        { expr: '("1" ? foo : "")', paren: true, expected: new ConditionalExpression($str1, $foo, $str) },
        { expr: '(false ? false : true)', paren: true, expected: new ConditionalExpression($false, $false, $true) },
        { expr: '(foo ? foo : true)', paren: true, expected: new ConditionalExpression($foo, $foo, $true) },
        { expr: 'foo() ? 1 : 2', expected: new ConditionalExpression(new CallScopeExpression('foo', [], 0), $num1, $num2) },
        { expr: 'true ? foo : false', expected: new ConditionalExpression($true, $foo, $false) },
        { expr: '"1" ? "" : "1"', expected: new ConditionalExpression($str1, $str, $str1) },
        { expr: '"1" ? foo : ""', expected: new ConditionalExpression($str1, $foo, $str) },
        { expr: 'foo ? foo : "1"', expected: new ConditionalExpression($foo, $foo, $str1) },
        { expr: 'true ? foo : bar', expected: new ConditionalExpression($true, $foo, $bar) }
      ];

      for (const { expr, expected, paren } of tests) {
        it(expr, () => {
          verifyEqual(parser.parse(expr), expected);
        });

        const nestedTests = [
          { expr: `${expr} ? a : b`, expected: paren ? new ConditionalExpression(expected as any, $a, $b) : new ConditionalExpression(expected.condition, expected.yes, new ConditionalExpression(<any>expected.no, $a, $b)) },
          { expr: `a[b] ? ${expr} : a=((b))`, expected: new ConditionalExpression(new AccessKeyedExpression($a, $b), expected, new AssignmentExpression($a, $b)) },
          { expr: `a ? !b===!a : ${expr}`, expected: new ConditionalExpression($a, new BinaryExpression('===', new UnaryExpression('!', $b), new UnaryExpression('!', $a)), expected) }
        ];

        for (const { expr: nExpr, expected: nExpected } of nestedTests) {
          it(nExpr, () => {
            verifyEqual(parser.parse(nExpr), nExpected);
          });
        }
      }
    });

    describe('Binary', () => {
      for (const op of binaryOps) {
        it(`\"${op}\"`, () => {
          verifyEqual(parser.parse(`x ${op} y`), new BinaryExpression(op, $x, $y));
        });
      }
    });

    describe('Binary operator precedence', () => {
      const x = [0, 1, 2, 3, 4, 5, 6].map(i => new AccessScopeExpression(`x${i}`, 0));
      const b = (l: any, op: any, r: any) => new BinaryExpression(op, l, r);
      const prec1 = ['||'];
      const prec2 = ['&&'];
      const prec3 = ['==', '!=', '===', '!=='];
      const prec4 = ['<', '>', '<=', '>=', 'in', 'instanceof'];
      const prec5 = ['+', '-'];
      const prec6 = ['*', '%', '/'];
      for (const _1 of prec1) {
        for (const _2 of prec2) {
          for (const _3 of prec3) {
            for (const _4 of prec4) {
              for (const _5 of prec5) {
                for (const _6 of prec6) {
                  const tests = [
                    {
                      // natural ascending precedence
                      expr:       `x0 ${_1}    x1 ${_2}    x2 ${_3}    x3 ${_4}    x4 ${_5}    x5 ${_6}    x6`,
                      expected: b(x[0], _1, b(x[1], _2, b(x[2], _3, b(x[3], _4, b(x[4], _5, b(x[5], _6, x[6]))))))
                    },
                    {
                      // forced descending precedence
                      expr:             `(((((x0 ${_1}  x1) ${_2}  x2) ${_3}  x3) ${_4}  x4) ${_5}  x5) ${_6}  x6`,
                      expected: b(b(b(b(b(b(x[0], _1, x[1]), _2, x[2]), _3, x[3]), _4, x[4]), _5, x[5]), _6, x[6])
                    },
                    {
                      // natural descending precedence
                      expr:                   `x6  ${_6}  x5  ${_5}  x4  ${_4}  x3  ${_3}  x2  ${_2}  x1  ${_1}  x0`,
                      expected: b(b(b(b(b(b(x[6], _6, x[5]), _5, x[4]), _4, x[3]), _3, x[2]), _2, x[1]), _1, x[0])
                    },
                    {
                      // forced ascending precedence
                      expr:       `x6 ${_6}   (x5 ${_5}   (x4 ${_4}   (x3 ${_3}   (x2 ${_2}   (x1 ${_1}  x0)))))`,
                      expected: b(x[6], _6, b(x[5], _5, b(x[4], _4, b(x[3], _3, b(x[2], _2, b(x[1], _1, x[0]))))))
                    }
                  ];

                  for (const { expr, expected } of tests) {
                    it(expr, () => {
                      const actual = parser.parse(expr);
                      expect(actual.toString()).to.equal(expected.toString());
                      verifyEqual(actual, expected);
                    });
                  }
                }
              }
            }
          }
        }
      }
    });

    describe('Binary + Unary operator precedence', () => {
      const x = $x;
      const y = $y;
      const u = (op: any, r: any) => new UnaryExpression(op, r);
      const b = (l: any, op: any, r: any) => new BinaryExpression(op, l, r);

      for (const _b of binaryOps) {
        for (const _u of unaryOps) {
          const tests = [
            {
              // natural right unary-first
              expr:     `x ${_b} ${_u} y`,
              expected: b(x, _b, u(_u, y))
            },
            {
              // natural left unary-first
              expr:      `${_u} x ${_b} y`,
              expected: b(u(_u, x), _b, y)
            },
            {
              // forced binary-first
              expr:    `${_u} (x ${_b} y)`,
              expected: u(_u, b(x, _b, y))
            }
          ];

          for (const { expr, expected } of tests) {
            it(expr, () => {
              const actual = parser.parse(expr);
              expect(actual.toString()).to.equal(expected.toString());
              verifyEqual(actual, expected);
            });
          }
        }
      }
    });

    const variadics = [
      { ctor: BindingBehaviorExpression, op: '&' },
      { ctor: ValueConverterExpression, op: '|' }
    ];

    for (const { ctor: Variadic, op } of variadics) {
      const $this0 = new AccessThisExpression(0);
      const $this1 = new AccessThisExpression(1);
      const $this2 = new AccessThisExpression(2);

      describe(Variadic.name, () => {
        const tests = [
          { expr: `foo${op}bar:$this:$this`, expected: new Variadic($foo, 'bar', [$this0, $this0]) },
          { expr: `foo${op}bar:$this:$parent`, expected: new Variadic($foo, 'bar', [$this0, $this1]) },
          { expr: `foo${op}bar:$parent:$this`, expected: new Variadic($foo, 'bar', [$this1, $this0]) },
          { expr: `foo${op}bar:$parent.$parent:$parent.$parent`, expected: new Variadic($foo, 'bar', [$this2, $this2]) },
          { expr: `foo${op}bar:"1"?"":"1":true?foo:bar`, expected: new Variadic($foo, 'bar', [new ConditionalExpression($str1, $str, $str1), new ConditionalExpression($true, $foo, $bar)]) },
          { expr: `foo${op}bar:[1<=0]:[[],[[]]]`, expected: new Variadic($foo, 'bar', [new ArrayLiteralExpression([new BinaryExpression('<=', $num1, $num0)]), new ArrayLiteralExpression([$arr, new ArrayLiteralExpression([$arr])])]) },
          { expr: `foo${op}bar:{foo:a?b:c}:{1:1}`, expected: new Variadic($foo, 'bar', [new ObjectLiteralExpression(['foo'], [new ConditionalExpression($a, $b, $c)]), new ObjectLiteralExpression([1], [$num1])]) },
          { expr: `foo${op}bar:a(b({})[c()[d()]])`, expected: new Variadic($foo, 'bar', [new CallScopeExpression('a', [new AccessKeyedExpression(new CallScopeExpression('b', [$obj], 0), new AccessKeyedExpression(new CallScopeExpression('c', [], 0), new CallScopeExpression('d', [], 0)))], 0)]) },
          { expr: `a(b({})[c()[d()]])${op}bar`, expected: new Variadic(new CallScopeExpression('a', [new AccessKeyedExpression(new CallScopeExpression('b', [$obj], 0), new AccessKeyedExpression(new CallScopeExpression('c', [], 0), new CallScopeExpression('d', [], 0)))], 0), 'bar', []) },
          { expr: `true?foo:bar${op}bar`, expected: new Variadic(new ConditionalExpression($true, $foo, $bar), 'bar', []) },
          { expr: `$parent.$parent${op}bar`, expected: new Variadic($this2, 'bar', []) }
        ];

        for (const { expr, expected } of tests) {
          it(expr, () => {
            verifyEqual(parser.parse(expr), expected);
          });
        }
      });
    }

    it('chained BindingBehaviors', () => {
      const expr = parser.parse('foo & bar:x:y:z & baz:a:b:c');
      verifyEqual(expr, new BindingBehaviorExpression(new BindingBehaviorExpression($foo, 'bar', [$x, $y, $z]), 'baz', [$a, $b, $c]));
    });

    it('chained ValueConverters', () => {
      const expr = parser.parse('foo | bar:x:y:z | baz:a:b:c');
      verifyEqual(expr, new ValueConverterExpression(new ValueConverterExpression($foo, 'bar', [$x, $y, $z]), 'baz', [$a, $b, $c]));
    });

    it('chained ValueConverters and BindingBehaviors', () => {
      const expr = parser.parse('foo | bar:x:y:z & baz:a:b:c');
      verifyEqual(expr, new BindingBehaviorExpression(new ValueConverterExpression($foo, 'bar', [$x, $y, $z]), 'baz', [$a, $b, $c]));
    });

    it('AccessScope', () => {
      const expr = parser.parse('foo');
      verifyEqual(expr, $foo);
    });

    describe('AccessKeyed', () => {
      const tests = [
        { expr: 'foo[bar]', expected: new AccessKeyedExpression($foo, $bar) },
        { expr: 'foo[\'bar\']', expected: new AccessKeyedExpression($foo, new PrimitiveLiteralExpression('bar')) },
        { expr: 'foo[0]', expected: new AccessKeyedExpression($foo, $num0) },
        { expr: 'foo[(0)]', expected: new AccessKeyedExpression($foo, $num0) },
        { expr: '(foo)[0]', expected: new AccessKeyedExpression($foo, $num0) },
        { expr: 'foo[null]', expected: new AccessKeyedExpression($foo, $null) },
        { expr: '\'foo\'[0]', expected: new AccessKeyedExpression(new PrimitiveLiteralExpression('foo'), $num0) },
        { expr: 'foo()[bar]', expected: new AccessKeyedExpression(new CallScopeExpression('foo', [], 0), $bar) },
        { expr: 'a[b[c]]', expected: new AccessKeyedExpression($a, new AccessKeyedExpression($b, $c)) },
        { expr: 'a[b][c]', expected: new AccessKeyedExpression(new AccessKeyedExpression($a, $b), $c) }
      ];

      for (const { expr, expected } of tests) {
        it(expr, () => {
          verifyEqual(parser.parse(expr), expected);
        });

        it(`(${expr})`, () => {
          verifyEqual(parser.parse(`(${expr})`), expected);
        });
      }
    });

    describe('AccessMember', () => {
      const tests = [
        { expr: 'foo.bar', expected: new AccessMemberExpression($foo, 'bar') },
        { expr: 'foo.bar.baz.qux', expected: new AccessMemberExpression(new AccessMemberExpression(new AccessMemberExpression($foo, 'bar'), 'baz'), 'qux') },
        { expr: 'foo["bar"].baz', expected: new AccessMemberExpression(new AccessKeyedExpression($foo, new PrimitiveLiteralExpression('bar')), 'baz') },
        { expr: 'foo[""].baz', expected: new AccessMemberExpression(new AccessKeyedExpression($foo, $str), 'baz') },
        { expr: 'foo[null].baz', expected: new AccessMemberExpression(new AccessKeyedExpression($foo, $null), 'baz') },
        { expr: 'foo[42].baz', expected: new AccessMemberExpression(new AccessKeyedExpression($foo, new PrimitiveLiteralExpression(42)), 'baz') },
        { expr: '{}.foo', expected: new AccessMemberExpression($obj, 'foo') },
        { expr: '[].foo', expected: new AccessMemberExpression($arr, 'foo') },
        { expr: 'null.foo', expected: new AccessMemberExpression($null, 'foo') },
        { expr: 'undefined.foo', expected: new AccessMemberExpression($undefined, 'foo') },
        { expr: 'true.foo', expected: new AccessMemberExpression($true, 'foo') },
        { expr: 'false.foo', expected: new AccessMemberExpression($false, 'foo') }
      ];

      for (const { expr, expected } of tests) {
        it(expr, () => {
          verifyEqual(parser.parse(expr), expected);
        });
      }
    });

    it('Assign', () => {
      const expr = parser.parse('foo = bar');
      verifyEqual(expr, new AssignmentExpression($foo, $bar));
    });

    it('chained Assign', () => {
      const expr = parser.parse('foo = bar = baz');
      verifyEqual(expr, new AssignmentExpression($foo, new AssignmentExpression($bar, $baz)));
    });

    describe('CallExpression', () => {
      const tests = [
        { expr: 'a()()()', expected: new CallFunctionExpression(new CallFunctionExpression(new CallScopeExpression('a', [], 0), []), []) },
        { expr: 'a(b(c()))', expected: new CallScopeExpression('a', [new CallScopeExpression('b', [new CallScopeExpression('c', [], 0)], 0)], 0) },
        { expr: 'a(b(),c())', expected: new CallScopeExpression('a', [new CallScopeExpression('b', [], 0), new CallScopeExpression('c', [], 0)], 0) },
        { expr: 'a()[b]()', expected: new CallFunctionExpression(new AccessKeyedExpression(new CallScopeExpression('a', [], 0), $b), []) },
        { expr: '{foo}[\'foo\']()', expected: new CallFunctionExpression(new AccessKeyedExpression(new ObjectLiteralExpression(['foo'], [$foo]), new PrimitiveLiteralExpression('foo')), []) },
        { expr: 'a(b({})[c()[d()]])', expected: new CallScopeExpression('a', [new AccessKeyedExpression(new CallScopeExpression('b', [$obj], 0), new AccessKeyedExpression(new CallScopeExpression('c', [], 0), new CallScopeExpression('d', [], 0)))], 0) }
      ];

      for (const { expr, expected } of tests) {
        it(expr, () => {
          verifyEqual(parser.parse(expr), expected);
        });

        it(`(${expr})`, () => {
          verifyEqual(parser.parse(`(${expr})`), expected);
        });
      }
    });

    it('CallScope', () => {
      const expr = parser.parse('foo(x)');
      verifyEqual(expr, new CallScopeExpression('foo', [$x], 0));
    });

    it('nested CallScope', () => {
      const expr = parser.parse('foo(bar(x), y)');
      verifyEqual(expr, new CallScopeExpression('foo', [new CallScopeExpression('bar', [$x], 0), $y], 0));
    });

    it('CallMember', () => {
      const expr = parser.parse('foo.bar(x)');
      verifyEqual(expr, new CallMemberExpression($foo, 'bar', [$x]));
    });

    it('nested CallMember', () => {
      const expr = parser.parse('foo.bar.baz(x)');
      verifyEqual(expr, new CallMemberExpression(new AccessMemberExpression($foo, 'bar'), 'baz', [$x]));
    });

    it('$this', () => {
      const expr = parser.parse('$this');
      verifyEqual(expr, new AccessThisExpression(0));
    });

    it('$this.member to AccessScope', () => {
      const expr = parser.parse('$this.foo');
      verifyEqual(expr, $foo);
    });

    it('$this() to CallFunction', () => {
      const expr = parser.parse('$this()');
      verifyEqual(expr, new CallFunctionExpression(new AccessThisExpression(0), []));
    });

    it('$this.member() to CallScope', () => {
      const expr = parser.parse('$this.foo(x)');
      verifyEqual(expr, new CallScopeExpression('foo', [$x], 0));
    });

    const parents = [
      { i: 1, name: '$parent' },
      { i: 2, name: '$parent.$parent' },
      { i: 3, name: '$parent.$parent.$parent' },
      { i: 4, name: '$parent.$parent.$parent.$parent' },
      { i: 5, name: '$parent.$parent.$parent.$parent.$parent' },
      { i: 6, name: '$parent.$parent.$parent.$parent.$parent.$parent' },
      { i: 7, name: '$parent.$parent.$parent.$parent.$parent.$parent.$parent' },
      { i: 8, name: '$parent.$parent.$parent.$parent.$parent.$parent.$parent.$parent' },
      { i: 9, name: '$parent.$parent.$parent.$parent.$parent.$parent.$parent.$parent.$parent' },
      { i: 10, name: '$parent.$parent.$parent.$parent.$parent.$parent.$parent.$parent.$parent.$parent'  }
    ];
    describe('$parent', () => {
      for (const { i, name } of parents) {
        it(name, () => {
          const expr = parser.parse(name);
          verifyEqual(expr, new AccessThisExpression(i));
        });

        it(`${name} before ValueConverter`, () => {
          const expr = parser.parse(`${name} | foo`);
          verifyEqual(expr, new ValueConverterExpression(new AccessThisExpression(i), 'foo', []));
        });

        it(`${name}.bar before ValueConverter`, () => {
          const expr = parser.parse(`${name}.bar | foo`);
          verifyEqual(expr, new ValueConverterExpression(new AccessScopeExpression('bar', i), 'foo', []));
        });

        it(`${name} before binding behavior`, () => {
          const expr = parser.parse(`${name} & foo`);
          verifyEqual(expr, new BindingBehaviorExpression(new AccessThisExpression(i), 'foo', []));
        });

        it(`${name}.bar before binding behavior`, () => {
          const expr = parser.parse(`${name}.bar & foo`);
          verifyEqual(expr, new BindingBehaviorExpression(new AccessScopeExpression('bar', i), 'foo', []));
        });

        it(`${name}.foo to AccessScope`, () => {
          const expr = parser.parse(`${name}.foo`);
          verifyEqual(expr, new AccessScopeExpression(`foo`, i));
        });

        it(`${name}.foo() to CallScope`, () => {
          const expr = parser.parse(`${name}.foo()`);
          verifyEqual(expr, new CallScopeExpression(`foo`, [], i));
        });

        it(`${name}() to CallFunction`, () => {
          const expr = parser.parse(`${name}()`);
          verifyEqual(expr, new CallFunctionExpression(new AccessThisExpression(i), []));
        });

        it(`${name}[0] to AccessKeyed`, () => {
          const expr = parser.parse(`${name}[0]`);
          verifyEqual(expr, new AccessKeyedExpression(new AccessThisExpression(i), $num0));
        });
      }
    });

    it('$parent inside CallMember', () => {
      const expr = parser.parse('matcher.bind($parent)');
      verifyEqual(expr, new CallMemberExpression(new AccessScopeExpression('matcher', 0), 'bind', [new AccessThisExpression(1)]));
    });

    it('$parent in LiteralObject', () => {
      const expr = parser.parse('{parent: $parent}');
      verifyEqual(expr, new ObjectLiteralExpression(['parent'], [new AccessThisExpression(1)]));
    });

    it('$parent and foo in LiteralObject', () => {
      const expr = parser.parse('{parent: $parent, foo: bar}');
      verifyEqual(expr, new ObjectLiteralExpression(['parent', 'foo'], [new AccessThisExpression(1), $bar]));
    });

    describe('LiteralObject', () => {
      const tests = [
        { expr: '', expected: $obj },
        { expr: 'foo', expected: new ObjectLiteralExpression(['foo'], [$foo]) },
        { expr: 'foo,bar', expected: new ObjectLiteralExpression(['foo', 'bar'], [$foo, $bar]) },
        { expr: 'foo:bar', expected: new ObjectLiteralExpression(['foo'], [$bar]) },
        { expr: 'foo:bar()', expected: new ObjectLiteralExpression(['foo'], [new CallScopeExpression('bar', [], 0)]) },
        { expr: 'foo:a?b:c', expected: new ObjectLiteralExpression(['foo'], [new ConditionalExpression($a, $b, $c)]) },
        { expr: 'foo:bar=((baz))', expected: new ObjectLiteralExpression(['foo'], [new AssignmentExpression($bar, $baz)]) },
        { expr: 'foo:(bar)===baz', expected: new ObjectLiteralExpression(['foo'], [new BinaryExpression('===', $bar, $baz)]) },
        { expr: 'foo:[bar]', expected: new ObjectLiteralExpression(['foo'], [new ArrayLiteralExpression([$bar])]) },
        { expr: 'foo:bar[baz]', expected: new ObjectLiteralExpression(['foo'], [new AccessKeyedExpression($bar, $baz)]) },
        { expr: '\'foo\':1', expected: new ObjectLiteralExpression(['foo'], [$num1]) },
        { expr: '1:1', expected: new ObjectLiteralExpression([1], [$num1]) },
        { expr: '1:\'foo\'', expected: new ObjectLiteralExpression([1], [new PrimitiveLiteralExpression('foo')]) },
        { expr: 'null:1', expected: new ObjectLiteralExpression(['null'], [$num1]) },
        { expr: 'foo:{}', expected: new ObjectLiteralExpression(['foo'], [$obj]) },
        { expr: 'foo:{bar}[baz]', expected: new ObjectLiteralExpression(['foo'], [new AccessKeyedExpression(new ObjectLiteralExpression(['bar'], [$bar]), $baz)]) }
      ];

      for (const { expr, expected } of tests) {
        it(`{${expr}}`, () => {
          verifyEqual(parser.parse(`{${expr}}`), expected);
        });

        it(`({${expr}})`, () => {
          verifyEqual(parser.parse(`({${expr}})`), expected);
        });
      }
    });

    describe('unicode IdentifierStart', () => {
      for (const char of latin1IdentifierStartChars) {
        it(char, () => {
          const expr = parser.parse(char);
          verifyEqual(expr,
            new AccessScopeExpression(char, 0)
         );
        });
      }
    });

    describe('unicode IdentifierPart', () => {
      for (const char of latin1IdentifierPartChars) {
        it(char, () => {
          const identifier = '$' + char;
          const expr = parser.parse(identifier);
          verifyEqual(expr,
            new AccessScopeExpression(identifier, 0)
         );
        });
      }
    });
  });

  describe('should not parse', () => {
    it('Assign to Unary plus', () => {
      _verifyError('+foo = bar', 'not assignable');
    });

    describe('LiteralObject with computed property', () => {
      const expressions = [
        '{ []: "foo" }',
        '{ [42]: "foo" }',
        '{ ["foo"]: "bar" }',
        '{ [foo]: "bar" }'
      ];

      for (const expr of expressions) {
        it(expr, () => {
          _verifyError(expr, 'Unexpected token [');
        });
      }
    });

    describe('invalid shorthand properties', () => {
      const expressions = [
        '{ foo.bar }',
        '{ foo.bar, bar.baz }',
        '{ "foo" }',
        '{ "foo.bar" }',
        '{ 42 }',
        '{ 42, 42 }',
        '{ [foo] }',
        '{ ["foo"] }',
        '{ [42] }'
      ];

      for (const expr of expressions) {
        it(expr, () => {
          _verifyError(expr, 'expected');
        });
      }
    });

    describe('semicolon', () => {
      const expressions = [
        ';',
        'foo;',
        ';foo',
        'foo&bar;baz|qux'
      ];

      for (const expr of expressions) {
        it(expr, () => {
          _verifyError(expr, 'Unexpected character [;]');
        });
      }
    });

    describe('extra closing token', () => {
      const tests = [
        { expr: 'foo())', token: ')' },
        { expr: 'foo[x]]', token: ']' },
        { expr: '{foo}}', token: '}' }
      ];

      for (const { expr, token } of tests) {
        it(expr, () => {
          _verifyError(expr, `Unconsumed token ${token}`);
        });
      }
    });

    describe('invalid start of expression', () => {
      const tests = [')', ']', '}', ''];

      for (const expr of tests) {
        it(expr, () => {
          _verifyError(expr, `Invalid start of expression`);
        });
      }
    });

    describe('missing expected token', () => {
      const tests = [
        { expr: '(foo', token: ')' },
        { expr: '[foo', token: ']' },
        { expr: '{foo', token: ',' },
        { expr: 'foo(bar', token: ')' },
        { expr: 'foo[bar', token: ']' },
        { expr: 'foo.bar(baz', token: ')' },
        { expr: 'foo.bar[baz', token: ']' }
      ];

      for (const { expr, token } of tests) {
        it(expr, () => {
          _verifyError(expr, `Missing expected token ${token}`);
        });
      }
    });

    describe('assigning unassignable', () => {
      const expressions = [
        '(foo ? bar : baz) = qux',
        '$this = foo',
        'foo() = bar',
        'foo.bar() = baz',
        '!foo = bar',
        '-foo = bar',
        '\'foo\' = bar',
        '42 = foo',
        '[] = foo',
        '{} = foo'
      ].concat(binaryOps.map(op => `foo ${op} bar = baz`));

      for (const expr of expressions) {
        it(expr, () => {
          _verifyError(expr, 'is not assignable');
        });
      }
    });

    it('incomplete conditional', () => {
      _verifyError('foo ? bar', 'Missing expected token : at column 9');
    });

    describe('invalid primary expression', () => {
      const expressions = ['.', ',', '&', '|', '=', '<', '>', '*', '%', '/'];
      expressions.push(...expressions.map(e => e + ' '));
      for (const expr of expressions) {
        it(expr, () => {
          if (expr.length === 1) {
            _verifyError(expr, `Unexpected end of expression`);
          } else {
            _verifyError(expr, `Unexpected token ${expr.slice(0, 0)}`);
          }
        });
      }
    });

    describe('invalid exponent', () => {
      const expressions = ['1e', '1ee', '1e.'];

      for (const expr of expressions) {
        it(expr, () => {
          _verifyError(expr, 'Invalid exponent');
        });
      }
    });

    describe('unknown unicode IdentifierPart', () => {
      for (const char of otherBMPIdentifierPartChars) {
        it(char, () => {
          const identifier = '$' + char;
          _verifyError(identifier, `Unexpected character [${char}] at column 1`);
        });
      }
    });

    it('double dot (AccessScope)', () => {
      _verifyError('foo..bar', `Unexpected token . at column 4`);
    });

    it('double dot (AccessMember)', () => {
      _verifyError('foo.bar..baz', `Unexpected token . at column 8`);
    });

    it('double dot (AccessThis)', () => {
      _verifyError('$parent..bar', `Unexpected token . at column 8`);
    });
  });

  function _verifyError(expr: any, errorMessage: any = ''): any {
    verifyError(parser, expr, errorMessage);
  }
});

function verifyError(parser: any, expr: any, errorMessage: any = ''): any {
  let error = null;
  try {
    parser.parse(expr);
  } catch (e) {
    error = e;
  }

  expect(error).not.to.be.null;
  expect(error.message).to.contain(errorMessage);
}

function verifyEqual(actual: any, expected: any): any {
  if (typeof expected !== 'object' || expected === null || expected === undefined) {
    expect(actual).to.equal(expected);
    return;
  }
  if (expected instanceof Array) {
    for (let i = 0; i < expected.length; i++) {
      verifyEqual(actual[i], expected[i]);
    }
    return;
  }

  if (actual) {
    expect(actual.constructor.name).to.equal(expected.constructor.name);
    expect(actual.toString()).to.equal(expected.toString());
    for (const prop of Object.keys(expected)) {
      verifyEqual(actual[prop], expected[prop]);
    }
  }
}

function unicodeEscape(str: any): any {
  return str.replace(/[\s\S]/g, (c: any) => `\\u${('0000' + c.charCodeAt().toString(16)).slice(-4)}`);
}

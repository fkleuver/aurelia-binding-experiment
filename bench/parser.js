/**
 * Usage
 * default 1 iteration: node bench/parser.js
 * 10 iterations: node bench/parser.js 10
 * 100 iterations: node bench/parser.js 100
 */

const { Parser: ParserV2New } = require('../dist/commonjs/aurelia-binding');
const { Parser: ParserV2 } = require('./v2/aurelia-binding');
const { Parser: ParserV1 } = require('./v1/aurelia-binding');
const { Benchmark, Column } = require('./util');

const v2new = new ParserV2New();
const v2 = new ParserV2();
const v1 = new ParserV1();

const iterations = process.argv[2] || 1;

const tests = [
  { weight: 5,  parsers: [v1, v2, v2new], expr: "'asdfasdfasdf'" },
  { weight: 1,  parsers: [v1, v2, v2new], expr: 'true' },
  { weight: 1,  parsers: [v1, v2, v2new], expr: 'false' },
  { weight: 1,  parsers: [v1, v2, v2new], expr: 'null' },
  { weight: 1,  parsers: [v1, v2, v2new], expr: 'undefined' },
  { weight: 1,  parsers: [v1, v2, v2new], expr: '1234' },
  { weight: 1,  parsers: [v1, v2, v2new], expr: '1234.5678' },
  { weight: 10, parsers: [v1, v2, v2new], expr: 'foo' },
  { weight: 10, parsers: [v1, v2, v2new], expr: 'foobar' },
  { weight: 10, parsers: [v1, v2, v2new], expr: 'foo.bar' },
  { weight: 10, parsers: [v1, v2, v2new], expr: 'foobar1234' },
  { weight: 10, parsers: [v1, v2, v2new], expr: 'foobar.foobar' },
  { weight: 5,  parsers: [v1, v2, v2new], expr: 'foo.bar.baz' },
  { weight: 5,  parsers: [v1, v2, v2new], expr: 'fooBarBazQux' },
  { weight: 5,  parsers: [v1, v2, v2new], expr: 'fooBarBazQux.fooBarBazQux' },
  { weight: 1,  parsers: [v1, v2, v2new], expr: 'fooBar.fooBar.fooBar3' },
  { weight: 1,  parsers: [v1, v2, v2new], expr: '!!foo && !!bar ? baz : qux' },
  { weight: 1,  parsers: [v1, v2, v2new], expr: 'foo === null || foo === undefined' },
  { weight: 1,  parsers: [v1, v2, v2new], expr: 'foo / 100 + (bar * -baz) % 2' },
  { weight: 1,  parsers: [v1, v2, v2new], expr: "foobar & someThing:'test'" },
  { weight: 1,  parsers: [v1, v2, v2new], expr: 'foo.bar | baz & qux:42' },
  { weight: 1,  parsers: [v1, v2, v2new], expr: "foo | bar:a:'foo' & baz:a:b.c" },
  { weight: 5,  parsers: [v1, v2, v2new], expr: 'foo.bar' },
  { weight: 1,  parsers: [v1, v2, v2new], expr: 'foo.bar.foo.bar' },
  { weight: 5,  parsers: [v1, v2, v2new], expr: 'handleEvent($event)' },
  { weight: 1,  parsers: [v1, v2, v2new], expr: 'handleEvent({e: $event})' },
  { weight: 1,  parsers: [v1, v2, v2new], expr: '$this.foo($parent.bar[$index])' },
  { weight: 1,  parsers: [v1, v2, v2new], expr: '$parent.foo(bar[$index])' },
  { weight: 1,  parsers: [v1, v2, v2new], expr: 'doStuff(foo, bar, baz)' },
  { weight: 5,  parsers: [v1, v2, v2new], expr: 'arr[i]' },
  { weight: 1,  parsers: [v1, v2, v2new], expr: '[[[]],[[]],[[]]]' },
  { weight: 1,  parsers: [v1, v2, v2new], expr: 'x?x:x?x:x?x:x?x:x' },
  { weight: 1,  parsers: [v1, v2, v2new], expr: '{x:{x:{}},x:{x:{}}}' },
  { weight: 1,  parsers: [v1, v2, v2new], expr: 'x||x&&x==x!=x<x>x<=x>=x+x-x*x%x/!x' },
  { weight: 1,  parsers: [v1, v2, v2new], expr: 'x|x:x|x:x&x:x&x:x' },
  { weight: 1,  parsers: [v1, v2, v2new], expr: 'x(x(x())(x(x())))(x(x()))' },
  { weight: 1,  parsers: [v1, v2, v2new], expr: 'a(b({a:b,c:d})[c({})[d({})]])' },
  { weight: 1,  parsers: [null, null, v2new], expr: 'ØÙçĊĎďĢģĤŌŸŹźǈǉǊǋǌǍǱǲʃʄʅʆʇᵴᵷᵹᵺᵻᵼᶦᶧ' }
];

function run(iterations) {
  const benchmark = new Benchmark([
    new Column('Weight', 8, 'left'),
    new Column('Expression', 35, 'left'),
    new Column('v1', 12, 'right'),
    new Column('v2', 12, 'right'),
    new Column('v1/v2', 9, 'right'),
    new Column('New', 12, 'right'),
    new Column('v1/New', 9, 'right'),
    new Column('v2/New', 9, 'right')
  ], tests, 3, iterations);

  benchmark.writeHeader();

  for (const { expr, parsers, weight } of tests) {
    benchmark.writeLineStart();

    for (const parser of parsers) {
      if (!parser) {
        benchmark.addResult();
        continue;
      }
      let k = iterations * weight;
      const start = process.hrtime();
      while (k--) {
        parser.parse(expr);
        parser.cache[expr] = undefined;
      }
      const end = process.hrtime(start);
      benchmark.addResult(end);
    }
  }
  benchmark.writeFooter();
}

run(iterations);

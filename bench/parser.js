/**
 * Usage
 * 1 iteration, 1 rotation: node bench/parser.js
 * 10 iterations, 2 rotations: node bench/parser.js 10 2
 * 100 iteration, 3 rotations: node bench/parser.js 100 3
 */

const V2New = '../dist/commonjs/aurelia-binding';
const V2 = './v2/aurelia-binding';
const V1 = './v1/aurelia-binding';
const { Benchmark, Column } = require('./util');

const iterations = process.argv[2] || 1;
const rotations = process.argv[3] || 1;

const tests = [
  { weight: 5,  imports: [V1, V2, V2New], expr: "'asdfasdfasdf'" },
  { weight: 1,  imports: [V1, V2, V2New], expr: 'true' },
  { weight: 1,  imports: [V1, V2, V2New], expr: 'false' },
  { weight: 1,  imports: [V1, V2, V2New], expr: 'null' },
  { weight: 1,  imports: [V1, V2, V2New], expr: 'undefined' },
  { weight: 1,  imports: [V1, V2, V2New], expr: '1234' },
  { weight: 1,  imports: [V1, V2, V2New], expr: '1234.5678' },
  { weight: 10, imports: [V1, V2, V2New], expr: 'foo' },
  { weight: 10, imports: [V1, V2, V2New], expr: 'foobar' },
  { weight: 10, imports: [V1, V2, V2New], expr: 'foo.bar' },
  { weight: 10, imports: [V1, V2, V2New], expr: 'foobar1234' },
  { weight: 10, imports: [V1, V2, V2New], expr: 'foobar.foobar' },
  { weight: 5,  imports: [V1, V2, V2New], expr: 'foo.bar.baz' },
  { weight: 5,  imports: [V1, V2, V2New], expr: 'fooBarBazQux' },
  { weight: 5,  imports: [V1, V2, V2New], expr: 'fooBarBazQux.fooBarBazQux' },
  { weight: 1,  imports: [V1, V2, V2New], expr: 'fooBar.fooBar.fooBar3' },
  { weight: 1,  imports: [V1, V2, V2New], expr: '!!foo && !!bar ? baz : qux' },
  { weight: 1,  imports: [V1, V2, V2New], expr: 'foo === null || foo === undefined' },
  { weight: 1,  imports: [V1, V2, V2New], expr: 'foo / 100 + (bar * -baz) % 2' },
  { weight: 1,  imports: [V1, V2, V2New], expr: "foobar & someThing:'test'" },
  { weight: 1,  imports: [V1, V2, V2New], expr: 'foo.bar | baz & qux:42' },
  { weight: 1,  imports: [V1, V2, V2New], expr: "foo | bar:a:'foo' & baz:a:b.c" },
  { weight: 5,  imports: [V1, V2, V2New], expr: 'foo.bar' },
  { weight: 1,  imports: [V1, V2, V2New], expr: 'foo.bar.foo.bar' },
  { weight: 5,  imports: [V1, V2, V2New], expr: 'handleEvent($event)' },
  { weight: 1,  imports: [V1, V2, V2New], expr: 'handleEvent({e: $event})' },
  { weight: 1,  imports: [V1, V2, V2New], expr: '$this.foo($parent.bar[$index])' },
  { weight: 1,  imports: [V1, V2, V2New], expr: '$parent.foo(bar[$index])' },
  { weight: 1,  imports: [V1, V2, V2New], expr: 'doStuff(foo, bar, baz)' },
  { weight: 5,  imports: [V1, V2, V2New], expr: 'arr[i]' },
  { weight: 1,  imports: [V1, V2, V2New], expr: '[[[]],[[]],[[]]]' },
  { weight: 1,  imports: [V1, V2, V2New], expr: 'x?x:x?x:x?x:x?x:x' },
  { weight: 1,  imports: [V1, V2, V2New], expr: '{x:{x:{}},x:{x:{}}}' },
  { weight: 1,  imports: [V1, V2, V2New], expr: 'x||x&&x==x!=x<x>x<=x>=x+x-x*x%x/!x' },
  { weight: 1,  imports: [V1, V2, V2New], expr: 'x|x:x|x:x&x:x&x:x' },
  { weight: 1,  imports: [V1, V2, V2New], expr: 'x(x(x())(x(x())))(x(x()))' },
  { weight: 1,  imports: [V1, V2, V2New], expr: 'a(b({a:b,c:d})[c({})[d({})]])' },
  { weight: 1,  imports: [null, null, V2New], expr: 'ØÙçĊĎďĢģĤŌŸŹźǈǉǊǋǌǍǱǲʃʄʅʆʇᵴᵷᵹᵺᵻᵼᶦᶧ' }
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

  let r = rotations;
  while (r--) {
    for (const { expr, imports, weight } of tests) {
      benchmark.writeLineStart();

      for (const $import of imports) {
        if (!$import) {
          benchmark.addResult();
          continue;
        }
        let k = iterations * weight;
        const b = require($import);
        const parser = new b.Parser();
        const start = process.hrtime();
        while (k--) {
          parser.parse(expr);
          parser.cache[expr] = undefined;
        }
        const end = process.hrtime(start);
        benchmark.addResult(end);
      }
    }

    benchmark.nextRotation();
  }

  benchmark.writeFooter();
}

run(iterations);

/**
 * Usage
 * 500 iteration, 2 rotations: node bench/observers.js
 * 100 iterations, 10 rotation: node bench/observers.js 100 10
 * 10 iteration, 100 rotations: node bench/observers.js 10 100
 */

const V2New = '../dist/commonjs/aurelia-binding';
const V2 = './v2/aurelia-binding';
const V1 = './v1/aurelia-binding';

const { Benchmark, Column } = require('./util');

const iterations = process.argv[2] || 500;
const rotations = process.argv[3] || 2;

function getSubscriptions(subscribable, count) {
  const res = new Array(count);
  let i = count;
  while (i--) {
    res[i] = subscribable.subscribe(() => {});
  }
  return function() {
    i = count;
    while (i--) {
      res[i].dispose();
    }
  }
}
function getWeight(kind, subCount) {
  if (subCount === 0 || subCount === 5) return 1;
  if (kind === 'prop') {
    return subCount === 1 ? 10 : 5;
  } else {
    return subCount === 1 ? 5 : 3;
  }
}
const subs = [0, 1, 3, 5];
const changes = [2, 5];
const tests = [];

for (const sub of subs) {
  for (const change of changes) {
    tests.push({
      weight: getWeight('prop', sub), imports: [V1, V2, V2New], expr: `prop  (${sub} subs, ${change*2} changes, ${change*2} flushes)`, operation: (engine, tq) => {
        const obj = { foo: undefined };
        const dispose = getSubscriptions(engine.propertyObserver(obj, 'foo'), sub);
        for (let i = 0; i < change; i++) {
          obj.foo = 'bar';
          tq.flushMicroTaskQueue();
          obj.foo = 'baz';
          tq.flushMicroTaskQueue();
        }
        dispose();
      }
    });
    tests.push({
      weight: getWeight('prop', sub), imports: [V1, V2, V2New], expr: `prop  (${sub} subs, ${change*2} changes, ${change} flushes)`, operation: (engine, tq) => {
        const obj = { foo: undefined };
        const dispose = getSubscriptions(engine.propertyObserver(obj, 'foo'), sub);
        for (let i = 0; i < change; i++) {
          obj.foo = 'bar';
          obj.foo = 'baz';
          tq.flushMicroTaskQueue();
        }
        dispose();
      }
    });
    tests.push({
      weight: getWeight('array', sub), imports: [V1, V2, V2New], expr: `array (${sub} subs, ${change*2} changes, ${change*2} flushes)`, operation: (engine, tq) => {
        const obj = [];
        const dispose = getSubscriptions(engine.collectionObserver(obj), sub);
        for (let i = 0; i < change; i++) {
          obj.push(1);
          tq.flushMicroTaskQueue();
          obj.pop();
          tq.flushMicroTaskQueue();
        }
        dispose();
      }
    });
    tests.push({
      weight: getWeight('array', sub), imports: [V1, V2, V2New], expr: `array (${sub} subs, ${change*2} changes, ${change} flushes)`, operation: (engine, tq) => {
        const obj = [];
        const dispose = getSubscriptions(engine.collectionObserver(obj), sub);
        for (let i = 0; i < change; i++) {
          obj.push(1);
          obj.pop();
          tq.flushMicroTaskQueue();
        }
        dispose();
      }
    });
  }
}

function run(iterations, dry) {
  const benchmark = new Benchmark([
    new Column('Weight', 8, 'left'),
    new Column('Operation', 40, 'left'),
    new Column('v1', 12, 'right'),
    new Column('v2', 12, 'right'),
    new Column('v1/v2', 9, 'right'),
    new Column('New', 12, 'right'),
    new Column('v1/New', 9, 'right'),
    new Column('v2/New', 9, 'right')
  ], tests, 3, iterations, rotations);

  benchmark.writeHeader();

  let r = rotations;
  while (r--) {
    for (const { expr, imports, weight, operation } of tests) {
      benchmark.writeLineStart();

      for (const $import of imports) {
        let k = iterations * weight;
        const b = require($import);
        const t = require('aurelia-task-queue');
        require('aurelia-polyfills');
        const { initialize, reset } = require('aurelia-pal-nodejs');
        initialize();
        const tq = new t.TaskQueue();
        const parser = new b.Parser();
        const evtmgr = new b.EventManager();
        const locator = new b.ObserverLocator(tq, evtmgr, parser);
        const engine = new b.BindingEngine(locator, parser);

        const start = process.hrtime();
        while (k--) {
          operation(engine, tq);
        }
        const end = process.hrtime(start);
        benchmark.addResult(end);

        reset();
      }
    }

    benchmark.nextRotation();
  }
  benchmark.writeFooter();
}

run(iterations);

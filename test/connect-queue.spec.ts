// tslint:disable:no-unused-expression
import { PLATFORM, DOM } from 'aurelia-pal';
import { Container } from 'aurelia-dependency-injection';
import { TaskQueue } from 'aurelia-task-queue';
import { BindingEngine } from '../src/binding-engine';
import { createOverrideContext } from '../src/scope';
import { expect } from 'chai';
import { spy } from 'sinon';
import { bindingMode } from '../src/types';

describe('connect-queue', () => {
  let bindingEngine, taskQueue;

  beforeEach(() => {
    const container = new Container();
    taskQueue = container.get(TaskQueue);
    bindingEngine = container.get(BindingEngine);
  });

  it('connects two-way bindings immediately', done => {
    const expression = bindingEngine.createBindingExpression('value', 'foo', bindingMode.twoWay);
    const source: any = { bindingContext: { foo: 'bar' } };
    source.overrideContext = createOverrideContext(source.bindingContext);
    const targets = [];
    for (let i = 1; i <= 101; i++) {
      const target: HTMLInputElement = <any>DOM.createElement('input');
      targets.push(target);
      const binding = expression.createBinding(target);
      binding.bind(source);
      expect(target.value).to.equal('bar');
    }
    source.bindingContext.foo = 'baz';
    taskQueue.queueMicroTask({
      call: () => {
        let i = targets.length;
        while (i--) {
          expect(targets[i].value).to.equal('baz');
        }
        done();
      }
    });
  });

  it('connects 100 bindings immediately before queueing rest', done => {
    const expression = bindingEngine.createBindingExpression('value', 'foo', bindingMode.toView);
    const source: any = { bindingContext: { foo: 'bar' } };
    source.overrideContext = createOverrideContext(source.bindingContext);
    const targets = [];
    for (let i = 1; i <= 101; i++) {
      const target: HTMLInputElement = <any>DOM.createElement('input');
      targets.push(target);
      const binding = expression.createBinding(target);
      binding.bind(source);
      expect(target.value).to.equal('bar');
    }
    source.bindingContext.foo = 'baz';
    taskQueue.queueMicroTask({
      call: () => {
        let i = targets.length - 1;
        expect(targets[i].value).to.equal('bar');
        while (i--) {
          expect(targets[i].value).to.equal('baz');
        }
        setTimeout(() => {
          expect(targets[targets.length - 1].value).to.equal('baz');
          done();
        });
      }
    });
  });

  it('handles bindings that unbind before queue flushes', done => {
    const expression = bindingEngine.createBindingExpression('value', 'foo', bindingMode.toView);
    const source: any = { bindingContext: { foo: 'bar' } };
    source.overrideContext = createOverrideContext(source.bindingContext);
    for (let i = 1; i <= 100; i++) {
      expression.createBinding(DOM.createElement('input')).bind(source);
    }
    const target: HTMLInputElement = <any>DOM.createElement('input');
    const binding = expression.createBinding(target);
    binding.bind(source);
    expect(target.value).to.equal('bar');
    source.bindingContext.foo = 'baz';
    binding.unbind();
    setTimeout(() => {
      expect(target.value).to.equal('bar');
      done();
    });
  });
});

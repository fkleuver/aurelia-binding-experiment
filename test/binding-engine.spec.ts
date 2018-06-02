// tslint:disable:no-unused-expression
import { TaskQueue } from 'aurelia-task-queue';
import { EventManager } from '../src/event-manager';
import { ObserverLocator } from '../src/observer-locator';
import { Parser } from '../src/parser';
import { BindingExpression } from '../src/binding-expression';
import { BindingEngine } from '../src/binding-engine';
import { Expression, AccessMemberExpression } from '../src/ast';
import { createScopeForTest } from '../src/scope';
import { expect } from 'chai';
import { spy } from 'sinon';

describe('bindingEngine', () => {
  let bindingEngine, observerLocator;

  before(() => {
    const taskQueue = new TaskQueue();
    const eventManager = new EventManager();
    const parser = new Parser();
    observerLocator = new ObserverLocator(taskQueue, eventManager, parser);
    bindingEngine = new BindingEngine(observerLocator, parser);
  });

  it('gets BindingExpressions', () => {
    const target = document.createElement('input');
    const targetProperty = 'value';
    const source = { foo: 'bar' };
    const sourceExpression = 'foo';
    const bindingExpression = bindingEngine.createBindingExpression(targetProperty, sourceExpression);
    expect(bindingExpression instanceof BindingExpression).to.be.true;
    const binding = bindingExpression.createBinding(target);
    binding.bind(createScopeForTest(source));
    expect(target.value).to.equal('bar');
    binding.unbind();
  });

  it('observes and unobserves property changes', done => {
    const obj = { foo: 'bar' };
    const callback = spy();
    const subscription = bindingEngine.propertyObserver(obj, 'foo').subscribe(callback);
    obj.foo = 'baz';
    setTimeout(() => {
      expect(callback).to.have.been.calledWith('baz', 'bar');
      subscription.dispose();
      callback.resetHistory();
      obj.foo = 'test';
      setTimeout(() => {
        expect(callback).not.to.have.been.called;
        done();
      });
    });
  });

  it('observes and unobserves array changes', done => {
    const obj = [];
    const callback = spy();
    const subscription = bindingEngine.collectionObserver(obj).subscribe(callback);
    obj.push('foo');
    setTimeout(() => {
      expect(callback).to.have.been.called;
      subscription.dispose();
      callback.resetHistory();
      obj.push('bar');
      setTimeout(() => {
        expect(callback).not.to.have.been.called;
        done();
      });
    });
  });

  it('observes and unobserves map changes', done => {
    const obj = new Map();
    const callback = spy();
    const subscription = bindingEngine.collectionObserver(obj).subscribe(callback);
    obj.set('foo', 'bar');
    setTimeout(() => {
      expect(callback).to.have.been.called;
      subscription.dispose();
      callback.resetHistory();
      obj.set('foo', 'baz');
      setTimeout(() => {
        expect(callback).not.to.have.been.called;
        done();
      });
    });
  });

  it('parses', () => {
    const expression = bindingEngine.parseExpression('foo.bar');
    expect(expression instanceof AccessMemberExpression).to.be.true;
  });

  it('registers adapters', () => {
    const mockAdapter = { getObserver: () => null };
    bindingEngine.registerAdapter(mockAdapter);
    expect(observerLocator.adapters[0]).to.equal(<any>mockAdapter);
  });
});

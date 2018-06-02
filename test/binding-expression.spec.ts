// tslint:disable:no-unused-expression
import { Container } from 'aurelia-dependency-injection';
import { DOM } from 'aurelia-pal';
import { BindingEngine } from '../src/binding-engine';
import { checkDelay } from './shared';
import { createScopeForTest } from '../src/scope';
import { signalBindings } from '../src/signals';
import { expect } from 'chai';
import { spy, SinonSpy } from 'sinon';
import { bindingMode } from '../src/types';
import { sourceContext } from '../src/call-context';

describe('BindingExpression', () => {
  let bindingEngine;

  before(() => {
    bindingEngine = new Container().get(BindingEngine);
  });

  it('handles AccessMember in twoWay mode', done => {
    const source = { foo: { bar: 'baz' } };
    const target = document.createElement('input');
    const bindingExpression = bindingEngine.createBindingExpression('value', 'foo.bar', bindingMode.twoWay);
    const binding = bindingExpression.createBinding(target);
    binding.bind(createScopeForTest(source));
    expect(target.value).to.equal(source.foo.bar);
    const sourceObserver = bindingEngine.observerLocator.getObserver(source.foo, 'bar');
    expect(sourceObserver.hasSubscribers()).to.be.true;
    source.foo.bar = 'xup';
    setTimeout(() => {
      expect(target.value).to.equal(source.foo.bar);
      binding.unbind();
      expect(sourceObserver.hasSubscribers()).to.be.false;
      source.foo.bar = 'test';
      setTimeout(() => {
        expect(target.value).to.equal('xup');
        done();
      },         checkDelay * 2);
    },         checkDelay * 2);
  });

  it('handles AccessMember in fromView mode', done => {
    const source = { foo: { bar: 'baz' } };
    const target = document.createElement('input');
    const bindingExpression = bindingEngine.createBindingExpression('value', 'foo.bar', bindingMode.fromView);
    const binding = bindingExpression.createBinding(target);

    binding.bind(createScopeForTest(source));
    expect(target.value).to.equal('');

    const sourceObserver = bindingEngine.observerLocator.getObserver(source.foo, 'bar');
    expect(sourceObserver.hasSubscribers()).to.be.false;

    expect(binding.targetObserver.hasSubscribers()).to.be.true;
    expect(binding.targetObserver.hasSubscriber(sourceContext, sourceObserver)).to.be.false;

    source.foo.bar = 'xup';
    setTimeout(() => {
      expect(target.value).to.equal('');
      target.value = 'xup';
      target.dispatchEvent(new CustomEvent('input'));

      setTimeout(() => {
        expect(source.foo.bar).to.equal('xup');
        binding.unbind();
        expect(binding.targetObserver.hasSubscribers()).to.be.false;
        done();
      },         checkDelay * 2);
    },         checkDelay * 2);
  });

  describe('ValueConverter', () => {
    it('handles ValueConverter without signals', done => {
      const valueConverters = {
        numberToString: {
          toView: <SinonSpy>(value => value.toString()),
          fromView: <SinonSpy>(value => parseInt(value, 10))
        },
        multiply: { toView: <SinonSpy>((value, arg) => value * arg), fromView: <SinonSpy>((value, arg) => value / arg) }
      };
      spy(valueConverters.numberToString, 'toView');
      spy(valueConverters.numberToString, 'fromView');
      spy(valueConverters.multiply, 'toView');
      spy(valueConverters.multiply, 'fromView');
      const lookupFunctions = { valueConverters: name => valueConverters[name] };
      const source = { foo: { bar: 1 }, arg: 2 };
      const target = document.createElement('input');
      const bindingExpression = bindingEngine.createBindingExpression(
        'value',
        'foo.bar | multiply:arg | numberToString',
        bindingMode.twoWay,
        lookupFunctions
      );
      const binding = bindingExpression.createBinding(target);
      binding.bind(createScopeForTest(source));
      expect(target.value).to.equal('2');
      expect(valueConverters.numberToString.toView).to.have.been.calledWith(2);
      expect(valueConverters.multiply.toView).to.have.been.calledWith(1, 2);
      const sourceObserver = bindingEngine.observerLocator.getObserver(source.foo, 'bar');
      expect(sourceObserver.hasSubscribers()).to.be.true;
      const argObserver = bindingEngine.observerLocator.getObserver(source, 'arg');
      expect(argObserver.hasSubscribers()).to.be.true;
      expect(binding.targetObserver.hasSubscribers()).to.be.true;
      source.foo.bar = 2;
      setTimeout(() => {
        expect(target.value).to.equal('4');
        expect(valueConverters.numberToString.toView).to.have.been.calledWith(4);
        expect(valueConverters.multiply.toView).to.have.been.calledWith(2, 2);
        valueConverters.numberToString.toView.resetHistory();
        valueConverters.numberToString.fromView.resetHistory();
        valueConverters.multiply.toView.resetHistory();
        valueConverters.multiply.fromView.resetHistory();
        source.arg = 4;
        setTimeout(() => {
          expect(target.value).to.equal('8');
          expect(valueConverters.numberToString.toView).to.have.been.calledWith(8);
          expect(valueConverters.numberToString.fromView).not.to.have.been.called;
          expect(valueConverters.multiply.toView).to.have.been.calledWith(2, 4);
          expect(valueConverters.multiply.fromView).not.to.have.been.called;
          valueConverters.numberToString.toView.resetHistory();
          valueConverters.numberToString.fromView.resetHistory();
          valueConverters.multiply.toView.resetHistory();
          valueConverters.multiply.fromView.resetHistory();
          target.value = '24';
          target.dispatchEvent(DOM.createCustomEvent('change'));
          setTimeout(() => {
            expect(valueConverters.numberToString.toView).to.have.been.calledWith(24);
            expect(valueConverters.numberToString.fromView).to.have.been.calledWith('24');
            expect(valueConverters.multiply.toView).to.have.been.calledWith(6, 4);
            expect(valueConverters.multiply.fromView).to.have.been.calledWith(24, 4);
            valueConverters.numberToString.toView.resetHistory();
            valueConverters.numberToString.fromView.resetHistory();
            valueConverters.multiply.toView.resetHistory();
            valueConverters.multiply.fromView.resetHistory();
            expect(source.foo.bar).to.equal(<any>6);
            binding.unbind();
            expect(sourceObserver.hasSubscribers()).to.be.false;
            expect(argObserver.hasSubscribers()).to.be.false;
            expect(binding.targetObserver.hasSubscribers()).to.be.false;
            source.foo.bar = 4;
            setTimeout(() => {
              expect(valueConverters.numberToString.toView).not.to.have.been.called;
              expect(valueConverters.numberToString.fromView).not.to.have.been.called;
              expect(valueConverters.multiply.toView).not.to.have.been.called;
              expect(valueConverters.multiply.fromView).not.to.have.been.called;
              expect(target.value).to.equal('24');
              done();
            },         checkDelay * 2);
          },         checkDelay * 2);
        },         checkDelay * 2);
      },         checkDelay * 2);
    });

    it('handles ValueConverter with signals', done => {
      let prefix = '_';
      const valueConverters = {
        withSingleSignals: {
          signals: ['hello'],
          toView: val => prefix + val
        },
        withMultipleSignals: {
          signals: ['hello', 'world'],
          toView: val => prefix + val
        }
      };
      const lookupFunctions = { valueConverters: name => valueConverters[name] };
      const source = { foo: { bar: 1 }, arg: 2 };
      const target1 = document.createElement('input');
      const bindingExpression1 = bindingEngine.createBindingExpression(
        'value',
        'foo.bar | withSingleSignals',
        bindingMode.toView,
        lookupFunctions
      );
      const binding1 = bindingExpression1.createBinding(target1);
      const target2 = document.createElement('input');
      const bindingExpression2 = bindingEngine.createBindingExpression(
        'value',
        'foo.bar | withMultipleSignals',
        bindingMode.toView,
        lookupFunctions
      );
      const binding2 = bindingExpression2.createBinding(target2);
      const scope = createScopeForTest(source);
      binding1.bind(scope);
      binding2.bind(scope);
      expect(target1.value).to.equal('_1');
      expect(target2.value).to.equal('_1');
      prefix = '';
      signalBindings('hello');
      setTimeout(() => {
        expect(target1.value).to.equal('1');
        expect(target2.value).to.equal('1');
        prefix = '_';
        signalBindings('world');
        setTimeout(() => {
          expect(target1.value).to.equal('1');
          expect(target2.value).to.equal('_1');
          done();
        },         checkDelay * 2);
      },         checkDelay * 2);
    });
  });

  it('handles BindingBehavior', done => {
    const bindingBehaviors = {
      numberToString: { bind: (_: any, __: any) => {}, unbind: (_: any, __: any) => {} },
      multiply: { bind: (_: any, __: any) => {}, unbind: (_: any, __: any) => {} }
    };
    spy(bindingBehaviors.numberToString, 'bind');
    spy(bindingBehaviors.numberToString, 'unbind');
    spy(bindingBehaviors.multiply, 'bind');
    spy(bindingBehaviors.multiply, 'unbind');
    const lookupFunctions = { bindingBehaviors: name => bindingBehaviors[name] };
    const source = { foo: { bar: 'baz' }, arg: 'hello world' };
    const target = document.createElement('input');
    const bindingExpression = bindingEngine.createBindingExpression(
      'value',
      'foo.bar & numberToString:arg & multiply',
      bindingMode.twoWay,
      lookupFunctions
    );
    const binding = bindingExpression.createBinding(target);
    function exerciseBindingBehavior(callback: Function): void {
      const scope = createScopeForTest(source);
      binding.bind(scope);
      expect(bindingBehaviors.numberToString.bind).to.have.been.calledWith(binding, scope, 'hello world');
      expect(bindingBehaviors.multiply.bind).to.have.been.calledWith(binding, scope);
      expect(target.value).to.equal(source.foo.bar);
      const sourceObserver = bindingEngine.observerLocator.getObserver(source.foo, 'bar');
      expect(sourceObserver.hasSubscribers()).to.be.true;
      const argObserver = bindingEngine.observerLocator.getObserver(source, 'arg');
      expect(argObserver.hasSubscribers()).to.be.false;
      expect(binding.targetObserver.hasSubscribers()).to.be.true;
      source.foo.bar = 'xup';
      setTimeout(() => {
        expect(target.value).to.equal(source.foo.bar);
        source.arg = 'goodbye world';
        setTimeout(() => {
          expect(target.value).to.equal(source.foo.bar);
          target.value = 'burrito';
          target.dispatchEvent(DOM.createCustomEvent('change'));
          setTimeout(() => {
            expect(source.foo.bar).to.equal(target.value);
            binding.unbind();
            expect(bindingBehaviors.numberToString.unbind).to.have.been.calledWith(binding, scope);
            expect(bindingBehaviors.multiply.unbind).to.have.been.calledWith(binding, scope);
            expect(sourceObserver.hasSubscribers()).to.be.false;
            expect(argObserver.hasSubscribers()).to.be.false;
            expect(binding.targetObserver.hasSubscribers()).to.be.false;
            source.foo.bar = 'test';
            setTimeout(() => {
              expect(target.value).to.equal('burrito');
              callback();
            },         checkDelay * 2);
          },         checkDelay * 2);
        },         checkDelay * 2);
      },         checkDelay * 2);
    }
    exerciseBindingBehavior(() => exerciseBindingBehavior(done));
  });
});

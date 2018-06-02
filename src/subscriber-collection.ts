import { Callable, Observer, SubscriberCollection, BindingFlags } from './types';

function addSubscriber(this: SubscriberCollection, context: any, callable: Callable): boolean {
  if (this.hasSubscriber(context, callable)) {
    return false;
  }
  if (!this._context0) {
    this._context0 = context;
    this._callable0 = callable;
    return true;
  }
  if (!this._context1) {
    this._context1 = context;
    this._callable1 = callable;
    return true;
  }
  if (!this._context2) {
    this._context2 = context;
    this._callable2 = callable;
    return true;
  }
  if (!this._contextsRest) {
    this._contextsRest = [context];
    this._callablesRest = [callable];
    return true;
  }
  this._contextsRest.push(context);
  this._callablesRest.push(callable);
  return true;
}

function removeSubscriber(this: SubscriberCollection, context: any, callable: Callable): boolean {
  if (this._context0 === context && this._callable0 === callable) {
    this._context0 = null;
    this._callable0 = <any>null;
    return true;
  }
  if (this._context1 === context && this._callable1 === callable) {
    this._context1 = null;
    this._callable1 = <any>null;
    return true;
  }
  if (this._context2 === context && this._callable2 === callable) {
    this._context2 = null;
    this._callable2 = <any>null;
    return true;
  }
  const callables = this._callablesRest;
  if (callables === undefined || callables.length === 0) {
    return false;
  }
  const contexts = this._contextsRest;
  let i = 0;
  while (!(callables[i] === callable && contexts[i] === context) && callables.length > i) {
    i++;
  }
  if (i >= callables.length) {
    return false;
  }
  contexts.splice(i, 1);
  callables.splice(i, 1);
  return true;
}

const arrayPool1 = new Array();
const arrayPool2 = new Array();
const poolUtilization = new Array();

function callSubscribers(this: SubscriberCollection, newValue: any, oldValue: any, flags: BindingFlags): void {
  const context0 = this._context0;
  const callable0 = this._callable0;
  const context1 = this._context1;
  const callable1 = this._callable1;
  const context2 = this._context2;
  const callable2 = this._callable2;
  const length = this._contextsRest ? this._contextsRest.length : 0;
  let contextsRest: Array<any> = <any>undefined;
  let callablesRest: Array<any> = <any>undefined;
  let poolIndex: number = <any>undefined;
  let i;
  if (length) {
    // grab temp arrays from the pool.
    poolIndex = poolUtilization.length;
    while (poolIndex-- && poolUtilization[poolIndex]) {
      // Do nothing
    }
    if (poolIndex < 0) {
      poolIndex = poolUtilization.length;
      contextsRest = [];
      callablesRest = [];
      poolUtilization.push(true);
      arrayPool1.push(contextsRest);
      arrayPool2.push(callablesRest);
    } else {
      poolUtilization[poolIndex] = true;
      contextsRest = arrayPool1[poolIndex];
      callablesRest = arrayPool2[poolIndex];
    }
    // copy the contents of the "rest" arrays.
    i = length;
    while (i--) {
      contextsRest[i] = this._contextsRest[i];
      callablesRest[i] = this._callablesRest[i];
    }
  }

  if (context0) {
    if (callable0) {
      callable0.call(context0, newValue, oldValue, flags);
    } else {
      context0(newValue, oldValue, flags);
    }
  }
  if (context1) {
    if (callable1) {
      callable1.call(context1, newValue, oldValue, flags);
    } else {
      context1(newValue, oldValue, flags);
    }
  }
  if (context2) {
    if (callable2) {
      callable2.call(context2, newValue, oldValue, flags);
    } else {
      context2(newValue, oldValue, flags);
    }
  }
  if (length) {
    for (i = 0; i < length; i++) {
      const callable = callablesRest[i];
      const context = contextsRest[i];
      if (callable) {
        callable.call(context, newValue, oldValue);
      } else {
        context(newValue, oldValue, flags);
      }
      contextsRest[i] = null;
      callablesRest[i] = null;
    }
    poolUtilization[poolIndex] = false;
  }
}

function hasSubscribers(this: SubscriberCollection): boolean {
  return !!(this._context0 || this._context1 || this._context2 || (this._contextsRest && this._contextsRest.length));
}

function hasSubscriber(this: SubscriberCollection, context: any, callable: Callable): boolean {
  const has =
    (this._context0 === context && this._callable0 === callable) ||
    (this._context1 === context && this._callable1 === callable) ||
    (this._context2 === context && this._callable2 === callable);
  if (has) {
    return true;
  }
  let index;
  const contexts = this._contextsRest;
  if (!contexts || (index = contexts.length) === 0) {
    // eslint-disable-line no-cond-assign
    return false;
  }
  const callables = this._callablesRest;
  while (index--) {
    if (contexts[index] === context && callables[index] === callable) {
      return true;
    }
  }
  return false;
}

export function subscriberCollection(): ClassDecorator {
  return function(target: Function): void {
    target.prototype.addSubscriber = addSubscriber;
    target.prototype.removeSubscriber = removeSubscriber;
    target.prototype.callSubscribers = callSubscribers;
    target.prototype.hasSubscribers = hasSubscribers;
    target.prototype.hasSubscriber = hasSubscriber;
  };
}

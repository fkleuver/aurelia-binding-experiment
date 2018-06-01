/* eslint-disable no-extend-native */
import { ModifyCollectionObserver } from './collection-observation';
import { TaskQueue } from 'aurelia-task-queue';

const pop = Array.prototype.pop;
const push = Array.prototype.push;
const reverse = Array.prototype.reverse;
const shift = Array.prototype.shift;
const sort = Array.prototype.sort;
const splice = Array.prototype.splice;
const unshift = Array.prototype.unshift;

Array.prototype.pop = function(this: any): ReturnType<typeof Array.prototype.pop> {
  const notEmpty = this.length > 0;
  const methodCallResult = pop.apply(this, arguments);
  if (notEmpty && this.__array_observer__ !== undefined) {
    this.__array_observer__.addChangeRecord({
      type: 'delete',
      object: this,
      name: this.length,
      oldValue: methodCallResult
    });
  }
  return methodCallResult;
};

Array.prototype.push = function(this: any): ReturnType<typeof Array.prototype.push> {
  const methodCallResult = push.apply(this, arguments);
  if (this.__array_observer__ !== undefined) {
    this.__array_observer__.addChangeRecord({
      type: 'splice',
      object: this,
      index: this.length - arguments.length,
      removed: [],
      addedCount: arguments.length
    });
  }
  return methodCallResult;
};

Array.prototype.reverse = function(this: any): ReturnType<typeof Array.prototype.reverse> {
  let oldArray;
  if (this.__array_observer__ !== undefined) {
    this.__array_observer__.flushChangeRecords();
    oldArray = this.slice();
  }
  const methodCallResult = reverse.apply(this, arguments);
  if (this.__array_observer__ !== undefined) {
    this.__array_observer__.reset(oldArray);
  }
  return methodCallResult;
};

Array.prototype.shift = function(this: any): ReturnType<typeof Array.prototype.shift> {
  const notEmpty = this.length > 0;
  const methodCallResult = shift.apply(this, arguments);
  if (notEmpty && this.__array_observer__ !== undefined) {
    this.__array_observer__.addChangeRecord({
      type: 'delete',
      object: this,
      name: 0,
      oldValue: methodCallResult
    });
  }
  return methodCallResult;
};

Array.prototype.sort = function(this: any): ReturnType<typeof Array.prototype.sort> {
  let oldArray;
  if (this.__array_observer__ !== undefined) {
    this.__array_observer__.flushChangeRecords();
    oldArray = this.slice();
  }
  const methodCallResult = sort.apply(this, arguments);
  if (this.__array_observer__ !== undefined) {
    this.__array_observer__.reset(oldArray);
  }
  return methodCallResult;
};

Array.prototype.splice = function(this: any): ReturnType<typeof Array.prototype.splice> {
  const methodCallResult = splice.apply(this, arguments);
  if (this.__array_observer__ !== undefined) {
    this.__array_observer__.addChangeRecord({
      type: 'splice',
      object: this,
      index: +arguments[0],
      removed: methodCallResult,
      addedCount: arguments.length > 2 ? arguments.length - 2 : 0
    });
  }
  return methodCallResult;
};

Array.prototype.unshift = function(this: any): ReturnType<typeof Array.prototype.unshift> {
  const methodCallResult = unshift.apply(this, arguments);
  if (this.__array_observer__ !== undefined) {
    this.__array_observer__.addChangeRecord({
      type: 'splice',
      object: this,
      index: 0,
      removed: [],
      addedCount: arguments.length
    });
  }
  return methodCallResult;
};

export function getArrayObserver(taskQueue: TaskQueue, array: Array<any>): any {
  return ModifyArrayObserver.for(taskQueue, array);
}

class ModifyArrayObserver extends ModifyCollectionObserver {
  constructor(taskQueue: TaskQueue, array: Array<any>) {
    super(taskQueue, array);
  }

  // tslint:disable-next-line:function-name
  public static for(taskQueue: TaskQueue, array: Array<any>): ModifyArrayObserver {
    if (!('__array_observer__' in array)) {
      Reflect.defineProperty(array, '__array_observer__', {
        value: ModifyArrayObserver.create(taskQueue, array),
        enumerable: false,
        configurable: false
      });
    }
    return (<any>array).__array_observer__;
  }

  // tslint:disable-next-line:function-name
  public static create(taskQueue: TaskQueue, array: Array<any>): ModifyArrayObserver {
    return new ModifyArrayObserver(taskQueue, array);
  }
}

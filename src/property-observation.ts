import { subscriberCollection } from './subscriber-collection';
import { TaskQueue } from 'aurelia-task-queue';
import { Callable, Observer, BindingFlags } from './types';

export const propertyAccessor = {
  getValue: (obj: any, propertyName: string): any => obj[propertyName],
  setValue: (value: any, obj: any, propertyName: string): void => {
    obj[propertyName] = value;
  }
};

export class PrimitiveObserver {
  public doNotCache: boolean = true;
  public primitive: any;
  public propertyName: string;

  constructor(primitive: any, propertyName: string) {
    this.primitive = primitive;
    this.propertyName = propertyName;
  }

  public getValue(): any {
    return this.primitive[this.propertyName];
  }

  public setValue(): void {
    const type = typeof this.primitive;
    throw new Error(`The ${this.propertyName} property of a ${type} (${this.primitive}) cannot be assigned.`);
  }

  public subscribe(): void {}

  public unsubscribe(): void {}
}

@subscriberCollection()
export class SetterObserver implements Observer {
  public taskQueue: TaskQueue;
  public obj: any;
  public propertyName: string;
  public queued: boolean;
  public observing: boolean;
  public currentValue: any;
  public oldValue: any;

  public addSubscriber: (context: any, callable: Callable) => boolean;
  public removeSubscriber: (context: any, callable: Callable) => boolean;
  public callSubscribers: (newValue: any, oldValue: any, flags: BindingFlags) => void;
  public hasSubscribers: () => boolean;
  public hasSubscriber: (context: any, callable: Callable) => boolean;

  constructor(taskQueue: TaskQueue, obj: any, propertyName: string) {
    this.taskQueue = taskQueue;
    this.obj = obj;
    this.propertyName = propertyName;
    this.queued = false;
    this.observing = false;
  }

  public getValue(): any {
    return this.obj[this.propertyName];
  }

  public setValue(newValue: any): void {
    this.obj[this.propertyName] = newValue;
  }

  public getterValue(): any {
    return this.currentValue;
  }

  public setterValue(newValue: any): void {
    const oldValue = this.currentValue;

    if (oldValue !== newValue) {
      if (!this.queued) {
        this.oldValue = oldValue;
        this.queued = true;
        this.taskQueue.queueMicroTask(<any>this);
      }

      this.currentValue = newValue;
    }
  }

  public call(flags: BindingFlags): void {
    const oldValue = this.oldValue;
    const newValue = this.currentValue;

    this.queued = false;

    this.callSubscribers(newValue, oldValue, flags);
  }

  public subscribe(context: any, callable: Callable): void {
    if (!this.observing) {
      this.convertProperty();
    }
    this.addSubscriber(context, callable);
  }

  public unsubscribe(context: any, callable: Callable): void {
    this.removeSubscriber(context, callable);
  }

  public convertProperty(): void {
    this.observing = true;
    this.currentValue = this.obj[this.propertyName];
    this.setValue = this.setterValue;
    this.getValue = this.getterValue;

    if (
      !Reflect.defineProperty(this.obj, this.propertyName, {
        configurable: true,
        enumerable: this.propertyName in this.obj ? this.obj.propertyIsEnumerable(this.propertyName) : true,
        get: this.getValue.bind(this),
        set: this.setValue.bind(this)
      })
    ) {
      console.warn(`Cannot observe property '${this.propertyName}' of object`, this.obj);
    }
  }
}

import { IsBindingBehaviorExpression } from './ast';
import { Binding } from './binding-expression';

export interface OverrideContext {
  parentOverrideContext: OverrideContext | null;
  bindingContext: any;
}

export interface Scope {
  bindingContext: any;
  overrideContext: OverrideContext;
}

export interface LookupFunctions {
  valueConverters(name: string): { fromView?(...args: any[]): any; toView?(...args: any[]): any } | null;
  bindingBehaviors(name: string): { bind(binding: Binding, scope: Scope, ...args: any[]): void; unbind?(binding: Binding, scope: Scope): void } | null;
}

export interface Observer {
  doNotCache?: boolean;

  addSubscriber(context: any, callable: Callable): boolean;
  removeSubscriber(context: any, callable: Callable): boolean;
  callSubscribers(newValue: any, oldValue: Callable, flags: BindingFlags): void;
  hasSubscribers(): boolean;
  hasSubscriber(context: any, callable: Callable): boolean;

  subscribe(context: any, callback: Callable): void;
  unsubscribe(context: any, callback: Callable): void;
}

export interface Connectable {
  observeProperty(obj: any, propertyName: string): void;
  observeArray(array: Array<any>): void;
  unobserve(all: boolean): void;
  addObserver(observer: Observer): void;
}

export interface Callable {
  call(context: any, newValue: any, oldValue: any, flags: BindingFlags): void;
}

export interface SubscriberCollection extends Observer {
  _context0: any;
  _callable0: Callable;
  _context1: any;
  _callable1: Callable;
  _context2: any;
  _callable2: Callable;
  _contextsRest: Array<any>;
  _callablesRest: Array<Callable>;
}

export interface Subscription {
  dispose(): void;
}

export interface Subscribeable {
  subscribe(callback: Callable): Subscription;
}

export enum bindingMode {
  oneTime = 1,
  toView = 2,
  fromView = 4,
  twoWay = 6,
}

export type Unpacked<T> = T extends (infer U)[] ? U : T;
export type EvaluateResult<T> = T extends { evaluate(...args: any[]): infer R } ? R : any;
export type AssignResult<T> = T extends { assign(...args: any[]): infer R } ? R : any;

export enum BindingFlags {
  mustEvaluate = 1 << 0
}

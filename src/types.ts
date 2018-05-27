import { AureliaExpression } from './ast';

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

export interface Binding {
  mode?: bindingMode;
  sourceExpression?: AureliaExpression;
  isBound: boolean;
  source: Scope;
  updateTarget?(value: any): void;
  updateSource?(value: any): void;
  callSource?(event: any): any;
  bind(source: Scope): void;
  unbind(): void;
  [key: string]: any;
}

export enum bindingMode {
  oneTime = 0,
  toView = 1,
  twoWay = 2,
  fromView = 3
}

export type Unpacked<T> = T extends (infer U)[] ? U : T;
export type EvaluateResult<T> = T extends { evaluate(...args: any[]): infer R } ? R : any;
export type AssignResult<T> = T extends { assign(...args: any[]): infer R } ? R : any;

export enum BindingFlags {
  mustEvaluate = 1 << 0
}

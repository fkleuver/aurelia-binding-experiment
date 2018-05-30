import { getContextFor } from './scope';
import { connectBindingToSignal } from './signals';
import { Scope, OverrideContext, LookupFunctions, BindingFlags, Binding } from './types';

export type CallExpression = CallFunctionExpression | CallMemberExpression | CallScopeExpression;
export type AccessExpression = AccessThisExpression | AccessScopeExpression | AccessMemberExpression | AccessKeyedExpression;
export type LiteralExpression = ArrayLiteralExpression | ObjectLiteralExpression | PrimitiveLiteralExpression | TemplateExpression;

export type PrimaryExpression = AccessExpression | LiteralExpression | UnaryExpression;
export type LeftHandSideExpression = PrimaryExpression | CallExpression;
export type IsUnaryExpression = LeftHandSideExpression | UnaryExpression;
export type IsBinaryExpression = IsUnaryExpression | BinaryExpression;
export type IsConditionalExpression = IsBinaryExpression | ConditionalExpression;
export type IsAssignmentExpression = IsConditionalExpression | AssignmentExpression;
export type IsValueConverterExpression = IsAssignmentExpression | ValueConverterExpression;
export type IsBindingBehaviorExpression = IsValueConverterExpression | BindingBehaviorExpression;
export type AssignableExpression = AccessScopeExpression | AccessKeyedExpression | AccessMemberExpression;

export class BindingBehaviorExpression {

  public expression: IsBindingBehaviorExpression;
  public name: string;
  public args: Array<IsAssignmentExpression>;
  constructor(expression: IsBindingBehaviorExpression, name: string, args: Array<IsAssignmentExpression>) {
    this.expression = expression;
    this.name = name;
    this.args = args;
  }

  public evaluate(scope: Scope, lookupFunctions: LookupFunctions, flags: BindingFlags): any {
    return this.expression.evaluate(scope, lookupFunctions, flags);
  }

  public assign(scope: Scope, value: any, lookupFunctions: LookupFunctions, flags: BindingFlags): any {
    return this.expression.assign(scope, value, lookupFunctions, flags);
  }

  public accept(visitor: any): any {
    return visitor.visitBindingBehavior(this);
  }

  public connect(binding: Binding, scope: Scope, flags: BindingFlags): void {
    this.expression.connect(binding, scope, flags);
  }

  public bind(binding: Binding, scope: Scope, lookupFunctions: LookupFunctions, flags: BindingFlags): any {
    if (this.expression.expression && this.expression.bind) {
      this.expression.bind(binding, scope, lookupFunctions, flags);
    }
    const behavior = lookupFunctions.bindingBehaviors(this.name);
    if (!behavior) {
      throw new Error(`No BindingBehavior named "${this.name}" was found!`);
    }
    const behaviorKey = `behavior-${this.name}`;
    if (binding[behaviorKey]) {
      throw new Error(`A binding behavior named "${this.name}" has already been applied to "${this.expression}"`);
    }
    binding[behaviorKey] = behavior;
    behavior.bind.apply(behavior, [binding, scope].concat(evalList(scope, this.args, binding.lookupFunctions, flags)));
  }

  public unbind(binding: Binding, scope: Scope, flags: BindingFlags): any {
    const behaviorKey = `behavior-${this.name}`;
    binding[behaviorKey].unbind(binding, scope, flags);
    binding[behaviorKey] = null;
    if (this.expression.expression && this.expression.unbind) {
      this.expression.unbind(binding, scope, flags);
    }
  }
}

export class ValueConverterExpression {
  public bind: undefined;
  public unbind: undefined;

  public expression: IsValueConverterExpression;
  public name: string;
  public args: Array<IsAssignmentExpression>;
  public allArgs: any[];
  constructor(expression: IsValueConverterExpression, name: string, args: Array<IsAssignmentExpression>) {
    this.expression = expression;
    this.name = name;
    this.args = args;
    this.allArgs = [expression].concat(args);
  }

  public evaluate(scope: Scope, lookupFunctions: LookupFunctions, flags: BindingFlags): any {
    const converter = lookupFunctions.valueConverters(this.name);
    if (!converter) {
      throw new Error(`No ValueConverter named "${this.name}" was found!`);
    }

    if (converter.toView) {
      return converter.toView.apply(converter, evalList(scope, this.allArgs, lookupFunctions, flags));
    }

    return this.expression.evaluate(scope, lookupFunctions, flags);
  }

  public assign(scope: Scope, value: any, lookupFunctions: LookupFunctions, flags: BindingFlags): any {
    const converter = lookupFunctions.valueConverters(this.name);
    if (!converter) {
      throw new Error(`No ValueConverter named "${this.name}" was found!`);
    }

    if (converter.fromView) {
      value = converter.fromView.apply(converter, [value].concat(evalList(scope, this.args, lookupFunctions, flags)));
    }

    return this.expression.assign(scope, value, lookupFunctions, flags);
  }

  public accept(visitor: any): any {
    return visitor.visitValueConverter(this);
  }

  public connect(binding: Binding, scope: Scope, flags: BindingFlags): void {
    const expressions = this.allArgs;
    let i = expressions.length;
    while (i--) {
      expressions[i].connect(binding, scope, flags);
    }
    const converter = binding.lookupFunctions.valueConverters(this.name);
    if (!converter) {
      throw new Error(`No ValueConverter named "${this.name}" was found!`);
    }
    const signals = converter.signals;
    if (signals === undefined) {
      return;
    }
    i = signals.length;
    while (i--) {
      connectBindingToSignal(binding, signals[i]);
    }
  }
}

export class AssignmentExpression {
  public bind: undefined;
  public unbind: undefined;
  public expression: undefined;

  public target: AssignableExpression;
  public value: IsAssignmentExpression;
  constructor(target: AssignableExpression, value: IsAssignmentExpression) {
    this.target = target;
    this.value = value;
  }

  public evaluate(scope: Scope, lookupFunctions: LookupFunctions, flags: BindingFlags): any {
    return this.target.assign(scope, this.value.evaluate(scope, lookupFunctions, flags), lookupFunctions, flags);
  }

  public accept(vistor: any): any {
    vistor.visitAssign(this);
  }

  // tslint:disable-next-line:no-empty
  public connect(binding: Binding, scope: Scope, flags: BindingFlags): void {}

  public assign(scope: Scope, value: any, lookupFunctions: LookupFunctions, flags: BindingFlags): any {
    this.value.assign(scope, value, lookupFunctions, flags);
    this.target.assign(scope, value, lookupFunctions, flags);
  }
}

export class ConditionalExpression {
  public bind: undefined;
  public unbind: undefined;
  public expression: undefined;

  public condition: IsBinaryExpression;
  public yes: IsAssignmentExpression;
  public no: IsAssignmentExpression;
  constructor(condition: IsBinaryExpression, yes: IsAssignmentExpression, no: IsAssignmentExpression) {
    this.condition = condition;
    this.yes = yes;
    this.no = no;
  }

  public evaluate(scope: Scope, lookupFunctions: LookupFunctions, flags: BindingFlags): any {
    return !!this.condition.evaluate(scope, lookupFunctions, flags)
      ? this.yes.evaluate(scope, lookupFunctions, flags)
      : this.no.evaluate(scope, lookupFunctions, flags);
  }

  public accept(visitor: any): any {
    return visitor.visitConditional(this);
  }

  public connect(binding: Binding, scope: Scope, flags: BindingFlags): void {
    this.condition.connect(binding, scope, flags);
    if (this.condition.evaluate(scope, <any>undefined, flags)) {
      this.yes.connect(binding, scope, flags);
    } else {
      this.no.connect(binding, scope, flags);
    }
  }

  public assign(scope: Scope, value: any, lookupFunctions: LookupFunctions, flags: BindingFlags): any {
    throw new Error(`Binding expression "${this}" cannot be assigned to.`);
  }
}

export class AccessThisExpression {
  public bind: undefined;
  public unbind: undefined;
  public expression: undefined;

  public ancestor: number;
  constructor(ancestor: number) {
    this.ancestor = ancestor;
  }

  public evaluate(scope: Scope, lookupFunctions: LookupFunctions, flags: BindingFlags): OverrideContext | { [key: string]: any } | undefined {
    let oc: OverrideContext | null = scope.overrideContext;
    let i = this.ancestor;
    while (i-- && oc) {
      oc = oc.parentOverrideContext;
    }
    return i < 1 && oc ? oc.bindingContext : undefined;
  }

  public accept(visitor: any): any {
    return visitor.visitAccessThis(this);
  }

  public connect(binding: Binding, scope: Scope, flags: BindingFlags): void {}

  public assign(scope: Scope, value: any, lookupFunctions: LookupFunctions, flags: BindingFlags): any {
    throw new Error(`Binding expression "${this}" cannot be assigned to.`);
  }
}

export class AccessScopeExpression {
  public bind: undefined;
  public unbind: undefined;
  public expression: undefined;

  public name: string;
  public ancestor: number;
  constructor(name: string, ancestor: number) {
    this.name = name;
    this.ancestor = ancestor;
  }

  public evaluate(scope: Scope, lookupFunctions: LookupFunctions, flags: BindingFlags): any {
    const context = getContextFor(this.name, scope, this.ancestor);
    return context[this.name];
  }

  public assign(scope: Scope, value: any, lookupFunctions: LookupFunctions, flags: BindingFlags): any {
    const context = getContextFor(this.name, scope, this.ancestor);
    return context ? (context[this.name] = value) : undefined;
  }

  public accept(visitor: any): any {
    return visitor.visitAccessScope(this);
  }

  public connect(binding: Binding, scope: Scope, flags: BindingFlags): void {
    const context = getContextFor(this.name, scope, this.ancestor);
    binding.observeProperty(context, this.name);
  }
}

export class AccessMemberExpression {
  public bind: undefined;
  public unbind: undefined;
  public expression: undefined;

  public name: string;
  public object: LeftHandSideExpression;
  constructor(object: LeftHandSideExpression, name: string) {
    this.object = object;
    this.name = name;
  }

  public evaluate(scope: Scope, lookupFunctions: LookupFunctions, flags: BindingFlags): any {
    const instance = this.object.evaluate(scope, lookupFunctions, flags);
    return instance === null || instance === undefined ? instance : instance[this.name];
  }

  public assign(scope: Scope, value: any, lookupFunctions: LookupFunctions, flags: BindingFlags): any {
    let instance = this.object.evaluate(scope, lookupFunctions, flags);

    if (instance === null || instance === undefined) {
      instance = {};
      this.object.assign(scope, instance, lookupFunctions, flags);
    }

    instance[this.name] = value;
    return value;
  }

  public accept(visitor: any): any {
    return visitor.visitAccessMember(this);
  }

  public connect(binding: Binding, scope: Scope, flags: BindingFlags): void {
    this.object.connect(binding, scope, flags);
    const obj = this.object.evaluate(scope, <any>undefined, flags);
    if (obj) {
      binding.observeProperty(obj, this.name);
    }
  }
}

export class AccessKeyedExpression {
  public bind: undefined;
  public unbind: undefined;
  public expression: undefined;

  public object: LeftHandSideExpression;
  public key: IsAssignmentExpression;
  constructor(object: LeftHandSideExpression, key: IsAssignmentExpression) {
    this.object = object;
    this.key = key;
  }

  public evaluate(scope: Scope, lookupFunctions: LookupFunctions, flags: BindingFlags): any {
    const instance = this.object.evaluate(scope, lookupFunctions, flags);
    const lookup = this.key.evaluate(scope, lookupFunctions, flags);
    return getKeyed(instance, lookup);
  }

  public assign(scope: Scope, value: any, lookupFunctions: LookupFunctions, flags: BindingFlags): any {
    const instance = this.object.evaluate(scope, lookupFunctions, flags);
    const lookup = this.key.evaluate(scope, lookupFunctions, flags);
    return setKeyed(instance, lookup, value);
  }

  public accept(visitor: any): any {
    return visitor.visitAccessKeyed(this);
  }

  public connect(binding: Binding, scope: Scope, flags: BindingFlags): void {
    this.object.connect(binding, scope, flags);
    const obj = this.object.evaluate(scope, <any>undefined, flags);
    if (obj instanceof Object) {
      this.key.connect(binding, scope, flags);
      const key = this.key.evaluate(scope, <any>undefined, flags);
      // observe the property represented by the key as long as it's not an array
      // being accessed by an integer key which would require dirty-checking.
      if (key !== null && key !== undefined && !(Array.isArray(obj) && typeof key === 'number')) {
        binding.observeProperty(obj, key);
      }
    }
  }
}

export class CallScopeExpression {
  public bind: undefined;
  public unbind: undefined;
  public expression: undefined;

  public name: string;
  public args: Array<IsAssignmentExpression>;
  public ancestor: number;
  constructor(name: string, args: Array<IsAssignmentExpression>, ancestor: number) {
    this.name = name;
    this.args = args;
    this.ancestor = ancestor;
  }

  public evaluate(scope: Scope, lookupFunctions: LookupFunctions, flags: BindingFlags): any {
    const args = evalList(scope, this.args, lookupFunctions, flags);
    const context = getContextFor(this.name, scope, this.ancestor);
    const func = getFunction(context, this.name, flags & BindingFlags.mustEvaluate);
    if (func) {
      return func.apply(context, args);
    }
    return undefined;
  }

  public accept(visitor: any): any {
    return visitor.visitCallScope(this);
  }

  public connect(binding: Binding, scope: Scope, flags: BindingFlags): void {
    const args = this.args;
    let i = args.length;
    while (i--) {
      args[i].connect(binding, scope, flags);
    }
  }

  public assign(scope: Scope, value: any, lookupFunctions: LookupFunctions, flags: BindingFlags): any {
    throw new Error(`Binding expression "${this}" cannot be assigned to.`);
  }
}

export class CallMemberExpression {
  public bind: undefined;
  public unbind: undefined;
  public expression: undefined;

  public name: string;
  public args: Array<IsAssignmentExpression>;
  public object: LeftHandSideExpression;
  constructor(object: LeftHandSideExpression, name: string, args: Array<IsAssignmentExpression>) {
    this.object = object;
    this.name = name;
    this.args = args;
  }

  public evaluate(scope: Scope, lookupFunctions: LookupFunctions, flags: BindingFlags): any {
    const instance = this.object.evaluate(scope, lookupFunctions, flags);
    const args = evalList(scope, this.args, lookupFunctions, flags);
    const func = getFunction(instance, this.name, flags & BindingFlags.mustEvaluate);
    if (func) {
      return func.apply(instance, args);
    }
    return undefined;
  }

  public accept(visitor: any): any {
    return visitor.visitCallMember(this);
  }

  public connect(binding: Binding, scope: Scope, flags: BindingFlags): void {
    this.object.connect(binding, scope, flags);
    const obj = this.object.evaluate(scope, <any>undefined, flags);
    if (getFunction(obj, this.name, false)) {
      const args = this.args;
      let i = args.length;
      while (i--) {
        args[i].connect(binding, scope, flags);
      }
    }
  }

  public assign(scope: Scope, value: any, lookupFunctions: LookupFunctions, flags: BindingFlags): any {
    throw new Error(`Binding expression "${this}" cannot be assigned to.`);
  }
}

export class CallFunctionExpression {
  public bind: undefined;
  public unbind: undefined;
  public expression: undefined;

  public args: Array<IsAssignmentExpression>;
  public func: LeftHandSideExpression;
  constructor(func: LeftHandSideExpression, args: Array<IsAssignmentExpression>) {
    this.func = func;
    this.args = args;
  }

  public evaluate(scope: Scope, lookupFunctions: LookupFunctions, flags: BindingFlags): any {
    const func = this.func.evaluate(scope, lookupFunctions, flags);
    if (typeof func === 'function') {
      return func.apply(null, evalList(scope, this.args, lookupFunctions, flags));
    }
    if (!(flags & BindingFlags.mustEvaluate) && (func === null || func === undefined)) {
      return undefined;
    }
    throw new Error(`${this.func} is not a function`);
  }

  public accept(visitor: any): any {
    return visitor.visitCallFunction(this);
  }

  public connect(binding: Binding, scope: Scope, flags: BindingFlags): void {
    this.func.connect(binding, scope, flags);
    const func = this.func.evaluate(scope, <any>undefined, flags);
    if (typeof func === 'function') {
      const args = this.args;
      let i = args.length;
      while (i--) {
        args[i].connect(binding, scope, flags);
      }
    }
  }

  public assign(scope: Scope, value: any, lookupFunctions: LookupFunctions, flags: BindingFlags): any {
    throw new Error(`Binding expression "${this}" cannot be assigned to.`);
  }
}

export class BinaryExpression {
  public bind: undefined;
  public unbind: undefined;
  public expression: undefined;

  public operation: string;
  public left: IsBinaryExpression;
  public right: IsBinaryExpression;
  constructor(operation: string, left: IsBinaryExpression, right: IsBinaryExpression) {
    this.operation = operation;
    this.left = left;
    this.right = right;
  }

  public evaluate(scope: Scope, lookupFunctions: LookupFunctions, flags: BindingFlags): string | number | boolean | null {
    const left = this.left.evaluate(scope, lookupFunctions, flags);

    switch (this.operation) {
      case '&&':
        return left && this.right.evaluate(scope, lookupFunctions, flags);
      case '||':
        return left || this.right.evaluate(scope, lookupFunctions, flags);
      default:
    }

    const right = this.right.evaluate(scope, lookupFunctions, flags);

    switch (this.operation) {
      case '==':
        return left == right;
      case '===':
        return left === right;
      case '!=':
        return left != right;
      case '!==':
        return left !== right;
      case 'instanceof':
        return typeof right === 'function' && left instanceof right;
      case 'in':
        return typeof right === 'object' && right !== null && left in right;
      default:
    }

    // Null check for the operations.
    if (left === null || right === null || left === undefined || right === undefined) {
      switch (this.operation) {
        case '+':
          if (left !== null && left !== undefined) return left;
          if (right !== null && right !== undefined) return right;
          return 0;
        case '-':
          if (left !== null && left !== undefined) return left;
          if (right !== null && right !== undefined) return 0 - right;
          return 0;
        default:
      }

      return null;
    }

    switch (this.operation) {
      case '+':
        return autoConvertAdd(left, right);
      case '-':
        return left - right;
      case '*':
        return left * right;
      case '/':
        return left / right;
      case '%':
        return left % right;
      case '<':
        return left < right;
      case '>':
        return left > right;
      case '<=':
        return left <= right;
      case '>=':
        return left >= right;
      default:
    }

    throw new Error(`Internal error [${this.operation}] not handled`);
  }

  public accept(visitor: any): any {
    return visitor.visitBinary(this);
  }

  public connect(binding: Binding, scope: Scope, flags: BindingFlags): void {
    this.left.connect(binding, scope, flags);
    const left = this.left.evaluate(scope, <any>undefined, flags);
    if ((this.operation === '&&' && !left) || (this.operation === '||' && left)) {
      return;
    }
    this.right.connect(binding, scope, flags);
  }

  public assign(scope: Scope, value: any, lookupFunctions: LookupFunctions, flags: BindingFlags): any {
    throw new Error(`Binding expression "${this}" cannot be assigned to.`);
  }
}

export class UnaryExpression {
  public bind: undefined;
  public unbind: undefined;

  public expression:  LeftHandSideExpression;
  public operation: 'void' | 'typeof' | '!' | '-' | '+';
  constructor(operation: 'void' | 'typeof' | '!' | '-' | '+', expression: LeftHandSideExpression) {
    this.operation = operation;
    this.expression = expression;
  }

  public evaluate(scope: Scope, lookupFunctions: LookupFunctions, flags: BindingFlags): any {
    switch (this.operation) {
      case 'void':
        return void this.expression.evaluate(scope, lookupFunctions, flags);
      case 'typeof':
        return typeof this.expression.evaluate(scope, lookupFunctions, flags);
      case '!':
        return !this.expression.evaluate(scope, lookupFunctions, flags);
      case '-':
        return -this.expression.evaluate(scope, lookupFunctions, flags);
      case '+':
        return +this.expression.evaluate(scope, lookupFunctions, flags);
      default:
    }

    throw new Error(`Internal error [${this.operation}] not handled`);
  }

  public accept(visitor: any): any {
    return visitor.visitPrefix(this);
  }

  public connect(binding: Binding, scope: Scope, flags: BindingFlags): void {
    this.expression.connect(binding, scope, flags);
  }

  public assign(scope: Scope, value: any, lookupFunctions: LookupFunctions, flags: BindingFlags): any {
    throw new Error(`Binding expression "${this}" cannot be assigned to.`);
  }
}

export class PrimitiveLiteralExpression {
  public bind: undefined;
  public unbind: undefined;
  public expression: undefined;

  public value: string | number | boolean | null | undefined;
  constructor(value: string | number | boolean | null | undefined) {
    this.value = value;
  }

  public evaluate(scope: Scope, lookupFunctions: LookupFunctions, flags: BindingFlags): string | number | boolean | null | undefined {
    return this.value;
  }

  public accept(visitor: any): any {
    return visitor.visitLiteralPrimitive(this);
  }

  public connect(binding: Binding, scope: Scope, flags: BindingFlags): void {}

  public assign(scope: Scope, value: any, lookupFunctions: LookupFunctions, flags: BindingFlags): any {
    throw new Error(`Binding expression "${this}" cannot be assigned to.`);
  }
}

export class TemplateExpression {
  public bind: undefined;
  public unbind: undefined;
  public expression: undefined;

  public expressions: Array<IsAssignmentExpression>;
  public func?: LeftHandSideExpression;
  public cooked: Array<string> & { raw?: Array<string> };
  public length: number;
  public tagged: boolean;
  constructor(cooked: Array<string>, expressions?: Array<IsAssignmentExpression>, raw?: Array<string>, func?: LeftHandSideExpression) {
    this.cooked = cooked;
    this.expressions = expressions || [];
    this.length = this.expressions.length;
    this.tagged = func !== undefined;
    if (this.tagged) {
      this.cooked.raw = raw;
      this.func = func;
    }
  }

  public evaluate(scope: Scope, lookupFunctions: LookupFunctions, flags: BindingFlags): string {
    const results = new Array(this.length);
    for (let i = 0; i < this.length; i++) {
      results[i] = this.expressions[i].evaluate(scope, lookupFunctions, flags);
    }
    if (this.func) {
      const func = this.func.evaluate(scope, lookupFunctions, flags);
      if (typeof func !== 'function') {
        throw new Error(`${this.func} is not a function`);
      }
      return func.call(null, this.cooked, ...results);
    }
    let result = this.cooked[0];
    for (let i = 0; i < this.length; i++) {
      result = String.prototype.concat(result, results[i], this.cooked[i + 1]);
    }
    return result;
  }

  public accept(visitor: any): any {
    return visitor.visitLiteralTemplate(this);
  }

  public connect(binding: Binding, scope: Scope, flags: BindingFlags): void {
    for (let i = 0; i < this.length; i++) {
      this.expressions[i].connect(binding, scope, flags);
    }
    if (this.func) {
      this.func.connect(binding, scope, flags);
    }
  }

  public assign(scope: Scope, value: any, lookupFunctions: LookupFunctions, flags: BindingFlags): any {
    throw new Error(`Binding expression "${this}" cannot be assigned to.`);
  }
}

export class ArrayLiteralExpression {
  public bind: undefined;
  public unbind: undefined;
  public expression: undefined;

  public elements: Array<IsAssignmentExpression>;
  constructor(elements: Array<IsAssignmentExpression>) {
    this.elements = elements;
  }

  public evaluate(scope: Scope, lookupFunctions: LookupFunctions, flags: BindingFlags): any[] {
    const elements = this.elements;
    const result = [];

    for (let i = 0, length = elements.length; i < length; ++i) {
      result[i] = elements[i].evaluate(scope, lookupFunctions, flags);
    }

    return result;
  }

  public accept(visitor: any): any {
    return visitor.visitLiteralArray(this);
  }

  public connect(binding: Binding, scope: Scope, flags: BindingFlags): void {
    const length = this.elements.length;
    for (let i = 0; i < length; i++) {
      this.elements[i].connect(binding, scope, flags);
    }
  }

  public assign(scope: Scope, value: any, lookupFunctions: LookupFunctions, flags: BindingFlags): any {
    throw new Error(`Binding expression "${this}" cannot be assigned to.`);
  }
}

export class ObjectLiteralExpression {
  public bind: undefined;
  public unbind: undefined;
  public expression: undefined;

  public keys: Array<string | number>;
  public values: Array<IsAssignmentExpression>;
  constructor(keys: Array<string | number>, values: Array<IsAssignmentExpression>) {
    this.keys = keys;
    this.values = values;
  }

  public evaluate(scope: Scope, lookupFunctions: LookupFunctions, flags: BindingFlags): { [key: string]: any } {
    const instance: any = {};
    const keys = this.keys;
    const values = this.values;

    for (let i = 0, length = keys.length; i < length; ++i) {
      instance[keys[i]] = values[i].evaluate(scope, lookupFunctions, flags);
    }

    return instance;
  }

  public accept(visitor: any): any {
    return visitor.visitLiteralObject(this);
  }

  public connect(binding: Binding, scope: Scope, flags: BindingFlags): void {
    const length = this.keys.length;
    for (let i = 0; i < length; i++) {
      this.values[i].connect(binding, scope, flags);
    }
  }

  public assign(scope: Scope, value: any, lookupFunctions: LookupFunctions, flags: BindingFlags): any {
    throw new Error(`Binding expression "${this}" cannot be assigned to.`);
  }
}

/// Evaluate the [list] in context of the [scope].
function evalList(scope: Scope, list: any[], lookupFunctions: LookupFunctions, flags: BindingFlags): any[] {
  const length = list.length;
  const result = [];
  for (let i = 0; i < length; i++) {
    result[i] = list[i].evaluate(scope, lookupFunctions, flags);
  }
  return result;
}

/// Add the two arguments with automatic type conversion.
function autoConvertAdd(a: any, b: any): any {
  if (a !== null && b !== null) {
    // TODO(deboer): Support others.
    if (typeof a === 'string' && typeof b !== 'string') {
      return a + b.toString();
    }

    if (typeof a !== 'string' && typeof b === 'string') {
      return a.toString() + b;
    }

    return a + b;
  }

  if (a !== null) {
    return a;
  }

  if (b !== null) {
    return b;
  }

  return 0;
}

function getFunction(obj: any, name: string, mustExist: number | boolean): Function | null {
  const func = obj === null || obj === undefined ? null : obj[name];
  if (typeof func === 'function') {
    return func;
  }
  if (!mustExist && (func === null || func === undefined)) {
    return null;
  }
  throw new Error(`${name} is not a function`);
}

function getKeyed(obj: any, key: any): any {
  if (Array.isArray(obj)) {
    return obj[parseInt(key, 10)];
  } else if (obj) {
    return obj[key];
  } else if (obj === null || obj === undefined) {
    return undefined;
  }

  return obj[key];
}

function setKeyed(obj: any, key: any, value: any): any {
  if (Array.isArray(obj)) {
    const index = parseInt(key, 10);

    if (obj.length <= index) {
      obj.length = index + 1;
    }

    obj[index] = value;
  } else {
    obj[key] = value;
  }

  return value;
}

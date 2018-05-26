import { getContextFor } from './scope';
import { connectBindingToSignal } from './signals';
import { Scope, OverrideContext, LookupFunctions } from './types';

export class Expression {
  public isChain: boolean;
  public isAssignable: boolean;
  constructor() {
    this.isChain = false;
    this.isAssignable = false;
  }

  public evaluate(scope: Scope, lookupFunctions: LookupFunctions, args?: any): any {
    throw new Error(`Binding expression "${this}" cannot be evaluated.`);
  }

  public assign(scope: Scope, value: any, lookupFunctions: LookupFunctions): any {
    throw new Error(`Binding expression "${this}" cannot be assigned to.`);
  }
}

export class Chain extends Expression {
  public expressions: Expression[];
  constructor(expressions: Expression[]) {
    super();

    this.expressions = expressions;
    this.isChain = true;
  }

  public evaluate(scope: Scope, lookupFunctions: LookupFunctions): any {
    let result;
    const expressions = this.expressions;
    let last;

    for (let i = 0, length = expressions.length; i < length; ++i) {
      last = expressions[i].evaluate(scope, lookupFunctions);

      if (last !== null) {
        result = last;
      }
    }

    return result;
  }

  public accept(visitor: any): any {
    return visitor.visitChain(this);
  }
}

export class BindingBehavior extends Expression {
  public expression: any;
  public name: any;
  public args: any;
  constructor(expression: any, name: any, args: any) {
    super();

    this.expression = expression;
    this.name = name;
    this.args = args;
  }

  public evaluate(scope: Scope, lookupFunctions: LookupFunctions): any {
    return this.expression.evaluate(scope, lookupFunctions);
  }

  public assign(scope: Scope, value: any, lookupFunctions: LookupFunctions): any {
    return this.expression.assign(scope, value, lookupFunctions);
  }

  public accept(visitor: any): any {
    return visitor.visitBindingBehavior(this);
  }

  public connect(binding: any, scope: Scope): any {
    this.expression.connect(binding, scope);
  }

  public bind(binding: any, scope: Scope, lookupFunctions: LookupFunctions): any {
    if (this.expression.expression && this.expression.bind) {
      this.expression.bind(binding, scope, lookupFunctions);
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
    behavior.bind.apply(behavior, [binding, scope].concat(evalList(scope, this.args, binding.lookupFunctions)));
  }

  public unbind(binding: any, scope: Scope): any {
    const behaviorKey = `behavior-${this.name}`;
    binding[behaviorKey].unbind(binding, scope);
    binding[behaviorKey] = null;
    if (this.expression.expression && this.expression.unbind) {
      this.expression.unbind(binding, scope);
    }
  }
}

export class ValueConverter extends Expression {
  public expression: any;
  public name: any;
  public args: any;
  public allArgs: any[];
  constructor(expression: any, name: any, args: any) {
    super();

    this.expression = expression;
    this.name = name;
    this.args = args;
    this.allArgs = [expression].concat(args);
  }

  public evaluate(scope: Scope, lookupFunctions: LookupFunctions): any {
    const converter = lookupFunctions.valueConverters(this.name);
    if (!converter) {
      throw new Error(`No ValueConverter named "${this.name}" was found!`);
    }

    if ('toView' in converter) {
      return converter.toView.apply(converter, evalList(scope, this.allArgs, lookupFunctions));
    }

    return this.allArgs[0].evaluate(scope, lookupFunctions);
  }

  public assign(scope: Scope, value: any, lookupFunctions: LookupFunctions): any {
    const converter = lookupFunctions.valueConverters(this.name);
    if (!converter) {
      throw new Error(`No ValueConverter named "${this.name}" was found!`);
    }

    if ('fromView' in converter) {
      value = converter.fromView.apply(converter, [value].concat(evalList(scope, this.args, lookupFunctions)));
    }

    return this.allArgs[0].assign(scope, value, lookupFunctions);
  }

  public accept(visitor: any): any {
    return visitor.visitValueConverter(this);
  }

  public connect(binding: any, scope: Scope): any {
    const expressions = this.allArgs;
    let i = expressions.length;
    while (i--) {
      expressions[i].connect(binding, scope);
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

export class Assign extends Expression {
  public target: any;
  public value: any;
  constructor(target: any, value: any) {
    super();

    this.target = target;
    this.value = value;
    this.isAssignable = true;
  }

  public evaluate(scope: Scope, lookupFunctions: LookupFunctions): any {
    return this.target.assign(scope, this.value.evaluate(scope, lookupFunctions));
  }

  public accept(vistor: any): any {
    vistor.visitAssign(this);
  }

  // tslint:disable-next-line:no-empty
  public connect(binding: any, scope: Scope): any {}

  public assign(scope: Scope, value: any): any {
    this.value.assign(scope, value);
    this.target.assign(scope, value);
  }
}

export class Conditional extends Expression {
  public condition: any;
  public yes: any;
  public no: any;
  constructor(condition: any, yes: any, no: any) {
    super();

    this.condition = condition;
    this.yes = yes;
    this.no = no;
  }

  public evaluate(scope: Scope, lookupFunctions: LookupFunctions): any {
    return !!this.condition.evaluate(scope, lookupFunctions)
      ? this.yes.evaluate(scope, lookupFunctions)
      : this.no.evaluate(scope, lookupFunctions);
  }

  public accept(visitor: any): any {
    return visitor.visitConditional(this);
  }

  public connect(binding: any, scope: Scope): any {
    this.condition.connect(binding, scope);
    if (this.condition.evaluate(scope)) {
      this.yes.connect(binding, scope);
    } else {
      this.no.connect(binding, scope);
    }
  }
}

export class AccessThis extends Expression {
  public ancestor: any;
  constructor(ancestor: any) {
    super();
    this.ancestor = ancestor;
  }

  public evaluate(scope: Scope, lookupFunctions: LookupFunctions): any {
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

  public connect(binding: any, scope: Scope): any {}
}

export class AccessScope extends Expression {
  public name: any;
  public ancestor: any;
  constructor(name: any, ancestor: any) {
    super();

    this.name = name;
    this.ancestor = ancestor;
    this.isAssignable = true;
  }

  public evaluate(scope: Scope, lookupFunctions: LookupFunctions): any {
    const context = getContextFor(this.name, scope, this.ancestor);
    return context[this.name];
  }

  public assign(scope: Scope, value: any): any {
    const context = getContextFor(this.name, scope, this.ancestor);
    return context ? (context[this.name] = value) : undefined;
  }

  public accept(visitor: any): any {
    return visitor.visitAccessScope(this);
  }

  public connect(binding: any, scope: Scope): any {
    const context = getContextFor(this.name, scope, this.ancestor);
    binding.observeProperty(context, this.name);
  }
}

export class AccessMember extends Expression {
  public name: any;
  public object: any;
  constructor(object: any, name: any) {
    super();

    this.object = object;
    this.name = name;
    this.isAssignable = true;
  }

  public evaluate(scope: Scope, lookupFunctions: LookupFunctions): any {
    const instance = this.object.evaluate(scope, lookupFunctions);
    return instance === null || instance === undefined ? instance : instance[this.name];
  }

  public assign(scope: Scope, value: any): any {
    let instance = this.object.evaluate(scope);

    if (instance === null || instance === undefined) {
      instance = {};
      this.object.assign(scope, instance);
    }

    instance[this.name] = value;
    return value;
  }

  public accept(visitor: any): any {
    return visitor.visitAccessMember(this);
  }

  public connect(binding: any, scope: Scope): any {
    this.object.connect(binding, scope);
    const obj = this.object.evaluate(scope);
    if (obj) {
      binding.observeProperty(obj, this.name);
    }
  }
}

export class AccessKeyed extends Expression {
  public object: any;
  public key: any;
  constructor(object: any, key: any) {
    super();

    this.object = object;
    this.key = key;
    this.isAssignable = true;
  }

  public evaluate(scope: Scope, lookupFunctions: LookupFunctions): any {
    const instance = this.object.evaluate(scope, lookupFunctions);
    const lookup = this.key.evaluate(scope, lookupFunctions);
    return getKeyed(instance, lookup);
  }

  public assign(scope: Scope, value: any): any {
    const instance = this.object.evaluate(scope);
    const lookup = this.key.evaluate(scope);
    return setKeyed(instance, lookup, value);
  }

  public accept(visitor: any): any {
    return visitor.visitAccessKeyed(this);
  }

  public connect(binding: any, scope: Scope): any {
    this.object.connect(binding, scope);
    const obj = this.object.evaluate(scope);
    if (obj instanceof Object) {
      this.key.connect(binding, scope);
      const key = this.key.evaluate(scope);
      // observe the property represented by the key as long as it's not an array
      // being accessed by an integer key which would require dirty-checking.
      if (key !== null && key !== undefined && !(Array.isArray(obj) && typeof key === 'number')) {
        binding.observeProperty(obj, key);
      }
    }
  }
}

export class CallScope extends Expression {
  public name: any;
  public args: any;
  public ancestor: any;
  constructor(name: any, args: any, ancestor: any) {
    super();

    this.name = name;
    this.args = args;
    this.ancestor = ancestor;
  }

  public evaluate(scope: Scope, lookupFunctions: LookupFunctions, mustEvaluate: any): any {
    const args = evalList(scope, this.args, lookupFunctions);
    const context = getContextFor(this.name, scope, this.ancestor);
    const func = getFunction(context, this.name, mustEvaluate);
    if (func) {
      return func.apply(context, args);
    }
    return undefined;
  }

  public accept(visitor: any): any {
    return visitor.visitCallScope(this);
  }

  public connect(binding: any, scope: Scope): any {
    const args = this.args;
    let i = args.length;
    while (i--) {
      args[i].connect(binding, scope);
    }
  }
}

export class CallMember extends Expression {
  public name: any;
  public args: any;
  public object: any;
  constructor(object: any, name: any, args: any) {
    super();

    this.object = object;
    this.name = name;
    this.args = args;
  }

  public evaluate(scope: Scope, lookupFunctions: LookupFunctions, mustEvaluate: any): any {
    const instance = this.object.evaluate(scope, lookupFunctions);
    const args = evalList(scope, this.args, lookupFunctions);
    const func = getFunction(instance, this.name, mustEvaluate);
    if (func) {
      return func.apply(instance, args);
    }
    return undefined;
  }

  public accept(visitor: any): any {
    return visitor.visitCallMember(this);
  }

  public connect(binding: any, scope: Scope): any {
    this.object.connect(binding, scope);
    const obj = this.object.evaluate(scope);
    if (getFunction(obj, this.name, false)) {
      const args = this.args;
      let i = args.length;
      while (i--) {
        args[i].connect(binding, scope);
      }
    }
  }
}

export class CallFunction extends Expression {
  public args: any;
  public func: any;
  constructor(func: any, args: any) {
    super();

    this.func = func;
    this.args = args;
  }

  public evaluate(scope: Scope, lookupFunctions: LookupFunctions, mustEvaluate: any): any {
    const func = this.func.evaluate(scope, lookupFunctions);
    if (typeof func === 'function') {
      return func.apply(null, evalList(scope, this.args, lookupFunctions));
    }
    if (!mustEvaluate && (func === null || func === undefined)) {
      return undefined;
    }
    throw new Error(`${this.func} is not a function`);
  }

  public accept(visitor: any): any {
    return visitor.visitCallFunction(this);
  }

  public connect(binding: any, scope: Scope): any {
    this.func.connect(binding, scope);
    const func = this.func.evaluate(scope);
    if (typeof func === 'function') {
      const args = this.args;
      let i = args.length;
      while (i--) {
        args[i].connect(binding, scope);
      }
    }
  }
}

export class Binary extends Expression {
  public operation: any;
  public left: any;
  public right: any;
  constructor(operation: any, left: any, right: any) {
    super();

    this.operation = operation;
    this.left = left;
    this.right = right;
  }

  public evaluate(scope: Scope, lookupFunctions: LookupFunctions): any {
    const left = this.left.evaluate(scope, lookupFunctions);

    switch (this.operation) {
      case '&&':
        return left && this.right.evaluate(scope, lookupFunctions);
      case '||':
        return left || this.right.evaluate(scope, lookupFunctions);
      default:
    }

    const right = this.right.evaluate(scope, lookupFunctions);

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
      case '^':
        return left ^ right;
      default:
    }

    throw new Error(`Internal error [${this.operation}] not handled`);
  }

  public accept(visitor: any): any {
    return visitor.visitBinary(this);
  }

  public connect(binding: any, scope: Scope): any {
    this.left.connect(binding, scope);
    const left = this.left.evaluate(scope);
    if ((this.operation === '&&' && !left) || (this.operation === '||' && left)) {
      return;
    }
    this.right.connect(binding, scope);
  }
}

export class PrefixNot extends Expression {
  public expression: any;
  public operation: any;
  constructor(operation: any, expression: any) {
    super();

    this.operation = operation;
    this.expression = expression;
  }

  public evaluate(scope: Scope, lookupFunctions: LookupFunctions): any {
    return !this.expression.evaluate(scope, lookupFunctions);
  }

  public accept(visitor: any): any {
    return visitor.visitPrefix(this);
  }

  public connect(binding: any, scope: Scope): any {
    this.expression.connect(binding, scope);
  }
}

export class PrefixUnary extends Expression {
  public expression: any;
  public operation: any;
  constructor(operation: any, expression: any) {
    super();

    this.operation = operation;
    this.expression = expression;
  }

  public evaluate(scope: Scope, lookupFunctions: LookupFunctions): any {
    switch (this.operation) {
      case 'typeof':
        return typeof this.expression.evaluate(scope, lookupFunctions);
      case 'void':
        return void this.expression.evaluate(scope, lookupFunctions);
      default:
    }

    throw new Error(`Internal error [${this.operation}] not handled`);
  }

  public accept(visitor: any): any {
    return visitor.visitPrefix(this);
  }

  public connect(binding: any, scope: Scope): any {
    this.expression.connect(binding, scope);
  }
}

export class LiteralPrimitive extends Expression {
  public value: any;
  constructor(value: any) {
    super();

    this.value = value;
  }

  public evaluate(scope: Scope, lookupFunctions: LookupFunctions): any {
    return this.value;
  }

  public accept(visitor: any): any {
    return visitor.visitLiteralPrimitive(this);
  }

  public connect(binding: any, scope: Scope): any {}
}

export class LiteralString extends Expression {
  public value: any;
  constructor(value: any) {
    super();

    this.value = value;
  }

  public evaluate(scope: Scope, lookupFunctions: LookupFunctions): any {
    return this.value;
  }

  public accept(visitor: any): any {
    return visitor.visitLiteralString(this);
  }

  public connect(binding: any, scope: Scope): any {}
}

export class LiteralTemplate extends Expression {
  public expressions: any;
  public func: any;
  public cooked: any;
  public length: any;
  public tagged: boolean;
  constructor(cooked: any, expressions?: any, raw?: any, func?: any) {
    super();
    this.cooked = cooked;
    this.expressions = expressions || [];
    this.length = this.expressions.length;
    this.tagged = func !== undefined;
    if (this.tagged) {
      this.cooked.raw = raw;
      this.func = func;
    }
  }

  public evaluate(scope: Scope, lookupFunctions: LookupFunctions): any {
    const results = new Array(this.length);
    for (let i = 0; i < this.length; i++) {
      results[i] = this.expressions[i].evaluate(scope, lookupFunctions);
    }
    if (this.tagged) {
      const func = this.func.evaluate(scope, lookupFunctions);
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

  public connect(binding: any, scope: Scope): any {
    for (let i = 0; i < this.length; i++) {
      this.expressions[i].connect(binding, scope);
    }
    if (this.tagged) {
      this.func.connect(binding, scope);
    }
  }
}

export class LiteralArray extends Expression {
  public elements: any;
  constructor(elements: any) {
    super();

    this.elements = elements;
  }

  public evaluate(scope: Scope, lookupFunctions: LookupFunctions): any {
    const elements = this.elements;
    const result = [];

    for (let i = 0, length = elements.length; i < length; ++i) {
      result[i] = elements[i].evaluate(scope, lookupFunctions);
    }

    return result;
  }

  public accept(visitor: any): any {
    return visitor.visitLiteralArray(this);
  }

  public connect(binding: any, scope: Scope): any {
    const length = this.elements.length;
    for (let i = 0; i < length; i++) {
      this.elements[i].connect(binding, scope);
    }
  }
}

export class LiteralObject extends Expression {
  public keys: any;
  public values: any;
  constructor(keys: any, values: any) {
    super();

    this.keys = keys;
    this.values = values;
  }

  public evaluate(scope: Scope, lookupFunctions: LookupFunctions): any {
    const instance: any = {};
    const keys = this.keys;
    const values = this.values;

    for (let i = 0, length = keys.length; i < length; ++i) {
      instance[keys[i]] = values[i].evaluate(scope, lookupFunctions);
    }

    return instance;
  }

  public accept(visitor: any): any {
    return visitor.visitLiteralObject(this);
  }

  public connect(binding: any, scope: Scope): any {
    const length = this.keys.length;
    for (let i = 0; i < length; i++) {
      this.values[i].connect(binding, scope);
    }
  }
}

/// Evaluate the [list] in context of the [scope].
function evalList(scope: Scope, list: any, lookupFunctions: LookupFunctions): any {
  const length = list.length;
  const result = [];
  for (let i = 0; i < length; i++) {
    result[i] = list[i].evaluate(scope, lookupFunctions);
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

function getFunction(obj: any, name: any, mustExist: any): any {
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

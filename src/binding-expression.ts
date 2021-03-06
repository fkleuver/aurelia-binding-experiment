import { connectable } from './connectable-binding';
import { enqueueBindingConnect } from './connect-queue';
import { sourceContext, targetContext } from './call-context';
import { ObserverLocator } from './observer-locator';
import { Expression } from './ast';
import { bindingMode, LookupFunctions, BindingFlags, Observer, Connectable, Scope } from './types';

export class BindingExpression {
  public observerLocator: ObserverLocator;
  public targetProperty: string;
  public sourceExpression: Expression;
  public mode: bindingMode;
  public lookupFunctions: LookupFunctions;
  public attribute: string;
  public discrete: boolean;

  constructor(
    observerLocator: ObserverLocator,
    targetProperty: string,
    sourceExpression: Expression,
    mode: bindingMode,
    lookupFunctions: LookupFunctions,
    attribute: string) {

    this.observerLocator = observerLocator;
    this.targetProperty = targetProperty;
    this.sourceExpression = sourceExpression;
    this.mode = mode;
    this.lookupFunctions = lookupFunctions;
    this.attribute = attribute;
    this.discrete = false;
  }

  public createBinding(target: any): Binding {
    return new Binding(
      this.observerLocator,
      this.sourceExpression,
      target,
      this.targetProperty,
      this.mode,
      this.lookupFunctions
    );
  }
}

@connectable()
export class Binding implements Connectable {
  /*@internal*/
  public __connectQueueId: number;
  [key: string]: any;
  public observerLocator: ObserverLocator;
  public sourceExpression: Expression;
  public target: any;
  public targetProperty: string;
  public mode: bindingMode;
  public lookupFunctions: LookupFunctions;

  public targetObserver: Observer & { [key: string]: any };
  public source: any;
  public isBound: boolean;

  public observeProperty: (obj: any, propertyName: string) => void;
  public observeArray: (array: Array<any>) => void;
  public unobserve: (all: boolean) => void;
  public addObserver: (observer: Observer) => void;

  private _version: number;

  constructor(
    observerLocator: ObserverLocator,
    sourceExpression: Expression,
    target: any,
    targetProperty: string,
    mode: bindingMode,
    lookupFunctions: LookupFunctions) {

    this.observerLocator = observerLocator;
    this.sourceExpression = sourceExpression;
    this.target = target;
    this.targetProperty = targetProperty;
    this.mode = mode;
    this.lookupFunctions = lookupFunctions;
  }

  public updateTarget(value: any): void {
    this.targetObserver.setValue(value, this.target, this.targetProperty);
  }

  public updateSource(value: any, flags: BindingFlags): void {
    this.sourceExpression.assign(this.source, value, this.lookupFunctions, flags);
  }

  public call(context: any, newValue: any, oldValue: any, flags: BindingFlags): void {
    if (!this.isBound) {
      return;
    }
    if (context === sourceContext) {
      oldValue = this.targetObserver.getValue(this.target, this.targetProperty);
      newValue = this.sourceExpression.evaluate(this.source, this.lookupFunctions, flags);
      if (newValue !== oldValue) {
        this.updateTarget(newValue);
      }
      if (this.mode !== bindingMode.oneTime) {
        this._version++;
        this.sourceExpression.connect(this, this.source, flags);
        this.unobserve(false);
      }
      return;
    }
    if (context === targetContext) {
      if (newValue !== this.sourceExpression.evaluate(this.source, this.lookupFunctions, flags)) {
        this.updateSource(newValue, flags);
      }
      return;
    }
    throw new Error(`Unexpected call context ${context}`);
  }

  public bind(source: Scope, flags: BindingFlags): void {
    if (this.isBound) {
      if (this.source === source) {
        return;
      }
      this.unbind(flags);
    }
    this.isBound = true;
    this.source = source;

    if (this.sourceExpression.bind) {
      this.sourceExpression.bind(this, source, this.lookupFunctions, flags);
    }

    const mode = this.mode;
    if (!this.targetObserver) {
      if (mode & bindingMode.fromView) {
        this.targetObserver = this.observerLocator.getObserver(this.target, this.targetProperty);
      } else {
        this.targetObserver = this.observerLocator.getAccessor(this.target, this.targetProperty);
      }
    }

    if ('bind' in this.targetObserver) {
      this.targetObserver.bind();
    }
    if (this.mode !== bindingMode.fromView) {
      const value = this.sourceExpression.evaluate(source, this.lookupFunctions, flags);
      this.updateTarget(value);
    }

    if (mode === bindingMode.oneTime) {
      return;
    } else if (mode === bindingMode.toView) {
      enqueueBindingConnect(this, flags);
    } else if (mode === bindingMode.twoWay) {
      this.sourceExpression.connect(this, source, flags);
      this.targetObserver.subscribe(targetContext, this);
    } else if (mode === bindingMode.fromView) {
      this.targetObserver.subscribe(targetContext, this);
    }
  }

  public unbind(flags: BindingFlags): void {
    if (!this.isBound) {
      return;
    }
    this.isBound = false;
    if (this.sourceExpression.unbind) {
      this.sourceExpression.unbind(this, this.source, flags);
    }
    this.source = null;
    if ('unbind' in this.targetObserver) {
      this.targetObserver.unbind();
    }
    if (this.targetObserver.unsubscribe) {
      this.targetObserver.unsubscribe(targetContext, this);
    }
    this.unobserve(true);
  }

  public connect(evaluate: boolean, flags: BindingFlags): void {
    if (!this.isBound) {
      return;
    }
    if (evaluate) {
      const value = this.sourceExpression.evaluate(this.source, this.lookupFunctions, flags);
      this.updateTarget(value);
    }
    this.sourceExpression.connect(this, this.source, flags);
  }
}

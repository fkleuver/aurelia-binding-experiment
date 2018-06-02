import { ObserverLocator } from './observer-locator';
import { Parser } from './parser';
import { BindingExpression } from './binding-expression';
import { createOverrideContext } from './scope';
import { Expression } from './ast';
import { bindingMode, LookupFunctions, Observer, Subscribeable, Callable, Subscription } from './types';

const emptyLookupFunctions = {
  bindingBehaviors: (name: string): any => null,
  valueConverters: (name: string): any => null
};

export class BindingEngine {
  public static inject: Array<Function> = [ObserverLocator, Parser];

  public observerLocator: ObserverLocator;
  public parser: Parser;
  constructor(observerLocator: ObserverLocator, parser: Parser) {
    this.observerLocator = observerLocator;
    this.parser = parser;
  }

  public createBindingExpression(
    targetProperty: string,
    sourceExpression: string,
    mode: bindingMode = bindingMode.toView,
    lookupFunctions: LookupFunctions = emptyLookupFunctions
  ): BindingExpression {
    return new BindingExpression(
      this.observerLocator,
      targetProperty,
      this.parser.parse(sourceExpression),
      mode,
      lookupFunctions,
      undefined as any
    );
  }

  public propertyObserver(obj: any, propertyName: string): Subscribeable {
    return {
      subscribe: (callback: Callable): Subscription => {
        const observer = this.observerLocator.getObserver(obj, propertyName);
        observer.subscribe(observer, callback);
        return {
          dispose: () => observer.unsubscribe(observer, callback)
        };
      }
    };
  }

  public collectionObserver(collection: Array<any> | Set<any> | Map<any, any>): Subscribeable {
    return {
      subscribe: (callback: Callable): Subscription => {
        let observer: Observer;
        if (collection instanceof Array) {
          observer = this.observerLocator.getArrayObserver(collection);
        } else if (collection instanceof Map) {
          observer = this.observerLocator.getMapObserver(collection);
        } else if (collection instanceof Set) {
          observer = this.observerLocator.getSetObserver(collection);
        } else {
          throw new Error('collection must be an instance of Array, Map or Set.');
        }
        observer.subscribe(observer, callback);
        return {
          dispose: () => observer.unsubscribe(observer, callback)
        };
      }
    };
  }

  public parseExpression(expression: string): Expression {
    return this.parser.parse(expression);
  }

  public registerAdapter(adapter: any): void {
    this.observerLocator.addAdapter(adapter);
  }
}

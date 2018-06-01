import { DOM } from 'aurelia-pal';
import { TaskQueue } from 'aurelia-task-queue';
import { EventManager } from './event-manager';
import { Parser } from './parser';
import { SetterObserver, PrimitiveObserver, propertyAccessor } from './property-observation';
import { getArrayObserver } from './array-observation';
import { getMapObserver } from './map-observation';
import { getSetObserver } from './set-observation';

export class ObserverLocator {
  public static inject: Function[] = [TaskQueue, EventManager, Parser];
  public taskQueue: TaskQueue;
  public eventManager: EventManager;
  public parser: Parser;
  public adapters: any[];

  constructor(taskQueue: any, eventManager: any, parser: any) {
    this.taskQueue = taskQueue;
    this.eventManager = eventManager;
    this.parser = parser;
    this.adapters = [];
  }

  public getObserver(obj: any, propertyName: string): any {
    let observersLookup = obj.__observers__;
    let observer;

    if (observersLookup && propertyName in observersLookup) {
      return observersLookup[propertyName];
    }

    observer = this.createPropertyObserver(obj, propertyName);

    if (!observer.doNotCache) {
      if (observersLookup === undefined) {
        observersLookup = this.getOrCreateObserversLookup(obj);
      }

      observersLookup[propertyName] = observer;
    }

    return observer;
  }

  public getOrCreateObserversLookup(obj: any): any {
    return obj.__observers__ || this.createObserversLookup(obj);
  }

  public createObserversLookup(obj: any): any {
    const value = {};

    if (
      !Reflect.defineProperty(obj, '__observers__', {
        enumerable: false,
        configurable: false,
        writable: false,
        value: value
      })
    ) {
      //this.logger.warn('Cannot add observers to object', obj);
    }

    return value;
  }

  public addAdapter(adapter: any): void {
    this.adapters.push(adapter);
  }

  public getAdapterObserver(obj: any, propertyName: string, descriptor: any): any {
    for (let i = 0, ii = this.adapters.length; i < ii; i++) {
      const adapter = this.adapters[i];
      const observer = adapter.getObserver(obj, propertyName, descriptor);
      if (observer) {
        return observer;
      }
    }
    return null;
  }

  public createPropertyObserver(obj: any, propertyName: string): any {
    let descriptor;
    let handler;
    let xlinkResult;

    if (!(obj instanceof Object)) {
      return new PrimitiveObserver(obj, propertyName);
    }

    // if (obj instanceof DOM.Element) {
    //   if (propertyName === 'class') {
    //     return new ClassObserver(obj);
    //   }
    //   if (propertyName === 'style' || propertyName === 'css') {
    //     return new StyleObserver(obj, propertyName);
    //   }
    //   handler = this.eventManager.getElementHandler(obj, propertyName);
    //   if (propertyName === 'value' && obj.tagName.toLowerCase() === 'select') {
    //     return new SelectValueObserver(obj, handler, this);
    //   }
    //   if (propertyName === 'checked' && obj.tagName.toLowerCase() === 'input') {
    //     return new CheckedObserver(obj, handler, this);
    //   }
    //   if (handler) {
    //     return new ValueAttributeObserver(obj, propertyName, handler);
    //   }
    //   xlinkResult = /^xlink:(.+)$/.exec(propertyName);
    //   if (xlinkResult) {
    //     return new XLinkAttributeObserver(obj, propertyName, xlinkResult[1]);
    //   }
    //   if (
    //     (propertyName === 'role' && (obj instanceof DOM.Element || obj instanceof DOM.SVGElement)) ||
    //     /^\w+:|^data-|^aria-/.test(propertyName) ||
    //     (obj instanceof DOM.SVGElement && this.svgAnalyzer.isStandardSvgAttribute(obj.nodeName, propertyName))
    //   ) {
    //     return new DataAttributeObserver(obj, propertyName);
    //   }
    // }

    descriptor = <any>Object.getOwnPropertyDescriptor(obj, propertyName);

    // if (hasDeclaredDependencies(descriptor)) {
    //   return createComputedObserver(obj, propertyName, descriptor, this);
    // }

    if (descriptor) {
      const existingGetterOrSetter = descriptor.get || descriptor.set;
      if (existingGetterOrSetter) {
        if (existingGetterOrSetter.getObserver) {
          return existingGetterOrSetter.getObserver(obj);
        }

        // attempt to use an adapter before resorting to dirty checking.
        const adapterObserver = this.getAdapterObserver(obj, propertyName, descriptor);
        if (adapterObserver) {
          return adapterObserver;
        }
        //return new DirtyCheckProperty(this.dirtyChecker, obj, propertyName);
      }
    }

    if (obj instanceof Array) {
      if (propertyName === 'length') {
        return this.getArrayObserver(obj).getLengthObserver();
      }

      //return new DirtyCheckProperty(this.dirtyChecker, obj, propertyName);
    } else if (obj instanceof Map) {
      if (propertyName === 'size') {
        return this.getMapObserver(obj).getLengthObserver();
      }

      //return new DirtyCheckProperty(this.dirtyChecker, obj, propertyName);
    } else if (obj instanceof Set) {
      if (propertyName === 'size') {
        return this.getSetObserver(obj).getLengthObserver();
      }

      //return new DirtyCheckProperty(this.dirtyChecker, obj, propertyName);
    }

    return new SetterObserver(this.taskQueue, obj, propertyName);
  }

  public getAccessor(obj: any, propertyName: string): any {
    if (obj instanceof DOM.Element) {
      if (
        propertyName === 'class' ||
        propertyName === 'style' ||
        propertyName === 'css' ||
        (propertyName === 'value' &&
          (obj.tagName.toLowerCase() === 'input' || obj.tagName.toLowerCase() === 'select')) ||
        (propertyName === 'checked' && obj.tagName.toLowerCase() === 'input') ||
        (propertyName === 'model' && obj.tagName.toLowerCase() === 'input') ||
        /^xlink:.+$/.exec(propertyName)
      ) {
        return this.getObserver(obj, propertyName);
      }
      // if (
      //   /^\w+:|^data-|^aria-/.test(propertyName) ||
      //   (obj instanceof DOM.SVGElement && this.svgAnalyzer.isStandardSvgAttribute(obj.nodeName, propertyName)) ||
      //   (obj.tagName.toLowerCase() === 'img' && propertyName === 'src') ||
      //   (obj.tagName.toLowerCase() === 'a' && propertyName === 'href')
      // ) {
      //   return dataAttributeAccessor;
      // }
    }
    return propertyAccessor;
  }

  public getArrayObserver(array: Array<any>): any {
    return getArrayObserver(this.taskQueue, array);
  }

  public getMapObserver(map: Map<any, any>): any {
    return getMapObserver(this.taskQueue, map);
  }

  public getSetObserver(set: Set<any>): any {
    return getSetObserver(this.taskQueue, set);
  }
}

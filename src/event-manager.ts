// @ts-check
import { DOM } from 'aurelia-pal';

//Note: path and deepPath are designed to handle v0 and v1 shadow dom specs respectively
function findOriginalEventTarget(event: any): any {
  return (event.path && event.path[0]) || (event.deepPath && event.deepPath[0]) || event.target;
}

function stopPropagation(this: any): void {
  this.standardStopPropagation();
  this.propagationStopped = true;
}

function handleCapturedEvent(event: any): void {
  event.propagationStopped = false;
  let target = findOriginalEventTarget(event);

  const orderedCallbacks = [];
  /**
   * During capturing phase, event 'bubbles' down from parent. Needs to reorder callback from root down to target
   */
  while (target) {
    if (target.capturedCallbacks) {
      const callback = target.capturedCallbacks[event.type];
      if (callback) {
        if (event.stopPropagation !== stopPropagation) {
          event.standardStopPropagation = event.stopPropagation;
          event.stopPropagation = stopPropagation;
        }
        orderedCallbacks.push(callback);
      }
    }
    target = target.parentNode;
  }
  for (let i = orderedCallbacks.length - 1; i >= 0 && !event.propagationStopped; i--) {
    const orderedCallback = orderedCallbacks[i];
    if ('handleEvent' in orderedCallback) {
      orderedCallback.handleEvent(event);
    } else {
      orderedCallback(event);
    }
  }
}

class CapturedHandlerEntry {
  public eventName: string;
  public count: number;

  constructor(eventName: string) {
    this.eventName = eventName;
    this.count = 0;
  }

  public increment(): void {
    this.count++;

    if (this.count === 1) {
      DOM.addEventListener(this.eventName, handleCapturedEvent, true);
    }
  }

  public decrement(): void {
    this.count--;

    if (this.count === 0) {
      DOM.removeEventListener(this.eventName, handleCapturedEvent, true);
    }
  }
}

function handleDelegatedEvent(event: any): void {
  event.propagationStopped = false;
  let target = findOriginalEventTarget(event);

  while (target && !event.propagationStopped) {
    if (target.delegatedCallbacks) {
      const callback = target.delegatedCallbacks[event.type];
      if (callback) {
        if (event.stopPropagation !== stopPropagation) {
          event.standardStopPropagation = event.stopPropagation;
          event.stopPropagation = stopPropagation;
        }
        if ('handleEvent' in callback) {
          callback.handleEvent(event);
        } else {
          callback(event);
        }
      }
    }

    target = target.parentNode;
  }
}

class DelegateHandlerEntry {
  public eventName: string;
  public count: number;

  constructor(eventName: string) {
    this.eventName = eventName;
    this.count = 0;
  }

  public increment(): void {
    this.count++;

    if (this.count === 1) {
      DOM.addEventListener(this.eventName, handleDelegatedEvent, false);
    }
  }

  public decrement(): void {
    this.count--;

    if (this.count === 0) {
      DOM.removeEventListener(this.eventName, handleDelegatedEvent, false);
    }
  }
}

/**
 * Enable dispose() pattern for `delegate` & `capture` commands
 */
class DelegationEntryHandler {
  public entry: any;
  public lookup: any;
  public targetEvent: any;

  constructor(entry: any, lookup: any, targetEvent: any) {
    this.entry = entry;
    this.lookup = lookup;
    this.targetEvent = targetEvent;
  }

  public dispose(): void {
    this.entry.decrement();
    this.lookup[this.targetEvent] = null;
    this.entry = this.lookup = this.targetEvent = null;
  }
}

/**
 * Enable dispose() pattern for addEventListener for `trigger`
 */
class EventHandler {
  public target: any;
  public targetEvent: any;
  public callback: any;

  constructor(target: any, targetEvent: any, callback: any) {
    this.target = target;
    this.targetEvent = targetEvent;
    this.callback = callback;
  }

  public dispose(): void {
    this.target.removeEventListener(this.targetEvent, this.callback);
    this.target = this.targetEvent = this.callback = null;
  }
}

class DefaultEventStrategy {
  public delegatedHandlers: any = {};
  public capturedHandlers: any = {};

  public subscribe(target: any, targetEvent: any, callback: any, strategy: any, disposable: any): any {
    let delegatedHandlers;
    let capturedHandlers;
    let handlerEntry: any;

    if (strategy === delegationStrategy.bubbling) {
      delegatedHandlers = this.delegatedHandlers;
      handlerEntry =
        delegatedHandlers[targetEvent] || (delegatedHandlers[targetEvent] = new DelegateHandlerEntry(targetEvent));
      const delegatedCallbacks = target.delegatedCallbacks || (target.delegatedCallbacks = {});

      handlerEntry.increment();
      delegatedCallbacks[targetEvent] = callback;

      if (disposable === true) {
        return new DelegationEntryHandler(handlerEntry, delegatedCallbacks, targetEvent);
      }

      return function(): void {
        handlerEntry.decrement();
        delegatedCallbacks[targetEvent] = null;
      };
    }
    if (strategy === delegationStrategy.capturing) {
      capturedHandlers = this.capturedHandlers;
      handlerEntry =
        capturedHandlers[targetEvent] || (capturedHandlers[targetEvent] = new CapturedHandlerEntry(targetEvent));
      const capturedCallbacks = target.capturedCallbacks || (target.capturedCallbacks = {});

      handlerEntry.increment();
      capturedCallbacks[targetEvent] = callback;

      if (disposable === true) {
        return new DelegationEntryHandler(handlerEntry, capturedCallbacks, targetEvent);
      }

      return function(): void {
        handlerEntry.decrement();
        capturedCallbacks[targetEvent] = null;
      };
    }

    target.addEventListener(targetEvent, callback);

    if (disposable === true) {
      return new EventHandler(target, targetEvent, callback);
    }

    return function(): void {
      target.removeEventListener(targetEvent, callback);
    };
  }
}

export const delegationStrategy = {
  none: 0,
  capturing: 1,
  bubbling: 2
};

export class EventManager {
  public elementHandlerLookup: any;
  public eventStrategyLookup: any;
  public defaultEventStrategy: any;

  constructor() {
    this.elementHandlerLookup = {};
    this.eventStrategyLookup = {};

    this.registerElementConfig({
      tagName: 'input',
      properties: {
        value: ['change', 'input'],
        checked: ['change', 'input'],
        files: ['change', 'input']
      }
    });

    this.registerElementConfig({
      tagName: 'textarea',
      properties: {
        value: ['change', 'input']
      }
    });

    this.registerElementConfig({
      tagName: 'select',
      properties: {
        value: ['change']
      }
    });

    this.registerElementConfig({
      tagName: 'content editable',
      properties: {
        value: ['change', 'input', 'blur', 'keyup', 'paste']
      }
    });

    this.registerElementConfig({
      tagName: 'scrollable element',
      properties: {
        scrollTop: ['scroll'],
        scrollLeft: ['scroll']
      }
    });

    this.defaultEventStrategy = new DefaultEventStrategy();
  }

  public registerElementConfig(config: any): void {
    const tagName = config.tagName.toLowerCase();
    const properties = config.properties;
    let propertyName;

    const lookup = <any>(this.elementHandlerLookup[tagName] = {});

    for (propertyName in properties) {
      if (properties.hasOwnProperty(propertyName)) {
        lookup[propertyName] = properties[propertyName];
      }
    }
  }

  public registerEventStrategy(eventName: string, strategy: any): void {
    this.eventStrategyLookup[eventName] = strategy;
  }

  public getElementHandler(target: any, propertyName: any): any {
    let tagName;
    const lookup = this.elementHandlerLookup;

    if (target.tagName) {
      tagName = target.tagName.toLowerCase();

      if (lookup[tagName] && lookup[tagName][propertyName]) {
        return new EventSubscriber(lookup[tagName][propertyName]);
      }

      if (propertyName === 'textContent' || propertyName === 'innerHTML') {
        return new EventSubscriber(lookup['content editable'].value);
      }

      if (propertyName === 'scrollTop' || propertyName === 'scrollLeft') {
        return new EventSubscriber(lookup['scrollable element'][propertyName]);
      }
    }

    return null;
  }

  public addEventListener(target: any, targetEvent: any, callbackOrListener: any, delegate: any, disposable: any): any {
    return (this.eventStrategyLookup[targetEvent] || this.defaultEventStrategy).subscribe(
      target,
      targetEvent,
      callbackOrListener,
      delegate,
      disposable
    );
  }
}

export class EventSubscriber {
  public events: any;
  public element: any;
  public handler: any;

  constructor(events: any) {
    this.events = events;
    this.element = null;
    this.handler = null;
  }

  public subscribe(element: any, callbackOrListener: any): void {
    this.element = element;
    this.handler = callbackOrListener;

    const events = this.events;
    for (let i = 0, ii = events.length; ii > i; ++i) {
      element.addEventListener(events[i], callbackOrListener);
    }
  }

  public dispose(): void {
    if (this.element === null) {
      // already disposed
      return;
    }
    const element = this.element;
    const callbackOrListener = this.handler;
    const events = this.events;
    for (let i = 0, ii = events.length; ii > i; ++i) {
      element.removeEventListener(events[i], callbackOrListener);
    }
    this.element = this.handler = null;
  }
}

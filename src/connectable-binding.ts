import { sourceContext } from './call-context';

const slotNames = new Array<string>();
const versionSlotNames = new Array<string>();

for (let i = 0; i < 100; i++) {
  slotNames.push(`_observer${i}`);
  versionSlotNames.push(`_observerVersion${i}`);
}

function addObserver(this: any, observer: any): void {
  // find the observer.
  const observerSlots = this._observerSlots === undefined ? 0 : this._observerSlots;
  let i = observerSlots;
  while (i-- && this[slotNames[i]] !== observer) {
    // Do nothing
  }

  // if we are not already observing, put the observer in an open slot and subscribe.
  if (i === -1) {
    i = 0;
    while (this[slotNames[i]]) {
      i++;
    }
    this[slotNames[i]] = observer;
    observer.subscribe(sourceContext, this);
    // increment the slot count.
    if (i === observerSlots) {
      this._observerSlots = i + 1;
    }
  }
  // set the "version" when the observer was used.
  if (this._version === undefined) {
    this._version = 0;
  }
  this[versionSlotNames[i]] = this._version;
}

function observeProperty(this: any, obj: any, propertyName: string): void {
  const observer = this.observerLocator.getObserver(obj, propertyName);
  addObserver.call(this, observer);
}

function observeArray(this: any, array: Array<any>): void {
  const observer = this.observerLocator.getArrayObserver(array);
  addObserver.call(this, observer);
}

function unobserve(this: any, all: boolean): void {
  let i = this._observerSlots;
  while (i--) {
    if (all || this[versionSlotNames[i]] !== this._version) {
      const observer = this[slotNames[i]];
      this[slotNames[i]] = null;
      if (observer) {
        observer.unsubscribe(sourceContext, this);
      }
    }
  }
}

export function connectable(): ClassDecorator {
  return function(target: Function): void {
    target.prototype.observeProperty = observeProperty;
    target.prototype.observeArray = observeArray;
    target.prototype.unobserve = unobserve;
    target.prototype.addObserver = addObserver;
  };
}

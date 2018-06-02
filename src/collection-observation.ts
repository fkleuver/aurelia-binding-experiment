import { calcSplices, projectArraySplices } from './array-change-records';
import { getChangeRecords } from './map-change-records';
import { subscriberCollection } from './subscriber-collection';
import { TaskQueue } from 'aurelia-task-queue';
import { Observer, Callable, BindingFlags } from './types';

@subscriberCollection()
export class ModifyCollectionObserver implements Observer {
  public taskQueue: TaskQueue;
  public queued: boolean;
  public changeRecords: any[];
  public oldCollection: Map<any, any> | Set<any> | Array<any>;
  public collection: Map<any, any> | Set<any> | Array<any>;
  public lengthPropertyName: string;
  public lengthObserver: CollectionLengthObserver;

  public addSubscriber: (context: any, callable: Callable) => boolean;
  public removeSubscriber: (context: any, callable: Callable) => boolean;
  public callSubscribers: (newValue: any, oldValue: any, flags: BindingFlags) => void;
  public hasSubscribers: () => boolean;
  public hasSubscriber: (context: any, callable: Callable) => boolean;

  constructor(taskQueue: TaskQueue, collection: Map<any, any> | Set<any> | Array<any>) {
    this.taskQueue = taskQueue;
    this.queued = false;
    this.changeRecords = <any>null;
    this.oldCollection = <any>null;
    this.collection = collection;
    this.lengthPropertyName = collection instanceof Map || collection instanceof Set ? 'size' : 'length';
  }

  public subscribe(context: any, callable: Callable): void {
    this.addSubscriber(context, callable);
  }

  public unsubscribe(context: any, callable: Callable): void {
    this.removeSubscriber(context, callable);
  }

  public addChangeRecord(changeRecord: any): void {
    if (!this.hasSubscribers() && !this.lengthObserver) {
      return;
    }

    if (changeRecord.type === 'splice') {
      let index = changeRecord.index;
      const arrayLength = changeRecord.object.length;
      if (index > arrayLength) {
        index = arrayLength - changeRecord.addedCount;
      } else if (index < 0) {
        index = arrayLength + changeRecord.removed.length + index - changeRecord.addedCount;
      }
      if (index < 0) {
        index = 0;
      }
      changeRecord.index = index;
    }

    if (this.changeRecords === null) {
      this.changeRecords = [changeRecord];
    } else {
      this.changeRecords.push(changeRecord);
    }

    if (!this.queued) {
      this.queued = true;
      this.taskQueue.queueMicroTask(<any>this);
    }
  }

  public flushChangeRecords(flags: BindingFlags): void {
    if ((this.changeRecords && this.changeRecords.length) || this.oldCollection) {
      this.call(flags);
    }
  }

  public reset(oldCollection: Map<any, any> | Set<any> | Array<any>): void {
    this.oldCollection = oldCollection;

    if (this.hasSubscribers() && !this.queued) {
      this.queued = true;
      this.taskQueue.queueMicroTask(<any>this);
    }
  }

  public getLengthObserver(): CollectionLengthObserver {
    return this.lengthObserver || (this.lengthObserver = new CollectionLengthObserver(this.collection));
  }

  public call(flags: BindingFlags): void {
    const changeRecords = this.changeRecords;
    const oldCollection = this.oldCollection;
    let records;

    this.queued = false;
    this.changeRecords = [];
    this.oldCollection = <any>null;

    if (this.hasSubscribers()) {
      if (oldCollection) {
        // TODO (martingust) we might want to refactor this to a common, independent of collection type, way of getting the records
        if (this.collection instanceof Map || this.collection instanceof Set) {
          records = getChangeRecords(<Map<any, any> | Set<any>>oldCollection);
        } else {
          //we might need to combine this with existing change records....
          records = calcSplices(this.collection, 0, this.collection.length, <Array<any>>oldCollection, 0, (<Array<any>>oldCollection).length);
        }
      } else {
        if (this.collection instanceof Map || this.collection instanceof Set) {
          records = changeRecords;
        } else {
          records = projectArraySplices(this.collection, changeRecords);
        }
      }

      this.callSubscribers(records, undefined, flags);
    }

    if (this.lengthObserver) {
      this.lengthObserver.call((<any>this.collection)[this.lengthPropertyName], flags);
    }
  }
}

@subscriberCollection()
export class CollectionLengthObserver implements Observer {
  public collection: Map<any, any> | Set<any> | Array<any>;
  public lengthPropertyName: string;
  public currentValue: number;

  public addSubscriber: (context: any, callable: Callable) => boolean;
  public removeSubscriber: (context: any, callable: Callable) => boolean;
  public callSubscribers: (newValue: any, oldValue: any, flags: BindingFlags) => void;
  public hasSubscribers: () => boolean;
  public hasSubscriber: (context: any, callable: Callable) => boolean;

  constructor(collection: Map<any, any> | Set<any> | Array<any>) {
    this.collection = collection;
    this.lengthPropertyName = collection instanceof Map || collection instanceof Set ? 'size' : 'length';
    this.currentValue = (<any>collection)[this.lengthPropertyName];
  }

  public getValue(): number {
    return (<any>this.collection)[this.lengthPropertyName];
  }

  public setValue(newValue: number): void {
    (<any>this.collection)[this.lengthPropertyName] = newValue;
  }

  public subscribe(context: any, callable: Callable): void {
    this.addSubscriber(context, callable);
  }

  public unsubscribe(context: any, callable: Callable): void {
    this.removeSubscriber(context, callable);
  }

  public call(newValue: number, flags: BindingFlags): void {
    const oldValue = this.currentValue;
    this.callSubscribers(newValue, oldValue, flags);
    this.currentValue = newValue;
  }
}

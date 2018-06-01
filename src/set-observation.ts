import { ModifyCollectionObserver } from './collection-observation';
import { TaskQueue } from 'aurelia-task-queue';

const setProto = Set.prototype;

export function getSetObserver(taskQueue: TaskQueue, set: Set<any>): any {
  return ModifySetObserver.for(taskQueue, set);
}

class ModifySetObserver extends ModifyCollectionObserver {
  constructor(taskQueue: TaskQueue, set: Set<any>) {
    super(taskQueue, set);
  }

  // tslint:disable-next-line:function-name
  public static for(taskQueue: TaskQueue, set: Set<any>): ModifySetObserver {
    if (!('__set_observer__' in set)) {
      Reflect.defineProperty(set, '__set_observer__', {
        value: ModifySetObserver.create(taskQueue, set),
        enumerable: false,
        configurable: false
      });
    }
    return (<any>set).__set_observer__;
  }

  // tslint:disable-next-line:function-name
  public static create(taskQueue: TaskQueue, set: Set<any>): ModifySetObserver {
    const observer = new ModifySetObserver(taskQueue, set);

    let proto = setProto;
    if (proto.add !== set.add || proto.delete !== set.delete || proto.clear !== set.clear) {
      proto = {
        add: set.add,
        delete: set.delete,
        clear: set.clear
      } as any;
    }

    set.add = function(): ReturnType<typeof Set.prototype.add> {
      const type = 'add';
      const oldSize = set.size;
      const methodCallResult = proto.add.apply(set, arguments);
      const hasValue = set.size === oldSize;
      if (!hasValue) {
        observer.addChangeRecord({
          type: type,
          object: set,
          value: Array.from(set).pop()
        });
      }
      return methodCallResult;
    };

    set.delete = function(): ReturnType<typeof Set.prototype.delete> {
      const hasValue = set.has(arguments[0]);
      const methodCallResult = proto.delete.apply(set, arguments);
      if (hasValue) {
        observer.addChangeRecord({
          type: 'delete',
          object: set,
          value: arguments[0]
        });
      }
      return methodCallResult;
    };

    set.clear = function(): ReturnType<typeof Set.prototype.clear> {
      const methodCallResult = proto.clear.apply(set, arguments);
      observer.addChangeRecord({
        type: 'clear',
        object: set
      });
      return methodCallResult;
    };

    return observer;
  }
}

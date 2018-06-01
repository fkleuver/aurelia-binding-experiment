import { ModifyCollectionObserver } from './collection-observation';
import { TaskQueue } from 'aurelia-task-queue';

const mapProto = Map.prototype;

export function getMapObserver(taskQueue: TaskQueue, map: Map<any, any>): any {
  return ModifyMapObserver.for(taskQueue, map);
}

class ModifyMapObserver extends ModifyCollectionObserver {
  constructor(taskQueue: TaskQueue, map: Map<any, any>) {
    super(taskQueue, map);
  }

  // tslint:disable-next-line:function-name
  public static for(taskQueue: TaskQueue, map: Map<any, any>): ModifyCollectionObserver {
    if (!('__map_observer__' in map)) {
      Reflect.defineProperty(map, '__map_observer__', {
        value: ModifyMapObserver.create(taskQueue, map),
        enumerable: false,
        configurable: false
      });
    }
    return (<any>map).__map_observer__;
  }

  // tslint:disable-next-line:function-name
  public static create(taskQueue: TaskQueue, map: Map<any, any>): ModifyCollectionObserver {
    const observer = new ModifyMapObserver(taskQueue, map);

    let proto = mapProto;
    if (proto.set !== map.set || proto.delete !== map.delete || proto.clear !== map.clear) {
      proto = {
        set: map.set,
        delete: map.delete,
        clear: map.clear
      } as any;
    }

    map.set = function(): ReturnType<typeof Map.prototype.set> {
      const hasValue = map.has(arguments[0]);
      const type = hasValue ? 'update' : 'add';
      const oldValue = map.get(arguments[0]);
      const methodCallResult = proto.set.apply(map, arguments);
      if (!hasValue || oldValue !== map.get(arguments[0])) {
        observer.addChangeRecord({
          type: type,
          object: map,
          key: arguments[0],
          oldValue: oldValue
        });
      }
      return methodCallResult;
    };

    map.delete = function(): ReturnType<typeof Map.prototype.delete> {
      const hasValue = map.has(arguments[0]);
      const oldValue = map.get(arguments[0]);
      const methodCallResult = proto.delete.apply(map, arguments);
      if (hasValue) {
        observer.addChangeRecord({
          type: 'delete',
          object: map,
          key: arguments[0],
          oldValue: oldValue
        });
      }
      return methodCallResult;
    };

    map.clear = function(): ReturnType<typeof Map.prototype.clear> {
      const methodCallResult = proto.clear.apply(map, arguments);
      observer.addChangeRecord({
        type: 'clear',
        object: map
      });
      return methodCallResult;
    };

    return observer;
  }
}

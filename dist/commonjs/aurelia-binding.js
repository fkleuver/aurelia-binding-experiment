'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

var aureliaTaskQueue = require('aurelia-task-queue');
var aureliaPal = require('aurelia-pal');

function newSplice(index, removed, addedCount) {
    return {
        index: index,
        removed: removed,
        addedCount: addedCount
    };
}
const EDIT_LEAVE = 0;
const EDIT_UPDATE = 1;
const EDIT_ADD = 2;
const EDIT_DELETE = 3;
class ArraySplice {
    calcEditDistances(current, currentStart, currentEnd, old, oldStart, oldEnd) {
        const rowCount = oldEnd - oldStart + 1;
        const columnCount = currentEnd - currentStart + 1;
        const distances = new Array(rowCount);
        let north;
        let west;
        for (let i = 0; i < rowCount; ++i) {
            distances[i] = new Array(columnCount);
            distances[i][0] = i;
        }
        for (let j = 0; j < columnCount; ++j) {
            distances[0][j] = j;
        }
        for (let i = 1; i < rowCount; ++i) {
            for (let j = 1; j < columnCount; ++j) {
                if (this.equals(current[currentStart + j - 1], old[oldStart + i - 1])) {
                    distances[i][j] = distances[i - 1][j - 1];
                }
                else {
                    north = distances[i - 1][j] + 1;
                    west = distances[i][j - 1] + 1;
                    distances[i][j] = north < west ? north : west;
                }
            }
        }
        return distances;
    }
    spliceOperationsFromEditDistances(distances) {
        let i = distances.length - 1;
        let j = distances[0].length - 1;
        let current = distances[i][j];
        const edits = new Array();
        while (i > 0 || j > 0) {
            if (i === 0) {
                edits.push(EDIT_ADD);
                j--;
                continue;
            }
            if (j === 0) {
                edits.push(EDIT_DELETE);
                i--;
                continue;
            }
            const northWest = distances[i - 1][j - 1];
            const west = distances[i - 1][j];
            const north = distances[i][j - 1];
            let min;
            if (west < north) {
                min = west < northWest ? west : northWest;
            }
            else {
                min = north < northWest ? north : northWest;
            }
            if (min === northWest) {
                if (northWest === current) {
                    edits.push(EDIT_LEAVE);
                }
                else {
                    edits.push(EDIT_UPDATE);
                    current = northWest;
                }
                i--;
                j--;
            }
            else if (min === west) {
                edits.push(EDIT_DELETE);
                i--;
                current = west;
            }
            else {
                edits.push(EDIT_ADD);
                j--;
                current = north;
            }
        }
        edits.reverse();
        return edits;
    }
    calcSplices(current, currentStart, currentEnd, old, oldStart, oldEnd) {
        let prefixCount = 0;
        let suffixCount = 0;
        const minLength = Math.min(currentEnd - currentStart, oldEnd - oldStart);
        if (currentStart === 0 && oldStart === 0) {
            prefixCount = this.sharedPrefix(current, old, minLength);
        }
        if (currentEnd === current.length && oldEnd === old.length) {
            suffixCount = this.sharedSuffix(current, old, minLength - prefixCount);
        }
        currentStart += prefixCount;
        oldStart += prefixCount;
        currentEnd -= suffixCount;
        oldEnd -= suffixCount;
        if (currentEnd - currentStart === 0 && oldEnd - oldStart === 0) {
            return [];
        }
        let splice = undefined;
        if (currentStart === currentEnd) {
            splice = newSplice(currentStart, [], 0);
            while (oldStart < oldEnd) {
                splice.removed.push(old[oldStart++]);
            }
            return [splice];
        }
        else if (oldStart === oldEnd) {
            return [newSplice(currentStart, [], currentEnd - currentStart)];
        }
        const ops = this.spliceOperationsFromEditDistances(this.calcEditDistances(current, currentStart, currentEnd, old, oldStart, oldEnd));
        splice = undefined;
        const splices = new Array();
        let index = currentStart;
        let oldIndex = oldStart;
        for (let i = 0; i < ops.length; ++i) {
            switch (ops[i]) {
                case EDIT_LEAVE:
                    if (splice) {
                        splices.push(splice);
                        splice = undefined;
                    }
                    index++;
                    oldIndex++;
                    break;
                case EDIT_UPDATE:
                    if (!splice) {
                        splice = newSplice(index, [], 0);
                    }
                    splice.addedCount++;
                    index++;
                    splice.removed.push(old[oldIndex]);
                    oldIndex++;
                    break;
                case EDIT_ADD:
                    if (!splice) {
                        splice = newSplice(index, [], 0);
                    }
                    splice.addedCount++;
                    index++;
                    break;
                case EDIT_DELETE:
                    if (!splice) {
                        splice = newSplice(index, [], 0);
                    }
                    splice.removed.push(old[oldIndex]);
                    oldIndex++;
                    break;
                default:
            }
        }
        if (splice) {
            splices.push(splice);
        }
        return splices;
    }
    sharedPrefix(current, old, searchLength) {
        for (let i = 0; i < searchLength; ++i) {
            if (!this.equals(current[i], old[i])) {
                return i;
            }
        }
        return searchLength;
    }
    sharedSuffix(current, old, searchLength) {
        let index1 = current.length;
        let index2 = old.length;
        let count = 0;
        while (count < searchLength && this.equals(current[--index1], old[--index2])) {
            count++;
        }
        return count;
    }
    calculateSplices(current, previous) {
        return this.calcSplices(current, 0, current.length, previous, 0, previous.length);
    }
    equals(currentValue, previousValue) {
        return currentValue === previousValue;
    }
}
const arraySplice = new ArraySplice();
function calcSplices(current, currentStart, currentEnd, old, oldStart, oldEnd) {
    return arraySplice.calcSplices(current, currentStart, currentEnd, old, oldStart, oldEnd);
}
function intersect(start1, end1, start2, end2) {
    if (end1 < start2 || end2 < start1) {
        return -1;
    }
    if (end1 === start2 || end2 === start1) {
        return 0;
    }
    if (start1 < start2) {
        if (end1 < end2) {
            return end1 - start2;
        }
        return end2 - start2;
    }
    if (end2 < end1) {
        return end2 - start1;
    }
    return end1 - start1;
}
function mergeSplice(splices, index, removed, addedCount) {
    const splice = newSplice(index, removed, addedCount);
    let inserted = false;
    let insertionOffset = 0;
    for (let i = 0; i < splices.length; i++) {
        const current = splices[i];
        current.index += insertionOffset;
        if (inserted) {
            continue;
        }
        const intersectCount = intersect(splice.index, splice.index + splice.removed.length, current.index, current.index + current.addedCount);
        if (intersectCount >= 0) {
            splices.splice(i, 1);
            i--;
            insertionOffset -= current.addedCount - current.removed.length;
            splice.addedCount += current.addedCount - intersectCount;
            const deleteCount = splice.removed.length + current.removed.length - intersectCount;
            if (!splice.addedCount && !deleteCount) {
                inserted = true;
            }
            else {
                let currentRemoved = current.removed;
                if (splice.index < current.index) {
                    const prepend = splice.removed.slice(0, current.index - splice.index);
                    Array.prototype.push.apply(prepend, currentRemoved);
                    currentRemoved = prepend;
                }
                if (splice.index + splice.removed.length > current.index + current.addedCount) {
                    const append = splice.removed.slice(current.index + current.addedCount - splice.index);
                    Array.prototype.push.apply(currentRemoved, append);
                }
                splice.removed = currentRemoved;
                if (current.index < splice.index) {
                    splice.index = current.index;
                }
            }
        }
        else if (splice.index < current.index) {
            inserted = true;
            splices.splice(i, 0, splice);
            i++;
            const offset = splice.addedCount - splice.removed.length;
            current.index += offset;
            insertionOffset += offset;
        }
    }
    if (!inserted) {
        splices.push(splice);
    }
}
function createInitialSplices(array, changeRecords) {
    const splices = new Array();
    for (let i = 0; i < changeRecords.length; i++) {
        const record = changeRecords[i];
        switch (record.type) {
            case 'splice':
                mergeSplice(splices, record.index, record.removed.slice(), record.addedCount);
                break;
            case 'add':
            case 'update':
            case 'delete':
                if (!(+record.name === record.name >>> 0)) {
                    continue;
                }
                const index = +record.name;
                if (index < 0) {
                    continue;
                }
                mergeSplice(splices, index, [record.oldValue], record.type === 'delete' ? 0 : 1);
                break;
            default:
                console.error(`Unexpected record type${JSON.stringify(record)}`);
        }
    }
    return splices;
}
function projectArraySplices(array, changeRecords) {
    let splices = new Array();
    createInitialSplices(array, changeRecords).forEach(function (splice) {
        if (splice.addedCount === 1 && splice.removed.length === 1) {
            if (splice.removed[0] !== array[splice.index]) {
                splices.push(splice);
            }
            return;
        }
        splices = splices.concat(calcSplices(array, splice.index, splice.index + splice.addedCount, splice.removed, 0, splice.removed.length));
    });
    return splices;
}

function getChangeRecords(map) {
    const entries = new Array(map.size);
    const keys = map.keys();
    let i = 0;
    let item;
    while ((item = keys.next())) {
        if (item.done) {
            break;
        }
        entries[i] = {
            type: 'added',
            object: map,
            key: item.value,
            oldValue: undefined
        };
        i++;
    }
    return entries;
}

function addSubscriber(context, callable) {
    if (this.hasSubscriber(context, callable)) {
        return false;
    }
    if (!this._context0) {
        this._context0 = context;
        this._callable0 = callable;
        return true;
    }
    if (!this._context1) {
        this._context1 = context;
        this._callable1 = callable;
        return true;
    }
    if (!this._context2) {
        this._context2 = context;
        this._callable2 = callable;
        return true;
    }
    if (!this._contextsRest) {
        this._contextsRest = [context];
        this._callablesRest = [callable];
        return true;
    }
    this._contextsRest.push(context);
    this._callablesRest.push(callable);
    return true;
}
function removeSubscriber(context, callable) {
    if (this._context0 === context && this._callable0 === callable) {
        this._context0 = null;
        this._callable0 = null;
        return true;
    }
    if (this._context1 === context && this._callable1 === callable) {
        this._context1 = null;
        this._callable1 = null;
        return true;
    }
    if (this._context2 === context && this._callable2 === callable) {
        this._context2 = null;
        this._callable2 = null;
        return true;
    }
    const callables = this._callablesRest;
    if (callables === undefined || callables.length === 0) {
        return false;
    }
    const contexts = this._contextsRest;
    let i = 0;
    while (!(callables[i] === callable && contexts[i] === context) && callables.length > i) {
        i++;
    }
    if (i >= callables.length) {
        return false;
    }
    contexts.splice(i, 1);
    callables.splice(i, 1);
    return true;
}
const arrayPool1 = new Array();
const arrayPool2 = new Array();
const poolUtilization = new Array();
function callSubscribers(newValue, oldValue, flags) {
    const context0 = this._context0;
    const callable0 = this._callable0;
    const context1 = this._context1;
    const callable1 = this._callable1;
    const context2 = this._context2;
    const callable2 = this._callable2;
    const length = this._contextsRest ? this._contextsRest.length : 0;
    let contextsRest = undefined;
    let callablesRest = undefined;
    let poolIndex = undefined;
    let i;
    if (length) {
        poolIndex = poolUtilization.length;
        while (poolIndex-- && poolUtilization[poolIndex]) {
        }
        if (poolIndex < 0) {
            poolIndex = poolUtilization.length;
            contextsRest = [];
            callablesRest = [];
            poolUtilization.push(true);
            arrayPool1.push(contextsRest);
            arrayPool2.push(callablesRest);
        }
        else {
            poolUtilization[poolIndex] = true;
            contextsRest = arrayPool1[poolIndex];
            callablesRest = arrayPool2[poolIndex];
        }
        i = length;
        while (i--) {
            contextsRest[i] = this._contextsRest[i];
            callablesRest[i] = this._callablesRest[i];
        }
    }
    if (context0) {
        if (callable0) {
            callable0.call(context0, newValue, oldValue, flags);
        }
        else {
            context0(newValue, oldValue, flags);
        }
    }
    if (context1) {
        if (callable1) {
            callable1.call(context1, newValue, oldValue, flags);
        }
        else {
            context1(newValue, oldValue, flags);
        }
    }
    if (context2) {
        if (callable2) {
            callable2.call(context2, newValue, oldValue, flags);
        }
        else {
            context2(newValue, oldValue, flags);
        }
    }
    if (length) {
        for (i = 0; i < length; i++) {
            const callable = callablesRest[i];
            const context = contextsRest[i];
            if (callable) {
                callable.call(context, newValue, oldValue);
            }
            else {
                context(newValue, oldValue, flags);
            }
            contextsRest[i] = null;
            callablesRest[i] = null;
        }
        poolUtilization[poolIndex] = false;
    }
}
function hasSubscribers() {
    return !!(this._context0 || this._context1 || this._context2 || (this._contextsRest && this._contextsRest.length));
}
function hasSubscriber(context, callable) {
    const has = (this._context0 === context && this._callable0 === callable) ||
        (this._context1 === context && this._callable1 === callable) ||
        (this._context2 === context && this._callable2 === callable);
    if (has) {
        return true;
    }
    let index;
    const contexts = this._contextsRest;
    if (!contexts || (index = contexts.length) === 0) {
        return false;
    }
    const callables = this._callablesRest;
    while (index--) {
        if (contexts[index] === context && callables[index] === callable) {
            return true;
        }
    }
    return false;
}
function subscriberCollection() {
    return function (target) {
        target.prototype.addSubscriber = addSubscriber;
        target.prototype.removeSubscriber = removeSubscriber;
        target.prototype.callSubscribers = callSubscribers;
        target.prototype.hasSubscribers = hasSubscribers;
        target.prototype.hasSubscriber = hasSubscriber;
    };
}

var __decorate = (undefined && undefined.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (undefined && undefined.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
exports.ModifyCollectionObserver = class ModifyCollectionObserver {
    constructor(taskQueue, collection) {
        this.taskQueue = taskQueue;
        this.queued = false;
        this.changeRecords = null;
        this.oldCollection = null;
        this.collection = collection;
        this.lengthPropertyName = collection instanceof Map || collection instanceof Set ? 'size' : 'length';
    }
    subscribe(context, callable) {
        this.addSubscriber(context, callable);
    }
    unsubscribe(context, callable) {
        this.removeSubscriber(context, callable);
    }
    addChangeRecord(changeRecord) {
        if (!this.hasSubscribers() && !this.lengthObserver) {
            return;
        }
        if (changeRecord.type === 'splice') {
            let index = changeRecord.index;
            const arrayLength = changeRecord.object.length;
            if (index > arrayLength) {
                index = arrayLength - changeRecord.addedCount;
            }
            else if (index < 0) {
                index = arrayLength + changeRecord.removed.length + index - changeRecord.addedCount;
            }
            if (index < 0) {
                index = 0;
            }
            changeRecord.index = index;
        }
        if (this.changeRecords === null) {
            this.changeRecords = [changeRecord];
        }
        else {
            this.changeRecords.push(changeRecord);
        }
        if (!this.queued) {
            this.queued = true;
            this.taskQueue.queueMicroTask(this);
        }
    }
    flushChangeRecords(flags) {
        if ((this.changeRecords && this.changeRecords.length) || this.oldCollection) {
            this.call(flags);
        }
    }
    reset(oldCollection) {
        this.oldCollection = oldCollection;
        if (this.hasSubscribers() && !this.queued) {
            this.queued = true;
            this.taskQueue.queueMicroTask(this);
        }
    }
    getLengthObserver() {
        return this.lengthObserver || (this.lengthObserver = new exports.CollectionLengthObserver(this.collection));
    }
    call(flags) {
        const changeRecords = this.changeRecords;
        const oldCollection = this.oldCollection;
        let records;
        this.queued = false;
        this.changeRecords = [];
        this.oldCollection = null;
        if (this.hasSubscribers()) {
            if (oldCollection) {
                if (this.collection instanceof Map || this.collection instanceof Set) {
                    records = getChangeRecords(oldCollection);
                }
                else {
                    records = calcSplices(this.collection, 0, this.collection.length, oldCollection, 0, oldCollection.length);
                }
            }
            else {
                if (this.collection instanceof Map || this.collection instanceof Set) {
                    records = changeRecords;
                }
                else {
                    records = projectArraySplices(this.collection, changeRecords);
                }
            }
            this.callSubscribers(records, undefined, flags);
        }
        if (this.lengthObserver) {
            this.lengthObserver.call(this.collection[this.lengthPropertyName], flags);
        }
    }
};
exports.ModifyCollectionObserver = __decorate([
    subscriberCollection(),
    __metadata("design:paramtypes", [aureliaTaskQueue.TaskQueue, Object])
], exports.ModifyCollectionObserver);
exports.CollectionLengthObserver = class CollectionLengthObserver {
    constructor(collection) {
        this.collection = collection;
        this.lengthPropertyName = collection instanceof Map || collection instanceof Set ? 'size' : 'length';
        this.currentValue = collection[this.lengthPropertyName];
    }
    getValue() {
        return this.collection[this.lengthPropertyName];
    }
    setValue(newValue) {
        this.collection[this.lengthPropertyName] = newValue;
    }
    subscribe(context, callable) {
        this.addSubscriber(context, callable);
    }
    unsubscribe(context, callable) {
        this.removeSubscriber(context, callable);
    }
    call(newValue, flags) {
        const oldValue = this.currentValue;
        this.callSubscribers(newValue, oldValue, flags);
        this.currentValue = newValue;
    }
};
exports.CollectionLengthObserver = __decorate([
    subscriberCollection(),
    __metadata("design:paramtypes", [Object])
], exports.CollectionLengthObserver);

const pop = Array.prototype.pop;
const push = Array.prototype.push;
const reverse = Array.prototype.reverse;
const shift = Array.prototype.shift;
const sort = Array.prototype.sort;
const splice = Array.prototype.splice;
const unshift = Array.prototype.unshift;
Array.prototype.pop = function () {
    const notEmpty = this.length > 0;
    const methodCallResult = pop.apply(this, arguments);
    if (notEmpty && this.__array_observer__ !== undefined) {
        this.__array_observer__.addChangeRecord({
            type: 'delete',
            object: this,
            name: this.length,
            oldValue: methodCallResult
        });
    }
    return methodCallResult;
};
Array.prototype.push = function () {
    const methodCallResult = push.apply(this, arguments);
    if (this.__array_observer__ !== undefined) {
        this.__array_observer__.addChangeRecord({
            type: 'splice',
            object: this,
            index: this.length - arguments.length,
            removed: [],
            addedCount: arguments.length
        });
    }
    return methodCallResult;
};
Array.prototype.reverse = function () {
    let oldArray;
    if (this.__array_observer__ !== undefined) {
        this.__array_observer__.flushChangeRecords();
        oldArray = this.slice();
    }
    const methodCallResult = reverse.apply(this, arguments);
    if (this.__array_observer__ !== undefined) {
        this.__array_observer__.reset(oldArray);
    }
    return methodCallResult;
};
Array.prototype.shift = function () {
    const notEmpty = this.length > 0;
    const methodCallResult = shift.apply(this, arguments);
    if (notEmpty && this.__array_observer__ !== undefined) {
        this.__array_observer__.addChangeRecord({
            type: 'delete',
            object: this,
            name: 0,
            oldValue: methodCallResult
        });
    }
    return methodCallResult;
};
Array.prototype.sort = function () {
    let oldArray;
    if (this.__array_observer__ !== undefined) {
        this.__array_observer__.flushChangeRecords();
        oldArray = this.slice();
    }
    const methodCallResult = sort.apply(this, arguments);
    if (this.__array_observer__ !== undefined) {
        this.__array_observer__.reset(oldArray);
    }
    return methodCallResult;
};
Array.prototype.splice = function () {
    const methodCallResult = splice.apply(this, arguments);
    if (this.__array_observer__ !== undefined) {
        this.__array_observer__.addChangeRecord({
            type: 'splice',
            object: this,
            index: +arguments[0],
            removed: methodCallResult,
            addedCount: arguments.length > 2 ? arguments.length - 2 : 0
        });
    }
    return methodCallResult;
};
Array.prototype.unshift = function () {
    const methodCallResult = unshift.apply(this, arguments);
    if (this.__array_observer__ !== undefined) {
        this.__array_observer__.addChangeRecord({
            type: 'splice',
            object: this,
            index: 0,
            removed: [],
            addedCount: arguments.length
        });
    }
    return methodCallResult;
};
function getArrayObserver(taskQueue, array) {
    return ModifyArrayObserver.for(taskQueue, array);
}
class ModifyArrayObserver extends exports.ModifyCollectionObserver {
    constructor(taskQueue, array) {
        super(taskQueue, array);
    }
    static for(taskQueue, array) {
        if (!('__array_observer__' in array)) {
            Reflect.defineProperty(array, '__array_observer__', {
                value: ModifyArrayObserver.create(taskQueue, array),
                enumerable: false,
                configurable: false
            });
        }
        return array.__array_observer__;
    }
    static create(taskQueue, array) {
        return new ModifyArrayObserver(taskQueue, array);
    }
}

function createOverrideContext(bindingContext, parentOverrideContext) {
    return {
        bindingContext: bindingContext,
        parentOverrideContext: parentOverrideContext || null
    };
}
function getContextFor(name, scope, ancestor) {
    let oc = scope.overrideContext;
    if (ancestor) {
        while (ancestor && oc) {
            ancestor--;
            oc = oc.parentOverrideContext;
        }
        if (ancestor || !oc) {
            return undefined;
        }
        return name in oc ? oc : oc.bindingContext;
    }
    while (oc && !(name in oc) && !(oc.bindingContext && name in oc.bindingContext)) {
        oc = oc.parentOverrideContext;
    }
    if (oc) {
        return name in oc ? oc : oc.bindingContext;
    }
    return scope.bindingContext || scope.overrideContext;
}
function createScopeForTest(bindingContext, parentBindingContext) {
    if (parentBindingContext) {
        return {
            bindingContext,
            overrideContext: createOverrideContext(bindingContext, createOverrideContext(parentBindingContext))
        };
    }
    return {
        bindingContext,
        overrideContext: createOverrideContext(bindingContext)
    };
}

const signals = {};
function connectBindingToSignal(binding, name) {
    if (!signals.hasOwnProperty(name)) {
        signals[name] = 0;
    }
    binding.observeProperty(signals, name);
}

(function (bindingMode) {
    bindingMode[bindingMode["oneTime"] = 1] = "oneTime";
    bindingMode[bindingMode["toView"] = 2] = "toView";
    bindingMode[bindingMode["fromView"] = 4] = "fromView";
    bindingMode[bindingMode["twoWay"] = 6] = "twoWay";
})(exports.bindingMode || (exports.bindingMode = {}));
(function (BindingFlags) {
    BindingFlags[BindingFlags["mustEvaluate"] = 1] = "mustEvaluate";
})(exports.BindingFlags || (exports.BindingFlags = {}));

class BindingBehaviorExpression {
    constructor(expression, name, args) {
        this.expression = expression;
        this.name = name;
        this.args = args;
    }
    evaluate(scope, lookupFunctions, flags) {
        return this.expression.evaluate(scope, lookupFunctions, flags);
    }
    assign(scope, value, lookupFunctions, flags) {
        return this.expression.assign(scope, value, lookupFunctions, flags);
    }
    accept(visitor) {
        return visitor.visitBindingBehavior(this);
    }
    connect(binding, scope, flags) {
        this.expression.connect(binding, scope, flags);
    }
    bind(binding, scope, lookupFunctions, flags) {
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
    unbind(binding, scope, flags) {
        const behaviorKey = `behavior-${this.name}`;
        binding[behaviorKey].unbind(binding, scope, flags);
        binding[behaviorKey] = null;
        if (this.expression.expression && this.expression.unbind) {
            this.expression.unbind(binding, scope, flags);
        }
    }
}
class ValueConverterExpression {
    constructor(expression, name, args) {
        this.expression = expression;
        this.name = name;
        this.args = args;
        this.allArgs = [expression].concat(args);
    }
    evaluate(scope, lookupFunctions, flags) {
        const converter = lookupFunctions.valueConverters(this.name);
        if (!converter) {
            throw new Error(`No ValueConverter named "${this.name}" was found!`);
        }
        if (converter.toView) {
            return converter.toView.apply(converter, evalList(scope, this.allArgs, lookupFunctions, flags));
        }
        return this.expression.evaluate(scope, lookupFunctions, flags);
    }
    assign(scope, value, lookupFunctions, flags) {
        const converter = lookupFunctions.valueConverters(this.name);
        if (!converter) {
            throw new Error(`No ValueConverter named "${this.name}" was found!`);
        }
        if (converter.fromView) {
            value = converter.fromView.apply(converter, [value].concat(evalList(scope, this.args, lookupFunctions, flags)));
        }
        return this.expression.assign(scope, value, lookupFunctions, flags);
    }
    accept(visitor) {
        return visitor.visitValueConverter(this);
    }
    connect(binding, scope, flags) {
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
class AssignmentExpression {
    constructor(target, value) {
        this.target = target;
        this.value = value;
    }
    evaluate(scope, lookupFunctions, flags) {
        return this.target.assign(scope, this.value.evaluate(scope, lookupFunctions, flags), lookupFunctions, flags);
    }
    accept(vistor) {
        vistor.visitAssign(this);
    }
    connect(binding, scope, flags) { }
    assign(scope, value, lookupFunctions, flags) {
        this.value.assign(scope, value, lookupFunctions, flags);
        this.target.assign(scope, value, lookupFunctions, flags);
    }
}
class ConditionalExpression {
    constructor(condition, yes, no) {
        this.condition = condition;
        this.yes = yes;
        this.no = no;
    }
    evaluate(scope, lookupFunctions, flags) {
        return !!this.condition.evaluate(scope, lookupFunctions, flags)
            ? this.yes.evaluate(scope, lookupFunctions, flags)
            : this.no.evaluate(scope, lookupFunctions, flags);
    }
    accept(visitor) {
        return visitor.visitConditional(this);
    }
    connect(binding, scope, flags) {
        this.condition.connect(binding, scope, flags);
        if (this.condition.evaluate(scope, undefined, flags)) {
            this.yes.connect(binding, scope, flags);
        }
        else {
            this.no.connect(binding, scope, flags);
        }
    }
    assign(scope, value, lookupFunctions, flags) {
        throw new Error(`Binding expression "${this}" cannot be assigned to.`);
    }
}
class AccessThisExpression {
    constructor(ancestor) {
        this.ancestor = ancestor;
    }
    evaluate(scope, lookupFunctions, flags) {
        let oc = scope.overrideContext;
        let i = this.ancestor;
        while (i-- && oc) {
            oc = oc.parentOverrideContext;
        }
        return i < 1 && oc ? oc.bindingContext : undefined;
    }
    accept(visitor) {
        return visitor.visitAccessThis(this);
    }
    connect(binding, scope, flags) { }
    assign(scope, value, lookupFunctions, flags) {
        throw new Error(`Binding expression "${this}" cannot be assigned to.`);
    }
}
class AccessScopeExpression {
    constructor(name, ancestor) {
        this.name = name;
        this.ancestor = ancestor;
    }
    evaluate(scope, lookupFunctions, flags) {
        const context = getContextFor(this.name, scope, this.ancestor);
        return context[this.name];
    }
    assign(scope, value, lookupFunctions, flags) {
        const context = getContextFor(this.name, scope, this.ancestor);
        return context ? (context[this.name] = value) : undefined;
    }
    accept(visitor) {
        return visitor.visitAccessScope(this);
    }
    connect(binding, scope, flags) {
        const context = getContextFor(this.name, scope, this.ancestor);
        binding.observeProperty(context, this.name);
    }
}
class AccessMemberExpression {
    constructor(object, name) {
        this.object = object;
        this.name = name;
    }
    evaluate(scope, lookupFunctions, flags) {
        const instance = this.object.evaluate(scope, lookupFunctions, flags);
        return instance === null || instance === undefined ? instance : instance[this.name];
    }
    assign(scope, value, lookupFunctions, flags) {
        let instance = this.object.evaluate(scope, lookupFunctions, flags);
        if (instance === null || instance === undefined) {
            instance = {};
            this.object.assign(scope, instance, lookupFunctions, flags);
        }
        instance[this.name] = value;
        return value;
    }
    accept(visitor) {
        return visitor.visitAccessMember(this);
    }
    connect(binding, scope, flags) {
        this.object.connect(binding, scope, flags);
        const obj = this.object.evaluate(scope, undefined, flags);
        if (obj) {
            binding.observeProperty(obj, this.name);
        }
    }
}
class AccessKeyedExpression {
    constructor(object, key) {
        this.object = object;
        this.key = key;
    }
    evaluate(scope, lookupFunctions, flags) {
        const instance = this.object.evaluate(scope, lookupFunctions, flags);
        const lookup = this.key.evaluate(scope, lookupFunctions, flags);
        return getKeyed(instance, lookup);
    }
    assign(scope, value, lookupFunctions, flags) {
        const instance = this.object.evaluate(scope, lookupFunctions, flags);
        const lookup = this.key.evaluate(scope, lookupFunctions, flags);
        return setKeyed(instance, lookup, value);
    }
    accept(visitor) {
        return visitor.visitAccessKeyed(this);
    }
    connect(binding, scope, flags) {
        this.object.connect(binding, scope, flags);
        const obj = this.object.evaluate(scope, undefined, flags);
        if (obj instanceof Object) {
            this.key.connect(binding, scope, flags);
            const key = this.key.evaluate(scope, undefined, flags);
            if (key !== null && key !== undefined && !(Array.isArray(obj) && typeof key === 'number')) {
                binding.observeProperty(obj, key);
            }
        }
    }
}
class CallScopeExpression {
    constructor(name, args, ancestor) {
        this.name = name;
        this.args = args;
        this.ancestor = ancestor;
    }
    evaluate(scope, lookupFunctions, flags) {
        const args = evalList(scope, this.args, lookupFunctions, flags);
        const context = getContextFor(this.name, scope, this.ancestor);
        const func = getFunction(context, this.name, flags & exports.BindingFlags.mustEvaluate);
        if (func) {
            return func.apply(context, args);
        }
        return undefined;
    }
    accept(visitor) {
        return visitor.visitCallScope(this);
    }
    connect(binding, scope, flags) {
        const args = this.args;
        let i = args.length;
        while (i--) {
            args[i].connect(binding, scope, flags);
        }
    }
    assign(scope, value, lookupFunctions, flags) {
        throw new Error(`Binding expression "${this}" cannot be assigned to.`);
    }
}
class CallMemberExpression {
    constructor(object, name, args) {
        this.object = object;
        this.name = name;
        this.args = args;
    }
    evaluate(scope, lookupFunctions, flags) {
        const instance = this.object.evaluate(scope, lookupFunctions, flags);
        const args = evalList(scope, this.args, lookupFunctions, flags);
        const func = getFunction(instance, this.name, flags & exports.BindingFlags.mustEvaluate);
        if (func) {
            return func.apply(instance, args);
        }
        return undefined;
    }
    accept(visitor) {
        return visitor.visitCallMember(this);
    }
    connect(binding, scope, flags) {
        this.object.connect(binding, scope, flags);
        const obj = this.object.evaluate(scope, undefined, flags);
        if (getFunction(obj, this.name, false)) {
            const args = this.args;
            let i = args.length;
            while (i--) {
                args[i].connect(binding, scope, flags);
            }
        }
    }
    assign(scope, value, lookupFunctions, flags) {
        throw new Error(`Binding expression "${this}" cannot be assigned to.`);
    }
}
class CallFunctionExpression {
    constructor(func, args) {
        this.func = func;
        this.args = args;
    }
    evaluate(scope, lookupFunctions, flags) {
        const func = this.func.evaluate(scope, lookupFunctions, flags);
        if (typeof func === 'function') {
            return func.apply(null, evalList(scope, this.args, lookupFunctions, flags));
        }
        if (!(flags & exports.BindingFlags.mustEvaluate) && (func === null || func === undefined)) {
            return undefined;
        }
        throw new Error(`${this.func} is not a function`);
    }
    accept(visitor) {
        return visitor.visitCallFunction(this);
    }
    connect(binding, scope, flags) {
        this.func.connect(binding, scope, flags);
        const func = this.func.evaluate(scope, undefined, flags);
        if (typeof func === 'function') {
            const args = this.args;
            let i = args.length;
            while (i--) {
                args[i].connect(binding, scope, flags);
            }
        }
    }
    assign(scope, value, lookupFunctions, flags) {
        throw new Error(`Binding expression "${this}" cannot be assigned to.`);
    }
}
class BinaryExpression {
    constructor(operation, left, right) {
        this.operation = operation;
        this.left = left;
        this.right = right;
    }
    evaluate(scope, lookupFunctions, flags) {
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
        if (left === null || right === null || left === undefined || right === undefined) {
            switch (this.operation) {
                case '+':
                    if (left !== null && left !== undefined)
                        return left;
                    if (right !== null && right !== undefined)
                        return right;
                    return 0;
                case '-':
                    if (left !== null && left !== undefined)
                        return left;
                    if (right !== null && right !== undefined)
                        return 0 - right;
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
    accept(visitor) {
        return visitor.visitBinary(this);
    }
    connect(binding, scope, flags) {
        this.left.connect(binding, scope, flags);
        const left = this.left.evaluate(scope, undefined, flags);
        if ((this.operation === '&&' && !left) || (this.operation === '||' && left)) {
            return;
        }
        this.right.connect(binding, scope, flags);
    }
    assign(scope, value, lookupFunctions, flags) {
        throw new Error(`Binding expression "${this}" cannot be assigned to.`);
    }
}
class UnaryExpression {
    constructor(operation, expression) {
        this.operation = operation;
        this.expression = expression;
    }
    evaluate(scope, lookupFunctions, flags) {
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
    accept(visitor) {
        return visitor.visitPrefix(this);
    }
    connect(binding, scope, flags) {
        this.expression.connect(binding, scope, flags);
    }
    assign(scope, value, lookupFunctions, flags) {
        throw new Error(`Binding expression "${this}" cannot be assigned to.`);
    }
}
class PrimitiveLiteralExpression {
    constructor(value) {
        this.value = value;
    }
    evaluate(scope, lookupFunctions, flags) {
        return this.value;
    }
    accept(visitor) {
        return visitor.visitLiteralPrimitive(this);
    }
    connect(binding, scope, flags) { }
    assign(scope, value, lookupFunctions, flags) {
        throw new Error(`Binding expression "${this}" cannot be assigned to.`);
    }
}
class TemplateExpression {
    constructor(cooked, expressions) {
        this.cooked = cooked;
        this.expressions = expressions || [];
        this.length = this.expressions.length;
    }
    evaluate(scope, lookupFunctions, flags) {
        const results = new Array(this.length);
        for (let i = 0; i < this.length; i++) {
            results[i] = this.expressions[i].evaluate(scope, lookupFunctions, flags);
        }
        let result = this.cooked[0];
        for (let i = 0; i < this.length; i++) {
            result = String.prototype.concat(result, results[i], this.cooked[i + 1]);
        }
        return result;
    }
    accept(visitor) {
        return visitor.visitLiteralTemplate(this);
    }
    connect(binding, scope, flags) {
        for (let i = 0; i < this.length; i++) {
            this.expressions[i].connect(binding, scope, flags);
        }
    }
    assign(scope, value, lookupFunctions, flags) {
        throw new Error(`Binding expression "${this}" cannot be assigned to.`);
    }
}
class TaggedTemplateExpression {
    constructor(cooked, raw, func, expressions) {
        cooked.raw = raw;
        this.cooked = cooked;
        this.func = func;
        this.expressions = expressions || [];
        this.length = this.expressions.length;
    }
    evaluate(scope, lookupFunctions, flags) {
        const results = new Array(this.length);
        for (let i = 0; i < this.length; i++) {
            results[i] = this.expressions[i].evaluate(scope, lookupFunctions, flags);
        }
        const func = this.func.evaluate(scope, lookupFunctions, flags);
        if (typeof func !== 'function') {
            throw new Error(`${this.func} is not a function`);
        }
        return func.call(null, this.cooked, ...results);
    }
    accept(visitor) {
        return visitor.visitLiteralTemplate(this);
    }
    connect(binding, scope, flags) {
        for (let i = 0; i < this.length; i++) {
            this.expressions[i].connect(binding, scope, flags);
        }
        this.func.connect(binding, scope, flags);
    }
    assign(scope, value, lookupFunctions, flags) {
        throw new Error(`Binding expression "${this}" cannot be assigned to.`);
    }
}
class ArrayLiteralExpression {
    constructor(elements) {
        this.elements = elements;
    }
    evaluate(scope, lookupFunctions, flags) {
        const elements = this.elements;
        const result = [];
        for (let i = 0, length = elements.length; i < length; ++i) {
            result[i] = elements[i].evaluate(scope, lookupFunctions, flags);
        }
        return result;
    }
    accept(visitor) {
        return visitor.visitLiteralArray(this);
    }
    connect(binding, scope, flags) {
        const length = this.elements.length;
        for (let i = 0; i < length; i++) {
            this.elements[i].connect(binding, scope, flags);
        }
    }
    assign(scope, value, lookupFunctions, flags) {
        throw new Error(`Binding expression "${this}" cannot be assigned to.`);
    }
}
class ObjectLiteralExpression {
    constructor(keys, values) {
        this.keys = keys;
        this.values = values;
    }
    evaluate(scope, lookupFunctions, flags) {
        const instance = {};
        const keys = this.keys;
        const values = this.values;
        for (let i = 0, length = keys.length; i < length; ++i) {
            instance[keys[i]] = values[i].evaluate(scope, lookupFunctions, flags);
        }
        return instance;
    }
    accept(visitor) {
        return visitor.visitLiteralObject(this);
    }
    connect(binding, scope, flags) {
        const length = this.keys.length;
        for (let i = 0; i < length; i++) {
            this.values[i].connect(binding, scope, flags);
        }
    }
    assign(scope, value, lookupFunctions, flags) {
        throw new Error(`Binding expression "${this}" cannot be assigned to.`);
    }
}
function evalList(scope, list, lookupFunctions, flags) {
    const length = list.length;
    const result = [];
    for (let i = 0; i < length; i++) {
        result[i] = list[i].evaluate(scope, lookupFunctions, flags);
    }
    return result;
}
function autoConvertAdd(a, b) {
    if (a !== null && b !== null) {
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
function getFunction(obj, name, mustExist) {
    const func = obj === null || obj === undefined ? null : obj[name];
    if (typeof func === 'function') {
        return func;
    }
    if (!mustExist && (func === null || func === undefined)) {
        return null;
    }
    throw new Error(`${name} is not a function`);
}
function getKeyed(obj, key) {
    if (Array.isArray(obj)) {
        return obj[parseInt(key, 10)];
    }
    else if (obj) {
        return obj[key];
    }
    else if (obj === null || obj === undefined) {
        return undefined;
    }
    return obj[key];
}
function setKeyed(obj, key, value) {
    if (Array.isArray(obj)) {
        const index = parseInt(key, 10);
        if (obj.length <= index) {
            obj.length = index + 1;
        }
        obj[index] = value;
    }
    else {
        obj[key] = value;
    }
    return value;
}

function findOriginalEventTarget(event) {
    return (event.path && event.path[0]) || (event.deepPath && event.deepPath[0]) || event.target;
}
function stopPropagation() {
    this.standardStopPropagation();
    this.propagationStopped = true;
}
function handleCapturedEvent(event) {
    event.propagationStopped = false;
    let target = findOriginalEventTarget(event);
    const orderedCallbacks = [];
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
        }
        else {
            orderedCallback(event);
        }
    }
}
class CapturedHandlerEntry {
    constructor(eventName) {
        this.eventName = eventName;
        this.count = 0;
    }
    increment() {
        this.count++;
        if (this.count === 1) {
            aureliaPal.DOM.addEventListener(this.eventName, handleCapturedEvent, true);
        }
    }
    decrement() {
        this.count--;
        if (this.count === 0) {
            aureliaPal.DOM.removeEventListener(this.eventName, handleCapturedEvent, true);
        }
    }
}
function handleDelegatedEvent(event) {
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
                }
                else {
                    callback(event);
                }
            }
        }
        target = target.parentNode;
    }
}
class DelegateHandlerEntry {
    constructor(eventName) {
        this.eventName = eventName;
        this.count = 0;
    }
    increment() {
        this.count++;
        if (this.count === 1) {
            aureliaPal.DOM.addEventListener(this.eventName, handleDelegatedEvent, false);
        }
    }
    decrement() {
        this.count--;
        if (this.count === 0) {
            aureliaPal.DOM.removeEventListener(this.eventName, handleDelegatedEvent, false);
        }
    }
}
class DelegationEntryHandler {
    constructor(entry, lookup, targetEvent) {
        this.entry = entry;
        this.lookup = lookup;
        this.targetEvent = targetEvent;
    }
    dispose() {
        this.entry.decrement();
        this.lookup[this.targetEvent] = null;
        this.entry = this.lookup = this.targetEvent = null;
    }
}
class EventHandler {
    constructor(target, targetEvent, callback) {
        this.target = target;
        this.targetEvent = targetEvent;
        this.callback = callback;
    }
    dispose() {
        this.target.removeEventListener(this.targetEvent, this.callback);
        this.target = this.targetEvent = this.callback = null;
    }
}
class DefaultEventStrategy {
    constructor() {
        this.delegatedHandlers = {};
        this.capturedHandlers = {};
    }
    subscribe(target, targetEvent, callback, strategy, disposable) {
        let delegatedHandlers;
        let capturedHandlers;
        let handlerEntry;
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
            return function () {
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
            return function () {
                handlerEntry.decrement();
                capturedCallbacks[targetEvent] = null;
            };
        }
        target.addEventListener(targetEvent, callback);
        if (disposable === true) {
            return new EventHandler(target, targetEvent, callback);
        }
        return function () {
            target.removeEventListener(targetEvent, callback);
        };
    }
}
const delegationStrategy = {
    none: 0,
    capturing: 1,
    bubbling: 2
};
class EventManager {
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
    registerElementConfig(config) {
        const tagName = config.tagName.toLowerCase();
        const properties = config.properties;
        let propertyName;
        const lookup = (this.elementHandlerLookup[tagName] = {});
        for (propertyName in properties) {
            if (properties.hasOwnProperty(propertyName)) {
                lookup[propertyName] = properties[propertyName];
            }
        }
    }
    registerEventStrategy(eventName, strategy) {
        this.eventStrategyLookup[eventName] = strategy;
    }
    getElementHandler(target, propertyName) {
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
    addEventListener(target, targetEvent, callbackOrListener, delegate, disposable) {
        return (this.eventStrategyLookup[targetEvent] || this.defaultEventStrategy).subscribe(target, targetEvent, callbackOrListener, delegate, disposable);
    }
}
class EventSubscriber {
    constructor(events) {
        this.events = events;
        this.element = null;
        this.handler = null;
    }
    subscribe(element, callbackOrListener) {
        this.element = element;
        this.handler = callbackOrListener;
        const events = this.events;
        for (let i = 0, ii = events.length; ii > i; ++i) {
            element.addEventListener(events[i], callbackOrListener);
        }
    }
    dispose() {
        if (this.element === null) {
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

class Parser {
    constructor() {
        this.cache = Object.create(null);
    }
    parse(input) {
        input = input || '';
        return this.cache[input] || (this.cache[input] = parse(new ParserState(input), 0, 61));
    }
}
class ParserState {
    get tokenRaw() {
        return this.input.slice(this.startIndex, this.index);
    }
    constructor(input) {
        this.index = 0;
        this.startIndex = 0;
        this.lastIndex = 0;
        this.input = input;
        this.length = input.length;
        this.currentToken = 786432;
        this.tokenValue = '';
        this.currentChar = input.charCodeAt(0);
        this.assignable = true;
        nextToken(this);
        if (this.currentToken & 524288) {
            error(this, 'Invalid start of expression');
        }
    }
}
function parse(state, access, minPrecedence) {
    let exprStart = state.index;
    state.assignable = 448 > minPrecedence;
    let result = undefined;
    if (state.currentToken & 16384) {
        const op = TokenValues[state.currentToken & 63];
        nextToken(state);
        result = new UnaryExpression(op, parse(state, access, 449));
    }
    else {
        primary: switch (state.currentToken) {
            case 1541:
                state.assignable = false;
                do {
                    nextToken(state);
                    access++;
                    if (optional(state, 8200)) {
                        if (state.currentToken === 8200) {
                            error(state);
                        }
                        continue;
                    }
                    else if (state.currentToken & 262144) {
                        result = new AccessThisExpression(access & 511);
                        access = 512;
                        break primary;
                    }
                    else {
                        error(state);
                    }
                } while (state.currentToken === 1541);
            case 512:
                result = new AccessScopeExpression(state.tokenValue, access & 511);
                nextToken(state);
                access = 1024;
                break;
            case 1540:
                state.assignable = false;
                nextToken(state);
                result = new AccessThisExpression(0);
                access = 512;
                break;
            case 335878:
                nextToken(state);
                result = parse(state, 0, 63);
                expect(state, 917514);
                break;
            case 335884:
                nextToken(state);
                const elements = new Array();
                while (state.currentToken !== 655373) {
                    if (optional(state, 262155)) {
                        elements.push($undefined);
                        if (state.currentToken === 655373) {
                            elements.push($undefined);
                            break;
                        }
                    }
                    else {
                        elements.push(parse(state, access, 62));
                        if (!optional(state, 262155)) {
                            break;
                        }
                    }
                }
                expect(state, 655373);
                result = new ArrayLiteralExpression(elements);
                state.assignable = false;
                break;
            case 65543:
                const keys = new Array();
                const values = new Array();
                nextToken(state);
                while (state.currentToken !== 917513) {
                    keys.push(state.tokenValue);
                    if (state.currentToken & 6144) {
                        nextToken(state);
                        expect(state, 262158);
                        values.push(parse(state, 0, 62));
                    }
                    else if (state.currentToken & 1536) {
                        const { currentChar, currentToken, index } = state;
                        nextToken(state);
                        if (optional(state, 262158)) {
                            values.push(parse(state, 0, 62));
                        }
                        else {
                            state.currentChar = currentChar;
                            state.currentToken = currentToken;
                            state.index = index;
                            values.push(parse(state, 0, 449));
                        }
                    }
                    else {
                        error(state);
                    }
                    if (state.currentToken !== 917513) {
                        expect(state, 262155);
                    }
                }
                expect(state, 917513);
                result = new ObjectLiteralExpression(keys, values);
                state.assignable = false;
                break;
            case 8233:
                result = new TemplateExpression([state.tokenValue]);
                state.assignable = false;
                nextToken(state);
                break;
            case 8234:
                const cooked = [state.tokenValue];
                expect(state, 8234);
                const expressions = [parse(state, access, 62)];
                while ((state.currentToken = scanTemplateTail(state)) !== 8233) {
                    cooked.push(state.tokenValue);
                    expect(state, 8234);
                    expressions.push(parse(state, access, 62));
                }
                cooked.push(state.tokenValue);
                nextToken(state);
                result = new TemplateExpression(cooked, expressions);
                state.assignable = false;
                break;
            case 2048:
            case 4096:
                result = new PrimitiveLiteralExpression(state.tokenValue);
                state.assignable = false;
                nextToken(state);
                break;
            case 1026:
            case 1027:
            case 1025:
            case 1024:
                result = TokenValues[state.currentToken & 63];
                state.assignable = false;
                nextToken(state);
                break;
            default:
                if (state.index >= state.length) {
                    error(state, 'Unexpected end of expression');
                }
                else {
                    error(state);
                }
        }
        if (448 < minPrecedence)
            return result;
        let name = state.tokenValue;
        while (state.currentToken & 8192) {
            switch (state.currentToken) {
                case 8200:
                    state.assignable = true;
                    nextToken(state);
                    if (!(state.currentToken & 1536)) {
                        error(state);
                    }
                    name = state.tokenValue;
                    nextToken(state);
                    access = ((access & (512 | 1024)) << 1) | (access & 2048) | ((access & 4096) >> 1);
                    if (state.currentToken === 335878) {
                        continue;
                    }
                    if (access & 1024) {
                        result = new AccessScopeExpression(name, result.ancestor);
                    }
                    else {
                        result = new AccessMemberExpression(result, name);
                    }
                    continue;
                case 335884:
                    state.assignable = true;
                    nextToken(state);
                    access = 4096;
                    result = new AccessKeyedExpression(result, parse(state, 0, 63));
                    expect(state, 655373);
                    break;
                case 335878:
                    state.assignable = false;
                    nextToken(state);
                    const args = new Array();
                    while (state.currentToken !== 917514) {
                        args.push(parse(state, 0, 63));
                        if (!optional(state, 262155)) {
                            break;
                        }
                    }
                    expect(state, 917514);
                    if (access & 1024) {
                        result = new CallScopeExpression(name, args, result.ancestor);
                    }
                    else if (access & 2048) {
                        result = new CallMemberExpression(result, name, args);
                    }
                    else {
                        result = new CallFunctionExpression(result, args);
                    }
                    access = 0;
                    break;
                case 8233:
                    state.assignable = false;
                    result = new TaggedTemplateExpression([state.tokenValue], [state.tokenRaw], result);
                    nextToken(state);
                    break;
                case 8234:
                    state.assignable = false;
                    const cooked = [state.tokenValue];
                    const raw = [state.tokenRaw];
                    expect(state, 8234);
                    const expressions = [parse(state, access, 62)];
                    while ((state.currentToken = scanTemplateTail(state)) !== 8233) {
                        cooked.push(state.tokenValue);
                        raw.push(state.tokenRaw);
                        expect(state, 8234);
                        expressions.push(parse(state, access, 62));
                    }
                    cooked.push(state.tokenValue);
                    raw.push(state.tokenRaw);
                    nextToken(state);
                    result = new TaggedTemplateExpression(cooked, raw, result, expressions);
                default:
            }
        }
    }
    if (448 < minPrecedence)
        return result;
    while (state.currentToken & 32768) {
        const opToken = state.currentToken;
        if ((opToken & 448) < minPrecedence) {
            break;
        }
        nextToken(state);
        result = new BinaryExpression(TokenValues[opToken & 63], result, parse(state, access, opToken & 448));
        state.assignable = false;
    }
    if (63 < minPrecedence)
        return result;
    if (optional(state, 15)) {
        const yes = parse(state, access, 62);
        expect(state, 262158);
        result = new ConditionalExpression(result, yes, parse(state, access, 62));
        state.assignable = false;
    }
    if (optional(state, 39)) {
        if (!state.assignable) {
            error(state, `Expression ${state.input.slice(exprStart, state.startIndex)} is not assignable`);
        }
        exprStart = state.index;
        result = new AssignmentExpression(result, parse(state, access, 62));
    }
    if (61 < minPrecedence)
        return result;
    while (optional(state, 262163)) {
        const name = state.tokenValue;
        nextToken(state);
        const args = new Array();
        while (optional(state, 262158)) {
            args.push(parse(state, access, 62));
        }
        result = new ValueConverterExpression(result, name, args);
    }
    while (optional(state, 262160)) {
        const name = state.tokenValue;
        nextToken(state);
        const args = new Array();
        while (optional(state, 262158)) {
            args.push(parse(state, access, 62));
        }
        result = new BindingBehaviorExpression(result, name, args);
    }
    if (state.currentToken !== 786432) {
        error(state, `Unconsumed token ${state.tokenRaw}`);
    }
    return result;
}
function nextToken(state) {
    while (state.index < state.length) {
        state.startIndex = state.index;
        if ((state.currentToken = CharScanners[state.currentChar](state)) !== null) {
            return;
        }
    }
    state.currentToken = 786432;
}
function nextChar(state) {
    return state.currentChar = state.input.charCodeAt(++state.index);
}
function scanIdentifier(state) {
    while (IdParts[nextChar(state)]) { }
    return KeywordLookup[state.tokenValue = state.tokenRaw] || 512;
}
function scanNumber(state, isFloat) {
    if (isFloat) {
        state.tokenValue = 0;
    }
    else {
        state.tokenValue = state.currentChar - 48;
        while (nextChar(state) <= 57 && state.currentChar >= 48) {
            state.tokenValue = state.tokenValue * 10 + state.currentChar - 48;
        }
    }
    if (isFloat || state.currentChar === 46) {
        if (!isFloat) {
            nextChar(state);
        }
        const start = state.index;
        let value = state.currentChar - 48;
        while (nextChar(state) <= 57 && state.currentChar >= 48) {
            value = value * 10 + state.currentChar - 48;
        }
        state.tokenValue = state.tokenValue + value / Math.pow(10, (state.index - start));
    }
    return 4096;
}
function scanString(state) {
    const quote = state.currentChar;
    nextChar(state);
    let unescaped = 0;
    const buffer = new Array();
    let marker = state.index;
    while (state.currentChar !== quote) {
        if (state.currentChar === 92) {
            buffer.push(state.input.slice(marker, state.index));
            nextChar(state);
            unescaped = unescape(state.currentChar);
            nextChar(state);
            buffer.push(String.fromCharCode(unescaped));
            marker = state.index;
        }
        else if (state.currentChar === 0) {
            error(state, 'Unterminated quote');
        }
        else {
            nextChar(state);
        }
    }
    const last = state.input.slice(marker, state.index);
    nextChar(state);
    let unescapedStr = last;
    if (buffer !== null && buffer !== undefined) {
        buffer.push(last);
        unescapedStr = buffer.join('');
    }
    state.tokenValue = unescapedStr;
    return 2048;
}
function scanTemplate(state) {
    let tail = true;
    let result = '';
    while (nextChar(state) !== 96) {
        if (state.currentChar === 36) {
            if ((state.index + 1) < state.length && state.input.charCodeAt(state.index + 1) === 123) {
                state.index++;
                tail = false;
                break;
            }
            else {
                result += '$';
            }
        }
        else if (state.currentChar === 92) {
            result += String.fromCharCode(unescape(nextChar(state)));
        }
        else {
            result += String.fromCharCode(state.currentChar);
        }
    }
    nextChar(state);
    state.tokenValue = result;
    if (tail) {
        return 8233;
    }
    return 8234;
}
function scanTemplateTail(state) {
    if (state.index >= state.length) {
        error(state, 'Unterminated template');
    }
    state.index--;
    return scanTemplate(state);
}
function error(state, message = `Unexpected token ${state.tokenRaw}`, column = state.startIndex) {
    throw new Error(`Parser Error: ${message} at column ${column} in expression [${state.input}]`);
}
function optional(state, token) {
    if (state.currentToken === token) {
        nextToken(state);
        return true;
    }
    return false;
}
function expect(state, token) {
    if (state.currentToken === token) {
        nextToken(state);
    }
    else {
        error(state, `Missing expected token ${TokenValues[token & 63]}`, state.index);
    }
}
function unescape(code) {
    switch (code) {
        case 98: return 8;
        case 116: return 9;
        case 110: return 10;
        case 118: return 11;
        case 102: return 12;
        case 114: return 13;
        case 34: return 34;
        case 39: return 39;
        case 92: return 92;
        default: return code;
    }
}
const $false = new PrimitiveLiteralExpression(false);
const $true = new PrimitiveLiteralExpression(true);
const $null = new PrimitiveLiteralExpression(null);
const $undefined = new PrimitiveLiteralExpression(undefined);
const TokenValues = [
    $false, $true, $null, $undefined, '$this', '$parent',
    '(', '{', '.', '}', ')', ',', '[', ']', ':', '?', '\'', '"',
    '&', '|', '||', '&&', '==', '!=', '===', '!==', '<', '>',
    '<=', '>=', 'in', 'instanceof', '+', '-', 'typeof', 'void', '*', '%', '/', '=', '!',
    8233, 8234
];
const KeywordLookup = Object.create(null);
KeywordLookup.true = 1025;
KeywordLookup.null = 1026;
KeywordLookup.false = 1024;
KeywordLookup.undefined = 1027;
KeywordLookup.$this = 1540;
KeywordLookup.$parent = 1541;
KeywordLookup.in = 34142;
KeywordLookup.instanceof = 34143;
KeywordLookup.typeof = 17442;
KeywordLookup.void = 17443;
const codes = {
    AsciiIdPart: [0x24, 0, 0x30, 0x3A, 0x41, 0x5B, 0x5F, 0, 0x61, 0x7B],
    IdStart: [0x24, 0, 0x41, 0x5B, 0x5F, 0, 0x61, 0x7B, 0xAA, 0, 0xBA, 0, 0xC0, 0xD7, 0xD8, 0xF7, 0xF8, 0x2B9, 0x2E0, 0x2E5, 0x1D00, 0x1D26, 0x1D2C, 0x1D5D, 0x1D62, 0x1D66, 0x1D6B, 0x1D78, 0x1D79, 0x1DBF, 0x1E00, 0x1F00, 0x2071, 0, 0x207F, 0, 0x2090, 0x209D, 0x212A, 0x212C, 0x2132, 0, 0x214E, 0, 0x2160, 0x2189, 0x2C60, 0x2C80, 0xA722, 0xA788, 0xA78B, 0xA7AF, 0xA7B0, 0xA7B8, 0xA7F7, 0xA800, 0xAB30, 0xAB5B, 0xAB5C, 0xAB65, 0xFB00, 0xFB07, 0xFF21, 0xFF3B, 0xFF41, 0xFF5B],
    Digit: [0x30, 0x3A],
    Skip: [0, 0x21, 0x7F, 0xA1]
};
function decompress(lookup, set, compressed, value) {
    const rangeCount = compressed.length;
    for (let i = 0; i < rangeCount; i += 2) {
        const start = compressed[i];
        let end = compressed[i + 1];
        end = end > 0 ? end : start + 1;
        if (lookup) {
            lookup.fill(value, start, end);
        }
        if (set) {
            for (let ch = start; ch < end; ch++) {
                set.add(ch);
            }
        }
    }
}
function returnToken(token) {
    return s => {
        nextChar(s);
        return token;
    };
}
const unexpectedCharacter = s => {
    error(s, `Unexpected character [${String.fromCharCode(s.currentChar)}]`);
    return null;
};
unexpectedCharacter.notMapped = true;
const AsciiIdParts = new Set();
decompress(null, AsciiIdParts, codes.AsciiIdPart, true);
const IdParts = new Uint8Array(0xFFFF);
decompress(IdParts, null, codes.IdStart, 1);
decompress(IdParts, null, codes.Digit, 1);
const CharScanners = new Array(0xFFFF);
CharScanners.fill(unexpectedCharacter, 0, 0xFFFF);
decompress(CharScanners, null, codes.Skip, s => {
    nextChar(s);
    return null;
});
decompress(CharScanners, null, codes.IdStart, scanIdentifier);
decompress(CharScanners, null, codes.Digit, s => scanNumber(s, false));
CharScanners[34] =
    CharScanners[39] = s => {
        return scanString(s);
    };
CharScanners[96] = s => {
    return scanTemplate(s);
};
CharScanners[33] = s => {
    if (nextChar(s) !== 61) {
        return 16424;
    }
    if (nextChar(s) !== 61) {
        return 33047;
    }
    nextChar(s);
    return 33049;
};
CharScanners[61] = s => {
    if (nextChar(s) !== 61) {
        return 39;
    }
    if (nextChar(s) !== 61) {
        return 33046;
    }
    nextChar(s);
    return 33048;
};
CharScanners[38] = s => {
    if (nextChar(s) !== 38) {
        return 262160;
    }
    nextChar(s);
    return 32981;
};
CharScanners[124] = s => {
    if (nextChar(s) !== 124) {
        return 262163;
    }
    nextChar(s);
    return 32916;
};
CharScanners[46] = s => {
    if (nextChar(s) <= 57 && s.currentChar >= 48) {
        return scanNumber(s, true);
    }
    return 8200;
};
CharScanners[60] = s => {
    if (nextChar(s) !== 61) {
        return 33114;
    }
    nextChar(s);
    return 33116;
};
CharScanners[62] = s => {
    if (nextChar(s) !== 61) {
        return 33115;
    }
    nextChar(s);
    return 33117;
};
CharScanners[37] = returnToken(33253);
CharScanners[40] = returnToken(335878);
CharScanners[41] = returnToken(917514);
CharScanners[42] = returnToken(33252);
CharScanners[43] = returnToken(49568);
CharScanners[44] = returnToken(262155);
CharScanners[45] = returnToken(49569);
CharScanners[47] = returnToken(33254);
CharScanners[58] = returnToken(262158);
CharScanners[63] = returnToken(15);
CharScanners[91] = returnToken(335884);
CharScanners[93] = returnToken(655373);
CharScanners[123] = returnToken(65543);
CharScanners[125] = returnToken(917513);

var __decorate$1 = (undefined && undefined.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata$1 = (undefined && undefined.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
const propertyAccessor = {
    getValue: (obj, propertyName) => obj[propertyName],
    setValue: (value, obj, propertyName) => {
        obj[propertyName] = value;
    }
};
class PrimitiveObserver {
    constructor(primitive, propertyName) {
        this.doNotCache = true;
        this.primitive = primitive;
        this.propertyName = propertyName;
    }
    getValue() {
        return this.primitive[this.propertyName];
    }
    setValue() {
        const type = typeof this.primitive;
        throw new Error(`The ${this.propertyName} property of a ${type} (${this.primitive}) cannot be assigned.`);
    }
    subscribe() { }
    unsubscribe() { }
}
exports.SetterObserver = class SetterObserver {
    constructor(taskQueue, obj, propertyName) {
        this.taskQueue = taskQueue;
        this.obj = obj;
        this.propertyName = propertyName;
        this.queued = false;
        this.observing = false;
    }
    getValue() {
        return this.obj[this.propertyName];
    }
    setValue(newValue) {
        this.obj[this.propertyName] = newValue;
    }
    getterValue() {
        return this.currentValue;
    }
    setterValue(newValue) {
        const oldValue = this.currentValue;
        if (oldValue !== newValue) {
            if (!this.queued) {
                this.oldValue = oldValue;
                this.queued = true;
                this.taskQueue.queueMicroTask(this);
            }
            this.currentValue = newValue;
        }
    }
    call(flags) {
        const oldValue = this.oldValue;
        const newValue = this.currentValue;
        this.queued = false;
        this.callSubscribers(newValue, oldValue, flags);
    }
    subscribe(context, callable) {
        if (!this.observing) {
            this.convertProperty();
        }
        this.addSubscriber(context, callable);
    }
    unsubscribe(context, callable) {
        this.removeSubscriber(context, callable);
    }
    convertProperty() {
        this.observing = true;
        this.currentValue = this.obj[this.propertyName];
        this.setValue = this.setterValue;
        this.getValue = this.getterValue;
        if (!Reflect.defineProperty(this.obj, this.propertyName, {
            configurable: true,
            enumerable: this.propertyName in this.obj ? this.obj.propertyIsEnumerable(this.propertyName) : true,
            get: this.getValue.bind(this),
            set: this.setValue.bind(this)
        })) {
            console.warn(`Cannot observe property '${this.propertyName}' of object`, this.obj);
        }
    }
};
exports.SetterObserver = __decorate$1([
    subscriberCollection(),
    __metadata$1("design:paramtypes", [aureliaTaskQueue.TaskQueue, Object, String])
], exports.SetterObserver);

const mapProto = Map.prototype;
function getMapObserver(taskQueue, map) {
    return ModifyMapObserver.for(taskQueue, map);
}
class ModifyMapObserver extends exports.ModifyCollectionObserver {
    constructor(taskQueue, map) {
        super(taskQueue, map);
    }
    static for(taskQueue, map) {
        if (!('__map_observer__' in map)) {
            Reflect.defineProperty(map, '__map_observer__', {
                value: ModifyMapObserver.create(taskQueue, map),
                enumerable: false,
                configurable: false
            });
        }
        return map.__map_observer__;
    }
    static create(taskQueue, map) {
        const observer = new ModifyMapObserver(taskQueue, map);
        let proto = mapProto;
        if (proto.set !== map.set || proto.delete !== map.delete || proto.clear !== map.clear) {
            proto = {
                set: map.set,
                delete: map.delete,
                clear: map.clear
            };
        }
        map.set = function () {
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
        map.delete = function () {
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
        map.clear = function () {
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

const setProto = Set.prototype;
function getSetObserver(taskQueue, set) {
    return ModifySetObserver.for(taskQueue, set);
}
class ModifySetObserver extends exports.ModifyCollectionObserver {
    constructor(taskQueue, set) {
        super(taskQueue, set);
    }
    static for(taskQueue, set) {
        if (!('__set_observer__' in set)) {
            Reflect.defineProperty(set, '__set_observer__', {
                value: ModifySetObserver.create(taskQueue, set),
                enumerable: false,
                configurable: false
            });
        }
        return set.__set_observer__;
    }
    static create(taskQueue, set) {
        const observer = new ModifySetObserver(taskQueue, set);
        let proto = setProto;
        if (proto.add !== set.add || proto.delete !== set.delete || proto.clear !== set.clear) {
            proto = {
                add: set.add,
                delete: set.delete,
                clear: set.clear
            };
        }
        set.add = function () {
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
        set.delete = function () {
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
        set.clear = function () {
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

class ObserverLocator {
    constructor(taskQueue, eventManager, parser) {
        this.taskQueue = taskQueue;
        this.eventManager = eventManager;
        this.parser = parser;
        this.adapters = [];
    }
    getObserver(obj, propertyName) {
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
    getOrCreateObserversLookup(obj) {
        return obj.__observers__ || this.createObserversLookup(obj);
    }
    createObserversLookup(obj) {
        const value = {};
        if (!Reflect.defineProperty(obj, '__observers__', {
            enumerable: false,
            configurable: false,
            writable: false,
            value: value
        })) ;
        return value;
    }
    addAdapter(adapter) {
        this.adapters.push(adapter);
    }
    getAdapterObserver(obj, propertyName, descriptor) {
        for (let i = 0, ii = this.adapters.length; i < ii; i++) {
            const adapter = this.adapters[i];
            const observer = adapter.getObserver(obj, propertyName, descriptor);
            if (observer) {
                return observer;
            }
        }
        return null;
    }
    createPropertyObserver(obj, propertyName) {
        let descriptor;
        if (!(obj instanceof Object)) {
            return new PrimitiveObserver(obj, propertyName);
        }
        descriptor = Object.getOwnPropertyDescriptor(obj, propertyName);
        if (descriptor) {
            const existingGetterOrSetter = descriptor.get || descriptor.set;
            if (existingGetterOrSetter) {
                if (existingGetterOrSetter.getObserver) {
                    return existingGetterOrSetter.getObserver(obj);
                }
                const adapterObserver = this.getAdapterObserver(obj, propertyName, descriptor);
                if (adapterObserver) {
                    return adapterObserver;
                }
            }
        }
        if (obj instanceof Array) {
            if (propertyName === 'length') {
                return this.getArrayObserver(obj).getLengthObserver();
            }
        }
        else if (obj instanceof Map) {
            if (propertyName === 'size') {
                return this.getMapObserver(obj).getLengthObserver();
            }
        }
        else if (obj instanceof Set) {
            if (propertyName === 'size') {
                return this.getSetObserver(obj).getLengthObserver();
            }
        }
        return new exports.SetterObserver(this.taskQueue, obj, propertyName);
    }
    getAccessor(obj, propertyName) {
        if (obj instanceof aureliaPal.DOM.Element) {
            if (propertyName === 'class' ||
                propertyName === 'style' ||
                propertyName === 'css' ||
                (propertyName === 'value' &&
                    (obj.tagName.toLowerCase() === 'input' || obj.tagName.toLowerCase() === 'select')) ||
                (propertyName === 'checked' && obj.tagName.toLowerCase() === 'input') ||
                (propertyName === 'model' && obj.tagName.toLowerCase() === 'input') ||
                /^xlink:.+$/.exec(propertyName)) {
                return this.getObserver(obj, propertyName);
            }
        }
        return propertyAccessor;
    }
    getArrayObserver(array) {
        return getArrayObserver(this.taskQueue, array);
    }
    getMapObserver(map) {
        return getMapObserver(this.taskQueue, map);
    }
    getSetObserver(set) {
        return getSetObserver(this.taskQueue, set);
    }
}
ObserverLocator.inject = [aureliaTaskQueue.TaskQueue, EventManager, Parser];

const targetContext = 'Binding:target';
const sourceContext = 'Binding:source';

const slotNames = new Array();
const versionSlotNames = new Array();
for (let i = 0; i < 100; i++) {
    slotNames.push(`_observer${i}`);
    versionSlotNames.push(`_observerVersion${i}`);
}
function addObserver(observer) {
    const observerSlots = this._observerSlots === undefined ? 0 : this._observerSlots;
    let i = observerSlots;
    while (i-- && this[slotNames[i]] !== observer) {
    }
    if (i === -1) {
        i = 0;
        while (this[slotNames[i]]) {
            i++;
        }
        this[slotNames[i]] = observer;
        observer.subscribe(sourceContext, this);
        if (i === observerSlots) {
            this._observerSlots = i + 1;
        }
    }
    if (this._version === undefined) {
        this._version = 0;
    }
    this[versionSlotNames[i]] = this._version;
}
function observeProperty(obj, propertyName) {
    const observer = this.observerLocator.getObserver(obj, propertyName);
    addObserver.call(this, observer);
}
function observeArray(array) {
    const observer = this.observerLocator.getArrayObserver(array);
    addObserver.call(this, observer);
}
function unobserve(all) {
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
function connectable() {
    return function (target) {
        target.prototype.observeProperty = observeProperty;
        target.prototype.observeArray = observeArray;
        target.prototype.unobserve = unobserve;
        target.prototype.addObserver = addObserver;
    };
}

const queue = new Array();
const queued = {};
let nextId = 0;
const minimumImmediate = 100;
const frameBudget = 15;
let isFlushRequested = false;
let immediate = 0;
function flush(animationFrameStart) {
    const length = queue.length;
    let i = 0;
    while (i < length) {
        const binding = queue[i];
        queued[binding.__connectQueueId] = false;
        binding.connect(true);
        i++;
        if (i % 100 === 0 && aureliaPal.PLATFORM.performance.now() - animationFrameStart > frameBudget) {
            break;
        }
    }
    queue.splice(0, i);
    if (queue.length) {
        aureliaPal.PLATFORM.requestAnimationFrame(flush);
    }
    else {
        isFlushRequested = false;
        immediate = 0;
    }
}
function enqueueBindingConnect(binding, flags) {
    if (immediate < minimumImmediate) {
        immediate++;
        binding.connect(false, flags);
    }
    else {
        let id = binding.__connectQueueId;
        if (id === undefined) {
            id = nextId;
            nextId++;
            binding.__connectQueueId = id;
        }
        if (!queued[id]) {
            queue.push(binding);
            queued[id] = true;
        }
    }
    if (!isFlushRequested) {
        isFlushRequested = true;
        aureliaPal.PLATFORM.requestAnimationFrame(flush);
    }
}

var __decorate$2 = (undefined && undefined.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata$2 = (undefined && undefined.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
class BindingExpression {
    constructor(observerLocator, targetProperty, sourceExpression, mode, lookupFunctions, attribute) {
        this.observerLocator = observerLocator;
        this.targetProperty = targetProperty;
        this.sourceExpression = sourceExpression;
        this.mode = mode;
        this.lookupFunctions = lookupFunctions;
        this.attribute = attribute;
        this.discrete = false;
    }
    createBinding(target) {
        return new exports.Binding(this.observerLocator, this.sourceExpression, target, this.targetProperty, this.mode, this.lookupFunctions);
    }
}
exports.Binding = class Binding {
    constructor(observerLocator, sourceExpression, target, targetProperty, mode, lookupFunctions) {
        this.observerLocator = observerLocator;
        this.sourceExpression = sourceExpression;
        this.target = target;
        this.targetProperty = targetProperty;
        this.mode = mode;
        this.lookupFunctions = lookupFunctions;
    }
    updateTarget(value) {
        this.targetObserver.setValue(value, this.target, this.targetProperty);
    }
    updateSource(value, flags) {
        this.sourceExpression.assign(this.source, value, this.lookupFunctions, flags);
    }
    call(context, newValue, oldValue, flags) {
        if (!this.isBound) {
            return;
        }
        if (context === sourceContext) {
            oldValue = this.targetObserver.getValue(this.target, this.targetProperty);
            newValue = this.sourceExpression.evaluate(this.source, this.lookupFunctions, flags);
            if (newValue !== oldValue) {
                this.updateTarget(newValue);
            }
            if (this.mode !== exports.bindingMode.oneTime) {
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
    bind(source, flags) {
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
            if (mode & exports.bindingMode.fromView) {
                this.targetObserver = this.observerLocator.getObserver(this.target, this.targetProperty);
            }
            else {
                this.targetObserver = this.observerLocator.getAccessor(this.target, this.targetProperty);
            }
        }
        if ('bind' in this.targetObserver) {
            this.targetObserver.bind();
        }
        if (this.mode !== exports.bindingMode.fromView) {
            const value = this.sourceExpression.evaluate(source, this.lookupFunctions, flags);
            this.updateTarget(value);
        }
        if (mode === exports.bindingMode.oneTime) {
            return;
        }
        else if (mode === exports.bindingMode.toView) {
            enqueueBindingConnect(this, flags);
        }
        else if (mode === exports.bindingMode.twoWay) {
            this.sourceExpression.connect(this, source, flags);
            this.targetObserver.subscribe(targetContext, this);
        }
        else if (mode === exports.bindingMode.fromView) {
            this.targetObserver.subscribe(targetContext, this);
        }
    }
    unbind(flags) {
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
    connect(evaluate, flags) {
        if (!this.isBound) {
            return;
        }
        if (evaluate) {
            const value = this.sourceExpression.evaluate(this.source, this.lookupFunctions, flags);
            this.updateTarget(value);
        }
        this.sourceExpression.connect(this, this.source, flags);
    }
};
exports.Binding = __decorate$2([
    connectable(),
    __metadata$2("design:paramtypes", [ObserverLocator, Object, Object, String, Number, Object])
], exports.Binding);

const emptyLookupFunctions = {
    bindingBehaviors: (name) => null,
    valueConverters: (name) => null
};
class BindingEngine {
    constructor(observerLocator, parser) {
        this.observerLocator = observerLocator;
        this.parser = parser;
    }
    createBindingExpression(targetProperty, sourceExpression, mode = exports.bindingMode.toView, lookupFunctions = emptyLookupFunctions) {
        return new BindingExpression(this.observerLocator, targetProperty, this.parser.parse(sourceExpression), mode, lookupFunctions, undefined);
    }
    propertyObserver(obj, propertyName) {
        return {
            subscribe: (callback) => {
                const observer = this.observerLocator.getObserver(obj, propertyName);
                observer.subscribe(observer, callback);
                return {
                    dispose: () => observer.unsubscribe(observer, callback)
                };
            }
        };
    }
    collectionObserver(collection) {
        return {
            subscribe: (callback) => {
                let observer;
                if (collection instanceof Array) {
                    observer = this.observerLocator.getArrayObserver(collection);
                }
                else if (collection instanceof Map) {
                    observer = this.observerLocator.getMapObserver(collection);
                }
                else if (collection instanceof Set) {
                    observer = this.observerLocator.getSetObserver(collection);
                }
                else {
                    throw new Error('collection must be an instance of Array, Map or Set.');
                }
                observer.subscribe(observer, callback);
                return {
                    dispose: () => observer.unsubscribe(observer, callback)
                };
            }
        };
    }
    parseExpression(expression) {
        return this.parser.parse(expression);
    }
    registerAdapter(adapter) {
        this.observerLocator.addAdapter(adapter);
    }
}
BindingEngine.inject = [ObserverLocator, Parser];

exports.getArrayObserver = getArrayObserver;
exports.BindingBehaviorExpression = BindingBehaviorExpression;
exports.ValueConverterExpression = ValueConverterExpression;
exports.AssignmentExpression = AssignmentExpression;
exports.ConditionalExpression = ConditionalExpression;
exports.AccessThisExpression = AccessThisExpression;
exports.AccessScopeExpression = AccessScopeExpression;
exports.AccessMemberExpression = AccessMemberExpression;
exports.AccessKeyedExpression = AccessKeyedExpression;
exports.CallScopeExpression = CallScopeExpression;
exports.CallMemberExpression = CallMemberExpression;
exports.CallFunctionExpression = CallFunctionExpression;
exports.BinaryExpression = BinaryExpression;
exports.UnaryExpression = UnaryExpression;
exports.PrimitiveLiteralExpression = PrimitiveLiteralExpression;
exports.TemplateExpression = TemplateExpression;
exports.TaggedTemplateExpression = TaggedTemplateExpression;
exports.ArrayLiteralExpression = ArrayLiteralExpression;
exports.ObjectLiteralExpression = ObjectLiteralExpression;
exports.BindingEngine = BindingEngine;
exports.BindingExpression = BindingExpression;
exports.connectable = connectable;
exports.getMapObserver = getMapObserver;
exports.ObserverLocator = ObserverLocator;
exports.Parser = Parser;
exports.propertyAccessor = propertyAccessor;
exports.PrimitiveObserver = PrimitiveObserver;
exports.createOverrideContext = createOverrideContext;
exports.getContextFor = getContextFor;
exports.createScopeForTest = createScopeForTest;
exports.getSetObserver = getSetObserver;
exports.subscriberCollection = subscriberCollection;

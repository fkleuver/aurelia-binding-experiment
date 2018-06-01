export interface Splice {
  index: number;
  removed: any[];
  addedCount: number;
}

export interface ArrayChangeRecord {
  type: string;
  name: any;
  oldValue: any;
  index: number;
  removed: any[];
  addedCount: number;
}

function newSplice(index: number, removed: any[], addedCount: number): Splice {
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
  // Note: This function is *based* on the computation of the Levenshtein
  // "edit" distance. The one change is that "updates" are treated as two
  // edits - not one. With Array splices, an update is really a delete
  // followed by an add. By retaining this, we optimize for "keeping" the
  // maximum array items in the original array. For example:
  //
  //   'xxxx123' -> '123yyyy'
  //
  // With 1-edit updates, the shortest path would be just to update all seven
  // characters. With 2-edit updates, we delete 4, leave 3, and add 4. This
  // leaves the substring '123' intact.
  public calcEditDistances(current: Array<number>, currentStart: number, currentEnd: number, old: Array<number>, oldStart: number, oldEnd: number): Array<Array<number>> {
    // "Deletion" columns
    const rowCount = oldEnd - oldStart + 1;
    const columnCount = currentEnd - currentStart + 1;
    const distances = new Array<Array<number>>(rowCount);
    let north;
    let west;

    // "Addition" rows. Initialize null column.
    for (let i = 0; i < rowCount; ++i) {
      distances[i] = new Array(columnCount);
      distances[i][0] = i;
    }

    // Initialize null row
    for (let j = 0; j < columnCount; ++j) {
      distances[0][j] = j;
    }

    for (let i = 1; i < rowCount; ++i) {
      for (let j = 1; j < columnCount; ++j) {
        if (this.equals(current[currentStart + j - 1], old[oldStart + i - 1])) {
          distances[i][j] = distances[i - 1][j - 1];
        } else {
          north = distances[i - 1][j] + 1;
          west = distances[i][j - 1] + 1;
          distances[i][j] = north < west ? north : west;
        }
      }
    }

    return distances;
  }

  // This starts at the final weight, and walks "backward" by finding
  // the minimum previous weight recursively until the origin of the weight
  // matrix.
  public spliceOperationsFromEditDistances(distances: Array<Array<number>>): Array<number> {
    let i = distances.length - 1;
    let j = distances[0].length - 1;
    let current = distances[i][j];
    const edits = new Array<any>();
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
      } else {
        min = north < northWest ? north : northWest;
      }

      if (min === northWest) {
        if (northWest === current) {
          edits.push(EDIT_LEAVE);
        } else {
          edits.push(EDIT_UPDATE);
          current = northWest;
        }
        i--;
        j--;
      } else if (min === west) {
        edits.push(EDIT_DELETE);
        i--;
        current = west;
      } else {
        edits.push(EDIT_ADD);
        j--;
        current = north;
      }
    }

    edits.reverse();
    return edits;
  }

  /**
   * Splice Projection functions:
   *
   * A splice map is a representation of how a previous array of items
   * was transformed into a new array of items. Conceptually it is a list of
   * tuples of
   *
   *   <index, removed, addedCount>
   *
   * which are kept in ascending index order of. The tuple represents that at
   * the |index|, |removed| sequence of items were removed, and counting forward
   * from |index|, |addedCount| items were added.
   */

  /**
   * Lacking individual splice mutation information, the minimal set of
   * splices can be synthesized given the previous state and final state of an
   * array. The basic approach is to calculate the edit distance matrix and
   * choose the shortest path through it.
   *
   * Complexity: O(l * p)
   *   l: The length of the current array
   *   p: The length of the old array
   */
  public calcSplices(current: Array<number>, currentStart: number, currentEnd: number, old: Array<number>, oldStart: number, oldEnd: number): Array<Splice> {
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

    let splice: Splice = <any>undefined;
    if (currentStart === currentEnd) {
      splice = newSplice(currentStart, [], 0);
      while (oldStart < oldEnd) {
        splice.removed.push(old[oldStart++]);
      }

      return [splice];
    } else if (oldStart === oldEnd) {
      return [newSplice(currentStart, [], currentEnd - currentStart)];
    }

    const ops = this.spliceOperationsFromEditDistances(
      this.calcEditDistances(current, currentStart, currentEnd, old, oldStart, oldEnd)
    );

    splice = <any>undefined;
    const splices = new Array<any>();
    let index = currentStart;
    let oldIndex = oldStart;
    for (let i = 0; i < ops.length; ++i) {
      switch (ops[i]) {
        case EDIT_LEAVE:
          if (splice) {
            splices.push(splice);
            splice = <any>undefined;
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

  public sharedPrefix(current: Array<number>, old: Array<number>, searchLength: number): number {
    for (let i = 0; i < searchLength; ++i) {
      if (!this.equals(current[i], old[i])) {
        return i;
      }
    }

    return searchLength;
  }

  public sharedSuffix(current: Array<number>, old: Array<number>, searchLength: number): number {
    let index1 = current.length;
    let index2 = old.length;
    let count = 0;
    while (count < searchLength && this.equals(current[--index1], old[--index2])) {
      count++;
    }

    return count;
  }

  public calculateSplices(current: Array<number>, previous: Array<number>): ReturnType<typeof calcSplices> {
    return this.calcSplices(current, 0, current.length, previous, 0, previous.length);
  }

  public equals(currentValue: any, previousValue: any): boolean {
    return currentValue === previousValue;
  }
}

const arraySplice = new ArraySplice();

export function calcSplices(current: Array<number>, currentStart: number, currentEnd: number, old: Array<number>, oldStart: number, oldEnd: number): Array<Splice> {
  return arraySplice.calcSplices(current, currentStart, currentEnd, old, oldStart, oldEnd);
}

function intersect(start1: number, end1: number, start2: number, end2: number): number {
  // Disjoint
  if (end1 < start2 || end2 < start1) {
    return -1;
  }

  // Adjacent
  if (end1 === start2 || end2 === start1) {
    return 0;
  }

  // Non-zero intersect, span1 first
  if (start1 < start2) {
    if (end1 < end2) {
      return end1 - start2; // Overlap
    }

    return end2 - start2; // Contained
  }

  // Non-zero intersect, span2 first
  if (end2 < end1) {
    return end2 - start1; // Overlap
  }

  return end1 - start1; // Contained
}

export function mergeSplice(splices: Array<Splice>, index: number, removed: any[], addedCount: number): void {
  const splice = newSplice(index, removed, addedCount);

  let inserted = false;
  let insertionOffset = 0;

  for (let i = 0; i < splices.length; i++) {
    const current = splices[i];
    current.index += insertionOffset;

    if (inserted) {
      continue;
    }

    const intersectCount = intersect(
      splice.index,
      splice.index + splice.removed.length,
      current.index,
      current.index + current.addedCount
    );

    if (intersectCount >= 0) {
      // Merge the two splices

      splices.splice(i, 1);
      i--;

      insertionOffset -= current.addedCount - current.removed.length;

      splice.addedCount += current.addedCount - intersectCount;
      const deleteCount = splice.removed.length + current.removed.length - intersectCount;

      if (!splice.addedCount && !deleteCount) {
        // merged splice is a noop. discard.
        inserted = true;
      } else {
        let currentRemoved = current.removed;

        if (splice.index < current.index) {
          // some prefix of splice.removed is prepended to current.removed.
          const prepend = splice.removed.slice(0, current.index - splice.index);
          Array.prototype.push.apply(prepend, currentRemoved);
          currentRemoved = prepend;
        }

        if (splice.index + splice.removed.length > current.index + current.addedCount) {
          // some suffix of splice.removed is appended to current.removed.
          const append = splice.removed.slice(current.index + current.addedCount - splice.index);
          Array.prototype.push.apply(currentRemoved, append);
        }

        splice.removed = currentRemoved;
        if (current.index < splice.index) {
          splice.index = current.index;
        }
      }
    } else if (splice.index < current.index) {
      // Insert splice here.

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

function createInitialSplices(array: Array<any>, changeRecords: Array<ArrayChangeRecord>): Array<Splice> {
  const splices = new Array<Splice>();

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
          // isIndex
          continue;
        }

        const index = +record.name; // toNumber
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

export function projectArraySplices(array: Array<any>, changeRecords: Array<ArrayChangeRecord>): Array<Splice> {
  let splices = new Array<any>();

  createInitialSplices(array, changeRecords).forEach(function(splice) {
    if (splice.addedCount === 1 && splice.removed.length === 1) {
      if (splice.removed[0] !== array[splice.index]) {
        splices.push(splice);
      }

      return;
    }

    splices = splices.concat(
      calcSplices(array, splice.index, splice.index + splice.addedCount, splice.removed, 0, splice.removed.length)
    );
  });

  return splices;
}

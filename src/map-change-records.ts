export function getChangeRecords(map: Map<any, any> | Set<any>): Array<{ type: string; object: any; key: string; oldValue: any }> {
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

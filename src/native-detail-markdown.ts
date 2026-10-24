/** Native JSON cells may be plain in earlier files or literal code spans in newer files. */
export function parseNativeDetailCell(cell: string): unknown {
 const json = cell.startsWith('`') && cell.endsWith('`') ? cell.slice(1, -1) : cell;
 return JSON.parse(json);
}

/** Complete redundant representations must agree, preserving record multiplicity. */
export function nativeSourceRecordsAgree(a: readonly unknown[], b: readonly unknown[]): boolean {
 function ordered(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(ordered);
  if (value !== null && typeof value === 'object') {
   const record = value as Record<string, unknown>;
   return Object.fromEntries(Object.keys(record).sort().map(key => [key, ordered(record[key])]));
  }
  return value;
 }
 return JSON.stringify(a.map(record => JSON.stringify(ordered(record))).sort()) ===
  JSON.stringify(b.map(record => JSON.stringify(ordered(record))).sort());
}

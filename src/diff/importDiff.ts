export type ImportDiff = {
  /** Present in baseline (first arg / left package), absent in compare (second / right). */
  removed: string[];
  /** Present in compare (second), absent in baseline (first). */
  added: string[];
  /** Present in both. */
  unchanged: string[];
};

function sortUnique(paths: Iterable<string>): string[] {
  return [...new Set(paths)].sort((a, b) => a.localeCompare(b));
}

/** Compare normalized module specifiers: baseline (left first arg) vs compare (right second arg). */
export function diffImportSets(
  baseline: ReadonlySet<string>,
  compare: ReadonlySet<string>
): ImportDiff {
  const removed = sortUnique([...baseline].filter((s) => !compare.has(s)));
  const added = sortUnique([...compare].filter((s) => !baseline.has(s)));
  const unchanged = sortUnique([...baseline].filter((s) => compare.has(s)));

  return { removed, added, unchanged };
}

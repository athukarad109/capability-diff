export type ImportSetDiff = {
    onlyInLeft: string[];
    onlyInRight: string[];
    inBoth: string[];
  };
  
  function sortUnique(paths: Iterable<string>): string[] {
    return [...new Set(paths)].sort((a, b) => a.localeCompare(b));
  }
  
  /** Compare module specifiers in two fingerprints (Set-backed). */
  export function diffImportSets(
    left: ReadonlySet<string>,
    right: ReadonlySet<string>
  ): ImportSetDiff {
    const onlyInLeft = sortUnique([...left].filter((s) => !right.has(s)));
    const onlyInRight = sortUnique([...right].filter((s) => !left.has(s)));
    const inBoth = sortUnique([...left].filter((s) => right.has(s)));
  
    return { onlyInLeft, onlyInRight, inBoth };
  }
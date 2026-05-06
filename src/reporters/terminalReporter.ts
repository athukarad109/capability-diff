import type { ImportSetDiff } from "../diff/importDiff";

function printBullets(title: string, items: string[]): void {
  console.log(`${title} (${items.length})`);
  if (items.length === 0) return;
  for (const s of items) console.log(`  - ${s}`);
  console.log();
}

export function printImportDiffConsole(
  leftLabel: string,
  rightLabel: string,
  diff: ImportSetDiff
): void {
  console.log(`Compare: ${leftLabel} vs ${rightLabel}`);
  console.log(`Only in left (${leftLabel}): imports present in first arg, not second.`);
  printBullets(`Only in "${leftLabel}"`, diff.onlyInLeft);

  console.log(`Only in right (${rightLabel}): imports present in second arg, not first.`);
  printBullets(`Only in "${rightLabel}"`, diff.onlyInRight);

  console.log(`In both versions (intersection):`);
  printBullets(`In both`, diff.inBoth);
}
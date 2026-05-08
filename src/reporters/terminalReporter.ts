import type { ImportDiff } from "../diff/importDiff";
import { classifyImport } from "./importClassifier";

type GroupedImports = {
  external: string[];
  builtin: string[];
  internal: string[];
};

export type PrintImportDiffOptions = {
  externalsOnly?: boolean;
  quiet?: boolean;
};

function printBullets(title: string, items: string[]): void {
  console.log(`${title} (${items.length})`);
  if (items.length === 0) {
    console.log();
    return;
  }

  for (const s of items) {
    console.log(`  - ${s}`);
  }
  console.log();
}

function groupImports(items: string[]): GroupedImports {
  return {
    external: items.filter((s) => classifyImport(s) === "external"),
    builtin: items.filter((s) => classifyImport(s) === "builtin"),
    internal: items.filter((s) => classifyImport(s) === "internal"),
  };
}

function printGroupedSection(title: string, items: string[]): void {
  console.log(title);
  const grouped = groupImports(items);

  printBullets("  External", grouped.external);
  printBullets("  Built-in", grouped.builtin);

  if (grouped.internal.length <= 20) {
    printBullets("  Internal", grouped.internal);
  } else {
    console.log(`  Internal (${grouped.internal.length})`);
    console.log("  - (omitted: too many internal relative paths)");
    console.log();
  }
}

function printExternalsOnlySection(title: string, items: string[]): void {
  console.log(title);
  const external = items.filter((s) => classifyImport(s) === "external");
  printBullets("  External", external);
}

export function printImportDiffConsole(
  baselineLabel: string,
  compareLabel: string,
  diff: ImportDiff,
  options?: PrintImportDiffOptions
): void {
  const externalsOnly = options?.externalsOnly ?? false;
  const quiet = options?.quiet ?? false;

  const printSection = externalsOnly ? printExternalsOnlySection : printGroupedSection;

  console.log(
    `Compare: ${baselineLabel} (baseline / first arg) vs ${compareLabel} (compare / second arg)`
  );
  console.log(
    `Totals -> removed: ${diff.removed.length}, added: ${diff.added.length}, unchanged: ${diff.unchanged.length}`
  );
  console.log();

  console.log(`Removed (${baselineLabel}): in baseline only, absent in compare.`);
  printSection(`Removed (from baseline "${baselineLabel}")`, diff.removed);

  console.log(`Added (${compareLabel}): in compare only, not in baseline.`);
  printSection(`Added (in "${compareLabel}" only)`, diff.added);

  if (!quiet) {
    printSection("Unchanged (in both)", diff.unchanged);
  }
}

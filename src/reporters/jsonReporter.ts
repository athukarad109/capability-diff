import type { ImportDiff } from "../diff/importDiff";
import type { Maintainer } from "../resolver/types";
import { classifyImport } from "./importClassifier";
import {
  IMPORT_DIFF_REPORT_SCHEMA_ID,
  IMPORT_DIFF_REPORT_SCHEMA_VERSION,
} from "./reportSchema";

type Grouped = {
  external: string[];
  builtin: string[];
  internal: string[];
};

function group(items: string[]): Grouped {
  return {
    external: items.filter((s) => classifyImport(s) === "external"),
    builtin: items.filter((s) => classifyImport(s) === "builtin"),
    internal: items.filter((s) => classifyImport(s) === "internal"),
  };
}

type PackageSummary = {
  name: string;
  version: string;
  publishTime?: string;
  maintainers: Maintainer[];
};

export type JsonReport = {
  schema: {
    id: typeof IMPORT_DIFF_REPORT_SCHEMA_ID;
    version: typeof IMPORT_DIFF_REPORT_SCHEMA_VERSION;
  };
  filters: {
    externalsOnly: boolean;
  };
  compared: { left: string; right: string };
  packages: { left: PackageSummary; right: PackageSummary };
  totals: {
    removed: number;
    added: number;
    unchanged: number;
  };
  removed: Grouped;
  added: Grouped;
  unchanged: Grouped;
  scannedFiles: { left: number; right: number };
  parseFailures: { filePath: string; message: string }[];
};

export function buildJsonReport(args: {
  leftLabel: string;
  rightLabel: string;
  leftPkg: PackageSummary;
  rightPkg: PackageSummary;
  diff: ImportDiff;
  scannedLeft: number;
  scannedRight: number;
  parseFailures: { filePath: string; message: string }[];
  externalsOnly: boolean;
}): JsonReport {
  const {
    leftLabel,
    rightLabel,
    leftPkg,
    rightPkg,
    diff,
    scannedLeft,
    scannedRight,
    parseFailures,
    externalsOnly,
  } = args;

  return {
    schema: {
      id: IMPORT_DIFF_REPORT_SCHEMA_ID,
      version: IMPORT_DIFF_REPORT_SCHEMA_VERSION,
    },
    filters: { externalsOnly },
    compared: { left: leftLabel, right: rightLabel },
    packages: { left: leftPkg, right: rightPkg },
    totals: {
      removed: diff.removed.length,
      added: diff.added.length,
      unchanged: diff.unchanged.length,
    },
    removed: group(diff.removed),
    added: group(diff.added),
    unchanged: group(diff.unchanged),
    scannedFiles: { left: scannedLeft, right: scannedRight },
    parseFailures,
  };
}

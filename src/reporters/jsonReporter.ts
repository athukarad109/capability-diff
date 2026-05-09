import type { ImportDiff } from "../diff/importDiff";
import type { Maintainer } from "../resolver/types";
import { classifyImport } from "./importClassifier";
import type { LlmTriage } from "../llm/triager";
import type { SupplyChainRiskRanking } from "./riskRanker";
import { buildProductVerdict, type ProductVerdictBlock } from "./verdict";
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

export type CapabilityDiffBlock = {
  installScripts: ImportDiff;
  envAccesses: ImportDiff;
  urlLiterals: ImportDiff;
};

/** How the run was configured; deep skip fields appear only when mode is deep. */
export type ReportAnalysis = {
  mode: "fast" | "deep";
  /** True when deep mode did not call the LLM triage path (no outbound LLM request). */
  deepSkipped?: boolean;
  /** Machine-readable reason when `deepSkipped` is true (e.g. no additive signals). */
  deepSkipReason?: string;
};

export type JsonReport = {
  schema: {
    id: typeof IMPORT_DIFF_REPORT_SCHEMA_ID;
    version: typeof IMPORT_DIFF_REPORT_SCHEMA_VERSION;
  };
  filters: {
    externalsOnly: boolean;
  };
  analysis: ReportAnalysis;
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
  capabilities: CapabilityDiffBlock;
  /** Registry maintainer accounts added or removed (baseline → compare). */
  maintainersDiff: {
    added: Maintainer[];
    removed: Maintainer[];
  };
  additionsOnlyRisk: SupplyChainRiskRanking;
  /** Product contract verdict (see `.cursor/PRODUCT_SCOPE.md`). */
  verdict: ProductVerdictBlock;
  llmTriage?: LlmTriage;
  /** Non-fatal issues (e.g. unreadable package.json). */
  scanWarnings: string[];
  scannedFiles: { left: number; right: number };
  parseFailures: { filePath: string; message: string }[];
};

export function buildJsonReport(args: {
  leftLabel: string;
  rightLabel: string;
  leftPkg: PackageSummary;
  rightPkg: PackageSummary;
  diff: ImportDiff;
  capabilities: CapabilityDiffBlock;
  maintainersDiff: {
    added: Maintainer[];
    removed: Maintainer[];
  };
  additionsOnlyRisk: SupplyChainRiskRanking;
  analysis: ReportAnalysis;
  llmTriage?: LlmTriage;
  scanWarnings: string[];
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
    capabilities,
    maintainersDiff,
    additionsOnlyRisk,
    analysis,
    llmTriage,
    scanWarnings,
    scannedLeft,
    scannedRight,
    parseFailures,
    externalsOnly,
  } = args;

  const verdict = buildProductVerdict(additionsOnlyRisk);

  return {
    schema: {
      id: IMPORT_DIFF_REPORT_SCHEMA_ID,
      version: IMPORT_DIFF_REPORT_SCHEMA_VERSION,
    },
    filters: { externalsOnly },
    analysis,
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
    capabilities,
    maintainersDiff,
    additionsOnlyRisk,
    verdict,
    llmTriage,
    scanWarnings,
    scannedFiles: { left: scannedLeft, right: scannedRight },
    parseFailures,
  };
}

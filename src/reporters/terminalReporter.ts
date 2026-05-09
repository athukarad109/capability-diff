import type { ImportDiff } from "../diff/importDiff";
import { classifyImport } from "./importClassifier";
import type { LlmTriage } from "../llm/triager";
import type { SupplyChainRiskRanking } from "./riskRanker";
import type { ProductVerdictBlock } from "./verdict";

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

function hasCapabilityDrift(d: ImportDiff): boolean {
  return d.removed.length > 0 || d.added.length > 0;
}

function trimForConsole(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}

function printCapabilitySub(
  title: string,
  block: ImportDiff,
  mapLine: (s: string) => string
): void {
  if (
    block.removed.length === 0 &&
    block.added.length === 0 &&
    block.unchanged.length === 0
  ) {
    console.log(`${title}: (none detected)`);
    console.log();
    return;
  }

  console.log(title);
  console.log(
    `  totals -> removed: ${block.removed.length}, added: ${block.added.length}, unchanged: ${block.unchanged.length}`
  );

  const show = (lab: string, items: string[]) => {
    console.log(`  ${lab} (${items.length})`);
    const cap = 24;
    const rows = items.slice(0, cap);
    for (const r of rows) console.log(`    - ${mapLine(r)}`);
    if (items.length > cap) {
      console.log(`    … and ${items.length - cap} more`);
    }
    console.log();
  };

  if (block.removed.length) show("removed (baseline only)", block.removed);
  if (block.added.length) show("added (compare only)", block.added);
  if (block.unchanged.length) show("unchanged", block.unchanged);
}

/** Static capability drift: scripts, env access, literal URLs (heuristic). */
export function printCapabilitiesDiffConsole(args: {
  installScripts: ImportDiff;
  envAccesses: ImportDiff;
  urlLiterals: ImportDiff;
  quiet: boolean;
}): void {
  const { installScripts, envAccesses, urlLiterals, quiet } = args;

  const anyDrift =
    hasCapabilityDrift(installScripts) ||
    hasCapabilityDrift(envAccesses) ||
    hasCapabilityDrift(urlLiterals);

  if (quiet && !anyDrift) return;

  if (quiet && anyDrift) {
    const bits: string[] = [];
    if (hasCapabilityDrift(installScripts)) {
      bits.push(
        `scripts −${installScripts.removed.length} +${installScripts.added.length}`
      );
    }
    if (hasCapabilityDrift(envAccesses)) {
      bits.push(
        `env −${envAccesses.removed.length} +${envAccesses.added.length}`
      );
    }
    if (hasCapabilityDrift(urlLiterals)) {
      bits.push(
        `urls −${urlLiterals.removed.length} +${urlLiterals.added.length}`
      );
    }
    console.log(`Capabilities (static drift): ${bits.join("; ")}`);
    return;
  }

  console.log();
  console.log(
    "Capabilities — package.json scripts & static source cues (best-effort, not malware verdicts):"
  );
  printCapabilitySub(
    "Install scripts (normalized name=body fingerprints)",
    installScripts,
    (s) => trimForConsole(s, 96)
  );
  printCapabilitySub("Env accesses (member paths)", envAccesses, (s) =>
    trimForConsole(s, 96)
  );
  printCapabilitySub("URL literals (http/https string chunks)", urlLiterals, (s) =>
    trimForConsole(s, 96)
  );
}

/** Fast vs deep mode line for pretty output (JSON carries full `analysis` object). */
export function printAnalysisModeConsole(analysis: {
  mode: "fast" | "deep";
  deepSkipped?: boolean;
  deepSkipReason?: string;
}): void {
  console.log();
  if (analysis.mode === "fast") {
    console.log("Analysis mode: fast (deterministic only; no LLM)");
    return;
  }
  if (analysis.deepSkipped) {
    console.log(
      `Analysis mode: deep — LLM triage skipped (${analysis.deepSkipReason ?? "unspecified"})`
    );
    return;
  }
  console.log(
    "Analysis mode: deep (OpenAI-compatible LLM triage when API key is configured)"
  );
}

/** Deterministic rank: capability drift + maintainer churn, semver-weighted (see JSON report). */
export function printAdditionsOnlyRiskConsole(risk: SupplyChainRiskRanking): void {
  console.log();
  console.log(`Supply chain risk ranking: ${risk.level.toUpperCase()} (score ${risk.score})`);
  const um =
    risk.semver.kind !== "unknown" ||
    risk.semver.baselineVersion ||
    risk.semver.compareVersion;
  if (um) {
    console.log(
      `  Semver: ${risk.semver.kind} (${risk.semver.baselineVersion} → ${risk.semver.compareVersion}), ×${risk.semver.multiplier}`
    );
  }
  if (risk.cooccurrenceMultiplier > 1) {
    console.log(`  Co-occurrence ×${risk.cooccurrenceMultiplier}`);
  }
  console.log(
    `  Raw capability score ${risk.rawCapabilityScore}, maintainer score ${risk.maintainerScore} (before semver multiplier)`
  );
  console.log(
    `  Added signals -> externals=${risk.addedSignals.externalImports}, scripts=${risk.addedSignals.installScripts}, env=${risk.addedSignals.envAccesses}, urls=${risk.addedSignals.urlLiterals}`
  );
  if (risk.reasons.length === 0) {
    console.log("  - no ranking reasons");
    return;
  }
  const max = 6;
  for (const reason of risk.reasons.slice(0, max)) {
    console.log(`  - ${reason}`);
  }
  if (risk.reasons.length > max) {
    console.log(`  - ... and ${risk.reasons.length - max} more`);
  }
}

/** Product-scope verdict (CLEAN / REVIEW / SUSPICIOUS / CRITICAL). */
export function printProductVerdictConsole(
  verdict: ProductVerdictBlock,
  options?: { quiet?: boolean }
): void {
  const quiet = options?.quiet ?? false;
  console.log();
  console.log(`Verdict: ${verdict.label}`);
  console.log(`  ${verdict.summary}`);
  if (!quiet) {
    console.log(`  (heuristic tier: ${verdict.heuristicLevel})`);
  }
}

export function printLlmTriageConsole(triage: LlmTriage): void {
  console.log();
  console.log(`LLM triage (${triage.provider}, model=${triage.model})`);
  if (triage.status === "error") {
    console.log(`  status: error`);
    if (triage.error) console.log(`  error: ${triage.error}`);
    return;
  }
  console.log(`  verdict: ${triage.verdict ?? "n/a"}`);
  if (triage.summary) console.log(`  summary: ${triage.summary}`);
  const findings = triage.findings ?? [];
  if (findings.length === 0) {
    console.log("  findings: none");
    return;
  }
  const max = 6;
  for (const f of findings.slice(0, max)) {
    console.log(`  - [${f.severity}] ${f.signal}: ${f.rationale}`);
  }
  if (findings.length > max) {
    console.log(`  - ... and ${findings.length - max} more`);
  }
}

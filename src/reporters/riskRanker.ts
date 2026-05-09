import type { ImportDiff } from "../diff/importDiff";
import type { MaintainerDiffResult } from "../domain/maintainerDiff";
import type { SemverBumpInfo } from "../domain/semverBump";
import { classifyImport } from "./importClassifier";

export type RiskLevel = "none" | "low" | "medium" | "high" | "critical";

export type SupplyChainRiskRanking = {
  level: RiskLevel;
  /** Final score after semver + co-occurrence multipliers (integer). */
  score: number;
  /** Capability-only subtotal before semver / co-occurrence scaling (integer). */
  rawCapabilityScore: number;
  /** Maintainer-only subtotal before semver / co-occurrence scaling (integer). */
  maintainerScore: number;
  semverMultiplier: number;
  /** Extra multiplier for correlated signals (min 1). */
  cooccurrenceMultiplier: number;
  /** Distinct tracks: externals, scripts, env, urls, new maintainer (0–5). */
  signalFamilyCount: number;
  /** Patch semver + new maintainer + new install scripts (worm-shaped pattern). */
  wormLikeCombo: boolean;
  semver: SemverBumpInfo;
  reasons: string[];
  addedSignals: {
    externalImports: number;
    installScripts: number;
    envAccesses: number;
    urlLiterals: number;
  };
};

/** @deprecated Use SupplyChainRiskRanking */
export type AdditionsOnlyRiskRanking = SupplyChainRiskRanking;

function hasAnyAdded(args: {
  importsAdded: string[];
  scriptsAdded: string[];
  envAdded: string[];
  urlsAdded: string[];
}): boolean {
  return (
    args.importsAdded.length > 0 ||
    args.scriptsAdded.length > 0 ||
    args.envAdded.length > 0 ||
    args.urlsAdded.length > 0
  );
}

function levelFromScore(score: number): RiskLevel {
  if (score <= 0) return "none";
  if (score <= 5) return "low";
  if (score <= 11) return "medium";
  if (score <= 19) return "high";
  return "critical";
}

function countSensitiveEnvKeys(paths: string[]): number {
  const hint = /(token|secret|password|passwd|key|credential|auth|cookie)/i;
  return paths.filter((p) => hint.test(p)).length;
}

function scoreAddedScripts(scripts: string[]): {
  score: number;
  reasons: string[];
} {
  if (scripts.length === 0) return { score: 0, reasons: [] };
  const reasons = [`${scripts.length} install script fingerprint(s) added`];
  let score = scripts.length * 5;

  const highRiskNames = /^(preinstall|install|postinstall)=/i;
  const highCount = scripts.filter((s) => highRiskNames.test(s)).length;
  if (highCount > 0) {
    score += highCount * 4;
    reasons.push(`${highCount} lifecycle install hook(s) added`);
  }
  return { score, reasons };
}

function scoreAddedUrls(urls: string[]): { score: number; reasons: string[] } {
  if (urls.length === 0) return { score: 0, reasons: [] };
  let score = urls.length * 2;
  const reasons = [`${urls.length} URL literal(s) added`];
  const httpCount = urls.filter((u) => u.startsWith("http://")).length;
  if (httpCount > 0) {
    score += httpCount * 2;
    reasons.push(`${httpCount} non-TLS http:// URL(s) added`);
  }
  return { score, reasons };
}

function rankCapabilityAdditions(args: {
  imports: ImportDiff;
  installScripts: ImportDiff;
  envAccesses: ImportDiff;
  urlLiterals: ImportDiff;
}): {
  score: number;
  reasons: string[];
  addedSignals: SupplyChainRiskRanking["addedSignals"];
} {
  const addedExternalImports = args.imports.added.filter(
    (s) => classifyImport(s) === "external"
  );
  const addedScripts = args.installScripts.added;
  const addedEnv = args.envAccesses.added;
  const addedUrls = args.urlLiterals.added;

  if (
    !hasAnyAdded({
      importsAdded: addedExternalImports,
      scriptsAdded: addedScripts,
      envAdded: addedEnv,
      urlsAdded: addedUrls,
    })
  ) {
    return {
      score: 0,
      reasons: [],
      addedSignals: {
        externalImports: 0,
        installScripts: 0,
        envAccesses: 0,
        urlLiterals: 0,
      },
    };
  }

  let score = 0;
  const reasons: string[] = [];

  if (addedExternalImports.length > 0) {
    score += addedExternalImports.length * 2;
    reasons.push(`${addedExternalImports.length} external import(s) added`);
  }

  const scriptsScore = scoreAddedScripts(addedScripts);
  score += scriptsScore.score;
  reasons.push(...scriptsScore.reasons);

  if (addedEnv.length > 0) {
    score += addedEnv.length * 2;
    reasons.push(`${addedEnv.length} env access path(s) added`);
    const sensitive = countSensitiveEnvKeys(addedEnv);
    if (sensitive > 0) {
      score += sensitive * 3;
      reasons.push(`${sensitive} env key path(s) include sensitive keywords`);
    }
  }

  const urlsScore = scoreAddedUrls(addedUrls);
  score += urlsScore.score;
  reasons.push(...urlsScore.reasons);

  return {
    score,
    reasons,
    addedSignals: {
      externalImports: addedExternalImports.length,
      installScripts: addedScripts.length,
      envAccesses: addedEnv.length,
      urlLiterals: addedUrls.length,
    },
  };
}

const PER_MAINTAINER_BASE = 12;

const WORM_CO_MUL = 1.28;
const MULTI_FAMILY_CO_MUL = 1.12;
const MAX_CO_MUL = 1.45;

function countSignalFamilies(
  added: SupplyChainRiskRanking["addedSignals"],
  maintainerScore: number
): number {
  let n = 0;
  if (added.externalImports > 0) n++;
  if (added.installScripts > 0) n++;
  if (added.envAccesses > 0) n++;
  if (added.urlLiterals > 0) n++;
  if (maintainerScore > 0) n++;
  return n;
}

/** Deterministic heuristic: capability drift + maintainer churn, weighted by semver bump. */
export function rankSupplyChainRisk(args: {
  imports: ImportDiff;
  installScripts: ImportDiff;
  envAccesses: ImportDiff;
  urlLiterals: ImportDiff;
  semver: SemverBumpInfo;
  maintainerDiff: MaintainerDiffResult;
}): SupplyChainRiskRanking {
  const cap = rankCapabilityAdditions({
    imports: args.imports,
    installScripts: args.installScripts,
    envAccesses: args.envAccesses,
    urlLiterals: args.urlLiterals,
  });

  const maintainerScore =
    args.maintainerDiff.added.length > 0
      ? args.maintainerDiff.added.length * PER_MAINTAINER_BASE
      : 0;

  const maintainerReasons: string[] = [];
  if (args.maintainerDiff.added.length > 0) {
    maintainerReasons.push(
      `${args.maintainerDiff.added.length} registry maintainer account(s) added vs baseline`
    );
  }

  const preScaleSum = cap.score + maintainerScore;
  const signalFamilyCount = countSignalFamilies(
    cap.addedSignals,
    maintainerScore
  );
  const wormLikeCombo =
    args.semver.kind === "patch" &&
    maintainerScore > 0 &&
    cap.addedSignals.installScripts > 0;

  let cooccurrenceMultiplier = 1;
  if (wormLikeCombo) cooccurrenceMultiplier *= WORM_CO_MUL;
  if (signalFamilyCount >= 3) cooccurrenceMultiplier *= MULTI_FAMILY_CO_MUL;
  cooccurrenceMultiplier = Math.min(cooccurrenceMultiplier, MAX_CO_MUL);

  const scaled = Math.round(
    preScaleSum * args.semver.multiplier * cooccurrenceMultiplier
  );

  const semverReason = `Semver ${args.semver.kind} bump (${args.semver.baselineVersion} → ${args.semver.compareVersion}), risk multiplier ×${args.semver.multiplier}`;

  const reasons: string[] = [];
  if (preScaleSum === 0) {
    reasons.push("No capability additions and no new maintainer accounts vs baseline");
    return {
      level: "none",
      score: 0,
      rawCapabilityScore: 0,
      maintainerScore: 0,
      semverMultiplier: args.semver.multiplier,
      cooccurrenceMultiplier: 1,
      signalFamilyCount: 0,
      wormLikeCombo: false,
      semver: args.semver,
      reasons,
      addedSignals: cap.addedSignals,
    };
  }

  reasons.push(semverReason);
  reasons.push(...cap.reasons);
  reasons.push(...maintainerReasons);
  if (cooccurrenceMultiplier > 1) {
    reasons.push(`Co-occurrence multiplier ×${cooccurrenceMultiplier}`);
  }

  return {
    level: levelFromScore(scaled),
    score: scaled,
    rawCapabilityScore: cap.score,
    maintainerScore,
    semverMultiplier: args.semver.multiplier,
    cooccurrenceMultiplier,
    signalFamilyCount,
    wormLikeCombo,
    semver: args.semver,
    reasons,
    addedSignals: cap.addedSignals,
  };
}

const NEUTRAL_SEMVER: SemverBumpInfo = {
  baselineVersion: "",
  compareVersion: "",
  kind: "unknown",
  multiplier: 1,
};

/** Capability-only ranking (no semver / maintainer weighting). Tests and legacy callers. */
export function rankAdditionsOnlyRisk(args: {
  imports: ImportDiff;
  installScripts: ImportDiff;
  envAccesses: ImportDiff;
  urlLiterals: ImportDiff;
}): SupplyChainRiskRanking {
  const cap = rankCapabilityAdditions(args);
  const signalFamilyCount = countSignalFamilies(cap.addedSignals, 0);
  if (cap.score === 0) {
    return {
      level: "none",
      score: 0,
      rawCapabilityScore: 0,
      maintainerScore: 0,
      semverMultiplier: 1,
      cooccurrenceMultiplier: 1,
      signalFamilyCount: 0,
      wormLikeCombo: false,
      semver: NEUTRAL_SEMVER,
      reasons: ["No added capability or external dependency signals"],
      addedSignals: cap.addedSignals,
    };
  }
  return {
    level: levelFromScore(cap.score),
    score: cap.score,
    rawCapabilityScore: cap.score,
    maintainerScore: 0,
    semverMultiplier: 1,
    cooccurrenceMultiplier: 1,
    signalFamilyCount,
    wormLikeCombo: false,
    semver: NEUTRAL_SEMVER,
    reasons: cap.reasons,
    addedSignals: cap.addedSignals,
  };
}

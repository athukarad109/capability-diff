import type { SupplyChainRiskRanking, RiskLevel } from "./riskRanker";

/** Product-facing verdict aligned with `.cursor/PRODUCT_SCOPE.md`. */
export type ProductVerdict = "CLEAN" | "REVIEW" | "SUSPICIOUS" | "CRITICAL";

export type ProductVerdictBlock = {
  label: ProductVerdict;
  /** One-line explanation for humans and PR comments. */
  summary: string;
  /** Internal deterministic tier (tuning / debugging). */
  heuristicLevel: RiskLevel;
};

/**
 * Maps heuristic risk level to public verdict.
 * Conservative: only the top heuristic tier becomes CRITICAL until validation tuning.
 */
export function heuristicLevelToVerdict(level: RiskLevel): ProductVerdict {
  switch (level) {
    case "none":
      return "CLEAN";
    case "low":
      return "REVIEW";
    case "medium":
      return "SUSPICIOUS";
    case "high":
      return "SUSPICIOUS";
    case "critical":
      return "CRITICAL";
    default:
      return "REVIEW";
  }
}

const MAX_SUMMARY_LEN = 360;

function trimSummary(s: string): string {
  if (s.length <= MAX_SUMMARY_LEN) return s;
  return `${s.slice(0, MAX_SUMMARY_LEN - 1)}…`;
}

/**
 * Prefer substantive reasons; drop generic semver line if we have stronger signals.
 */
export function buildVerdictSummary(ranking: SupplyChainRiskRanking): string {
  const reasons = ranking.reasons.filter(Boolean);
  if (reasons.length === 0) {
    return "No elevated supply-chain signals detected in this diff.";
  }

  const semverNoise = /^Semver \w+ bump \(/;
  const filtered = reasons.filter((r) => !semverNoise.test(r));
  const use = filtered.length > 0 ? filtered : reasons;

  const top = use.slice(0, 4);
  return trimSummary(top.join(" "));
}

/** Heuristic scores at or above this can justify a CRITICAL product verdict without extra corroboration. */
export const CRITICAL_PRODUCT_SCORE_FLOOR = 42;

export function allowsCriticalProductVerdict(
  ranking: SupplyChainRiskRanking
): boolean {
  if (ranking.score >= CRITICAL_PRODUCT_SCORE_FLOOR) return true;
  if (ranking.wormLikeCombo) return true;
  if (ranking.signalFamilyCount >= 2) return true;
  if (
    ranking.maintainerScore > 0 &&
    ranking.addedSignals.installScripts > 0
  ) {
    return true;
  }
  return false;
}

export function buildProductVerdict(
  ranking: SupplyChainRiskRanking
): ProductVerdictBlock {
  let label = heuristicLevelToVerdict(ranking.level);
  if (label === "CRITICAL" && !allowsCriticalProductVerdict(ranking)) {
    label = "SUSPICIOUS";
  }
  const summary = buildVerdictSummary(ranking);
  return {
    label,
    summary,
    heuristicLevel: ranking.level,
  };
}

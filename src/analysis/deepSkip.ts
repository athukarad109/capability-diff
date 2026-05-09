import type { SupplyChainRiskRanking } from "../reporters/riskRanker";

/** Machine code stored in JSON `analysis.deepSkipReason`. */
export type DeepSkipReason = "no_additive_signals";

/**
 * Deep mode may skip LLM/network triage when deterministic diff has nothing additive to analyze.
 */
export function shouldSkipDeepLlm(args: {
  additionsOnlyRisk: SupplyChainRiskRanking;
}): { skip: boolean; reason?: DeepSkipReason } {
  if (args.additionsOnlyRisk.level !== "none") {
    return { skip: false };
  }
  return { skip: true, reason: "no_additive_signals" };
}

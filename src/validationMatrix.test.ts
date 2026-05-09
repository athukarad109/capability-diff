import { describe, expect, it } from "vitest";

import { VALIDATION_CASES } from "./fixtures/validationCases";
import { rankSupplyChainRisk } from "./reporters/riskRanker";
import {
  buildProductVerdict,
  type ProductVerdict,
} from "./reporters/verdict";

type CheckpointBucket = "clean" | "malicious_style";

const PRED_LABELS: ProductVerdict[] = [
  "CLEAN",
  "REVIEW",
  "SUSPICIOUS",
  "CRITICAL",
];

function emptyConfusion(): Record<
  CheckpointBucket,
  Record<ProductVerdict, number>
> {
  const zeroRow = (): Record<ProductVerdict, number> => ({
    CLEAN: 0,
    REVIEW: 0,
    SUSPICIOUS: 0,
    CRITICAL: 0,
  });
  return {
    clean: zeroRow(),
    malicious_style: zeroRow(),
  };
}

describe("validation matrix (§4 gates)", () => {
  it("checkpoint gates + confusion matrix (single run; avoids parallel mutation)", () => {
    const confusion = emptyConfusion();

    for (const c of VALIDATION_CASES) {
      const ranking = rankSupplyChainRisk({
        imports: c.imports,
        installScripts: c.installScripts,
        envAccesses: c.envAccesses,
        urlLiterals: c.urlLiterals,
        semver: c.semver,
        maintainerDiff: c.maintainerDiff,
      });
      const block = buildProductVerdict(ranking);
      const pred = block.label;
      confusion[c.kind][pred] += 1;

      if (c.kind === "clean") {
        expect(
          pred,
          `${c.id}: clean cases must not surface CRITICAL as product verdict (false positive gate)`
        ).not.toBe("CRITICAL");
      } else {
        expect(
          pred,
          `${c.id}: malicious-style cases must not be reported as CLEAN (false negative gate)`
        ).not.toBe("CLEAN");
      }
    }

    const rows: CheckpointBucket[] = ["clean", "malicious_style"];
    const lines: string[] = [];
    lines.push(
      "Validation matrix (rows=checkpoint bucket, cols=predicted product verdict):"
    );
    lines.push(
      ["(bucket\\pred)", ...PRED_LABELS].map((h) => h.padEnd(14)).join("")
    );
    for (const row of rows) {
      const parts = [row.padEnd(14)];
      for (const col of PRED_LABELS) {
        parts.push(String(confusion[row][col]).padEnd(14));
      }
      lines.push(parts.join(""));
    }
    console.log("\n" + lines.join("\n") + "\n");
  });
});

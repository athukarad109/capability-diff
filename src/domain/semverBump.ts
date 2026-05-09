import semver from "semver";

export type SemverBumpKind =
  | "patch"
  | "minor"
  | "major"
  | "prerelease"
  | "same"
  | "unknown";

export type SemverBumpInfo = {
  /** First CLI package version (baseline). */
  baselineVersion: string;
  /** Second CLI package version (compare). */
  compareVersion: string;
  kind: SemverBumpKind;
  /**
   * Scales combined capability + maintainer risk: higher for patch/minor
   * (unexpected changes), lower for major (expected refactors).
   */
  multiplier: number;
};

function multiplierForKind(kind: SemverBumpKind): number {
  switch (kind) {
    case "patch":
      return 1.35;
    case "minor":
      return 1.08;
    case "major":
      return 0.78;
    case "prerelease":
      return 1.0;
    case "same":
      return 1.0;
    default:
      return 1.0;
  }
}

/**
 * Classify semver movement from baseline version to compare version.
 * Uses the same order as CLI args: baseline → compare.
 */
export function classifySemverBump(
  baselineVersion: string,
  compareVersion: string
): SemverBumpInfo {
  const base = semver.valid(baselineVersion);
  const cmp = semver.valid(compareVersion);
  if (!base || !cmp) {
    return {
      baselineVersion,
      compareVersion,
      kind: "unknown",
      multiplier: multiplierForKind("unknown"),
    };
  }
  if (semver.eq(base, cmp)) {
    return {
      baselineVersion,
      compareVersion,
      kind: "same",
      multiplier: multiplierForKind("same"),
    };
  }
  const raw = semver.diff(base, cmp);
  let kind: SemverBumpKind = "unknown";
  if (raw === "major" || raw === "premajor") kind = "major";
  else if (raw === "minor" || raw === "preminor") kind = "minor";
  else if (raw === "patch" || raw === "prepatch") kind = "patch";
  else if (raw === "prerelease") kind = "prerelease";

  return {
    baselineVersion,
    compareVersion,
    kind,
    multiplier: multiplierForKind(kind),
  };
}

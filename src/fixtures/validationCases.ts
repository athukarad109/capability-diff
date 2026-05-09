import type { ImportDiff } from "../diff/importDiff";
import type { MaintainerDiffResult } from "../domain/maintainerDiff";
import { classifySemverBump } from "../domain/semverBump";
import type { Maintainer } from "../resolver/types";

const id = (i: ImportDiff): ImportDiff => i;

/**
 * Synthetic checkpoint cases for CI gates (see `.cursor/TODO.md` §4).
 * `clean` = expected benign profile; `malicious_style` = intentionally stacked risk.
 */
export type ValidationCaseKind = "clean" | "malicious_style";

export type ValidationCase = {
  id: string;
  kind: ValidationCaseKind;
  description: string;
  imports: ImportDiff;
  installScripts: ImportDiff;
  envAccesses: ImportDiff;
  urlLiterals: ImportDiff;
  semver: ReturnType<typeof classifySemverBump>;
  maintainerDiff: MaintainerDiffResult;
};

function m(name: string, email: string): Maintainer {
  return { name, email };
}

export const VALIDATION_CASES: ValidationCase[] = [
  {
    id: "clean-no-drift-patch",
    kind: "clean",
    description: "Patch bump with no capability or maintainer churn.",
    imports: id({ removed: [], added: [], unchanged: ["./local"] }),
    installScripts: id({ removed: [], added: [], unchanged: [] }),
    envAccesses: id({ removed: [], added: [], unchanged: [] }),
    urlLiterals: id({ removed: [], added: [], unchanged: [] }),
    semver: classifySemverBump("1.0.0", "1.0.1"),
    maintainerDiff: { added: [], removed: [] },
  },
  {
    id: "clean-single-external-patch",
    kind: "clean",
    description: "Patch bump + one benign external import.",
    imports: id({
      removed: [],
      added: ["lodash"],
      unchanged: [],
    }),
    installScripts: id({ removed: [], added: [], unchanged: [] }),
    envAccesses: id({ removed: [], added: [], unchanged: [] }),
    urlLiterals: id({ removed: [], added: [], unchanged: [] }),
    semver: classifySemverBump("2.1.0", "2.1.1"),
    maintainerDiff: { added: [], removed: [] },
  },
  {
    id: "clean-major-with-small-cap",
    kind: "clean",
    description: "Major bump with modest additions (expected refactor tone).",
    imports: id({
      removed: [],
      added: ["got"],
      unchanged: [],
    }),
    installScripts: id({ removed: [], added: [], unchanged: [] }),
    envAccesses: id({ removed: [], added: [], unchanged: [] }),
    urlLiterals: id({ removed: [], added: [], unchanged: [] }),
    semver: classifySemverBump("2.0.0", "3.0.0"),
    maintainerDiff: { added: [], removed: [] },
  },
  {
    id: "malicious-worm-postinstall",
    kind: "malicious_style",
    description: "Patch + new maintainer + lifecycle install hook (worm-shaped stack).",
    imports: id({ removed: [], added: [], unchanged: [] }),
    installScripts: id({
      removed: [],
      added: ["postinstall=node ./evil.js"],
      unchanged: [],
    }),
    envAccesses: id({ removed: [], added: [], unchanged: [] }),
    urlLiterals: id({ removed: [], added: [], unchanged: [] }),
    semver: classifySemverBump("4.0.0", "4.0.1"),
    maintainerDiff: {
      added: [m("BadActor", "bad@evil.example")],
      removed: [],
    },
  },
  {
    id: "malicious-multi-track-patch",
    kind: "malicious_style",
    description: "Patch bump stacking imports, env, and URLs (multi-family co-occurrence).",
    imports: id({
      removed: [],
      added: ["request", "node-fetch", "axios"],
      unchanged: [],
    }),
    installScripts: id({ removed: [], added: [], unchanged: [] }),
    envAccesses: id({
      removed: [],
      added: ["process.env.API_TOKEN", "process.env.AWS_SECRET_ACCESS_KEY"],
      unchanged: [],
    }),
    urlLiterals: id({
      removed: [],
      added: ["http://paste.example/leak"],
      unchanged: [],
    }),
    semver: classifySemverBump("1.2.3", "1.2.4"),
    maintainerDiff: { added: [], removed: [] },
  },
  {
    id: "malicious-maintainer-and-scripts",
    kind: "malicious_style",
    description: "New maintainer plus preinstall without worm triple (still non-clean).",
    imports: id({ removed: [], added: [], unchanged: [] }),
    installScripts: id({
      removed: [],
      added: ["preinstall=node ./setup.cjs", "postinstall=node ./setup.cjs"],
      unchanged: [],
    }),
    envAccesses: id({ removed: [], added: [], unchanged: [] }),
    urlLiterals: id({ removed: [], added: [], unchanged: [] }),
    semver: classifySemverBump("0.9.0", "0.9.1"),
    maintainerDiff: {
      added: [m("Typosqot", "typosqot@throwaway.test")],
      removed: [],
    },
  },
];

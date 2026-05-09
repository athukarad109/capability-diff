import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";

import { parsePackageRef, parsePackageRange } from "./domain/packageRef";
import { diffImportSets } from "./diff/importDiff";
import { normalizeImportSpecifier } from "./extractor/normalizeImportSpecifier";
import { parseCliArgv } from "./cli/parseArgv";
import {
  classifyImport,
  filterImportsToExternals,
} from "./reporters/importClassifier";
import { buildJsonReport } from "./reporters/jsonReporter";
import {
  IMPORT_DIFF_REPORT_SCHEMA_ID,
  IMPORT_DIFF_REPORT_SCHEMA_VERSION,
} from "./reporters/reportSchema";
import {
  buildReportFileName,
  writeJsonReportUnderReports,
} from "./reporters/writeJsonReport";
import { diffMaintainers } from "./domain/maintainerDiff";
import { classifySemverBump } from "./domain/semverBump";
import {
  rankAdditionsOnlyRisk,
  rankSupplyChainRisk,
} from "./reporters/riskRanker";
import { shouldSkipDeepLlm } from "./analysis/deepSkip";
import { buildProductVerdict } from "./reporters/verdict";

const neutralSemverRankFields = {
  rawCapabilityScore: 0,
  maintainerScore: 0,
  semverMultiplier: 1,
  cooccurrenceMultiplier: 1,
  signalFamilyCount: 0,
  wormLikeCombo: false,
  semver: {
    baselineVersion: "",
    compareVersion: "",
    kind: "unknown" as const,
    multiplier: 1,
  },
};

describe("parsePackageRef", () => {
  it("parses unscoped package references", () => {
    expect(parsePackageRef("axios@1.7.1")).toEqual({
      name: "axios",
      version: "1.7.1",
    });
  });

  it("parses scoped package references", () => {
    expect(parsePackageRef("@types/node@20.17.0")).toEqual({
      name: "@types/node",
      version: "20.17.0",
    });
  });

  it("rejects invalid pkg@version strings", () => {
    expect(() => parsePackageRef("axios")).toThrow(/Invalid package reference/);
    expect(() => parsePackageRef("@scope/pkg@")).toThrow();
  });
});

describe("parsePackageRange", () => {
  it("parses unscoped pkg@ver1..ver2", () => {
    expect(parsePackageRange("lodash@4.17.20..4.17.21")).toEqual({
      name: "lodash",
      baselineVersion: "4.17.20",
      compareVersion: "4.17.21",
    });
  });

  it("parses scoped package range", () => {
    expect(parsePackageRange("@types/node@20.1.0..20.2.0")).toEqual({
      name: "@types/node",
      baselineVersion: "20.1.0",
      compareVersion: "20.2.0",
    });
  });
});

describe("diffImportSets", () => {
  it("returns sorted, unique removed/added/unchanged", () => {
    const baseline = new Set(["z", "a", "a", "shared"]);
    const compare = new Set(["b", "shared", "b"]);
    expect(diffImportSets(baseline, compare)).toEqual({
      removed: ["a", "z"],
      added: ["b"],
      unchanged: ["shared"],
    });
  });
});

describe("normalizeImportSpecifier", () => {
  it("trims whitespace and preserves semantics", () => {
    expect(normalizeImportSpecifier("  ./x  ")).toBe("./x");
    expect(normalizeImportSpecifier("  @scope/pkg  ")).toBe("@scope/pkg");
  });
});

describe("parseCliArgv", () => {
  it("parses explicit flags and positionals", () => {
    const parsed = parseCliArgv([
      "left@1",
      "right@2",
      "--format",
      "json",
      "-e",
      "--quiet",
    ]);
    expect(parsed.flags).toEqual({
      format: "json",
      externalsOnly: true,
      quiet: true,
      mode: "fast",
      llmModel: undefined,
    });
    expect(parsed.positional).toEqual(["left@1", "right@2"]);
  });

  it("accepts loose json token for forwarded npm args", () => {
    const parsed = parseCliArgv(["left@1", "right@2", "json"]);
    expect(parsed.flags.format).toBe("json");
  });

  it("parses deep mode (--deep or deprecated --llm-triage)", () => {
    expect(parseCliArgv(["left@1", "right@2", "--deep"]).flags.mode).toBe(
      "deep"
    );
    expect(
      parseCliArgv(["left@1", "right@2", "--llm-triage"]).flags.mode
    ).toBe("deep");
    const parsed = parseCliArgv([
      "left@1",
      "right@2",
      "--deep",
      "--llm-model",
      "gpt-5.5",
    ]);
    expect(parsed.flags.mode).toBe("deep");
    expect(parsed.flags.llmModel).toBe("gpt-5.5");
  });

  it("defaults to fast mode", () => {
    expect(parseCliArgv(["left@1", "right@2"]).flags.mode).toBe("fast");
  });

  it("rejects --fast together with --deep", () => {
    expect(() =>
      parseCliArgv(["left@1", "right@2", "--fast", "--deep"])
    ).toThrow(/Cannot use --fast together/);
  });

  it("rejects --fast together with deprecated --llm-triage", () => {
    expect(() =>
      parseCliArgv(["left@1", "right@2", "--fast", "--llm-triage"])
    ).toThrow(/Cannot use --fast together/);
  });
});

describe("shouldSkipDeepLlm", () => {
  it("skips when additions-only risk has no additive signals", () => {
    expect(
      shouldSkipDeepLlm({
        additionsOnlyRisk: {
          level: "none",
          score: 0,
          ...neutralSemverRankFields,
          reasons: [],
          addedSignals: {
            externalImports: 0,
            installScripts: 0,
            envAccesses: 0,
            urlLiterals: 0,
          },
        },
      })
    ).toEqual({ skip: true, reason: "no_additive_signals" });
  });

  it("does not skip when there are additive signals", () => {
    expect(
      shouldSkipDeepLlm({
        additionsOnlyRisk: {
          level: "low",
          score: 3,
          ...neutralSemverRankFields,
          rawCapabilityScore: 3,
          signalFamilyCount: 1,
          reasons: ["x"],
          addedSignals: {
            externalImports: 1,
            installScripts: 0,
            envAccesses: 0,
            urlLiterals: 0,
          },
        },
      })
    ).toEqual({ skip: false });
  });
});

describe("importClassifier", () => {
  it("classifies internal, builtin, external", () => {
    expect(classifyImport("./rel")).toBe("internal");
    expect(classifyImport("node:path")).toBe("builtin");
    expect(classifyImport("zod")).toBe("external");
  });

  it("filters set to externals only", () => {
    const out = filterImportsToExternals(
      new Set(["./rel", "node:fs", "axios", "axios"])
    );
    expect([...out]).toEqual(["axios"]);
  });
});

describe("json report + writer", () => {
  const tempDirs: string[] = [];
  afterEach(async () => {
    for (const d of tempDirs.splice(0)) {
      await rm(d, { recursive: true, force: true });
    }
  });

  it("builds stable schema and grouped totals", () => {
    const report = buildJsonReport({
      leftLabel: "a@1.0.0",
      rightLabel: "a@1.0.1",
      leftPkg: { name: "a", version: "1.0.0", maintainers: [] },
      rightPkg: { name: "a", version: "1.0.1", maintainers: [] },
      diff: {
        removed: ["node:fs", "./rel", "axios"],
        added: ["node:path", "zod"],
        unchanged: ["./same", "react"],
      },
      capabilities: {
        installScripts: { removed: [], added: ["postinstall=x"], unchanged: [] },
        envAccesses: { removed: [], added: [], unchanged: ["process.env.HOME"] },
        urlLiterals: { removed: [], added: [], unchanged: [] },
      },
      maintainersDiff: { added: [], removed: [] },
      additionsOnlyRisk: {
        level: "medium",
        score: 10,
        ...neutralSemverRankFields,
        rawCapabilityScore: 10,
        signalFamilyCount: 2,
        reasons: ["seed"],
        addedSignals: {
          externalImports: 1,
          installScripts: 1,
          envAccesses: 0,
          urlLiterals: 0,
        },
      },
      analysis: { mode: "fast" },
      scanWarnings: [],
      scannedLeft: 10,
      scannedRight: 11,
      parseFailures: [],
      externalsOnly: false,
    });

    expect(report.schema).toEqual({
      id: IMPORT_DIFF_REPORT_SCHEMA_ID,
      version: IMPORT_DIFF_REPORT_SCHEMA_VERSION,
    });
    expect(report.totals).toEqual({ removed: 3, added: 2, unchanged: 2 });
    expect(report.removed).toEqual({
      external: ["axios"],
      builtin: ["node:fs"],
      internal: ["./rel"],
    });
    expect(report.verdict.label).toBe("SUSPICIOUS");
    expect(report.verdict.heuristicLevel).toBe("medium");
  });

  it("generates deterministic report filename and writes JSON under reports/", async () => {
    const now = new Date("2026-05-08T02:03:04.999Z");
    expect(
      buildReportFileName({
        packageNameLeft: "@types/node",
        packageNameRight: "@types/node",
        now,
      })
    ).toBe("types-node-2026-05-08T02-03-04Z.json");

    const cwd = await mkdtemp(join(tmpdir(), "scg-test-"));
    tempDirs.push(cwd);

    const report = buildJsonReport({
      leftLabel: "a@1",
      rightLabel: "a@2",
      leftPkg: { name: "a", version: "1", maintainers: [] },
      rightPkg: { name: "a", version: "2", maintainers: [] },
      diff: { removed: [], added: [], unchanged: [] },
      capabilities: {
        installScripts: { removed: [], added: [], unchanged: [] },
        envAccesses: { removed: [], added: [], unchanged: [] },
        urlLiterals: { removed: [], added: [], unchanged: [] },
      },
      maintainersDiff: { added: [], removed: [] },
      additionsOnlyRisk: {
        level: "none",
        score: 0,
        ...neutralSemverRankFields,
        signalFamilyCount: 0,
        reasons: ["none"],
        addedSignals: {
          externalImports: 0,
          installScripts: 0,
          envAccesses: 0,
          urlLiterals: 0,
        },
      },
      analysis: { mode: "fast" },
      scanWarnings: [],
      scannedLeft: 0,
      scannedRight: 0,
      parseFailures: [],
      externalsOnly: false,
    });

    const { relativePath, absolutePath } = await writeJsonReportUnderReports({
      report,
      cwd,
      packageNameLeft: "a",
      packageNameRight: "a",
      now,
    });

    expect(relativePath).toBe("reports\\a-2026-05-08T02-03-04Z.json");
    const written = JSON.parse(await readFile(absolutePath, "utf8")) as {
      schema: { version: string };
    };
    expect(written.schema.version).toBe(IMPORT_DIFF_REPORT_SCHEMA_VERSION);
  });
});

describe("rankAdditionsOnlyRisk", () => {
  it("returns none when there are no added signals", () => {
    const risk = rankAdditionsOnlyRisk({
      imports: { removed: ["x"], added: [], unchanged: [] },
      installScripts: { removed: [], added: [], unchanged: [] },
      envAccesses: { removed: [], added: [], unchanged: [] },
      urlLiterals: { removed: [], added: [], unchanged: [] },
    });
    expect(risk.level).toBe("none");
    expect(risk.score).toBe(0);
    expect(risk.rawCapabilityScore).toBe(0);
    expect(risk.maintainerScore).toBe(0);
  });

  it("elevates for added scripts/env/url and external imports", () => {
    const risk = rankAdditionsOnlyRisk({
      imports: { removed: [], added: ["axios", "./local"], unchanged: [] },
      installScripts: {
        removed: [],
        added: ["postinstall=node install.js"],
        unchanged: [],
      },
      envAccesses: {
        removed: [],
        added: ["process.env.API_TOKEN"],
        unchanged: [],
      },
      urlLiterals: {
        removed: [],
        added: ["http://example.com/api"],
        unchanged: [],
      },
    });
    expect(["medium", "high", "critical"]).toContain(risk.level);
    expect(risk.addedSignals.externalImports).toBe(1);
    expect(risk.addedSignals.installScripts).toBe(1);
    expect(risk.addedSignals.envAccesses).toBe(1);
    expect(risk.addedSignals.urlLiterals).toBe(1);
    expect(risk.rawCapabilityScore).toBe(risk.score);
    expect(risk.signalFamilyCount).toBe(4);
  });
});

describe("buildProductVerdict", () => {
  it("caps product CRITICAL when only one signal family despite heuristic critical", () => {
    const out = buildProductVerdict({
      level: "critical",
      score: 23,
      rawCapabilityScore: 30,
      maintainerScore: 0,
      semverMultiplier: 0.78,
      cooccurrenceMultiplier: 1,
      signalFamilyCount: 1,
      wormLikeCombo: false,
      semver: neutralSemverRankFields.semver,
      reasons: ["test"],
      addedSignals: {
        externalImports: 4,
        installScripts: 0,
        envAccesses: 0,
        urlLiterals: 0,
      },
    });
    expect(out.label).toBe("SUSPICIOUS");
  });

  it("allows CRITICAL with corroboration (≥2 families)", () => {
    const out = buildProductVerdict({
      level: "critical",
      score: 24,
      rawCapabilityScore: 20,
      maintainerScore: 0,
      semverMultiplier: 1,
      cooccurrenceMultiplier: 1,
      signalFamilyCount: 2,
      wormLikeCombo: false,
      semver: neutralSemverRankFields.semver,
      reasons: ["a", "b"],
      addedSignals: {
        externalImports: 1,
        installScripts: 1,
        envAccesses: 0,
        urlLiterals: 0,
      },
    });
    expect(out.label).toBe("CRITICAL");
  });
});

describe("diffMaintainers", () => {
  it("detects added and removed accounts by email", () => {
    const out = diffMaintainers(
      [{ name: "a", email: "a@z.com" }],
      [
        { name: "a", email: "a@z.com" },
        { name: "b", email: "new@z.com" },
      ]
    );
    expect(out.removed).toEqual([]);
    expect(out.added.map((m) => m.email)).toEqual(["new@z.com"]);
  });
});

describe("classifySemverBump", () => {
  it("returns patch with higher multiplier than major", () => {
    const patch = classifySemverBump("1.0.0", "1.0.1");
    const major = classifySemverBump("1.0.0", "2.0.0");
    expect(patch.kind).toBe("patch");
    expect(major.kind).toBe("major");
    expect(patch.multiplier).toBeGreaterThan(major.multiplier);
  });
});

describe("rankSupplyChainRisk", () => {
  it("scores new maintainers and scales by semver bump", () => {
    const semver = classifySemverBump("4.17.20", "4.17.21");
    expect(semver.kind).toBe("patch");
    const risk = rankSupplyChainRisk({
      imports: { removed: [], added: [], unchanged: [] },
      installScripts: { removed: [], added: [], unchanged: [] },
      envAccesses: { removed: [], added: [], unchanged: [] },
      urlLiterals: { removed: [], added: [], unchanged: [] },
      semver,
      maintainerDiff: {
        added: [{ name: "intruder", email: "x@y.com" }],
        removed: [],
      },
    });
    expect(risk.maintainerScore).toBe(12);
    expect(risk.rawCapabilityScore).toBe(0);
    expect(risk.score).toBe(Math.round(12 * semver.multiplier));
    expect(risk.level).not.toBe("none");
    expect(risk.cooccurrenceMultiplier).toBe(1);
  });

  it("applies worm-shaped co-occurrence on patch with maintainer + install script", () => {
    const semver = classifySemverBump("1.0.0", "1.0.1");
    const risk = rankSupplyChainRisk({
      imports: { removed: [], added: [], unchanged: [] },
      installScripts: {
        removed: [],
        added: ["postinstall=npm run x"],
        unchanged: [],
      },
      envAccesses: { removed: [], added: [], unchanged: [] },
      urlLiterals: { removed: [], added: [], unchanged: [] },
      semver,
      maintainerDiff: {
        added: [{ name: "newbie", email: "n@x.com" }],
        removed: [],
      },
    });
    expect(risk.wormLikeCombo).toBe(true);
    expect(risk.cooccurrenceMultiplier).toBe(1.28);
  });
});

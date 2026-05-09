import { parsePackageRef, parsePackageRange } from "./domain/packageRef";
import { extractImportsFingerprint } from "./extractor/importExtractor";
import { extractInstallScriptFingerprints } from "./extractor/extractPackageScripts";
import { diffImportSets } from "./diff/importDiff";
import { buildJsonReport } from "./reporters/jsonReporter";
import { writeJsonReportUnderReports } from "./reporters/writeJsonReport";
import {
  printAdditionsOnlyRiskConsole,
  printAnalysisModeConsole,
  printCapabilitiesDiffConsole,
  printImportDiffConsole,
  printLlmTriageConsole,
  printProductVerdictConsole,
} from "./reporters/terminalReporter";
import { filterImportsToExternals } from "./reporters/importClassifier";
import { diffMaintainers } from "./domain/maintainerDiff";
import { classifySemverBump } from "./domain/semverBump";
import { rankSupplyChainRisk } from "./reporters/riskRanker";
import { runLlmTriage } from "./llm/triager";
import {
  cleanupExtractedDir,
  fetchAndExtractTarball,
} from "./resolver/tarballFetcher";
import type { PackageRef, ResolvedPackage } from "./resolver/types";
import { resolvePackage } from "./resolver/npmRegistryClient";
import { parseCliArgv } from "./cli/parseArgv";
import { loadDotEnvIfPresent } from "./utils/env";
import { shouldSkipDeepLlm } from "./analysis/deepSkip";
import { buildProductVerdict } from "./reporters/verdict";
import type { ReportAnalysis } from "./reporters/jsonReporter";

function resolveCliPackageRefs(positional: string[]): [PackageRef, PackageRef] {
  if (positional.length === 0) usage();
  if (positional.length === 1) {
    const token = positional[0];
    if (!token.includes("..")) {
      console.error(
        `Expected two package refs (pkg@a pkg@b) or one range (pkg@ver1..ver2).`
      );
      usage();
    }
    const range = parsePackageRange(token);
    return [
      { name: range.name, version: range.baselineVersion },
      { name: range.name, version: range.compareVersion },
    ];
  }
  if (positional.length === 2) {
    const left = parsePackageRef(positional[0]);
    const right = parsePackageRef(positional[1]);
    if (left.name !== right.name) {
      console.error(
        `Package names must match for diff (baseline=${left.name}, compare=${right.name}).`
      );
      process.exit(2);
    }
    return [left, right];
  }
  console.error("Too many positional arguments.");
  usage();
}

function usage(): never {
  console.error(
    `Usage:\n  npx tsx src/cli.ts <pkg@version> <pkg@version> [options]\n` +
      `       npx tsx src/cli.ts <pkg@ver1..ver2> [options]\n`
  );
  console.error(`Options:`);
  console.error(
    `  --fast                 Deterministic analysis only (default). No LLM calls.`
  );
  console.error(
    `  --deep                 Enable deep analysis (LLM triage when not skipped; may call OpenAI-compatible APIs).`
  );
  console.error(
    `  --llm-triage           Same as --deep (deprecated alias).`
  );
  console.error(
    `  --format pretty|json   Output format (default: pretty). Loose "json"|"pretty" still accepted.`
  );
  console.error(
    `  -e, --externals-only   Diff and report only external import specifiers (npm deps).`
  );
  console.error(
    `  -q, --quiet            Pretty mode: omit unchanged section; omit scan summary (see below).`
  );
  console.error(
    `  --llm-model <name>     Override model for deep LLM triage (or use SCG_LLM_MODEL env).`
  );
  console.error(
    `Examples:\n  npx tsx src/cli.ts axios@1.7.1 axios@1.7.0 --format json -e\n` +
      `  npx tsx src/cli.ts lodash@4.17.20..4.17.21 --format json\n`
  );
  console.error(
    `JSON is printed to stdout and also saved under reports/<package>-<utc-date>.json`
  );
  process.exit(2);
}

function pkgSummary(pkg: ResolvedPackage): {
  name: string;
  version: string;
  publishTime?: string;
  maintainers: ResolvedPackage["maintainers"];
} {
  const { name, version, publishTime, maintainers } = pkg;
  return { name, version, publishTime, maintainers };
}

async function main(): Promise<void> {
  try {
    await loadDotEnvIfPresent(process.cwd());
    const { flags, positional } = parseCliArgv(process.argv.slice(2));
    const [leftRef, rightRef] = resolveCliPackageRefs(positional);

    let leftDir: string | undefined;
    let rightDir: string | undefined;

    try {
      const leftResolved = await resolvePackage(leftRef);
      const rightResolved = await resolvePackage(rightRef);

      leftDir = await fetchAndExtractTarball(leftResolved.tarballUrl);
      rightDir = await fetchAndExtractTarball(rightResolved.tarballUrl);

      const leftFp = await extractImportsFingerprint(leftRef, leftDir);
      const rightFp = await extractImportsFingerprint(rightRef, rightDir);

      const leftImports = flags.externalsOnly
        ? filterImportsToExternals(leftFp.imports)
        : leftFp.imports;
      const rightImports = flags.externalsOnly
        ? filterImportsToExternals(rightFp.imports)
        : rightFp.imports;

      const diff = diffImportSets(leftImports, rightImports);
      const parseFailures = [...leftFp.parseFailures, ...rightFp.parseFailures];

      const leftScripts = await extractInstallScriptFingerprints(leftDir);
      const rightScripts = await extractInstallScriptFingerprints(rightDir);

      const capabilities = {
        installScripts: diffImportSets(
          leftScripts.fingerprints,
          rightScripts.fingerprints
        ),
        envAccesses: diffImportSets(leftFp.envAccesses, rightFp.envAccesses),
        urlLiterals: diffImportSets(leftFp.urlLiterals, rightFp.urlLiterals),
      };
      const maintainerDiff = diffMaintainers(
        leftResolved.maintainers,
        rightResolved.maintainers
      );
      const semverBump = classifySemverBump(leftRef.version, rightRef.version);
      const additionsOnlyRisk = rankSupplyChainRisk({
        imports: diff,
        installScripts: capabilities.installScripts,
        envAccesses: capabilities.envAccesses,
        urlLiterals: capabilities.urlLiterals,
        semver: semverBump,
        maintainerDiff,
      });

      const scanWarnings = [leftScripts.warning, rightScripts.warning].filter(
        (w): w is string => typeof w === "string" && w.length > 0
      );

      const deepSkipDecision =
        flags.mode === "deep"
          ? shouldSkipDeepLlm({ additionsOnlyRisk })
          : null;

      const analysisForFinal = (): ReportAnalysis => {
        if (flags.mode === "fast") return { mode: "fast" };
        if (deepSkipDecision?.skip && deepSkipDecision.reason) {
          return {
            mode: "deep",
            deepSkipped: true,
            deepSkipReason: deepSkipDecision.reason,
          };
        }
        return { mode: "deep", deepSkipped: false };
      };

      const llmTriage =
        flags.mode === "deep" && !deepSkipDecision?.skip
          ? await runLlmTriage({
              report: buildJsonReport({
                leftLabel: leftFp.label,
                rightLabel: rightFp.label,
                leftPkg: pkgSummary(leftResolved),
                rightPkg: pkgSummary(rightResolved),
                diff,
                capabilities,
                maintainersDiff: maintainerDiff,
                additionsOnlyRisk,
                analysis: { mode: "deep", deepSkipped: false },
                scanWarnings,
                scannedLeft: leftFp.scannedFiles,
                scannedRight: rightFp.scannedFiles,
                parseFailures,
                externalsOnly: flags.externalsOnly,
              }),
              model: flags.llmModel,
            })
          : undefined;

      if (flags.format === "json") {
        const report = buildJsonReport({
          leftLabel: leftFp.label,
          rightLabel: rightFp.label,
          leftPkg: pkgSummary(leftResolved),
          rightPkg: pkgSummary(rightResolved),
          diff,
          capabilities,
          maintainersDiff: maintainerDiff,
          additionsOnlyRisk,
          analysis: analysisForFinal(),
          llmTriage,
          scanWarnings,
          scannedLeft: leftFp.scannedFiles,
          scannedRight: rightFp.scannedFiles,
          parseFailures,
          externalsOnly: flags.externalsOnly,
        });

        const { relativePath } = await writeJsonReportUnderReports({
          report,
          cwd: process.cwd(),
          packageNameLeft: leftRef.name,
          packageNameRight: rightRef.name,
        });
        console.error(`Report saved: ${relativePath}`);

        console.log(JSON.stringify(report, null, 2));
        return;
      }

      printImportDiffConsole(leftFp.label, rightFp.label, diff, {
        externalsOnly: flags.externalsOnly,
        quiet: flags.quiet,
      });

      printCapabilitiesDiffConsole({
        installScripts: capabilities.installScripts,
        envAccesses: capabilities.envAccesses,
        urlLiterals: capabilities.urlLiterals,
        quiet: flags.quiet,
      });
      printAdditionsOnlyRiskConsole(additionsOnlyRisk);
      printProductVerdictConsole(buildProductVerdict(additionsOnlyRisk), {
        quiet: flags.quiet,
      });
      printAnalysisModeConsole(analysisForFinal());
      if (llmTriage) {
        printLlmTriageConsole(llmTriage);
      }

      if (scanWarnings.length) {
        const joined = scanWarnings.join(" | ");
        if (flags.quiet) console.error(`Capability scan: ${joined}`);
        else console.log(`Capability scan: ${joined}`);
      }

      if (parseFailures.length) {
        if (flags.quiet) {
          console.error(
            `Parse warnings: ${parseFailures.length} file(s) (run without --quiet for details)`
          );
        } else {
          console.log("Parse warnings (partial fingerprint):");
          for (const pf of parseFailures) {
            console.log(`  - ${pf.filePath}: ${pf.message}`);
          }
        }
      }

      if (!flags.quiet) {
        console.log(
          `Scanned files: left=${leftFp.scannedFiles}, right=${rightFp.scannedFiles}`
        );
      }
    } finally {
      await Promise.all(
        [leftDir, rightDir]
          .filter(Boolean)
          .map(async (dir) => {
            await cleanupExtractedDir(dir as string);
          })
      );
    }
  } catch (e: unknown) {
    if (
      e instanceof Error &&
      (e.message.includes("Invalid --format value") ||
        e.message.includes("Cannot use --fast together"))
    ) {
      console.error(e.message);
      process.exit(2);
    }
    throw e;
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});

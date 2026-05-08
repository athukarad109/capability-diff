import { parsePackageRef } from "./domain/packageRef";
import { extractImportsFingerprint } from "./extractor/importExtractor";
import { diffImportSets } from "./diff/importDiff";
import { buildJsonReport } from "./reporters/jsonReporter";
import { writeJsonReportUnderReports } from "./reporters/writeJsonReport";
import { printImportDiffConsole } from "./reporters/terminalReporter";
import { filterImportsToExternals } from "./reporters/importClassifier";
import {
  cleanupExtractedDir,
  fetchAndExtractTarball,
} from "./resolver/tarballFetcher";
import type { ResolvedPackage } from "./resolver/types";
import { resolvePackage } from "./resolver/npmRegistryClient";
import { parseCliArgv } from "./cli/parseArgv";

function usage(): never {
  console.error(
    `Usage:\n  npx tsx src/cli.ts <pkg@version> <pkg@version> [options]\n`
  );
  console.error(`Options:`);
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
    `Example:\n  npx tsx src/cli.ts axios@1.7.1 axios@1.7.0 --format json -e\n`
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
    const { flags, positional } = parseCliArgv(process.argv.slice(2));
    const [a, b] = positional;
    if (!a || !b) usage();

    const leftRef = parsePackageRef(a);
    const rightRef = parsePackageRef(b);

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

      if (flags.format === "json") {
        const report = buildJsonReport({
          leftLabel: leftFp.label,
          rightLabel: rightFp.label,
          leftPkg: pkgSummary(leftResolved),
          rightPkg: pkgSummary(rightResolved),
          diff,
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
    if (e instanceof Error && e.message.includes("Invalid --format value")) {
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

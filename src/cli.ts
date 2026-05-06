import { parsePackageRef } from "./domain/packageRef";
import { extractImportsFingerprint } from "./extractor/importExtractor";
import { diffImportSets } from "./diff/importDiff";
import { printImportDiffConsole } from "./reporters/terminalReporter";
import {
  cleanupExtractedDir,
  fetchAndExtractTarball,
} from "./resolver/tarballFetcher";
import { resolvePackage } from "./resolver/npmRegistryClient";

function usage(): never {
  console.error(`Usage:\n  npx tsx src/cli.ts <pkg@version> <pkg@version>\n`);
  console.error(`Example:\n  npx tsx src/cli.ts axios@1.7.1 axios@1.7.0\n`);
  process.exit(2);
}

function label(pkg: { name: string; version: string }): string {
  return `${pkg.name}@${pkg.version}`;
}

async function main(): Promise<void> {
  const a = process.argv[2];
  const b = process.argv[3];
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

    const leftFp = await extractImportsFingerprint(
      label(leftRef),
      leftDir
    );
    const rightFp = await extractImportsFingerprint(
      label(rightRef),
      rightDir
    );

    const diff = diffImportSets(leftFp.imports, rightFp.imports);

    printImportDiffConsole(leftFp.label, rightFp.label, diff);

    if (leftFp.parseFailures.length || rightFp.parseFailures.length) {
      console.log("Parse warnings (partial fingerprint):");
      for (const pf of [...leftFp.parseFailures, ...rightFp.parseFailures]) {
        console.log(`  - ${pf.filePath}: ${pf.message}`);
      }
    }

    console.log(`Scanned files: left=${leftFp.scannedFiles}, right=${rightFp.scannedFiles}`);
  } finally {
    await Promise.all(
      [leftDir, rightDir]
        .filter(Boolean)
        .map(async (dir) => {
          await cleanupExtractedDir(dir as string);
        })
    );
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
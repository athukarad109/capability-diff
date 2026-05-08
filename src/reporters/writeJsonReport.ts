import { mkdir, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";

import type { JsonReport } from "./jsonReporter";

const REPORTS_DIR = "reports";

/** Stable filename segment from an npm package name (scopes become `scope-package`). */
function sanitizePackageSlug(name: string): string {
  return name.replace(/^@/, "").replace(/\//g, "-").replace(/[^a-zA-Z0-9._-]/g, "_");
}

/** ISO timestamp suitable for filenames (Windows-safe). */
function utcFilenameStamp(now: Date): string {
  return now.toISOString().replace(/[:]/g, "-").replace(/\.\d{3}Z$/, "Z");
}

export function buildReportFileName(args: {
  packageNameLeft: string;
  packageNameRight: string;
  now?: Date;
}): string {
  const { packageNameLeft, packageNameRight, now = new Date() } = args;
  const left = sanitizePackageSlug(packageNameLeft);
  const right = sanitizePackageSlug(packageNameRight);
  const namePart = left === right ? left : `${left}_vs_${right}`;
  return `${namePart}-${utcFilenameStamp(now)}.json`;
}

/** Writes UTF-8 JSON under `<cwd>/reports/`. Ensures directory exists. */
export async function writeJsonReportUnderReports(args: {
  report: JsonReport;
  cwd: string;
  packageNameLeft: string;
  packageNameRight: string;
  now?: Date;
}): Promise<{ absolutePath: string; relativePath: string }> {
  const { report, cwd, packageNameLeft, packageNameRight, now } = args;
  const dir = join(cwd, REPORTS_DIR);
  await mkdir(dir, { recursive: true });

  const fileName = buildReportFileName({
    packageNameLeft,
    packageNameRight,
    now,
  });
  const absolutePath = join(dir, fileName);
  await writeFile(absolutePath, JSON.stringify(report, null, 2), "utf8");

  return { absolutePath, relativePath: relative(cwd, absolutePath) };
}

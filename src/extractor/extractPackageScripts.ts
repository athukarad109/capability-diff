import { readFile } from "node:fs/promises";
import { join } from "node:path";

function normalizeScriptBody(body: string): string {
  return body.trim().replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

/** Fingerprint strings: `"<scriptKey>=<normalized body>"` for stable set-diff between versions. */
export async function extractInstallScriptFingerprints(
  extractedPackageRoot: string
): Promise<{ fingerprints: Set<string>; warning?: string }> {
  const fingerprints = new Set<string>();
  const pkgPath = join(extractedPackageRoot, "package.json");
  try {
    const raw = await readFile(pkgPath, "utf8");
    const parsed = JSON.parse(raw) as { scripts?: unknown };
    const scripts = parsed.scripts;
    if (!scripts || typeof scripts !== "object" || Array.isArray(scripts)) {
      return { fingerprints };
    }
    const entries: [string, string][] = [];
    for (const [k, v] of Object.entries(scripts)) {
      if (typeof v === "string") entries.push([k, v]);
    }
    entries.sort(([a], [b]) => a.localeCompare(b));
    for (const [name, body] of entries) {
      const norm = normalizeScriptBody(body);
      if (norm.length === 0) continue;
      fingerprints.add(`${name}=${norm}`);
    }
    return { fingerprints };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      fingerprints,
      warning: `package.json (${pkgPath}): ${msg}`,
    };
  }
}

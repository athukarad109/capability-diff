import { readFile } from "node:fs/promises";
import type { ImportFingerprint } from "./types";
import { listSourceFiles } from "./fileWalker";
import { parseSourceFile } from "./parser";

function addSpecifier(spec: unknown, into: Set<string>): void {
  if (typeof spec === "string" && spec.length > 0) into.add(spec);
}

/** SWC-ish JSON AST: recursive traversal + duck typing by `type`. */
function collectImportsFromUnknownSwcStyle(node: unknown, into: Set<string>): void {
  if (node === null || typeof node !== "object") return;
  const n = node as Record<string, unknown>;

  const t = n.type;
  if (t === "ImportDeclaration") {
    const src = n.source as { value?: unknown } | undefined;
    addSpecifier(src?.value, into);
    // recurse still for nested expressions (mostly harmless due to Set)
  }

  // Re-exports commonly show up like this in SWC JSON:
  if (t === "ExportNamedDeclaration" || t === "ExportAllDeclaration") {
    const src = n.source as { value?: unknown } | undefined;
    addSpecifier(src?.value, into);
  }

  // require("x") best-effort
  if (t === "CallExpression") {
    const callee = n.callee as Record<string, unknown> | undefined;
    if (callee?.type === "Identifier" && callee.value === "require") {
      const args = n.arguments as unknown[] | undefined;
      const arg0 = args?.[0] as Record<string, unknown> | undefined;
      if (arg0?.type === "StringLiteral") addSpecifier(arg0.value, into);
    }
  }

  for (const v of Object.values(n)) {
    if (Array.isArray(v)) {
      for (const item of v) collectImportsFromUnknownSwcStyle(item, into);
    } else {
      collectImportsFromUnknownSwcStyle(v, into);
    }
  }
}

/** ESTree (typescript-eslint) nodes */
function collectImportsFromEstree(node: unknown, into: Set<string>): void {
  if (node === null || typeof node !== "object") return;
  const n = node as Record<string, unknown>;

  const t = n.type;
  if (t === "ImportDeclaration") {
    const src = n.source as { value?: unknown } | undefined;
    addSpecifier(src?.value, into);
  }

  if (t === "ExportNamedDeclaration" || t === "ExportAllDeclaration") {
    const src = n.source as { value?: unknown } | undefined | null;
    if (src) addSpecifier((src as { value?: unknown }).value, into);
  }

  if (t === "ImportExpression") {
    const src = n.source as { value?: unknown } | undefined;
    addSpecifier(src?.value, into);
  }

  if (t === "CallExpression") {
    const callee = n.callee as Record<string, unknown> | undefined;
    if (callee?.type === "Identifier" && callee.name === "require") {
      const args = n.arguments as unknown[] | undefined;
      const arg0 = args?.[0] as Record<string, unknown> | undefined;
      if (arg0?.type === "Literal") addSpecifier(arg0.value, into);
    }
  }

  for (const v of Object.values(n)) {
    if (Array.isArray(v)) {
      for (const item of v) collectImportsFromEstree(item, into);
    } else {
      collectImportsFromEstree(v, into);
    }
  }
}

export async function extractImportsFingerprint(
  label: string,
  extractedPackageDir: string
): Promise<ImportFingerprint> {
  const imports = new Set<string>();
  const parseFailures: ImportFingerprint["parseFailures"] = [];

  const files = await listSourceFiles(extractedPackageDir);

  let scannedFiles = 0;
  for (const filePath of files) {
    scannedFiles++;

    const code = await readFile(filePath, "utf8");

    const parsed = parseSourceFile(code, filePath);
    if (!parsed.ok) {
      parseFailures.push({ filePath, message: parsed.error });
      continue;
    }

    if (parsed.astKind === "swc") collectImportsFromUnknownSwcStyle(parsed.ast, imports);
    else collectImportsFromEstree(parsed.ast, imports);
  }

  return { label, imports, scannedFiles, parseFailures };
}
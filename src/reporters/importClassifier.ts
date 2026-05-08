import { builtinModules } from "node:module";

export type ImportKind = "internal" | "builtin" | "external";

const BUILTIN = new Set([
  ...builtinModules,
  ...builtinModules.map((m) => `node:${m}`),
]);

/** Narrow the fingerprint to dependency surface (published packages / bare specifiers). */
export function filterImportsToExternals(
  imports: ReadonlySet<string>
): Set<string> {
  return new Set([...imports].filter((s) => classifyImport(s) === "external"));
}

export function classifyImport(spec: string): ImportKind {
  if (
    spec.startsWith("./") ||
    spec.startsWith("../") ||
    spec.startsWith("/") ||
    spec.startsWith("file:")
  ) {
    return "internal";
  }

  if (BUILTIN.has(spec)) {
    return "builtin";
  }

  return "external";
}
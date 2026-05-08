/**
 * v0: trim only; preserves relative `./`/`../` and package specifier semantics.
 */
export function normalizeImportSpecifier(spec: string): string {
  return spec.trim();
}

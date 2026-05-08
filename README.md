# supply-chain-gap

CLI tool that fingerprints **JavaScript import specifiers** in two npm package versions (`pkg@A` vs `pkg@B`), diffs those sets, and prints a deterministic report.

This is intentionally a **narrow capability slice**: static import / `require` / re-export extraction from published tarball source. It does **not** yet analyze install scripts, environment reads, network URLs in strings, dependency reachability, or LLM-based triage.

## Requirements

- Node.js with npm
- Dependencies as in `package.json` (`tsx` used for running the CLI in dev)

## Usage

```bash
npx tsx src/cli.ts <pkg@version> <pkg@version> [options]
```

**Examples**

```bash
# Human-readable comparison (baseline = first argument, compare = second)
npx tsx src/cli.ts axios@1.7.1 axios@1.7.0

# Machine-readable JSON (stable envelope; see “JSON schema” below)
npx tsx src/cli.ts axios@1.7.1 axios@1.7.0 --format json

# Only external npm-style specifiers (omit built-ins and relative imports from the diff)
npx tsx src/cli.ts axios@1.7.1 axios@1.7.0 -e --format json

# Less verbose terminal output (omits unchanged section and scan footer; short parse summary)
npx tsx src/cli.ts axios@1.7.1 axios@1.7.0 -q
```

### Options

| Flag | Meaning |
|------|---------|
| `--format json` \| `--format pretty` | Output format (default `pretty`). |
| `json` \| `pretty` | Loose placement still accepted (useful when args are forwarded from npm scripts). |
| `-e`, `--externals-only` | Diff uses only **external** import specifiers (dependency surface). Built-ins and relative/`file:` specifiers are dropped before diffing. |
| `-q`, `--quiet` | **Pretty mode only:** hides the unchanged section and the scanned-files footer; prints a one-line parse-warning count instead of listing each failure. Ignored for JSON (JSON stays canonical for tooling). |

### Semantic meaning

- **Baseline** = first `pkg@version` argument.
- **Compare** = second argument.
- **Removed**: present in baseline, absent in compare.
- **Added**: present in compare, absent in baseline.
- **Unchanged**: in both versions.

Imports are trimmed (whitespace only) before diffing. Specifiers are otherwise kept raw (`./foo`, `@scope/bar`, etc.).

## JSON report versioning

Every JSON payload includes a stable envelope:

```json
{
  "schema": {
    "id": "supply-chain-gap.import-diff-report",
    "version": "1.0.0"
  },
  "filters": {
    "externalsOnly": false
  }
}
```

Policy:

- Bump **`schema.version`** **major** when a consumer must change code (field removed, renamed, or meaning changed).
- Bump **minor** for backward-compatible additions (new optional fields only).
- Canonical constants live in `src/reporters/reportSchema.ts`; keep them aligned with this section when you bump.

Additional top-level sections include **`compared`**, **`packages`** (summaries plus `publishTime` when available from the registry), **`totals`**, grouped **`removed` / `added` / `unchanged`** (each split into `external`, `builtin`, `internal`), **`scannedFiles`**, and **`parseFailures`**.

## Limits (current)

- Scanned extensions: `.js`, `.mjs`, `.cjs`, `.ts` (no `.tsx`/`.jsx` in the walker yet).
- Analysis is purely static; conditional or dynamic constructs may be missed unless they match the simple patterns extracted from the AST.
- Registry calls hit `https://registry.npmjs.org` (offline or private registries are not wired yet).

## Scripts

```bash
npm run build   # Compile to dist/
npm run dev -- <pkg@version> <pkg@version> [options]   # tsx shortcut (append args after -- )
npm test        # Runs Vitest when tests exist
```

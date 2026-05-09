# supply-chain-gap

CLI tool that fingerprints **JavaScript import specifiers** in two npm package versions (`pkg@A` vs `pkg@B`), diffs those sets, and reports **deterministic drift** for imports plus a first **capability slice**: **`package.json` scripts**, static **`process.env` / `import.meta.env`** member paths, and **http(s)** string/template chunks seen in parsed source.

This does **not** prove malicious behavior, does not execute the package, and does not yet cover install hooks beyond `scripts`, dynamic env keys, exhaustive URLs, dependency reachability, or LLM triage.

## Requirements

- Node.js with npm
- Dependencies as in `package.json` (`tsx` used for running the CLI in dev)

## Usage

```bash
npx tsx src/cli.ts <pkg@version> <pkg@version> [options]
npx tsx src/cli.ts <pkg@ver1..ver2> [options]
```

**Examples**

```bash
# Human-readable comparison (baseline = first argument, compare = second)
npx tsx src/cli.ts axios@1.7.1 axios@1.7.0

# Fast mode (default): deterministic diff only — no LLM calls
npx tsx src/cli.ts axios@1.7.1 axios@1.7.0 --fast

# Deep mode: LLM triage when additive signals exist (requires SCG_LLM_API_KEY unless skipped)
npx tsx src/cli.ts axios@1.7.1 axios@1.7.0 --deep

# Single-token range (baseline .. compare, same package name)
npx tsx src/cli.ts lodash@4.17.20..4.17.21 --format json

# Machine-readable JSON (stable envelope; see “JSON schema” below)

# Only external npm-style specifiers (omit built-ins and relative imports from the diff)
npx tsx src/cli.ts axios@1.7.1 axios@1.7.0 -e --format json

# Less verbose terminal output (omits unchanged section and scan footer; short parse summary)
npx tsx src/cli.ts axios@1.7.1 axios@1.7.0 -q
```

### Options

| Flag | Meaning |
|------|---------|
| `--fast` | **Default.** Deterministic analysis only (no LLM / changelog fetches). |
| `--deep` | Enables optional OpenAI-compatible LLM triage when the diff has additive signals; skipped when there is nothing additive to analyze (see JSON `analysis`). |
| `--llm-triage` | Deprecated alias for `--deep`. |
| `--llm-model <name>` | Model for deep LLM triage (default `gpt-5.5`; `SCG_LLM_MODEL` overrides). |
| `--format json` \| `--format pretty` | Output format (default `pretty`). |
| `json` \| `pretty` | Loose placement still accepted (useful when args are forwarded from npm scripts). |
| `-e`, `--externals-only` | Diff uses only **external** import specifiers (dependency surface). Built-ins and relative/`file:` specifiers are dropped before diffing. |
| `-q`, `--quiet` | **Pretty mode:** hides unchanged imports and the scanned-files footer; short parse-warning summary; summarizes capability drift when present (otherwise skips the verbose capability section). Ignored for JSON payload shape. |

### Semantic meaning

- **Baseline** = first `pkg@version` argument, **or** the version **before** `..` in `pkg@ver1..ver2`.
- **Compare** = second argument, **or** the version **after** `..`.
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
    "version": "1.7.0"
  },
  "filters": {
    "externalsOnly": false
  },
  "analysis": {
    "mode": "fast"
  },
  "maintainersDiff": {
    "added": [],
    "removed": []
  },
  "verdict": {
    "label": "REVIEW",
    "summary": "(plain-language summary)",
    "heuristicLevel": "low"
  }
}
```

Policy:

- Bump **`schema.version` major** when a consumer must change code (field removed, renamed, or meaning changed).
- Bump **minor** for backward-compatible additions only.

Canonical constants live in `src/reporters/reportSchema.ts`; keep README examples aligned when you bump.

Additional sections include **`verdict`** (`label`: CLEAN \| REVIEW \| SUSPICIOUS \| CRITICAL; **`summary`**; **`heuristicLevel`**), **`analysis`** (`mode`: `fast` \| `deep`; when deep LLM triage is skipped, **`deepSkipped`** and **`deepSkipReason`**), **`maintainersDiff`** (registry accounts added/removed vs baseline), **`additionsOnlyRisk`** (includes **`semver`** bump weighting and raw vs maintainer score breakdown), **`capabilities`** (`installScripts`, `envAccesses`, `urlLiterals`; each has `removed` / `added` / `unchanged` like imports), **`scanWarnings`** (non-fatal, e.g. unreadable `package.json`), **`compared`**, **`packages`**, import **`totals`**, grouped import **`removed` / `added` / `unchanged`**, **`scannedFiles`**, and **`parseFailures`**.

Install script entries are fingerprints of the form **`scriptName=`** + normalized script body.

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

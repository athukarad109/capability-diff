import { parseSync } from "@swc/core";
import { parse as parseEstree } from "@typescript-eslint/typescript-estree";

export type ParsedOk =
  | { ok: true; astKind: "swc"; ast: unknown }
  | { ok: true; astKind: "estree"; ast: unknown };

export type ParsedErr = { ok: false; error: string };
export type ParseResult = ParsedOk | ParsedErr;

function parseWithSwc(code: string, filePath: string): unknown {
  const ext = filePath.toLowerCase();
  const isTs = ext.endsWith(".ts");

  return parseSync(code, {
    syntax: isTs ? "typescript" : "ecmascript",
    decorators: false,
    dynamicImport: true,
    // If you scan .tsx later:
    jsx: ext.endsWith("tsx"),
    tsx: ext.endsWith("tsx"),
  });
}

function parseWithEstreeFallback(code: string, filePath: string): unknown {
  return parseEstree(code, {
    comment: false,
    loc: false,
    tokens: false,
    range: false,
    jsx: filePath.endsWith(".tsx"),
    errorOnUnknownASTType: false,
    // Helps parse many ".js" files that are authored like modules:
    sourceType: "module",
    ecmaVersion: "latest",
  });
}

export function parseSourceFile(code: string, filePath: string): ParseResult {
  try {
    const ast = parseWithSwc(code, filePath);
    return { ok: true, astKind: "swc", ast };
  } catch (eSwc: unknown) {
    const swcMsg = eSwc instanceof Error ? eSwc.message : String(eSwc);
    try {
      const ast = parseWithEstreeFallback(code, filePath);
      return { ok: true, astKind: "estree", ast };
    } catch (eEs: unknown) {
      const esMsg = eEs instanceof Error ? eEs.message : String(eEs);
      return { ok: false, error: `swc failed: ${swcMsg}; estree failed: ${esMsg}` };
    }
  }
}
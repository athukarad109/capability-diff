const URL_REGEX = /^https?:\/\/[^\s]+$/i;

function addUrlLiteral(value: string, into: Set<string>): void {
  const t = value.trim();
  if (!URL_REGEX.test(t)) return;
  into.add(t);
}

/** ESTree Identifier uses `name`. */
function idName(node: Record<string, unknown> | undefined): string | undefined {
  if (!node || node.type !== "Identifier") return undefined;
  const n = node.name;
  return typeof n === "string" ? n : undefined;
}

function literalString(node: Record<string, unknown> | undefined): string | undefined {
  if (!node) return undefined;
  if (node.type === "Literal" && typeof node.value === "string") return node.value;
  return undefined;
}

/**
 * Walk static member chain; returns segment names left-to-right, or undefined if not static.
 * Handles `import.meta` as the leftmost segment label `import.meta`.
 */
function flattenEstreeMemberSegments(
  expr: Record<string, unknown> | undefined
): string[] | undefined {
  if (!expr) return undefined;

  if (expr.type === "MemberExpression") {
    const prop = expr.computed
      ? literalString(expr.property as Record<string, unknown>)
      : idName(expr.property as Record<string, unknown>);
    if (prop === undefined) return undefined;

    const obj = flattenEstreeMemberSegments(
      expr.object as Record<string, unknown> | undefined
    );
    if (!obj) return undefined;
    return [...obj, prop];
  }

  if (expr.type === "MetaProperty") {
    const m = expr.meta as Record<string, unknown> | undefined;
    const p = expr.property as Record<string, unknown> | undefined;
    if (idName(m) !== "import" || idName(p) !== "meta") return undefined;
    return ["import.meta"];
  }

  if (expr.type === "Identifier") {
    const nm = idName(expr);
    if (!nm) return undefined;
    return [nm];
  }

  return undefined;
}

function tryEnvFingerFromSegments(segments: string[]): string | undefined {
  if (segments.length < 3) return undefined;
  if (segments[0] === "process" && segments[1] === "env") {
    return `process.env.${segments.slice(2).join(".")}`;
  }
  if (segments[0] === "import.meta" && segments[1] === "env") {
    return `import.meta.env.${segments.slice(2).join(".")}`;
  }
  return undefined;
}

/** SWC-ish AST: Membership uses `identifier` Identifier with `.value`; MemberExpression parallels ESTree-ish. */
function swcPropName(property: Record<string, unknown> | undefined): string | undefined {
  if (!property) return undefined;
  if (property.type === "Identifier" && typeof property.value === "string") {
    return property.value;
  }
  if (property.type === "StringLiteral" && typeof property.value === "string") {
    return property.value;
  }
  return undefined;
}

function flattenSwcMemberSegments(
  expr: Record<string, unknown> | undefined
): string[] | undefined {
  if (!expr) return undefined;

  if (expr.type === "MemberExpression") {
    const computed = Boolean(expr.computed);
    const propRaw = expr.property as Record<string, unknown> | undefined;
    const prop = computed
      ? propRaw?.type === "StringLiteral" && typeof propRaw.value === "string"
        ? propRaw.value
        : undefined
      : swcPropName(propRaw);
    if (prop === undefined) return undefined;

    const obj = flattenSwcMemberSegments(
      expr.object as Record<string, unknown> | undefined
    );
    if (!obj) return undefined;
    return [...obj, prop];
  }

  if (expr.type === "MetaPropExpr") {
    const m = expr.meta as Record<string, unknown> | undefined;
    const p = expr.property as Record<string, unknown> | undefined;
    if (swcPropName(m) !== "import" || swcPropName(p) !== "meta") return undefined;
    return ["import.meta"];
  }

  if (expr.type === "MetaProperty") {
    const m = expr.meta as Record<string, unknown> | undefined;
    const p = expr.property as Record<string, unknown> | undefined;
    if (swcPropName(m) !== "import" || swcPropName(p) !== "meta") return undefined;
    return ["import.meta"];
  }

  if (expr.type === "Identifier" && typeof expr.value === "string") {
    return [expr.value];
  }

  return undefined;
}

function collectEnvUrlsFromSwcStyle(node: unknown, env: Set<string>, urls: Set<string>): void {
  if (node === null || typeof node !== "object") return;
  const n = node as Record<string, unknown>;

  if (n.type === "StringLiteral" && typeof n.value === "string") {
    addUrlLiteral(n.value, urls);
  }

  if (n.type === "MemberExpression") {
    const segments = flattenSwcMemberSegments(n);
    if (segments) {
      const ek = tryEnvFingerFromSegments(segments);
      if (ek) env.add(ek);
    }
  }

  if (n.type === "TemplateLiteral") {
    const qs = n.quasis as unknown[] | undefined;
    if (qs) {
      for (const q of qs) {
        if (
          typeof q === "object" &&
          q &&
          (q as Record<string, unknown>).type === "TplElement"
        ) {
          const cooked = (q as Record<string, unknown>).cooked;
          if (typeof cooked === "string") addUrlLiteral(cooked, urls);
        }
      }
    }
  }

  for (const v of Object.values(n)) {
    if (Array.isArray(v)) {
      for (const item of v) collectEnvUrlsFromSwcStyle(item, env, urls);
    } else {
      collectEnvUrlsFromSwcStyle(v, env, urls);
    }
  }
}

function collectEnvUrlsFromEstree(node: unknown, env: Set<string>, urls: Set<string>): void {
  if (node === null || typeof node !== "object") return;
  const n = node as Record<string, unknown>;

  if (n.type === "Literal") {
    if (typeof n.value === "string") addUrlLiteral(n.value, urls);
  }

  if (n.type === "MemberExpression") {
    const segments = flattenEstreeMemberSegments(n);
    if (segments) {
      const ek = tryEnvFingerFromSegments(segments);
      if (ek) env.add(ek);
    }
  }

  if (n.type === "TemplateElement" && typeof n.value === "object" && n.value) {
    const cooked = (n.value as Record<string, unknown>).cooked;
    if (typeof cooked === "string") addUrlLiteral(cooked, urls);
  }

  for (const v of Object.values(n)) {
    if (Array.isArray(v)) {
      for (const item of v) collectEnvUrlsFromEstree(item, env, urls);
    } else {
      collectEnvUrlsFromEstree(v, env, urls);
    }
  }
}

export function collectCapabilitiesFromParsedAst(
  ast: unknown,
  astKind: "swc" | "estree",
  env: Set<string>,
  urls: Set<string>
): void {
  if (astKind === "swc") collectEnvUrlsFromSwcStyle(ast, env, urls);
  else collectEnvUrlsFromEstree(ast, env, urls);
}

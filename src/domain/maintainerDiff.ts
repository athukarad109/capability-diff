import type { Maintainer } from "../resolver/types";

/** Stable identity for npm-style `{ name, email }` maintainers. */
export function maintainerKey(m: Maintainer): string | null {
  const email = m.email?.trim().toLowerCase();
  if (email) return `email:${email}`;
  const name = m.name?.trim().toLowerCase();
  if (name) return `name:${name}`;
  return null;
}

export type MaintainerDiffResult = {
  added: Maintainer[];
  removed: Maintainer[];
};

/** Baseline = left/first package; compare = right/second. */
export function diffMaintainers(
  baseline: Maintainer[],
  compare: Maintainer[]
): MaintainerDiffResult {
  const baseKeys = new Set<string>();
  for (const m of baseline) {
    const k = maintainerKey(m);
    if (k) baseKeys.add(k);
  }
  const compKeys = new Set<string>();
  for (const m of compare) {
    const k = maintainerKey(m);
    if (k) compKeys.add(k);
  }

  const added: Maintainer[] = [];
  for (const m of compare) {
    const k = maintainerKey(m);
    if (k && !baseKeys.has(k)) added.push(m);
  }
  const removed: Maintainer[] = [];
  for (const m of baseline) {
    const k = maintainerKey(m);
    if (k && !compKeys.has(k)) removed.push(m);
  }
  return { added, removed };
}

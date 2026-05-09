import { z } from "zod";
import type { PackageRef } from "../resolver/types";

const semverLike = z
  .string()
  .min(1, "Version is required")
  .regex(/^[0-9A-Za-z.+\-]+$/, "Version contains invalid characters");

const unscopedNameRegex = /^[a-z0-9._\-]+$/i;
const scopedNameRegex = /^@[a-z0-9._\-]+\/[a-z0-9._\-]+$/i;

export function parsePackageRef(input: string): PackageRef {
  const atIndex = input.lastIndexOf("@");
  if (atIndex <= 0 || atIndex === input.length - 1) {
    throw new Error(
      `Invalid package reference: ${input}. Use "pkg@version" format (example: axios@1.7.1 or @scope/pkg@1.2.3).`
    );
  }

  const name = input.slice(0, atIndex);
  const version = input.slice(atIndex + 1);

  if (name.startsWith("@")) {
    z.string().regex(scopedNameRegex, "Invalid scoped package name").parse(name);
  } else {
    z.string().regex(unscopedNameRegex, "Invalid package name").parse(name);
  }

  semverLike.parse(version);

  return { name, version };
}

export type PackageRange = {
  name: string;
  /** Baseline / first version (left CLI argument). */
  baselineVersion: string;
  /** Compare / second version (right CLI argument). */
  compareVersion: string;
};

/**
 * Single-token range: `lodash@4.17.20..4.17.21` or `@scope/pkg@1.0.0..1.0.1`.
 * Baseline is the version before `..`, compare is after.
 */
export function parsePackageRange(input: string): PackageRange {
  const atIndex = input.lastIndexOf("@");
  if (atIndex <= 0) {
    throw new Error(
      `Invalid package range: ${input}. Use "pkg@ver1..ver2" (example: lodash@1.0.0..1.0.1 or @scope/pkg@2.0.0..2.1.0).`
    );
  }
  const name = input.slice(0, atIndex);
  const rest = input.slice(atIndex + 1);
  const sep = rest.indexOf("..");
  if (sep === -1) {
    throw new Error(
      `Invalid package range: ${input}. Expected two versions separated by .. (example: pkg@1.0.0..1.0.1).`
    );
  }
  const baselineVersion = rest.slice(0, sep).trim();
  const compareVersion = rest.slice(sep + 2).trim();
  if (!baselineVersion || !compareVersion) {
    throw new Error(`Invalid package range: ${input}. Both versions must be non-empty.`);
  }

  if (name.startsWith("@")) {
    z.string().regex(scopedNameRegex, "Invalid scoped package name").parse(name);
  } else {
    z.string().regex(unscopedNameRegex, "Invalid package name").parse(name);
  }

  semverLike.parse(baselineVersion);
  semverLike.parse(compareVersion);

  return { name, baselineVersion, compareVersion };
}

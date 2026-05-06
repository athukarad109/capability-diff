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
import { mkdtemp, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Subdirectory after strip=1 tarball extract (`package/` root). */
export const EXTRACT_SUBDIR_NAME = "package";

export async function mkScdTempExtractRoot(): Promise<{
  baseDir: string;
  extractDir: string;
}> {
  const baseDir = await mkdtemp(join(tmpdir(), "scd-"));
  const extractDir = join(baseDir, EXTRACT_SUBDIR_NAME);
  await mkdir(extractDir, { recursive: true });
  return { baseDir, extractDir };
}

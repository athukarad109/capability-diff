import { request } from "undici";
import { rm } from "node:fs/promises";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { extract } from "tar";

import {
  EXTRACT_SUBDIR_NAME,
  mkScdTempExtractRoot,
} from "../utils/tempDir";

export async function fetchAndExtractTarball(tarballUrl: string): Promise<string> {
  const { baseDir, extractDir } = await mkScdTempExtractRoot();

  const res = await request(tarballUrl, { method: "GET" });

  if (res.statusCode < 200 || res.statusCode >= 300) {
    await rm(baseDir, { recursive: true, force: true });
    throw new Error(
      `Failed to fetch tarball from ${tarballUrl}: ${res.statusCode}`
    );
  }

  try {
    await pipeline(
      Readable.from(res.body),
      extract({ cwd: extractDir, strip: 1 })
    );
  } catch (error) {
    await rm(baseDir, { recursive: true, force: true });
    throw error;
  }

  return extractDir;
}

export async function cleanupExtractedDir(dirPath: string): Promise<void> {
  const suffix = `/${EXTRACT_SUBDIR_NAME}`;
  const baseDir = dirPath.endsWith(suffix)
    ? dirPath.slice(0, -suffix.length)
    : dirPath;
  await rm(baseDir, { recursive: true, force: true });
}

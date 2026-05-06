import { request } from "undici";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { extract } from "tar";

export async function fetchAndExtractTarball(tarballUrl: string): Promise<string> {
    const baseDir = await mkdtemp(join(tmpdir(), "scd-"));
    const targetDir = join(baseDir, "package");
    await mkdir(targetDir, { recursive: true });

    const res = await request(tarballUrl, { method: "GET" });

    if(res.statusCode < 200 || res.statusCode >= 300) {
        await rm(baseDir, { recursive: true, force: true });
        throw new Error(`Failed to fetch tarball from ${tarballUrl}: ${res.statusCode}`);
    }

    try {
        await pipeline(
            Readable.from(res.body),
            extract({ cwd: targetDir, strip: 1 }),
        );
    } catch (error) {
        await rm(baseDir, { recursive: true, force: true });
        throw error;
    }

    return targetDir;
    
}

export async function cleanupExtractedDir(dirPath: string): Promise<void> {
    const baseDir = dirPath.endsWith("package") ? dirPath.slice(0, -"/package".length) : dirPath;
    await rm(baseDir, { recursive: true, force: true });
  }
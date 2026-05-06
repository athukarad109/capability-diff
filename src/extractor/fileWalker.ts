import { readdir } from "node:fs/promises";
import { join, sep } from "node:path";

const EXT = new Set([".js", ".mjs", ".cjs", ".ts"]);

function hasNodeModuleSegment(absPath: string): boolean {
    const parts = absPath.split(sep);
    return parts.includes("node_modules");
}

async function walkDir(dir: string, out: string[]): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });

    for (const ent of entries) {
        const p = join(dir, ent.name);
        if (hasNodeModuleSegment(p)) continue;

        if (ent.isDirectory()) {
            await walkDir(p, out);
        }else if (ent.isFile()){
            const ext = ent.name.includes(".") ? ent.name.slice(ent.name.lastIndexOf(".")).toLowerCase() : "";
            if (EXT.has(ext)) {
                out.push(p);
            }
        }
    }
}

export async function listSourceFiles(rootDir: string): Promise<string[]> {
    const out: string[] = [];
    await walkDir(rootDir, out);
    return out;
  }
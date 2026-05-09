import type { PackageRef } from "../resolver/types";

export type ParseFailure = {
    filePath: string;
    message: string;
}

export type ImportFingerprint = {
    packageRef: PackageRef;
    /** Human-readable `"name@version"` for reports. */
    label: string;
    imports: Set<string>;
    /** Static `process.env.*` / `import.meta.env.*` member access (best-effort). */
    envAccesses: Set<string>;
    /** String / template static chunks matching `http(s)://...`. */
    urlLiterals: Set<string>;
    scannedFiles: number;
    parseFailures: ParseFailure[];
}

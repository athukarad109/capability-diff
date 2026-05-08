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
    scannedFiles: number;
    parseFailures: ParseFailure[];
}

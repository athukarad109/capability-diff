export type ParseFailure = {
    filePath: string;
    message: string;
}

export type ImportFingerprint = {
    label: string;
    imports: Set<string>;
    scannedFiles: number;
    parseFailures: ParseFailure[];
}
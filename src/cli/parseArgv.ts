export type OutputFormat = "pretty" | "json";

export type CliFlags = {
  format: OutputFormat;
  externalsOnly: boolean;
  quiet: boolean;
};

function parseOutputFormat(argv: string[]): OutputFormat {
  const i = argv.indexOf("--format");
  if (i !== -1) {
    const v = argv[i + 1];
    if (v !== "json" && v !== "pretty") {
      throw new Error(
        `Invalid --format value "${v ?? ""}". Use "pretty" or "json".`
      );
    }
    return v;
  }
  const loose = argv.find((arg) => arg === "json" || arg === "pretty");
  if (loose === "json" || loose === "pretty") return loose;
  return "pretty";
}

/** Parse argv after `process.argv.slice(2)`. */
export function parseCliArgv(argv: string[]): {
  flags: CliFlags;
  positional: string[];
} {
  const format = parseOutputFormat(argv);
  const externalsOnly =
    argv.includes("--externals-only") || argv.includes("-e");
  const quiet = argv.includes("--quiet") || argv.includes("-q");

  const positional = argv.filter((arg, idx) => {
    if (arg === "--format") return false;
    if (idx > 0 && argv[idx - 1] === "--format") return false;
    if (arg === "--externals-only" || arg === "-e") return false;
    if (arg === "--quiet" || arg === "-q") return false;
    if (arg === "json" || arg === "pretty") return false;
    return true;
  });

  return {
    flags: { format, externalsOnly, quiet },
    positional,
  };
}

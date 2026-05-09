export type OutputFormat = "pretty" | "json";

/** Default is fast (deterministic only; no LLM / changelog fetches). */
export type AnalysisMode = "fast" | "deep";

export type CliFlags = {
  format: OutputFormat;
  externalsOnly: boolean;
  quiet: boolean;
  mode: AnalysisMode;
  llmModel?: string;
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

function parseAnalysisMode(argv: string[]): AnalysisMode {
  const wantsDeep = argv.includes("--deep") || argv.includes("--llm-triage");
  const wantsFast = argv.includes("--fast");
  if (wantsFast && wantsDeep) {
    throw new Error(
      "Cannot use --fast together with --deep or --llm-triage (pick one mode)."
    );
  }
  return wantsDeep ? "deep" : "fast";
}

/** Parse argv after `process.argv.slice(2)`. */
export function parseCliArgv(argv: string[]): {
  flags: CliFlags;
  positional: string[];
} {
  const format = parseOutputFormat(argv);
  const mode = parseAnalysisMode(argv);
  const externalsOnly =
    argv.includes("--externals-only") || argv.includes("-e");
  const quiet = argv.includes("--quiet") || argv.includes("-q");
  const llmModelIndex = argv.indexOf("--llm-model");
  const llmModel =
    llmModelIndex !== -1 && argv[llmModelIndex + 1]
      ? argv[llmModelIndex + 1]
      : undefined;

  const positional = argv.filter((arg, idx) => {
    if (arg === "--format") return false;
    if (idx > 0 && argv[idx - 1] === "--format") return false;
    if (arg === "--llm-model") return false;
    if (idx > 0 && argv[idx - 1] === "--llm-model") return false;
    if (arg === "--externals-only" || arg === "-e") return false;
    if (arg === "--quiet" || arg === "-q") return false;
    if (arg === "--fast" || arg === "--deep" || arg === "--llm-triage") return false;
    if (arg === "json" || arg === "pretty") return false;
    return true;
  });

  return {
    flags: { format, externalsOnly, quiet, mode, llmModel },
    positional,
  };
}

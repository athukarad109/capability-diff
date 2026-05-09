import { request } from "undici";

import type { JsonReport } from "../reporters/jsonReporter";

export type LlmVerdict = "monitor" | "review" | "urgent";

export type LlmTriage = {
  provider: "openai-compatible";
  model: string;
  generatedAt: string;
  status: "ok" | "error";
  summary?: string;
  verdict?: LlmVerdict;
  findings?: Array<{
    signal: string;
    severity: "low" | "medium" | "high";
    rationale: string;
  }>;
  error?: string;
};

type TriageRaw = {
  summary: string;
  verdict: LlmVerdict;
  findings: Array<{
    signal: string;
    severity: "low" | "medium" | "high";
    rationale: string;
  }>;
};

function buildPromptContext(report: JsonReport): string {
  const payload = {
    compared: report.compared,
    filters: report.filters,
    totals: report.totals,
    additionsOnlyRisk: report.additionsOnlyRisk,
    added: report.added,
    capabilities: {
      installScripts: report.capabilities.installScripts,
      envAccesses: report.capabilities.envAccesses,
      urlLiterals: report.capabilities.urlLiterals,
    },
    scanWarnings: report.scanWarnings,
    parseFailuresCount: report.parseFailures.length,
  };
  return JSON.stringify(payload, null, 2);
}

function extractFirstJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  return text.slice(start, end + 1);
}

function parseAndValidate(rawText: string): TriageRaw {
  const jsonText = extractFirstJsonObject(rawText);
  if (!jsonText) {
    throw new Error("Model response did not include a JSON object");
  }
  const parsed = JSON.parse(jsonText) as Partial<TriageRaw>;
  if (
    typeof parsed.summary !== "string" ||
    !["monitor", "review", "urgent"].includes(String(parsed.verdict)) ||
    !Array.isArray(parsed.findings)
  ) {
    throw new Error("Model response JSON does not match expected triage shape");
  }
  return {
    summary: parsed.summary,
    verdict: parsed.verdict as LlmVerdict,
    findings: parsed.findings
      .filter(
        (f): f is {
          signal: string;
          severity: "low" | "medium" | "high";
          rationale: string;
        } =>
          !!f &&
          typeof f === "object" &&
          typeof (f as { signal?: unknown }).signal === "string" &&
          ["low", "medium", "high"].includes(
            String((f as { severity?: unknown }).severity)
          ) &&
          typeof (f as { rationale?: unknown }).rationale === "string"
      )
      .slice(0, 12),
  };
}

export async function runLlmTriage(args: {
  report: JsonReport;
  model?: string;
}): Promise<LlmTriage> {
  const apiKey = process.env.SCG_LLM_API_KEY;
  const base = (process.env.SCG_LLM_BASE_URL ?? "https://api.openai.com/v1").replace(
    /\/+$/,
    ""
  );
  const model = args.model ?? process.env.SCG_LLM_MODEL ?? "gpt-5.5";
  const generatedAt = new Date().toISOString();

  if (!apiKey) {
    return {
      provider: "openai-compatible",
      model,
      generatedAt,
      status: "error",
      error:
        "Missing SCG_LLM_API_KEY (set it to enable deep LLM triage; use --deep)",
    };
  }

  const system = `You are a supply-chain triage assistant. Return ONLY JSON with this exact shape:
{
  "summary": string,
  "verdict": "monitor" | "review" | "urgent",
  "findings": [{ "signal": string, "severity": "low" | "medium" | "high", "rationale": string }]
}
Use only evidence present in the provided report context. Keep findings concise and deterministic.`;

  const user = `Analyze this report context and produce triage JSON:\n\n${buildPromptContext(
    args.report
  )}`;

  try {
    const res = await request(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });

    if (res.statusCode < 200 || res.statusCode >= 300) {
      const body = await res.body.text();
      return {
        provider: "openai-compatible",
        model,
        generatedAt,
        status: "error",
        error: `LLM HTTP ${res.statusCode}: ${body.slice(0, 400)}`,
      };
    }

    const data = (await res.body.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      return {
        provider: "openai-compatible",
        model,
        generatedAt,
        status: "error",
        error: "LLM response missing choices[0].message.content",
      };
    }

    const triage = parseAndValidate(content);
    return {
      provider: "openai-compatible",
      model,
      generatedAt,
      status: "ok",
      summary: triage.summary,
      verdict: triage.verdict,
      findings: triage.findings,
    };
  } catch (e: unknown) {
    return {
      provider: "openai-compatible",
      model,
      generatedAt,
      status: "error",
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

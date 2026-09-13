import { ConflictCandidate } from "../detector/overlap.js";
import { ConflictExplanation, ReasoningProvider } from "./types.js";
import { buildConflictPrompt, parseExplanationResponse } from "./prompt.js";

export interface OllamaOptions {
  host?: string;
  model?: string;
}

// Deliberately no client-side rate limiter here, unlike GeminiReasoningProvider.
// Gemini's limiter exists because the free tier is a metered cloud quota you
// can exceed and get a 429 for. Ollama runs against your own machine — its
// real constraint is local CPU/GPU throughput, not a requests-per-minute cap,
// so adding artificial throttling here would only slow things down for no
// actual protection.
export class OllamaReasoningProvider implements ReasoningProvider {
  private host: string;
  private model: string;

  constructor(options: OllamaOptions = {}) {
    this.host = options.host ?? "http://localhost:11434";
    this.model = options.model ?? "llama3.1";
  }

  async explainConflict(candidate: ConflictCandidate): Promise<ConflictExplanation> {
    const prompt = buildConflictPrompt(candidate);

    let response: Response;
    try {
      response = await fetch(`${this.host}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: this.model,
          prompt,
          stream: false,
          format: "json",
        }),
      });
    } catch (err) {
      throw new Error(
        `Could not reach Ollama at ${this.host} — is it running? Start it with ` +
          `\`ollama serve\`, and make sure the model is pulled with \`ollama pull ${this.model}\`. ` +
          `(${(err as Error).message})`
      );
    }

    if (!response.ok) {
      throw new Error(`Ollama request failed: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as { response?: string };
    return parseExplanationResponse(data.response ?? "");
  }
}
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { OllamaReasoningProvider } from "./ollama.js";
import { ConflictCandidate } from "../detector/overlap.js";

const candidate: ConflictCandidate = {
  symbolName: "add",
  changedIn: "A",
  changedAt: { filePath: "/tmp/does-not-exist.ts", startLine: 1, endLine: 3 },
  usedIn: "B",
  usageLocation: { name: "add", filePath: "/tmp/also-does-not-exist.ts", line: 11 },
};

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("OllamaReasoningProvider", () => {
  it("posts to the default local host and model when none are given", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ response: '{"severity":"high","explanation":"breaks"}' }),
    });

    const provider = new OllamaReasoningProvider();
    await provider.explainConflict(candidate);

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:11434/api/generate",
      expect.objectContaining({ method: "POST" })
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.model).toBe("llama3.1");
    expect(body.stream).toBe(false);
  });

  it("uses a custom host and model when provided", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ response: '{"severity":"low","explanation":"fine"}' }),
    });

    const provider = new OllamaReasoningProvider({ host: "http://192.168.1.5:11434", model: "qwen2.5-coder" });
    await provider.explainConflict(candidate);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://192.168.1.5:11434/api/generate");
    expect(JSON.parse(init.body).model).toBe("qwen2.5-coder");
  });

  it("parses a valid JSON response into severity + explanation", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        response: '{"severity":"high","explanation":"add() now takes 3 args, call site passes 2."}',
      }),
    });

    const result = await new OllamaReasoningProvider().explainConflict(candidate);
    expect(result.severity).toBe("high");
    expect(result.explanation).toContain("3 args");
  });

  it("falls back to medium severity when the model returns malformed JSON", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ response: "not json at all, the model rambled" }),
    });

    const result = await new OllamaReasoningProvider().explainConflict(candidate);
    expect(result.severity).toBe("medium");
    expect(result.explanation).toBe("not json at all, the model rambled");
  });

  it("throws a clear, actionable error when Ollama isn't reachable", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));

    await expect(new OllamaReasoningProvider().explainConflict(candidate)).rejects.toThrow(
      /Could not reach Ollama.*ollama serve.*ollama pull/s
    );
  });

  it("throws when Ollama responds with a non-2xx status", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 404, statusText: "Not Found" });

    await expect(new OllamaReasoningProvider().explainConflict(candidate)).rejects.toThrow(
      /Ollama request failed: 404/
    );
  });
});
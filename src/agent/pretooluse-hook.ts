// src/agent/pretooluse-hook.ts
import { getActiveConflictFor } from "./adapter.js";

interface PreToolUseInput {
  cwd: string;
  tool_name: string;
  tool_input: { file_path?: string; [key: string]: unknown };
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

async function main(): Promise<void> {
  const raw = await readStdin();

  let input: PreToolUseInput;
  try {
    input = JSON.parse(raw);
  } catch {
    process.exit(0);
  }

  const filePath = input.tool_input?.file_path;
  if (!filePath) {
    process.exit(0);
  }

  const conflict = getActiveConflictFor(input.cwd, filePath);

  if (conflict) {
    process.stderr.write(
      `DriftWatch: blocking this edit. A HIGH severity conflict was found for "${conflict.candidate.symbolName}".\n` +
        `${conflict.explanation.explanation}\n` +
        `This symbol changed in the other active worktree. Reconsider this edit in light of that change before proceeding.\n`
    );
    process.exit(2);
  }

  process.exit(0);
}

main();
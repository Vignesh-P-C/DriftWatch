# 🔀 DriftWatch — Semantic Conflict Detection for Parallel Coding Agents

![TypeScript](https://img.shields.io/badge/TYPESCRIPT-5.x-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Node.js](https://img.shields.io/badge/NODE.JS-20.x-339933?style=for-the-badge&logo=node.js&logoColor=white)
![tree-sitter](https://img.shields.io/badge/PARSING-TREE--SITTER-orange?style=for-the-badge)
![Phase](https://img.shields.io/badge/PHASE-4%20of%204%20(in%20progress)-yellow?style=for-the-badge)
![License](https://img.shields.io/badge/LICENSE-MIT-blue?style=for-the-badge)

> A tool that watches every active git worktree in a repository — yours, your teammates', and every AI coding agent's — and warns when a change in one will **semantically** break code in another, before git ever detects a textual conflict.

---

## Overview

It's now normal to run several AI coding agents (Claude Code, Cursor background agents, Codex, Devin, etc.) in parallel on the same repo, each isolated in its own git worktree so they can't textually clobber each other. That isolation solves textual conflicts but creates a blind spot: nothing catches the case where Agent A changes what a function does or expects while Agent B is simultaneously writing code that calls it the old way. It compiles, it merges cleanly, and it's broken at runtime — discovered late and expensively.

Existing multi-agent orchestration tools solve this via **isolation** (worktrees), not **understanding** (semantic prediction). DriftWatch sits in that gap. Because each worktree only ever sees its own files, `tsc` or any other compiler can't catch this either — two worktrees can each be internally valid on their own and still be quietly heading toward a collision neither one can see, until the moment they're actually merged together.

**Engineering focus areas:**
- Static symbol-graph diffing with tree-sitter — zero AI cost for the detection layer itself
- Cross-worktree usage analysis to catch breakage before it ever reaches `git merge`
- BYOK (Bring Your Own Key) LLM reasoning layer, multi-provider by design — cloud (Gemini) and fully local (Ollama) both implemented
- Feeds a detected conflict directly into a *running* agent's context, not just a human dashboard

---

## How It Works

```
File Watcher (per worktree) → Symbol Graph Builder (tree-sitter)
    → Overlap Detector (static, no AI, $0)
    → LLM Reasoning Layer (severity + plain-English explanation)
    → Human-facing output (dashboard/CLI/VS Code) AND/OR
      Agent-facing output (context injection — the differentiator)
```

Core principle: **cheap and local first, expensive and remote last.** Static analysis does all the filtering; an LLM is only called on the small number of candidates the static layer flags — never on every keystroke, and those calls run with bounded concurrency rather than either fully sequential or an unbounded burst.

---

## Status

| Phase | Focus | Status |
|-------|-------|--------|
| 1 — Static Foundation | Symbol overlap detection between two worktrees, zero AI, $0 cost | ✅ Working |
| 2 — Live + Reasoning | File watching goes live; LLM layer explains severity and *why* something breaks | ✅ Working |
| 3 — The Differentiator | Feed warnings into a *running* agent's context so it self-corrects | ✅ Working |
| 4 — Polish, Prove, Publish | Tech-debt cleanup, multi-language support, realism testing, packaging, demo | 🚧 In Progress — tech-debt cleanup complete, see below |

The CLI has two modes. `check` runs a single comparison between two worktrees' committed history. `watch` runs continuously, reacting to live, uncommitted edits in either worktree — the mode built for working alongside an active agent or teammate.

```bash
npm install
cp .env.example .env   # add a provider — see "Reasoning Providers" below (optional)
npm run dev -- check <worktree-a-path> <worktree-b-path>
npm run dev -- watch <worktree-a-path> <worktree-b-path>
```

Without any provider configured, both commands still work — they just print raw conflict candidates (symbol, files, lines) with no severity or explanation.

Example output from `watch`, live, with the reasoning layer enabled — worktree A changes a function's signature mid-edit (uncommitted), worktree B still calls it the old way:

```
Watching . and ../driftwatch-b for changes...
[watch] change: ../driftwatch-b/src/graph/sample.ts
[12:53:24 AM] Found 1 conflict candidate(s):
  - "add" changed in worktree A (src/graph/sample.ts:1-3), used in worktree B at ../driftwatch-b/src/graph/sample.ts:11
    [HIGH] The function `add` now requires three parameters (a, b, c), but the usage site in worktree B only passes two arguments (2, 3), which will cause a compilation error or incorrect behavior.
```

---

## Reasoning Providers (BYOK)

DriftWatch never hardcodes a single LLM provider. Two are implemented so far:

| Provider | Cost | Where it runs | Set via |
|---|---|---|---|
| **Gemini** (`gemini-3.5-flash-lite`) | Free tier | Google's cloud | `GEMINI_API_KEY` in `.env` (default if no `DRIFTWATCH_LLM_PROVIDER` is set) |
| **Ollama** | Free, always | Entirely on your own machine, no API key | `DRIFTWATCH_LLM_PROVIDER=ollama` in `.env`, plus `OLLAMA_MODEL` |

Setting `DRIFTWATCH_LLM_PROVIDER` is fully backward compatible — if it's unset and `GEMINI_API_KEY` is present, DriftWatch behaves exactly as it always has.

### A real before-and-after on local model reliability

Local models were genuinely tested against the same real conflict scenario shown above, not assumed to work — and the first results exposed real problems, honestly reported rather than glossed over:

- **`llama3.1`, default settings:** correctly read that `add()` now needed 3 arguments against a 2-argument call site, but still rated it **LOW** severity — the facts were right, the judgment wasn't.
- **`qwen2.5-coder`, default settings:** rated the same case correctly as **HIGH**, but in the same run, hallucinated an unrelated, nonexistent bug in a completely different file — a real false positive.

Two concrete changes to the shared prompt fixed both problems in follow-up testing:
1. **Temperature lowered from Ollama's default (0.8, tuned for creative writing) to 0.1** — this is a factual comparison task with one correct answer, not open-ended generation.
2. **Two worked examples added** (using unrelated function names, deliberately different from the test scenario, so the model is learning the *reasoning pattern* rather than pattern-matching this specific case), plus an explicit instruction to count parameters and arguments step-by-step before concluding.

After that fix, `qwen2.5-coder` produced two consecutive clean, correct HIGH-severity results on the same real scenario, with no false positives.

**Honest takeaway:** Gemini remains the recommended default — it was correct on every test, no tuning required. Ollama is a genuinely free, fully local, working BYOK option, and the prompt fix meaningfully improved its reliability, but this was verified on one recurring scenario across a handful of runs, not a broad benchmark — it should be read as "a real, working local fallback that was measurably improved," not "proven equivalent to Gemini."

---

## Architecture

### Module Structure

```
src/
├── cli/
│   └── index.ts               # CLI entry point — `check <pathA> <pathB>` / `watch <pathA> <pathB>`
│
├── detector/
│   ├── changed.ts             # Symbol graphs from committed diffs AND live working-tree diffs
│   ├── overlap.ts             # Cross-references changed symbols against usages in the other worktree
│   ├── diff.ts                # Parses `git diff -U0` output into precise per-hunk line ranges
│   └── git.ts                 # Thin wrapper around the git CLI (diff, merge-base, working-tree diff)
│
├── graph/
│   ├── builder.ts             # tree-sitter based symbol extraction from a source file
│   ├── types.ts                # SymbolGraph data structure + helpers
│   ├── usage.ts                 # Finds where a given symbol name is referenced across a worktree
│   ├── sample.ts                 # Manual test fixture used for end-to-end conflict scenarios
│   ├── inspect.ts                # Dev scratch script - parses sample.ts and prints its symbol graph for manual inspection. Not part of the CLI pipeline.
│   └── walker.ts                 # Recursively walks an entire worktree and builds a full SymbolGraph across all files (buildGraphForWorktree). Not yet wired into check/watch - groundwork for whole-repo analysis (multi-language support, realism testing).
│
├── watcher/
│   └── index.ts                # chokidar-based live watcher - debounced re-checks on file save, feeds results into the agent adapter. Ignores its own generated DRIFTWATCH_ALERTS.md to avoid re-triggering itself.
│
├── reasoning/
│   ├── types.ts                # Provider-agnostic ReasoningProvider interface (BYOK contract)
│   ├── prompt.ts                # Shared prompt-building and JSON response parsing, used by every provider so they can't silently drift apart
│   ├── gemini.ts                 # Gemini implementation - rate-limited (8 req/min sliding window), low temperature, code-aware prompting
│   ├── ollama.ts                  # Ollama implementation - no rate limiter (local inference isn't quota-metered), low temperature, same shared prompt
│   ├── concurrency.ts             # Bounded-concurrency worker pool - runs reasoning calls with a configurable number in flight at once instead of fully sequential or unbounded
│   └── index.ts                   # Picks a provider based on DRIFTWATCH_LLM_PROVIDER, falling back to Gemini-if-key-present for backward compatibility
│
├── agent/
│   ├── types.ts                # ExplainedConflict / DriftwatchState shapes shared by the watcher and the hook
│   ├── adapter.ts               # writeState() persists explained conflicts to .driftwatch/state.json in both worktrees; getActiveConflictFor() reads it back for a given file, filtered to HIGH severity only; writeFallbackAlerts() writes a human/agent-readable DRIFTWATCH_ALERTS.md for agents without native hook support
│   └── pretooluse-hook.ts       # Claude Code PreToolUse hook entry point - reads hook JSON from stdin, checks for a HIGH conflict on the file about to be edited, and if found writes an explanation to stderr and exits 2 to block the edit
│
└── test-agent-adapter.ts      # (removed - superseded by src/agent/adapter.test.ts, see Testing below)
```

Phase 3 added the `agent/` module: context injection adapters that feed conflicts directly into a running agent rather than a human-facing output. It supports a Claude Code `PreToolUse` hook, plus a generic file/pipe-based fallback adapter (`DRIFTWATCH_ALERTS.md`) for agents without native hook support (Cursor, Codex, Devin, etc).

**Two things worth knowing about current behavior:**
- **The differentiator requires a configured reasoning provider.** `writeState()` and `writeFallbackAlerts()` only run when a provider is configured - without one, no state file is ever written, so the hook has nothing to check and never blocks anything. Running provider-less gives you Phase 1's raw conflict candidates only, not agent context injection.
- **Only HIGH severity blocks an edit.** MEDIUM and LOW conflicts are surfaced in `DRIFTWATCH_ALERTS.md` but never trigger the `PreToolUse` hook - this is deliberate, so an agent isn't halted for minor, likely-safe changes.

### Key Design Decisions

**Static analysis before any AI call**
The overlap detector is pure static analysis - tree-sitter parsing plus git diff hunk math, zero API calls. An LLM is only ever invoked on the small set of candidates this layer surfaces, keeping the tool usable at $0 for most workflows.

**Diff at zero context (`git diff -U0`)**
Git's default diff output pads real changes with surrounding context lines, which - in early testing - caused unrelated declarations sitting near a real edit to get flagged as "changed." Diffing with zero context and parsing hunk headers directly for exact line ranges keeps symbol-overlap checks precise.

**BYOK, multi-provider from day one**
No LLM provider is ever hardcoded. End users supply their own API key (or run entirely locally with Ollama), matching the pattern used by Aider, Cursor, and Continue.dev - this keeps the core tool provider-agnostic and cost-transparent. Both implemented providers share one prompt-building module (`prompt.ts`) so their behavior can't silently diverge over time.

**Bounded concurrency for reasoning calls, not sequential or unbounded**
Reasoning calls run through a small worker-pool utility (`concurrency.ts`) that keeps a configurable number of calls in flight at once (`DRIFTWATCH_LLM_CONCURRENCY`, default 3), rather than waiting for each candidate one at a time or firing all of them simultaneously. Google no longer publishes a fixed free-tier rate-limit table (limits are per-project, visible in AI Studio), so this is intentionally conservative by default rather than tuned to a number that could change without notice.

**Git worktrees as the isolation primitive, not a custom sandbox**
Rather than inventing a new isolation mechanism, DriftWatch works directly with the same git worktree setup agents and teams already use - no changes to existing workflows required to adopt it.

**Working-tree diffing, not just committed history**
`watch` diffs a merge-base commit against the live working tree (`git diff -U0 <commit>`, no second ref), not two fixed commits. This is what makes detection genuinely live - it catches a breaking change the moment it's saved, before anyone commits, which matters for the project's stated differentiator of correcting an agent mid-task.

**LLM reasoning gets real code, not just coordinates**
The reasoning layer reads the actual source around both the changed declaration and the usage site and puts both in the prompt, rather than asking the LLM to reason from symbol names and line numbers alone. The prompt also includes two worked examples and an explicit step-by-step counting instruction - added after real testing showed a general-purpose local model could get the underlying facts backwards without that structure.

**Agent context injection over a human dashboard**
The `PreToolUse` hook reads the tool-call JSON Claude Code sends on stdin, checks whether the file about to be edited has an active HIGH-severity conflict, and if so writes the explanation to stderr and exits with status `2`. In Claude Code's hook lifecycle, exit code `2` on a `PreToolUse` hook blocks that specific tool call before it runs and surfaces the stderr text back to the agent as the reason - so the agent sees *why* its edit was stopped and can self-correct, in the same turn, without a human ever needing to notice a dashboard alert. A generic file/pipe-based fallback adapter (`DRIFTWATCH_ALERTS.md`) covers agents without native hook support, at the cost of being advisory rather than enforced - nothing guarantees another agent actually reads it.

---

## Testing

```bash
npm test
```

26 automated tests across 4 files, replacing what used to be a manual, throwaway verification script (`test-agent-adapter.ts`, removed):

| File | Tests | Covers |
|---|---|---|
| `src/agent/adapter.test.ts` | 10 | State read/write, HIGH-only blocking, stale-conflict clearing, fallback alerts formatting |
| `src/reasoning/concurrency.test.ts` | 5 | Bounded worker pool - concurrency cap actually holds, order preserved, one failure doesn't sink the batch |
| `src/reasoning/ollama.test.ts` | 6 | Request shape, response parsing, malformed-JSON fallback, connection-failure error messages |
| `src/reasoning/index.test.ts` | 5 | Provider selection logic across every `DRIFTWATCH_LLM_PROVIDER` combination - added after a duplicate-export bug in this exact file once passed `npm test` silently, since nothing had imported it before |

**What's tested at the unit level vs. what's manually verified:** the `PreToolUse` hook's exit-code behavior (blocks on a real HIGH conflict, allows an unrelated file, fails open on malformed input) was verified by feeding the actual hook script real Claude Code-shaped JSON on stdin and checking its exit code and stderr directly - proven correct, but currently as a manual verification pass rather than an automated test in this suite. A real live Claude Code session was not used to confirm this end-to-end, since that requires a paid Claude plan or API credits; the exit-code contract itself is confirmed against Claude Code's current published hook documentation.

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Language | TypeScript / Node.js |
| Static analysis | tree-sitter |
| File watching | chokidar |
| Git operations | Shell out to the `git` CLI directly |
| Testing | Vitest |
| LLM provider(s) | Multi-provider interface (BYOK); Gemini (`gemini-3.5-flash-lite`) and Ollama (local, tested with `qwen2.5-coder`) both implemented |
| Agent integration | Claude Code `PreToolUse` hook, generic file/pipe fallback adapter |
| Distribution (planned) | npm package + VS Code extension + GitHub Action, from one core engine |
| License | MIT |

---

## Run Locally

```bash
git clone https://github.com/Vignesh-P-C/DriftWatch.git
cd DriftWatch
npm install
cp .env.example .env   # optional - add a provider (Gemini key or Ollama) to enable severity + explanations
npm run dev -- check <worktree-a-path> <worktree-b-path>
npm run dev -- watch <worktree-a-path> <worktree-b-path>
```

To try it against a real conflict scenario: set up a second worktree (`git worktree add ../other-worktree <branch>`), change a function's signature in one, call it the old way in the other, and run `check` (committed history) or `watch` (leave the edit uncommitted and watch it get caught live).

---

## Known Limitations

Stated plainly rather than hidden, since these are real findings from actually testing the tool, not guesses:

- **Symbol matching is name-based, not scope-aware.** The static detector can produce false positives when two unrelated things share a name - observed directly during testing, when the project's own exported `watch` function was flagged against an unrelated `chokidar.watch()` call from a completely different library. Worth addressing before the realism-testing pass against a real repo, where name collisions will be far more common than in this project's own small codebase.
- **Local reasoning models are a real but less-proven fallback.** See "A real before-and-after on local model reliability" above - genuinely free and functional, measurably improved by prompt tuning, but tested on a narrow scenario rather than a broad benchmark.
- **The `PreToolUse` hook has not been verified inside a live Claude Code session**, only at the script level against Claude Code's documented contract - see Testing above.

---

## Roadmap

| Feature | Status |
|---------|--------|
| Symbol graph extraction via tree-sitter | ✅ Complete |
| Git diff hunk parsing (zero-context, precise ranges) | ✅ Complete |
| Cross-worktree usage detection | ✅ Complete |
| CLI conflict check command | ✅ Complete |
| Live file watching (working-tree diffing, debounced) | ✅ Complete |
| LLM severity + explanation layer, code-aware prompting | ✅ Complete |
| Agent context injection adapter (Claude Code hook + fallback) | ✅ Complete |
| Automated test suite (Vitest) | ✅ Complete |
| Bounded-concurrency reasoning calls | ✅ Complete |
| Second BYOK provider (Ollama, local) | ✅ Complete |
| Live Claude Code end-to-end hook verification | 📋 Planned (requires a paid Claude plan or API credits) |
| Scope-aware symbol matching (reduce name-collision false positives) | 📋 Planned |
| Additional BYOK providers (Claude, OpenAI) | 📋 Planned |
| Multi-language support beyond TS/JS | 📋 Planned |
| VS Code extension | 📋 Planned |
| GitHub Action | 📋 Planned |
| Realism testing against a real open-source repo's PR history | 📋 Planned |

---

## Glossary

- **Semantic conflict** - code that merges/compiles cleanly but behaves incorrectly, as opposed to a textual conflict, which is what `git merge` catches.
- **Symbol graph** - the structure mapping where each function/class/variable is defined vs. where it's referenced.
- **BYOK** - Bring Your Own Key - end users supply their own API key (or run a fully local model) rather than the maintainer paying for everyone's usage.
- **Git worktree** - multiple working directories attached to one repo, each on a different branch - how agents work in parallel without textual collisions.

---

## Contact

**Vignesh P C** - [GitHub](https://github.com/Vignesh-P-C) · [LinkedIn](https://www.linkedin.com/in/vignesh-p-c/)
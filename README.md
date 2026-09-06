# 🔀 DriftWatch — Semantic Conflict Detection for Parallel Coding Agents

![TypeScript](https://img.shields.io/badge/TYPESCRIPT-5.x-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Node.js](https://img.shields.io/badge/NODE.JS-20.x-339933?style=for-the-badge&logo=node.js&logoColor=white)
![tree-sitter](https://img.shields.io/badge/PARSING-TREE--SITTER-orange?style=for-the-badge)
![Phase](https://img.shields.io/badge/PHASE-2%20of%204-yellow?style=for-the-badge)
![License](https://img.shields.io/badge/LICENSE-MIT-blue?style=for-the-badge)

> A tool that watches every active git worktree in a repository — yours, your teammates', and every AI coding agent's — and warns when a change in one will **semantically** break code in another, before git ever detects a textual conflict.

---

## Overview

It's now normal to run several AI coding agents (Claude Code, Cursor background agents, Codex, Devin, etc.) in parallel on the same repo, each isolated in its own git worktree so they can't textually clobber each other. That isolation solves textual conflicts but creates a blind spot: nothing catches the case where Agent A changes what a function does or expects while Agent B is simultaneously writing code that calls it the old way. It compiles, it merges cleanly, and it's broken at runtime — discovered late and expensively.

Existing multi-agent orchestration tools solve this via **isolation** (worktrees), not **understanding** (semantic prediction). DriftWatch sits in that gap.

**Engineering focus areas:**
- Static symbol-graph diffing with tree-sitter — zero AI cost for the detection layer itself
- Cross-worktree usage analysis to catch breakage before it ever reaches `git merge`
- BYOK (Bring Your Own Key) LLM reasoning layer, multi-provider by design
- Designed to feed a detected conflict directly into a *running* agent's context, not just a human dashboard

---

## How It Works

```
File Watcher (per worktree) → Symbol Graph Builder (tree-sitter)
    → Overlap Detector (static, no AI, $0)
    → LLM Reasoning Layer (severity + plain-English explanation)
    → Human-facing output (dashboard/CLI/VS Code) AND/OR
      Agent-facing output (context injection — the differentiator)
```

Core principle: **cheap and local first, expensive and remote last.** Static analysis does all the filtering; an LLM is only called on the small number of candidates the static layer flags — never on every keystroke.

---

## Status

| Phase | Focus | Status |
|-------|-------|--------|
| 1 — Static Foundation | Symbol overlap detection between two worktrees, zero AI, $0 cost | ✅ Working |
| 2 — Live + Reasoning | File watching goes live; LLM layer explains severity and *why* something breaks | ✅ Working |
| 3 — The Differentiator | Feed warnings into a *running* agent's context so it self-corrects | 📋 Planned |
| 4 — Polish, Prove, Publish | Multi-language support, realism testing against real PR history, packaging, demo | 📋 Planned |

The CLI has two modes. `check` runs a single comparison between two worktrees' committed history. `watch` runs continuously, reacting to live, uncommitted edits in either worktree — the mode built for working alongside an active agent or teammate.

```bash
npm install
cp .env.example .env   # add your GEMINI_API_KEY to enable LLM explanations (optional)
npm run dev -- check <worktree-a-path> <worktree-b-path>
npm run dev -- watch <worktree-a-path> <worktree-b-path>
```

Without an API key, both commands still work — they just print raw conflict candidates (symbol, files, lines) with no severity or explanation.

Example output from `watch`, live, with the reasoning layer enabled — worktree A changes a function's signature mid-edit (uncommitted), worktree B still calls it the old way:

```
Watching . and ../driftwatch-b for changes...
[watch] change: ../driftwatch-b/src/graph/sample.ts
[12:53:24 AM] Found 1 conflict candidate(s):
  - "add" changed in worktree A (src/graph/sample.ts:1-3), used in worktree B at ../driftwatch-b/src/graph/sample.ts:11
    [HIGH] The function `add` now requires three parameters (a, b, c), but the usage site in worktree B only passes two arguments (2, 3), which will cause a compilation error or incorrect behavior.
```

The LLM layer isn't just flagging that something changed — in the same test run, four other genuinely safe refactors (functions moved between files, internal logic changes with unchanged signatures) were all correctly rated LOW, while this real breaking change was correctly rated HIGH with the specific parameter mismatch named.

---

## Architecture

### Module Structure

```
src/
├── cli/
│   └── index.ts              # CLI entry point — `check <pathA> <pathB>` / `watch <pathA> <pathB>`
│
├── detector/
│   ├── changed.ts            # Symbol graphs from committed diffs AND live working-tree diffs
│   ├── overlap.ts            # Cross-references changed symbols against usages in the other worktree
│   ├── diff.ts                # Parses `git diff -U0` output into precise per-hunk line ranges
│   └── git.ts                 # Thin wrapper around the git CLI (diff, merge-base, working-tree diff)
│
├── graph/
│   ├── builder.ts             # tree-sitter based symbol extraction from a source file
│   ├── types.ts                # SymbolGraph data structure + helpers
│   ├── usage.ts                 # Finds where a given symbol name is referenced across a worktree
│   └── sample.ts                 # Manual test fixture used for end-to-end conflict scenarios
│
├── watcher/
│   └── index.ts               # chokidar-based live watcher — debounced re-checks on file save
│
└── reasoning/
    ├── types.ts                # Provider-agnostic ReasoningProvider interface (BYOK contract)
    ├── gemini.ts                # Gemini implementation — rate-limited, code-aware prompting
    └── index.ts                 # Picks a provider from env vars; returns null if none configured
```

Phase 3 will add an `agent/` module (context injection adapters, feeding conflicts directly into a running agent rather than a human-facing output).

### Key Design Decisions

**Static analysis before any AI call**
The overlap detector is pure static analysis — tree-sitter parsing plus git diff hunk math, zero API calls. An LLM is only ever invoked on the small set of candidates this layer surfaces, keeping the tool usable at $0 for most workflows.

**Diff at zero context (`git diff -U0`)**
Git's default diff output pads real changes with surrounding context lines, which — in early testing — caused unrelated declarations sitting near a real edit to get flagged as "changed." Diffing with zero context and parsing hunk headers directly for exact line ranges keeps symbol-overlap checks precise.

**BYOK, multi-provider from day one**
No LLM provider is ever hardcoded. End users supply their own API key, matching the pattern used by Aider, Cursor, and Continue.dev — this keeps the core tool provider-agnostic and cost-transparent.

**Git worktrees as the isolation primitive, not a custom sandbox**
Rather than inventing a new isolation mechanism, DriftWatch works directly with the same git worktree setup agents and teams already use — no changes to existing workflows required to adopt it.

**Working-tree diffing, not just committed history**
`watch` diffs a merge-base commit against the live working tree (`git diff -U0 <commit>`, no second ref), not two fixed commits. This is what makes detection genuinely live — it catches a breaking change the moment it's saved, before anyone commits, which matters for the project's stated differentiator of correcting an agent mid-task.

**LLM reasoning gets real code, not just coordinates**
The reasoning layer reads the actual source around both the changed declaration and the usage site and puts both in the prompt, rather than asking the LLM to reason from symbol names and line numbers alone. In testing, this was the difference between generic "could break" output on every candidate and correctly distinguishing safe refactors (rated LOW) from a real parameter-count mismatch (rated HIGH, with the specific discrepancy named).

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Language | TypeScript / Node.js |
| Static analysis | tree-sitter |
| File watching | chokidar |
| Git operations | Shell out to the `git` CLI directly |
| LLM provider(s) | Multi-provider interface (BYOK); Gemini (`gemini-3.5-flash-lite`, free tier) implemented, more providers planned |
| Distribution (planned) | npm package + VS Code extension + GitHub Action, from one core engine |
| License | MIT |

---

## Run Locally

```bash
git clone https://github.com/Vignesh-P-C/DriftWatch.git
cd DriftWatch
npm install
cp .env.example .env   # optional — add a GEMINI_API_KEY to enable severity + explanations
npm run dev -- check <worktree-a-path> <worktree-b-path>
npm run dev -- watch <worktree-a-path> <worktree-b-path>
```

To try it against a real conflict scenario: set up a second worktree (`git worktree add ../other-worktree <branch>`), change a function's signature in one, call it the old way in the other, and run `check` (committed history) or `watch` (leave the edit uncommitted and watch it get caught live).

---

## Roadmap

| Feature | Status |
|---------|--------|
| Symbol graph extraction via tree-sitter | ✅ Complete |
| Git diff hunk parsing (zero-context, precise ranges) | ✅ Complete |
| Cross-worktree usage detection | ✅ Complete |
| CLI conflict check command | ✅ Complete |
| Live file watching (working-tree diffing, debounced) | ✅ Complete |
| LLM severity + explanation layer, code-aware prompting (Gemini) | ✅ Complete |
| Additional BYOK providers (Claude, OpenAI, local models) | 📋 Planned |
| Agent context injection adapter | 📋 Planned |
| Multi-language support beyond TS/JS | 📋 Planned |
| VS Code extension | 📋 Planned |
| GitHub Action | 📋 Planned |
| Realism testing against a real open-source repo's PR history | 📋 Planned |

---

## Glossary

- **Semantic conflict** — code that merges/compiles cleanly but behaves incorrectly, as opposed to a textual conflict, which is what `git merge` catches.
- **Symbol graph** — the structure mapping where each function/class/variable is defined vs. where it's referenced.
- **BYOK** — Bring Your Own Key — end users supply their own API key rather than the maintainer paying for everyone's usage.
- **Git worktree** — multiple working directories attached to one repo, each on a different branch — how agents work in parallel without textual collisions.

---

## Contact

**Vignesh P C** — [GitHub](https://github.com/Vignesh-P-C) · [LinkedIn](https://www.linkedin.com/in/vignesh-p-c/)
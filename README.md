# 🔀 DriftWatch — Semantic Conflict Detection for Parallel Coding Agents

![TypeScript](https://img.shields.io/badge/TYPESCRIPT-5.x-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Node.js](https://img.shields.io/badge/NODE.JS-20.x-339933?style=for-the-badge&logo=node.js&logoColor=white)
![tree-sitter](https://img.shields.io/badge/PARSING-TREE--SITTER-orange?style=for-the-badge)
![Phase](https://img.shields.io/badge/PHASE-1%20of%204-yellow?style=for-the-badge)
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
| 2 — Live + Reasoning | File watching goes live; LLM layer explains severity and *why* something breaks | 📋 Planned |
| 3 — The Differentiator | Feed warnings into a *running* agent's context so it self-corrects | 📋 Planned |
| 4 — Polish, Prove, Publish | Multi-language support, realism testing against real PR history, packaging, demo | 📋 Planned |

Right now the CLI compares two worktrees, builds a symbol graph from the diff on each side, and flags symbols changed in one that are used in the other:

```bash
npm install
npm run dev -- check <worktree-a-path> <worktree-b-path>
```

Example output from a real test case — worktree A changes a function's signature, worktree B still calls it the old way:

```
Checking . against ../driftwatch-b...
Changed declarations in A: add
Changed declarations in B: useAdd
Found 1 conflict candidate(s):
- "add" changed in worktree A (src/graph/sample.ts:1-3), used in worktree B at ../driftwatch-b/src/graph/sample.ts:11
```

---

## Architecture

### Module Structure

```
src/
├── cli/
│   └── index.ts              # CLI entry point — `check <pathA> <pathB>`
│
├── detector/
│   ├── changed.ts            # Builds a symbol graph of what changed, from raw git diff hunks
│   ├── overlap.ts            # Cross-references changed symbols against usages in the other worktree
│   ├── diff.ts                # Parses `git diff -U0` output into precise per-hunk line ranges
│   └── git.ts                 # Thin wrapper around the git CLI (diff, merge-base, current commit)
│
└── graph/
    ├── builder.ts             # tree-sitter based symbol extraction from a source file
    ├── types.ts                # SymbolGraph data structure + helpers
    ├── usage.ts                 # Finds where a given symbol name is referenced across a worktree
    └── sample.ts                 # Manual test fixture used for end-to-end conflict scenarios
```

Phases 2–4 will add a `watcher/` module (chokidar-based live file watching), a `reasoning/` module (multi-provider LLM client for severity + explanation), and an `agent/` module (context injection adapters).

### Key Design Decisions

**Static analysis before any AI call**
The overlap detector is pure static analysis — tree-sitter parsing plus git diff hunk math, zero API calls. An LLM is only ever invoked on the small set of candidates this layer surfaces, keeping the tool usable at $0 for most workflows.

**Diff at zero context (`git diff -U0`)**
Git's default diff output pads real changes with surrounding context lines, which — in early testing — caused unrelated declarations sitting near a real edit to get flagged as "changed." Diffing with zero context and parsing hunk headers directly for exact line ranges keeps symbol-overlap checks precise.

**BYOK, multi-provider from day one**
No LLM provider is ever hardcoded. End users supply their own API key, matching the pattern used by Aider, Cursor, and Continue.dev — this keeps the core tool provider-agnostic and cost-transparent.

**Git worktrees as the isolation primitive, not a custom sandbox**
Rather than inventing a new isolation mechanism, DriftWatch works directly with the same git worktree setup agents and teams already use — no changes to existing workflows required to adopt it.

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Language | TypeScript / Node.js |
| Static analysis | tree-sitter |
| File watching (Phase 2) | chokidar |
| Git operations | Shell out to the `git` CLI directly |
| LLM provider(s) | Multi-provider, BYOK — Gemini Flash free tier as default dev provider |
| Distribution (planned) | npm package + VS Code extension + GitHub Action, from one core engine |
| License | MIT |

---

## Run Locally

```bash
git clone https://github.com/Vignesh-P-C/DriftWatch.git
cd DriftWatch
npm install
npm run dev -- check <worktree-a-path> <worktree-b-path>
```

To try it against a real conflict scenario, set up two worktrees on diverging branches, change a function's signature in one, call it the old way in the other, and run the check between them.

---

## Roadmap

| Feature | Status |
|---------|--------|
| Symbol graph extraction via tree-sitter | ✅ Complete |
| Git diff hunk parsing (zero-context, precise ranges) | ✅ Complete |
| Cross-worktree usage detection | ✅ Complete |
| CLI conflict check command | ✅ Complete |
| Live file watching | 📋 Planned |
| LLM severity + explanation layer (BYOK, multi-provider) | 📋 Planned |
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

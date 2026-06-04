<h1 align="center">Claude Session Manager</h1>
<p align="center"><em>A terminal-themed Next.js dashboard for browsing, controlling, and auditing your Claude Code session history.</em></p>

<p align="center">
  <img src="https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white">
  <img src="https://img.shields.io/badge/Next.js%2016-black?style=flat-square&logo=next.js&logoColor=white">
  <img src="https://img.shields.io/badge/Tailwind%20CSS%20v4-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white">
  <img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square">
  <img src="https://img.shields.io/badge/status-active-brightgreen?style=flat-square">
</p>

> A full-stack web app that reads Claude Code's local JSONL session files and turns them into a searchable, filterable dashboard — with the ability to kill live processes, soft-delete sessions, and audit every destructive action.

_📸 Screenshot coming soon._

## 🎯 The Problem

Claude Code stores every session as a raw JSONL file buried in `~/.claude/projects/`. Once you have dozens of repositories and hundreds of sessions, there is no built-in way to search them, see which ones are still running, review what a past session actually did, or safely clean up stale files.

## 💡 The Solution

Claude Session Manager mounts a local Next.js server that scans those JSONL files and presents them as a clean, keyboard-navigable dashboard. You can replay full conversations, spot live vs. idle vs. ended sessions at a glance, kill runaway processes with a confirmation gate, and soft-delete old sessions to a recoverable trash — all with every action written to an append-only audit log.

## ✨ Features

- **Session list** — all repos, token counts, tool calls, model, branch, and relative time; URL-based filtering (no client JS required for navigation)
- **Session detail** — full conversation replay with collapsible tool-call input/output panels
- **Stats page** — token usage broken down by model, ASCII activity chart, and rough cost estimates
- **Live detection** — cross-checks `~/.claude/sessions/<pid>.json` against live PIDs; tags each session `LIVE`, `IDLE`, or `ENDED`
- **Kill** — SIGTERM → 5 s grace period → SIGKILL, with a confirmation dialog that requires typing the 8-char session ID prefix; refuses PIDs below 100 and processes whose cmdline doesn't contain `claude`
- **Soft delete** — moves JSONL to `~/.claude-session-manager/trash/` instead of hard-deleting; auto-purges after 30 days
- **Restore / permanent delete** — dedicated trash view at `/trash`
- **Bulk operations** — multi-select + bulk delete, kill all idle, delete old ended sessions
- **Manager page** — live session table, disk usage breakdown, process tree
- **Audit log** — every kill/delete/restore appended to `~/.claude-session-manager/audit.log`
- **Keyboard shortcuts** — `j`/`k` navigate, `x` select, `D` delete, `K` kill, `?` help
- **Read-only mode** — set `READ_ONLY=1` to disable all mutations at the server-action level

## 🛠️ Tech Stack

`Next.js 16` · `React 19` · `TypeScript 5` · `Tailwind CSS v4` · `Vitest 4` · `Next.js Server Actions`

## 🚀 Quickstart

```bash
# Clone and enter the project directory
git clone https://github.com/abdulraqeebkhatri/claude-session-tracker.git
cd claude-session-tracker/claude-session-manager

# Install dependencies
npm install

# Start the dev server (bound to 127.0.0.1 by default)
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

```bash
# LAN access (binds to 0.0.0.0)
npm run dev:lan

# Read-only mode — disables all kill/delete actions
READ_ONLY=1 npm run dev
```

### Running tests

```bash
npm test                # run all tests
npm run test:watch      # watch mode
npm run test:coverage   # coverage report
```

## 🧠 How It Works

At startup, the data layer (`lib/claude-data.ts`) walks `~/.claude/projects/` to discover every JSONL session file and `~/.claude/sessions/` to collect active-process indicators. Each file is parsed with a defensive JSONL parser that extracts token counts, model name, branch, cwd, and timestamps. A 30-second in-memory cache (TTL) prevents redundant disk reads on rapid page refreshes. All mutations — kill, delete, restore — are implemented as Next.js Server Actions so there are no unauthenticated REST endpoints; raw file paths are never surfaced in client-side error messages.

### Data sources (read-only from `~/.claude/`)

| Path | Purpose |
|------|---------|
| `~/.claude/projects/<encoded-path>/<id>.jsonl` | Session conversation logs |
| `~/.claude/sessions/<pid>.json` | Active session process indicators |
| `~/.claude/stats-cache.json` | Aggregated metrics (optional) |

The encoded path converts `/` → `-` in the project's absolute path.

### Security model

**Kill safety:** PID ≥ 100 required · cmdline must contain `claude` · SIGTERM first, then SIGKILL after 5 s · every attempt logged · confirmation dialog required.

**Delete safety:** Refuses LIVE sessions (kill first) · soft-delete only, never removes from `~/.claude/projects/` directly · trash auto-purges after 30 days.

## 📄 License

MIT © Abdul Raqeeb Khatri

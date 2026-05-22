# claude-session-manager

A terminal-themed web dashboard that monitors **and** manages Claude Code sessions across all local repositories. Extends the read-only [claude-monitor](https://github.com/ayu5h-raj/claude-monitor) concept with full session control: kill live processes, soft-delete sessions, bulk operations, and a dedicated management console.

## Features

- **Session list** — all repos, tokens, tool calls, model, branch, relative time. URL-based filtering (no JS required).
- **Session detail** — full conversation replay with collapsible tool call input/output panels.
- **Stats page** — token usage by model, ASCII activity chart, rough cost estimates.
- **Live detection** — cross-checks `~/.claude/sessions/<pid>.json` against live PIDs. Tags sessions `LIVE`, `IDLE`, or `ENDED`.
- **Kill** — SIGTERM → 5s wait → SIGKILL, with confirmation dialog (type short session hash). Linux `/proc` + cross-platform `ps` fallback.
- **Soft delete** — moves JSONL to `~/.claude-session-manager/trash/` instead of hard-deleting. Auto-purges trash after 30 days.
- **Restore / permanent delete** — trash view at `/trash`.
- **Bulk operations** — multi-select + bulk delete, kill all idle, delete old ended sessions.
- **Manager page** — live session table, disk usage breakdown, process tree.
- **Audit log** — every kill/delete/restore appended to `~/.claude-session-manager/audit.log`.
- **Keyboard shortcuts** — `j`/`k` navigate, `x` select, `D` delete, `K` kill, `?` help.

## Install & run

> The app lives in the `claude-session-manager/` subdirectory. You **must** `cd` into it first.

```bash
cd claude-session-manager
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### LAN access

```bash
npm run dev:lan
```

### Read-only mode (disables all kill/delete actions)

```bash
READ_ONLY=1 npm run dev
```

## Data sources

All reads are from `~/.claude/` — **never written to directly**:

| Path | Purpose |
|------|---------|
| `~/.claude/projects/<encoded-path>/<id>.jsonl` | Session conversation logs |
| `~/.claude/sessions/<pid>.json` | Active session process indicators |
| `~/.claude/stats-cache.json` | Aggregated metrics (optional) |

The encoded-path converts `/` → `-` in the project's absolute path.

## Security model

### Kill safety checks
1. PID must be ≥ 100 (refuses to touch system processes)
2. `/proc/<pid>/cmdline` (or `ps`) must contain `claude` (case-insensitive)
3. SIGTERM first, 5s grace period, then SIGKILL
4. Every kill attempt logged to `~/.claude-session-manager/audit.log`
5. Confirmation dialog requires typing the 8-char session ID prefix

### Delete safety checks
1. Refuses to delete LIVE sessions — kill first
2. Soft-delete only: files moved to `~/.claude-session-manager/trash/`, never removed from `~/.claude/projects/` directly
3. Trash auto-purges after 30 days

### General
- All mutations are Next.js Server Actions — no unauthenticated REST endpoints
- Dev server bound to `127.0.0.1` by default
- Raw file paths never exposed in client-side error messages
- `READ_ONLY=1` disables all mutations at the action level

## Tests

```bash
npm test             # run all tests
npm run test:watch   # watch mode
npm run test:coverage
```

Vitest covers:
- `lib/jsonl-parser.ts` — parsing, token aggregation, model extraction
- `lib/process-utils.ts` — PID liveness, cmdline validation, claude process detection (mocked)
- `lib/trash.ts` — soft-delete, restore, permanent delete, list, autopurge (fs mocked)
- `lib/audit-log.ts` — append, read, error resilience (fs mocked)

## File structure

```
claude-session-manager/
├── app/
│   ├── page.tsx                  # session list
│   ├── sessions/[id]/page.tsx    # conversation replay
│   ├── manager/page.tsx          # live session control panel
│   ├── trash/page.tsx            # soft-delete trash view
│   ├── stats/page.tsx            # usage stats
│   └── actions/
│       ├── kill-session.ts       # Server Action: kill PID
│       ├── delete-session.ts     # Server Action: soft delete
│       └── restore-session.ts    # Server Action: restore/permanent delete
├── components/
│   ├── sidebar.tsx               # repo tree + navigation
│   ├── session-list.tsx          # client component: keyboard nav + multi-select
│   ├── session-row.tsx           # single session row
│   ├── live-indicator.tsx        # LIVE/IDLE/ENDED indicator
│   ├── kill-button.tsx           # client: confirm dialog + kill action
│   ├── bulk-actions-bar.tsx      # client: sticky bulk delete bar
│   └── conversation-entry.tsx    # message + tool call renderer
├── lib/
│   ├── types.ts                  # all TypeScript types
│   ├── cache.ts                  # 30s TTL in-memory cache
│   ├── jsonl-parser.ts           # JSONL parse + aggregation
│   ├── claude-data.ts            # main data access layer
│   ├── process-utils.ts          # PID validation + kill
│   ├── trash.ts                  # soft-delete + restore + autopurge
│   └── audit-log.ts              # append-only structured log
└── __tests__/                    # Vitest test suite
```

@AGENTS.md

# claude-session-manager — Architecture Reference

## Quick start (always run from inside this directory)
```bash
cd claude-session-manager
npm install && npm run dev
```

## Stack
- **Next.js 16** App Router — Server Components by default, Server Actions for mutations
- **TypeScript strict** — no implicit any
- **Tailwind CSS v4** — `@import "tailwindcss"` in globals.css, no config file
- **Vitest** — unit tests in `__tests__/`, run with `npm test`
- **No database** — reads `~/.claude/` directly; 30s in-memory TTL cache in `lib/cache.ts`

## Architecture Decision Records

**ADR-1: `cwd`-first project path resolution**
The encoded path in `~/.claude/projects/` (e.g. `-home-user-my-project`) replaces `/` with `-`, which is lossy — it cannot distinguish `/home/user/my-project` from `/home/user/my/project`. All interactive Claude Code sessions write a `cwd` field in their JSONL entries. `lib/claude-reader.ts` uses that as the source of truth; the encoded path is a last-resort fallback.

**ADR-2: SSE over polling for live updates**
`~/.claude/sessions/` changes only when sessions start/stop. `app/api/events/route.ts` opens `fs.watch` on that directory and streams `data: refresh` events. The client hook (`hooks/use-session-events.ts`) calls `router.refresh()` on each event — no data travels in the stream.

**ADR-3: Card layout**
Cards degrade gracefully when fields are missing (0 tokens, unknown model). Grid rows break alignment. Cards omit zero-value rows rather than displaying meaningless zeroes.

## Data flow
```
~/.claude/projects/<encoded>/<id>.jsonl
  → lib/jsonl-parser.ts   parse + aggregate tokens/model/cwd/branch
  → lib/claude-reader.ts  build Session objects, resolve paths, detect status
  → app/page.tsx          filter + render via <SessionGrid>

~/.claude/sessions/<pid>.json
  → lib/claude-reader.ts  cross-check PID liveness via lib/process-utils.ts
  → lib/session-watcher.ts  watch dir for changes → SSE → browser refresh
```

## Key files
| File | Responsibility |
|------|---------------|
| `lib/types.ts` | All TypeScript types |
| `lib/cache.ts` | 30s TTL cache, `cachedFetch` wrapper |
| `lib/jsonl-parser.ts` | Parse JSONL, aggregate tokens, extract cwd/branch/model |
| `lib/claude-reader.ts` | All session queries — `cwd`-first path resolution |
| `lib/stats-utils.ts` | Pure activity bucket calculation |
| `lib/session-watcher.ts` | `fs.watch` wrapper used by SSE route only |
| `lib/process-utils.ts` | PID liveness + safe kill |
| `lib/trash.ts` | Soft-delete, restore, autopurge |
| `lib/audit-log.ts` | Append-only JSON-lines audit log |

## Safety invariants (never break)
1. `~/.claude/projects/` is read-only — never written or deleted from
2. Kill requires PID ≥ 100 AND cmdline contains `claude`
3. Delete refuses LIVE sessions
4. All mutations go through Server Actions in `app/actions/`
5. `READ_ONLY=1` disables all Server Actions at the action level

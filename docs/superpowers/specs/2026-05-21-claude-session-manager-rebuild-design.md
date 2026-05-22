# Claude Session Manager — Full Rebuild Design

**Date:** 2026-05-21
**Status:** Approved
**Scope:** Full rebuild of data layer and UI components to fix correctness bugs, add real-time SSE updates, and switch session list from grid rows to cards.

---

## 1. Problem Statement

The original implementation had five concrete bugs preventing reliable use:

| # | Bug | Root Cause |
|---|-----|-----------|
| 1 | App fails to start when run from parent directory | `package.json` is in `claude-session-manager/` subdirectory; user ran `npm install` from `claude-session-tracker/` |
| 2 | Project paths garbled (`/home/abdul/Documents/claude/session/tracker`) | `decodeProjectPath` replaces all `-` with `/`, but repo names can contain hyphens |
| 3 | Some sessions show 0 tokens / "unknown" model | `aggregateTokenUsage` and `extractModel` crash silently on missing or differently-structured fields |
| 4 | Stats activity chart shows all empty bars | `lastActivityAt` date math is correct but unverified; stat page has no unit tests |
| 5 | All branches show as `HEAD` | `gitBranch: "HEAD"` is what Claude Code writes in detached HEAD state; no fallback to read actual branch |
| 6 | No live updates | Session list requires manual browser refresh to reflect new/stopped sessions |

---

## 2. Approach

Full rebuild of the **data layer** (`lib/`) and **UI components** (`components/`). The Next.js page/action structure, trash system, audit log, process utils, and cache are kept unchanged — they are correct and passing tests.

---

## 3. Architecture

Three layers with strict boundaries. The data layer has no Next.js imports. The app layer has no direct filesystem access.

```
┌─────────────────────────────────────────────────────────┐
│  BROWSER                                                │
│  Session cards · Stats · Manager · Trash                │
│  SSE client hook → router.refresh() on file changes     │
└───────────────────────┬─────────────────────────────────┘
                        │ Server Components + Server Actions
┌───────────────────────▼─────────────────────────────────┐
│  NEXT.JS APP LAYER                                      │
│  Pages (RSC) · Actions (kill/delete/restore)            │
│  SSE Route Handler (streams file-watch events)          │
└───────────────────────┬─────────────────────────────────┘
                        │ pure functions, typed contracts
┌───────────────────────▼─────────────────────────────────┐
│  DATA LAYER  (lib/)                                     │
│  jsonl-parser · claude-reader · session-watcher         │
│  process-utils · trash · audit-log · cache              │
└─────────────────────────────────────────────────────────┘
                        │ read-only (except trash dir)
┌───────────────────────▼─────────────────────────────────┐
│  ~/.claude/projects/<encoded>/<id>.jsonl                │
│  ~/.claude/sessions/<pid>.json                          │
└─────────────────────────────────────────────────────────┘
```

### Architecture Decision Records

**ADR-1: Use `cwd` from JSONL as project identity source**
The encoded path format (`-home-user-my-project`) is a lossy encoding — replacing all `/` with `-` means it cannot distinguish `/home/user/my-project` from `/home/user/my/project`. We use the `cwd` field from JSONL entries as the ground truth. Encoded path decoding is a fallback only when `cwd` is absent.

**ADR-2: SSE over polling**
`~/.claude/sessions/` changes only when sessions start or stop. `fs.watch` gives near-instant notification with zero polling overhead. The SSE stream carries no data — it only signals the browser to re-render (which fetches fresh data from Server Components).

**ADR-3: Card layout for session list**
Dense grid rows break when fields are missing (0 tokens, unknown model). Cards degrade gracefully — missing fields simply render as empty or omitted rather than misaligning columns.

---

## 4. Data Layer

### 4.1 Files

| File | Status | Change |
|------|--------|--------|
| `lib/types.ts` | Keep | No changes |
| `lib/cache.ts` | Keep | No changes |
| `lib/process-utils.ts` | Keep | No changes |
| `lib/trash.ts` | Keep | No changes |
| `lib/audit-log.ts` | Keep | No changes |
| `lib/jsonl-parser.ts` | **Rebuild** | Fix token/model extraction |
| `lib/claude-reader.ts` | **New** | Replaces `claude-data.ts` with `cwd`-first path resolution |
| `lib/session-watcher.ts` | **New** | `fs.watch` wrapper for SSE route handler |
| `lib/claude-data.ts` | **Delete** | Replaced by `claude-reader.ts` |

### 4.2 `lib/jsonl-parser.ts` — Rebuilt

All extraction functions are defensive: missing fields return zero/empty/unknown, never throw.

```typescript
// Token aggregation: sums across all assistant entries
// Missing usage fields → treated as 0
aggregateTokenUsage(entries: JsonlEntry[]): TokenUsage

// Model: first assistant entry with a non-empty model field
// No assistant entries → "unknown"
extractModel(entries: JsonlEntry[]): string

// cwd: first entry of any type with a non-empty cwd field
extractCwd(entries: JsonlEntry[]): string

// branch: first non-HEAD gitBranch value; falls back to HEAD; falls back to "unknown"
extractBranch(entries: JsonlEntry[]): string

// timestamps: min/max over all entries with valid ISO timestamp
// No valid timestamps → { first: now, last: now }
extractTimestamps(entries: JsonlEntry[]): { first: Date; last: Date }
```

### 4.3 `lib/claude-reader.ts` — New (replaces `claude-data.ts`)

Project path resolution — strict priority order:
```
1. cwd field from any JSONL entry        ← source of truth
2. Encoded path best-effort decode       ← fallback
3. "unknown"                             ← last resort
```

Encoded path decode changes: only replaces the **leading** `-` with `/`, then replaces remaining `-` with `/`. This is still imperfect but is explicitly a fallback — the cwd field eliminates the bug for all sessions that have it (which is all interactive sessions).

Exports the same public API as `claude-data.ts`:
```typescript
getAllSessions(): Promise<Session[]>
getSession(id: string): Promise<Session | null>
getSessionEntries(id: string, encodedPath: string): Promise<JsonlEntry[]>
getRepoSummaries(): Promise<RepoSummary[]>
getDiskUsage(): Promise<DiskUsage>
getStatsCache(): Promise<Record<string, unknown> | null>
```

All pages update their import path from `@/lib/claude-data` to `@/lib/claude-reader`. No other changes to pages are required.

### 4.4 `lib/session-watcher.ts` — New

```typescript
// Opens fs.watch on ~/.claude/sessions/
// Calls callback on any file event (add/change/delete)
// Returns a teardown function
watchSessions(callback: () => void): () => void
```

Used only by the SSE route handler. Nothing else in the codebase watches files directly.

---

## 5. Real-Time Updates (SSE)

### 5.1 `app/api/events/route.ts`

A streaming GET Route Handler:

1. Client connects → `watchSessions()` is called, watcher opens
2. File change in `~/.claude/sessions/` → sends `data: refresh\n\n`
3. Every 25 seconds → sends `data: heartbeat\n\n` to keep connection alive
4. Client disconnects (detected via `request.signal.aborted`) → teardown called, watcher closed

Response headers:
```
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
```

### 5.2 `hooks/use-session-events.ts`

Client-side hook used in `<SessionGrid>`:

```typescript
function useSessionEvents(): void
```

- Opens `new EventSource('/api/events')` on mount
- On `refresh` message: calls `router.refresh()`
- On error: closes and reopens after 5 seconds
- Cleans up `EventSource` on unmount

---

## 6. UI Components

### 6.1 Session Card

Replaces the grid row. Renders one session as a self-contained card:

```
┌─────────────────────────────────────────────────────┐
│  ● LIVE  claude-session-tracker        2 minutes ago │
│  b96c9f94  ⎇ main  claude-sonnet-4-6               │
│  81k out · 333k cache · 97 tools                    │
│                          [open]  [kill]  [delete]   │
└─────────────────────────────────────────────────────┘
```

- `[kill]` only renders for LIVE sessions
- `[delete]` only renders for non-LIVE sessions
- Missing fields (0 tokens, unknown model) are omitted from the middle row rather than shown as zeroes

### 6.2 Kill Confirmation

Simple confirm dialog — no hash typing:

```
┌──────────────────────────────┐
│  Kill PID 51781?             │
│  This will SIGTERM the       │
│  claude process.             │
│                              │
│  [Cancel]        [Kill]      │
└──────────────────────────────┘
```

### 6.3 Component File Map

| File | Status | Change |
|------|--------|--------|
| `components/session-card.tsx` | **New** | Replaces `session-row.tsx` |
| `components/session-grid.tsx` | **New** | Replaces `session-list.tsx`; owns SSE hook |
| `components/kill-button.tsx` | **Rebuild** | Simple confirm, no hash input |
| `components/live-indicator.tsx` | Keep | No changes |
| `components/bulk-actions-bar.tsx` | Keep | No changes |
| `components/conversation-entry.tsx` | Keep | No changes |
| `components/sidebar.tsx` | Keep | No changes |
| `components/session-row.tsx` | **Delete** | Replaced by `session-card.tsx` |
| `components/session-list.tsx` | **Delete** | Replaced by `session-grid.tsx` |

---

## 7. Pages

All pages switch import from `@/lib/claude-data` to `@/lib/claude-reader`. No structural changes to page logic.

| Route | Change |
|-------|--------|
| `/` | Import update + use `<SessionGrid>` instead of `<SessionList>` |
| `/sessions/[id]` | Import update only |
| `/stats` | Import update; stat calculations verified by unit tests |
| `/manager` | Import update only |
| `/trash` | No changes |
| `/api/events` | **New** — SSE route handler |

---

## 8. Testing Strategy

**Rule:** If it touches the filesystem or a process, mock it. Everything else runs against real inputs.

| Test File | Status | Covers |
|-----------|--------|--------|
| `__tests__/jsonl-parser.test.ts` | **Rebuild** | All extraction functions, edge cases, missing fields |
| `__tests__/claude-reader.test.ts` | **New** | Path resolution, session status logic, repo name extraction |
| `__tests__/session-watcher.test.ts` | **New** | Callback fires on change, teardown closes watcher |
| `__tests__/process-utils.test.ts` | Keep | Already passing |
| `__tests__/trash.test.ts` | Keep | Already passing |
| `__tests__/audit-log.test.ts` | Keep | Already passing |

**Coverage target:** 90%+ on all rebuilt/new data layer files.

---

## 9. Setup & Developer Experience

### README update — first three lines must be:
```bash
cd claude-session-manager
npm install
npm run dev
```

The `cd` step must appear first, visually separated, with a note explaining the subdirectory structure. No ambiguity.

### CLAUDE.md update
- Document the `cwd`-first path resolution (ADR-1)
- Document the SSE architecture (ADR-2)
- Update file map to reflect renamed/deleted files

---

## 10. What Is NOT Changing

To keep scope bounded and avoid breaking what works:

- `lib/cache.ts` — 30s TTL cache, unchanged
- `lib/process-utils.ts` — PID validation + kill, unchanged
- `lib/trash.ts` — soft-delete + restore, unchanged
- `lib/audit-log.ts` — append-only log, unchanged
- `app/actions/` — all three Server Actions, unchanged
- `app/sessions/[id]/page.tsx` — conversation replay, unchanged (import path update only)
- `app/manager/page.tsx` — control panel, unchanged (import path update only)
- `app/trash/page.tsx` — trash view, unchanged
- Terminal green-on-black theme — unchanged
- Tailwind v4, Next.js 16, TypeScript strict — unchanged
- `READ_ONLY=1` env var behaviour — unchanged
- `~/.claude/projects/` write protection — unchanged

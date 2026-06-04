import Link from 'next/link';
import { getAllSessions, getRepoSummaries, getDiskUsage } from '@/lib/claude-data';
import { getProcessInfo } from '@/lib/process-utils';
import { Sidebar } from '@/components/sidebar';
import { LiveIndicator } from '@/components/live-indicator';
import { KillButton } from '@/components/kill-button';
import { deleteSession } from '@/app/actions/delete-session';
import { killSession } from '@/app/actions/kill-session';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

export default async function ManagerPage() {
  const [sessions, repos, diskUsage] = await Promise.all([
    getAllSessions(),
    getRepoSummaries(),
    getDiskUsage(),
  ]);

  const liveSessions = sessions.filter((s) => s.status === 'LIVE');
  const idleSessions = sessions.filter((s) => s.status === 'IDLE');
  const endedSessions = sessions.filter((s) => s.status === 'ENDED');

  // Process info for live sessions
  const processInfos = liveSessions.map((s) => ({
    session: s,
    procInfo: s.pid ? getProcessInfo(s.pid) : null,
  }));

  return (
    <div className="flex min-h-screen font-mono">
      <Sidebar repos={repos} />

      <main className="flex-1 p-6 space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/" className="text-green-700 hover:text-green-400 text-xs">← back</Link>
          <h1 className="text-green-400 font-bold text-sm tracking-widest">SESSION MANAGER</h1>
        </div>

        {/* Summary stats */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'LIVE', value: liveSessions.length, color: 'text-green-400' },
            { label: 'IDLE', value: idleSessions.length, color: 'text-amber-400' },
            { label: 'ENDED', value: endedSessions.length, color: 'text-green-700' },
          ].map(({ label, value, color }) => (
            <div key={label} className="terminal-box text-center">
              <div className="terminal-box-title">{label}</div>
              <div className={`${color} text-2xl font-bold mt-2`}>{value}</div>
            </div>
          ))}
        </div>

        {/* Live Sessions Panel */}
        <div className="terminal-box">
          <div className="terminal-box-title">LIVE SESSIONS</div>
          {liveSessions.length === 0 ? (
            <div className="mt-4 text-green-700 text-xs text-center py-4">no live sessions</div>
          ) : (
            <div className="mt-3 text-xs">
              <div className="grid grid-cols-[3rem_8rem_1fr_8rem_8rem_8rem_1fr] gap-3 px-2 py-1.5 border-b border-green-900 text-green-700 uppercase">
                <span>PID</span>
                <span>Session</span>
                <span>Repo</span>
                <span>Branch</span>
                <span>Started</span>
                <span>Tokens</span>
                <span>Action</span>
              </div>

              {processInfos.map(({ session: s, procInfo }) => (
                <div
                  key={s.id}
                  className="grid grid-cols-[3rem_8rem_1fr_8rem_8rem_8rem_1fr] gap-3 px-2 py-2 border-b border-green-950 hover:bg-green-950/30 items-center"
                >
                  <span className="text-red-400">{s.pid}</span>
                  <Link href={`/sessions/${s.id}`} className="text-green-400 hover:text-green-200 truncate">
                    {s.id.slice(0, 8)}
                  </Link>
                  <span className="text-green-300 truncate">{s.repoName}</span>
                  <span className="text-green-600 truncate">⎇ {s.branch}</span>
                  <span className="text-green-700">
                    {s.startedAt.toLocaleTimeString('en-US', { hour12: false })}
                  </span>
                  <span className="text-cyan-600">
                    {formatTokens(s.tokens.inputTokens + s.tokens.outputTokens)}
                  </span>
                  <div className="flex items-center gap-2">
                    {s.pid && (
                      <KillButton pid={s.pid} sessionId={s.id} />
                    )}
                    {procInfo && (
                      <span className="text-green-800 text-xs truncate" title={procInfo.cmdline}>
                        {procInfo.workingDir?.split('/').pop() ?? ''}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Bulk Actions */}
        <div className="terminal-box">
          <div className="terminal-box-title">BULK ACTIONS</div>
          <div className="mt-4 flex flex-wrap gap-3 text-xs">
            {idleSessions.length > 0 && (
              <form action={async () => {
                'use server';
                for (const s of idleSessions) {
                  if (s.pid) await killSession(s.pid, s.id);
                }
              }}>
                <button
                  type="submit"
                  className="px-3 py-1.5 text-amber-400 border border-amber-800 rounded hover:bg-amber-950 transition-colors"
                >
                  Kill all idle ({idleSessions.length})
                </button>
              </form>
            )}

            {endedSessions.length > 0 && (
              <form action={async () => {
                'use server';
                const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
                for (const s of endedSessions) {
                  if (s.lastActivityAt.getTime() < cutoff) {
                    await deleteSession(s.id);
                  }
                }
              }}>
                <button
                  type="submit"
                  className="px-3 py-1.5 text-red-400 border border-red-900 rounded hover:bg-red-950 transition-colors"
                >
                  Delete ended sessions older than 7d
                </button>
              </form>
            )}
          </div>
        </div>

        {/* Disk Usage */}
        <div className="terminal-box">
          <div className="terminal-box-title">DISK USAGE</div>
          <div className="mt-3 text-xs">
            <div className="mb-3">
              <span className="text-green-700">Total: </span>
              <span className="text-green-400 font-bold">{formatBytes(diskUsage.totalBytes)}</span>
            </div>

            <div className="space-y-1 mb-4">
              {diskUsage.byRepo.slice(0, 8).map((r) => (
                <div key={r.encodedPath} className="flex items-center gap-3">
                  <span className="text-green-600 w-32 truncate">{r.repoName}</span>
                  <div className="flex-1 bg-green-950 h-2 rounded overflow-hidden">
                    <div
                      className="bg-green-600 h-full"
                      style={{ width: `${Math.min(100, (r.bytes / diskUsage.totalBytes) * 100)}%` }}
                    />
                  </div>
                  <span className="text-green-700 w-16 text-right">{formatBytes(r.bytes)}</span>
                </div>
              ))}
            </div>

            <div className="border-t border-green-900 pt-3">
              <div className="text-green-700 mb-2">LARGEST SESSIONS</div>
              {diskUsage.largestSessions.slice(0, 5).map((s) => (
                <div key={s.sessionId} className="flex items-center gap-3 mb-1">
                  <Link
                    href={`/sessions/${s.sessionId}`}
                    className="text-green-400 hover:text-green-200 w-20 truncate"
                  >
                    {s.sessionId.slice(0, 8)}
                  </Link>
                  <span className="text-green-600">{s.repoName}</span>
                  <span className="text-amber-600 ml-auto">{formatBytes(s.bytes)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Process Tree */}
        {processInfos.some((p) => p.procInfo) && (
          <div className="terminal-box">
            <div className="terminal-box-title">PROCESS TREE</div>
            <div className="mt-3 text-xs font-mono space-y-3">
              {processInfos
                .filter((p) => p.procInfo)
                .map(({ session: s, procInfo }) => (
                  <div key={s.id} className="border-l border-green-800 pl-3">
                    <div className="text-green-400">
                      PID {s.pid} <LiveIndicator status="LIVE" />
                    </div>
                    {procInfo?.ppid && (
                      <div className="text-green-700">└─ parent: {procInfo.ppid}</div>
                    )}
                    {procInfo?.workingDir && (
                      <div className="text-green-700">└─ cwd: {procInfo.workingDir}</div>
                    )}
                    <div className="text-green-800 truncate" title={procInfo?.cmdline ?? ''}>
                      └─ cmd: {(procInfo?.cmdline ?? '').slice(0, 80)}
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

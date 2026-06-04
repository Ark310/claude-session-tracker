import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getAllSessions, getSessionEntries } from '@/lib/claude-data';
import { extractConversationEntries } from '@/lib/jsonl-parser';
import { Sidebar } from '@/components/sidebar';
import { LiveIndicator } from '@/components/live-indicator';
import { KillButton } from '@/components/kill-button';
import { ConversationEntryView } from '@/components/conversation-entry';
import { getRepoSummaries } from '@/lib/claude-data';
import { deleteSession } from '@/app/actions/delete-session';

interface SessionPageProps {
  params: Promise<{ id: string }>;
}

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

function formatTokenNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

export default async function SessionPage({ params }: SessionPageProps) {
  const { id } = await params;
  const [allSessions, repos] = await Promise.all([getAllSessions(), getRepoSummaries()]);
  const session = allSessions.find((s) => s.id === id);
  if (!session) notFound();

  const rawEntries = await getSessionEntries(id, session.encodedPath);
  const entries = extractConversationEntries(rawEntries);

  const totalTokens = session.tokens.inputTokens + session.tokens.outputTokens;

  return (
    <div className="flex min-h-screen font-mono">
      <Sidebar repos={repos} />

      <main className="flex-1 min-w-0">
        {/* Header */}
        <div className="border-b border-green-900 px-4 py-3 sticky top-0 bg-[#020c02] z-20">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <Link href="/" className="text-green-700 hover:text-green-400 text-xs shrink-0">
                ← back
              </Link>
              <LiveIndicator status={session.status} showLabel />
              <span className="text-green-400 text-sm truncate" title={session.id}>
                {session.id.slice(0, 16)}…
              </span>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              {session.status === 'LIVE' && session.pid && (
                <KillButton pid={session.pid} sessionId={session.id} />
              )}

              {session.status !== 'LIVE' && (
                <form action={async () => {
                  'use server';
                  await deleteSession(id);
                }}>
                  <button
                    type="submit"
                    className="px-2 py-0.5 text-xs font-mono text-red-500 border border-red-900 rounded hover:bg-red-950 hover:text-red-300 transition-colors"
                  >
                    [DELETE]
                  </button>
                </form>
              )}
            </div>
          </div>

          {/* Metadata row */}
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-green-700">
            <span>repo: <span className="text-green-500">{session.repoName}</span></span>
            <span>branch: <span className="text-green-500">{session.branch}</span></span>
            <span>model: <span className="text-green-500">{session.model.replace('claude-', '')}</span></span>
            <span>tokens: <span className="text-cyan-600">{formatTokenNum(totalTokens)}</span></span>
            <span>cache: <span className="text-purple-600">{formatTokenNum(session.tokens.cacheReadTokens)}r / {formatTokenNum(session.tokens.cacheCreationTokens)}w</span></span>
            <span>tools: <span className="text-amber-600">{session.toolCallCount}</span></span>
            <span>file: <span className="text-green-600">{formatBytes(session.fileSizeBytes)}</span></span>
            {session.pid && <span>pid: <span className="text-red-500">{session.pid}</span></span>}
          </div>
        </div>

        {/* Conversation */}
        <div className="px-4 py-4 max-w-4xl">
          {entries.length === 0 && (
            <div className="text-green-700 text-sm py-8 text-center">
              no conversation entries found
            </div>
          )}

          {entries.map((entry) => (
            <ConversationEntryView key={entry.uuid} entry={entry} />
          ))}
        </div>
      </main>
    </div>
  );
}

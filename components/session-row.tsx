import Link from 'next/link';
import { LiveIndicator } from './live-indicator';
import type { Session } from '@/lib/types';

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function relativeTime(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

interface SessionRowProps {
  session: Session;
  selected?: boolean;
  highlighted?: boolean;
}

export function SessionRow({ session, selected = false, highlighted = false }: SessionRowProps) {
  const shortId = session.id.slice(0, 8);
  const totalTokens = session.tokens.inputTokens + session.tokens.outputTokens;

  return (
    <div
      className={`
        session-row grid grid-cols-[1.5rem_8rem_1fr_7rem_6rem_5rem_5rem_5rem_6rem] gap-2 px-3 py-2
        border-b border-green-950 font-mono text-xs items-center
        ${highlighted ? 'bg-green-950' : 'hover:bg-green-950/50'}
        ${selected ? 'bg-green-900/40' : ''}
        transition-colors
      `}
      data-session-id={session.id}
    >
      <span className="text-green-700">
        <input
          type="checkbox"
          name="selected"
          value={session.id}
          defaultChecked={selected}
          className="accent-green-500"
          aria-label={`Select session ${shortId}`}
        />
      </span>

      <Link
        href={`/sessions/${session.id}`}
        className="text-green-400 hover:text-green-200 truncate"
        title={session.id}
      >
        {shortId}
      </Link>

      <div className="flex items-center gap-2 min-w-0">
        <LiveIndicator status={session.status} />
        <span className="text-green-300 truncate" title={session.repoName}>
          {session.repoName}
        </span>
        {session.branch !== 'unknown' && (
          <span className="text-green-700 truncate hidden xl:inline">⎇ {session.branch}</span>
        )}
      </div>

      <span className="text-green-600 truncate" title={session.model}>
        {session.model.replace('claude-', '').replace(/-\d{8}$/, '')}
      </span>

      <span className="text-cyan-700">
        {formatTokens(session.tokens.inputTokens)}in
      </span>

      <span className="text-cyan-600">
        {formatTokens(session.tokens.outputTokens)}out
      </span>

      <span className="text-purple-700 text-xs">
        {formatTokens(session.tokens.cacheReadTokens)}$
      </span>

      <span className="text-green-700">
        {session.toolCallCount} tools
      </span>

      <span className="text-green-700">
        {relativeTime(session.lastActivityAt)}
      </span>
    </div>
  );
}

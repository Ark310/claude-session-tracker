import type { SessionStatus } from '@/lib/types';

interface LiveIndicatorProps {
  status: SessionStatus;
  showLabel?: boolean;
}

export function LiveIndicator({ status, showLabel = false }: LiveIndicatorProps) {
  if (status === 'LIVE') {
    return (
      <span className="inline-flex items-center gap-1.5">
        <span className="live-dot text-green-400">●</span>
        {showLabel && <span className="text-green-400 text-xs font-mono">LIVE</span>}
      </span>
    );
  }
  if (status === 'IDLE') {
    return (
      <span className="inline-flex items-center gap-1.5">
        <span className="text-amber-400">◐</span>
        {showLabel && <span className="text-amber-400 text-xs font-mono">IDLE</span>}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="text-gray-600">○</span>
      {showLabel && <span className="text-gray-500 text-xs font-mono">ENDED</span>}
    </span>
  );
}

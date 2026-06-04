'use client';

import { useState, useTransition, useRef } from 'react';
import { killSession } from '@/app/actions/kill-session';

interface KillButtonProps {
  pid: number;
  sessionId: string;
  onKilled?: () => void;
}

export function KillButton({ pid, sessionId, onKilled }: KillButtonProps) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmInput, setConfirmInput] = useState('');
  const [result, setResult] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  const shortId = sessionId.slice(0, 8);

  function openConfirm() {
    setShowConfirm(true);
    setConfirmInput('');
    setResult(null);
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  function handleKill() {
    if (confirmInput !== shortId) return;
    startTransition(async () => {
      const res = await killSession(pid, sessionId);
      setResult(res.message);
      if (res.ok) {
        setTimeout(() => {
          setShowConfirm(false);
          onKilled?.();
        }, 1500);
      }
    });
  }

  if (!showConfirm) {
    return (
      <button
        onClick={openConfirm}
        className="px-2 py-0.5 text-xs font-mono text-red-400 border border-red-800 rounded hover:bg-red-950 hover:text-red-300 transition-colors"
        title={`Kill process ${pid}`}
      >
        [KILL]
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
      <div className="terminal-box p-6 w-96">
        <div className="terminal-box-title text-red-400">CONFIRM KILL</div>
        <div className="mt-4 text-sm text-green-400 font-mono">
          <p>This will terminate process <span className="text-red-400">PID {pid}</span>.</p>
          <p className="mt-2">Type the session ID <span className="text-amber-400">{shortId}</span> to confirm:</p>
        </div>
        <input
          ref={inputRef}
          type="text"
          value={confirmInput}
          onChange={(e) => setConfirmInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleKill();
            if (e.key === 'Escape') setShowConfirm(false);
          }}
          className="mt-3 w-full bg-black border border-green-700 text-green-300 font-mono text-sm px-2 py-1 focus:outline-none focus:border-green-400"
          placeholder={shortId}
          disabled={isPending}
        />
        {result && (
          <p className={`mt-2 text-xs font-mono ${result.includes('killed') || result.includes('terminated') ? 'text-green-400' : 'text-red-400'}`}>
            {result}
          </p>
        )}
        <div className="mt-4 flex gap-3">
          <button
            onClick={handleKill}
            disabled={confirmInput !== shortId || isPending}
            className="px-3 py-1 text-sm font-mono text-red-300 border border-red-700 rounded hover:bg-red-950 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {isPending ? 'Killing…' : '[KILL]'}
          </button>
          <button
            onClick={() => setShowConfirm(false)}
            className="px-3 py-1 text-sm font-mono text-green-600 border border-green-800 rounded hover:bg-green-950 transition-colors"
          >
            [cancel]
          </button>
        </div>
      </div>
    </div>
  );
}

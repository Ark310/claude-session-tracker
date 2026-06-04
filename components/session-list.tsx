'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { SessionRow } from './session-row';
import { BulkActionsBar } from './bulk-actions-bar';
import type { Session } from '@/lib/types';

interface SessionListProps {
  sessions: Session[];
}

export function SessionList({ sessions }: SessionListProps) {
  const [highlighted, setHighlighted] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showHelp, setShowHelp] = useState(false);
  const router = useRouter();

  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      switch (e.key) {
        case 'j':
          setHighlighted((h) => Math.min(h + 1, sessions.length - 1));
          break;
        case 'k':
          setHighlighted((h) => Math.max(h - 1, 0));
          break;
        case 'x': {
          const s = sessions[highlighted];
          if (s) toggleSelect(s.id);
          break;
        }
        case 'D':
          if (selected.size > 0) {
            // handled by BulkActionsBar button — focus it
            (document.querySelector('[data-bulk-delete]') as HTMLButtonElement)?.click();
          }
          break;
        case 'Enter': {
          const s = sessions[highlighted];
          if (s) router.push(`/sessions/${s.id}`);
          break;
        }
        case '?':
          setShowHelp((h) => !h);
          break;
        case 'Escape':
          setShowHelp(false);
          break;
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [highlighted, sessions, selected, toggleSelect, router]);

  return (
    <div className="relative">
      {/* Header row */}
      <div className="grid grid-cols-[1.5rem_8rem_1fr_7rem_6rem_5rem_5rem_5rem_6rem] gap-2 px-3 py-1.5 border-b border-green-800 font-mono text-xs text-green-700 uppercase sticky top-0 bg-black z-10">
        <span></span>
        <span>ID</span>
        <span>REPO / STATUS</span>
        <span>MODEL</span>
        <span>INPUT</span>
        <span>OUTPUT</span>
        <span>CACHE</span>
        <span>TOOLS</span>
        <span>AGE</span>
      </div>

      {sessions.length === 0 && (
        <div className="py-12 text-center font-mono text-green-700">
          no sessions found
        </div>
      )}

      {sessions.map((session, idx) => (
        <div
          key={session.id}
          onClick={() => setHighlighted(idx)}
          onDoubleClick={() => router.push(`/sessions/${session.id}`)}
        >
          <SessionRow
            session={session}
            selected={selected.has(session.id)}
            highlighted={idx === highlighted}
          />
        </div>
      ))}

      <BulkActionsBar
        selectedIds={Array.from(selected)}
        onClear={() => setSelected(new Set())}
      />

      {showHelp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
          <div className="terminal-box p-6 w-72">
            <div className="terminal-box-title">KEYBOARD SHORTCUTS</div>
            <dl className="mt-4 font-mono text-xs space-y-2">
              {[
                ['j / k', 'navigate up/down'],
                ['x', 'toggle select'],
                ['Enter', 'open session'],
                ['D', 'delete selected'],
                ['K', 'kill highlighted (if live)'],
                ['?', 'toggle this help'],
                ['Esc', 'close overlays'],
              ].map(([key, desc]) => (
                <div key={key} className="flex gap-4">
                  <dt className="text-amber-400 w-20 shrink-0">{key}</dt>
                  <dd className="text-green-400">{desc}</dd>
                </div>
              ))}
            </dl>
            <button
              onClick={() => setShowHelp(false)}
              className="mt-4 text-xs text-green-600 hover:text-green-400 font-mono"
            >
              [close]
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

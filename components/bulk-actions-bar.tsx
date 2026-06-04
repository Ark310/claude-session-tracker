'use client';

import { useState, useTransition } from 'react';
import { bulkDeleteSessions } from '@/app/actions/delete-session';
import { useRouter } from 'next/navigation';

interface BulkActionsBarProps {
  selectedIds: string[];
  onClear: () => void;
}

export function BulkActionsBar({ selectedIds, onClear }: BulkActionsBarProps) {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const router = useRouter();

  if (selectedIds.length === 0) return null;

  function handleBulkDelete() {
    startTransition(async () => {
      const result = await bulkDeleteSessions(selectedIds);
      setMessage(result.message);
      if (result.ok) {
        setTimeout(() => {
          onClear();
          router.refresh();
        }, 1500);
      }
    });
  }

  return (
    <div className="sticky bottom-0 z-40 border-t border-amber-800 bg-black/95 px-4 py-2 flex items-center gap-4 font-mono text-sm">
      <span className="text-amber-400">{selectedIds.length} selected</span>

      <button
        onClick={handleBulkDelete}
        disabled={isPending}
        className="px-3 py-1 text-red-400 border border-red-800 rounded hover:bg-red-950 disabled:opacity-40 transition-colors"
      >
        {isPending ? 'Deleting…' : `[D] Delete ${selectedIds.length}`}
      </button>

      <button
        onClick={onClear}
        className="px-3 py-1 text-green-600 border border-green-800 rounded hover:bg-green-950 transition-colors"
      >
        [×] Clear
      </button>

      {message && (
        <span className={`text-xs ${message.includes('Deleted') ? 'text-green-400' : 'text-red-400'}`}>
          {message}
        </span>
      )}
    </div>
  );
}

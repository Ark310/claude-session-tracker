import Link from 'next/link';
import { Sidebar } from '@/components/sidebar';
import { getRepoSummaries } from '@/lib/claude-data';
import { listTrash, autopurgeTrash } from '@/lib/trash';
import { restoreSessionAction, permanentDeleteAction } from '@/app/actions/restore-session';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function TrashPage() {
  // Auto-purge stale entries on every load
  autopurgeTrash();

  const [repos, trashEntries] = await Promise.all([getRepoSummaries(), Promise.resolve(listTrash())]);

  return (
    <div className="flex min-h-screen font-mono">
      <Sidebar repos={repos} />

      <main className="flex-1 p-6">
        <div className="flex items-center gap-4 mb-6">
          <Link href="/" className="text-green-700 hover:text-green-400 text-xs">← back</Link>
          <h1 className="text-green-400 font-bold text-sm tracking-widest">TRASH</h1>
          <span className="text-green-700 text-xs">
            {trashEntries.length} item(s) · auto-purge after 30 days
          </span>
        </div>

        {trashEntries.length === 0 && (
          <div className="terminal-box py-12 text-center">
            <div className="terminal-box-title">TRASH</div>
            <p className="text-green-700 text-sm mt-4">trash is empty</p>
          </div>
        )}

        {trashEntries.length > 0 && (
          <div className="terminal-box">
            <div className="terminal-box-title">DELETED SESSIONS</div>
            <div className="mt-3 text-xs">
              {/* Header */}
              <div className="grid grid-cols-[8rem_1fr_10rem_10rem_1fr] gap-3 px-2 py-1.5 border-b border-green-900 text-green-700 uppercase">
                <span>Session ID</span>
                <span>Original Path</span>
                <span>Trashed At</span>
                <span>Filename</span>
                <span>Actions</span>
              </div>

              {trashEntries.map((entry) => {
                const trashedDate = new Date(entry.trashedAt);
                const ageMs = Date.now() - trashedDate.getTime();
                const ageDays = Math.floor(ageMs / (24 * 60 * 60 * 1000));
                const isOld = ageDays > 25;

                return (
                  <div
                    key={entry.sessionId}
                    className="grid grid-cols-[8rem_1fr_10rem_10rem_1fr] gap-3 px-2 py-2 border-b border-green-950 hover:bg-green-950/30 items-center"
                  >
                    <span className="text-green-400 truncate" title={entry.sessionId}>
                      {entry.sessionId.slice(0, 8)}
                    </span>
                    <span className="text-green-600 truncate" title={entry.originalPath}>
                      …{entry.originalEncodedPath.slice(-20)}
                    </span>
                    <span className={`text-xs ${isOld ? 'text-amber-500' : 'text-green-700'}`}>
                      {trashedDate.toLocaleDateString()} ({ageDays}d)
                    </span>
                    <span className="text-green-800 truncate text-xs" title={entry.filename}>
                      {entry.filename.slice(0, 20)}…
                    </span>
                    <div className="flex gap-2">
                      <form action={async () => {
                        'use server';
                        await restoreSessionAction(entry.sessionId);
                      }}>
                        <button
                          type="submit"
                          className="px-2 py-0.5 text-xs text-green-400 border border-green-800 rounded hover:bg-green-950 transition-colors"
                        >
                          [restore]
                        </button>
                      </form>
                      <form action={async () => {
                        'use server';
                        await permanentDeleteAction(entry.sessionId);
                      }}>
                        <button
                          type="submit"
                          className="px-2 py-0.5 text-xs text-red-500 border border-red-900 rounded hover:bg-red-950 transition-colors"
                        >
                          [delete]
                        </button>
                      </form>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

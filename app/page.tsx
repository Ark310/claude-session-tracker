import { getAllSessions, getRepoSummaries } from '@/lib/claude-data';
import { Sidebar } from '@/components/sidebar';
import { SessionList } from '@/components/session-list';
import type { Session } from '@/lib/types';

interface HomePageProps {
  searchParams: Promise<{
    repo?: string;
    branch?: string;
    status?: string;
    q?: string;
  }>;
}

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function HomePage({ searchParams }: HomePageProps) {
  const params = await searchParams;
  const [allSessions, repos] = await Promise.all([getAllSessions(), getRepoSummaries()]);

  let sessions: Session[] = allSessions;

  if (params.repo) {
    sessions = sessions.filter((s) => s.encodedPath === params.repo);
  }
  if (params.branch) {
    sessions = sessions.filter((s) => s.branch === params.branch);
  }
  if (params.status) {
    sessions = sessions.filter((s) => s.status === params.status!.toUpperCase());
  }
  if (params.q) {
    const q = params.q.toLowerCase();
    sessions = sessions.filter(
      (s) =>
        s.repoName.toLowerCase().includes(q) ||
        s.id.includes(q) ||
        s.branch.toLowerCase().includes(q),
    );
  }

  const liveSessions = allSessions.filter((s) => s.status === 'LIVE').length;
  const idleSessions = allSessions.filter((s) => s.status === 'IDLE').length;

  return (
    <div className="flex min-h-screen font-mono">
      <Sidebar
        repos={repos}
        currentRepo={params.repo}
        currentBranch={params.branch}
      />

      <main className="flex-1 overflow-hidden">
        {/* Header */}
        <div className="border-b border-green-900 px-4 py-3">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-green-400 font-bold text-sm tracking-widest cursor-blink">
                CLAUDE SESSION MANAGER
              </h1>
              <p className="text-green-700 text-xs mt-0.5">
                {allSessions.length} sessions · {liveSessions} live · {idleSessions} idle
                {params.repo && (
                  <span className="ml-2 text-amber-600">
                    filtered: {repos.find((r) => r.encodedPath === params.repo)?.repoName ?? params.repo}
                  </span>
                )}
              </p>
            </div>

            <div className="flex items-center gap-3">
              <form className="flex gap-2" method="GET">
                {params.repo && <input type="hidden" name="repo" value={params.repo} />}
                <input
                  type="text"
                  name="q"
                  defaultValue={params.q}
                  placeholder="search…"
                  className="bg-black border border-green-800 text-green-300 text-xs px-2 py-1 font-mono focus:outline-none focus:border-green-500 w-32"
                />
                <select
                  name="status"
                  defaultValue={params.status ?? ''}
                  className="bg-black border border-green-800 text-green-300 text-xs px-2 py-1 font-mono focus:outline-none"
                >
                  <option value="">all status</option>
                  <option value="live">LIVE</option>
                  <option value="idle">IDLE</option>
                  <option value="ended">ENDED</option>
                </select>
                <button
                  type="submit"
                  className="px-2 py-1 text-xs border border-green-800 text-green-600 hover:text-green-300 hover:border-green-600 transition-colors"
                >
                  [filter]
                </button>
                {(params.q || params.status) && (
                  <a
                    href={params.repo ? `/?repo=${params.repo}` : '/'}
                    className="px-2 py-1 text-xs border border-green-900 text-green-700 hover:text-green-400 transition-colors"
                  >
                    [×]
                  </a>
                )}
              </form>
            </div>
          </div>
        </div>

        <SessionList sessions={sessions} />
      </main>
    </div>
  );
}

import Link from 'next/link';
import type { RepoSummary } from '@/lib/types';

interface SidebarProps {
  repos: RepoSummary[];
  currentRepo?: string;
  currentBranch?: string;
}

export function Sidebar({ repos, currentRepo, currentBranch }: SidebarProps) {
  return (
    <aside className="w-64 shrink-0 border-r border-green-900 min-h-screen p-3 font-mono text-sm">
      <div className="terminal-box mb-4">
        <div className="terminal-box-title">REPOSITORIES</div>
        <nav className="mt-2 space-y-1">
          <Link
            href="/"
            className={`block px-2 py-1 hover:text-green-300 hover:bg-green-950 rounded transition-colors ${!currentRepo ? 'text-green-300 bg-green-950' : 'text-green-600'}`}
          >
            [all repos]
          </Link>
          {repos.map((repo) => (
            <details
              key={repo.encodedPath}
              open={currentRepo === repo.encodedPath}
              className="group"
            >
              <summary className={`
                cursor-pointer px-2 py-1 rounded hover:bg-green-950 transition-colors
                list-none flex items-center justify-between
                ${currentRepo === repo.encodedPath ? 'text-green-300 bg-green-950' : 'text-green-600 hover:text-green-300'}
              `}>
                <Link
                  href={`/?repo=${repo.encodedPath}`}
                  className="flex-1 truncate"
                  title={repo.projectPath}
                >
                  {repo.repoName}
                </Link>
                <span className="ml-2 text-xs text-green-700 shrink-0">
                  {repo.sessionCount}
                  {repo.liveSessions > 0 && (
                    <span className="text-green-400 ml-1">({repo.liveSessions}▶)</span>
                  )}
                </span>
              </summary>

              {repo.branches.length > 0 && (
                <div className="ml-4 mt-1 space-y-0.5">
                  {repo.branches.map((branch) => (
                    <Link
                      key={branch}
                      href={`/?repo=${repo.encodedPath}&branch=${encodeURIComponent(branch)}`}
                      className={`block px-2 py-0.5 text-xs rounded hover:bg-green-950 transition-colors ${
                        currentBranch === branch ? 'text-amber-400' : 'text-green-700 hover:text-green-400'
                      }`}
                    >
                      ⎇ {branch}
                    </Link>
                  ))}
                </div>
              )}
            </details>
          ))}
        </nav>
      </div>

      <div className="terminal-box">
        <div className="terminal-box-title">NAVIGATION</div>
        <nav className="mt-2 space-y-1">
          {[
            { href: '/', label: '[ Sessions ]' },
            { href: '/manager', label: '[ Manager ]' },
            { href: '/stats', label: '[ Stats ]' },
            { href: '/trash', label: '[ Trash ]' },
          ].map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className="block px-2 py-1 text-green-600 hover:text-green-300 hover:bg-green-950 rounded transition-colors"
            >
              {label}
            </Link>
          ))}
        </nav>
      </div>

      <div className="mt-4 px-2 text-xs text-green-800">
        <div>j/k navigate</div>
        <div>x select  ? help</div>
        <div>D delete  K kill</div>
      </div>
    </aside>
  );
}

import { getAllSessions, getRepoSummaries } from '@/lib/claude-data';
import { Sidebar } from '@/components/sidebar';
import Link from 'next/link';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Rough cost estimates per 1M tokens (input/output)
const MODEL_COSTS: Record<string, { input: number; output: number }> = {
  'claude-opus-4-7': { input: 15, output: 75 },
  'claude-opus-4-5': { input: 15, output: 75 },
  'claude-sonnet-4-6': { input: 3, output: 15 },
  'claude-sonnet-4-5': { input: 3, output: 15 },
  'claude-haiku-4-5': { input: 0.8, output: 4 },
};

function getCost(model: string, input: number, output: number): number {
  const key = Object.keys(MODEL_COSTS).find((k) => model.includes(k.replace('claude-', '')));
  if (!key) return 0;
  const costs = MODEL_COSTS[key]!;
  return (input / 1_000_000) * costs.input + (output / 1_000_000) * costs.output;
}

function asciiBar(value: number, max: number, width = 30): string {
  if (max === 0) return '░'.repeat(width);
  const filled = Math.round((value / max) * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

export default async function StatsPage() {
  const [sessions, repos] = await Promise.all([getAllSessions(), getRepoSummaries()]);

  const totalSessions = sessions.length;
  const liveSessions = sessions.filter((s) => s.status === 'LIVE').length;
  const totalToolCalls = sessions.reduce((sum, s) => sum + s.toolCallCount, 0);

  // Token totals
  const totalInput = sessions.reduce((sum, s) => sum + s.tokens.inputTokens, 0);
  const totalOutput = sessions.reduce((sum, s) => sum + s.tokens.outputTokens, 0);
  const totalCache = sessions.reduce((sum, s) => sum + s.tokens.cacheReadTokens, 0);

  // By model
  const byModel = new Map<string, { sessions: number; input: number; output: number; cache: number }>();
  for (const s of sessions) {
    const model = s.model || 'unknown';
    const existing = byModel.get(model) ?? { sessions: 0, input: 0, output: 0, cache: 0 };
    byModel.set(model, {
      sessions: existing.sessions + 1,
      input: existing.input + s.tokens.inputTokens,
      output: existing.output + s.tokens.outputTokens,
      cache: existing.cache + s.tokens.cacheReadTokens,
    });
  }

  // Activity by day (last 14 days)
  const now = Date.now();
  const dayBuckets: number[] = Array(14).fill(0);
  for (const s of sessions) {
    const ageMs = now - s.lastActivityAt.getTime();
    const dayIdx = Math.floor(ageMs / (24 * 60 * 60 * 1000));
    if (dayIdx < 14) dayBuckets[dayIdx]!++;
  }
  dayBuckets.reverse(); // oldest first
  const maxBucket = Math.max(...dayBuckets, 1);

  const dayLabels = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(now - (13 - i) * 24 * 60 * 60 * 1000);
    return d.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' });
  });

  // Total cost estimate
  let totalCostUsd = 0;
  for (const [model, data] of byModel) {
    totalCostUsd += getCost(model, data.input, data.output);
  }

  return (
    <div className="flex min-h-screen font-mono">
      <Sidebar repos={repos} />

      <main className="flex-1 p-6 max-w-4xl">
        <div className="flex items-center gap-4 mb-6">
          <Link href="/" className="text-green-700 hover:text-green-400 text-xs">← back</Link>
          <h1 className="text-green-400 font-bold text-sm tracking-widest">USAGE STATISTICS</h1>
        </div>

        {/* Summary grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {[
            { label: 'Total Sessions', value: String(totalSessions), color: 'text-green-400' },
            { label: 'Live Now', value: String(liveSessions), color: 'text-green-400' },
            { label: 'Total Tokens', value: formatTokens(totalInput + totalOutput), color: 'text-cyan-400' },
            { label: 'Est. Cost', value: `~$${totalCostUsd.toFixed(2)}`, color: 'text-amber-400' },
          ].map(({ label, value, color }) => (
            <div key={label} className="terminal-box text-center">
              <div className="terminal-box-title">{label.toUpperCase()}</div>
              <div className={`${color} text-xl font-bold mt-2`}>{value}</div>
            </div>
          ))}
        </div>

        {/* Token breakdown */}
        <div className="terminal-box mb-6">
          <div className="terminal-box-title">TOKEN BREAKDOWN</div>
          <div className="mt-3 grid grid-cols-3 gap-4 text-xs">
            <div>
              <div className="text-green-700">INPUT</div>
              <div className="text-cyan-400 text-lg">{formatTokens(totalInput)}</div>
            </div>
            <div>
              <div className="text-green-700">OUTPUT</div>
              <div className="text-cyan-400 text-lg">{formatTokens(totalOutput)}</div>
            </div>
            <div>
              <div className="text-green-700">CACHE READS</div>
              <div className="text-purple-400 text-lg">{formatTokens(totalCache)}</div>
            </div>
            <div>
              <div className="text-green-700">TOOL CALLS</div>
              <div className="text-amber-400 text-lg">{totalToolCalls}</div>
            </div>
          </div>
        </div>

        {/* By model */}
        <div className="terminal-box mb-6">
          <div className="terminal-box-title">BY MODEL</div>
          <div className="mt-3 space-y-3 text-xs">
            {Array.from(byModel.entries())
              .sort((a, b) => b[1].input + b[1].output - (a[1].input + a[1].output))
              .map(([model, data]) => {
                const cost = getCost(model, data.input, data.output);
                const shortModel = model.replace('claude-', '').replace(/-\d{8}$/, '');
                return (
                  <div key={model} className="grid grid-cols-[12rem_1fr_6rem_6rem_5rem] gap-3 items-center">
                    <span className="text-green-500 truncate" title={model}>{shortModel}</span>
                    <span className="text-green-700">{data.sessions} sessions</span>
                    <span className="text-cyan-600">{formatTokens(data.input)}in</span>
                    <span className="text-cyan-500">{formatTokens(data.output)}out</span>
                    <span className="text-amber-600">~${cost.toFixed(3)}</span>
                  </div>
                );
              })}
          </div>
        </div>

        {/* Activity chart */}
        <div className="terminal-box mb-6">
          <div className="terminal-box-title">ACTIVITY (LAST 14 DAYS)</div>
          <div className="mt-4 font-mono text-xs">
            {dayBuckets.map((count, i) => (
              <div key={i} className="flex items-center gap-2 mb-0.5">
                <span className="text-green-800 w-10 text-right shrink-0">{dayLabels[i]}</span>
                <span className="text-green-500">{asciiBar(count, maxBucket, 40)}</span>
                <span className="text-green-600 w-4">{count}</span>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}

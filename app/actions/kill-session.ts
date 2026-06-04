'use server';

import { killProcess } from '@/lib/process-utils';
import { appendAuditLog } from '@/lib/audit-log';
import { cacheDelete } from '@/lib/cache';
import type { KillResult } from '@/lib/types';

const READ_ONLY = process.env.READ_ONLY === '1' || process.argv.includes('--read-only');

export async function killSession(pid: number, sessionId: string): Promise<KillResult> {
  if (READ_ONLY) {
    return { ok: false, message: 'App is running in read-only mode' };
  }

  const result = await killProcess(pid);

  appendAuditLog({
    action: 'kill',
    timestamp: new Date().toISOString(),
    sessionId,
    pid,
    outcome: result.ok ? 'success' : 'failure',
    message: result.message,
  });

  if (result.ok) {
    cacheDelete('all-sessions');
  }

  return result;
}

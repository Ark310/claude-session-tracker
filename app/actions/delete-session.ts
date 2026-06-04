'use server';

import { getSession } from '@/lib/claude-data';
import { softDeleteSession } from '@/lib/trash';
import { appendAuditLog } from '@/lib/audit-log';
import { cacheDelete } from '@/lib/cache';
import type { DeleteResult } from '@/lib/types';

const READ_ONLY = process.env.READ_ONLY === '1' || process.argv.includes('--read-only');

export async function deleteSession(sessionId: string): Promise<DeleteResult> {
  if (READ_ONLY) {
    return { ok: false, message: 'App is running in read-only mode' };
  }

  const session = await getSession(sessionId);
  if (!session) {
    return { ok: false, message: 'Session not found' };
  }

  if (session.status === 'LIVE') {
    return { ok: false, message: 'Session is live — kill it first before deleting' };
  }

  const result = await softDeleteSession(sessionId, session.encodedPath);

  appendAuditLog({
    action: 'delete',
    timestamp: new Date().toISOString(),
    sessionId,
    outcome: result.ok ? 'success' : 'failure',
    message: result.message,
  });

  if (result.ok) {
    cacheDelete('all-sessions');
    cacheDelete(`session:${session.encodedPath}:${sessionId}`);
    cacheDelete(`entries:${session.encodedPath}:${sessionId}`);
  }

  return result;
}

export async function bulkDeleteSessions(sessionIds: string[]): Promise<DeleteResult> {
  if (READ_ONLY) {
    return { ok: false, message: 'App is running in read-only mode' };
  }

  let successCount = 0;
  const errors: string[] = [];

  for (const id of sessionIds) {
    const result = await deleteSession(id);
    if (result.ok) {
      successCount++;
    } else {
      errors.push(`${id.slice(0, 8)}: ${result.message}`);
    }
  }

  if (errors.length === 0) {
    return { ok: true, message: `Deleted ${successCount} session(s)` };
  }

  return {
    ok: successCount > 0,
    message: `Deleted ${successCount}/${sessionIds.length}. Errors: ${errors.join('; ')}`,
  };
}

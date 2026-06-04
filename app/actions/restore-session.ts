'use server';

import { restoreSession, permanentlyDeleteSession } from '@/lib/trash';
import { appendAuditLog } from '@/lib/audit-log';
import { cacheDelete } from '@/lib/cache';
import type { RestoreResult, DeleteResult } from '@/lib/types';

const READ_ONLY = process.env.READ_ONLY === '1' || process.argv.includes('--read-only');

export async function restoreSessionAction(sessionId: string): Promise<RestoreResult> {
  if (READ_ONLY) {
    return { ok: false, message: 'App is running in read-only mode' };
  }

  const result = await restoreSession(sessionId);

  appendAuditLog({
    action: 'restore',
    timestamp: new Date().toISOString(),
    sessionId,
    outcome: result.ok ? 'success' : 'failure',
    message: result.message,
  });

  if (result.ok) {
    cacheDelete('all-sessions');
  }

  return result;
}

export async function permanentDeleteAction(sessionId: string): Promise<DeleteResult> {
  if (READ_ONLY) {
    return { ok: false, message: 'App is running in read-only mode' };
  }

  const result = await permanentlyDeleteSession(sessionId);

  appendAuditLog({
    action: 'permanent-delete',
    timestamp: new Date().toISOString(),
    sessionId,
    outcome: result.ok ? 'success' : 'failure',
    message: result.message,
  });

  return result;
}

import fs from 'fs';
import path from 'path';
import os from 'os';

const AUDIT_DIR = path.join(os.homedir(), '.claude-session-manager');
const AUDIT_FILE = path.join(AUDIT_DIR, 'audit.log');

function ensureDir(): void {
  if (!fs.existsSync(AUDIT_DIR)) {
    fs.mkdirSync(AUDIT_DIR, { recursive: true });
  }
}

export interface AuditEntry {
  action: 'kill' | 'delete' | 'restore' | 'permanent-delete';
  timestamp: string;
  sessionId: string;
  pid?: number;
  outcome: 'success' | 'failure';
  message: string;
}

export function appendAuditLog(entry: AuditEntry): void {
  try {
    ensureDir();
    const line = JSON.stringify(entry) + '\n';
    fs.appendFileSync(AUDIT_FILE, line, 'utf8');
  } catch {
    // audit log failures must never propagate
  }
}

export function readAuditLog(): AuditEntry[] {
  try {
    if (!fs.existsSync(AUDIT_FILE)) return [];
    const content = fs.readFileSync(AUDIT_FILE, 'utf8');
    return content
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line) as AuditEntry;
        } catch {
          return null;
        }
      })
      .filter((e): e is AuditEntry => e !== null);
  } catch {
    return [];
  }
}

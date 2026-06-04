import fs from 'fs';
import { execSync } from 'child_process';
import type { KillResult, ProcessInfo } from './types';

const CLAUDE_CMDLINE_PATTERN = /claude/i;
const MIN_SAFE_PID = 100;

export function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function getProcessCmdline(pid: number): string | null {
  // Linux: read /proc/<pid>/cmdline
  if (process.platform === 'linux') {
    try {
      const raw = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8');
      return raw.replace(/\0/g, ' ').trim();
    } catch {
      // fall through to ps
    }
  }

  // Cross-platform fallback: ps
  try {
    const out = execSync(`ps -p ${pid} -o command=`, { encoding: 'utf8', timeout: 3000 });
    return out.trim();
  } catch {
    return null;
  }
}

export function getProcessWorkingDir(pid: number): string | null {
  if (process.platform === 'linux') {
    try {
      return fs.readlinkSync(`/proc/${pid}/cwd`);
    } catch {
      return null;
    }
  }
  try {
    const out = execSync(`lsof -p ${pid} -d cwd -Fn 2>/dev/null | grep '^n'`, {
      encoding: 'utf8',
      timeout: 3000,
    });
    return out.trim().slice(1) || null;
  } catch {
    return null;
  }
}

export function getProcessParentPid(pid: number): number | null {
  if (process.platform === 'linux') {
    try {
      const stat = fs.readFileSync(`/proc/${pid}/status`, 'utf8');
      const match = stat.match(/^PPid:\s+(\d+)/m);
      return match ? parseInt(match[1]!, 10) : null;
    } catch {
      return null;
    }
  }
  try {
    const out = execSync(`ps -p ${pid} -o ppid=`, { encoding: 'utf8', timeout: 3000 });
    const n = parseInt(out.trim(), 10);
    return isNaN(n) ? null : n;
  } catch {
    return null;
  }
}

export function isClaudeProcess(pid: number): boolean {
  if (pid < MIN_SAFE_PID) return false;
  const cmdline = getProcessCmdline(pid);
  if (!cmdline) return false;
  return CLAUDE_CMDLINE_PATTERN.test(cmdline);
}

export function getProcessInfo(pid: number): ProcessInfo | null {
  const cmdline = getProcessCmdline(pid);
  if (!cmdline) return null;
  return {
    pid,
    cmdline,
    ppid: getProcessParentPid(pid) ?? undefined,
    workingDir: getProcessWorkingDir(pid) ?? undefined,
  };
}

export async function killProcess(pid: number): Promise<KillResult> {
  if (pid < MIN_SAFE_PID) {
    return { ok: false, message: `Refused: PID ${pid} is below safety threshold` };
  }

  if (!isClaudeProcess(pid)) {
    return { ok: false, message: 'Refused: process does not appear to be a Claude Code session' };
  }

  if (!isPidAlive(pid)) {
    return { ok: false, message: 'Process is not running' };
  }

  // SIGTERM first
  try {
    process.kill(pid, 'SIGTERM');
  } catch (err) {
    return { ok: false, message: `Failed to send SIGTERM: ${String(err)}` };
  }

  // Wait up to 5s for graceful exit
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 250));
    if (!isPidAlive(pid)) {
      return { ok: true, message: `Process ${pid} terminated gracefully` };
    }
  }

  // SIGKILL
  try {
    process.kill(pid, 'SIGKILL');
    return { ok: true, message: `Process ${pid} killed (SIGKILL after SIGTERM timeout)` };
  } catch (err) {
    return { ok: false, message: `Failed to send SIGKILL: ${String(err)}` };
  }
}

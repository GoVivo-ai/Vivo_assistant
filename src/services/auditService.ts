import { prisma } from '../db/prisma';

export interface AuditEntry {
  userId: string;
  action: string;
  provider?: string;
  query?: string;
  status: 'success' | 'empty' | 'not_connected' | 'error' | 'denied';
}

const MAX_QUERY_LENGTH = 200;

/**
 * Stores only basic metadata (action, provider, status, truncated query).
 * Never store full API responses or sensitive payloads here.
 */
export async function logAudit(entry: AuditEntry): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: entry.userId,
        action: entry.action,
        provider: entry.provider ?? null,
        query: entry.query ? entry.query.slice(0, MAX_QUERY_LENGTH) : null,
        status: entry.status,
      },
    });
  } catch (err) {
    // Audit failures must never break the user-facing flow.
    console.error('[audit] failed to write audit log:', (err as Error).message);
  }
}

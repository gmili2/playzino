import { prisma, type Tx } from './prisma.js';

export interface AuditEntry {
  actorId?: string | null;
  action: string;
  targetType: string;
  targetId?: string | null;
  details?: Record<string, unknown>;
  ip?: string | null;
}

export function audit(entry: AuditEntry, tx: Tx = prisma) {
  return tx.auditLog.create({
    data: {
      actorId: entry.actorId ?? null,
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId ?? null,
      details: entry.details ? JSON.stringify(entry.details) : null,
      ip: entry.ip ?? null
    }
  });
}

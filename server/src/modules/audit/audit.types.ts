/**
 * Safe audit-log view returned by GET /audit-logs. Deliberately limited to
 * metadata: no request payloads beyond the ids/counts the audit service
 * writes, and never passwords, hashes or auth material. Writers (the single
 * `writeAudit` service) must keep metadata to non-sensitive references.
 */
export interface AuditLogView {
  id: string;
  createdAt: string;
  action: string;
  entityType: string;
  entityId: string | null;
  actorEmail: string | null;
  userId: string | null;
  ip: string | null;
  metadata: Record<string, unknown> | null;
}

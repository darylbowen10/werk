import { db } from "./db";
export async function audit(companyId: string, actor: string, action: string, target: string, meta?: object) {
  await db.auditLog.create({ data: { companyId, actor, action, target, meta: meta ?? undefined } });
}

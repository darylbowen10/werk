// Extensible connector framework. Credentials are encrypted at rest (AES-256-GCM) and never sent to the model.
// A connector is only reported "connected" after its credentials were validated against the provider's API.
import { db } from "../db";
import { decrypt, encrypt } from "../crypto";

export type Creds = { access_token?: string; refresh_token?: string; expires_at?: number; api_key?: string; instance_url?: string; realm_id?: string };
export type OAuthCfg = { authorizeUrl: string; tokenUrl: string; clientIdEnv: string; clientSecretEnv: string; scopes: string[]; extra?: Record<string, string> };

export type Connector = {
  id: string; name: string; category: string; description: string;
  authType: "oauth2" | "api_key";
  scopes: string[];
  oauth?: OAuthCfg;
  keyHint?: string;
  configured: () => boolean;
  validate?: (creds: Creds) => Promise<{ ok: boolean; meta?: object; error?: string }>;
  sync?: (companyId: string, creds: Creds) => Promise<string>;
  send?: (companyId: string, msg: { to: string; subject: string; body: string }) => Promise<string>;
};

const env = (k: string) => Boolean(process.env[k]);
async function j(res: Response) { const t = await res.text(); if (!res.ok) throw new Error(`${res.status} ${t.slice(0, 200)}`); return t ? JSON.parse(t) : {}; }
const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

export async function saveCreds(companyId: string, provider: string, creds: Creds, meta?: object, scopes?: string[]) {
  await db.integration.upsert({
    where: { companyId_provider: { companyId, provider } },
    create: { companyId, provider, status: "connected", encryptedCreds: encrypt(JSON.stringify(creds)), meta, scopes, connectedAt: new Date() },
    update: { status: "connected", encryptedCreds: encrypt(JSON.stringify(creds)), meta, scopes, connectedAt: new Date(), lastError: null },
  });
}

/** Load (and refresh, for OAuth) credentials. */
export async function getCreds(companyId: string, provider: string): Promise<Creds | null> {
  const row = await db.integration.findUnique({ where: { companyId_provider: { companyId, provider } } });
  if (!row?.encryptedCreds || row.status !== "connected") return null;
  const creds = JSON.parse(decrypt(row.encryptedCreds)) as Creds;
  const c = getConnector(provider);
  if (c?.oauth && creds.refresh_token && creds.expires_at && creds.expires_at < Date.now() + 60_000) {
    const body = new URLSearchParams({ grant_type: "refresh_token", refresh_token: creds.refresh_token, client_id: process.env[c.oauth.clientIdEnv]!, client_secret: process.env[c.oauth.clientSecretEnv]! });
    const tok = await j(await fetch(c.oauth.tokenUrl, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" }, body }));
    creds.access_token = tok.access_token;
    creds.expires_at = Date.now() + (tok.expires_in ?? 3600) * 1000;
    if (tok.refresh_token) creds.refresh_token = tok.refresh_token;
    await db.integration.update({ where: { id: row.id }, data: { encryptedCreds: encrypt(JSON.stringify(creds)) } });
  }
  return creds;
}

const GOOGLE = (scopes: string[]): OAuthCfg => ({ authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth", tokenUrl: "https://oauth2.googleapis.com/token", clientIdEnv: "GOOGLE_CLIENT_ID", clientSecretEnv: "GOOGLE_CLIENT_SECRET", scopes, extra: { access_type: "offline", prompt: "consent" } });
const MS = (scopes: string[]): OAuthCfg => ({ authorizeUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize", tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token", clientIdEnv: "MICROSOFT_CLIENT_ID", clientSecretEnv: "MICROSOFT_CLIENT_SECRET", scopes: ["offline_access", ...scopes] });

const CONNECTORS: Connector[] = [
  {
    id: "stripe", name: "Stripe", category: "Finance", authType: "api_key", scopes: ["read: charges, balance"],
    description: "Revenue and customer counts from Stripe charges. Use a restricted read-only key.", keyHint: "rk_live_… (restricted, read-only)",
    configured: () => true,
    async validate(c) { try { const b = await j(await fetch("https://api.stripe.com/v1/balance", { headers: bearer(c.api_key!) })); return { ok: true, meta: { livemode: b.livemode } }; } catch (e) { return { ok: false, error: (e as Error).message }; } },
    async sync(companyId, c) {
      const since = new Date(); since.setMonth(since.getMonth() - 6, 1); since.setHours(0, 0, 0, 0);
      const byMonth = new Map<string, { revenue: number; customers: Set<string> }>();
      let starting_after: string | undefined, pages = 0;
      do {
        const q = new URLSearchParams({ limit: "100", "created[gte]": String(Math.floor(+since / 1000)), ...(starting_after ? { starting_after } : {}) });
        const res = await j(await fetch(`https://api.stripe.com/v1/charges?${q}`, { headers: bearer(c.api_key!) }));
        for (const ch of res.data as { id: string; paid: boolean; status: string; amount: number; amount_refunded: number; created: number; customer: string | null; currency: string }[]) {
          if (!ch.paid || ch.status !== "succeeded") continue;
          const m = monthKey(new Date(ch.created * 1000));
          const e = byMonth.get(m) ?? { revenue: 0, customers: new Set() };
          e.revenue += (ch.amount - ch.amount_refunded) / 100; if (ch.customer) e.customers.add(ch.customer);
          byMonth.set(m, e);
        }
        starting_after = res.has_more ? res.data.at(-1)?.id : undefined;
      } while (starting_after && ++pages < 20);
      for (const [month, v] of byMonth) {
        await db.financialPeriod.upsert({ where: { companyId_month_source: { companyId, month, source: "stripe" } }, create: { companyId, month, revenue: v.revenue, expenses: 0, breakdown: {}, cash: 0, customers: v.customers.size, source: "stripe" }, update: { revenue: v.revenue, customers: v.customers.size } });
      }
      return `Synced ${byMonth.size} months of Stripe revenue.`;
    },
  },
  {
    id: "hubspot", name: "HubSpot", category: "Sales", authType: "api_key", scopes: ["crm.objects.deals.read"],
    description: "Deals pipeline from HubSpot CRM via a private app token.", keyHint: "pat-… (private app token with crm.objects.deals.read)",
    configured: () => true,
    async validate(c) { try { await j(await fetch("https://api.hubapi.com/crm/v3/objects/deals?limit=1", { headers: bearer(c.api_key!) })); return { ok: true }; } catch (e) { return { ok: false, error: (e as Error).message }; } },
    async sync(companyId, c) {
      const res = await j(await fetch("https://api.hubapi.com/crm/v3/objects/deals?limit=100&properties=dealname,amount,dealstage,closedate,hs_deal_stage_probability,createdate,hs_analytics_source", { headers: bearer(c.api_key!) }));
      const stage = (s: string) => /closedwon/i.test(s) ? "won" : /closedlost/i.test(s) ? "lost" : /contract/i.test(s) ? "negotiation" : /presentation|decision/i.test(s) ? "proposal" : /appointment/i.test(s) ? "meeting" : "conversation";
      await db.deal.deleteMany({ where: { companyId, source: "hubspot" } });
      const rows = (res.results ?? []).map((d: { properties: Record<string, string> }) => ({
        companyId, name: d.properties.dealname ?? "Deal", account: d.properties.dealname ?? "", stage: stage(d.properties.dealstage ?? ""), value: Number(d.properties.amount ?? 0),
        probability: Math.round(Number(d.properties.hs_deal_stage_probability ?? 0) * 100), closeDate: d.properties.closedate ? new Date(d.properties.closedate) : new Date(),
        leadSource: d.properties.hs_analytics_source ?? "HubSpot", source: "hubspot", createdAt: d.properties.createdate ? new Date(d.properties.createdate) : new Date(),
      }));
      if (rows.length) await db.deal.createMany({ data: rows });
      return `Synced ${rows.length} HubSpot deals.`;
    },
  },
  {
    id: "slack", name: "Slack", category: "Communication", authType: "api_key", scopes: ["chat:write"],
    description: "Lets agents post approved messages to Slack channels (bot token).", keyHint: "xoxb-… (bot token with chat:write)",
    configured: () => true,
    async validate(c) { try { const r = await j(await fetch("https://slack.com/api/auth.test", { method: "POST", headers: bearer(c.api_key!) })); return r.ok ? { ok: true, meta: { team: r.team } } : { ok: false, error: r.error }; } catch (e) { return { ok: false, error: (e as Error).message }; } },
    async send(companyId, m) {
      const c = await getCreds(companyId, "slack"); if (!c?.api_key) throw new Error("Slack not connected");
      const r = await j(await fetch("https://slack.com/api/chat.postMessage", { method: "POST", headers: { ...bearer(c.api_key), "Content-Type": "application/json" }, body: JSON.stringify({ channel: m.to, text: m.subject ? `*${m.subject}*\n${m.body}` : m.body }) }));
      if (!r.ok) throw new Error(r.error); return `Posted to Slack ${m.to}.`;
    },
  },
  {
    id: "gmail", name: "Gmail", category: "Communication", authType: "oauth2", scopes: ["gmail.readonly", "gmail.send"],
    description: "Inbox triage for the Executive Assistant; approved emails are sent from your account.",
    oauth: GOOGLE(["https://www.googleapis.com/auth/gmail.readonly", "https://www.googleapis.com/auth/gmail.send"]),
    configured: () => env("GOOGLE_CLIENT_ID") && env("GOOGLE_CLIENT_SECRET"),
    async sync(companyId, c) {
      const list = await j(await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=15&q=newer_than:3d", { headers: bearer(c.access_token!) }));
      await db.inboxMessage.deleteMany({ where: { companyId, source: "gmail" } });
      let n = 0;
      for (const m of list.messages ?? []) {
        const msg = await j(await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`, { headers: bearer(c.access_token!) }));
        const h = (k: string) => msg.payload?.headers?.find((x: { name: string }) => x.name === k)?.value ?? "";
        await db.inboxMessage.create({ data: { companyId, sender: h("From"), subject: h("Subject"), snippet: msg.snippet ?? "", receivedAt: new Date(Number(msg.internalDate)), needsResponse: (msg.labelIds ?? []).includes("UNREAD"), important: (msg.labelIds ?? []).includes("IMPORTANT"), source: "gmail" } });
        n++;
      }
      return `Synced ${n} recent Gmail messages (metadata + snippet).`;
    },
    async send(companyId, m) {
      const c = await getCreds(companyId, "gmail"); if (!c?.access_token) throw new Error("Gmail not connected");
      const raw = Buffer.from(`To: ${m.to}\r\nSubject: ${m.subject}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${m.body}`).toString("base64url");
      await j(await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", { method: "POST", headers: { ...bearer(c.access_token), "Content-Type": "application/json" }, body: JSON.stringify({ raw }) }));
      return `Email sent to ${m.to} via Gmail.`;
    },
  },
  {
    id: "google_calendar", name: "Google Calendar", category: "Calendar", authType: "oauth2", scopes: ["calendar.readonly"],
    description: "Today's meetings and conflicts for briefings.", oauth: GOOGLE(["https://www.googleapis.com/auth/calendar.readonly"]),
    configured: () => env("GOOGLE_CLIENT_ID") && env("GOOGLE_CLIENT_SECRET"),
    async sync(companyId, c) {
      const from = new Date(); from.setHours(0, 0, 0, 0); const to = new Date(from); to.setDate(to.getDate() + 7);
      const r = await j(await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?singleEvents=true&orderBy=startTime&timeMin=${from.toISOString()}&timeMax=${to.toISOString()}`, { headers: bearer(c.access_token!) }));
      await db.calendarEvent.deleteMany({ where: { companyId, source: "google_calendar" } });
      const rows = (r.items ?? []).filter((e: { start?: { dateTime?: string } }) => e.start?.dateTime).map((e: { summary?: string; start: { dateTime: string }; end: { dateTime: string }; attendees?: { email: string }[] }) => ({ companyId, title: e.summary ?? "(no title)", start: new Date(e.start.dateTime), end: new Date(e.end.dateTime), attendees: (e.attendees ?? []).map((a) => a.email).join(", ").slice(0, 300), source: "google_calendar" }));
      if (rows.length) await db.calendarEvent.createMany({ data: rows });
      return `Synced ${rows.length} calendar events.`;
    },
  },
  {
    id: "google_drive", name: "Google Drive", category: "Documents", authType: "oauth2", scopes: ["drive.metadata.readonly"],
    description: "Recent document metadata so agents can reference your files.", oauth: GOOGLE(["https://www.googleapis.com/auth/drive.metadata.readonly"]),
    configured: () => env("GOOGLE_CLIENT_ID") && env("GOOGLE_CLIENT_SECRET"),
    async sync(companyId, c) {
      const r = await j(await fetch("https://www.googleapis.com/drive/v3/files?pageSize=20&orderBy=modifiedTime desc&fields=files(name,modifiedTime,mimeType)", { headers: bearer(c.access_token!) }));
      await db.integration.update({ where: { companyId_provider: { companyId, provider: "google_drive" } }, data: { meta: { recentFiles: r.files ?? [] } } });
      return `Indexed ${(r.files ?? []).length} recent files (metadata only).`;
    },
  },
  {
    id: "outlook", name: "Outlook Mail", category: "Communication", authType: "oauth2", scopes: ["Mail.Read", "Mail.Send"],
    description: "Inbox triage and approved sending via Microsoft 365.", oauth: MS(["Mail.Read", "Mail.Send"]),
    configured: () => env("MICROSOFT_CLIENT_ID") && env("MICROSOFT_CLIENT_SECRET"),
    async sync(companyId, c) {
      const r = await j(await fetch("https://graph.microsoft.com/v1.0/me/messages?$top=15&$select=from,subject,bodyPreview,receivedDateTime,isRead,importance", { headers: bearer(c.access_token!) }));
      await db.inboxMessage.deleteMany({ where: { companyId, source: "outlook" } });
      const rows = (r.value ?? []).map((m: { from?: { emailAddress?: { address?: string } }; subject?: string; bodyPreview?: string; receivedDateTime: string; isRead: boolean; importance: string }) => ({ companyId, sender: m.from?.emailAddress?.address ?? "", subject: m.subject ?? "", snippet: (m.bodyPreview ?? "").slice(0, 400), receivedAt: new Date(m.receivedDateTime), needsResponse: !m.isRead, important: m.importance === "high", source: "outlook" }));
      if (rows.length) await db.inboxMessage.createMany({ data: rows });
      return `Synced ${rows.length} Outlook messages.`;
    },
    async send(companyId, m) {
      const c = await getCreds(companyId, "outlook"); if (!c?.access_token) throw new Error("Outlook not connected");
      await fetch("https://graph.microsoft.com/v1.0/me/sendMail", { method: "POST", headers: { ...bearer(c.access_token), "Content-Type": "application/json" }, body: JSON.stringify({ message: { subject: m.subject, body: { contentType: "Text", content: m.body }, toRecipients: [{ emailAddress: { address: m.to } }] } }) }).then((r) => { if (!r.ok) throw new Error(`Graph ${r.status}`); });
      return `Email sent to ${m.to} via Outlook.`;
    },
  },
  {
    id: "ms_calendar", name: "Microsoft Calendar", category: "Calendar", authType: "oauth2", scopes: ["Calendars.Read"],
    description: "Meetings from Microsoft 365 for briefings.", oauth: MS(["Calendars.Read"]),
    configured: () => env("MICROSOFT_CLIENT_ID") && env("MICROSOFT_CLIENT_SECRET"),
    async sync(companyId, c) {
      const from = new Date(); from.setHours(0, 0, 0, 0); const to = new Date(from); to.setDate(to.getDate() + 7);
      const r = await j(await fetch(`https://graph.microsoft.com/v1.0/me/calendarview?startDateTime=${from.toISOString()}&endDateTime=${to.toISOString()}&$top=50`, { headers: { ...bearer(c.access_token!), Prefer: 'outlook.timezone="UTC"' } }));
      await db.calendarEvent.deleteMany({ where: { companyId, source: "ms_calendar" } });
      const rows = (r.value ?? []).map((e: { subject?: string; start: { dateTime: string }; end: { dateTime: string }; attendees?: { emailAddress: { address: string } }[] }) => ({ companyId, title: e.subject ?? "(no title)", start: new Date(e.start.dateTime + "Z"), end: new Date(e.end.dateTime + "Z"), attendees: (e.attendees ?? []).map((a) => a.emailAddress.address).join(", ").slice(0, 300), source: "ms_calendar" }));
      if (rows.length) await db.calendarEvent.createMany({ data: rows });
      return `Synced ${rows.length} calendar events.`;
    },
  },
  {
    id: "quickbooks", name: "QuickBooks Online", category: "Finance", authType: "oauth2", scopes: ["com.intuit.quickbooks.accounting"],
    description: "Monthly P&L (income and expenses) for the CFO.",
    oauth: { authorizeUrl: "https://appcenter.intuit.com/connect/oauth2", tokenUrl: "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer", clientIdEnv: "QUICKBOOKS_CLIENT_ID", clientSecretEnv: "QUICKBOOKS_CLIENT_SECRET", scopes: ["com.intuit.quickbooks.accounting"] },
    configured: () => env("QUICKBOOKS_CLIENT_ID") && env("QUICKBOOKS_CLIENT_SECRET"),
    async sync(companyId, c) {
      const start = new Date(); start.setMonth(start.getMonth() - 6, 1);
      const r = await j(await fetch(`https://quickbooks.api.intuit.com/v3/company/${c.realm_id}/reports/ProfitAndLoss?start_date=${start.toISOString().slice(0, 10)}&end_date=${new Date().toISOString().slice(0, 10)}&summarize_column_by=Month`, { headers: { ...bearer(c.access_token!), Accept: "application/json" } }));
      const cols: string[] = (r.Columns?.Column ?? []).map((x: { ColTitle: string }) => x.ColTitle);
      const find = (group: string) => (r.Rows?.Row ?? []).find((x: { group?: string }) => x.group === group)?.Summary?.ColData?.map((d: { value: string }) => Number(d.value) || 0) ?? [];
      const income = find("Income"), expenses = find("Expenses");
      let n = 0;
      cols.forEach((title, i) => {
        if (i === 0 || title === "Total") return;
        const d = new Date(`${title} 1`); if (isNaN(+d)) return;
        n++;
        void db.financialPeriod.upsert({ where: { companyId_month_source: { companyId, month: monthKey(d), source: "quickbooks" } }, create: { companyId, month: monthKey(d), revenue: income[i] ?? 0, expenses: expenses[i] ?? 0, breakdown: { other: expenses[i] ?? 0 }, cash: 0, source: "quickbooks" }, update: { revenue: income[i] ?? 0, expenses: expenses[i] ?? 0 } });
      });
      return `Synced ${n} months of QuickBooks P&L.`;
    },
  },
  {
    id: "salesforce", name: "Salesforce", category: "Sales", authType: "oauth2", scopes: ["api", "refresh_token"],
    description: "Opportunities pipeline from Salesforce.",
    oauth: { authorizeUrl: "https://login.salesforce.com/services/oauth2/authorize", tokenUrl: "https://login.salesforce.com/services/oauth2/token", clientIdEnv: "SALESFORCE_CLIENT_ID", clientSecretEnv: "SALESFORCE_CLIENT_SECRET", scopes: ["api", "refresh_token"] },
    configured: () => env("SALESFORCE_CLIENT_ID") && env("SALESFORCE_CLIENT_SECRET"),
    async sync(companyId, c) {
      const q = encodeURIComponent("SELECT Name, Account.Name, StageName, Amount, Probability, CloseDate, LeadSource, CreatedDate, IsClosed, IsWon FROM Opportunity ORDER BY CreatedDate DESC LIMIT 200");
      const r = await j(await fetch(`${c.instance_url}/services/data/v60.0/query?q=${q}`, { headers: bearer(c.access_token!) }));
      await db.deal.deleteMany({ where: { companyId, source: "salesforce" } });
      const rows = (r.records ?? []).map((o: { Name: string; Account?: { Name: string }; StageName: string; Amount: number; Probability: number; CloseDate: string; LeadSource?: string; CreatedDate: string; IsClosed: boolean; IsWon: boolean }) => ({ companyId, name: o.Name, account: o.Account?.Name ?? "", stage: o.IsClosed ? (o.IsWon ? "won" : "lost") : /negot/i.test(o.StageName) ? "negotiation" : /propos|quote/i.test(o.StageName) ? "proposal" : /qualif/i.test(o.StageName) ? "meeting" : "conversation", value: o.Amount ?? 0, probability: Math.round(o.Probability ?? 0), closeDate: new Date(o.CloseDate), leadSource: o.LeadSource ?? "Salesforce", source: "salesforce", createdAt: new Date(o.CreatedDate) }));
      if (rows.length) await db.deal.createMany({ data: rows });
      return `Synced ${rows.length} Salesforce opportunities.`;
    },
  },
];

export function getConnector(id: string) { return CONNECTORS.find((c) => c.id === id); }
export function listConnectors() { return CONNECTORS; }

export async function runSync(companyId: string, provider: string) {
  const c = getConnector(provider);
  const creds = await getCreds(companyId, provider);
  if (!c?.sync || !creds) return "Not connected";
  try {
    const msg = await c.sync(companyId, creds);
    await db.integration.update({ where: { companyId_provider: { companyId, provider } }, data: { lastSyncAt: new Date(), lastError: null } });
    return msg;
  } catch (e) {
    await db.integration.update({ where: { companyId_provider: { companyId, provider } }, data: { lastError: (e as Error).message.slice(0, 300) } });
    throw e;
  }
}

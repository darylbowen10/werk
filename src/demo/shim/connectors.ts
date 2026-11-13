// Browser demo: integrations need a server to hold credentials, so they are listed but not connectable.
const LIST = [
  ["stripe", "Stripe", "Finance", "api_key", "Revenue and customer counts from Stripe charges."],
  ["hubspot", "HubSpot", "Sales", "api_key", "Deals pipeline from HubSpot CRM."],
  ["slack", "Slack", "Communication", "api_key", "Lets agents post approved messages to Slack."],
  ["gmail", "Gmail", "Communication", "oauth2", "Inbox triage; approved emails sent from your account."],
  ["google_calendar", "Google Calendar", "Calendar", "oauth2", "Today's meetings and conflicts for briefings."],
  ["google_drive", "Google Drive", "Documents", "oauth2", "Recent document metadata."],
  ["outlook", "Outlook Mail", "Communication", "oauth2", "Inbox triage via Microsoft 365."],
  ["ms_calendar", "Microsoft Calendar", "Calendar", "oauth2", "Meetings from Microsoft 365."],
  ["quickbooks", "QuickBooks Online", "Finance", "oauth2", "Monthly P&L for the CFO."],
  ["salesforce", "Salesforce", "Sales", "oauth2", "Opportunities pipeline."],
] as const;
export const listConnectors = () => LIST.map(([id, name, category, authType, description]) => ({ id, name, category, authType, description, scopes: [], keyHint: "Not available in the browser demo", configured: () => false, send: undefined as undefined | ((...a: unknown[]) => Promise<string>) }));
export const getConnector = (id: string) => listConnectors().find((c) => c.id === id);
export async function runSync() { return "Integrations are not available in the browser demo"; }

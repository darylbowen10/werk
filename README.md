# Executive HQ

A playable, browser-based 16-bit pixel-art RPG where you, the CEO, run your company from a living virtual headquarters staffed by autonomous AI employees.

Walk the office with WASD, step into the CFO's office, ask for a six-month revenue forecast, and leave. The CFO works on it in a durable background job. A notification arrives when it's done, and you can review the report in the CFO's office or from the desk computer in your executive suite. Each morning your Executive Assistant walks over from their office to greet you with a briefing assembled from what actually happened while you were away.

All art is original and drawn procedurally at runtime: tiles, furniture, characters and icons. The project uses no third-party sprite assets.

---

## Quick start

Requirements: Node 20+ (tested on 22), PostgreSQL 14+, and optionally Redis.

```bash
npm install
cp .env.example .env          # then fill AUTH_SECRET and ENCRYPTION_KEY (commands are in the file)
npx prisma db push            # create the schema
npm run dev                   # web app on :3000 + background worker
```

Open http://localhost:3000, found a company, design your CEO, and you'll arrive in the lobby.

Production:

```bash
npm run build && npm start    # next start + worker
```

The worker (`npm run worker`) is a separate process. Run at least one; you can run several, because jobs are claimed with `FOR UPDATE SKIP LOCKED`.

### AI modes

| `ANTHROPIC_API_KEY` | Behaviour |
|---|---|
| set | AI employees run on the Claude API (`claude-opus-5-5` by default, override with `ANTHROPIC_MODEL`) with adaptive thinking, a tool-use loop, and server-side refusal fallbacks. |
| empty | **Offline simulation mode.** Deterministic, rule-based agents compute every figure from stored data. The HUD, the dialogue boxes and every report are labelled `OFFLINE SIM`, so this output is never presented as Claude's work. |

All company figures start as **demo data**, and the UI labels them `DEMO DATA` everywhere until you connect integrations. Agents are instructed never to invent metrics.

---

## How to play

| Key | Action |
|---|---|
| WASD / arrows | Walk (Shift to hurry) |
| E / Space | Interact with whoever or whatever the prompt shows |
| Esc | Close a panel |

- **Talk to employees:** walk up to anyone and press E. Type naturally. Substantive requests become background assignments, shown as a "📋 Assignment queued" chip.
- **Executive desk** (CEO suite, top centre): the full Executive OS. Its screens are Company Overview, AI Workforce, Assignments, Financial Command Center, Operations, Sales & Marketing, Executive Reports, Briefings, Approvals and Company Settings (integrations, preferences, security, audit log).
- **Department stations:** the boards and screens in each office open that department's dashboard.
- **Conference room table:** pick participants and a topic. The agents walk in, take seats and discuss. "End meeting" produces notes and decisions, and assigns action items automatically.
- **"HIRING" signs** in vacant offices: hire a custom AI employee. You set the name, role, responsibilities, tool permissions and appearance, and they move into the office.
- **🛋 Decorate** (top bar, inside your suite): a grid-based furniture editor with ghost previews and collision validation. Layouts are saved to the database.
- **Exit mat** (lobby): end-of-day recap. Instructions you give become assignments that start at 7:00 the next morning.
- **Inbox** (📬) and **Approvals** (🔐) in the HUD keep everything, so nothing depends on catching a toast.

### Morning Executive Briefing

1. On your first arrival each day you spawn in the lobby. The Executive Assistant is notified and uses A\* pathfinding to walk over from their office.
2. A speech bubble and dialogue box appear with a personalised greeting. It is built only from persisted activity: completed tasks, project issues, new opportunities and pending decisions. On a quiet night it says so.
3. Your options:
   - **Give me the briefing:** the full report covers financial health, operations, sales and marketing, calendar and communications, AI workforce, and strategic recommendations, plus a **decision queue** where you can approve, reject, delegate or postpone.
   - **What's urgent?:** only the decisions and attention items.
   - **Walk with me:** a non-blocking panel opens while the EA follows you. Ask follow-ups or give instructions ("Have the CFO dig into software spend") and the work is routed to the right department. The conversation persists across rooms.
   - **Let's meet in my office:** you and the EA both walk to your suite, and the briefing opens there.
   - **Later:** the briefing goes to your inbox. You can also **turn off auto-briefings** here, or later in Company Settings.
4. Briefing history is kept under Executive OS → Briefings.

The worker prepares the briefing at `BRIEFING_HOUR`. If it is still unread when you arrive, it is refreshed so it includes overnight work.

---

## Architecture

```
src/
  app/                 Next.js App Router pages + REST API (all routes tenant-scoped)
  components/game/     React UI overlays: dialogue, briefing, desk OS, meetings, decor, panels
  game/                Phaser 3 world: OfficeScene (tilemap, physics, NPC AI, doors, minimap,
                       decor editor), A* pathfinding, procedural textures, React<->Phaser bus
  shared/              Code used by both client and server: map layout, avatar generator,
                       furniture catalog, placement rules
  lib/
    agents/            roster, tools (permission + approval gate), llm (Claude loop),
                       engine (chat, task execution, meetings), offline (simulation mode)
    jobs/queue.ts      durable Postgres job queue
    briefing.ts        morning briefing / end-of-day recap assembly
    autonomy.ts        event-driven detectors + live platform health checks
    approvals.ts       CEO decisions and honest execution
    connectors/        integration framework (Stripe, HubSpot, Slack, Gmail, Google Calendar,
                       Google Drive, Outlook, Microsoft Calendar, QuickBooks, Salesforce)
    data.ts            source-labelled business data access
worker/index.ts        background worker: jobs, schedules, stale-lock recovery
prisma/schema.prisma   multi-tenant schema
```

- **Game engine and AI are decoupled.** NPC animations only *reflect* agent state through realtime events. Long-running work never depends on a browser session or an animation.
- **Durable jobs.** Every assignment, scan, briefing, meeting turn, approval execution and sync is a row in `Job`. Failed jobs retry with exponential backoff, and jobs left by a crashed worker are requeued.
- **Autonomy.** Schedules run the CFO expense-variance scan, COO project-health scan, CTO live platform health check, CRO daily pipeline review, CMO campaign check, and the EA's morning briefing. A detector only opens a task when it finds something, and each finding is deduplicated per day.
- **Realtime.** Server-sent events (`/api/events`) use Redis pub/sub when `REDIS_URL` is set and fall back to DB polling when it isn't.
- **Interruptions.** Agents with high-priority news physically walk to the CEO, but only within your interruption setting (`all` / `important` / `critical` / `none`), never while you're in a conversation, and with a cooldown between visits.

### Security model

- Signed httpOnly session cookies. Every query is scoped by the session's `companyId`, and cross-tenant access returns 404 (covered by an e2e test).
- **Tool permissions are enforced server-side** in `runTool`. A denied call is logged to the agent's activity log.
- **High-impact actions always require approval:** `send_external_message`, `spend_money`, `delete_data`, `modify_system` and `launch_campaign` only create an `Approval`. After approval, execution goes through a connected integration if one exists. Otherwise the action is recorded honestly (for example, an email is saved as a draft). Executive HQ never moves money.
- **Prompt-injection defence:** inbox and document content is wrapped in `<untrusted_external_content>`, and agents' system prompts say only the CEO can instruct them. The demo inbox includes a phishing email that tries to make the AI wire money, and briefings flag it as suspicious.
- Integration credentials are encrypted with AES-256-GCM (`ENCRYPTION_KEY`). A connector is only marked connected after its credentials are verified against the provider. All CEO decisions, settings changes, hires and connections go to the audit log.

### Integrations

| Connector | Auth | What it does |
|---|---|---|
| Stripe | restricted API key | Monthly revenue + customers from charges |
| HubSpot | private app token | Deals pipeline |
| Slack | bot token | Posts approved messages |
| Gmail / Google Calendar / Google Drive | OAuth (`GOOGLE_CLIENT_ID/SECRET`) | Inbox triage, approved sending, meetings, file metadata |
| Outlook / Microsoft Calendar | OAuth (`MICROSOFT_CLIENT_ID/SECRET`) | Same, for Microsoft 365 |
| QuickBooks Online | OAuth | Monthly P&L |
| Salesforce | OAuth | Opportunities |

Set the OAuth redirect URI to `${APP_URL}/api/integrations/<provider>/callback`. The connectors were written against each provider's public API, but **none has been tested against a live account yet**. Validate one with a sandbox account before relying on it. Each connector is one object in `src/lib/connectors/index.ts`, so adding one is self-contained.

---

## Tests

```bash
npm test          # unit + integration (needs Postgres)
npm run test:e2e  # browser gameplay tests (needs the app + worker running on :3000, Playwright)
```

- `tests/core.test.ts`: map connectivity (every seat reachable by A\*), enclosed rooms, furniture placement rules, encryption, offline intent detection and routing.
- `tests/agents.test.ts`: runs the real Claude agent loop against a local mock of the Messages API. It covers the request shape (model, adaptive thinking, fallbacks), delegation through `create_task`, permission denial, high-impact actions becoming approvals, wrapping of untrusted inbox content, honest approval execution, and briefing quiet/active states.
- `tests/e2e.cjs`: the core success path. Signup → character → EA briefing → walk to the CFO → assign a forecast → leave → completion notification → open report → executive desk → decorate.
- `tests/e2e-features.cjs`: walk-and-talk, multi-agent meeting with notes, hiring, saving a furniture layout, end-of-day recap with next-day scheduling, meet-in-my-office, and tenant isolation.

## Known limitations

- With no `ANTHROPIC_API_KEY`, conversations are template-based. The Claude path is covered by the mock-API tests but has not run against the live API in this environment.
- Balance-sheet items beyond cash need QuickBooks; until then the Financial Command Center says so.
- Only the CEO suite has customisable furniture; other rooms use fixed layouts.

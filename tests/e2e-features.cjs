// Feature coverage: walk-and-talk, meet-in-office briefing, meetings, hiring, decor, EOD recap, tenant isolation.
const { chromium } = require("playwright");
const BASE = process.env.BASE_URL || "http://localhost:3000";
const SHOTS = __dirname + "/screens";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
(async () => {
  const b = await chromium.launch();
  const newUser = async (label) => {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
    const p = await ctx.newPage();
    p.on("pageerror", (e) => { failures++; console.log(`[${label}] pageerror: ${e.message}`); });
    await p.goto(`${BASE}/signup`);
    await p.fill("input >> nth=0", `CEO ${label}`); await p.fill("input >> nth=1", `${label} Corp`);
    await p.fill("input[type=email]", `${label}${Date.now()}@test.dev`); await p.fill("input[type=password]", "password123");
    await p.click("button:has-text('CREATE HEADQUARTERS')"); await p.waitForURL("**/onboarding", { timeout: 60000 });
    await p.click("button:has-text('NEXT')"); await p.click("button:has-text('ENTER THE OFFICE')"); await p.waitForURL("**/play", { timeout: 60000 });
    await p.waitForFunction(() => window.__hqBus, null, { timeout: 60000 });
    return p;
  };
  const step = async (name, fn) => { const t = Date.now(); try { await fn(); console.log(`✓ ${name} (${Date.now() - t} ms)`); } catch (e) { failures++; console.log(`✗ ${name}: ${e.message.split("\n")[0]}`); } };
  const walkTo = (p, x, y) => p.evaluate(([x, y]) => new Promise((res) => { const bus = window.__hqBus; const off = bus.on("e2e:arrived", () => { off(); res(); }); bus.emit("player:walkTo", { x, y, emit: "e2e:arrived" }); }), [x, y]);
  const pressE = async (p, sel) => { for (let i = 0; i < 30 && !(await p.locator(sel).count()); i++) { await p.keyboard.press("e"); await sleep(600); } await p.waitForSelector(sel, { timeout: 5000 }); };

  const a = await newUser("alpha");
  let reportId = null;
  await step("walk with me: EA follows and chat persists across rooms", async () => {
    await a.waitForSelector("[data-testid=briefing-greeting]", { timeout: 60000 });
    await a.click("button:has-text('WALK WITH ME')");
    await a.waitForSelector("[data-testid=walk-talk]");
    await walkTo(a, 30, 28);
    await a.fill("[data-testid=ea-chat-input]", "Have the CMO draft a CPA referral partner campaign.");
    await a.keyboard.press("Enter");
    await a.waitForSelector("[data-testid=toast]:has-text('Assignment created')", { timeout: 60000 });
    await a.keyboard.press("Escape");
    await walkTo(a, 40, 20); await sleep(2500);
    const dist = await a.evaluate(() => { const s = window.__hq.scene.getScene("office"); const ea = [...s.npcs.values()].find((n) => n.agent.key === "ea"); return Math.hypot(ea.sprite.x - s.player.x, ea.sprite.y - s.player.y); });
    if (dist > 80) throw new Error(`EA is ${Math.round(dist)}px away — not following`);
    await a.screenshot({ path: `${SHOTS}/30-walk-and-talk.png` });
    if (!(await a.locator("[data-testid=walk-talk]").innerText()).includes("CPA")) throw new Error("conversation not persisted in panel");
    await a.click("[data-testid=walk-talk] button:has-text('END')");
  });
  await step("conference meeting with CFO, COO, CRO → notes + action items", async () => {
    await walkTo(a, 29, 23); await sleep(300);
    await pressE(a, "text=CALL A MEETING");
    await a.click("button:has-text('BRING THEM TO THE CONFERENCE ROOM')");
    await a.waitForSelector("[data-testid=meeting]");
    await a.waitForFunction(() => document.querySelectorAll("[data-testid=meeting] p.whitespace-pre-wrap").length >= 4, null, { timeout: 90000 });
    await sleep(6000); await a.screenshot({ path: `${SHOTS}/31-meeting.png` });
    await a.click("button:has-text('END MEETING')");
    await a.waitForSelector("[data-testid=report-view]:has-text('Meeting notes')", { timeout: 90000 });
    await a.screenshot({ path: `${SHOTS}/32-meeting-notes.png` });
    if (!(await a.locator("[data-testid=report-view]").innerText()).includes("Action items")) throw new Error("no action items");
    await a.keyboard.press("Escape");
  });
  if (process.env.ONLY_MEETING) { await b.close(); console.log(failures ? "FAIL" : "meeting ok"); process.exit(failures ? 1 : 0); }
  await step("hire a custom AI employee into a vacant office", async () => {
    await walkTo(a, 52, 16); await pressE(a, "text=HIRE AN AI EMPLOYEE");
    await a.fill("input[placeholder='e.g. Jamie']", "Jamie");
    await a.click("button:has-text('APPEARANCE')"); await a.click("button:has-text('RANDOMIZE')");
    await a.click("button:has-text('HIRE JAMIE')");
    await a.waitForSelector("[data-testid=toast]:has-text('Welcome aboard')", { timeout: 30000 });
    await sleep(1500);
    const has = await a.evaluate(() => [...window.__hq.scene.getScene("office").npcs.values()].some((n) => n.agent.name === "Jamie"));
    if (!has) throw new Error("new NPC not in world");
    await a.screenshot({ path: `${SHOTS}/33-hired.png` });
  });
  await step("decorate: place a plant and persist the layout", async () => {
    await walkTo(a, 32, 8); await sleep(500);
    await a.click("[data-testid=decorate]"); await a.waitForSelector("[data-testid=decor]");
    await a.click("[data-testid=decor] button[title='Potted plant']");
    const pt = await a.evaluate(() => { const s = window.__hq.scene.getScene("office"); const c = s.cameras.main; return { x: (36 * 16 + 8 - c.worldView.x) * c.zoom, y: (8 * 16 + 8 - c.worldView.y) * c.zoom }; });
    await a.mouse.move(pt.x, pt.y); await sleep(200); await a.mouse.click(pt.x, pt.y); await sleep(400);
    await a.screenshot({ path: `${SHOTS}/34-decor-placed.png` });
    await a.click("[data-testid=decor] button:has-text('SAVE')");
    await a.waitForSelector("[data-testid=toast]:has-text('layout saved')", { timeout: 15000 });
    const items = await a.evaluate(() => fetch("/api/furniture").then((r) => r.json()));
    if (!items.items.some((i) => i.itemType === "plant" && i.x === 36 && i.y === 8)) throw new Error("plant not persisted");
  });
  await step("end-of-day recap + instructions for tomorrow", async () => {
    await walkTo(a, 28, 40); await pressE(a, "[data-testid=eod]");
    await a.waitForFunction(() => document.querySelector("[data-testid=eod]")?.innerText.includes("Accomplished today"));
    await a.fill("[data-testid=eod] textarea", "Have the CFO prepare a cash-flow forecast.\nAsk the CRO to review stalled deals.");
    await a.click("button:has-text('SCHEDULE FOR TOMORROW')");
    await a.waitForSelector("[data-testid=eod] >> text=cash-flow", { timeout: 30000 });
    await a.screenshot({ path: `${SHOTS}/35-eod.png` });
    const tasks = await a.evaluate(() => fetch("/api/tasks").then((r) => r.json()));
    const t = tasks.tasks.find((x) => /cash-flow/i.test(x.title));
    if (!t || new Date(t.runAfter) <= new Date()) throw new Error("next-day task not scheduled for tomorrow");
    reportId = (await a.evaluate(() => fetch("/api/reports").then((r) => r.json()))).reports[0]?.id;
  });

  const c = await newUser("charlie");
  await step("let's meet in my office: both walk to the suite, then briefing opens", async () => {
    await c.waitForSelector("[data-testid=briefing-greeting]", { timeout: 60000 });
    await c.click("button:has-text('MEET IN MY OFFICE')");
    await c.waitForSelector("[data-testid=briefing-panel]", { timeout: 90000 });
    const room = await c.evaluate(() => window.__hq.scene.getScene("office").currentRoom);
    if (room !== "ceo") throw new Error(`player ended up in ${room}`);
    await c.screenshot({ path: `${SHOTS}/36-meet-in-office.png` });
  });
  await step("tenant isolation: another company cannot read alpha's report", async () => {
    const r = await c.evaluate((id) => fetch(`/api/reports/${id}`).then((x) => x.status), reportId);
    if (r !== 404) throw new Error(`expected 404, got ${r}`);
    const unauth = await (await fetch(`${BASE}/api/dashboard`)).status;
    if (unauth !== 401) throw new Error(`unauthenticated dashboard returned ${unauth}`);
  });
  await b.close();
  console.log(failures ? `${failures} FAILURE(S)` : "all feature checks passed");
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });

// End-to-end gameplay loop: signup → character → office → EA briefing → CFO task → notification → report → desk.
const { chromium } = require("playwright");
const BASE = process.env.BASE_URL || "http://localhost:3000";
const SHOTS = __dirname + "/screens";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
  const errs = [];
  p.on("pageerror", (e) => errs.push("pageerror: " + e.message));
  const step = async (name, fn) => { const t = Date.now(); await fn(); console.log(`✓ ${name} (${Date.now() - t} ms)`); };
  const shot = (n) => p.screenshot({ path: `${SHOTS}/${n}.png` });
  const walkTo = (x, y) => p.evaluate(([x, y]) => new Promise((res) => { const bus = window.__hqBus; const off = bus.on("e2e:arrived", () => { off(); res(); }); bus.emit("player:walkTo", { x, y, emit: "e2e:arrived" }); }), [x, y]);

  await step("signup", async () => {
    await p.goto(`${BASE}/signup`);
    await p.fill("input >> nth=0", "Dana Brooks"); await p.fill("input >> nth=1", "YouLinc");
    await p.fill("input[type=email]", `ceo${Date.now()}@test.dev`); await p.fill("input[type=password]", "password123");
    await p.click("button:has-text('CREATE HEADQUARTERS')"); await p.waitForURL("**/onboarding", { timeout: 60000 });
  });
  await step("character creation", async () => {
    await p.click("button:has-text('RANDOMIZE')"); await p.click("button:has-text('NEXT')");
    await p.fill("input >> nth=1", "YL"); await p.click("button:has-text('ENTER THE OFFICE')"); await p.waitForURL("**/play", { timeout: 60000 });
  });
  await step("office loads", async () => { await p.waitForFunction(() => window.__hqBus, null, { timeout: 60000 }); await sleep(1500); await shot("10-arrival"); console.log("  fps:", await p.evaluate(() => Math.round(window.__hq.loop.actualFps))); });
  await step("EA walks over and greets", async () => { await p.waitForSelector("[data-testid=briefing-greeting]", { timeout: 60000 }); await sleep(1500); await shot("11-ea-greeting"); });
  await step("full briefing + decision queue", async () => {
    await p.click("button:has-text('GIVE ME THE BRIEFING')"); await p.waitForSelector("[data-testid=briefing-panel]"); await sleep(500); await shot("12-briefing");
    const approve = p.locator("[data-testid=decision-queue] button:has-text('INTERVENE')").first();
    if (await approve.count()) { await approve.click(); await sleep(800); }
    await p.keyboard.press("Escape");
  });
  await step("walk to CFO office", async () => { await walkTo(4, 6); await sleep(400); await shot("13-cfo-office"); });
  let reportId;
  await step("talk to CFO and assign a task", async () => {
    // the CFO may be walking back to their desk; keep pressing E until the conversation opens
    for (let i = 0; i < 40 && !(await p.locator("[role=dialog][aria-label^='Conversation']").count()); i++) { await p.keyboard.press("e"); await sleep(750); }
    await p.waitForSelector("[role=dialog][aria-label^='Conversation with Morgan']"); await sleep(1500); await shot("14-cfo-dialogue");
    await p.fill("[role=dialog] input", "I need a revenue forecast for the next six months."); await p.keyboard.press("Enter");
    await p.waitForSelector("text=Assignment queued", { timeout: 120000 }); await sleep(1200); await shot("15-task-assigned");
    await p.click("[role=dialog] button[aria-label=Close]");
  });
  await step("leave the room; completion notification arrives", async () => {
    await walkTo(9, 13);
    await p.waitForSelector("[data-testid=toast]:has-text('completed')", { timeout: 180000 }); await shot("16-notification");
  });
  await step("review the generated report", async () => {
    await p.click("[data-testid=toast]:has-text('completed')"); await p.waitForSelector("[data-testid=report-view]"); await sleep(600); await shot("17-report");
    reportId = await p.locator("[data-testid=report-view] h2").first().innerText();
    await p.keyboard.press("Escape");
  });
  await step("return to the executive desk", async () => {
    await walkTo(32, 6); await sleep(300); await p.keyboard.press("e"); await p.waitForSelector("text=EXECUTIVE OS"); await sleep(1500); await shot("18-desk");
    await p.click("button:has-text('AI Workforce')"); await sleep(1200); await shot("19-workforce");
    await p.click("button:has-text('Assignments')"); await sleep(600); await shot("20-tasks");
    await p.keyboard.press("Escape");
  });
  await step("decorate the suite", async () => {
    await p.click("[data-testid=decorate]"); await p.waitForSelector("[data-testid=decor]"); await sleep(500); await shot("21-decor");
    await p.click("[data-testid=decor] button:has-text('CANCEL')");
  });
  console.log("report:", reportId);
  console.log(errs.length ? "PAGE ERRORS:\n" + errs.join("\n") : "no page errors");
  await b.close();
  if (errs.length) process.exit(1);
})().catch((e) => { console.error(e); process.exit(1); });

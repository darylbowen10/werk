// Executive HQ — browser demo entry. Runs the real game UI and server logic entirely in the page.
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { clearSession, handleApi, hasSession } from "./api";
import { startWorker } from "./worker";
import { hqEvents } from "./shim/realtime";
import { nav, currentRoute, go } from "./shim/next-navigation";
import { resetDemoStore } from "./shim/db";
import AuthForm from "@/components/AuthForm";
import Onboarding from "@/app/onboarding/page";
import GameShell from "@/components/game/GameShell";

// ---- route the app's fetch("/api/...") calls to the in-page API
const realFetch = window.fetch.bind(window);
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const path = url.startsWith("/") ? url : new URL(url).pathname.startsWith("/api/") && new URL(url).origin === location.origin ? new URL(url).pathname + new URL(url).search : "";
  if (!path.startsWith("/api/")) return realFetch(input, init);
  const res = await handleApi((init?.method ?? "GET").toUpperCase(), path, typeof init?.body === "string" ? init.body : undefined);
  return new Response(JSON.stringify(res.body), { status: res.status, headers: { "Content-Type": "application/json" } });
};

// ---- realtime: the game's EventSource("/api/events") listens to in-page events
class DemoEventSource extends EventTarget {
  readyState = 1; url: string; onerror: unknown = null; onmessage: unknown = null;
  private fwd = (e: Event) => this.dispatchEvent(new MessageEvent("hq", { data: JSON.stringify((e as CustomEvent).detail) }));
  constructor(url: string) { super(); this.url = url; hqEvents.addEventListener("hq", this.fwd); }
  close() { this.readyState = 2; hqEvents.removeEventListener("hq", this.fwd); }
}
(window as unknown as { EventSource: unknown }).EventSource = DemoEventSource;

startWorker();

function ClockedOut() {
  const [confirm, setConfirm] = useState(false);
  return (
    <main className="min-h-screen flex items-center justify-center p-6" style={{ background: "radial-gradient(circle at 50% 30%, #2b2140, #141019 70%)" }}>
      <div className="px-panel p-6 max-w-md w-full text-center space-y-4">
        <h1 className="pixel-title text-hq-gold text-sm leading-relaxed">YOU CLOCKED OUT</h1>
        <p className="text-xl">Your company is saved in this browser. Your AI team keeps working whenever this page is open.</p>
        <button className="px-btn px-btn-gold w-full" onClick={() => go("/play")}>CLOCK BACK IN</button>
        {!confirm ? <button className="px-btn w-full" onClick={() => setConfirm(true)}>START A NEW COMPANY</button>
          : <button className="px-btn px-btn-rose w-full" onClick={() => { resetDemoStore(); clearSession(); go("/signup"); }}>ERASE THIS COMPANY AND START OVER</button>}
      </div>
    </main>
  );
}

function App() {
  const [route, setRoute] = useState(hasSession() ? "/play" : "/signup");
  useEffect(() => { go(route); const f = () => setRoute(currentRoute); nav.addEventListener("change", f); return () => nav.removeEventListener("change", f); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (!hasSession()) return <AuthForm key={route} mode={route === "/login" ? "login" : "signup"} />;
  if (route === "/onboarding") return <Onboarding />;
  if (route === "/play") return <GameShell key="play" />;
  return <ClockedOut />;
}

createRoot(document.getElementById("root")!).render(<App />);

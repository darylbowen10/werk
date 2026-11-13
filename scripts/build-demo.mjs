// Builds the self-contained browser demo: dist-demo/index.html (game + in-page API + worker, no server).
import { build } from "esbuild";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const src = path.join(root, "src");
const shim = (f) => path.join(src, "demo/shim", f);
const SWAP = {
  [path.join(src, "lib/db")]: shim("db.ts"),
  [path.join(src, "lib/realtime")]: shim("realtime.ts"),
  [path.join(src, "lib/agents/llm")]: shim("llm.ts"),
  [path.join(src, "lib/connectors")]: shim("connectors.ts"),
  [path.join(src, "lib/connectors/index")]: shim("connectors.ts"),
};
const PKG = { "next/navigation": shim("next-navigation.ts"), "next/link": shim("next-link.tsx"), "@prisma/client": shim("prisma-client.ts") };

const swapPlugin = {
  name: "demo-swap",
  setup(b) {
    b.onResolve({ filter: /^(next\/navigation|next\/link|@prisma\/client)$/ }, (a) => ({ path: PKG[a.path] }));
    b.onResolve({ filter: /^ioredis$/ }, () => ({ path: "ioredis", namespace: "empty" }));
    b.onLoad({ filter: /.*/, namespace: "empty" }, () => ({ contents: "export default class {}", loader: "js" }));
    b.onResolve({ filter: /^(@\/|\.)/ }, (a) => {
      const abs = a.path.startsWith("@/") ? path.join(src, a.path.slice(2)) : path.resolve(a.resolveDir, a.path);
      const target = SWAP[abs.replace(/\.(ts|tsx)$/, "")];
      return target && !a.importer.includes("/demo/shim/") ? { path: target } : undefined;
    });
  },
};

const out = path.join(root, "dist-demo");
fs.mkdirSync(out, { recursive: true });
const result = await build({
  entryPoints: [path.join(src, "demo/main.tsx")], bundle: true, minify: true, format: "iife", platform: "browser", target: "es2020",
  jsx: "automatic", write: false, plugins: [swapPlugin], logLevel: "warning", legalComments: "none",
  define: { "process.env.NODE_ENV": '"production"', "process.env": "{}", global: "window" },
  alias: { "@": src },
});
const js = result.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");
execSync(`npx tailwindcss -i src/app/globals.css -o ${path.join(out, "demo.css")} --minify`, { cwd: root, stdio: "ignore" });
const css = fs.readFileSync(path.join(out, "demo.css"), "utf8");

const html = `<title>Executive HQ</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Press+Start+2P&family=VT323&family=Inter:wght@400;500;600;700&display=swap">
<style>
/* Single dark pixel-art look by design: the game world is always lit the same way. */
:root { --hq-ink: #141019; --hq-cream: #f7ecd5; color-scheme: dark; }
html, body { height: 100%; background: var(--hq-ink); color: var(--hq-cream); overflow: hidden; }
${css}
</style>
<div id="root"></div>
<script>${js}</script>
`;
fs.writeFileSync(path.join(out, "index.html"), html);
console.log(`dist-demo/index.html  ${(Buffer.byteLength(html) / 1024 / 1024).toFixed(2)} MB`);

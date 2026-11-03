// Minimal, safe markdown renderer (escapes HTML first) for agent reports.
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const inline = (s: string) => esc(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/(^|[^*])\*(?!\s)(.+?)\*/g, "$1<em>$2</em>").replace(/`([^`]+)`/g, "<code>$1</code>");

export function renderMarkdown(md: string) {
  const lines = md.replace(/\r/g, "").split("\n");
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (/^\s*$/.test(l)) { i++; continue; }
    if (/^#{1,6}\s/.test(l)) { const lvl = Math.min(3, Math.max(2, l.match(/^#+/)![0].length)); out.push(`<h${lvl}>${inline(l.replace(/^#+\s*/, ""))}</h${lvl}>`); i++; continue; }
    if (/^---+\s*$/.test(l)) { out.push("<hr/>"); i++; continue; }
    if (/^\s*\|/.test(l)) {
      const rows: string[][] = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) { const r = lines[i].trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim()); if (!r.every((c) => /^:?-{2,}:?$/.test(c))) rows.push(r); i++; }
      const [head, ...body] = rows;
      out.push(`<table><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join("")}</tr></thead><tbody>${body.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>`);
      continue;
    }
    if (/^\s*>/.test(l)) { const b: string[] = []; while (i < lines.length && /^\s*>/.test(lines[i])) b.push(lines[i++].replace(/^\s*>\s?/, "")); out.push(`<blockquote>${b.map(inline).join("<br/>")}</blockquote>`); continue; }
    if (/^\s*([-*]|\d+\.)\s/.test(l)) { const b: string[] = []; while (i < lines.length && /^\s*([-*]|\d+\.)\s/.test(lines[i])) b.push(lines[i++].replace(/^\s*([-*]|\d+\.)\s/, "")); out.push(`<ul>${b.map((x) => `<li>${inline(x)}</li>`).join("")}</ul>`); continue; }
    const p: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#|\||>|\s*[-*]\s|---)/.test(lines[i])) p.push(lines[i++]);
    out.push(`<p>${p.map(inline).join("<br/>")}</p>`);
  }
  return out.join("\n");
}

export default function Markdown({ text, className = "" }: { text: string; className?: string }) {
  return <div className={`md ${className}`} dangerouslySetInnerHTML={{ __html: renderMarkdown(text) }} />;
}

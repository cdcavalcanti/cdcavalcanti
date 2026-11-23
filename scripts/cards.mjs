// Gera stats.svg e langs.svg (tema neon) contando repos privados. Uso: GH_TOKEN=... node scripts/cards.mjs
import { writeFileSync } from "node:fs";

const IGNORED = new Set(["HTML", "CSS"]);
const C = { bg: "#000", border: "#e4e2e2", title: "#00EAD3", text: "#FF449F", muted: "#9aa0a6" };
const FONT = "'Segoe UI', Ubuntu, 'Helvetica Neue', Sans-Serif";

async function gql(query) {
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { Authorization: `bearer ${process.env.GH_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const json = await res.json();
  if (json.errors || !json.data) throw new Error(JSON.stringify(json.errors ?? json));
  return json.data;
}

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const fmt = (n) => n.toLocaleString("pt-BR");

const { viewer } = await gql(`{ viewer {
  name login
  pullRequests { totalCount }
  repositories(first: 100, ownerAffiliations: OWNER, isFork: false) {
    totalCount
    nodes { languages(first: 10, orderBy: {field: SIZE, direction: DESC}) { edges { size node { name color } } } }
  }
} }`);

// Mesmo critério do include_all_commits do github-readme-stats: busca de commits por autor
async function countCommits(extra = "") {
  const r = await fetch(`https://api.github.com/search/commits?q=author:${viewer.login}${extra}&per_page=1`, {
    headers: { Authorization: `bearer ${process.env.GH_TOKEN}`, Accept: "application/vnd.github+json" },
  }).then((res) => res.json());
  if (r.total_count == null) throw new Error(JSON.stringify(r));
  return r.total_count;
}
const commits = await countCommits();
const lastYear = new Date(Date.now() - 365 * 864e5).toISOString().slice(0, 10);
const commitsYear = await countCommits(`+author-date:>${lastYear}`);

const langs = {};
for (const repo of viewer.repositories.nodes)
  for (const { size, node } of repo.languages.edges) {
    if (IGNORED.has(node.name)) continue;
    langs[node.name] ??= { size: 0, color: node.color ?? "#858585" };
    langs[node.name].size += size;
  }
const total = Object.values(langs).reduce((s, l) => s + l.size, 0);
const top = Object.entries(langs).sort((a, b) => b[1].size - a[1].size).slice(0, 6)
  .map(([name, l]) => ({ name, color: l.color, pct: (l.size / total) * 100 }));

const card = (w, h, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
<style>text{font-family:${FONT}} .t{font-size:20px;font-weight:600;fill:${C.title}} .l{font-size:14px;font-weight:600;fill:${C.text}} .v{font-size:14px;font-weight:700;fill:${C.title}} .p{font-size:12px;fill:${C.muted}}</style>
<rect x="0.5" y="0.5" rx="6" width="${w - 1}" height="${h - 1}" fill="${C.bg}" stroke="${C.border}"/>
${body}
</svg>`;

const rows = [
  ["Total de commits", commits],
  ["Commits no último ano", commitsYear],
  ["Pull requests", viewer.pullRequests.totalCount],
  ["Repositórios", viewer.repositories.totalCount],
];
const stats = card(400, 70 + rows.length * 28, `<text x="25" y="38" class="t">Estatísticas do ${esc(viewer.name.split(" ")[0])}</text>
${rows.map(([label, v], i) => `<circle cx="31" cy="${70 + i * 28}" r="4" fill="${C.title}"/><text x="45" y="${75 + i * 28}" class="l">${label}:</text><text x="375" y="${75 + i * 28}" class="v" text-anchor="end">${fmt(v)}</text>`).join("\n")}`);

let x = 25;
const bar = top.map((l) => {
  const w = (l.pct / top.reduce((s, t) => s + t.pct, 0)) * 300;
  const r = `<rect x="${x.toFixed(2)}" y="0" width="${w.toFixed(2)}" height="8" fill="${l.color}"/>`;
  x += w;
  return r;
}).join("");
const list = top.map((l, i) => {
  const cx = 25 + (i % 2) * 155, cy = 105 + Math.floor(i / 2) * 26;
  return `<circle cx="${cx + 5}" cy="${cy - 4}" r="5" fill="${l.color}"/><text x="${cx + 16}" y="${cy}" class="l">${esc(l.name)} <tspan class="p">${l.pct.toFixed(1)}%</tspan></text>`;
}).join("\n");
const langsSvg = card(350, 70 + rows.length * 28, `<text x="25" y="38" class="t">Linguagens mais usadas</text>
<clipPath id="b"><rect x="25" y="0" width="300" height="8" rx="4"/></clipPath>
<g transform="translate(0,60)" clip-path="url(#b)">${bar}</g>
<g transform="translate(0,-10)">${list}</g>`);

writeFileSync("stats.svg", stats);
writeFileSync("langs.svg", langsSvg);
console.log({ commits, langs: top.map((l) => `${l.name} ${l.pct.toFixed(1)}%`) });

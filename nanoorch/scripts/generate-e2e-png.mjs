import sharp from "sharp";
import { writeFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT = path.join(__dirname, "../nanoorch-e2e-flow.png");

const W = 1600;
const SIDE = 300;
const MAIN = W - SIDE - 16;
const PAD = 20;

// ── colour palette ─────────────────────────────────────────────────────────
const BG       = "#0f172a";
const PANEL    = "#1e293b";
const BORDER   = "#334155";
const TEXT_LG  = "#f1f5f9";
const TEXT_SM  = "#94a3b8";
const TEXT_XS  = "#64748b";
const ACCENT   = "#3b82f6";

// layer accent colours
const layers = [
  { num:"1", label:"Trigger Sources",       bg:"#1e3a5f", border:"#3b82f6", head:"#3b82f6",
    items:["GitHub Webhook","GitLab Webhook","Manual API","Scheduled CRON","Merge-Request Event"] },
  { num:"2", label:"Intake Gateway",        bg:"#1a3a2a", border:"#22c55e", head:"#22c55e",
    items:["POST /api/webhooks/git","Auth & HMAC Verify","Dedup Cache (60s)","Repo Lookup","Agent Config Fetch"] },
  { num:"3", label:"Git Agent Engine",      bg:"#3a2a1a", border:"#f97316", head:"#f97316",
    items:["Parse .nanoorch.yml","Clone Repo (OAuth2)","Resolve Trigger Rules","Build Prompt Context","Inject into Task.input"] },
  { num:"4", label:"Task Queue",            bg:"#2a1a3a", border:"#a855f7", head:"#a855f7",
    items:["Task.status = queued","Priority Scheduling","Workspace Assignment","Agent Router","Run History Record"] },
  { num:"5", label:"Execution Layer",       bg:"#3a1a1a", border:"#ef4444", head:"#ef4444",
    items:["Sandbox Executor","Tool Call Handler","Memory Read/Write","Max-Steps Guard","Sub-Agent Spawner"] },
  { num:"6", label:"AI Providers",          bg:"#1a2a3a", border:"#06b6d4", head:"#06b6d4",
    items:["OpenAI (GPT-4o)","Anthropic (Claude)","Google (Gemini)","Provider Router","Token Usage Tracker"] },
  { num:"7", label:"Intelligence & Memory", bg:"#2a3a1a", border:"#84cc16", head:"#84cc16",
    items:["Vector Store","Conversation History","Knowledge Base","Contextual Recall","Learning Loop"] },
  { num:"8", label:"Outputs & Feedback",    bg:"#3a1a2a", border:"#ec4899", head:"#ec4899",
    items:["Task Result Store","Git PR Comment","Run Log Stream","Developer Feedback","Webhook Callback"] },
];

const sidebar = [
  { label:"Workspaces & Tenancy",  color:"#3b82f6",
    lines:["Multi-tenant isolation","Per-workspace secrets","Resource quotas"] },
  { label:"3-Tier RBAC",           color:"#22c55e",
    lines:["SystemAdmin / OrgAdmin","WorkspaceMember","Per-resource ACLs"] },
  { label:"Security",              color:"#f97316",
    lines:["AES-256 credentials","HMAC webhook verify","Scrypt key derivation"] },
  { label:"SSO & Auth",            color:"#a855f7",
    lines:["Replit OAuth","Session management","JWT tokens"] },
  { label:"Data Layer",            color:"#06b6d4",
    lines:["PostgreSQL + Drizzle","Incremental migrations","JSONB config storage"] },
  { label:"Infrastructure",        color:"#ef4444",
    lines:["Docker sandbox exec","Git clone engine","Health-check endpoints"] },
  { label:"Channels",              color:"#84cc16",
    lines:["REST API","WebSocket stream","GitHub / GitLab OAuth"] },
];

// ── helpers ─────────────────────────────────────────────────────────────────
const esc = (s) => s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");

function rect(x,y,w,h,fill,stroke,rx=8) {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>`;
}

function text(x,y,content,size,fill,anchor="start",weight="normal") {
  return `<text x="${x}" y="${y}" font-size="${size}" fill="${fill}" text-anchor="${anchor}" font-weight="${weight}" font-family="'Segoe UI',system-ui,sans-serif">${esc(content)}</text>`;
}

// ── layout ───────────────────────────────────────────────────────────────────
// Each layer row height
const LAYER_H = 130;
const LAYER_GAP = 12;
const TOP_OFFSET = 80; // header

const totalLayerH = layers.length * (LAYER_H + LAYER_GAP) - LAYER_GAP;
const CANVAS_H = TOP_OFFSET + totalLayerH + PAD * 2 + 60; // footer

let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${CANVAS_H}" viewBox="0 0 ${W} ${CANVAS_H}">
<defs>
  <style>
    text { font-family: 'Segoe UI', system-ui, sans-serif; }
  </style>
  <linearGradient id="topGrad" x1="0" y1="0" x2="${W}" y2="0" gradientUnits="userSpaceOnUse">
    <stop offset="0%" stop-color="#1e3a5f"/>
    <stop offset="100%" stop-color="#1a2a3a"/>
  </linearGradient>
</defs>
`;

// background
svg += `<rect width="${W}" height="${CANVAS_H}" fill="${BG}"/>`;

// ── header ────────────────────────────────────────────────────────────────────
svg += rect(0, 0, W, 64, "url(#topGrad)", "none", 0);
svg += text(PAD, 40, "NanoOrch", 26, "#f1f5f9", "start", "700");
svg += text(PAD + 148, 40, "— End-to-End Architecture Flow", 20, TEXT_SM, "start", "400");
svg += text(W - PAD, 40, "nanoorch.io", 13, TEXT_XS, "end", "400");

// ── sidebar ───────────────────────────────────────────────────────────────────
const SX = MAIN + PAD + 8;
const sideItemH = 88;
const sideGap = 10;

sidebar.forEach((s, i) => {
  const sy = TOP_OFFSET + PAD + i * (sideItemH + sideGap);
  svg += rect(SX, sy, SIDE - 8, sideItemH, PANEL, s.color, 8);
  // left accent bar
  svg += `<rect x="${SX}" y="${sy}" width="4" height="${sideItemH}" rx="4" fill="${s.color}"/>`;
  svg += text(SX + 14, sy + 20, s.label, 12, TEXT_LG, "start", "600");
  s.lines.forEach((ln, li) => {
    svg += text(SX + 14, sy + 36 + li * 16, `• ${ln}`, 10.5, TEXT_SM);
  });
});

// sidebar label
svg += text(SX + (SIDE-8)/2, TOP_OFFSET + PAD - 10, "Platform Services", 13, TEXT_XS, "middle", "500");

// ── layers ─────────────────────────────────────────────────────────────────────
layers.forEach((lyr, i) => {
  const ly = TOP_OFFSET + PAD + i * (LAYER_H + LAYER_GAP);

  // layer container
  svg += rect(PAD, ly, MAIN - PAD, LAYER_H, lyr.bg, lyr.border, 10);

  // number badge
  svg += `<circle cx="${PAD + 22}" cy="${ly + 24}" r="16" fill="${lyr.border}" opacity="0.2"/>`;
  svg += text(PAD + 22, ly + 29, lyr.num, 14, lyr.head, "middle", "700");

  // layer title
  svg += text(PAD + 46, ly + 28, lyr.label, 14, TEXT_LG, "start", "600");

  // horizontal rule
  svg += `<line x1="${PAD + 12}" y1="${ly + 42}" x2="${MAIN - PAD - 12}" y2="${ly + 42}" stroke="${lyr.border}" stroke-width="0.8" opacity="0.5"/>`;

  // item cards
  const cardW = Math.floor((MAIN - PAD - 24 - (lyr.items.length - 1) * 8) / lyr.items.length);
  lyr.items.forEach((item, j) => {
    const cx = PAD + 12 + j * (cardW + 8);
    const cy = ly + 52;
    const ch = LAYER_H - 62;
    svg += rect(cx, cy, cardW, ch, `${lyr.bg}dd`, lyr.border, 6);
    // dot
    svg += `<circle cx="${cx + 10}" cy="${cy + ch/2}" r="3" fill="${lyr.head}" opacity="0.8"/>`;
    // wrap text if long
    const words = item.split(" ");
    if (words.length <= 2 || item.length <= 14) {
      svg += text(cx + 20, cy + ch/2 + 4, item, 10.5, TEXT_LG);
    } else {
      const mid = Math.ceil(words.length / 2);
      svg += text(cx + 20, cy + ch/2 - 5, words.slice(0, mid).join(" "), 10, TEXT_LG);
      svg += text(cx + 20, cy + ch/2 + 9, words.slice(mid).join(" "), 10, TEXT_LG);
    }
  });
});

// ── footer ─────────────────────────────────────────────────────────────────────
const fy = CANVAS_H - 36;
svg += `<rect x="0" y="${fy - 10}" width="${W}" height="46" fill="#0f172a"/>`;
svg += `<line x1="0" y1="${fy - 10}" x2="${W}" y2="${fy - 10}" stroke="${BORDER}" stroke-width="1"/>`;
svg += text(PAD, fy + 12, "NanoOrch · Self-hosted AI Agent Orchestrator", 11, TEXT_XS);
svg += text(W - PAD, fy + 12, "Self-hosted · Multi-tenant · 3-tier RBAC · Git Agents · Developer Feedback Loop", 11, TEXT_XS, "end");

svg += `</svg>`;

// ── write SVG, convert to PNG ──────────────────────────────────────────────────
const svgPath = path.join(__dirname, "../nanoorch-e2e-flow.svg");
writeFileSync(svgPath, svg);
console.log(`SVG written: ${svgPath} (${Math.round(svg.length / 1024)}KB)`);

await sharp(Buffer.from(svg), { density: 144 })
  .png({ compressionLevel: 6 })
  .toFile(OUTPUT);

const { size } = await import("fs").then(m => m.promises.stat(OUTPUT));
console.log(`PNG saved: ${OUTPUT} (${Math.round(size / 1024)}KB)`);

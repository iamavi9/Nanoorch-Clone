import PptxGenJS from "pptxgenjs";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, "..", "client", "public", "NanoOrch-Architecture.pptx");

const prs = new PptxGenJS();
prs.layout = "LAYOUT_WIDE"; // 13.33 x 7.5 in

// ── Brand colours ─────────────────────────────────────────────────────────────
const BG_DARK   = "0A0E1A";
const BG_CARD   = "0D1324";
const BLUE      = "3B82F6";
const BLUE_LITE = "93C5FD";
const VIOLET    = "8B5CF6";
const CYAN      = "06B6D4";
const EMERALD   = "10B981";
const ORANGE    = "F97316";
const PINK      = "EC4899";
const YELLOW    = "EAB308";
const WHITE     = "FFFFFF";
const GREY      = "94A3B8";
const ACCENT    = "60A5FA";  // blue-400

// ── Helpers ───────────────────────────────────────────────────────────────────
const W = 13.33, H = 7.5;

function darkSlide(slide) {
  slide.addShape(prs.ShapeType.rect, { x: 0, y: 0, w: W, h: H, fill: { color: BG_DARK } });
}

function sectionHeader(slide, label, color, x, y, w) {
  slide.addText(label.toUpperCase(), {
    x, y, w, h: 0.22,
    fontSize: 7, bold: true, color,
    charSpacing: 3,
  });
}

function pill(slide, text, x, y, w, h, bg, textColor) {
  slide.addShape(prs.ShapeType.roundRect, {
    x, y, w, h,
    fill: { color: bg },
    line: { color: bg, width: 0 },
    rectRadius: 0.07,
  });
  slide.addText(text, {
    x, y, w, h,
    fontSize: 8, bold: true, color: textColor,
    align: "center", valign: "middle",
  });
}

function chip(slide, label, sub, x, y, w, color, bgColor) {
  const h = sub ? 0.42 : 0.30;
  slide.addShape(prs.ShapeType.roundRect, {
    x, y, w, h,
    fill: { color: bgColor },
    line: { color: color, width: 0.5 },
    rectRadius: 0.06,
  });
  if (sub) {
    slide.addText([
      { text: label + "\n", options: { fontSize: 7.5, bold: true, color: WHITE } },
      { text: sub,          options: { fontSize: 6,   bold: false, color: GREY } },
    ], { x: x + 0.08, y: y + 0.03, w: w - 0.1, h });
  } else {
    slide.addText(label, {
      x: x + 0.08, y, w: w - 0.1, h,
      fontSize: 7.5, bold: true, color: WHITE, valign: "middle",
    });
  }
}

function arrow(slide, x1, y1, x2, y2) {
  slide.addShape(prs.ShapeType.line, {
    x: x1, y: y1, w: x2 - x1, h: y2 - y1,
    line: { color: "334155", width: 1, endArrowType: "open" },
  });
}

function boxOutline(slide, x, y, w, h, color) {
  slide.addShape(prs.ShapeType.roundRect, {
    x, y, w, h,
    fill: { color: "0D1728" },
    line: { color, width: 0.6 },
    rectRadius: 0.1,
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// SLIDE 1 — TITLE
// ═══════════════════════════════════════════════════════════════════════════════
const s1 = prs.addSlide();
darkSlide(s1);

// gradient accent bar
s1.addShape(prs.ShapeType.rect, {
  x: 0, y: 3.25, w: W, h: 0.06,
  fill: { type: "gradient", stops: [{ position: 0, color: VIOLET }, { position: 50, color: BLUE }, { position: 100, color: CYAN }] },
});

s1.addText("NanoOrch", {
  x: 0, y: 1.6, w: W, h: 1.2,
  fontSize: 72, bold: true, color: WHITE, align: "center", valign: "middle",
  glow: { size: 20, opacity: 0.4, color: BLUE },
});
s1.addText("Enterprise AI Agent Orchestration Platform", {
  x: 0, y: 2.85, w: W, h: 0.4,
  fontSize: 18, bold: false, color: ACCENT, align: "center",
  charSpacing: 1,
});
s1.addText("Architecture Overview  ·  C-Suite Executive Brief", {
  x: 0, y: 3.4, w: W, h: 0.35,
  fontSize: 12, color: GREY, align: "center",
});

// tag line
const tags = ["Multi-Tenant", "3-Tier RBAC", "SSO/SAML", "Pipeline/DAG", "Observability"];
const tagW = 1.5, tagGap = 0.18;
const totalTagW = tags.length * tagW + (tags.length - 1) * tagGap;
let tx = (W - totalTagW) / 2;
for (const t of tags) {
  pill(s1, t, tx, 4.05, tagW, 0.28, "1E3A5F", ACCENT);
  tx += tagW + tagGap;
}

s1.addText("Confidential — Internal Use Only", {
  x: 0, y: H - 0.35, w: W, h: 0.3,
  fontSize: 8, color: "334155", align: "center",
});

// ═══════════════════════════════════════════════════════════════════════════════
// SLIDE 2 — EXECUTIVE SUMMARY
// ═══════════════════════════════════════════════════════════════════════════════
const s2 = prs.addSlide();
darkSlide(s2);

s2.addText("Executive Summary", {
  x: 0.5, y: 0.3, w: 8, h: 0.5,
  fontSize: 26, bold: true, color: WHITE,
});
s2.addShape(prs.ShapeType.rect, {
  x: 0.5, y: 0.82, w: 2.2, h: 0.04,
  fill: { color: BLUE },
});

const bullets = [
  ["Self-Hosted & Sovereign",    "Runs entirely on your infrastructure — no data leaves your environment."],
  ["Multi-Tenant Workspaces",    "Isolated workspaces with per-tenant resource limits and membership controls."],
  ["3-Tier RBAC",                "Super Admin · Workspace Admin · Member with granular permissions."],
  ["Enterprise SSO",             "OIDC and SAML 2.0 support for seamless identity provider integration."],
  ["Pipeline / DAG Chaining",    "Multi-step AI agent workflows with dependency graphs and parallel execution."],
  ["Two-Way Messaging",          "Bi-directional Slack, Microsoft Teams, and Google Chat integration."],
  ["Full Observability",         "Token usage, cost tracking, utilization alerts, and audit logs per workspace."],
  ["Cloud Integrations",         "Native connectors for AWS, GCP, Azure, GitHub, GitLab, and Jira."],
];

let by = 1.1;
for (const [title, desc] of bullets) {
  s2.addShape(prs.ShapeType.roundRect, {
    x: 0.5, y: by, w: 12.3, h: 0.52,
    fill: { color: "0D1728" },
    line: { color: "1E3A5F", width: 0.5 },
    rectRadius: 0.06,
  });
  s2.addText([
    { text: title + "  ", options: { bold: true, color: ACCENT, fontSize: 9 } },
    { text: desc,         options: { bold: false, color: GREY, fontSize: 9 } },
  ], { x: 0.7, y: by + 0.01, w: 12, h: 0.5, valign: "middle" });
  by += 0.58;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SLIDE 3 — SYSTEM ARCHITECTURE (DIAGRAM)
// ═══════════════════════════════════════════════════════════════════════════════
const s3 = prs.addSlide();
darkSlide(s3);

s3.addText("System Architecture", {
  x: 0.4, y: 0.18, w: 8, h: 0.38,
  fontSize: 20, bold: true, color: WHITE,
});
s3.addShape(prs.ShapeType.rect, {
  x: 0.4, y: 0.56, w: 1.8, h: 0.04,
  fill: { color: BLUE },
});

// Row 1: Access & Identity
boxOutline(s3, 0.4, 0.7, 12.5, 0.72, VIOLET);
sectionHeader(s3, "Access & Identity", "A855F7", 0.55, 0.72, 3);
const accessChips = [
  ["Web Browser", "React + Vite SPA"],
  ["SSO", "OIDC + SAML"],
  ["3-Tier RBAC", "Super/Admin/Member"],
  ["API Gateway", "Session · CSRF · Rate Limits"],
];
let ax = 0.55;
for (const [l, s] of accessChips) {
  chip(s3, l, s, ax, 0.95, 2.85, "A855F7", "1E1340");
  ax += 3.1;
}

// Arrow down
arrow(s3, 6.66, 1.42, 6.66, 1.58);

// Row 2: 3 columns
const col1x = 0.4, col2x = 4.7, col3x = 8.95;
const colW  = 4.15, row2y = 1.6, row2h = 2.42;

// Orchestration Engine
boxOutline(s3, col1x, row2y, colW, row2h, BLUE);
sectionHeader(s3, "Orchestration Engine", "60A5FA", col1x + 0.15, row2y + 0.04, 3.5);
const orchChips = [
  ["Task Executor",     "Parallel · Retry · Failover"],
  ["Pipeline / DAG",    "Multi-step chaining"],
  ["Cron Scheduler",    "Timezone-aware jobs"],
  ["Event Triggers",    "GitHub · GitLab · Jira"],
  ["Heartbeat Monitor", "Per-agent health checks"],
  ["Approval Gates",    "Human-in-the-loop"],
];
let oy = row2y + 0.30;
for (const [l, s] of orchChips) {
  chip(s3, l, s, col1x + 0.12, oy, colW - 0.24, BLUE, "0B1E3A");
  oy += 0.35;
}

// Multi-Tenant Workspaces
boxOutline(s3, col2x, row2y, colW, row2h, CYAN);
sectionHeader(s3, "Multi-Tenant Workspaces", "22D3EE", col2x + 0.15, row2y + 0.04, 3.5);
const wsChips = [
  ["Orchestrators",       "Provider · Model · Concurrency"],
  ["Agents",              "Instructions · Tools · Memory"],
  ["Workspace Members",   "Isolated per tenant"],
  ["Resource Limits",     "Orchestrators · Agents · Channels"],
  ["Observability",       "Token usage · Utilization alerts"],
  ["Channel Delivery",    "Task · Heartbeat · Pipeline · Job"],
];
let wy = row2y + 0.30;
for (const [l, s] of wsChips) {
  chip(s3, l, s, col2x + 0.12, wy, colW - 0.24, CYAN, "051E24");
  wy += 0.35;
}

// Right column — Messaging + Cloud
const msgH = 1.44, cloudH = 0.9;
boxOutline(s3, col3x, row2y, colW, msgH, EMERALD);
sectionHeader(s3, "Two-Way Messaging", "34D399", col3x + 0.15, row2y + 0.04, 3.5);
const msgChips = [["Slack", "Inbound + Outbound"], ["Microsoft Teams", "Inbound + Outbound"], ["Google Chat", "Inbound + Outbound"], ["Generic Webhook", "Outbound delivery"]];
let my = row2y + 0.30;
for (const [l, ss] of msgChips) {
  chip(s3, l, ss, col3x + 0.12, my, colW - 0.24, EMERALD, "051E14");
  my += 0.27;
}

boxOutline(s3, col3x, row2y + msgH + 0.08, colW, cloudH, ORANGE);
sectionHeader(s3, "Cloud Integrations", "FB923C", col3x + 0.15, row2y + msgH + 0.12, 3.5);
const cloudTags = ["AWS", "GCP", "Azure", "GitHub", "GitLab", "Jira"];
let ctRow = 0, ctx = col3x + 0.12;
for (let i = 0; i < cloudTags.length; i++) {
  if (i === 3) { ctx = col3x + 0.12; ctRow = 1; }
  chip(s3, cloudTags[i], null, ctx, row2y + msgH + 0.35 + ctRow * 0.28, 1.27, ORANGE, "1E0D00");
  ctx += 1.38;
}

// Arrow down
arrow(s3, 6.66, 4.02, 6.66, 4.18);

// AI Providers
boxOutline(s3, 0.4, 4.2, 12.5, 0.6, PINK);
sectionHeader(s3, "AI Providers", "F472B6", 0.55, 4.22, 3);
const aiChips = [
  ["OpenAI", "GPT-4o · GPT-4o mini"],
  ["Anthropic", "Claude 3.5 Sonnet +"],
  ["Google Gemini", "Gemini 2.0 Flash +"],
  ["Ollama", "Self-hosted models"],
];
let aix = 0.55;
for (const [l, s] of aiChips) {
  chip(s3, l, s, aix, 4.42, 2.85, PINK, "1E0A14");
  aix += 3.0;
}
s3.addText("Failover: primary → fallback automatically", {
  x: 12.35 - 1.5, y: 4.52, w: 1.5, h: 0.3,
  fontSize: 6, color: GREY, italic: true, align: "right",
});

// Arrow down
arrow(s3, 6.66, 4.8, 6.66, 4.96);

// Data Layer
boxOutline(s3, 0.4, 4.98, 12.5, 0.62, YELLOW);
sectionHeader(s3, "Data Layer", "FDE047", 0.55, 5.0, 3);
const dataChips = [
  ["PostgreSQL",            "Primary data store · Migrations"],
  ["Token Usage & Cost",    "Per workspace · Per model"],
  ["Encrypted Credentials", "AES-256-GCM · Docker Secrets"],
  ["Audit Logs",            "Task logs · Delivery history"],
];
let dix = 0.55;
for (const [l, s] of dataChips) {
  chip(s3, l, s, dix, 5.2, 2.85, YELLOW, "1E1400");
  dix += 3.0;
}

s3.addText("Self-hosted · Docker · PostgreSQL · Express.js · React", {
  x: 0, y: H - 0.28, w: W, h: 0.25,
  fontSize: 7, color: "334155", align: "center",
});

// ═══════════════════════════════════════════════════════════════════════════════
// SLIDE 4 — ORCHESTRATION ENGINE
// ═══════════════════════════════════════════════════════════════════════════════
const s4 = prs.addSlide();
darkSlide(s4);

s4.addText("Orchestration Engine", {
  x: 0.5, y: 0.3, w: 9, h: 0.45, fontSize: 24, bold: true, color: WHITE,
});
s4.addShape(prs.ShapeType.rect, { x: 0.5, y: 0.77, w: 2.2, h: 0.04, fill: { color: BLUE } });

const orchCaps = [
  { title: "Task Executor",     color: BLUE,    desc: "Parallel execution with configurable concurrency limits per orchestrator. Automatic retry with exponential back-off (up to N retries). Failover to secondary AI provider on error." },
  { title: "Pipeline / DAG",    color: CYAN,    desc: "Multi-step agent chains with ordered steps. Output of each step is available as input to the next. Full run history and per-step status tracking." },
  { title: "Cron Scheduler",    color: VIOLET,  desc: "Timezone-aware cron expressions for recurring jobs. Per-job channel delivery notification on completion or failure." },
  { title: "Event Triggers",    color: ORANGE,  desc: "Webhook-driven triggers from GitHub, GitLab, and Jira. Filter on event type, branch, label, or project. Prompt templates with event payload interpolation." },
  { title: "Heartbeat Monitor", color: EMERALD, desc: "Periodic health-check tasks per agent. Configurable interval and silence phrase. Alerts dispatched to a designated delivery channel on anomaly." },
  { title: "Approval Gates",    color: PINK,    desc: "Human-in-the-loop control: tasks requiring approval are paused and queued for workspace admin review before execution resumes." },
];

let cy = 0.95;
for (let i = 0; i < orchCaps.length; i++) {
  const c = orchCaps[i];
  const col = i % 2 === 0 ? 0.5 : 6.9;
  if (i % 2 === 0 && i > 0) cy += 0.92;
  boxOutline(s4, col, cy, 6.2, 0.85, c.color);
  s4.addText(c.title, { x: col + 0.18, y: cy + 0.1, w: 5.8, h: 0.28, fontSize: 11, bold: true, color: WHITE });
  s4.addText(c.desc,  { x: col + 0.18, y: cy + 0.38, w: 5.8, h: 0.44, fontSize: 8, color: GREY, wrap: true });
}

// ═══════════════════════════════════════════════════════════════════════════════
// SLIDE 5 — ENTERPRISE & SECURITY
// ═══════════════════════════════════════════════════════════════════════════════
const s5 = prs.addSlide();
darkSlide(s5);

s5.addText("Enterprise & Security", {
  x: 0.5, y: 0.3, w: 9, h: 0.45, fontSize: 24, bold: true, color: WHITE,
});
s5.addShape(prs.ShapeType.rect, { x: 0.5, y: 0.77, w: 2.2, h: 0.04, fill: { color: VIOLET } });

const secFeatures = [
  { title: "SSO — OIDC + SAML 2.0",    color: VIOLET, desc: "Plug in any identity provider (Okta, Azure AD, Google Workspace, Keycloak). Automatic role mapping to workspace roles on first login." },
  { title: "3-Tier RBAC",              color: BLUE,   desc: "Super Admins manage platform-wide settings and all workspaces. Workspace Admins control members, orchestrators, and resource limits. Members can submit tasks and view results." },
  { title: "Credential Encryption",    color: CYAN,   desc: "All cloud integration credentials are encrypted at rest using AES-256-GCM with a key derived from SESSION_SECRET via scrypt. Docker Secrets support for production deployments." },
  { title: "Workspace Isolation",      color: EMERALD,desc: "Full data isolation between tenants. Resource quotas: max orchestrators, agents, channels, and scheduled jobs per workspace. Allowed AI provider and cloud provider allowlists." },
  { title: "Approval Workflow",        color: ORANGE, desc: "Any agent action flagged as requiring approval is held in a pending queue. Workspace admins receive a badge count alert and must explicitly approve or reject before execution." },
  { title: "Audit & Observability",    color: PINK,   desc: "Per-task logs at info/warn/error level. Channel delivery receipts with HTTP status and response body. Token usage and estimated cost tracked per workspace and per model." },
];

let sy = 0.95;
for (let i = 0; i < secFeatures.length; i++) {
  const f = secFeatures[i];
  const col = i % 2 === 0 ? 0.5 : 6.9;
  if (i % 2 === 0 && i > 0) sy += 0.92;
  boxOutline(s5, col, sy, 6.2, 0.85, f.color);
  s5.addText(f.title, { x: col + 0.18, y: sy + 0.1, w: 5.8, h: 0.28, fontSize: 11, bold: true, color: WHITE });
  s5.addText(f.desc,  { x: col + 0.18, y: sy + 0.38, w: 5.8, h: 0.44, fontSize: 8, color: GREY, wrap: true });
}

// ═══════════════════════════════════════════════════════════════════════════════
// SLIDE 6 — AI PROVIDERS & INTEGRATIONS
// ═══════════════════════════════════════════════════════════════════════════════
const s6 = prs.addSlide();
darkSlide(s6);

s6.addText("AI Providers & Cloud Integrations", {
  x: 0.5, y: 0.3, w: 11, h: 0.45, fontSize: 24, bold: true, color: WHITE,
});
s6.addShape(prs.ShapeType.rect, { x: 0.5, y: 0.77, w: 2.2, h: 0.04, fill: { color: PINK } });

// AI section
s6.addText("AI PROVIDERS", { x: 0.5, y: 1.0, w: 4, h: 0.22, fontSize: 8, bold: true, color: "F9A8D4", charSpacing: 3 });
const aiProviders = [
  ["OpenAI",         "GPT-4o, GPT-4o mini, o1, o3",             "Most capable general-purpose models. Streaming supported."],
  ["Anthropic",      "Claude 3.5 Sonnet, Claude 3 Haiku+",      "Strong reasoning. Tool-use and vision capable."],
  ["Google Gemini",  "Gemini 2.0 Flash, Gemini 1.5 Pro+",       "Multimodal support. Long context windows."],
  ["Ollama",         "Any locally hosted model",                 "Self-hosted for air-gapped or cost-sensitive deployments."],
];
let apy = 1.28;
for (const [name, models, note] of aiProviders) {
  boxOutline(s6, 0.5, apy, 5.9, 0.72, PINK);
  s6.addText(name,   { x: 0.68, y: apy + 0.08, w: 5.5, h: 0.22, fontSize: 10, bold: true, color: WHITE });
  s6.addText(models, { x: 0.68, y: apy + 0.29, w: 5.5, h: 0.18, fontSize: 7.5, bold: false, color: ACCENT });
  s6.addText(note,   { x: 0.68, y: apy + 0.47, w: 5.5, h: 0.18, fontSize: 7, color: GREY });
  apy += 0.8;
}

s6.addText("Automatic failover: if the primary provider returns an error, NanoOrch transparently retries with the configured fallback provider and model.", {
  x: 0.5, y: apy + 0.05, w: 5.9, h: 0.38, fontSize: 7.5, color: GREY, italic: true, wrap: true,
});

// Cloud integrations section
s6.addText("CLOUD & DEV INTEGRATIONS", { x: 7.0, y: 1.0, w: 5.5, h: 0.22, fontSize: 8, bold: true, color: "FDB47C", charSpacing: 3 });
const cloudIntgs = [
  ["AWS",    ORANGE, "EC2, S3, Lambda tool access via integrated credentials."],
  ["GCP",    ORANGE, "Cloud Run, GCS, BigQuery connectivity."],
  ["Azure",  ORANGE, "Azure Blob, Functions, and resource management."],
  ["GitHub", CYAN,   "Webhook triggers on push, PR, and issue events."],
  ["GitLab", CYAN,   "Webhook triggers on pipeline, MR, and push events."],
  ["Jira",   BLUE,   "Create/update issues, search, sprints, comments."],
];
let ciy = 1.28;
for (const [name, color, desc] of cloudIntgs) {
  boxOutline(s6, 7.0, ciy, 5.9, 0.6, color);
  s6.addText(name, { x: 7.18, y: ciy + 0.08, w: 5.5, h: 0.22, fontSize: 10, bold: true, color: WHITE });
  s6.addText(desc, { x: 7.18, y: ciy + 0.31, w: 5.5, h: 0.22, fontSize: 7.5, color: GREY });
  ciy += 0.68;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SLIDE 7 — DELIVERY & OBSERVABILITY
// ═══════════════════════════════════════════════════════════════════════════════
const s7 = prs.addSlide();
darkSlide(s7);

s7.addText("Delivery & Observability", {
  x: 0.5, y: 0.3, w: 9, h: 0.45, fontSize: 24, bold: true, color: WHITE,
});
s7.addShape(prs.ShapeType.rect, { x: 0.5, y: 0.77, w: 2.2, h: 0.04, fill: { color: EMERALD } });

// Messaging channels
s7.addText("TWO-WAY MESSAGING CHANNELS", { x: 0.5, y: 1.0, w: 6, h: 0.22, fontSize: 8, bold: true, color: "6EE7B7", charSpacing: 3 });
const channels = [
  ["Slack",            "Send task results, pipeline status, heartbeat alerts. Receive user prompts and route to an agent automatically."],
  ["Microsoft Teams",  "Webhook-based outbound delivery. Inbound message parsing routes to the assigned agent in the channel."],
  ["Google Chat",      "Space-based inbound and outbound. Verification token for security. Full two-way agent conversation support."],
  ["Generic Webhook",  "POST JSON payload to any HTTPS endpoint on task completion, pipeline finish, or scheduled job result."],
];
let chy = 1.28;
for (const [name, desc] of channels) {
  boxOutline(s7, 0.5, chy, 6.1, 0.82, EMERALD);
  s7.addText(name, { x: 0.68, y: chy + 0.1, w: 5.7, h: 0.22, fontSize: 10, bold: true, color: WHITE });
  s7.addText(desc, { x: 0.68, y: chy + 0.33, w: 5.7, h: 0.42, fontSize: 8, color: GREY, wrap: true });
  chy += 0.92;
}

// Observability
s7.addText("OBSERVABILITY", { x: 7.0, y: 1.0, w: 5.5, h: 0.22, fontSize: 8, bold: true, color: "FDE047", charSpacing: 3 });
const obsItems = [
  ["Token Usage Tracking",      YELLOW, "Input + output tokens logged per task, per agent, and per model with estimated USD cost."],
  ["Utilization Alerts",        YELLOW, "Configurable token threshold per workspace. Alert dispatched to a delivery channel when exceeded."],
  ["Task Audit Log",            YELLOW, "Full log of every task: status transitions, error messages, retries, and duration."],
  ["Channel Delivery Receipts", YELLOW, "HTTP status code and response body stored for every outbound channel delivery attempt."],
  ["Pipeline Run History",      YELLOW, "Per-step status, output, and timing stored for every pipeline run."],
];
let oby = 1.28;
for (const [name, color, desc] of obsItems) {
  boxOutline(s7, 7.0, oby, 5.9, 0.78, color);
  s7.addText(name, { x: 7.18, y: oby + 0.1, w: 5.5, h: 0.22, fontSize: 10, bold: true, color: WHITE });
  s7.addText(desc, { x: 7.18, y: oby + 0.33, w: 5.5, h: 0.38, fontSize: 8, color: GREY, wrap: true });
  oby += 0.88;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SLIDE 8 — CLOSING
// ═══════════════════════════════════════════════════════════════════════════════
const s8 = prs.addSlide();
darkSlide(s8);

s8.addShape(prs.ShapeType.rect, {
  x: 0, y: 2.8, w: W, h: 0.06,
  fill: { type: "gradient", stops: [{ position: 0, color: VIOLET }, { position: 50, color: BLUE }, { position: 100, color: CYAN }] },
});

s8.addText("Why NanoOrch?", {
  x: 0, y: 1.0, w: W, h: 0.7,
  fontSize: 36, bold: true, color: WHITE, align: "center",
});
s8.addText("The only self-hosted, multi-tenant AI agent orchestrator built for enterprise scale.", {
  x: 1, y: 1.75, w: W - 2, h: 0.5,
  fontSize: 14, color: ACCENT, align: "center",
});

const keyPoints = [
  "100% on-premises — full data sovereignty",
  "Extensible agent tooling via cloud integrations",
  "Human oversight via approval gates",
  "Real-time team collaboration via two-way messaging",
  "Built-in cost controls and utilization alerts",
];
let kpy = 3.15;
for (const kp of keyPoints) {
  s8.addShape(prs.ShapeType.ellipse, { x: 4.4, y: kpy + 0.08, w: 0.1, h: 0.1, fill: { color: BLUE } });
  s8.addText(kp, { x: 4.6, y: kpy, w: 4.4, h: 0.28, fontSize: 10, color: WHITE });
  kpy += 0.35;
}

s8.addText("Questions?  |  github.com/your-org/nanoorch", {
  x: 0, y: H - 0.4, w: W, h: 0.3,
  fontSize: 9, color: GREY, align: "center",
});

// ── Write file ────────────────────────────────────────────────────────────────
await prs.writeFile({ fileName: OUT });
console.log("✅  Saved:", OUT);

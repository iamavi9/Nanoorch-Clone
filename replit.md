# Workspace

## Overview

This workspace contains two things:
1. **NanoOrch** — the main project (cloned from GitHub, running on port 3000)
2. A pnpm workspace monorepo (pre-existing scaffold, used for supporting artifacts)

---

## NanoOrch — AI Agent Orchestrator Platform

NanoOrch is a self-hosted, multi-tenant AI agent orchestrator platform.

### Location
`/home/runner/workspace/nanoorch/`

### Running the App
The **NanoOrch** workflow runs it: `cd nanoorch && npm run dev`
- Listens on port **3000**
- Access via the webview / preview pane

### Stack
- **Backend**: Node.js + Express 5 + TypeScript
- **Frontend**: React + Vite + Wouter + TanStack Query + shadcn/ui + Tailwind CSS
- **Database**: PostgreSQL (Replit built-in) + Drizzle ORM
- **Auth**: Session-based (express-session) with 3-tier RBAC (global admin → workspace admin → member). Optional OIDC/SAML SSO.
- **AI Providers**: OpenAI, Anthropic, Gemini, Ollama, vLLM
- **Task Execution**: In-process (dev) or Docker-isolated ephemeral containers (prod)

### Key Environment Variables
- `DATABASE_URL` — Replit built-in PostgreSQL (set automatically)
- `SESSION_SECRET` — Already set in Replit Secrets
- `ADMIN_PASSWORD` — Set in Replit Secrets; used to seed the initial `admin` account
- `ADMIN_USERNAME` — `admin` (set as env var)
- `MIGRATIONS_DIR` — `/home/runner/workspace/nanoorch/migrations` (set as env var)
- `NODE_ENV` — `development`
- `PORT` — `3000`

### Key Commands (run from `nanoorch/` directory)
- `npm run dev` — start dev server (Express + Vite on port 3000)
- `npm run build` — production build
- `npm run db:push` — push DB schema (dev only)

### Project Structure
```
nanoorch/
├── client/         # React + Vite frontend
│   └── src/
│       ├── App.tsx          # Routes (wouter)
│       ├── components/      # UI components (shadcn/ui)
│       └── pages/           # Page components
├── server/         # Express backend
│   ├── index.ts             # Entry point
│   ├── routes.ts            # All REST routes + WebSocket
│   ├── storage.ts           # DrizzleStorage (IStorage interface)
│   ├── db.ts                # Drizzle + pg pool
│   ├── migrate.ts           # Migration runner
│   ├── engine/              # Task execution engine
│   ├── providers/           # AI provider adapters
│   ├── cloud/               # Cloud/DevTools integration tools
│   ├── comms/               # Slack/Teams/Google Chat handlers
│   └── mcp/                 # MCP server
├── shared/
│   └── schema.ts            # Drizzle table definitions + types
├── migrations/              # SQL migration files (0000–0004)
├── agent/                   # Docker image for agent containers
└── package.json
```

### First Login
- URL: port 3000 (via the preview pane)
- Username: `admin`
- Password: value of `ADMIN_PASSWORD` secret

### Architecture Notes
- Migration system: two-phase — SQL files first (`migrations/0000_*.sql` etc), then `INCREMENTAL_MIGRATIONS` in `server/migrate.ts`
- Credentials (cloud, vLLM) encrypted with AES-256-GCM; key derived from `SESSION_SECRET`
- Docker not available in Replit dev environment — tasks run in-process (LocalExecutor)

---

## Monorepo Scaffold (Supporting)

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

### Stack
- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9

### Key Commands
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)

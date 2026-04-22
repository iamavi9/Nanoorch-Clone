# NanoOrch — System Architecture

**Version:** Current (March 2026)
**Stack:** TypeScript · Node.js · Express · React · PostgreSQL · Drizzle ORM · Docker

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [High-Level Architecture Diagram](#2-high-level-architecture-diagram)
3. [Technology Stack](#3-technology-stack)
4. [Repository Layout](#4-repository-layout)
5. [Database Layer](#5-database-layer)
6. [Migration System](#6-migration-system)
7. [Server Bootstrap](#7-server-bootstrap)
8. [Authentication and Authorization](#8-authentication-and-authorization)
9. [SSO — OIDC and SAML 2.0](#9-sso--oidc-and-saml-20)
10. [AI Provider Abstraction](#10-ai-provider-abstraction)
11. [Task Execution Engine](#11-task-execution-engine)
12. [Docker Executor and Container Isolation](#12-docker-executor-and-container-isolation)
13. [Inference Proxy and Credential Isolation](#13-inference-proxy-and-credential-isolation)
14. [Sandbox Code Interpreter](#14-sandbox-code-interpreter)
15. [Cloud Integration Layer](#15-cloud-integration-layer)
16. [Tool System](#16-tool-system)
17. [Approval Gates](#17-approval-gates)
18. [Pipeline and DAG Executor](#18-pipeline-and-dag-executor)
19. [Cron Scheduler](#19-cron-scheduler)
20. [Comms System — Slack, Teams, and Google Chat](#20-comms-system--slack-teams-and-google-chat)
21. [Outbound Notification System](#21-outbound-notification-system)
22. [Event-Driven Triggers](#22-event-driven-triggers)
23. [Observability and Cost Tracking](#23-observability-and-cost-tracking)
24. [Workspace Resource Limits](#24-workspace-resource-limits)
25. [Real-Time Streaming](#25-real-time-streaming)
26. [Frontend Architecture](#26-frontend-architecture)
27. [Security Hardening](#27-security-hardening)
28. [Deployment Architecture](#28-deployment-architecture)
29. [Environment Variables Reference](#29-environment-variables-reference)
30. [REST API Surface](#30-rest-api-surface)
31. [Key Data Flows](#31-key-data-flows)
32. [MCP Server](#32-mcp-server)

---

## 1. System Overview

NanoOrch is a **self-hosted, multi-tenant AI agent orchestrator**. It lets teams create isolated workspaces, each containing one or more orchestrators backed by different AI providers. Within each orchestrator, named agents are given specific instructions, tool access, and memory. Users interact via a chat UI or REST API; tasks are executed asynchronously with real-time log streaming.

**Core capabilities at a glance:**

| Capability | Description |
|---|---|
| Multi-tenancy | Isolated workspaces per team or project |
| 3-tier RBAC | Global admin → workspace admin → member |
| SSO | OIDC (PKCE) and SAML 2.0 with auto-provisioning |
| AI providers | OpenAI, Anthropic, Gemini, Ollama, vLLM (self-hosted GPU) |
| Task execution | In-process (dev) or Docker-isolated ephemeral containers (prod) |
| Container runtimes | Docker runc (default), gVisor runsc (hardened) |
| Tool use | AWS, GCP, Azure, Jira, GitHub, GitLab, RAGFlow, Teams/Slack/Google Chat messaging, code interpreter, external PostgreSQL databases |
| Git Agents | Repo-driven automation via `.nanoorch.yml`; push/PR/MR event polling; AI feedback comments posted back to the PR/MR |
| Approval gates | Mid-task human sign-off with Slack/Teams interactive cards |
| Pipeline / DAG | Sequential multi-agent chaining with cron scheduling |
| Comms | Two-way Slack, Teams, and Google Chat inbound/outbound |
| Triggers | GitHub, GitLab, and Jira webhook event handlers |
| Observability | Token usage, cost estimation, per-agent breakdown |
| Security | gVisor isolation, seccomp profiles, AES-256-GCM credential encryption, inference proxy, Docker secrets |
| MCP Server | HTTP/SSE Model Context Protocol server — 8 tools, workspace-scoped API keys, remote AI client access |

---

## 2. High-Level Architecture Diagram

![NanoOrch System Architecture](./docs/nanoorch-architecture.png)

```mermaid
flowchart TB
    classDef clientCls  fill:#0d2137,stroke:#3b82f6,color:#e2e8f0
    classDef engineCls  fill:#0d2a1a,stroke:#22c55e,color:#e2e8f0
    classDef wsCls      fill:#1a0d2a,stroke:#a855f7,color:#e2e8f0
    classDef msgCls     fill:#2a0d0d,stroke:#ef4444,color:#e2e8f0
    classDef cloudCls   fill:#0d1a2a,stroke:#60a5fa,color:#e2e8f0
    classDef aiCls      fill:#2a2a0d,stroke:#eab308,color:#e2e8f0
    classDef dataCls    fill:#0d2a2a,stroke:#14b8a6,color:#e2e8f0
    classDef dockerCls  fill:#1a1a1a,stroke:#94a3b8,color:#e2e8f0

    %% ── ACCESS & IDENTITY ──────────────────────────────────────────────────
    subgraph ACCESS["🔐  Access & Identity"]
        direction LR
        WEB["Web Browser\nReact + Vite SPA"]
        SSO["SSO\nOIDC · SAML 2.0"]
        RBAC["3-Tier RBAC\nSuper Admin · WS Admin · Member"]
        GW["API Gateway\nSession Auth · CSRF · Rate Limits"]
        MCP["MCP Server /mcp\nHTTP/SSE · 8 workspace tools\n─\nAI Client (Claude Desktop)\nBearer API Key nano_mcp_..."]
    end

    ACCESS -->|"HTTPS  ·  REST + SSE"| ENGINE

    %% ── ORCHESTRATION ENGINE ───────────────────────────────────────────────
    subgraph ENGINE["⚡  Orchestration Engine"]
        direction LR
        EXEC["Task Executor\nParallel · Retry · Failover"]
        DAG["Pipeline / DAG\nMulti-step chaining"]
        CRON["Cron Scheduler\nTimezone-aware jobs"]
        TRIG["Event Triggers\nGitHub · GitLab · Jira webhooks"]
        HB["Heartbeat Monitor\nPer-agent health checks"]
        GATES["Approval Gates\nHuman-in-the-loop"]
    end

    ENGINE <-->|"dispatch / results"| WORKSPACES

    %% ── MULTI-TENANT WORKSPACES ────────────────────────────────────────────
    subgraph WORKSPACES["🏢  Multi-Tenant Workspaces"]
        direction LR
        ORCH["Orchestrators\nProvider · Model · Concurrency"]
        AGENTS["Agents\nInstructions · Tools · Memory"]
        MEMBERS["Workspace Members\nIsolated per tenant"]
        LIMITS["Resource Limits\nOrchestrators · Agents · Channels"]
        OBS["Observability\nToken usage · Utilization alerts"]
        CHAN["Channel Delivery\nTask · Heartbeat · Pipeline · Job"]
    end

    WORKSPACES <-->|"inbound / outbound"| MESSAGING
    WORKSPACES -->|"API calls"| CLOUD

    %% ── TWO-WAY MESSAGING ──────────────────────────────────────────────────
    subgraph MESSAGING["💬  Two-Way Messaging"]
        direction LR
        SLACK["Slack\nInbound + Outbound"]
        TEAMS["Microsoft Teams\nInbound + Outbound"]
        GCHAT["Google Chat\nInbound + Outbound"]
        HOOK["Generic Webhook\nOutbound delivery"]
    end

    %% ── CLOUD & DEVTOOLS ───────────────────────────────────────────────────
    subgraph CLOUD["☁️  Cloud & DevTools Integrations"]
        direction LR
        AWS["AWS"] & GCP["GCP"] & AZURE["Azure"]
        GH["GitHub"] & GL["GitLab"] & JR["Jira"]
    end

    %% ── AI PROVIDERS ───────────────────────────────────────────────────────
    ENGINE -->|"model inference"| AI

    subgraph AI["🧠  AI Providers  ·  Failover: primary → fallback automatically"]
        direction LR
        OPENAI["OpenAI\nGPT-4o · GPT-4o mini"]
        ANTHROPIC["Anthropic\nClaude 3.5 Sonnet+"]
        GEMINI["Google Gemini\nGemini 2.0 Flash+"]
        OLLAMA["Ollama\nSelf-hosted models"]
    end

    %% ── DATA LAYER ─────────────────────────────────────────────────────────
    ENGINE & WORKSPACES -->|"read / write  (Drizzle ORM)"| DATA

    subgraph DATA["🗄️  Data Layer"]
        direction LR
        PG["PostgreSQL 16\nPrimary data store · Migrations"]
        USAGE["Token Usage & Cost\nPer workspace · Per model"]
        CREDS["Encrypted Credentials\nAES-256-GCM · Docker Secrets"]
        LOGS["Audit Logs\nTask logs · Delivery history"]
    end

    %% ── DOCKER RUNTIME ─────────────────────────────────────────────────────
    ENGINE -->|"spawn containers"| DOCKER

    subgraph DOCKER["🐳  Docker Runtime  (optional · production)"]
        direction LR
        AGT["nanoorch-agent\nephemeral per-task containers"]
        SBX["nanoorch-sandbox\ngVisor runsc · code interpreter"]
    end

    %% ── STYLES ─────────────────────────────────────────────────────────────
    class WEB,SSO,RBAC,GW,MCP clientCls
    class EXEC,DAG,CRON,TRIG,HB,GATES engineCls
    class ORCH,AGENTS,MEMBERS,LIMITS,OBS,CHAN wsCls
    class SLACK,TEAMS,GCHAT,HOOK msgCls
    class AWS,GCP,AZURE,GH,GL,JR cloudCls
    class OPENAI,ANTHROPIC,GEMINI,OLLAMA aiCls
    class PG,USAGE,CREDS,LOGS dataCls
    class AGT,SBX dockerCls
```

---

## 3. Technology Stack

### Backend

| Component | Library / Tool | Version |
|---|---|---|
| Runtime | Node.js | 20 LTS |
| Language | TypeScript | 5.x |
| HTTP server | Express | 4.x |
| WebSocket | ws | 8.x |
| ORM | Drizzle ORM | latest |
| Query builder | drizzle-orm/pg-core | latest |
| Database driver | pg (node-postgres) | latest |
| Session store | connect-pg-simple (PostgreSQL, default) or connect-redis (Redis, when `REDIS_URL` set) | latest |
| Redis client | ioredis (with `makeNodeRedisCompat()` shim in `server/lib/redis.ts`) | latest |
| Password hashing | Node.js crypto (scrypt) | built-in |
| Encryption | Node.js crypto (AES-256-GCM) | built-in |
| Rate limiting | express-rate-limit | latest |
| OIDC | openid-client | v6 |
| SAML 2.0 | @node-saml/node-saml | latest |
| OpenAI SDK | openai | latest |
| Anthropic SDK | @anthropic-ai/sdk | latest |
| Gemini SDK | @google/generative-ai | latest |
| Cron | node-cron | latest |
| AWS SDK | @aws-sdk/client-s3, @aws-sdk/client-ec2, @aws-sdk/client-lambda, @aws-sdk/client-cloudwatch-logs | v3 |
| GCP SDK | @google-cloud/storage, @google-cloud/compute | latest |
| Azure SDK | @azure/arm-resources, @azure/arm-compute, @azure/arm-storage, @azure/identity | latest |
| Jira client | jira-client | latest |
| GitHub REST | @octokit/rest | latest |
| GitLab client | @gitbeaker/rest | latest |

### Frontend

| Component | Library | Version |
|---|---|---|
| UI framework | React | 18.x |
| Build tool | Vite | 5.x |
| Routing | wouter | latest |
| State / caching | TanStack Query (v5) | 5.x |
| Forms | react-hook-form + @hookform/resolvers/zod | latest |
| Validation | Zod | latest |
| Component library | shadcn/ui (Radix + Tailwind) | latest |
| Charts | Recharts | latest |
| Icons | lucide-react | latest |
| Theme | Tailwind CSS v3 with dark-mode class strategy | 3.x |

### Infrastructure

| Component | Technology |
|---|---|
| Database | PostgreSQL 16 (Alpine image) |
| Containerization | Docker + Docker Compose |
| Container runtime | runc (default) / gVisor runsc (optional) |
| Secrets management | Docker Swarm secrets via `_FILE` env-var pattern |
| Reverse proxy (optional) | Nginx (user-managed) |

---

## 4. Repository Layout

```
nanoorch/
├── agent/                         # Docker image source for agent task containers
│   ├── Dockerfile
│   ├── entrypoint.js              # Thin OpenAI-compatible inference agent
│   ├── sandbox/
│   │   └── Dockerfile             # Code interpreter sandbox image
│   └── seccomp/
│       └── nanoorch.json          # Hardened seccomp profile for containers
│
├── client/                        # React / Vite frontend
│   ├── index.html
│   └── src/
│       ├── App.tsx                # Route definitions (wouter)
│       ├── components/
│       │   ├── AppLayout.tsx      # Collapsible sidebar navigation, auth guard (localStorage-persisted collapse state)
│       │   ├── ThemeProvider.tsx  # Dark/light mode context
│       │   └── ui/                # shadcn/ui component library
│       ├── hooks/
│       │   └── use-toast.ts
│       ├── lib/
│       │   └── queryClient.ts     # TanStack Query client + apiRequest helper
│       └── pages/
│           ├── LoginPage.tsx
│           ├── WorkspacesPage.tsx
│           ├── WorkspaceDashboard.tsx
│           ├── OrchestratorPage.tsx
│           ├── AgentsPage.tsx
│           ├── TasksPage.tsx
│           ├── TaskDetailPage.tsx
│           ├── ChatPage.tsx
│           ├── ChannelsPage.tsx
│           ├── IntegrationsPage.tsx
│           ├── ScheduledJobsPage.tsx
│           ├── ApprovalsPage.tsx
│           ├── PipelinesPage.tsx
│           ├── ObservabilityPage.tsx
│           ├── MembersPage.tsx
│           ├── SSOPage.tsx
│           ├── TriggersPage.tsx
│           ├── MemberHomePage.tsx
│           ├── MemberChatPage.tsx
│           ├── McpPage.tsx
│           └── not-found.tsx
│
├── migrations/                    # Drizzle-generated initial SQL files
│   ├── 0000_initial.sql
│   ├── 0001_add_auth_intent_ragflow.sql
│   ├── 0002_add_ollama_provider.sql
│   ├── 0003_add_sandbox_timeout.sql
│   └── 0004_workspace_config.sql
│                                      # Incremental migrations (applied via INCREMENTAL_MIGRATIONS in migrate.ts):
│                                      #   add_vllm_provider_enum — adds 'vllm' to ai_provider enum
│                                      #   add_orchestrators_vllm_api_key — adds vllmApiKey column (encrypted)
│                                      #   cloud_provider_postgresql — adds 'postgresql' to cloud_provider enum + integration columns
│
├── secrets/                       # Docker secrets helper scripts
│   ├── create-secrets.sh          # Interactive secret-file generator
│   └── README.md
│
├── server/                        # Express backend
│   ├── index.ts                   # Entry point: migrations → routes → scheduler
│   ├── routes.ts                  # All REST routes and WebSocket server
│   ├── storage.ts                 # IStorage interface + DrizzleStorage implementation
│   ├── db.ts                      # Drizzle client + pg pool
│   ├── migrate.ts                 # INCREMENTAL_MIGRATIONS + SQL file runner
│   ├── static.ts                  # Static file serving (production)
│   ├── vite.ts                    # Vite dev server middleware (development)
│   │
│   ├── providers/                 # AI provider adapters
│   │   ├── index.ts               # Types and PROVIDER_MODELS registry
│   │   ├── openai.ts
│   │   ├── anthropic.ts
│   │   ├── gemini.ts
│   │   └── ollama.ts
│   │
│   ├── engine/                    # Execution engine
│   │   ├── queue.ts               # Task queue worker (poll loop, concurrency)
│   │   ├── executor.ts            # In-process task executor with tool loop
│   │   ├── docker-executor.ts     # Docker-isolated task executor
│   │   ├── pipeline-executor.ts   # Pipeline / DAG step runner
│   │   ├── sandbox-executor.ts    # Code interpreter sandbox
│   │   ├── scheduler.ts           # node-cron job registry
│   │   ├── notifier.ts            # Outbound channel dispatcher
│   │   └── emitter.ts             # EventEmitter for SSE log push
│   │
│   ├── cloud/                     # Cloud and DevTool integration layer
│   │   ├── tools.ts               # Tool definitions per provider (AWS, GCP, Azure, ...)
│   │   └── executor.ts            # Tool execution router
│   │
│   ├── mcp/
│   │   └── server.ts              # MCP server factory — 8 workspace-scoped tools (StreamableHTTPServerTransport)
│   │
│   ├── comms/                     # Two-way messaging adapters
│   │   ├── slack-handler.ts       # Slack Events API handler
│   │   ├── teams-handler.ts       # Microsoft Teams Bot Framework handler
│   │   ├── google-chat-handler.ts # Google Chat webhook handler
│   │   ├── comms-reply.ts         # Post reply back to Slack/Teams/Google Chat thread
│   │   └── approval-cards.ts      # Slack Block Kit + Teams Adaptive Card builders
│   │
│   ├── proxy/
│   │   └── inference-proxy.ts     # Inference proxy (strips real API keys from containers)
│   │
│   ├── lib/
│   │   ├── auth.ts                # Password hashing, session middleware, RBAC guards
│   │   ├── encryption.ts          # AES-256-GCM encrypt/decrypt for credentials
│   │   ├── secrets.ts             # _FILE env-var pattern reader
│   │   ├── sso.ts                 # OIDC and SAML 2.0 helpers
│   │   └── mountAllowlist.ts      # Tool argument sanitizer
│   │
│   └── replit_integrations/       # Replit-managed integration scaffolding
│
├── shared/
│   └── schema.ts                  # Drizzle table definitions, insert schemas, types
│
├── docker-compose.yml             # Standard deployment (env vars)
├── docker-compose.secrets.yml     # Hardened deployment (Docker secrets)
├── Dockerfile                     # Multi-stage app build
├── .env.example                   # Environment variable template
├── drizzle.config.ts              # Drizzle Kit configuration
└── vite.config.ts                 # Vite build configuration
```

---

## 5. Database Layer

### Connection

`server/db.ts` creates a `pg.Pool` and a Drizzle `db` client. Both are exported for direct use:
- `pool` — used by `connect-pg-simple` (session store) and raw SQL in `migrate.ts`
- `db` — used by `storage.ts` for all ORM queries

### Table Inventory

NanoOrch has **27 tables** across three creation mechanisms:

**Mechanism A — Drizzle SQL migration files** (`migrations/0000_initial.sql` through `0004_workspace_config.sql`):

| Table | Purpose |
|---|---|
| `users` | User accounts (local login or SSO-provisioned) |
| `workspaces` | Top-level multi-tenant containers |
| `workspace_members` | User-to-workspace assignments with role |
| `orchestrators` | AI engine configs per workspace |
| `agents` | Named agents per orchestrator |
| `channels` | Inbound API/webhook channels and outbound notification endpoints |
| `tasks` | Task queue entries |
| `task_logs` | Structured per-task log entries |
| `agent_memory` | Key/value persistent memory per agent |
| `cloud_integrations` | Encrypted external credentials per workspace |
| `chat_conversations` | Chat session containers per workspace |
| `chat_messages` | Individual chat messages (user and agent) |
| `workspace_config` | Per-workspace resource quotas and provider allow-lists |

**Mechanism B — INCREMENTAL_MIGRATIONS in `server/migrate.ts`** (applied idempotently at startup via the `_nanoorch_migrations` tracking table):

| Migration Name | Change |
|---|---|
| `add_ollama_provider_enum` | Adds `ollama` to the `provider` enum |
| `add_orchestrators_base_url` | Adds `base_url` column to `orchestrators` |
| `add_agents_sandbox_timeout_seconds` | Adds `sandbox_timeout_seconds` to `agents` |
| `add_integration_mode` | Adds `integration_mode` column to `cloud_integrations` |
| `add_cloud_provider_jira/github/gitlab/teams` | Extends the `cloud_provider` enum |
| `add_channel_type_slack/teams/google_chat/generic_webhook` | Extends the `channel_type` enum |
| `create_channel_deliveries` | Delivery history for outbound channels |
| `add_tasks_parent_task_id` | Parent-task linkage for subtask spawning |
| `create_scheduled_jobs` | Cron-based agent job definitions |
| `create_approval_requests` | Human approval gate records |
| `create_pipelines` | Sequential agent pipeline definitions |
| `create_pipeline_steps` | Individual steps within a pipeline |
| `create_pipeline_runs` | Per-execution run records for pipelines |
| `create_pipeline_step_runs` | Per-step execution records within a run |
| `create_token_usage` | Token consumption and cost records |
| `create_user_sessions` | `connect-pg-simple` session table |
| `add_tasks_comms_thread_id` | Thread linkage for comms tasks |
| `add_workspaces_is_comms_workspace` | Comms workspace flag |
| `create_comms_threads` | Per-thread state for Slack/Teams conversations |
| `add_orchestrators_failover` | `failover_provider` and `failover_model` columns |
| `add_tasks_bypass_retry` | `bypass_approval` and `retry_count` columns on tasks |
| `add_comms_threads_history` | Conversation history JSON on `comms_threads` |
| `create_sso_providers` | SSO provider configuration (OIDC/SAML) |
| `create_event_triggers` | Webhook event trigger definitions |
| `create_trigger_events` | Webhook delivery history per trigger |
| `create_mcp_api_keys` | Workspace-scoped API keys for MCP remote access |

**Mechanism C — Internal tracking table (not in Drizzle schema):**

| Table | Purpose |
|---|---|
| `_nanoorch_migrations` | Idempotency log for all incremental migrations |
| `user_sessions` | Express session storage (managed by `connect-pg-simple`) |

> **Critical:** `_nanoorch_migrations` and `user_sessions` are NOT in `shared/schema.ts`. Running `drizzle-kit push --force` would attempt to DROP them. Always use the INCREMENTAL_MIGRATIONS system for schema changes.

### Key Relationships

```
workspaces ──< workspace_members >── users
workspaces ──< workspace_config (1:1)
workspaces ──< orchestrators ──< agents
                              ──< channels ──< channel_deliveries
                              ──< tasks ──< task_logs
                                         └── token_usage
workspaces ──< cloud_integrations
workspaces ──< chat_conversations ──< chat_messages
workspaces ──< scheduled_jobs
workspaces ──< approval_requests
workspaces ──< pipelines ──< pipeline_steps
                           ──< pipeline_runs ──< pipeline_step_runs
workspaces ──< event_triggers ──< trigger_events
channels ──< comms_threads
agents ──< agent_memory
sso_providers  (global, not workspace-scoped)
```

### Primary Key Convention

All tables use UUID primary keys generated via PostgreSQL's `gen_random_uuid()`:

```typescript
id: varchar("id").primaryKey().default(sql`gen_random_uuid()`)
```

The only exceptions are `workspace_members`, `task_logs`, and `agent_memory`, which use `serial` integer primary keys.

---

## 6. Migration System

NanoOrch uses a two-phase idempotent migration system implemented in `server/migrate.ts`.

### Phase 1 — SQL File Runner

If the `MIGRATIONS_DIR` environment variable is set and the directory exists, `migrate.ts` reads all `.sql` files in alphabetical order and applies each one. Each file is tracked by a `file:<filename>` key in `_nanoorch_migrations`.

SQL files use `-->statement-breakpoint` as a delimiter between individual statements, allowing multi-statement migrations.

### Phase 2 — INCREMENTAL_MIGRATIONS Array

After file-based migrations, the server iterates through the `INCREMENTAL_MIGRATIONS` array. Each entry has a `name` and `sql`. Before executing, the name is checked against `_nanoorch_migrations`; if already present, it is skipped. After execution the name is recorded.

### Idempotency Error Handling

The following PostgreSQL error codes are treated as non-fatal (already applied):

| Code | Meaning |
|---|---|
| `42710` | `duplicate_object` — type or enum value already exists |
| `42P07` | `duplicate_table` — table already exists |
| `42701` | `duplicate_column` — column already exists |
| `42P16` | `invalid_table_definition` — constraint already exists |
| `23505` | `unique_violation` — harmless during seeding |
| `42704` | `undefined_object` — DROP of a non-existent object |

### Startup Sequence

```
process start
  └─► runMigrations()
        ├─► CREATE TABLE IF NOT EXISTS _nanoorch_migrations
        ├─► Apply SQL files from MIGRATIONS_DIR (if set)
        └─► Apply INCREMENTAL_MIGRATIONS (idempotent, skip if recorded)
  └─► registerRoutes()
  └─► startScheduler()
  └─► httpServer.listen()
```

---

## 7. Server Bootstrap

`server/index.ts` is the application entry point:

1. Creates an Express app and a Node.js `http.Server` (shared with WebSocket server)
2. Attaches `express.json()` with a `rawBody` capture hook (needed for HMAC webhook verification)
3. Attaches `express.urlencoded()`
4. Attaches a request logger middleware (logs all `/api/*` requests with method, path, status, duration)
5. Calls `runMigrations()` — blocks startup if migrations fail
6. Calls `registerRoutes(httpServer, app)` — mounts all Express routes and starts the WebSocket server
7. Calls `startScheduler()` — registers active cron jobs from the database
8. In development: sets up Vite middleware via `setupVite(httpServer, app)`
9. In production: serves the built frontend via `serveStatic(app)`
10. Listens on `process.env.PORT` (default: `5000`)

---

## 8. Authentication and Authorization

### Session Management

Sessions default to PostgreSQL via `connect-pg-simple`. When `REDIS_URL` is set, sessions use `connect-redis` backed by `ioredis`. Because connect-redis expects the node-redis v4 API and ioredis has a different calling convention, `server/lib/redis.ts` exports `makeNodeRedisCompat(ioredisClient)` — a compatibility shim that:

- Translates `SET key value {EX: n}` object-style options to positional `SET key value EX n` args
- Adds an `expire(key, ttl)` method required by connect-redis's `touch()` calls
- Exposes `get`, `del`, `scan`, and `mGet` pass-throughs

The same file exports `RedisRateLimitStore` (a custom express-rate-limit store backed by Redis) with a `public prefix` field to satisfy the `Store` interface.

The `user_sessions` table (PostgreSQL fallback path) is created by an INCREMENTAL_MIGRATION (not Drizzle-managed). Session configuration:

```
store:   connect-pg-simple (default) | connect-redis (when REDIS_URL is set)
secret:  SESSION_SECRET env var
name:    nanoorch_session
maxAge:  7 days
httpOnly: true
sameSite: lax
secure:  COOKIE_SECURE env var (true only behind HTTPS termination)
```

### Password Hashing

`server/lib/auth.ts` uses Node.js `crypto.scryptSync` with a random 16-byte salt:

```
hash = scryptSync(password, salt, 64)
stored = "<salt_hex>:<hash_hex>"
```

Verification uses `crypto.timingSafeEqual` to prevent timing attacks.

### RBAC — Three Tiers

| Tier | Storage | Guard |
|---|---|---|
| Global admin | `users.role = "admin"` | `requireAdmin` middleware |
| Workspace admin | `workspace_members.role = "admin"` | `requireWorkspaceAdmin` middleware |
| Member | `workspace_members.role = "member"` | `requireAuth` middleware |

`requireWorkspaceAdmin` allows access if the user is either a global admin OR a workspace admin for the target workspace (`req.params.id`). This avoids separate checks in every route handler.

### Rate Limiting

Three rate limiters are applied to different route groups:

| Limiter | Window | Max Requests | Applied To |
|---|---|---|---|
| `loginLimiter` | 15 minutes | 10 | `POST /api/auth/login` |
| `webhookLimiter` | 1 minute | 60 | `/api/webhooks/*` |
| `apiLimiter` | 1 minute | 300 | All `/api/*` (except SSE streams) |

### CSRF Protection

A per-session CSRF token is generated on login. All state-mutating requests must include `X-CSRF-Token` matching the session token. SSO callback routes (`/api/auth/sso/*`) are explicitly exempted because they are redirected from external identity providers.

---

## 9. SSO — OIDC and SAML 2.0

SSO providers are stored in the `sso_providers` table (global, not workspace-scoped). Only global admins can manage them via `GET/POST/PUT/DELETE /api/admin/sso-providers`.

### OIDC Flow (openid-client v6)

```
Client                  Server                      Identity Provider
  │                       │                               │
  │  GET /api/auth/sso/   │                               │
  │  oidc/:id/initiate    │                               │
  │──────────────────────►│  discovery(discoveryUrl)      │
  │                       │──────────────────────────────►│
  │                       │◄─────────── configuration ────│
  │                       │  randomState()                │
  │                       │  randomPKCECodeVerifier()     │
  │                       │  calculatePKCECodeChallenge() │
  │                       │  store state+verifier in sess │
  │◄── 302 Redirect ──────│  buildAuthorizationUrl(...)   │
  │                       │                               │
  │  User authenticates at IdP                            │
  │                       │                               │
  │  GET /api/auth/sso/   │                               │
  │  oidc/:id/callback    │                               │
  │  ?code=...&state=...  │                               │
  │──────────────────────►│  authorizationCodeGrant(...)  │
  │                       │──────────────────────────────►│
  │                       │◄────────── tokens ────────────│
  │                       │  fetchUserInfo()              │
  │                       │  upsert user by email         │
  │                       │  set session.userId           │
  │◄── 302 /workspaces ───│                               │
```

Parameters stored in the session during OIDC: `oidcState`, `oidcCodeVerifier`, `oidcProviderId`, `oidcRedirect`.

### SAML 2.0 Flow (@node-saml/node-saml)

```
Client                  Server (SP)              Identity Provider (IdP)
  │                       │                               │
  │  GET /api/auth/sso/   │                               │
  │  saml/:id/initiate    │                               │
  │──────────────────────►│  new SAML(config)             │
  │                       │  getAuthorizeUrlAsync()       │
  │◄── 302 Redirect ──────│                               │
  │                       │                               │
  │  User authenticates at IdP                            │
  │                       │                               │
  │  POST /api/auth/sso/  │                               │
  │  saml/:id/acs         │                               │
  │  (SAMLResponse)       │                               │
  │──────────────────────►│  validatePostResponseAsync()  │
  │                       │  extract email from assertion │
  │                       │  upsert user by email         │
  │                       │  set session.userId           │
  │◄── 302 /workspaces ───│                               │
```

SAML SP metadata is available at `GET /api/auth/sso/saml/:id/metadata`.

Parameters stored in the session during SAML: `samlProviderId`, `samlRedirect`.

### Callback URL Construction

The origin for callback and ACS URLs is resolved in priority order:

1. `process.env.APP_URL` (explicit — recommended for production)
2. `X-Forwarded-Proto` + `X-Forwarded-Host` headers (correct behind Nginx)
3. `req.protocol` + `req.hostname` (fallback for direct access)

### Auto-Provisioning

On a user's first SSO login, a new `users` row is created using the email from the identity provider token and the `defaultRole` configured on the SSO provider. On subsequent logins, the user is matched by email and no new account is created.

---

## 10. AI Provider Abstraction

`server/providers/index.ts` defines a provider-agnostic interface:

```typescript
interface RunAgentOptions {
  provider: "openai" | "anthropic" | "gemini" | "ollama";
  model: string;
  baseUrl?: string | null;      // for Ollama custom endpoints
  systemPrompt?: string | null;
  messages: ProviderMessage[];
  maxTokens?: number;
  temperature?: number;
  tools?: ToolDefinition[];
  onChunk?: (chunk: string) => void;
}

interface RunAgentResult {
  content: string;
  toolCalls?: ToolCall[];
  usage?: { inputTokens: number; outputTokens: number };
}
```

Each provider file implements the same contract:

| File | Provider | Notes |
|---|---|---|
| `openai.ts` | OpenAI | Streaming via `onChunk`; tools via function calling |
| `anthropic.ts` | Anthropic | Streaming via `onChunk`; tools via tool_use blocks |
| `gemini.ts` | Gemini | Google Generative AI SDK; tools via function calling |
| `ollama.ts` | Ollama | Local inference; OpenAI-compatible REST API; custom `baseUrl` |
| `vllm.ts` | vLLM | Self-hosted GPU cluster; OpenAI-compatible REST API; per-orchestrator encrypted API key; base URL appends `/v1` automatically |

### Available Models

| Provider | Models |
|---|---|
| OpenAI | gpt-4o, gpt-4o-mini, gpt-4-turbo |
| Anthropic | claude-opus-4-5, claude-sonnet-4-5, claude-haiku-4-5 |
| Gemini | gemini-2.5-pro, gemini-2.5-flash |
| Ollama | Any model served locally (free-text model name) |
| vLLM | Any model served by the vLLM inference server (free-text model name; e.g. `meta-llama/Llama-3-8b-instruct`) |

### Failover

Each orchestrator can define a `failoverProvider` and `failoverModel`. The executor wraps every primary `runAgent()` call:

```
try:
  runAgent(primary provider + model)
catch:
  if failoverProvider configured:
    log warn "failing over to <provider>/<model>"
    runAgent(failover provider + model)
  else:
    rethrow
```

---

## 11. Task Execution Engine

### Task States

```
pending → running → completed
                  → failed
```

### Queue Worker (`server/engine/queue.ts`)

A polling loop runs every 2 seconds:

1. Fetches all tasks with `status = "pending"` ordered by priority
2. For each task, checks the orchestrator's status (`active` vs `paused`)
3. Checks per-orchestrator concurrency: `maxConcurrency` (default 3) limits how many tasks run simultaneously per orchestrator
4. Dispatches eligible tasks to `executeTask()` asynchronously and tracks them in a `runningTasks` Set

### In-Process Executor (`server/engine/executor.ts`)

Used for `context` and `conversational` intents, or when Docker is not available:

1. Marks task as `running`, sets `startedAt`
2. Loads orchestrator and agent configuration
3. Loads cloud integration credentials for the workspace (decrypted)
4. If agent has memory enabled, prepends key/value memory to messages
5. Enters an **agentic tool loop** (up to `MAX_TOOL_ROUNDS = 10`):
   a. Calls `runAgentWithFailover()` with the current message list and available tool definitions
   b. Records token usage via `storage.logTokenUsage()`
   c. If the result contains tool calls, executes each tool:
      - `code_interpreter` → `runCode()` (sandbox)
      - `request_approval` → creates `approval_requests` row, emits SSE pause event, waits for approval
      - `spawn_agent` → recursively runs a subtask agent in parallel
      - cloud/DevTool tools → `executeCloudTool()`
   d. Appends tool results to messages and loops
   e. If no tool calls, the loop exits with the final text response
6. Marks task as `completed`, sets `completedAt` and `output`
7. If the task has a `commsThreadId`, dispatches a reply to Slack/Teams via `dispatchCommsReply()`
8. Dispatches `task.completed` or `task.failed` notifications via `dispatchNotification()`

### Intent Classification

Tasks carry an `intent` field that controls routing:

| Intent | Execution path |
|---|---|
| `action` | Docker executor (if available) or in-process executor |
| `context` | In-process executor (RAGFlow retrieval + AI) |
| `conversational` | In-process executor (AI only, no tools) |
| `code` | In-process executor with `code_interpreter` tool |

Intent is classified by the chat route using a lightweight keyword + AI-based classifier before the task is queued.

---

## 12. Docker Executor and Container Isolation

`server/engine/docker-executor.ts` handles tasks that run inside ephemeral Docker containers. Activated when `DOCKER_SOCKET` is set and the task intent is `action`.

### Container Lifecycle

```
1. issueTaskToken(taskId)            — generate short-lived proxy token
2. Load cloud credentials from DB   — decrypt, build tool list
3. docker run (per round):
   --rm                             — auto-delete on exit
   --memory 512m                    — OOM protection
   --cpus 0.5                       — CPU cap
   --network none                   — no outbound network from container
   --read-only                      — immutable filesystem
   --tmpfs /tmp                     — writable scratch space only
   --runtime runsc                  — gVisor (if AGENT_RUNTIME=runsc)
   --security-opt seccomp=<profile> — custom seccomp (if SECCOMP_PROFILE set)
   -e OPENAI_API_KEY=<task_token>   — token passed as all provider keys
   -e ANTHROPIC_API_KEY=<task_token>
   -e GEMINI_API_KEY=<task_token>
   nanoorch-agent:latest
4. Parse NDJSON events from container stdout:
   - text_delta  → stream to SSE
   - tool_call   → execute server-side, inject result back
   - done        → exit loop
5. revokeTaskToken(taskId)          — invalidate proxy token
```

### Tool Execution from Containers

When the container emits a `tool_call` event, the server:
1. Validates the tool name against the workspace's enabled tools
2. Sanitizes arguments via `sanitizeToolArgs()` (path traversal prevention)
3. Executes the tool in-process (credentials never leave the server)
4. Sends a `tool_result` back to the container via its stdin

This means the container only ever sees:
- The task prompt
- Tool definitions (names, parameter schemas)
- Tool results (plain text)

Real API keys, cloud credentials, and database connection strings are never passed to the container.

### Container Timeout

Containers are forcibly killed after `CONTAINER_TIMEOUT_MS = 180,000 ms` (3 minutes) if they have not exited.

### gVisor Integration

When `AGENT_RUNTIME=runsc`, Docker uses the gVisor `runsc` runtime for containers. gVisor intercepts all syscalls via a user-space kernel, providing hardware-level isolation beyond standard Linux namespaces. Similarly, `SANDBOX_RUNTIME=runsc` applies gVisor to code interpreter sandbox containers.

---

## 13. Inference Proxy and Credential Isolation

`server/proxy/inference-proxy.ts` runs as an Express router mounted at `/internal/proxy/:provider/*`.

### Problem it solves

Docker containers spawned for agent tasks need to make AI API calls. Passing real API keys as environment variables would make them visible in `docker inspect Env` and process environment dumps.

### Solution

```
Server issues task token (32 random hex bytes, 15-minute TTL)
    │
    ▼
Container receives task_token as OPENAI_API_KEY, ANTHROPIC_API_KEY, GEMINI_API_KEY
    │
    ▼
Container directs AI calls to DOCKER_PROXY_URL (default: http://host.docker.internal:<PORT>/internal/proxy) /<provider>/*
    │
    ▼
Proxy verifies token (in-memory Map, no DB round-trip)
Strips incoming Authorization / x-api-key header
Injects real provider key from server env vars
Forwards full request + streams response back
    │
    ▼
Token revoked in the finally block after task completion
```

### Token Store

Two in-memory Maps:
- `byToken: Map<string, { taskId, expiresAt }>` — lookup by token
- `byTask: Map<string, string>` — lookup by task ID for revocation

TTL is enforced lazily on lookup. Tokens older than 15 minutes are automatically invalidated even if not explicitly revoked.

---

## 14. Sandbox Code Interpreter

`server/engine/sandbox-executor.ts` handles the `code_interpreter` tool.

### Languages Supported

Python, JavaScript, Bash, Ruby, R, Go, Java

### Execution Model

```
In-process (DOCKER_SOCKET not set):
  child_process.exec() with timeout — no isolation

Docker sandbox (DOCKER_SOCKET set):
  docker run nanoorch-sandbox:latest
  --rm --network none --read-only --tmpfs /tmp
  --runtime runsc (if SANDBOX_RUNTIME=runsc)
  --security-opt seccomp=<profile> (if SECCOMP_PROFILE set)
  Stdin: code string + language
  Stdout: execution result (truncated to 10 KB)
  Timeout: agent.sandboxTimeoutSeconds (default: orchestrator default)
```

The sandbox image has no network access and no persistent filesystem. Each execution is a fresh container that is removed immediately after exit.

---

## 15. Cloud Integration Layer

`server/cloud/executor.ts` routes tool calls to the appropriate SDK.

### Integration Modes

| Mode | Behavior |
|---|---|
| `tool` | Tool definitions are passed to the AI; the agent calls them explicitly |
| `context` | (RAGFlow only) Knowledge base is queried before every AI inference and prepended as context |

### Credential Storage

Credentials are stored as AES-256-GCM encrypted JSON in `cloud_integrations.credentials_encrypted`. The encryption key is sourced from:

1. `ENCRYPTION_KEY` / `ENCRYPTION_KEY_FILE` env var
2. Derived from `SESSION_SECRET` as a fallback (SHA-256 hash, first 32 bytes)

Decryption happens in-process immediately before a tool call. Credentials are never written to disk unencrypted.

### Supported Integrations

| Provider | SDK | Credential Fields |
|---|---|---|
| AWS | `@aws-sdk/client-*` | `accessKeyId`, `secretAccessKey`, `region` |
| GCP | `@google-cloud/storage`, `@google-cloud/compute` | `serviceAccountKey` (JSON) |
| Azure | `@azure/arm-*`, `@azure/identity` | `clientId`, `clientSecret`, `tenantId`, `subscriptionId` |
| Jira | `jira-client` | `host`, `email`, `apiToken` |
| GitHub | `@octokit/rest` | `token` |
| GitLab | `@gitbeaker/rest` | `host`, `token` |
| RAGFlow | Custom HTTP client | `baseUrl`, `apiKey` |
| Teams | Bot Framework | `appId`, `appPassword` (comms inbound); also a cloud integration tool: `webhookUrl` |
| Slack | Slack Web API | `botToken`, optional `defaultChannel` (comms inbound + cloud integration tools) |
| Google Chat | Webhook + Events | `webhookUrl` (cloud integration tools + comms inbound), optional `verificationToken` |
| ServiceNow | Custom HTTP client (Basic Auth) | `instanceUrl`, `username`, `password` |

---

## 16. Tool System

Tool definitions follow the JSON Schema format and are passed to AI providers in their native function-calling formats. The server includes tool definitions for the following integrations:

### AWS Tools

| Tool Name | Description |
|---|---|
| `aws_list_s3_buckets` | List all S3 buckets |
| `aws_list_s3_objects` | List objects in a bucket with optional prefix |
| `aws_list_ec2_instances` | List EC2 instances filtered by region/state |
| `aws_list_lambda_functions` | List Lambda functions by region |
| `aws_get_cloudwatch_logs` | Fetch recent CloudWatch log events |

### GCP Tools

| Tool Name | Description |
|---|---|
| `gcp_list_storage_buckets` | List Cloud Storage buckets |
| `gcp_list_compute_instances` | List Compute Engine VM instances |
| `gcp_list_cloud_functions` | List Cloud Functions by region |

### Azure Tools

| Tool Name | Description |
|---|---|
| `azure_list_resource_groups` | List resource groups |
| `azure_list_virtual_machines` | List VMs, optionally filtered by resource group |
| `azure_list_storage_accounts` | List storage accounts |

### Jira Tools

| Tool Name | Description |
|---|---|
| `jira_list_projects` | List all accessible projects |
| `jira_search_issues` | Search issues using JQL |
| `jira_get_issue` | Get issue details by key |
| `jira_create_issue` | Create a new issue |
| `jira_update_issue` | Update fields on an existing issue |
| `jira_add_comment` | Add a comment to an issue |
| `jira_list_sprints` | List sprints for a board |

### GitHub Tools

| Tool Name | Description |
|---|---|
| `github_list_repos` | List repositories |
| `github_list_issues` | List issues with optional filters |
| `github_create_issue` | Create an issue |
| `github_get_pull_requests` | List pull requests |
| `github_create_pull_request` | Create a pull request |
| `github_get_repo_contents` | Read a file or directory from a repo |
| `github_get_workflows` | List GitHub Actions workflows |
| `github_trigger_workflow` | Manually trigger a workflow dispatch |

### GitLab Tools

| Tool Name | Description |
|---|---|
| `gitlab_list_projects` | List accessible projects |
| `gitlab_list_issues` | List issues |
| `gitlab_create_issue` | Create an issue |
| `gitlab_get_merge_requests` | List merge requests |
| `gitlab_create_merge_request` | Create a merge request |
| `gitlab_get_file_contents` | Read a file from a project |
| `gitlab_list_pipelines` | List CI/CD pipelines |
| `gitlab_trigger_pipeline` | Trigger a pipeline |

### RAGFlow Tools

| Tool Name | Description |
|---|---|
| `ragflow_list_datasets` | List available knowledge base datasets |
| `ragflow_query_dataset` | Query a dataset with a natural language question |
| `ragflow_query_multiple_datasets` | Query multiple datasets simultaneously |

### ServiceNow Tools (ITSM)

| Tool Name | Description |
|---|---|
| `servicenow_search_records` | Search any ServiceNow table using an encoded query string |
| `servicenow_get_incident` | Retrieve a single incident record by sys_id |
| `servicenow_create_incident` | Create a new incident with caller, category, impact, urgency, and description |
| `servicenow_update_record` | Update any field on any ServiceNow record by table + sys_id |
| `servicenow_add_work_note` | Append a work note to any record (incident, change, RITM, etc.) |
| `servicenow_get_ritm` | Retrieve a Requested Item (RITM) record by sys_id |
| `servicenow_create_ritm` | Submit a Service Catalog order and return the resulting RITM sys_id |
| `servicenow_create_change_request` | Open a new Change Request with type, risk, impact, and justification |
| `servicenow_get_catalog_items` | List active Service Catalog items (optionally filtered by search query) |

Credential fields: `instanceUrl`, `username`, `password`. Requires ITIL + catalog roles in ServiceNow. Provider key: `servicenow`. Category: ITSM.

### PostgreSQL Tools (Database Integration)

Agents can introspect and query an external PostgreSQL database. The connection string is stored AES-256-GCM encrypted in `cloud_integrations.credentials`. Provider key: `postgresql`. Category: cloud (uses `cloud_provider` enum value `postgresql`).

| Tool Name | Description | Safety |
|---|---|---|
| `pg_list_schemas` | List all non-system schemas in the database | Read-only |
| `pg_list_tables` | List all tables in a given schema with row count estimates | Read-only |
| `pg_describe_table` | Show column names, types, nullability, and default values for a table | Read-only |
| `pg_query` | Execute a read-only SELECT query; returns up to 100 rows as JSON | Read-only (SELECT only) |
| `pg_execute` | Execute an INSERT/UPDATE/DELETE statement | **Requires approval gate** |

`pg_execute` automatically triggers an approval gate (`request_approval` call) before running any write statement. The pending approval appears in the Approvals page and can be sent as an interactive Slack/Teams card. On rejection, the write is skipped and the agent is notified.

Credential field: `connectionString` (full PostgreSQL connection string, e.g. `postgresql://user:pass@host:5432/db`). Stored encrypted; never exposed to agent containers.

### Built-In Tools

| Tool Name | Description |
|---|---|
| `code_interpreter` | Execute code in an isolated sandbox (Python, JS, Bash, Ruby, R, Go, Java) |
| `request_approval` | Pause execution and request human sign-off |
| `spawn_agent` | Delegate a subtask to another agent in the workspace (parallel multi-agent) |

---

## 17. Approval Gates

Approval gates allow an agent to pause mid-task and wait for human authorization before executing a high-impact action.

### Flow

```
Agent calls request_approval tool
    │
    ▼
Executor creates approval_requests row (status: pending)
Emits SSE event "approval_requested" to task stream
If task originated from Slack/Teams:
    dispatchApprovalCard() sends interactive card to the thread
        - Slack: Block Kit card with Approve/Reject buttons
        - Teams: Adaptive Card with Action.Submit buttons
    │
    ▼
Task execution pauses (awaits approval resolution)
    │
    ▼
Human approves or rejects via:
    - Web UI: POST /api/workspaces/:wid/approvals/:id/resolve
    - Slack: POST /api/comms/slack/actions (Block Kit action payload)
    - Teams: POST /api/comms/teams/:channelId/actions (Adaptive Card submit)
    │
    ▼
approval_requests.status → "approved" or "rejected"
Executor resumes
If approved: continues tool loop with result "Approval granted"
If rejected: continues tool loop with result "Approval rejected: <reason>"
```

### Sidebar Badge

The frontend polls `GET /api/workspaces/:wid/approvals?status=pending` and displays a live count badge on the "Approvals" sidebar item.

---

## 18. Pipeline and DAG Executor

`server/engine/pipeline-executor.ts` runs sequential multi-agent pipelines.

### Data Model

```
Pipeline (one per workspace+orchestrator)
  └─► PipelineSteps (ordered by step_order)
        Each step: agentId + promptTemplate
  └─► PipelineRuns (one per execution)
        └─► PipelineStepRuns (one per step per run)
              Each step run links to a Task
```

### Execution Flow

```
executePipeline(pipelineId, triggeredBy)
  │
  ├─► Create PipelineRun (status: running)
  │
  ├─► For each step (in step_order order):
  │     ├─► If not first step: prepend previous step output to promptTemplate
  │     ├─► Create Task (status: pending)
  │     ├─► Create PipelineStepRun (status: running)
  │     ├─► executeTask(taskId) — awaited (sequential)
  │     └─► PipelineStepRun.status → completed | failed
  │
  └─► PipelineRun.status → completed | failed
```

Context passing: The output of step N is automatically prepended to the `promptTemplate` of step N+1 as `Previous step output:\n<output>\n\n`. This allows each agent to build on the prior result.

### Scheduling

Pipelines support a `cronExpression` and `timezone` field. The cron scheduler calls `executePipeline()` on the configured schedule. Pipelines can also be triggered manually via `POST /api/workspaces/:wid/pipelines/:id/run`.

---

## 19. Cron Scheduler

`server/engine/scheduler.ts` uses `node-cron` to manage time-based automation.

### Job Types

| Type | Trigger | Action |
|---|---|---|
| Scheduled Job | `scheduled_jobs.cron_expression` | Creates a task for the configured agent |
| Pipeline | `pipelines.cron_expression` | Calls `executePipeline()` |

### Configuration Fields

| Field | Description |
|---|---|
| `name` | Human-readable label |
| `cronExpression` | Standard 5-part cron expression (e.g. `0 9 * * 1`) |
| `timezone` | IANA timezone string (e.g. `America/New_York`, `UTC`) |
| `orchestratorId` | Target orchestrator that runs the task |
| `prompt` | Task content sent to the agent |
| `intent` | Execution-path override: `auto-detect` (LLM classifier, default), `conversational` (LocalExecutor), `action` (DockerExecutor), `code_execution` (sandbox). When `auto-detect` or omitted the inline `classifyIntent()` function is called. |
| `bypassApproval` | When `true`, tasks created by this job skip approval gates regardless of agent configuration |
| `notifyChannelId` | Optional outbound channel for posting job results |

### Lifecycle

```
startScheduler()
  └─► Load all active scheduled_jobs from DB
        Register each as a cron task (registerJob)
  └─► Load all active pipelines with cronExpression from DB
        Register each as a pipeline cron task

registerJob(job):
  cron.schedule(job.cronExpression, () => {
    resolvedIntent = job.intent (if explicit) OR classifyIntent(job.prompt)
    Create Task with job.prompt, resolvedIntent, job.bypassApproval
      → queue picks it up
    Update job.lastRunAt and job.nextRunAt
    dispatchNotification('job.fired')
  }, { timezone: job.timezone })

unregisterJob(jobId):
  Stop and destroy the cron task

computeNextRun(cronExpr, tz):
  Returns the next scheduled Date using cron-parser
```

Dynamic updates (create/update/delete via API) call `registerJob()` or `unregisterJob()` to keep the in-memory schedule in sync without restarting the server.

---

## 20. Comms System — Slack, Teams, and Google Chat

NanoOrch supports **two-way messaging** on workspaces flagged as `isCommsWorkspace = true`.

### Slack (`server/comms/slack-handler.ts`)

**Inbound:**

- Endpoint: `POST /api/comms/slack/:channelId`
- Verifies `X-Slack-Signature` HMAC-SHA256 using the Slack Signing Secret
- Handles `url_verification` challenge (returns challenge value)
- Processes `app_mention` and `message.im` event types
- Checks the DM allowlist (`config.dmAllowlist`) — rejects unauthorized users
- Checks bypass phrases (`config.bypassPhrases`) — if matched, sets `bypassApproval = true` on the task
- Handles slash commands: `/status`, `/reset`, `/compact`, `/help`
- Posts typing indicator (`:speech_balloon: thinking...` ephemeral message)
- Creates a `comms_threads` record to track the conversation
- Creates a task with the user message as input

**Outbound reply** (`server/comms/comms-reply.ts`):
- Posts to the Slack thread using the Bot Token and `chat.postMessage`
- Preserves thread context via `thread_ts`

**Interactive approvals** (`server/comms/approval-cards.ts`):
- Sends Block Kit cards with "Approve" and "Reject" buttons
- Button actions POST to `POST /api/comms/slack/actions`

### Teams (`server/comms/teams-handler.ts`)

**Inbound:**

- Endpoint: `POST /api/comms/teams/:channelId`
- Verifies Bot Framework JWT token using `appId` and `appPassword`
- Processes `message` activity types
- Respects DM allowlist and bypass phrases (same logic as Slack)
- Handles slash commands
- Posts typing activity via Bot Framework REST API
- Creates a `comms_threads` record with `conversationRef` for reply routing

**Outbound reply:**
- Uses Bot Framework's `continueConversation` API with the stored `conversationRef`

**Interactive approvals:**
- Sends Adaptive Cards with `Action.Submit` buttons
- Submit actions POST to `POST /api/comms/teams/:channelId/actions`

### Google Chat (`server/comms/google-chat-handler.ts`)

**Inbound:**

- Endpoint: `POST /api/channels/:id/google-chat/event`
- Optionally verifies a `verificationToken` stored in channel config against a `token` field in the event body
- Processes `MESSAGE` event types; ignores `ADDED_TO_SPACE` and `CARD_CLICKED`
- Respects DM allowlist and bypass phrases (same logic as Slack and Teams)
- Handles slash commands (`/status`, `/reset`, `/compact`, `/help`)
- Creates a `comms_threads` record keyed on the Google Chat `space.name`
- Creates a task with the user message as input

**Outbound reply** (`server/comms/comms-reply.ts`):
- POSTs to the Google Chat space webhook URL stored in the channel config
- Replies with a plain text message (Google Chat formats markdown automatically)

**Note:** Google Chat does not support interactive approval cards via webhook — approvals from Google Chat comms threads are resolved via the NanoOrch web UI.

### Conversation History

Each `comms_threads` row stores a `history` JSONB array (up to the last 50 messages). This history is prepended to the AI context on every new message in the thread, giving agents conversational continuity.

---

## 21. Outbound Notification System

`server/engine/notifier.ts` dispatches notifications to configured outbound channels when task events occur.

### Event Types

| Event | Triggered When |
|---|---|
| `task.completed` | Task finishes successfully |
| `task.failed` | Task ends with an error |
| `task.approval_requested` | Agent pauses for approval |
| `job.fired` | Scheduled job triggers a task |

### Channel Types

| Channel Type | Format |
|---|---|
| `slack` | Slack webhook — formatted text message with icon and task details |
| `teams` | Teams MessageCard — `@type: MessageCard` with colored sections |
| `google_chat` | Google Chat — formatted text card |
| `generic_webhook` | JSON payload: `{ event, orchestratorId, taskId, summary, error, timestamp }` |

### Delivery

Each `fireChannel()` call:
1. Checks if the channel has a configured event filter (`config.events`); if set, skips non-matching events
2. Builds the formatted payload
3. POSTs to `config.url` with a 10-second timeout
4. Logs the result (HTTP status, response body, or error) to `channel_deliveries`

All channels for an orchestrator are fired in parallel via `Promise.allSettled()`, so one failing channel does not block others.

---

## 22. Event-Driven Triggers

`server/routes.ts` handles webhook payloads from GitHub, GitLab, and Jira at dedicated endpoints.

### Endpoints

| Source | Endpoint | Verification Method |
|---|---|---|
| GitHub | `POST /api/webhooks/github/:triggerId` | `X-Hub-Signature-256` HMAC-SHA256 |
| GitLab | `POST /api/webhooks/gitlab/:triggerId` | `X-Gitlab-Token` header equality |
| Jira | `POST /api/webhooks/jira/:triggerId?token=<secret>` | Query string token equality |

### Processing Flow

```
Webhook received
  │
  ├─► Fetch trigger by ID
  ├─► Verify signature / token
  ├─► Check trigger.isActive
  ├─► Resolve event type from headers:
  │     GitHub: X-GitHub-Event
  │     GitLab: X-Gitlab-Event
  │     Jira:   webhookEvent field in body
  ├─► Check event type against trigger.eventTypes (empty = all events)
  ├─► Render prompt: interpolate {{payload.field}} template variables
  ├─► Create Task in queue (pointing to trigger's orchestrator + agent)
  ├─► Log to trigger_events (status: success or error)
  └─► Respond 200 OK
```

### Payload Templating

Template expressions `{{payload.path.to.field}}` are resolved using a dot-path resolver over the parsed JSON body. Unresolved paths are left as-is. The full raw payload is also appended to the prompt as JSON context.

### Rate Limiting

Webhook endpoints are subject to the `webhookLimiter` (60 requests/minute).

---

## 23. Observability and Cost Tracking

### Token Usage Logging

Every AI inference call (in-process and Docker executor) logs a `token_usage` record containing:
- `workspaceId`, `taskId`, `agentId`, `agentName`
- `provider`, `model`
- `inputTokens`, `outputTokens`
- `estimatedCostUsd` (computed from a hardcoded pricing table)

### Cost Estimation Rates (per million tokens)

| Model | Input ($) | Output ($) |
|---|---|---|
| gpt-4o | 2.50 | 10.00 |
| gpt-4o-mini | 0.15 | 0.60 |
| gpt-4-turbo | 10.00 | 30.00 |
| claude-opus-4-5 | 15.00 | 75.00 |
| claude-sonnet-4-5 | 3.00 | 15.00 |
| claude-haiku-4-5 | 0.25 | 1.25 |
| gemini-2.5-pro | 1.25 | 5.00 |
| gemini-2.5-flash | 0.075 | 0.30 |
| Other (default) | 1.00 | 3.00 |

### Observability Dashboard

The `ObservabilityPage.tsx` frontend fetches `GET /api/workspaces/:wid/token-usage` and renders:
- Total tokens and estimated cost (all time and last 30 days)
- Daily usage area chart (Recharts)
- Per-agent token breakdown table
- Provider and model summary cards

---

## 24. Workspace Resource Limits

Stored in `workspace_config` (one row per workspace, primary key is `workspace_id`).

### Quota Fields

| Field | Enforcement Point |
|---|---|
| `maxOrchestrators` | `POST /api/workspaces/:id/orchestrators` |
| `maxAgents` | `POST /api/orchestrators/:id/agents` |
| `maxChannels` | `POST /api/orchestrators/:id/channels` |
| `maxScheduledJobs` | `POST /api/workspaces/:id/scheduled-jobs` |

When a quota is exceeded, the API returns `409 Quota exceeded`.

### Allow-List Fields

| Field | Enforcement Point |
|---|---|
| `allowedAiProviders` | `POST/PUT` orchestrator provider field |
| `allowedCloudProviders` | `POST` cloud integrations |
| `allowedChannelTypes` | `POST` channels |

When a disallowed provider or type is used, the API returns `403 Forbidden`.

`null` values in any field mean unlimited / unrestricted.

Only global admins can set or update `workspace_config` via `PUT /api/workspaces/:id/config`.

---

## 25. Real-Time Streaming

### Server-Sent Events (SSE)

Task log streaming uses SSE at `GET /api/tasks/:taskId/stream`.

```
Client                          Server
  │  GET /api/tasks/:id/stream   │
  │──────────────────────────────►│
  │◄── Content-Type: text/event-stream
  │◄── data: {"id":1,"level":"info","message":"Task started..."}
  │◄── data: {"id":2,"level":"info","message":"Tool call: jira_search_issues"}
  │◄── data: {"id":3,"level":"info","message":"Completed"}
  │◄── event: done
```

On the server, `taskLogEmitter` (a Node.js `EventEmitter`) emits `task:<taskId>` events. The SSE handler subscribes on connection open and unsubscribes when the client disconnects. Historical logs (already stored in `task_logs`) are replayed immediately on connect so the client gets the full history even if it connects mid-task.

The SSE endpoint is excluded from the `apiLimiter` rate limiter.

### WebSockets

A WebSocket server is mounted on the same HTTP server (sharing the same port):

```
ws.on("connection") → attach message handler
ws.broadcast() → push log entries to all connected clients in real-time
```

The WebSocket server provides an alternative real-time log push path used by the chat interface for live task feedback within the chat bubble UI.

---

## 26. Frontend Architecture

### Routing

`client/src/App.tsx` defines all routes using `wouter`:

| Route | Component | Access |
|---|---|---|
| `/login` | `LoginPage` | Public |
| `/workspaces` | `WorkspacesPage` | Auth |
| `/workspaces/:id` | `WorkspaceDashboard` | Auth |
| `/workspaces/:id/orchestrators/:oid` | `OrchestratorPage` | Auth |
| `/workspaces/:id/agents` | `AgentsPage` | Auth |
| `/workspaces/:id/tasks` | `TasksPage` | Auth |
| `/workspaces/:id/tasks/:tid` | `TaskDetailPage` | Auth |
| `/workspaces/:id/chat` | `ChatPage` | Auth |
| `/workspaces/:id/channels` | `ChannelsPage` | Auth |
| `/workspaces/:id/integrations` | `IntegrationsPage` | Auth |
| `/workspaces/:id/scheduled-jobs` | `ScheduledJobsPage` | Auth |
| `/workspaces/:id/approvals` | `ApprovalsPage` | Auth |
| `/workspaces/:id/pipelines` | `PipelinesPage` | Auth |
| `/workspaces/:id/observability` | `ObservabilityPage` | Auth |
| `/workspaces/:id/members` | `MembersPage` | Auth |
| `/workspaces/:id/triggers` | `TriggersPage` | Auth |
| `/admin/sso` | `SSOPage` | Global admin |
| `/member` | `MemberHomePage` | Member |
| `/member/chat/:wid` | `MemberChatPage` | Member |

### Auth Guard

`AppLayout.tsx` wraps all authenticated routes. On mount, it calls `GET /api/auth/me`. If the response is 401, it redirects to `/login`. It also reads `workspaceAdminIds` from the user response to show/hide admin UI elements.

### Data Fetching

All server state is managed by TanStack Query v5:
- `useQuery` for reads — caches by query key, automatic background refetch
- `useMutation` + `apiRequest` for writes — invalidates relevant cache keys on success
- Loading states via `.isLoading` / `.isPending`

The `queryClient.ts` file sets a default query function that calls `fetch(queryKey[0])` with credentials, handles non-2xx responses by throwing, and returns the parsed JSON. This means queries only need `queryKey` — no explicit `queryFn`.

### Forms

All forms use `react-hook-form` with `zodResolver`. Insert schemas from `shared/schema.ts` are reused with `.extend()` for additional validation rules.

### Collapsible Sidebar

`AppLayout.tsx` provides the workspace sidebar. Collapse state is stored in `localStorage` under the key `nanoorch-sidebar-collapsed` and restored on load.

| State | Width | Behaviour |
|---|---|---|
| **Expanded** (default) | 256 px (`w-64`) | Full labels, section headings, Approvals badge count, orchestrator sub-items |
| **Collapsed** | 60 px | Icon-only rail; labels hidden; Radix Tooltip on hover shows the full label; yellow dot indicator replaces the Approvals numeric badge |

The toggle button (`PanelLeftClose` / `PanelLeftOpen` icon from lucide-react) sits just below the header. A smooth CSS width transition (`transition-[width] duration-200`) prevents a jarring snap. Orchestrator sub-items (Agents / Channels / Tasks) are hidden entirely when collapsed.

### Theme

`ThemeProvider.tsx` persists the `light` / `dark` preference in `localStorage` and toggles the `dark` class on `document.documentElement`. All Tailwind classes use CSS variable-based colors defined in `index.css`, which flip automatically based on the dark-class presence.

### Chat System

`ChatPage.tsx` handles the main interactive chat:
- Conversations are grouped by `chat_conversations` rows
- Messages support `@agentname` mention parsing to route to specific agents
- The AI infers intent (`action` / `context` / `code` / `conversational`) before queuing a task
- Agent responses stream in real-time via WebSocket connection
- Spawned subtask agents show inline progress cards within the chat bubble
- A conversation title is auto-generated from the first message using `gpt-4o-mini` or `claude-haiku-4-5`

---

## 27. Security Hardening

### Container Isolation Layers

| Layer | Configuration | Effect |
|---|---|---|
| Docker namespace | Default | Network, PID, mount, IPC isolation |
| gVisor (runsc) | `AGENT_RUNTIME=runsc` or `SANDBOX_RUNTIME=runsc` | Intercepts all syscalls in user-space |
| Seccomp profile | `SECCOMP_PROFILE=/path/to/nanoorch.json` | Allowlist of permitted syscalls |
| Read-only root FS | `--read-only` flag | Prevents writing to the container filesystem |
| No network | `--network none` | Prevents outbound connections from the container |
| Resource caps | `--memory 512m --cpus 0.5` | Prevents resource exhaustion |
| Tmpfs scratch | `--tmpfs /tmp` | Ephemeral writable scratch only |

### Credential Isolation

- AI API keys: Never passed to agent containers. Replaced by short-lived proxy tokens.
- Cloud credentials: AES-256-GCM encrypted in the database. Decrypted in-process only.
- Session secret: Stored in `SESSION_SECRET` env var (or Docker secret file).
- Database URL: Stored in `DATABASE_URL` env var (or Docker secret file).

### Docker Secrets (`_FILE` Pattern)

`server/lib/secrets.ts` implements the `_FILE` convention:

```typescript
loadSecret("SESSION_SECRET")
  // checks: process.env.SESSION_SECRET_FILE → reads file
  // fallback: process.env.SESSION_SECRET
  // fallback: undefined
```

In `docker-compose.secrets.yml`, sensitive values are mounted as Docker Swarm secrets and referenced via `*_FILE` env vars. This means real values never appear in `docker inspect Env` output.

Secrets managed this way:
- `DATABASE_URL_FILE`
- `SESSION_SECRET_FILE`
- `ADMIN_PASSWORD_FILE`
- `ENCRYPTION_KEY_FILE`
- `OPENAI_API_KEY_FILE`
- `ANTHROPIC_API_KEY_FILE`
- `GEMINI_API_KEY_FILE`

### Input Sanitization

`server/lib/mountAllowlist.ts` sanitizes tool arguments before passing them to cloud SDK calls:
- Strips `..` path traversal sequences from string arguments
- Prevents directory escape in file-related tool parameters

---

## 28. Deployment Architecture

### Development

```
npm run dev
  └─► tsx server/index.ts (Express + Vite middleware on the same port)
```

Vite serves the frontend with HMR. The Express API and Vite dev server share port 5000. No separate build step is required.

### Production (Docker Compose)

```
┌─────────────────────────────────────────────────────┐
│  Docker Compose (docker-compose.yml)                │
│                                                     │
│  ┌─────────────┐    ┌────────────────────────────┐  │
│  │  postgres:16│    │  nanoorch app              │  │
│  │  Alpine     │◄───│  (multi-stage Dockerfile)  │  │
│  │  Port: 5432 │    │  Port: 3000                │  │
│  │  Volume:    │    │  NODE_ENV=production        │  │
│  │  pg_data    │    │  Mounts: DOCKER_SOCKET      │  │
│  └─────────────┘    └────────────────────────────┘  │
│                                                     │
│  Network: nanoorch_net (internal bridge)            │
└─────────────────────────────────────────────────────┘

External:
  Nginx (user-managed) → :3000 (HTTPS termination, proxy_pass)
  GitHub / GitLab / Jira → POST /api/webhooks/*
  Slack / Teams → POST /api/comms/*
  Identity Providers → GET|POST /api/auth/sso/*
```

### Hardened Secrets Variant

`docker-compose.secrets.yml` replaces plain env vars with Docker Swarm secrets:

```yaml
secrets:
  database_url:    { file: ./secrets/database_url.txt }
  session_secret:  { file: ./secrets/session_secret.txt }
  admin_password:  { file: ./secrets/admin_password.txt }
  ...

services:
  app:
    secrets: [database_url, session_secret, ...]
    environment:
      DATABASE_URL_FILE: /run/secrets/database_url
      SESSION_SECRET_FILE: /run/secrets/session_secret
```

`./secrets/create-secrets.sh` generates all secret files interactively.

### Multi-Stage Dockerfile

```
Stage 1: node:20-alpine (build)
  COPY package*.json → npm ci
  COPY . → tsc (server) + vite build (client)
  Output: dist/

Stage 2: node:20-alpine (runtime)
  COPY --from=build dist/
  COPY migrations/
  USER node (non-root)
  CMD ["node", "dist/index.js"]
```

---

## 29. Environment Variables Reference

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | Yes | — | PostgreSQL connection string |
| `SESSION_SECRET` | Yes | — | Express session signing secret (long random string) |
| `PORT` | No | `5000` | HTTP server port |
| `NODE_ENV` | No | `development` | `development` or `production` |
| `APP_URL` | No | Derived | Public URL for SSO callback/ACS/metadata URLs (e.g. `https://nanoorch.example.com`) |
| `COOKIE_SECURE` | No | `false` | Set `true` only behind HTTPS termination |
| `ADMIN_USERNAME` | No | `admin` | Username for the seeded admin account (first boot only) |
| `ADMIN_PASSWORD` | No | `admin` | Password for the seeded admin account (first boot only) |
| `ENCRYPTION_KEY` | No | Derived | AES-256-GCM key for credential encryption (hex or base64, 32 bytes) |
| `MIGRATIONS_DIR` | No | — | Path to SQL migration files directory |
| `DOCKER_SOCKET` | No | — | Docker socket path (e.g. `/var/run/docker.sock`); enables Docker executor |
| `AGENT_RUNTIME` | No | `""` | Container runtime for agent tasks (`runsc` for gVisor) |
| `SANDBOX_RUNTIME` | No | `""` | Container runtime for code sandbox (`runsc` for gVisor) |
| `SECCOMP_PROFILE` | No | — | Path to custom seccomp profile JSON |
| `DOCKER_PROXY_URL` | No | `http://host.docker.internal:<PORT>/internal/proxy` | Inference proxy base URL passed to agent containers. Override on Docker Engine < 20.10 with `http://172.17.0.1:<PORT>/internal/proxy` |
| `AI_INTEGRATIONS_OPENAI_API_KEY` | No | — | OpenAI API key |
| `AI_INTEGRATIONS_ANTHROPIC_API_KEY` | No | — | Anthropic API key |
| `AI_INTEGRATIONS_GEMINI_API_KEY` | No | — | Gemini API key |
| `AI_INTEGRATIONS_OPENAI_BASE_URL` | No | — | OpenAI-compatible base URL override |
| `AI_INTEGRATIONS_ANTHROPIC_BASE_URL` | No | — | Anthropic base URL override |
| `AI_INTEGRATIONS_GEMINI_BASE_URL` | No | — | Gemini base URL override |
| `REDIS_URL` | No | — | Redis connection string (e.g. `redis://localhost:6379`). When set, sessions and rate-limit counters use Redis via the ioredis shim instead of PostgreSQL |

All variables above also support a `*_FILE` variant (e.g. `DATABASE_URL_FILE`) for Docker secrets.

---

## 30. REST API Surface

All endpoints are prefixed `/api`. Protected endpoints require an authenticated session cookie.

### Authentication

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/auth/login` | Public | Authenticate with username + password |
| `POST` | `/api/auth/logout` | Auth | Destroy session |
| `GET` | `/api/auth/me` | Auth | Return current user + workspaceAdminIds |
| `GET` | `/api/auth/sso/providers` | Public | List active SSO providers (for login page) |
| `GET` | `/api/auth/sso/oidc/:id/initiate` | Public | Start OIDC flow |
| `GET` | `/api/auth/sso/oidc/:id/callback` | Public | OIDC callback |
| `GET` | `/api/auth/sso/saml/:id/initiate` | Public | Start SAML flow |
| `POST` | `/api/auth/sso/saml/:id/acs` | Public | SAML Assertion Consumer Service |
| `GET` | `/api/auth/sso/saml/:id/metadata` | Public | SP metadata XML |

### SSO Providers (admin)

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/admin/sso-providers` | Global admin | List all SSO providers |
| `POST` | `/api/admin/sso-providers` | Global admin | Create SSO provider |
| `PUT` | `/api/admin/sso-providers/:id` | Global admin | Update SSO provider |
| `DELETE` | `/api/admin/sso-providers/:id` | Global admin | Delete SSO provider |

### Workspaces

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/workspaces` | Auth | List workspaces for current user |
| `POST` | `/api/workspaces` | Admin | Create workspace |
| `PUT` | `/api/workspaces/:id` | WS admin | Update workspace |
| `DELETE` | `/api/workspaces/:id` | Admin | Delete workspace |
| `GET` | `/api/workspaces/:id/config` | WS admin | Get workspace resource config |
| `PUT` | `/api/workspaces/:id/config` | Admin | Set workspace resource limits |
| `GET` | `/api/workspaces/:id/members` | WS admin | List workspace members |
| `POST` | `/api/workspaces/:id/members` | WS admin | Add member |
| `PUT` | `/api/workspaces/:id/members/:mid` | WS admin | Update member role |
| `DELETE` | `/api/workspaces/:id/members/:mid` | WS admin | Remove member |

### Orchestrators

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/workspaces/:id/orchestrators` | Auth | List orchestrators |
| `POST` | `/api/workspaces/:id/orchestrators` | WS admin | Create orchestrator |
| `GET` | `/api/orchestrators/:id` | Auth | Get orchestrator |
| `PUT` | `/api/orchestrators/:id` | WS admin | Update orchestrator |
| `DELETE` | `/api/orchestrators/:id` | WS admin | Delete orchestrator |
| `GET` | `/api/providers` | Auth | List AI providers and model options |

### Agents

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/orchestrators/:id/agents` | Auth | List agents |
| `POST` | `/api/orchestrators/:id/agents` | WS admin | Create agent |
| `PUT` | `/api/agents/:id` | WS admin | Update agent |
| `DELETE` | `/api/agents/:id` | WS admin | Delete agent |
| `GET` | `/api/agents/:id/memory` | Auth | Get agent memory |
| `DELETE` | `/api/agents/:id/memory` | WS admin | Clear agent memory |
| `GET` | `/api/workspaces/:id/agents` | Auth | List all agents in workspace |

### Tasks

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/workspaces/:id/tasks` | Auth | List tasks |
| `POST` | `/api/tasks` | Auth | Submit a task |
| `GET` | `/api/tasks/:id` | Auth | Get task details |
| `GET` | `/api/tasks/:id/logs` | Auth | Get task logs |
| `GET` | `/api/tasks/:id/stream` | Auth | SSE log stream |

### Channels

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/orchestrators/:id/channels` | Auth | List channels |
| `POST` | `/api/orchestrators/:id/channels` | WS admin | Create channel |
| `PUT` | `/api/channels/:id` | WS admin | Update channel |
| `DELETE` | `/api/channels/:id` | WS admin | Delete channel |
| `GET` | `/api/channels/:id/deliveries` | Auth | Delivery history |
| `POST` | `/api/channels/:id/webhook` | Public (API key) | Submit task via API channel |

### Cloud Integrations

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/workspaces/:id/integrations` | Auth | List integrations |
| `POST` | `/api/workspaces/:id/integrations` | WS admin | Create integration |
| `PUT` | `/api/integrations/:id` | WS admin | Update integration |
| `DELETE` | `/api/integrations/:id` | WS admin | Delete integration |
| `POST` | `/api/integrations/:id/validate` | WS admin | Test credentials |

### Chat

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/workspaces/:id/conversations` | Auth | List conversations |
| `POST` | `/api/workspaces/:id/conversations` | Auth | Create conversation |
| `DELETE` | `/api/conversations/:id` | Auth | Delete conversation |
| `GET` | `/api/conversations/:id/messages` | Auth | Get messages |
| `POST` | `/api/conversations/:id/messages` | Auth | Send message (triggers agent) |

### Scheduled Jobs

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/workspaces/:id/scheduled-jobs` | Auth | List jobs |
| `POST` | `/api/workspaces/:id/scheduled-jobs` | WS admin | Create job |
| `PUT` | `/api/scheduled-jobs/:id` | WS admin | Update job |
| `DELETE` | `/api/scheduled-jobs/:id` | WS admin | Delete job |
| `POST` | `/api/scheduled-jobs/:id/trigger` | WS admin | Manually fire job |

### Approvals

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/workspaces/:id/approvals` | Auth | List approvals (filterable by status) |
| `POST` | `/api/workspaces/:id/approvals/:aid/resolve` | Auth | Approve or reject |

### Pipelines

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/workspaces/:id/pipelines` | Auth | List pipelines |
| `POST` | `/api/workspaces/:id/pipelines` | WS admin | Create pipeline |
| `PUT` | `/api/pipelines/:id` | WS admin | Update pipeline |
| `DELETE` | `/api/pipelines/:id` | WS admin | Delete pipeline |
| `GET` | `/api/pipelines/:id/runs` | Auth | List pipeline runs |
| `POST` | `/api/workspaces/:id/pipelines/:id/run` | Auth | Manually trigger run |

### Observability

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/workspaces/:id/token-usage` | Auth | Token usage and cost data |

### Event Triggers

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/workspaces/:id/triggers` | Auth | List triggers |
| `POST` | `/api/workspaces/:id/triggers` | WS admin | Create trigger |
| `PUT` | `/api/triggers/:id` | WS admin | Update trigger |
| `DELETE` | `/api/triggers/:id` | WS admin | Delete trigger |
| `GET` | `/api/triggers/:id/events` | Auth | Event delivery history |

### Webhooks (Event Sources)

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/webhooks/github/:triggerId` | HMAC-SHA256 | GitHub webhook receiver |
| `POST` | `/api/webhooks/gitlab/:triggerId` | Token header | GitLab webhook receiver |
| `POST` | `/api/webhooks/jira/:triggerId` | Token query param | Jira webhook receiver |

### Comms Inbound

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/comms/slack/:channelId` | Slack signature | Slack Events API |
| `POST` | `/api/comms/slack/actions` | Slack signature | Slack Block Kit interactive actions |
| `POST` | `/api/comms/teams/:channelId` | Bot Framework JWT | Teams Bot Framework activities |
| `POST` | `/api/comms/teams/:channelId/actions` | Bot Framework JWT | Teams Adaptive Card submit actions |

### MCP API Keys

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/workspaces/:id/mcp-keys` | WS admin | List workspace MCP API keys |
| `POST` | `/api/workspaces/:id/mcp-keys` | WS admin | Create MCP API key (returns raw key once) |
| `DELETE` | `/api/mcp-keys/:id` | WS admin | Revoke MCP API key |

### MCP Server Endpoint

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/mcp` | Bearer MCP key | Initiate MCP session (HTTP transport) |
| `GET` | `/mcp` | Bearer MCP key | Open SSE stream for MCP session |
| `DELETE` | `/mcp` | Bearer MCP key | Terminate MCP session |

### Inference Proxy (internal)

| Method | Path | Auth | Description |
|---|---|---|---|
| `*` | `/internal/proxy/:provider/*` | Task token | AI inference proxy for agent containers |

---

## 31. Key Data Flows

### Flow 1 — User submits a chat message mentioning an agent

```
User types "@deploy-agent list all EC2 instances in us-east-1"
    │
    ▼
POST /api/conversations/:id/messages
    │
    ▼
Server parses @mentions → identifies "deploy-agent"
    │
    ▼
Intent classifier → "action" (external cloud API call)
    │
    ▼
storage.createTask({ intent: "action", agentId, orchestratorId, input })
    │
    ▼
Queue worker (2s poll) picks up pending task
    │
    ▼
isDockerAvailable() + intent === "action" ?
  Yes → executeTaskInDocker(taskId)
  No  → executeTask(taskId)
    │
    ▼  [Docker path]
issueTaskToken(taskId)
docker run nanoorch-agent:latest (--network none, --memory 512m, ...)
Container calls POST /internal/proxy/openai/v1/chat/completions
    │
    ▼  [Proxy]
Verify task token → strip Authorization → inject real OpenAI key → forward
    │
    ▼  [Back in Docker executor]
AI returns tool_call: aws_list_ec2_instances
Server executes: new EC2Client({...}).send(new DescribeInstancesCommand())
Sends tool_result back to container stdin
Container continues inference → final text response
    │
    ▼
revokeTaskToken(taskId)
storage.updateTask({ status: "completed", output })
taskLogEmitter.emit("task:<id>", lastLog)
WebSocket broadcast → chat UI shows agent response
dispatchNotification("task.completed", ...)
```

### Flow 2 — Approval gate in a Slack thread

```
Slack user DMs bot: "deploy the new release to production"
    │
POST /api/comms/slack/:channelId (X-Slack-Signature verified)
    │
slackHandler creates task with commsThreadId
    │
Executor runs task → agent calls request_approval tool
    │
storage.createApprovalRequest({ status: "pending", ... })
dispatchApprovalCard() → POST Slack Block Kit card to thread
    (card has "Approve" and "Reject" buttons)
    │
Task execution pauses (awaits approval)
    │
Slack user clicks "Approve" button
    │
POST /api/comms/slack/actions (Block Kit action payload)
    │
Server resolves approval_request → status: "approved"
    │
Task executor resumes:
  Tool result: "Approval granted"
  Agent continues → executes deployment
    │
dispatchCommsReply() → posts completion message to Slack thread
```

### Flow 3 — GitHub push triggers an agent task

```
Developer pushes to main branch
    │
GitHub sends POST /api/webhooks/github/:triggerId
(X-Hub-Signature-256: sha256=<hmac>)
    │
Server computes HMAC-SHA256 of rawBody using trigger.secretToken
timingSafeEqual(computed, received) → verified
    │
Event type: "push" — matches trigger.eventTypes (or wildcard)
    │
Resolve prompt template:
  "Push to {{payload.repository.name}} on {{payload.ref}} by {{payload.pusher.name}}"
  → "Push to my-api on refs/heads/main by alice"
    │
storage.createTask({ input: rendered_prompt, agentId, orchestratorId })
storage.createTriggerEvent({ status: "success", taskId })
    │
Response: 200 OK  (fast — task runs asynchronously)
    │
Queue worker picks up task → agent analyses push and takes action
```

### Flow 4 — SAML SSO login

```
User clicks "Sign in with Okta" on /login page
    │
GET /api/auth/sso/saml/:id/initiate
    │
Server loads sso_providers row → constructs SAML config
new SAML({ entryPoint, cert, issuer, callbackUrl })
saml.getAuthorizeUrlAsync() → IdP redirect URL
    │
session.samlProviderId = id
302 Redirect → Okta SSO URL
    │
User authenticates at Okta
Okta POSTs SAMLResponse to ACS URL
    │
POST /api/auth/sso/saml/:id/acs
    │
saml.validatePostResponseAsync(body)
Extract email from NameID assertion
    │
storage.getUserByEmail(email) → found? use existing : create new user
  (new user gets defaultRole from sso_providers row)
    │
session.userId = user.id
session.userRole = user.role
    │
302 Redirect → /workspaces
```

---

## 32. MCP Server

NanoOrch exposes a **Model Context Protocol (MCP) server** at `POST/GET/DELETE /mcp` using the `@modelcontextprotocol/sdk` `StreamableHTTPServerTransport`. This lets any MCP-compatible AI client (Claude Desktop, custom agents) remotely control a workspace through 8 structured tools, authenticated with workspace-scoped API keys.

### Authentication

MCP API keys are created per workspace by workspace admins via the **MCP** page in the sidebar or the REST API. Each key is:

- Generated as `nano_mcp_<32-hex-chars>` (plaintext, shown once)
- Stored as a SHA-256 hash in the `mcp_api_keys` table — the raw value is never persisted
- Sent by clients as an HTTP `Authorization: Bearer nano_mcp_...` header on every request
- Scoped to a single workspace — each session inherits the workspace ID of the matching key

### Session Lifecycle

```
Client sends POST /mcp  (Authorization: Bearer <key>)
    │
    ▼
mcpAuthMiddleware: SHA-256 hash key → lookup mcp_api_keys → update last_used_at
    │
    ▼
new StreamableHTTPServerTransport({ sessionIdGenerator })
new McpServer (createMcpServer(workspaceId)) → connect(transport)
mcpSessions.set(sessionId, transport)
    │
    ▼
Client sends GET /mcp?sessionId=<id>  → SSE stream opens
    │
    ▼
Client sends DELETE /mcp?sessionId=<id>  → session closed, Map entry removed
```

Sessions are held in an in-memory `Map<sessionId, StreamableHTTPServerTransport>`. Session cleanup on `DELETE` calls `transport.close()`.

### Tool Inventory

| Tool | Input | What it does |
|---|---|---|
| `list_orchestrators` | — | Returns all orchestrators (id, name, status, provider, model, task counts) |
| `list_agents` | — | Returns all agents (id, name, orchestratorId, provider, model, intent, active) |
| `run_task` | `orchestratorId`, `agentId`, `input` | Creates a task and runs it via `executeTask`; returns output or error |
| `get_task_status` | `taskId` | Returns status, input, output, error, and last 5 log entries |
| `list_pending_approvals` | — | Lists all `pending` approval requests (id, action, impact) |
| `approve_request` | `approvalId`, `decision`, `resolution?` | Resolves an approval as `approved` or `rejected` |
| `trigger_pipeline` | `pipelineId` | Creates a pipeline run and calls `runPipeline()` |
| `fire_scheduled_job` | `jobId` | Creates an immediate task from the job's prompt and orchestrator |

### Storage

`mcp_api_keys` table (created by `create_mcp_api_keys` incremental migration):

| Column | Type | Notes |
|---|---|---|
| `id` | `varchar` (UUID) | Primary key |
| `workspaceId` | `varchar` | Foreign key → workspaces |
| `name` | `varchar` | Human-readable label |
| `keyHash` | `varchar` | SHA-256 of the raw key |
| `createdAt` | `timestamp` | Creation time |
| `lastUsedAt` | `timestamp` | Set on every authenticated request |

### Claude Desktop Integration

The MCP page generates a ready-to-paste Claude Desktop config snippet. Users copy their raw API key, paste the config into `~/.config/claude/claude_desktop_config.json`, and Claude can immediately call all 8 tools against the workspace.

---

*This document describes the NanoOrch system as of March 2026. All table names, route paths, environment variables, and tool names are sourced directly from the production codebase.*

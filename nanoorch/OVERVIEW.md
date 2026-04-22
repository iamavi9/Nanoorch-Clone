# NanoOrch — AI Agent Orchestrator Platform

## Overview

NanoOrch is a self-hosted, multi-tenant AI agent orchestrator platform designed to provide isolated workspaces for teams, manage multiple AI orchestrators, facilitate agent creation and management, and execute tasks in real-time or on schedule. It integrates deeply with cloud providers and developer platforms to enable comprehensive AI-driven automation, with a hardened security model suitable for production deployments.

## User Preferences

The user prefers that the AI agent operates with a clear understanding of its role within the multi-tenant architecture, respecting workspace isolation and managing resources efficiently. The agent should be capable of understanding and executing tasks across various integrations, ensuring secure handling of credentials. It should also provide real-time updates and notifications for task execution. The user values a system that is easily deployable via Docker and allows for straightforward configuration and rebranding.

## System Architecture

NanoOrch is built with a Node.js + Express (TypeScript) backend and a React + Vite frontend using Wouter for routing and TanStack Query for data fetching, styled with shadcn/ui. PostgreSQL with Drizzle ORM serves as the database.

**Key Architectural Decisions:**
- **Multi-tenancy:** Isolated workspaces for teams, each with configurable orchestrators.
- **AI Providers:** Supports OpenAI, Anthropic, Gemini, Ollama, and **vLLM** (self-hosted GPU clusters), configurable per orchestrator. vLLM API keys are stored AES-256-GCM encrypted per orchestrator.
- **Task Execution:** In-process `LocalExecutor` for development and Docker-isolated `DockerExecutor` for production, using ephemeral containers for tasks.
- **Real-time Communication:** Utilizes SSE for task log streaming and WebSockets for live log push.
- **Authentication & Authorization:** Session-based authentication with `express-session` and 3-tier RBAC: global admin (`users.role="admin"`) → workspace admin (`workspace_members.role="admin"`) → member. Login response includes `workspaceAdminIds` for client-side routing. Optional **SSO** via OIDC (openid-client v6, PKCE+S256) or SAML 2.0 (@node-saml/node-saml); global admin manages providers at `/admin/sso`; users are auto-provisioned on first SSO login with the provider's `defaultRole`; CSRF exemptions apply to all SSO callback routes. `APP_URL` env var (optional) sets the canonical origin for callback/ACS/metadata URLs.
- **Workspace Resource Limits:** Per-workspace `workspaceConfig` table (migration `0004_workspace_config.sql`) stores optional quotas (maxOrchestrators, maxAgents, maxChannels, maxScheduledJobs) and provider allow-lists (allowedAiProviders, allowedCloudProviders, allowedChannelTypes). Null = unlimited/unrestricted. Enforcement returns 409 on quota exceeded and 403 on disallowed provider.
- **Data Security — Credentials at rest:** Integration credentials (cloud, DevTools, knowledge base) encrypted with AES-256-GCM before storage. Key sourced from `ENCRYPTION_KEY` env var (or `ENCRYPTION_KEY_FILE` for Docker secrets); derived from `SESSION_SECRET` as a fallback.
- **Data Security — Docker secrets (`_FILE` pattern):** All sensitive environment variables (`DATABASE_URL`, `SESSION_SECRET`, `ADMIN_PASSWORD`, `ENCRYPTION_KEY`, all AI provider keys) support a companion `<NAME>_FILE` variant. When set, the app (`server/lib/secrets.ts`) reads the value from the specified file path rather than the env var — keeping real secrets out of `docker inspect Env`. The helper compose file `docker-compose.secrets.yml` and setup script `secrets/create-secrets.sh` automate this for production.
- **Data Security — Inference proxy:** Agent task containers never receive real AI provider API keys. The server issues a short-lived task token (32 random hex bytes, 15-minute TTL); the container receives it as all three provider key env vars. All AI calls are proxied through `/internal/proxy/:provider/*` where the server verifies the token, strips it, injects the real provider key, and forwards the request. The token is revoked immediately after the task completes.
- **Data Security — Container hardening:** All agent task and code-sandbox containers run unconditionally with `--cap-drop ALL` and `--security-opt no-new-privileges`. Optionally: custom seccomp profile via `SECCOMP_PROFILE` env var (hardened profile included at `agent/seccomp/nanoorch.json`); gVisor user-space kernel via `SANDBOX_RUNTIME=runsc` (sandbox) and `AGENT_RUNTIME=runsc` (agent task containers).
- **Scheduled Jobs:** In-process `node-cron` scheduler with timezone support. Each job can specify an explicit **intent override** (`auto-detect`, `conversational`, `action`, `code_execution`) so the LLM classifier is bypassed for known workloads, and an optional **bypassApproval** flag to skip approval gates for automated tasks.
- **Notification System:** In-process HTTP dispatcher for Slack, Teams, Google Chat, and generic webhooks, supporting both inbound task triggers and outbound event notifications.
- **Two-way Comms:** A workspace flagged `isCommsWorkspace=true` can add Slack, Teams, or Google Chat inbound channels. Inbound messages are verified (HMAC-SHA256 for Slack, Microsoft JWT for Teams, optional token for Google Chat), routed to an agent, and the agent's reply is posted back in the same Slack thread, Teams conversation, or Google Chat space. Thread continuity tracked in the `comms_threads` table (including `history` jsonb for last-50-exchange memory). DM allowlist (`allowedUsers` in channel config) restricts which user IDs may interact. Bypass phrases in the message text skip the approval gate. Slash commands (`/status`, `/reset`, `/compact`, `/help`) are handled before task creation. Typing indicators (Slack placeholder updated via `chat.update`; Teams `typing` activity) give immediate feedback. Image attachment URLs are appended as context notes.
- **Interactive Approval Cards:** When an approval is requested from within a comms thread, a Slack Block Kit card (Approve / Reject buttons) or Teams Adaptive Card is posted into the thread. Button clicks are handled by `POST /api/channels/:id/slack/interactions` (Slack) or the `invoke` activity handler (Teams). On approval, a follow-up task is spawned with `bypassApproval=true`.
- **Model Failover & Task Retry:** Orchestrators have `failoverProvider`/`failoverModel` fields. If the primary AI call fails, `runAgentWithFailover()` in the executor retries with the backup model. Separately, `tasks.retryCount` tracks how many times a task has been re-queued; on failure, if `retryCount < orchestrator.maxRetries`, a new task is created with `retryCount+1` and exponential backoff (1 s → 2 s → 4 s … max 30 s).
- **UI/UX:** The frontend offers a comprehensive dashboard for managing workspaces, orchestrators, agents, tasks, channels, integrations, and scheduled jobs. The workspace sidebar is collapsible to a 60 px icon-only rail — icons remain clickable with hover tooltips, and the collapsed/expanded preference is persisted in `localStorage`.
- **Agent Sandbox:** Agents can execute Python/JavaScript code in a gVisor sandboxed container with resource limits and network isolation.
- **Intent Classification:** An LLM-based classifier routes tasks to appropriate execution paths (`action` → DockerExecutor, `code_execution` → sandbox, `conversational` → LocalExecutor). Scheduled jobs and event triggers support an explicit intent override so that classification is skipped for predictable workloads.
- **Session Store:** `connect-pg-simple` backed by PostgreSQL by default; reuses the application's shared `pg.Pool`. When `REDIS_URL` is set, sessions switch to `connect-redis` backed by `ioredis`. An API compatibility shim (`makeNodeRedisCompat()` in `server/lib/redis.ts`) bridges the ioredis calling convention to the node-redis v4 API that connect-redis expects. Sessions survive container restarts in both modes.
- **MCP Server:** An HTTP/SSE Model Context Protocol server at `/mcp` (using `@modelcontextprotocol/sdk` `StreamableHTTPServerTransport`) exposes 8 workspace-scoped tools (`list_orchestrators`, `list_agents`, `run_task`, `get_task_status`, `list_pending_approvals`, `approve_request`, `trigger_pipeline`, `fire_scheduled_job`). Workspace admins create API keys (`nano_mcp_<hash>`, stored as SHA-256 hashes) from the **MCP** page; keys are sent as `Authorization: Bearer` headers. Compatible with Claude Desktop and any MCP client.

**Core Features:**
- Multi-tenant workspaces with isolated environments.
- Per-workspace orchestrators with customizable AI providers, models, and settings.
- Agent management with individual instructions, memory, and tool selection.
- Task queue with real-time execution and monitoring via SSE/WebSocket.
- Cron-based scheduled jobs with presets and manual triggers.
- Inbound channels (webhook/API) to trigger tasks.
- Outbound notification channels for task events (completion/failure).
- Integrated chat UI with agent mention functionality and chat-driven parallel multi-agent workflow support (coordinator agent can spawn specialist agents in parallel via `spawn_agent` tool; subtask progress shown in real-time in the chat bubble).
- **Approval Gates:** Agents can call `request_approval` tool mid-task to pause and request human sign-off before executing high-impact actions. Pending approvals appear in the dedicated Approvals page with a sidebar badge count.
- **Pipeline/DAG Chaining:** Sequential agent pipelines where each step's output is passed as context to the next step. Supports scheduled (cron) execution and manual triggers. Run history with step-level status tracking.
- **Observability:** Token usage and cost tracking across all providers (OpenAI, Anthropic, Gemini, Ollama, vLLM). Recharts dashboard with daily usage charts, per-agent breakdown, and provider/model cost summaries.
- **Git Agents (repo-driven automation):** Connect Git repositories (GitHub/GitLab) to a workspace. A `.nanoorch.yml` file in the repo root defines agent automations triggered by push/PR/MR events. The platform polls for changes, dispatches matching agents, and posts structured feedback comments back to the PR/MR via the Git API.
- **Database integrations:** Agents can connect to external PostgreSQL databases via 5 tools (`pg_list_schemas`, `pg_list_tables`, `pg_describe_table`, `pg_query` read-only SELECT, `pg_execute` write with mandatory approval gate). Connection strings are stored AES-256-GCM encrypted.
- **Event-Driven Triggers:** Per-workspace webhook endpoints (`/api/webhooks/github/:id`, `/api/webhooks/gitlab/:id`, `/api/webhooks/jira/:id`) that fire an AI agent task on external events. GitHub and GitLab payloads are HMAC-SHA256 verified; Jira uses a shared secret token. Agent prompt supports `{{payload.field}}` template substitution. All webhook calls are logged to the `trigger_events` table for audit and debugging. Managed via the **Triggers** page in the workspace sidebar.
- **Workspace Limits UI:** Global admins see a gear icon on each workspace card (WorkspacesPage). Clicking it opens a "Workspace Limits" dialog with two tabs — Resource Quotas (numeric inputs per resource type) and Allowed Providers (toggle-then-checkbox pattern for AI providers, cloud integrations, channel types).
- **Two-way Slack/Teams/Google Chat inbound:** Comms workspaces receive messages from Slack (`app_mention`, `message.im`), Teams (Bot Framework activities), and Google Chat (webhook events), route them to agents, and post replies back to the originating thread or conversation. Includes DM allowlist, bypass-approval phrases, slash commands, typing indicators, image notes, and per-thread history.
- **Interactive Approval Cards:** Approval requests originating from comms threads send Block Kit (Slack) or Adaptive Card (Teams) interactive cards with Approve/Reject buttons — no need to switch to the web UI.
- **Model Failover & Task Retry:** Per-orchestrator `failoverProvider`/`failoverModel` for automatic retry on primary AI failure; per-task `retryCount` with exponential backoff up to `maxRetries`.
- **Security hardening — three independent layers:** (1) Docker secrets via `_FILE` env var pattern; (2) container isolation — `--cap-drop ALL`, `--security-opt no-new-privileges`, optional seccomp profile, optional gVisor runtime; (3) inference proxy — agent containers never hold real AI keys, only short-lived task tokens revoked after task completion.
- Automated database migrations on boot.
- Supports rebranding via simple configuration changes.

## External Dependencies

- **Database:** PostgreSQL (via Drizzle ORM)
- **AI Providers:**
    - OpenAI API
    - Anthropic API
    - Gemini API
    - Ollama (local or remote instance, custom `baseUrl`)
    - vLLM (self-hosted GPU cluster; OpenAI-compatible REST API; per-orchestrator encrypted API key)
- **Cloud Providers:**
    - Amazon Web Services (AWS)
    - Google Cloud Platform (GCP)
    - Microsoft Azure
- **Knowledge Base:**
    - RAGFlow
- **Developer Platforms:**
    - Jira
    - GitHub
    - GitLab
- **ITSM Integrations:**
    - ServiceNow (Basic Auth: `instanceUrl` + `username` + `password`; 9 tools: `servicenow_search_records`, `servicenow_get_incident`, `servicenow_create_incident`, `servicenow_update_record`, `servicenow_add_work_note`, `servicenow_get_ritm`, `servicenow_create_ritm`, `servicenow_create_change_request`, `servicenow_get_catalog_items`)
- **Database Integrations:**
    - External PostgreSQL (connection string stored AES-256-GCM encrypted; 5 agent tools: `pg_list_schemas`, `pg_list_tables`, `pg_describe_table`, `pg_query` read-only SELECT, `pg_execute` write operations with built-in approval gate)
- **Messaging Integrations (agent tools + two-way inbound):**
    - Slack (inbound two-way via Bot Token + Signing Secret; agent tools: `slack_send_message`, `slack_send_notification`)
    - Microsoft Teams (inbound two-way via Bot Framework App ID/Password; agent tool: `teams_send_message`)
    - Google Chat (inbound two-way via webhook + optional verification token; agent tools: `google_chat_send_message`, `google_chat_send_card`)
- **Notification Services (outbound channels):**
    - Slack incoming webhook
    - Microsoft Teams incoming webhook
    - Google Chat incoming webhook
    - Generic webhook
- **Session / Cache:** Redis (optional; `REDIS_URL` env var); ioredis client with `makeNodeRedisCompat()` shim for connect-redis compatibility
- **Containerization:** Docker (for `DockerExecutor`, code sandbox, and deployment)
- **Container Security:** gVisor (`runsc`) runtime for kernel-level isolation of agent/sandbox containers; custom seccomp profile (`agent/seccomp/nanoorch.json`) for syscall restriction
- **SSO Libraries:** `openid-client` v6 (OIDC discovery, PKCE, authorization code grant); `@node-saml/node-saml` (SAML 2.0 SP: initiate, validate assertion, generate SP metadata)

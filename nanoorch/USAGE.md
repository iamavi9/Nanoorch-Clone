# NanoOrch — Usage Guide

A step-by-step walkthrough for setting up workspaces, agents, integrations, approval gates, pipelines, observability, scheduled jobs, notification channels, workspace limits, chatting with your agents, and connecting AI clients via the MCP server.

---

## Table of Contents

1. [Logging in](#1-logging-in)
2. [Creating a workspace](#2-creating-a-workspace)
3. [Creating an orchestrator](#3-creating-an-orchestrator)
4. [Creating agents](#4-creating-agents)
5. [Chatting with agents](#5-chatting-with-agents)
6. [Running code from chat](#6-running-code-from-chat)
7. [Submitting tasks](#7-submitting-tasks)
8. [Adding integrations](#8-adding-integrations)
9. [Setting up channels](#9-setting-up-channels)
10. [Scheduled jobs](#10-scheduled-jobs)
11. [Approval gates](#11-approval-gates)
12. [Pipeline / DAG chaining](#12-pipeline--dag-chaining)
13. [Observability](#13-observability)
14. [Adding members and workspace admins](#14-adding-members-and-workspace-admins)
15. [Workspace resource limits](#15-workspace-resource-limits)
16. [Member experience](#16-member-experience)
17. [Secure deployment — Docker secrets](#17-secure-deployment--docker-secrets)
18. [SSO — OIDC and SAML 2.0](#18-sso--oidc-and-saml-20)
19. [Event-driven triggers](#19-event-driven-triggers)
20. [MCP Server — remote AI client access](#20-mcp-server--remote-ai-client-access)

---

## 1. Logging in

Go to `http://<your-host>:3000` and log in with your credentials.

- Default global admin: `admin` / `admin` (if you didn't set `ADMIN_USERNAME`/`ADMIN_PASSWORD`)
- After login you are routed based on your role:
  - **Global admins** and **workspace admins** → `/workspaces` dashboard
  - **Members** → `/member` (chat-only workspace list)

---

## 2. Creating a workspace

A workspace is an isolated environment for a team or project. Everything — orchestrators, agents, tasks, integrations, channels, scheduled jobs, pipelines, approvals, members — lives inside a workspace.

> **Sidebar tip:** The left sidebar can be collapsed to a compact icon-only rail by clicking the panel toggle button just below the workspace name. Hover over any icon to see its label. Your preference is saved automatically and restored on your next visit.

> Only **global admins** can create workspaces.

1. Click **New Workspace**
2. Enter a name (e.g. `DevOps Team`) and an optional description
3. Click **Create**

The workspace slug is auto-generated from the name and used in member chat URLs (`/chat/:slug`).

---

## 3. Creating an orchestrator

An orchestrator defines which AI provider and model your agents use, plus a shared system prompt for all agents in that orchestrator.

1. Open a workspace → click **Orchestrators** in the sidebar → **New Orchestrator**
2. Fill in:
   - **Name** — e.g. `Main Bot`
   - **Provider** — OpenAI / Anthropic / Gemini / Ollama / vLLM
   - **Model** — pick from the dropdown (or type freely for Ollama and vLLM)
   - **Base URL** — Ollama and vLLM only; e.g. `http://localhost:11434` (Ollama) or `http://192.168.1.100:8000` (vLLM; do not include `/v1` — it is appended automatically)
   - **vLLM API Key** — vLLM only; optional bearer token for your vLLM server; stored AES-256-GCM encrypted
   - **System Prompt** — instructions shared by all agents (e.g. `You are a helpful DevOps assistant.`)
   - **Temperature** — controls creativity (0 = deterministic, 100 = very creative)
   - **Max Tokens** — upper limit per response
   - **Failover Provider / Failover Model** — *(optional)* a backup AI provider and model to retry with if the primary fails; if left blank, failed tasks are not retried with a different model
3. Click **Create**

You can create multiple orchestrators per workspace — useful for separating a "fast" GPT-4o-mini bot from a "powerful" Claude Opus one.

> If a global admin has restricted which AI providers are allowed in this workspace, only the permitted providers will appear in the dropdown.

### Model failover and task retry

When a **Failover Provider** and **Failover Model** are set, the executor automatically tries the backup on primary-model failure. Separately, if the orchestrator's **Max Retries** (`maxRetries`) is greater than 0, failed tasks are re-queued with exponential backoff (1 s → 2 s → 4 s … up to 30 s) up to that limit before marking the task as failed and sending notifications.

---

## 4. Creating agents

Agents live inside an orchestrator and each has its own name, persona instructions, and tool access.

1. Open an orchestrator → **Agents** → **New Agent**
2. Fill in:
   - **Name** — shown in `@mention` autocomplete (e.g. `infra-bot`)
   - **Instructions** — agent-specific persona on top of the orchestrator system prompt
   - **Temperature / Max Tokens** — override the orchestrator defaults if needed
   - **Enable Memory** — if on, the agent remembers facts from past conversations
   - **Tools** — tick which integration tools this agent can call (grouped by provider: Cloud, DevTools, Knowledge)
3. Click **Create**

> **Tip:** Create specialist agents per domain — one for AWS, one for Jira, one for GitHub — and let users `@mention` the right one.

### Agent instructions for DevTools automation

When building an agent that automates Jira, GitHub, or GitLab operations triggered by inbound webhooks, write explicit instructions that tell the agent how to map the incoming payload to the tool parameters:

```
You are a Jira automation agent. When you receive a payload:
1. Extract summary, description, and priority
2. Map priority values (Critical→Highest, High→High, Medium→Medium, Low→Low)
3. Call jira_create_issue with projectKey: ENGINEERING, issueType: Bug
4. Include the original ticket ID in the description for traceability
5. Respond with the created issue key
```

Multiple agents in the same workspace can each target a different project — the shared Jira integration credentials cover all of them.

---

## 5. Chatting with agents

The chat UI is the main way to interact with agents in real time.

1. Open a workspace → **Chat** in the sidebar
2. Type `@` to trigger agent autocomplete
   - Use **↑ / ↓** arrow keys to highlight an agent
   - Press **Enter** or **Tab** to insert the highlighted agent
   - Press **Escape** to dismiss the dropdown
   - Or just click the agent name
3. Continue your message: `@infra-bot list my S3 buckets`
4. Hit **Enter** — the response streams in token by token

### Message types

| What you type | What happens |
|---|---|
| `@agent explain what Lambda is` | Conversational — answered in-process, instant |
| `@agent calculate compound interest on $10k at 5% for 20 years` | Code execution — agent writes and runs Python/JS in an isolated sandbox |
| `@agent list all open P1 bugs in Jira` | Action — agent calls jira_search_issues and returns results |
| `@agent create a GitHub issue for the login timeout bug` | Action — agent calls github_create_issue |
| `@agent trigger the deploy pipeline on main` | Action — agent calls gitlab_trigger_pipeline |

### RAGFlow sources

If a RAGFlow integration is active and the agent queries it, cited document chunks appear in a collapsible **Sources** panel below the agent reply.

---

## 6. Running code from chat

Agents can write and execute Python or JavaScript **inline** — the code runs in a locked-down sandbox on the server.

### What it looks like

1. Type a prompt that requires computation:
   ```
   @data-bot calculate the compound interest on $10,000 at 5% per year over 20 years
   ```
2. The chat shows a pulsing indicator while the code runs:
   ```
   ⚙ running python in sandbox…
   ```
3. The result streams back as soon as it's ready:
   ```
   After 20 years at 5% annual compound interest, $10,000 grows to $26,532.98.
   ```

### Example prompts

| Prompt | What the agent does |
|---|---|
| `@agent what is the SHA-256 hash of "hello world"?` | Writes Python using `hashlib`, runs it, returns the hash |
| `@agent generate a Fibonacci sequence up to 1000` | Writes a loop, returns the list |
| `@agent how many days until December 31, 2026?` | Uses `datetime`, computes the delta |
| `@agent is 104729 a prime number?` | Runs a primality check |

### Sandbox constraints

| Can do | Cannot do |
|---|---|
| Full Python 3.12 standard library | Make network requests (no internet) |
| Full Node.js 20 built-ins | Write files that persist after the run |
| Math, string, datetime, crypto, regex | Access the host machine or other containers |
| Run for up to 15 seconds | Use more than 256 MB of RAM |

---

## 7. Submitting tasks

Tasks are discrete jobs that run through the full executor pipeline (tool-calling loop, Docker isolation in production).

### Via the UI

1. Open an orchestrator → **Tasks** → **New Task**
2. Enter a prompt and optionally pick an agent
3. Click **Submit**
4. Click the task row to open the **Task Detail** page — logs stream in real time via SSE

### Via inbound webhook

Each channel has a unique webhook URL. Send a POST:

```bash
curl -X POST https://<host>/api/channels/<channel-id>/webhook \
  -H "Content-Type: application/json" \
  -d '{"input": "list all open Jira issues in project CORE"}'
```

### Via API key channel

Create a channel with type **API Key**, copy the key, then:

```bash
curl -X POST https://<host>/api/channels/<channel-id>/webhook \
  -H "X-Api-Key: <your-key>" \
  -H "Content-Type: application/json" \
  -d '{"input": "summarise last week CloudWatch errors"}'
```

### Monitoring task logs

- **UI**: Task Detail page — live log stream with color-coded levels (`INFO`, `WARN`, `ERROR`, `TOOL`)
- **WebSocket**: Connect to `ws://<host>/ws` with an active session cookie to receive all log events in real time
- **SSE**: `GET /api/tasks/:id/stream` streams logs for a single task

---

## 8. Adding integrations

Integrations let agents call real AWS, GCP, Azure, Jira, GitHub, GitLab, RAGFlow, ServiceNow, messaging platform, and external PostgreSQL database APIs.

1. Open a workspace → **Integrations** → **Add Integration**
2. Select a provider from the dropdown and enter credentials:

### Cloud Providers

| Provider | Credentials needed |
|---|---|
| **AWS** | Access Key ID, Secret Access Key, Default Region |
| **GCP** | Service Account JSON (paste the full key file contents) |
| **Azure** | Client ID, Client Secret, Tenant ID, Subscription ID |

### DevTools

| Provider | Credentials needed |
|---|---|
| **Jira** | Base URL (e.g. `https://your-org.atlassian.net`), Email, API Token, optional Default Project Key |
| **GitHub** | Personal Access Token (needs `repo`, `issues`, `pull_requests` scopes), optional Default Owner/Org |
| **GitLab** | Base URL (e.g. `https://gitlab.com` or your self-hosted URL), Personal Access Token (needs `api` scope), optional Default Project ID |

### Knowledge Base

| Provider | Credentials needed |
|---|---|
| **RAGFlow** | Base URL (e.g. `http://ragflow:9380`), API Key |

### ITSM

ServiceNow integrations let agents open incidents, track RITMs, submit Change Requests, and search any ServiceNow table.

| Provider | Credentials needed |
|---|---|
| **ServiceNow** | Instance URL (e.g. `https://your-instance.service-now.com`), Username, Password |

> ServiceNow credentials must belong to a user with the **ITIL** role (for incidents/changes) and the **catalog** role (for RITM/catalog operations). The integration uses Basic Auth over HTTPS.

### Database

PostgreSQL integrations give agents read and write access to an external PostgreSQL database. Useful for querying analytics databases, internal data stores, or any Postgres-compatible data source from within a task.

| Provider | Credentials needed |
|---|---|
| **PostgreSQL** | Connection String (e.g. `postgresql://user:password@host:5432/dbname`) |

> The connection string is stored AES-256-GCM encrypted. The database must be reachable from the NanoOrch container (same VPC, open port 5432, or a connection string with SSL).

**Safety:** `pg_execute` (write operations) requires **approval gate** sign-off by default before the agent can run INSERT/UPDATE/DELETE statements. `pg_query` is read-only (SELECT only) and does not require approval.

### Messaging

Messaging integrations give agents the ability to send messages, notifications, and cards to Slack channels, Teams channels, or Google Chat spaces — as part of any task, autonomously. For example, a heartbeat agent can call `slack_send_notification` to post a status update, or a DevOps agent can call `google_chat_send_card` to send a formatted incident report.

| Provider | Credentials needed |
|---|---|
| **MS Teams** | Incoming Webhook URL (from Teams channel connectors) |
| **Slack** | Bot Token (`xoxb-...` from Slack App → OAuth & Permissions), optional Default Channel |
| **Google Chat** | Incoming Webhook URL (from Google Chat space → Manage webhooks) |

3. Choose an **Integration Mode**:
   - **Tool** — agent explicitly calls this integration during tasks (default for all providers except RAGFlow)
   - **Context** — knowledge auto-retrieved before every response (default for RAGFlow)

4. Click **Save Integration** — credentials are AES-256-GCM encrypted before storage
5. Click **Test** to verify credentials (makes a lightweight auth check to the provider)
6. Go to the agent's settings → **Tools** — tick the tools you want this agent to use

> If a global admin has restricted which integration types are allowed in this workspace, disallowed providers will be rejected when you try to save.

### Editing an integration

Click the **Edit** (pencil) button on any integration card to rename it, switch its mode, or rotate credentials (leave fields blank to keep existing encrypted values).

### Available tools by provider

| Provider | Tools |
|---|---|
| AWS | `aws_list_s3_buckets`, `aws_list_s3_objects`, `aws_list_ec2_instances`, `aws_list_lambda_functions`, `aws_get_cloudwatch_logs` |
| GCP | `gcp_list_storage_buckets`, `gcp_list_compute_instances`, `gcp_list_cloud_functions` |
| Azure | `azure_list_resource_groups`, `azure_list_virtual_machines`, `azure_list_storage_accounts` |
| Jira | `jira_list_projects`, `jira_search_issues`, `jira_get_issue`, `jira_create_issue`, `jira_update_issue`, `jira_add_comment`, `jira_list_sprints` |
| GitHub | `github_list_repos`, `github_list_issues`, `github_get_issue`, `github_create_issue`, `github_list_pull_requests`, `github_create_pull_request`, `github_list_workflow_runs` |
| GitLab | `gitlab_list_projects`, `gitlab_list_issues`, `gitlab_get_issue`, `gitlab_create_issue`, `gitlab_list_merge_requests`, `gitlab_create_merge_request`, `gitlab_list_pipelines`, `gitlab_trigger_pipeline` |
| RAGFlow | `ragflow_list_datasets`, `ragflow_query_dataset`, `ragflow_query_multiple_datasets` |
| ServiceNow | `servicenow_search_records`, `servicenow_get_incident`, `servicenow_create_incident`, `servicenow_update_record`, `servicenow_add_work_note`, `servicenow_get_ritm`, `servicenow_create_ritm`, `servicenow_create_change_request`, `servicenow_get_catalog_items` |
| PostgreSQL | `pg_list_schemas`, `pg_list_tables`, `pg_describe_table`, `pg_query` (read-only SELECT), `pg_execute` (write — requires approval gate) |
| Teams | `teams_send_message` |
| Slack | `slack_send_message`, `slack_send_notification` |
| Google Chat | `google_chat_send_message`, `google_chat_send_card` |

> **Security:** Credentials never enter the agent container — all tool calls execute server-side. Raw credentials are never logged.

---

## 9. Setting up channels

Channels have two directions: **inbound** (receive tasks from external systems) and **outbound** (send notifications to external services).

### Inbound channels

Accept incoming requests to trigger tasks on the orchestrator.

1. Open an orchestrator → **Channels** → **New Channel**
2. Choose type:
   - **Webhook** — no auth, anyone with the URL can submit tasks (use only on private networks or trusted sources)
   - **API Key** — requires `X-Api-Key` header
3. Copy the webhook URL shown after creation
4. Point your external system (CI/CD, JSM automation, Slack bot, cron job) at that URL

### Outbound channels

Send notifications when tasks complete or fail.

1. Open an orchestrator → **Channels** → **New Channel**
2. Choose an outbound type:
   - **Slack** — paste the Incoming Webhook URL from Slack channel settings
   - **Teams** — paste the Incoming Webhook URL from Teams channel connectors
   - **Google Chat** — paste the webhook URL from Google Chat space settings
   - **Generic Webhook** — paste any URL; receives a plain JSON payload
3. Select which events trigger the notification: `task.completed`, `task.failed`, or both
4. Click **Send Test Ping** to verify the webhook is reachable before saving
5. Click **View Deliveries** to see the full history of sent notifications and their HTTP responses

> If a global admin has restricted which channel types are allowed in this workspace, disallowed types will be blocked when you try to save.

### Combining inbound + outbound

A common setup: inbound channel receives a webhook from JSM → agent creates a Jira issue → outbound Teams channel notifies the team automatically. Both channels live on the same orchestrator, no extra wiring needed.

### Two-way comms — Slack / Teams / Google Chat inbound

A **comms workspace** is a regular workspace with the **Comms Workspace** toggle enabled. That flag tells NanoOrch to accept inbound Slack, Teams, or Google Chat messages on channels in that workspace, route them to an agent, and post the agent's reply back to the original thread or conversation. Everything else (orchestrators, agents, integrations, quotas) works the same as any other workspace.

**Step 1 — Enable the workspace**

On the Workspaces page, click **New Workspace** (or ask a global admin), toggle **Comms Workspace** on, and save. You can also edit an existing workspace and toggle it on.

**Step 2 — Create a Slack inbound channel**

1. Open an orchestrator → Channels → New Channel
2. Set type to **Slack**
3. Toggle **Enable two-way inbound** on
4. Fill in:
   - **Bot Token** — `xoxb-...` from Slack App → OAuth & Permissions → Bot User OAuth Token
   - **Signing Secret** — from Slack App → Basic Information → Signing Secret
   - **Default Agent ID** — (optional) paste an Agent ID from the **Agents** tab; omit to use the first agent in the orchestrator
   - **DM Allowlist** — (optional) comma-separated Slack user IDs (e.g. `U01ABC, U02DEF`); only these users may DM the bot; leave blank to allow everyone
5. Save — copy the **Events Endpoint** URL shown on the channel card

**Step 3 — Wire up Slack**

1. In your Slack App settings → **Event Subscriptions** → paste the Events Endpoint URL into **Request URL**
   - NanoOrch handles the `url_verification` challenge automatically — Slack will show a green checkmark immediately
2. Under **Subscribe to bot events**, add:
   - `app_mention` — triggers when someone `@mentions` the bot in a channel
   - `message.im` — triggers when someone DMs the bot directly
3. Under **OAuth & Permissions → Scopes**, ensure the bot has at minimum:
   - `chat:write` — to post replies
   - `app_mentions:read` — to receive `@mention` events
   - `im:history` — to receive DM events
   - `chat:write` is also needed for interactive approval card buttons; additionally enable **Interactivity** in your Slack App settings and set the **Request URL** to `https://<your-host>/api/channels/<channel-id>/slack/interactions`
4. Invite the bot to a Slack channel, then mention it: `@YourBot can you check the deploy status?`

**Step 4 — Create a Teams inbound channel**

1. Register a bot in [Azure Portal](https://portal.azure.com) → **App Registrations** → note the **Application (client) ID** and create a **client secret** under Certificates & secrets
2. Create an **Azure Bot** resource, link it to the App Registration
3. Open an orchestrator → Channels → New Channel → type **Teams** → toggle **Enable two-way inbound**
4. Fill in:
   - **App ID** (client ID) and **App Password** (client secret value)
   - **DM Allowlist** — (optional) comma-separated Teams user IDs (the `from.id` field from Bot Framework activities, e.g. `29:1Abc...`); leave blank to allow everyone
5. Copy the **Events Endpoint** URL from the channel card
6. In the Azure Bot resource → **Configuration** → set **Messaging endpoint** to that URL
7. In Azure Bot → **Channels** → add **Microsoft Teams**

> NanoOrch verifies the Bearer JWT on every Teams event request by checking the issuer against `botframework.com` / `microsoftonline.com` and validating the token expiry. No additional certificate setup is required.

**Message routing syntax**

To address a specific agent, prefix the message with `use agent-name:`:
```
use devops-agent: summarize today's incidents
```
Without the prefix, the message goes to the **Default Agent ID** set on the channel (or the first agent in the orchestrator if no default is configured).

To find an agent's ID: open the orchestrator → **Agents** tab → click the agent → the ID is shown in the agent detail panel.

**Bypass approval phrases**

If a message contains any of the following phrases (case-insensitive), the approval gate is automatically skipped for that task — no interactive approval card is sent:

- `without approval`
- `skip approval`
- `approval not needed`
- `no approval needed`
- `bypass approval`

Example: `@NanoOrchBot delete the stale staging resources without approval`

Use this sparingly and only when you trust the action. Global admins can remove the DM allowlist restriction to prevent non-trusted users from using bypass phrases.

**Chat commands (Slack and Teams)**

Send any of these as a standalone message (no agent prefix needed):

| Command | What it does |
|---------|-------------|
| `/status` | Shows the status of the most recent task in this thread |
| `/reset` | Clears the conversation history for this thread (starts fresh context) |
| `/compact` | Summarises and compacts the conversation history (reduces token usage while preserving context) |
| `/help` | Lists available commands |

---

## 10. Scheduled jobs

Create cron jobs that automatically run agent tasks on a repeating schedule.

1. Open a workspace → **Scheduled Jobs** → **New Scheduled Job**
2. Fill in (the form scrolls if needed — Save/Cancel buttons are always pinned at the bottom):
   - **Name** — human-readable label (e.g. `Monday P1 Jira Digest`)
   - **Cron expression** — choose a preset or write a custom expression:
     | Preset | Expression |
     |---|---|
     | Every minute | `* * * * *` |
     | Every 5 minutes | `*/5 * * * *` |
     | Every 15 minutes | `*/15 * * * *` |
     | Every hour | `0 * * * *` |
     | Every day at midnight | `0 0 * * *` |
     | Every Monday at 9am | `0 9 * * 1` |
   - **Timezone** — IANA timezone (e.g. `America/New_York`, `Europe/London`, `UTC`)
   - **Orchestrator** — which orchestrator runs the task
   - **Prompt** — the task content sent to the agent
   - **Intent Classification** — controls how the task is routed to an executor:
     | Intent | Execution path |
     |---|---|
     | Auto-detect (default) | LLM classifier picks the path based on the prompt |
     | Conversational | Runs in-process via LocalExecutor |
     | Docker / Action | Runs in an ephemeral Docker container (requires `DOCKER_SOCKET`) |
     | Sandbox / Code execution | Runs in a gVisor-sandboxed pod (requires K3s) |
   - **Bypass approval gate** — when checked, tasks generated by this job skip any configured approval gates; useful for fully automated pipelines where human review is not needed
3. Click **Create** — the job is registered immediately and runs on schedule

### Managing scheduled jobs

- **Enable/Disable** — toggle without deleting the job
- **Run Now** — manually trigger the job immediately (for testing)
- **Edit** — update the schedule, prompt, or orchestrator
- **Delete** — removes the job permanently

### Example schedules

| Goal | Cron | Prompt |
|---|---|---|
| Weekly Jira P1 digest | `0 9 * * 1` | *"Search all open P1 issues in Jira and summarise them by assignee"* |
| Hourly CloudWatch check | `0 * * * *` | *"Fetch the last hour of ERROR logs from the /app/prod log group"* |
| Daily GitHub PR review | `0 8 * * *` | *"List all open PRs in the main repo that have been open more than 2 days"* |
| GitLab pipeline health | `*/30 * * * *` | *"List all failed pipelines on the main branch in the last hour"* |

Pair scheduled jobs with outbound notification channels so results are automatically posted to Slack or Teams.

---

## 11. Approval gates

Approval gates let agents pause mid-task and require a human decision before executing a write operation. This is particularly useful for tasks that create, modify, or delete real resources.

### How the agent requests approval

Configure the agent's instructions to call `request_approval` before high-impact actions:

```
Before creating, modifying, or deleting any resource, call request_approval with:
- action: a one-line description of what you are about to do
- impact: the consequence if approved (e.g. "Creates INFRA-77 in Jira project ENGINEERING")

Only proceed after receiving approval. If rejected, acknowledge and stop.
```

### Reviewing and resolving approvals — web UI

1. When an agent pauses, the **Approvals** entry in the sidebar shows a badge with the pending count
2. Open **Approvals** → find the pending request
3. Review the agent's proposed action and impact description
4. Click **Approve** — the task resumes immediately from where it paused
5. Click **Reject** — the task is cancelled and the agent acknowledges the rejection

All resolved approvals remain in the history with the reviewer's name and timestamp.

### Reviewing and resolving approvals — Slack / Teams (interactive cards)

When a task originates from a Slack or Teams message in a **comms workspace**, NanoOrch sends an interactive approval card directly into the same thread instead of waiting for a web-UI review:

- **Slack**: a Block Kit card with **Approve** and **Reject** buttons appears in the thread. Any workspace admin can click a button — the decision is recorded, a confirmation message is posted, and the agent continues (or stops) automatically.
  - Requires **Interactivity** enabled in Slack App settings, with the **Request URL** set to `https://<your-host>/api/channels/<channel-id>/slack/interactions`
- **Teams**: an Adaptive Card with **Approve** and **Reject** action buttons is sent into the conversation. Clicking a button triggers the `invoke` activity, which NanoOrch handles to resolve the approval.

> **Bypass approval**: include a bypass phrase in your message (e.g. "…without approval") and the approval gate is skipped entirely for that task. See the [Two-way comms section](#two-way-comms--slack--teams-inbound) for the full list of bypass phrases.

### Approval flow summary

```
User sends message
       ↓
Agent processes → calls request_approval tool
       ↓
Task pauses — approval appears in sidebar (badge count +1)
   (if task came from Slack/Teams: interactive card also sent to thread)
       ↓
Admin reviews → Approve or Reject (web UI or Slack/Teams button)
       ↓
Approve: task resumes → action executes → task completes
Reject:  task cancelled → agent notified → user informed
```

---

## 12. Pipeline / DAG chaining

Pipelines chain multiple agents together, passing the output of each step as context to the next. Use this for multi-stage workflows — for example: fetch data → process it → post a report.

### Creating a pipeline

1. Open a workspace → **Pipelines** → **New Pipeline**
2. Give the pipeline a name and optional description
3. Add steps:
   - Each step selects an **Orchestrator**, **Agent**, and a **Prompt**
   - Steps run in order — the output of step N is injected as context for step N+1
4. Optionally set a **Cron expression** and **Timezone** for automatic execution
5. Click **Create**

### Running a pipeline

- **Manual**: click **Run Now** on the pipeline card
- **Scheduled**: automatic when a cron expression is configured

### Monitoring pipeline runs

Each run creates a record showing:
- Overall status (running / completed / failed)
- Per-step status with timestamps
- The output of each step

Click any run to see the full step-by-step log.

### Example pipeline: Weekly infrastructure report

| Step | Agent | Prompt |
|---|---|---|
| 1 | infra-bot | "List all running EC2 instances in us-east-1 and their current status" |
| 2 | data-bot | "Summarise the instance list from context into a cost-saving recommendations table" |
| 3 | jira-bot | "Create a Jira ticket in INFRA with the recommendations table as the description" |

Cron: `0 9 * * 1` (every Monday at 9am)

---

## 13. Observability

The **Observability** page (workspace sidebar) gives a full picture of AI token usage and estimated costs across the workspace.

### What it shows

Four summary cards at the top give an at-a-glance view:

| Card | What it shows |
|---|---|
| **Total Tokens** | Combined input + output tokens for the selected period, with in/out split shown below |
| **Est. Cost** | Estimated USD cost for the selected period based on per-token pricing |
| **Agent Calls** | Number of token-usage records (proxy for task invocations) |
| **Active Agents** | Number of distinct agents with at least one token record |

Below the cards:

| Section | Contents |
|---|---|
| **Daily Token Usage** | Line chart of input and output token consumption per day over the selected window |
| **Per-agent breakdown** | Table of agents ranked by total tokens consumed |
| **Provider/model summary** | Cost breakdown by AI provider and model (OpenAI, Anthropic, Gemini, Ollama) |

### How to use it

1. Open a workspace → **Observability** in the sidebar
2. Use the data to identify expensive agents, unexpected usage spikes, or opportunities to switch to cheaper models

Costs are estimated using published provider pricing and update in real time as tasks complete. Ollama and vLLM are shown as zero cost (self-hosted).

---

## 14. Adding members and workspace admins

NanoOrch has three levels of access: **global admin**, **workspace admin**, and **member**.

| Role | How to assign | What they can do |
|------|--------------|-----------------|
| **Global admin** | Set `users.role = "admin"` (done via Members page by an existing global admin) | Full platform access — all workspaces, create workspaces, set limits, manage all users |
| **Workspace admin** | Add user to workspace with `admin` role | Full access within that workspace — orchestrators, agents, integrations, pipelines, approvals, etc. |
| **Member** | Add user to workspace with `member` role | Chat-only — `/chat/:slug` for their assigned workspaces |

### Adding a new user to a workspace

1. Open a workspace → **Members** → **Add Member**
2. Fill in:
   - **Username** — login name
   - **Display Name** — shown in the UI
   - **Password** — set an initial password; ask them to change it
   - **Role** — `admin` (workspace admin) or `member` (chat only)
3. Click **Create** — creates the account and adds them to the workspace in one step

### Adding an existing user to another workspace

**Add Member** → switch to the **Existing User** tab → search by username → choose a role → confirm.

### Removing a member

Click the trash icon next to their name in the members list. This removes them from the workspace but does not delete their account.

---

## 15. Workspace resource limits

Global admins can control how much each workspace can consume. On the **Workspaces** page, hover over a workspace card and click the **⚙** gear icon to open the **Workspace Limits** dialog.

### Resource Quotas tab

Set upper bounds for each resource type. Leave a field blank to allow unlimited.

| Quota | What it limits |
|-------|---------------|
| Max orchestrators | Total orchestrators in the workspace |
| Max agents | Total agents across all orchestrators |
| Max channels | Total channels across all orchestrators |
| Max scheduled jobs | Total scheduled jobs in the workspace |

When a quota is reached, further creation attempts return an error message showing the limit.

### Allowed Providers tab

Toggle **Restrict** next to a group to enable the allow-list for that category, then check only the providers you want to permit.

| Group | Restricts |
|-------|----------|
| **AI Providers** | Which of openai / anthropic / gemini / ollama can be used when creating an orchestrator |
| **Cloud Integrations** | Which of aws / gcp / azure / jira / github / gitlab / ragflow / teams can be added as integrations |
| **Channel Types** | Which outbound types (slack / teams / google_chat / generic_webhook) can be created |

When all switches are off, the workspace is unrestricted. Turning a switch on without checking any boxes blocks all providers in that category.

Click **Save Limits** to apply. Changes take effect immediately for new resources; existing ones are unaffected.

---

## 16. Member experience

When a `member` logs in they see a clean interface with no admin UI:

- `/member` — list of workspaces they belong to
- `/chat/:slug` — the chat page for that workspace

They can `@mention` any agent in their assigned workspace and chat normally. They cannot see orchestrator settings, task logs, integration credentials, pipelines, approvals, scheduled jobs, or other workspaces.

### Sharing the chat link with a member

Give them:
```
http://<your-host>:3000/login
```
After login they are automatically redirected to `/member`.

Or link them directly to the workspace chat:
```
http://<your-host>:3000/chat/<workspace-slug>
```

---

## 17. Secure deployment — Docker secrets

By default, secrets (`SESSION_SECRET`, `ADMIN_PASSWORD`, AI provider keys, etc.) are passed as plain environment variables in `.env` — visible in `docker inspect Env`. For production environments, use Docker secrets to keep real values out of `docker inspect` output entirely.

### How the `_FILE` pattern works

Every secret variable in NanoOrch supports a companion `<NAME>_FILE` variant. When `SESSION_SECRET_FILE=/run/secrets/session_secret` is set, the app reads the value from that file instead of the `SESSION_SECRET` env var. Docker mounts the secret file read-only inside the container at `/run/secrets/<name>` — `docker inspect` shows only the path, never the real value.

### Quick setup

**Step 1 — Run the setup script:**

```bash
chmod +x secrets/create-secrets.sh
./secrets/create-secrets.sh
```

This prompts for passwords, generates cryptographically random values for `session_secret` and `encryption_key`, and creates all required `secrets/*.txt` files. File permissions are set to `0400` automatically.

**Step 2 — Start using the secrets compose file:**

```bash
docker compose -f docker-compose.secrets.yml up -d
```

**Step 3 — Verify** (`docker inspect` should show paths, not real values):

```bash
docker inspect nanoorch-app | grep -A 20 '"Env"'
# Should show SESSION_SECRET_FILE=/run/secrets/session_secret
# NOT your actual session secret value
```

### Supported `_FILE` variables

| Variable | Secret file |
|---|---|
| `DATABASE_URL_FILE` | `secrets/database_url.txt` |
| `SESSION_SECRET_FILE` | `secrets/session_secret.txt` |
| `ADMIN_PASSWORD_FILE` | `secrets/admin_password.txt` |
| `ENCRYPTION_KEY_FILE` | `secrets/encryption_key.txt` |
| `AI_INTEGRATIONS_OPENAI_API_KEY_FILE` | `secrets/openai_api_key.txt` |
| `AI_INTEGRATIONS_ANTHROPIC_API_KEY_FILE` | `secrets/anthropic_api_key.txt` |
| `AI_INTEGRATIONS_GEMINI_API_KEY_FILE` | `secrets/gemini_api_key.txt` |

### Combining with gVisor + seccomp

For a fully hardened deployment, add these to `.env` (when using `docker-compose.yml`) or as env vars in `docker-compose.secrets.yml`:

```env
SANDBOX_RUNTIME=runsc            # gVisor for code-execution sandbox containers
AGENT_RUNTIME=runsc              # gVisor for agent action-task containers
SECCOMP_PROFILE=/etc/nanoorch/seccomp/nanoorch.json
```

A hardened seccomp profile is included at `agent/seccomp/nanoorch.json`. Copy it to a stable host path before setting `SECCOMP_PROFILE`.

See [`secrets/README.md`](./secrets/README.md) and the [Security Hardening](./README.md#security-hardening) section of the README for full details on all three security layers.

---

## 18. SSO — OIDC and SAML 2.0

Single Sign-On lets your users log in with their existing corporate identity (Google Workspace, Okta, Azure AD, etc.) instead of a local password. Global admins configure SSO providers at `/admin/sso` — accessible via the **SSO Settings** button on the Workspaces page.

> **`APP_URL` requirement:** Set `APP_URL=https://your-nanoorch-host.com` in your `.env` (or docker-compose environment) so that callback and ACS URLs are generated correctly. Without it, URLs are derived from request headers — this works behind Nginx but may be wrong for direct IP access.

---

### OIDC (OpenID Connect)

Compatible with Google Workspace, Azure AD (v2), Okta, Auth0, Keycloak, and any OIDC-compliant IdP.

**Step 1 — Create an OAuth 2.0 app in your IdP**

Register a new application in your identity provider. You will need:
- A **Client ID** and **Client Secret**
- A **Redirect URI** — set it to: `<APP_URL>/api/auth/sso/oidc/<provider-id>/callback`
  (You will get the `<provider-id>` after saving the provider in step 2.)

**Step 2 — Add the OIDC provider in NanoOrch**

1. Go to **Workspaces** → **SSO Settings** → **Add Provider**
2. Set **Type** to `OIDC`
3. Fill in:
   - **Name** — displayed on the login page (e.g. `Google Workspace`)
   - **Discovery URL** — OIDC discovery endpoint:
     - Google: `https://accounts.google.com`
     - Azure AD: `https://login.microsoftonline.com/<tenant-id>/v2.0`
     - Okta: `https://<your-okta-domain>/.well-known/openid-configuration`
   - **Client ID** and **Client Secret** from step 1
   - **Default Role** — role assigned to users auto-provisioned on first login
4. Enable the **Active** toggle
5. Click **Save** — the provider's callback URL is shown in the card

**Step 3 — Register the callback URL in your IdP**

Copy the callback URL from the provider card and add it as an **Authorized redirect URI** in your IdP application settings. The URL format is:
```
<APP_URL>/api/auth/sso/oidc/<provider-id>/callback
```

**Step 4 — Test**

Log out, go to `/login` — an **SSO** button with your provider's name will appear. Click it and complete the IdP login flow. On first login, a new NanoOrch account is created automatically.

---

### SAML 2.0

Compatible with Okta, Azure AD (SAML app), OneLogin, PingFederate, Google Workspace SAML, and any SAML 2.0-compliant IdP.

**Step 1 — Add the SAML provider in NanoOrch first**

1. Go to **Workspaces** → **SSO Settings** → **Add Provider**
2. Set **Type** to `SAML`
3. Fill in:
   - **Name** — displayed on the login page
   - **IdP Entry Point** — the IdP SSO URL (from your IdP configuration)
   - **IdP Certificate** — the IdP's public certificate (PEM format, include the `-----BEGIN CERTIFICATE-----` / `-----END CERTIFICATE-----` lines)
   - **Default Role** — role for auto-provisioned users
4. Click **Save**

**Step 2 — Configure your IdP using SP metadata**

Click the **Metadata** link on the provider card to download/view the SP metadata XML:
```
<APP_URL>/api/auth/sso/saml/<provider-id>/metadata
```

In your IdP, create a new SAML application and import the SP metadata, or manually set:
- **ACS URL (Assertion Consumer Service URL):** `<APP_URL>/api/auth/sso/saml/<provider-id>/acs`
- **Entity ID / Audience:** `<APP_URL>`
- **Name ID format:** Email address (`urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress`)

**Step 3 — Test**

Log out, go to `/login` — an **SSO** button will appear. Click it to be redirected to your IdP.

---

### Auto-provisioning

On a user's **first** SSO login, NanoOrch creates a local account using their email address and the provider's **Default Role**. On subsequent logins the existing account is matched by email — no new account is created.

Auto-provisioned users start with no workspace assignments. A global admin must add them to workspaces from the **Members** page.

---

## 19. Event-driven triggers

Event triggers let GitHub, GitLab, or Jira fire an AI agent task automatically when a push, pull request, merge request, or issue event occurs.

**Access:** Open a workspace → **Triggers** in the sidebar

---

### Creating a trigger

1. Click **Add Trigger**
2. Fill in:
   - **Name** — human-readable label (e.g. `GitHub push → deploy agent`)
   - **Source** — `github`, `gitlab`, or `jira`
   - **Event Type** — the event to respond to (e.g. `push`, `pull_request`, `issue_created`)
   - **Secret / Token** — HMAC signing secret (GitHub/GitLab) or shared token (Jira)
   - **Orchestrator** — which orchestrator runs the triggered task
   - **Agent** — which agent handles it (auto-populated after picking an orchestrator)
   - **Agent Prompt** — prompt sent to the agent; supports `{{payload.field}}` substitution
3. Enable the **Active** toggle
4. Click **Save** — a webhook URL is generated and displayed on the trigger card

---

### Registering the webhook in GitHub

1. Open your GitHub repository → **Settings** → **Webhooks** → **Add webhook**
2. Set:
   - **Payload URL**: the trigger's webhook URL shown in NanoOrch
   - **Content type**: `application/json`
   - **Secret**: the secret you set in the trigger
   - **Which events**: choose individual events or "Send me everything"
3. Click **Add webhook** — GitHub sends a ping event to verify

---

### Registering the webhook in GitLab

1. Open your GitLab project → **Settings** → **Webhooks**
2. Set:
   - **URL**: the trigger's webhook URL
   - **Secret token**: the secret from the trigger
   - **Trigger**: check the events you want (Push events, Merge request events, etc.)
3. Click **Add webhook**

---

### Registering the webhook in Jira

1. In Jira: **Settings** → **System** → **WebHooks** (admin only)
2. Set:
   - **URL**: `<webhook-url>?token=<your-secret>` (append the token as a query param)
   - **Events**: select the issue events to listen for
3. Save

---

### Payload templating

Use `{{payload.field}}` in your **Agent Prompt** to inject values from the incoming webhook JSON:

| Example | Substitution |
|---------|-------------|
| `{{payload.repository.name}}` | GitHub: repo name |
| `{{payload.pusher.name}}` | GitHub: user who pushed |
| `{{payload.ref}}` | GitHub: branch/ref |
| `{{payload.pull_request.title}}` | GitHub PR: title |
| `{{payload.project.name}}` | GitLab: project name |
| `{{payload.issue.summary}}` | Jira: issue summary |

Nested fields and arrays are supported. The full raw payload is also appended to the prompt as additional context.

**Example prompt:**
```
A push was made to {{payload.repository.name}} on {{payload.ref}} by {{payload.pusher.name}}.
Check the last commit message and open any related Jira tickets if there is a TICKET-ID reference.
```

---

### Event history

The **Event History** tab on the Triggers page shows every webhook call for all triggers in the workspace:

| Column | Description |
|--------|-------------|
| Timestamp | When the webhook was received |
| Trigger | Which trigger handled it |
| Source | `github`, `gitlab`, or `jira` |
| Event | The event type sent by the platform |
| Status | `success` (task created) or `error` (reason shown) |
| Task | Link to the spawned task (if successful) |

---

## 20. MCP Server — remote AI client access

The **MCP** page (workspace sidebar) lets you connect Claude Desktop or any Model Context Protocol-compatible AI client directly to a NanoOrch workspace. Once connected, the AI client can run tasks, check approvals, trigger pipelines, and fire scheduled jobs — without using the web UI.

### What the MCP server exposes

| Tool | What the AI client can do |
|------|--------------------------|
| `list_orchestrators` | See all orchestrators in the workspace with status and model info |
| `list_agents` | See all agents, their provider and model, and which orchestrator they belong to |
| `run_task` | Submit a task to a specific agent and wait for the output |
| `get_task_status` | Check the status, output, and recent logs of any task by ID |
| `list_pending_approvals` | See all approvals currently waiting for a human decision |
| `approve_request` | Approve or reject a pending approval with an optional note |
| `trigger_pipeline` | Manually run a pipeline immediately |
| `fire_scheduled_job` | Execute a scheduled job right now, bypassing its cron schedule |

### Step 1 — Create an MCP API key

1. Open a workspace → **MCP** in the sidebar
2. Click **New Key**
3. Enter a name (e.g. `claude-desktop` or `my-agent-script`)
4. Click **Create Key**
5. **Copy the revealed key immediately** — it starts with `nano_mcp_` and is shown only once. It is stored as a SHA-256 hash and cannot be recovered.

> Keys are workspace-scoped. Anyone with the key can call all 8 MCP tools against that workspace. Treat it like a password.

### Step 2 — Connect Claude Desktop

The MCP page displays a ready-to-paste config snippet. Copy it and open:

- **macOS/Linux:** `~/.config/claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

Paste the snippet into the `mcpServers` object (or create the file if it doesn't exist). Replace the `YOUR_API_KEY` placeholder with the key you copied in Step 1.

```json
{
  "mcpServers": {
    "nanoorch": {
      "url": "https://your-host:3000/mcp",
      "transport": "http",
      "headers": {
        "Authorization": "Bearer nano_mcp_<your-key>"
      }
    }
  }
}
```

Restart Claude Desktop. NanoOrch tools will appear in the tool panel.

### Step 3 — Use the tools from Claude

Once connected, you can give Claude natural-language instructions and it will invoke the right tool:

| What you say to Claude | What happens in NanoOrch |
|------------------------|--------------------------|
| "List all orchestrators in my workspace" | `list_orchestrators` runs |
| "Run the infra-bot agent with prompt: list all EC2 instances" | `run_task` creates and executes the task |
| "Are there any pending approvals?" | `list_pending_approvals` returns the queue |
| "Approve the request to create a Jira ticket" | `approve_request` resolves the gate |
| "Fire the weekly report pipeline" | `trigger_pipeline` starts the run |

### Managing keys

The MCP page shows all active keys with their name and last-used timestamp (the raw key is never shown again after creation). To revoke a key, click **Revoke** on its row — it becomes immediately invalid.

---

## 21. Git Agents (repo-driven automation)

Git Agents let you connect a Git repository to NanoOrch so that a `.nanoorch.yml` file in the repo drives agent automation on push, PR, and MR events — no webhook setup required.

**Access:** Open a workspace → **Git Repos** in the sidebar

### Connecting a repository

1. Click **Add Repository**
2. Fill in:
   - **Repository URL** — the HTTPS clone URL of your GitHub or GitLab repo
   - **Provider** — GitHub or GitLab
   - **Access Token** — a personal access token with `repo` (GitHub) or `api` (GitLab) scope; stored AES-256-GCM encrypted
   - **Branch** — default branch to poll (e.g. `main`)
   - **Poll Interval** — how often NanoOrch checks for new events (in seconds; minimum 60)
3. Click **Save**

### The `.nanoorch.yml` file

Add this file to the root of your repository:

```yaml
version: "1"
agents:
  - name: "Code Review Bot"
    on: [pull_request, merge_request]
    agent_id: "<agent-id-from-nanoorch>"
    prompt: |
      Review the diff and provide feedback on code quality, bugs, and best practices.
      Repository: {{repo}} | Branch: {{branch}} | PR: {{title}} | Author: {{author}}
```

**Supported `on` events:** `push`, `pull_request` (GitHub), `merge_request` (GitLab)

**Template variables available in prompts:** `{{repo}}`, `{{branch}}`, `{{event}}`, `{{title}}`, `{{author}}`, `{{sha}}`

### Feedback comments

After each agent task completes, NanoOrch posts the result as a Markdown comment on the PR/MR via the Git provider API. Comments appear automatically — no additional configuration needed.

---

## Quick-start checklist

- [ ] Log in as global admin
- [ ] Create a workspace
- [ ] (Optional) Set workspace resource limits via the ⚙ gear on the workspace card
- [ ] Create an orchestrator (pick provider + model)
- [ ] Create at least one agent
- [ ] Add an integration:
  - AWS/GCP/Azure → Tool mode → enable specific tools on the agent
  - Jira/GitHub/GitLab → Tool mode → enable specific tools on the agent
  - RAGFlow → Context mode (auto-retrieves before every reply)
- [ ] Open Chat → type `@your-agent hello` → confirm it responds
- [ ] Try an integration prompt: `@your-agent list my open Jira issues`
- [ ] Try a code prompt: `@your-agent is 104729 a prime number?`
- [ ] (Optional) Set up an Approval Gate — add approval instructions to a write-capable agent
- [ ] (Optional) Create a Pipeline — chain two or more agents for a multi-step workflow
- [ ] Check Observability to see token usage and costs
- [ ] (Optional) Set up a scheduled job with an outbound Teams or Slack channel
- [ ] (Optional) Create member and workspace admin accounts and share the chat link
- [ ] (Optional) Configure SSO — set `APP_URL`, add an OIDC or SAML provider at **SSO Settings**
- [ ] (Optional) Set up Event Triggers — wire GitHub/GitLab/Jira webhooks to fire agent tasks
- [ ] (Optional) Set up MCP Server — open **MCP** in the sidebar, create an API key, paste the config into Claude Desktop
- [ ] (Optional) Set up Git Agents — open **Git Repos**, connect a repository, add `.nanoorch.yml` to the repo root
- [ ] (Optional) Add a PostgreSQL integration — open **Integrations**, select PostgreSQL, paste a connection string, enable `pg_query` / `pg_execute` tools on an agent
- [ ] (Optional) Use **vLLM** provider — start a vLLM server, create an orchestrator with provider = vLLM, enter base URL (no `/v1`) and optional API key
- [ ] **Production:** Switch to Docker secrets — run `./secrets/create-secrets.sh` and use `docker-compose.secrets.yml`
- [ ] **Production:** Enable `SANDBOX_RUNTIME=runsc`, `AGENT_RUNTIME=runsc`, and `SECCOMP_PROFILE` for full container hardening

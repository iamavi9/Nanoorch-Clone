# NanoOrch — User Manual

Welcome to NanoOrch. This guide covers everything you need to know as a chat user — no technical background required.

---

## Table of Contents

1. [Logging in](#1-logging-in)
2. [Your workspace list](#2-your-workspace-list)
3. [Opening the chat](#3-opening-the-chat)
4. [Talking to an agent](#4-talking-to-an-agent)
5. [Types of responses](#5-types-of-responses)
6. [Approving actions](#6-approving-actions)
7. [When the agent runs code](#7-when-the-agent-runs-code)
8. [What agents can do](#8-what-agents-can-do)
9. [Automated agents (scheduled and pipeline)](#9-automated-agents-scheduled-and-pipeline)
10. [Knowledge sources (RAGFlow)](#10-knowledge-sources-ragflow)
11. [Tips for better results](#11-tips-for-better-results)
12. [Troubleshooting](#12-troubleshooting)
13. [Using agents via Slack, Teams, or Google Chat](#13-using-agents-via-slack-teams-or-google-chat)

---

## 1. Logging in

Go to the URL your administrator gave you (e.g. `http://your-company-nanoorch.com`) and log in.

**Standard login:** Enter your username and password and click **Sign in**.

**SSO login (if configured by your administrator):** Click the **Sign in with \<provider-name\>** button (e.g. "Sign in with Google Workspace" or "Sign in with Okta"). You will be redirected to your company's identity provider and then returned to NanoOrch automatically. No separate NanoOrch password is needed.

> If you are unsure which login method to use, or you have not received credentials, contact your administrator.

After logging in you will be taken to your workspace list.

---

## 2. Your workspace list

You will see the workspaces your administrator has added you to. Each workspace is a separate area — it may represent a team, a project, or a department.

Click any workspace to open its chat.

> You can only see workspaces you have been added to. If a workspace you expect is missing, ask your administrator to add you.

---

## 3. Opening the chat

Once you are inside a workspace, the chat interface opens automatically. This is where you interact with AI agents.

The input box is at the bottom of the screen. Type your message there and press **Enter** (or click the send button) to send it.

---

## 4. Talking to an agent

Agents are AI assistants set up by your administrator. Each one has a name and a specific area of focus — for example, one agent might handle infrastructure questions, another might manage Jira tickets, another might search your company knowledge base.

### Selecting an agent with @mention

You direct your message to a specific agent using `@` followed by their name:

```
@infra-bot how many EC2 instances do we have running?
```

**How to pick an agent:**

1. Type `@` in the message box — a dropdown list of available agents appears
2. Use the **↑** and **↓** arrow keys to move through the list
3. Press **Enter** or **Tab** to select the highlighted agent (or just click their name)
4. Press **Escape** to close the dropdown without selecting anyone
5. Finish typing your message and press **Enter** to send

The selected agent name appears highlighted in your message before you send it.

> **Always start with @agent-name** — without it the platform does not know which agent to route your message to.

---

## 5. Types of responses

Depending on what you ask, the agent may respond in one of three ways:

### Instant answer

For questions, explanations, and summaries the agent replies directly in the chat — the text streams in word by word as it is generated.

```
@docs-bot what is our data retention policy?
→ Our data retention policy states that...
```

### Computed answer

If your question requires a calculation or data processing, the agent writes a small program, runs it securely on the server, and returns the result.

```
@data-bot what is the compound interest on $50,000 at 4.5% over 10 years?
→ ⚙ running python in sandbox…
→ After 10 years at 4.5% annual compound interest, $50,000 grows to $77,931.29.
```

You will see the `⚙ running … in sandbox…` indicator while the code is executing. It disappears automatically when the result is ready.

### Action response

If your request involves fetching live data or performing an operation — such as listing cloud resources, searching Jira, creating a GitHub issue, or triggering a pipeline — the agent calls the relevant service and returns the real result.

```
@jira-bot list all open P1 bugs assigned to me
→ Found 3 open P1 issues assigned to you:
  • CORE-412 — Login timeout on mobile (High) — Updated 2h ago
  • CORE-389 — Payment flow 500 error (Highest) — Updated 1d ago
  • INFRA-77 — DB connection pool exhaustion (High) — Updated 3h ago
```

---

## 6. Approving actions

When the agent detects that your request involves a **cloud or developer-tool action**, it may pause and show you a confirmation card before doing anything:

> **poc-agent** wants to run a cloud action
>
> **List all S3 buckets in the AWS account.**
>
> PREDICTED OPERATIONS
> ✅ read-only   This call lists all S3 buckets in the AWS account.
>               `aws_list_s3_buckets`
>
> ⓘ This will execute in an isolated environment using your cloud credentials.
>
> [ ✅ Approve & Run ]   [ ✖ Cancel ]

- **Approve & Run** — the action runs immediately in an isolated environment. You will see the result in the chat when it finishes.
- **Cancel** — nothing happens. You can rephrase or ask something different.

The card shows a **Predicted Operations** panel that tells you exactly which tool call will be made and whether it is **read-only** (safe to approve freely) or a **write** operation (creates, modifies, or deletes something). Read the description carefully before approving write operations.

> Review the description carefully before approving write operations. Actions that create issues, modify resources, or trigger pipelines have real effects.

If you are a **workspace admin**, pending approvals also appear in the **Approvals** section of the sidebar with a badge showing how many are waiting. You can review and resolve them there at any time.

---

## 7. When the agent runs code

Some prompts cause the agent to write and execute code automatically. This is completely safe — the code runs in a locked-down sandbox with no access to the internet or your files, and nothing persists after the run.

You do not need to do anything special. Just ask naturally:

| What you type | What the agent does |
|---|---|
| `@agent is 104729 a prime number?` | Writes a short program, runs it, tells you the answer |
| `@agent convert 212°F to Celsius` | Runs the formula, returns the result |
| `@agent how many days until the end of the quarter?` | Uses today's date, computes the difference |
| `@agent what is the SHA-256 hash of "hello world"?` | Runs a hash function, returns the output |
| `@agent count how many items have status "active": [{"status":"active"},...]` | Parses the data, counts and returns the number |

The sandbox can run **Python** and **Node.js (JavaScript)**. It cannot browse the internet, access your files, or remember anything from a previous run.

---

## 8. What agents can do

Depending on which integrations your administrator has set up, agents in your workspace may be able to do the following:

### Cloud infrastructure (AWS, GCP, Azure)

```
@infra-bot list all running EC2 instances in us-east-1
@infra-bot how many S3 buckets do we have?
@infra-bot show me the last 50 error logs from /app/production
@infra-bot list all virtual machines in the PROD resource group
```

### Jira

```
@jira-bot show me all open P1 bugs in project CORE
@jira-bot create a bug: "Payment timeout on checkout" — priority High
@jira-bot what is the status of CORE-412?
@jira-bot add a comment to INFRA-77: "Confirmed — connection pool limit is 100"
@jira-bot list all active sprints on the engineering board
```

### GitHub

```
@devbot list all open PRs in the backend repo
@devbot show me issues labelled "bug" in my-org/frontend
@devbot create an issue: "Fix login redirect loop" in my-org/backend
@devbot what's the status of the last 5 GitHub Actions runs on main?
```

### GitLab

```
@devbot list all open merge requests targeting main
@devbot show me failed pipelines on the release branch
@devbot trigger a new pipeline on the staging branch
@devbot create an issue: "Update dependencies" in project 123
```

### ServiceNow (ITSM)

```
@itsm-bot show me the latest P1 incidents
@itsm-bot create an incident: "Login page down" — impact High, urgency High
@itsm-bot what is the status of incident INC0012345?
@itsm-bot add a work note to INC0012345: "Root cause identified — DB connection pool exhausted"
@itsm-bot show me all open change requests for this week
@itsm-bot list available catalog items related to VPN access
@itsm-bot submit a catalog order for item <sys_id> on behalf of john.doe
```

### Knowledge base (RAGFlow)

If your administrator has connected a RAGFlow knowledge base, the agent automatically searches it before every response — you do not need to ask it to. See section 10 for details.

> **Which tools are available** depends on what your administrator has configured for your workspace. If an agent says it cannot perform an action, ask your administrator to enable the relevant integration and tools.

---

## 9. Automated agents (scheduled and pipeline)

Your administrator may have set up two types of automated workflows that run without any input from you:

### Scheduled agents

A scheduled agent runs automatically on a timed schedule — for example, every Monday morning an agent might fetch all open P1 Jira issues and send a digest, or every 5 minutes an agent might check for Jira updates.

Each job card shows:
- **Active / Paused** badge — whether the job is currently enabled
- The cron expression and timezone (e.g. `*/5 * * * *` · Asia/Kolkata)
- **Next run** and **Last run** timestamps
- A **Last task** link to jump directly to the most recent task log

Your administrator can pause, resume, manually trigger (Run Now), edit, or delete any scheduled job without losing its configuration.

When a scheduled agent completes its task, the result may be automatically sent to a Slack or Teams channel. You may receive these as regular messages in your team channel without having to do anything in NanoOrch.

### Pipelines

A pipeline chains several agents together in sequence — the output of each agent is passed automatically to the next. For example: one agent fetches data, a second agent summarises it, and a third creates a Jira ticket with the summary. Pipelines can also run on a schedule.

You will not normally interact with pipelines directly. If you want an automated multi-step workflow set up, ask your administrator.

---

## 10. Knowledge sources (RAGFlow)

If your administrator has connected a company knowledge base (RAGFlow), the agent will automatically search it before every response — you do not need to ask it to.

When relevant documents are found, a collapsible **Sources** panel appears below the agent's reply:

```
[agent reply text here...]

📄 26 sources  ▾
  • Leave-and-Holiday-Policy.pdf
    HR India - Leave and Holiday Policy (PIL) Purpose The purpose of this Policy
    is to facilitate effective administration and management of employees' leav...
  • Project-Manual-Template.pdf
    9.INTERPRETATIONOFDOCUMENTSANDADDENDA A.Before the Owner makes the award...
  • fgs_033000.pdf
    Whole Building Design Guide Federal Green Construction Guide for Specifiers...
```

Click the **Sources** badge to expand and read the specific document excerpts the agent used to form its answer. The badge shows the total number of source chunks retrieved (for example, "26 sources"). This lets you verify the information and navigate to the original document if you need more detail.

---

## 11. Tips for better results

**Be specific.** The more context you give, the better the response.

```
Less specific:   @jira-bot show issues
More specific:   @jira-bot show all open P1 and P2 bugs in project CORE assigned to the backend team
```

**Address the right agent.** Your administrator may have set up specialist agents — one for cloud infrastructure, one for Jira, one for GitHub, one for knowledge base search. Using the right agent gets you a better answer faster.

**Ask follow-up questions.** The agent remembers the context of your current conversation. You can refine or follow up without repeating yourself:

```
@jira-bot list my open issues
→ [lists issues]

@jira-bot which of those are P1?
→ [filters and replies]

@jira-bot add a comment to the first one: "Investigating now"
→ [adds the comment]
```

**For calculations, paste the data inline.** If you have JSON, CSV, or numbers you want the agent to process, paste them directly into your message.

**If the response is cut off**, ask the agent to continue:

```
@agent continue
```

---

## 12. Troubleshooting

**The agent is not responding / the spinner keeps going**

- Wait up to 30 seconds — responses that call Jira, GitHub, GitLab, or cloud APIs take longer than conversational answers.
- If it has been more than a minute with no response, try refreshing the page and resending your message.

**"No agents available" in the dropdown**

- Your workspace has no agents configured yet. Ask your administrator to set one up.

**The agent says it cannot run code**

- The code sandbox image may not have been built on the server. Ask your administrator.

**The agent says it does not have access to Jira / GitHub / GitLab**

- The integration may not be set up, or the tool may not be enabled for that specific agent. Ask your administrator to add the integration and enable the relevant tools in the agent's settings.

**The agent paused and is waiting for approval**

- The agent has detected a write operation and is waiting for a workspace admin to approve it. If you are a workspace admin, go to the **Approvals** section in the sidebar. Otherwise, let your administrator know there is a pending approval.

**"Invalid or expired task token" error appears in task logs**

- This is an internal security mechanism — the short-lived token used to authorise the agent's AI calls has expired. This typically means the task ran for longer than 15 minutes. Your administrator can review the task logs for details. Submitting the task again will issue a fresh token.

**The agent says it cannot find an issue / repo / project**

- Check that you provided the correct project key, repo name, or project ID. The agent uses exactly what you give it — typos in project names will cause "not found" errors.

**The action ran but something went wrong**

- Open the task that was created (your administrator can see it in the **Tasks** view) to check the detailed logs. Share the task ID with your administrator.

**I cannot see a workspace I should have access to**

- Ask your administrator to add you to that workspace from the **Members** section.

**I forgot my password**

- Ask your administrator to reset it. There is no self-service password reset.

---

## 13. Using agents via Slack, Teams, or Google Chat

If your administrator has set up a **comms workspace**, you can talk to NanoOrch agents directly from Slack, Microsoft Teams, or Google Chat without opening the web app.

### Slack

**Mention the bot** in any channel it has been invited to:
```
@NanoOrchBot what is the status of our deployment?
```

The bot posts a brief "⏳ Thinking…" placeholder immediately, then **replaces it with the full response** when the agent finishes — usually within a few seconds.

**To address a specific agent**, prefix your message with `use agent-name:`:
```
@NanoOrchBot use devops-agent: check CloudWatch for any errors in the last hour
```

Without that prefix, your message goes to the default agent configured by your administrator.

**Direct messages** also work — send the bot a DM (without the `@mention`) and it will respond the same way.

> If your administrator has set a **DM allowlist**, only users on that list can DM the bot. Contact your administrator if you cannot DM the bot.

### Microsoft Teams

Send a message to the Teams channel where the bot has been added. You can either `@mention` the bot or simply type your message — both work:
```
@NanoOrchBot check the deploy pipeline for failures
```
or
```
use devops-agent: check CloudWatch for any errors in the last hour
```

The bot replies in the same conversation thread.

### Google Chat

Send a message to the Google Chat space where NanoOrch has been set up:
```
what is the status of our deployment?
```

To address a specific agent:
```
use devops-agent: check CloudWatch for any errors in the last hour
```

The bot posts its reply directly in the space. Conversation history is remembered within the same space.

> **Note:** Google Chat does not support interactive Approve/Reject buttons via webhook. If an agent needs approval from a Google Chat conversation, a workspace admin must approve it in the NanoOrch web UI (Approvals page). You will receive a follow-up message once the admin acts.

### If the agent needs approval

Some actions (like deleting cloud resources or creating production Jira tickets) require human approval before the agent proceeds.

When this happens in a Slack thread, an interactive **Approve / Reject** card appears directly in the thread — a workspace admin can click a button without leaving Slack. The same happens in Teams as an Adaptive Card with action buttons.

Once approved (or rejected), the bot posts a confirmation and the agent either continues or stops.

> **Skip the approval gate:** If you trust the action and want to skip the approval step, include one of these phrases in your message:
> - `without approval`
> - `skip approval`
> - `no approval needed`
> - `bypass approval`
>
> Example: `@NanoOrchBot delete the stale staging resources without approval`
>
> Use this only for actions you are confident about — there is no undo.

### Chat commands

You can send these commands as a standalone message (no agent prefix needed) in any thread where the bot is active:

| Command | What it does |
|---------|-------------|
| `/status` | Shows the status of the most recent task in this thread |
| `/reset` | Clears the conversation history for this thread and starts fresh |
| `/compact` | Summarises and compresses the conversation history (useful for long threads) |
| `/help` | Lists available commands |

### Attaching images

If you attach an image to your message, the bot notes the image URL in the task context. The agent will describe what it was given but cannot visually analyse image content unless the model supports vision.

### What the agent can do from Slack / Teams / Google Chat

Everything it can do from the web chat — run code, query Jira, search GitHub, call AWS/GCP/Azure tools, retrieve from RAGFlow knowledge bases, and more.

### Limitations

- One message = one task. Long-running tasks may take a minute or two before you see a reply.
- Context is shared within the same Slack **thread**, Teams **conversation**, or Google Chat **space** — the last 50 exchanges are remembered. Starting a new thread or conversation starts a fresh context.
- The agent cannot send file attachments back to Slack/Teams/Google Chat — only text replies.
- Interactive Approve/Reject cards are available in Slack (Block Kit) and Teams (Adaptive Cards) only — Google Chat approvals must be resolved in the NanoOrch web UI.
- If the bot does not reply after a few minutes, ask your administrator to check the task logs in the NanoOrch web UI.

---

## Quick reference

| Goal | How |
|---|---|
| Talk to an agent | Type `@agent-name your message` and press Enter |
| Pick an agent from the list | Type `@`, use ↑↓ arrows, press Enter or Tab |
| Cancel agent selection | Press Escape |
| Approve a pending action | Click **Approve** on the confirmation card (or via Approvals in sidebar if workspace admin) |
| See document sources | Click **Sources** below the agent's reply |
| Ask a follow-up | Just keep typing — context is remembered |
| Search Jira | `@agent search Jira for [your query]` |
| Create a GitHub issue | `@agent create a GitHub issue: [title]` |
| Trigger a GitLab pipeline | `@agent trigger pipeline on [branch]` |
| Switch workspace | Go back to the home screen (top-left logo or `/member`) |
| Chat via Slack | Mention the bot: `@NanoOrchBot your question` |
| DM the bot via Slack | Send a direct message — no `@mention` needed |
| Chat via Teams | `@mention` the bot or just type your message |
| Chat via Google Chat | Type your message in the configured space |
| Route to a specific agent via Slack/Teams/Google Chat | `use agent-name: your prompt` |
| Check why the bot didn't reply | Ask workspace admin to check Tasks → task logs |
| Get approval for a blocked agent action | Admin approves via Approvals in the web UI; reply arrives in same thread |

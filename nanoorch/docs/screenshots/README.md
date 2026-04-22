# Screenshots

This directory holds the UI screenshots shown in the project README.

## How to contribute screenshots

1. Run NanoOrch locally (`npm run dev` or `docker compose up -d`)
2. Set up a demo workspace with a few orchestrators, agents, and tasks
3. Capture each screenshot at **1280 × 800** (or 2x for retina — 2560 × 1600)
4. Save as PNG, named exactly as listed below
5. Open a PR — screenshots are updated independently of code changes

## Required files

| File | Screen to capture |
|------|-------------------|
| `workspaces.png` | Workspaces listing — show at least one workspace with the **Comms** badge and one without; hover to reveal action icons |
| `chat.png` | Chat interface — an active conversation with a streaming or completed agent reply; show the `@agent` mention dropdown if possible |
| `tasks.png` | Task queue page — mix of completed, running, and failed tasks; open one task to show the SSE log stream panel |
| `approvals.png` | Approvals page — at least one pending approval card with the proposed action description and the Approve / Reject buttons visible |
| `pipelines.png` | Pipelines list — show the pipeline builder or the step list for a multi-step pipeline |
| `observability.png` | Observability dashboard — daily usage chart, summary cards, and per-agent cost breakdown |
| `comms.png` | Channels page — a Slack inbound channel expanded showing the Events Endpoint URL, copy button, and the Two-way Comms section |
| `integrations.png` | Integrations page — at least Jira and GitHub cards; show the Test button and encrypted credential state |
| `scheduled.png` | Scheduled Jobs page — list of active jobs with cron expressions, next-run times, status toggles, and the "Run Now" action |
| `slack-approval-thread.png` | Slack approval thread — a Slack message thread showing a Block Kit approval card with Approve / Reject buttons and the agent reply after approval |
| `nanoorch-architecture_1774022201704.png` | High-level architecture diagram — overview of the full NanoOrch system (already present in this directory) |

## Tips

- Use realistic (but fake) data — no real API keys or customer data in screenshots
- Dark mode screenshots look great for GitHub; include both if you have them
- Crop to the content area; avoid showing browser chrome unless it adds context

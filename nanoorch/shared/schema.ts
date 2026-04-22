import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, boolean, timestamp, jsonb, serial, pgEnum, unique, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const userRoleEnum = pgEnum("user_role", ["admin", "member"]);
export const providerEnum = pgEnum("provider", ["openai", "anthropic", "gemini", "ollama", "vllm"]);
export const orchestratorStatusEnum = pgEnum("orchestrator_status", ["active", "paused"]);
export const taskStatusEnum = pgEnum("task_status", ["pending", "running", "completed", "failed"]);
export const channelTypeEnum = pgEnum("channel_type", ["webhook", "api", "slack", "teams", "google_chat", "generic_webhook"]);
export const logLevelEnum = pgEnum("log_level", ["info", "warn", "error"]);
export const cloudProviderEnum = pgEnum("cloud_provider", ["aws", "gcp", "azure", "ragflow", "jira", "github", "gitlab", "teams", "slack", "google_chat", "servicenow", "postgresql", "kubernetes"]);

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: varchar("username").unique(),
  passwordHash: text("password_hash"),
  email: varchar("email").unique(),
  name: text("name"),
  role: userRoleEnum("role").default("member"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const workspaces = pgTable("workspaces", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  slug: varchar("slug").notNull().unique(),
  description: text("description"),
  ownerId: varchar("owner_id").references(() => users.id),
  isCommsWorkspace: boolean("is_comms_workspace").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const workspaceMembers = pgTable("workspace_members", {
  id: serial("id").primaryKey(),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: userRoleEnum("role").default("member"),
}, (t) => [unique().on(t.workspaceId, t.userId)]);

export const orchestrators = pgTable("orchestrators", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  provider: providerEnum("provider").notNull().default("openai"),
  model: varchar("model").notNull().default("gpt-4o"),
  baseUrl: text("base_url"),
  systemPrompt: text("system_prompt"),
  maxConcurrency: integer("max_concurrency").default(3),
  maxRetries: integer("max_retries").default(2),
  timeoutSeconds: integer("timeout_seconds").default(120),
  status: orchestratorStatusEnum("status").default("active"),
  failoverProvider: text("failover_provider"),
  failoverModel: text("failover_model"),
  vllmApiKey: text("vllm_api_key"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const agents = pgTable("agents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orchestratorId: varchar("orchestrator_id").notNull().references(() => orchestrators.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  instructions: text("instructions"),
  tools: jsonb("tools").default([]),
  memoryEnabled: boolean("memory_enabled").default(false),
  reactEnabled: boolean("react_enabled").default(false),
  maxTokens: integer("max_tokens").default(4096),
  temperature: integer("temperature").default(70),
  sandboxTimeoutSeconds: integer("sandbox_timeout_seconds"),
  heartbeatEnabled: boolean("heartbeat_enabled").default(false),
  heartbeatIntervalMinutes: integer("heartbeat_interval_minutes").default(30),
  heartbeatChecklist: text("heartbeat_checklist"),
  heartbeatTarget: text("heartbeat_target").default("none"),
  heartbeatModel: text("heartbeat_model"),
  heartbeatSilencePhrase: text("heartbeat_silence_phrase").default("HEARTBEAT_OK"),
  heartbeatLastFiredAt: timestamp("heartbeat_last_fired_at"),
  heartbeatNotifyChannelId: varchar("heartbeat_notify_channel_id"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const channels = pgTable("channels", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orchestratorId: varchar("orchestrator_id").notNull().references(() => orchestrators.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  type: channelTypeEnum("type").notNull().default("api"),
  config: jsonb("config").default({}),
  apiKey: varchar("api_key").default(sql`gen_random_uuid()`),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const channelDeliveries = pgTable("channel_deliveries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  channelId: varchar("channel_id").notNull().references(() => channels.id, { onDelete: "cascade" }),
  event: text("event").notNull(),
  statusCode: integer("status_code"),
  responseBody: text("response_body"),
  error: text("error"),
  sentAt: timestamp("sent_at").defaultNow(),
});

export const tasks = pgTable("tasks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orchestratorId: varchar("orchestrator_id").notNull().references(() => orchestrators.id, { onDelete: "cascade" }),
  agentId: varchar("agent_id").references(() => agents.id),
  channelId: varchar("channel_id").references(() => channels.id),
  input: text("input").notNull(),
  output: text("output"),
  status: taskStatusEnum("status").default("pending"),
  priority: integer("priority").default(5),
  intent: varchar("intent"),
  parentTaskId: varchar("parent_task_id"),
  commsThreadId: varchar("comms_thread_id"),
  bypassApproval: boolean("bypass_approval").default(false),
  retryCount: integer("retry_count").default(0),
  errorMessage: text("error_message"),
  isHeartbeat: boolean("is_heartbeat").default(false),
  notifyChannelId: varchar("notify_channel_id"),
  createdAt: timestamp("created_at").defaultNow(),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
});

export const taskLogs = pgTable("task_logs", {
  id: serial("id").primaryKey(),
  taskId: varchar("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
  level: logLevelEnum("level").default("info"),
  message: text("message").notNull(),
  metadata: jsonb("metadata").default({}),
  timestamp: timestamp("timestamp").defaultNow(),
  logType: text("log_type").default("info"),
  parentLogId: integer("parent_log_id"),
});

export const agentMemory = pgTable("agent_memory", {
  id: serial("id").primaryKey(),
  agentId: varchar("agent_id").notNull().references(() => agents.id, { onDelete: "cascade" }),
  key: varchar("key").notNull(),
  value: text("value"),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => [unique("agent_memory_agent_key").on(t.agentId, t.key)]);

export const cloudIntegrations = pgTable("cloud_integrations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  provider: cloudProviderEnum("provider").notNull(),
  integrationMode: text("integration_mode").default("tool").notNull(),
  credentialsEncrypted: text("credentials_encrypted").notNull(),
  scopes: text("scopes").array().default([]),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  lastUsedAt: timestamp("last_used_at"),
});

export const chatConversations = pgTable("chat_conversations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  title: text("title").notNull().default("Chat"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const chatMessages = pgTable("chat_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  conversationId: varchar("conversation_id").notNull().references(() => chatConversations.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  agentId: varchar("agent_id").references(() => agents.id, { onDelete: "set null" }),
  agentName: text("agent_name"),
  content: text("content").notNull(),
  mentions: text("mentions").array().default([]),
  messageType: text("message_type").notNull().default("text"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
  createdAt: timestamp("created_at").defaultNow(),
});

export const scheduledJobs = pgTable("scheduled_jobs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  orchestratorId: varchar("orchestrator_id").notNull().references(() => orchestrators.id, { onDelete: "cascade" }),
  agentId: varchar("agent_id").notNull().references(() => agents.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  prompt: text("prompt").notNull(),
  cronExpression: varchar("cron_expression").notNull(),
  timezone: varchar("timezone").default("UTC"),
  isActive: boolean("is_active").default(true),
  intent: varchar("intent"),
  bypassApproval: boolean("bypass_approval").default(false),
  notifyChannelId: varchar("notify_channel_id"),
  lastRunAt: timestamp("last_run_at"),
  nextRunAt: timestamp("next_run_at"),
  lastTaskId: varchar("last_task_id"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true });
export const insertWorkspaceSchema = createInsertSchema(workspaces).omit({ id: true, createdAt: true });
export const insertOrchestratorSchema = createInsertSchema(orchestrators).omit({ id: true, createdAt: true });
export const insertAgentSchema = createInsertSchema(agents).omit({ id: true, createdAt: true });
export const insertChannelSchema = createInsertSchema(channels).omit({ id: true, createdAt: true });
export const insertTaskSchema = createInsertSchema(tasks).omit({ id: true, createdAt: true, startedAt: true, completedAt: true });
export const insertTaskLogSchema = createInsertSchema(taskLogs).omit({ id: true, timestamp: true });

export const insertCloudIntegrationSchema = createInsertSchema(cloudIntegrations).omit({ id: true, createdAt: true, lastUsedAt: true });

export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type Workspace = typeof workspaces.$inferSelect;
export type InsertWorkspace = z.infer<typeof insertWorkspaceSchema>;
export type Orchestrator = typeof orchestrators.$inferSelect;
export type InsertOrchestrator = z.infer<typeof insertOrchestratorSchema>;
export type Agent = typeof agents.$inferSelect;
export type InsertAgent = z.infer<typeof insertAgentSchema>;
export type Channel = typeof channels.$inferSelect;
export type InsertChannel = z.infer<typeof insertChannelSchema>;
export type Task = typeof tasks.$inferSelect;
export type InsertTask = z.infer<typeof insertTaskSchema>;
export type TaskLog = typeof taskLogs.$inferSelect;
export type AgentMemory = typeof agentMemory.$inferSelect;
export type CloudIntegration = typeof cloudIntegrations.$inferSelect;
export type InsertCloudIntegration = z.infer<typeof insertCloudIntegrationSchema>;

export const insertChatConversationSchema = createInsertSchema(chatConversations).omit({ id: true, createdAt: true });
export const insertChatMessageSchema = createInsertSchema(chatMessages).omit({ id: true, createdAt: true });
export type ChatConversation = typeof chatConversations.$inferSelect;
export type InsertChatConversation = z.infer<typeof insertChatConversationSchema>;
export type ChatMessage = typeof chatMessages.$inferSelect;
export type InsertChatMessage = z.infer<typeof insertChatMessageSchema>;

export const insertScheduledJobSchema = createInsertSchema(scheduledJobs).omit({ id: true, createdAt: true, lastRunAt: true, nextRunAt: true, lastTaskId: true });
export type ScheduledJob = typeof scheduledJobs.$inferSelect;
export type InsertScheduledJob = z.infer<typeof insertScheduledJobSchema>;

export type ChannelDelivery = typeof channelDeliveries.$inferSelect;

export const approvalRequests = pgTable("approval_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  taskId: varchar("task_id").references(() => tasks.id, { onDelete: "set null" }),
  agentId: varchar("agent_id").references(() => agents.id, { onDelete: "set null" }),
  agentName: text("agent_name"),
  message: text("message").notNull(),
  action: text("action").notNull(),
  impact: text("impact"),
  status: text("status").notNull().default("pending"),
  resolvedBy: varchar("resolved_by"),
  resolution: text("resolution"),
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const pipelines = pgTable("pipelines", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  orchestratorId: varchar("orchestrator_id").notNull().references(() => orchestrators.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  isActive: boolean("is_active").default(true),
  cronExpression: varchar("cron_expression"),
  timezone: varchar("timezone").default("UTC"),
  notifyChannelId: varchar("notify_channel_id"),
  lastRunAt: timestamp("last_run_at"),
  nextRunAt: timestamp("next_run_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const pipelineSteps = pgTable("pipeline_steps", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  pipelineId: varchar("pipeline_id").notNull().references(() => pipelines.id, { onDelete: "cascade" }),
  agentId: varchar("agent_id").notNull().references(() => agents.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  promptTemplate: text("prompt_template").notNull(),
  stepOrder: integer("step_order").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const pipelineRuns = pgTable("pipeline_runs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  pipelineId: varchar("pipeline_id").notNull().references(() => pipelines.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("pending"),
  triggeredBy: text("triggered_by").default("manual"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  error: text("error"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const pipelineStepRuns = pgTable("pipeline_step_runs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  runId: varchar("run_id").notNull().references(() => pipelineRuns.id, { onDelete: "cascade" }),
  stepId: varchar("step_id").notNull().references(() => pipelineSteps.id, { onDelete: "cascade" }),
  taskId: varchar("task_id").references(() => tasks.id, { onDelete: "set null" }),
  status: text("status").notNull().default("pending"),
  output: text("output"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  error: text("error"),
});

export const tokenUsage = pgTable("token_usage", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  taskId: varchar("task_id").references(() => tasks.id, { onDelete: "set null" }),
  agentId: varchar("agent_id").references(() => agents.id, { onDelete: "set null" }),
  agentName: text("agent_name"),
  provider: text("provider").notNull(),
  model: text("model").notNull(),
  inputTokens: integer("input_tokens").notNull().default(0),
  outputTokens: integer("output_tokens").notNull().default(0),
  estimatedCostUsd: real("estimated_cost_usd").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertApprovalRequestSchema = createInsertSchema(approvalRequests).omit({ id: true, createdAt: true, resolvedAt: true });
export type ApprovalRequest = typeof approvalRequests.$inferSelect;
export type InsertApprovalRequest = z.infer<typeof insertApprovalRequestSchema>;

export const insertPipelineSchema = createInsertSchema(pipelines).omit({ id: true, createdAt: true, lastRunAt: true, nextRunAt: true });
export type Pipeline = typeof pipelines.$inferSelect;
export type InsertPipeline = z.infer<typeof insertPipelineSchema>;

export const insertPipelineStepSchema = createInsertSchema(pipelineSteps).omit({ id: true, createdAt: true });
export type PipelineStep = typeof pipelineSteps.$inferSelect;
export type InsertPipelineStep = z.infer<typeof insertPipelineStepSchema>;

export const insertPipelineRunSchema = createInsertSchema(pipelineRuns).omit({ id: true, createdAt: true, startedAt: true, completedAt: true });
export type PipelineRun = typeof pipelineRuns.$inferSelect;
export type InsertPipelineRun = z.infer<typeof insertPipelineRunSchema>;

export const insertPipelineStepRunSchema = createInsertSchema(pipelineStepRuns).omit({ id: true });
export type PipelineStepRun = typeof pipelineStepRuns.$inferSelect;

export const insertTokenUsageSchema = createInsertSchema(tokenUsage).omit({ id: true, createdAt: true });
export type TokenUsage = typeof tokenUsage.$inferSelect;
export type InsertTokenUsage = z.infer<typeof insertTokenUsageSchema>;

export const workspaceConfig = pgTable("workspace_config", {
  workspaceId: varchar("workspace_id").primaryKey().references(() => workspaces.id, { onDelete: "cascade" }),
  maxOrchestrators: integer("max_orchestrators"),
  maxAgents: integer("max_agents"),
  maxChannels: integer("max_channels"),
  maxScheduledJobs: integer("max_scheduled_jobs"),
  allowedAiProviders: text("allowed_ai_providers").array(),
  allowedCloudProviders: text("allowed_cloud_providers").array(),
  allowedChannelTypes: text("allowed_channel_types").array(),
  utilizationAlertThresholdTokens: integer("utilization_alert_threshold_tokens"),
  utilizationAlertChannelId: varchar("utilization_alert_channel_id"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertWorkspaceConfigSchema = createInsertSchema(workspaceConfig);
export type WorkspaceConfig = typeof workspaceConfig.$inferSelect;
export type InsertWorkspaceConfig = z.infer<typeof insertWorkspaceConfigSchema>;

export const commsThreads = pgTable("comms_threads", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  channelId: varchar("channel_id").notNull().references(() => channels.id, { onDelete: "cascade" }),
  externalThreadId: text("external_thread_id").notNull(),
  externalChannelId: text("external_channel_id"),
  externalUserId: text("external_user_id"),
  externalUserName: text("external_user_name"),
  agentId: varchar("agent_id").references(() => agents.id, { onDelete: "set null" }),
  platform: text("platform").notNull(),
  conversationRef: jsonb("conversation_ref").default({}),
  history: jsonb("history").$type<Array<{ role: string; content: string }>>().default([]),
  createdAt: timestamp("created_at").defaultNow(),
  lastActivityAt: timestamp("last_activity_at").defaultNow(),
});

export const insertCommsThreadSchema = createInsertSchema(commsThreads).omit({ id: true, createdAt: true });
export type CommsThread = typeof commsThreads.$inferSelect;
export type InsertCommsThread = z.infer<typeof insertCommsThreadSchema>;

// ── SSO Providers (global, not workspace-scoped) ──────────────────────────────
export const ssoProviders = pgTable("sso_providers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  type: text("type").notNull(), // 'oidc' | 'saml'
  isActive: boolean("is_active").default(true),
  config: jsonb("config").default({}),
  defaultRole: text("default_role").default("member"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertSsoProviderSchema = createInsertSchema(ssoProviders).omit({ id: true, createdAt: true });
export type SsoProvider = typeof ssoProviders.$inferSelect;
export type InsertSsoProvider = z.infer<typeof insertSsoProviderSchema>;

// ── Event Triggers (per-workspace) ───────────────────────────────────────────
export const eventTriggers = pgTable("event_triggers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  orchestratorId: varchar("orchestrator_id").notNull().references(() => orchestrators.id, { onDelete: "cascade" }),
  agentId: varchar("agent_id").notNull().references(() => agents.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  source: text("source").notNull(), // 'github' | 'gitlab' | 'jira'
  eventTypes: text("event_types").array().default([]),
  promptTemplate: text("prompt_template").notNull(),
  secretToken: text("secret_token"),
  filterConfig: jsonb("filter_config").default({}),
  isActive: boolean("is_active").default(true),
  bypassApproval: boolean("bypass_approval").default(false),
  notifyChannelId: varchar("notify_channel_id"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertEventTriggerSchema = createInsertSchema(eventTriggers).omit({ id: true, createdAt: true });
export type EventTrigger = typeof eventTriggers.$inferSelect;
export type InsertEventTrigger = z.infer<typeof insertEventTriggerSchema>;

// ── Trigger Events (webhook delivery history) ─────────────────────────────────
export const triggerEvents = pgTable("trigger_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  triggerId: varchar("trigger_id").notNull().references(() => eventTriggers.id, { onDelete: "cascade" }),
  source: text("source").notNull(),
  eventType: text("event_type").notNull(),
  payloadPreview: text("payload_preview"),
  matched: boolean("matched").default(false),
  taskId: varchar("task_id"),
  error: text("error"),
  receivedAt: timestamp("received_at").defaultNow(),
});

export type TriggerEvent = typeof triggerEvents.$inferSelect;

// ── MCP API Keys ───────────────────────────────────────────────────────────────
export const mcpApiKeys = pgTable("mcp_api_keys", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  keyHash: text("key_hash").notNull(),
  createdBy: varchar("created_by").references(() => users.id, { onDelete: "set null" }),
  lastUsedAt: timestamp("last_used_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export type McpApiKey = typeof mcpApiKeys.$inferSelect;

// ── Git Agents (workspace-scoped, admin-controlled) ───────────────────────────
export const gitAgents = pgTable("git_agents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  slug: varchar("slug").notNull(),
  description: text("description"),
  orchestratorId: varchar("orchestrator_id").references(() => orchestrators.id, { onDelete: "set null" }),
  systemPrompt: text("system_prompt").default(""),
  tools: jsonb("tools").default([]),
  memoryEnabled: boolean("memory_enabled").default(false),
  outputConfig: jsonb("output_config").$type<{ defaultOutputs: Array<{ type: string; channel?: string; context?: string; onlyOnFailure?: boolean }> }>().default({ defaultOutputs: [] }),
  approvalConfig: jsonb("approval_config").$type<{ required: boolean; channelId?: string; timeoutSeconds?: number }>().default({ required: false }),
  isMandatory: boolean("is_mandatory").default(false),
  requiresAdminApproval: boolean("requires_admin_approval").default(false),
  isActive: boolean("is_active").default(true),
  notifyChannelId: varchar("notify_channel_id"),
  postGitComment: boolean("post_git_comment").default(true),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [unique("git_agents_workspace_slug").on(t.workspaceId, t.slug)]);

// ── Git Repos (repositories connected to a workspace) ────────────────────────
export const gitRepos = pgTable("git_repos", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(),
  repoPath: text("repo_path").notNull(),
  repoUrl: text("repo_url"),
  tokenEncrypted: text("token_encrypted").notNull(),
  webhookSecret: text("webhook_secret").notNull(),
  webhookId: text("webhook_id"),
  lastYmlSha: text("last_yml_sha"),
  lastYmlProcessedAt: timestamp("last_yml_processed_at"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [unique("git_repos_workspace_path").on(t.workspaceId, t.repoPath)]);

// ── Git Agent Runs (per-webhook execution records) ───────────────────────────
export const gitAgentRuns = pgTable("git_agent_runs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  repoId: varchar("repo_id").notNull().references(() => gitRepos.id, { onDelete: "cascade" }),
  gitAgentId: varchar("git_agent_id").references(() => gitAgents.id, { onDelete: "set null" }),
  gitAgentSlug: text("git_agent_slug").notNull(),
  taskId: varchar("task_id").references(() => tasks.id, { onDelete: "set null" }),
  eventType: text("event_type").notNull(),
  eventRef: text("event_ref"),
  status: text("status").notNull().default("pending"),
  skipReason: text("skip_reason"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertGitAgentSchema = createInsertSchema(gitAgents).omit({ id: true, createdAt: true });
export type GitAgent = typeof gitAgents.$inferSelect;
export type InsertGitAgent = z.infer<typeof insertGitAgentSchema>;

export const insertGitRepoSchema = createInsertSchema(gitRepos).omit({ id: true, createdAt: true, lastYmlProcessedAt: true });
export type GitRepo = typeof gitRepos.$inferSelect;
export type InsertGitRepo = z.infer<typeof insertGitRepoSchema>;

export type GitAgentRun = typeof gitAgentRuns.$inferSelect;

// ─── Global white-label settings (singleton row, id = "singleton") ────────────
export const globalSettings = pgTable("global_settings", {
  id: varchar("id").primaryKey().default("singleton"),
  appName: text("app_name").notNull().default("NanoOrch"),
  appLogoUrl: text("app_logo_url"),
  faviconUrl: text("favicon_url"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type GlobalSettings = typeof globalSettings.$inferSelect;

// ─── Provider keys (AI model credentials, global or per-workspace) ─────────────
export const providerKeys = pgTable("provider_keys", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(),
  encryptedKey: text("encrypted_key").notNull(),
  baseUrl: text("base_url"),
  label: text("label"),
  updatedBy: varchar("updated_by").references(() => users.id, { onDelete: "set null" }),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type ProviderKey = typeof providerKeys.$inferSelect;

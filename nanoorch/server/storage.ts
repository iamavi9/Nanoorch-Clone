import { eq, desc, and, inArray, sql, gte, count } from "drizzle-orm";
import { db, pool } from "./db";
import {
  users, workspaces, workspaceMembers, orchestrators, agents, channels, channelDeliveries, tasks, taskLogs, agentMemory, cloudIntegrations,
  chatConversations, chatMessages, scheduledJobs,
  approvalRequests, pipelines, pipelineSteps, pipelineRuns, pipelineStepRuns, tokenUsage,
  workspaceConfig, commsThreads, ssoProviders, eventTriggers, triggerEvents, mcpApiKeys,
  gitAgents, gitRepos, gitAgentRuns, globalSettings, providerKeys,
  type User, type InsertUser,
  type Workspace, type InsertWorkspace,
  type Orchestrator, type InsertOrchestrator,
  type Agent, type InsertAgent,
  type Channel, type InsertChannel,
  type ChannelDelivery,
  type Task, type InsertTask,
  type TaskLog,
  type AgentMemory,
  type CloudIntegration, type InsertCloudIntegration,
  type ChatConversation, type InsertChatConversation,
  type ChatMessage, type InsertChatMessage,
  type ScheduledJob, type InsertScheduledJob,
  type ApprovalRequest, type InsertApprovalRequest,
  type Pipeline, type InsertPipeline,
  type PipelineStep, type InsertPipelineStep,
  type PipelineRun, type InsertPipelineRun,
  type PipelineStepRun,
  type TokenUsage, type InsertTokenUsage,
  type WorkspaceConfig,
  type CommsThread, type InsertCommsThread,
  type SsoProvider, type InsertSsoProvider,
  type EventTrigger, type InsertEventTrigger,
  type TriggerEvent,
  type McpApiKey,
  type GitAgent, type InsertGitAgent,
  type GitRepo, type InsertGitRepo,
  type GitAgentRun,
  type GlobalSettings,
  type ProviderKey,
} from "@shared/schema";

export type WorkspaceMemberWithUser = {
  memberId: number;
  userId: string;
  username: string | null;
  name: string | null;
  email: string | null;
  role: "admin" | "member";
};

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(data: { username: string; passwordHash: string; name?: string; role?: "admin" | "member" }): Promise<User>;
  upsertUser(user: InsertUser): Promise<User>;

  listWorkspaceMembers(workspaceId: string): Promise<WorkspaceMemberWithUser[]>;
  addWorkspaceMember(workspaceId: string, userId: string, role: "admin" | "member"): Promise<void>;
  removeWorkspaceMember(workspaceId: string, userId: string): Promise<void>;
  updateWorkspaceMemberRole(workspaceId: string, userId: string, role: "admin" | "member"): Promise<void>;
  isWorkspaceMember(workspaceId: string, userId: string): Promise<boolean>;
  isWorkspaceAdminMember(workspaceId: string, userId: string): Promise<boolean>;
  getWorkspaceAdminIds(userId: string): Promise<string[]>;
  getUserWorkspaces(userId: string): Promise<Workspace[]>;
  getAdminWorkspaces(userId: string): Promise<Workspace[]>;

  getWorkspace(id: string): Promise<Workspace | undefined>;
  getWorkspaceBySlug(slug: string): Promise<Workspace | undefined>;
  listWorkspaces(): Promise<Workspace[]>;
  createWorkspace(data: InsertWorkspace): Promise<Workspace>;
  updateWorkspace(id: string, data: Partial<InsertWorkspace>): Promise<Workspace>;
  deleteWorkspace(id: string): Promise<void>;

  getWorkspaceConfig(workspaceId: string): Promise<WorkspaceConfig | undefined>;
  upsertWorkspaceConfig(workspaceId: string, data: Partial<Omit<WorkspaceConfig, "workspaceId" | "updatedAt">>): Promise<WorkspaceConfig>;
  countOrchestrators(workspaceId: string): Promise<number>;
  countAgentsInWorkspace(workspaceId: string): Promise<number>;
  countChannelsInWorkspace(workspaceId: string): Promise<number>;
  countScheduledJobsInWorkspace(workspaceId: string): Promise<number>;
  countCloudIntegrations(workspaceId: string): Promise<number>;

  listOrchestrators(workspaceId: string): Promise<Orchestrator[]>;
  getOrchestrator(id: string): Promise<Orchestrator | undefined>;
  createOrchestrator(data: InsertOrchestrator): Promise<Orchestrator>;
  updateOrchestrator(id: string, data: Partial<InsertOrchestrator>): Promise<Orchestrator>;
  deleteOrchestrator(id: string): Promise<void>;

  listAgents(orchestratorId: string): Promise<Agent[]>;
  listAgentsWithHeartbeat(): Promise<Agent[]>;
  getAgent(id: string): Promise<Agent | undefined>;
  createAgent(data: InsertAgent): Promise<Agent>;
  updateAgent(id: string, data: Partial<InsertAgent>): Promise<Agent>;
  updateAgentHeartbeatLastFired(id: string): Promise<void>;
  deleteAgent(id: string): Promise<void>;

  listChannels(orchestratorId: string): Promise<Channel[]>;
  getChannel(id: string): Promise<Channel | undefined>;
  getChannelByApiKey(apiKey: string): Promise<Channel | undefined>;
  createChannel(data: InsertChannel): Promise<Channel>;
  updateChannel(id: string, data: Partial<InsertChannel>): Promise<Channel>;
  deleteChannel(id: string): Promise<void>;

  listTasks(orchestratorId: string, limit?: number, offset?: number, status?: string): Promise<Task[]>;
  countTasks(orchestratorId: string, status?: string): Promise<number>;
  listAllTasks(limit?: number, offset?: number): Promise<Task[]>;
  listPendingTasks(): Promise<Task[]>;
  getTask(id: string): Promise<Task | undefined>;
  createTask(data: InsertTask): Promise<Task>;
  updateTask(id: string, data: Partial<Task>): Promise<Task>;

  listTaskLogs(taskId: string): Promise<TaskLog[]>;
  createTaskLog(data: { taskId: string; level: "info" | "warn" | "error"; message: string; metadata?: Record<string, unknown>; logType?: string; parentLogId?: number }): Promise<TaskLog>;

  getAgentMemory(agentId: string, key: string): Promise<string | null>;
  setAgentMemory(agentId: string, key: string, value: string): Promise<void>;
  listAgentMemory(agentId: string): Promise<AgentMemory[]>;

  storeVectorMemory(agentId: string, workspaceId: string, content: string, embedding: number[], source: string, taskId?: string): Promise<void>;
  retrieveVectorMemories(agentId: string, workspaceId: string, queryEmbedding: number[], limit?: number): Promise<Array<{ content: string; source: string; similarity: number }>>;

  listCloudIntegrations(workspaceId: string): Promise<CloudIntegration[]>;
  getCloudIntegration(id: string): Promise<CloudIntegration | undefined>;
  createCloudIntegration(data: InsertCloudIntegration): Promise<CloudIntegration>;
  updateCloudIntegration(id: string, data: Partial<InsertCloudIntegration>): Promise<CloudIntegration>;
  deleteCloudIntegration(id: string): Promise<void>;
  getCloudIntegrationsForWorkspace(workspaceId: string): Promise<CloudIntegration[]>;
  touchCloudIntegration(id: string): Promise<void>;

  listChatConversations(workspaceId: string): Promise<ChatConversation[]>;
  getChatConversation(id: string): Promise<ChatConversation | undefined>;
  getOrCreateDefaultConversation(workspaceId: string): Promise<ChatConversation>;
  createChatConversation(data: InsertChatConversation): Promise<ChatConversation>;
  updateChatConversation(id: string, title: string): Promise<ChatConversation>;
  deleteChatConversation(id: string): Promise<void>;
  listChatMessages(conversationId: string): Promise<ChatMessage[]>;
  getChatMessage(id: string): Promise<ChatMessage | undefined>;
  createChatMessage(data: InsertChatMessage): Promise<ChatMessage>;
  updateChatMessage(id: string, data: Partial<ChatMessage>): Promise<ChatMessage>;
  listAgentsForWorkspace(workspaceId: string): Promise<(Agent & { orchestratorName: string; provider: string; model: string; baseUrl: string | null })[]>;
  getWorkspaceStats(workspaceId: string): Promise<{ orchestrators: number; agents: number; completedTasks: number; failedTasks: number; runningTasks: number; pendingTasks: number }>;
  getWorkspaceActivity(workspaceId: string, limit?: number): Promise<Array<{ id: string; type: string; status: string; title: string; subtitle: string; at: Date }>>;

  listScheduledJobs(workspaceId: string): Promise<ScheduledJob[]>;
  listAllActiveScheduledJobs(): Promise<ScheduledJob[]>;
  getScheduledJob(id: string): Promise<ScheduledJob | undefined>;
  createScheduledJob(data: InsertScheduledJob): Promise<ScheduledJob>;
  updateScheduledJob(id: string, data: Partial<ScheduledJob>): Promise<ScheduledJob>;
  deleteScheduledJob(id: string): Promise<void>;

  listOutboundChannels(orchestratorId: string): Promise<Channel[]>;
  logChannelDelivery(data: { channelId: string; event: string; statusCode?: number; responseBody?: string; error?: string }): Promise<void>;
  listChannelDeliveries(channelId: string, limit?: number): Promise<ChannelDelivery[]>;

  listApprovalRequests(workspaceId: string, status?: string, limit?: number, offset?: number): Promise<ApprovalRequest[]>;
  countApprovalRequests(workspaceId: string, status?: string): Promise<number>;
  getApprovalRequest(id: string): Promise<ApprovalRequest | undefined>;
  createApprovalRequest(data: InsertApprovalRequest): Promise<ApprovalRequest>;
  resolveApprovalRequest(id: string, resolvedBy: string, resolution: string, status: "approved" | "rejected"): Promise<ApprovalRequest>;
  countPendingApprovals(workspaceId: string): Promise<number>;

  listPipelines(workspaceId: string): Promise<Pipeline[]>;
  getPipeline(id: string): Promise<Pipeline | undefined>;
  createPipeline(data: InsertPipeline): Promise<Pipeline>;
  updatePipeline(id: string, data: Partial<Pipeline>): Promise<Pipeline>;
  deletePipeline(id: string): Promise<void>;

  listPipelineSteps(pipelineId: string): Promise<PipelineStep[]>;
  createPipelineStep(data: InsertPipelineStep): Promise<PipelineStep>;
  updatePipelineStep(id: string, data: Partial<PipelineStep>): Promise<PipelineStep>;
  deletePipelineStep(id: string): Promise<void>;
  deleteAllPipelineSteps(pipelineId: string): Promise<void>;

  listPipelineRuns(pipelineId: string, limit?: number): Promise<PipelineRun[]>;
  getPipelineRun(id: string): Promise<PipelineRun | undefined>;
  createPipelineRun(data: InsertPipelineRun): Promise<PipelineRun>;
  updatePipelineRun(id: string, data: Partial<PipelineRun>): Promise<PipelineRun>;

  listPipelineStepRuns(runId: string): Promise<PipelineStepRun[]>;
  createPipelineStepRun(data: Partial<PipelineStepRun> & { runId: string; stepId: string }): Promise<PipelineStepRun>;
  updatePipelineStepRun(id: string, data: Partial<PipelineStepRun>): Promise<PipelineStepRun>;

  createTokenUsage(data: InsertTokenUsage): Promise<TokenUsage>;
  getWorkspaceTokenStats(workspaceId: string, days?: number): Promise<{
    totalInputTokens: number;
    totalOutputTokens: number;
    totalCostUsd: number;
    byAgent: Array<{ agentName: string; inputTokens: number; outputTokens: number; costUsd: number; calls: number }>;
    byDay: Array<{ date: string; inputTokens: number; outputTokens: number; costUsd: number }>;
    byProvider: Array<{ provider: string; model: string; inputTokens: number; outputTokens: number; costUsd: number }>;
    recentUsage: TokenUsage[];
  }>;
  getGlobalTokenStats(days?: number): Promise<{
    totalInputTokens: number;
    totalOutputTokens: number;
    totalCostUsd: number;
    byWorkspace: Array<{ workspaceId: string; workspaceName: string; inputTokens: number; outputTokens: number; costUsd: number; calls: number }>;
    byDay: Array<{ date: string; inputTokens: number; outputTokens: number; costUsd: number }>;
    byProvider: Array<{ provider: string; model: string; inputTokens: number; outputTokens: number; costUsd: number }>;
  }>;

  getChannelById(id: string): Promise<Channel | undefined>;
  getOrchestratorForChannel(channelId: string): Promise<Orchestrator | undefined>;

  createCommsThread(data: InsertCommsThread): Promise<CommsThread>;
  getCommsThread(channelId: string, externalThreadId: string): Promise<CommsThread | undefined>;
  getCommsThreadById(id: string): Promise<CommsThread | undefined>;
  touchCommsThread(id: string): Promise<void>;
  updateCommsThreadRef(id: string, ref: Record<string, unknown>): Promise<void>;
  appendCommsThreadHistory(id: string, entry: { role: string; content: string }): Promise<void>;
  resetCommsThreadHistory(id: string): Promise<void>;
  getLastTaskForCommsThread(commsThreadId: string): Promise<Task | undefined>;

  listSsoProviders(): Promise<SsoProvider[]>;
  getActiveSsoProviders(): Promise<SsoProvider[]>;
  getSsoProvider(id: string): Promise<SsoProvider | undefined>;
  createSsoProvider(data: InsertSsoProvider): Promise<SsoProvider>;
  updateSsoProvider(id: string, data: Partial<InsertSsoProvider>): Promise<SsoProvider>;
  deleteSsoProvider(id: string): Promise<void>;
  getUserByEmail(email: string): Promise<User | undefined>;

  listEventTriggers(workspaceId: string): Promise<EventTrigger[]>;
  getEventTrigger(id: string): Promise<EventTrigger | undefined>;
  createEventTrigger(data: InsertEventTrigger): Promise<EventTrigger>;
  updateEventTrigger(id: string, data: Partial<InsertEventTrigger>): Promise<EventTrigger>;
  deleteEventTrigger(id: string): Promise<void>;
  logTriggerEvent(data: { triggerId: string; source: string; eventType: string; payloadPreview?: string; matched: boolean; taskId?: string; error?: string }): Promise<TriggerEvent>;
  listTriggerEvents(triggerId: string, limit?: number, offset?: number): Promise<TriggerEvent[]>;
  countTriggerEvents(triggerId: string): Promise<number>;

  listChannelsForWorkspace(workspaceId: string): Promise<Channel[]>;

  createMcpApiKey(data: { workspaceId: string; name: string; keyHash: string; createdBy?: string }): Promise<McpApiKey>;
  listMcpApiKeys(workspaceId: string): Promise<McpApiKey[]>;
  getMcpApiKeyByHash(keyHash: string): Promise<McpApiKey | undefined>;
  updateMcpApiKeyLastUsed(id: string): Promise<void>;
  deleteMcpApiKey(id: string): Promise<void>;

  listGitAgents(workspaceId: string): Promise<GitAgent[]>;
  getGitAgent(id: string): Promise<GitAgent | undefined>;
  getGitAgentBySlug(workspaceId: string, slug: string): Promise<GitAgent | undefined>;
  createGitAgent(data: InsertGitAgent): Promise<GitAgent>;
  updateGitAgent(id: string, data: Partial<InsertGitAgent>): Promise<GitAgent>;
  deleteGitAgent(id: string): Promise<void>;
  countGitAgentRuns(gitAgentId: string): Promise<number>;

  listGitRepos(workspaceId: string): Promise<GitRepo[]>;
  getGitRepo(id: string): Promise<GitRepo | undefined>;
  createGitRepo(data: InsertGitRepo): Promise<GitRepo>;
  updateGitRepo(id: string, data: Partial<GitRepo>): Promise<GitRepo>;
  deleteGitRepo(id: string): Promise<void>;

  listGitAgentRuns(repoId: string, limit?: number): Promise<GitAgentRun[]>;
  listGitAgentRunsByAgent(gitAgentId: string, limit?: number): Promise<GitAgentRun[]>;
  createGitAgentRun(data: Omit<GitAgentRun, "id" | "createdAt">): Promise<GitAgentRun>;
  updateGitAgentRun(id: string, data: Partial<GitAgentRun>): Promise<GitAgentRun>;

  getGlobalSettings(): Promise<GlobalSettings>;
  updateGlobalSettings(data: Partial<Pick<GlobalSettings, "appName" | "appLogoUrl" | "faviconUrl">>): Promise<GlobalSettings>;

  listProviderKeys(workspaceId: string | null): Promise<ProviderKey[]>;
  getProviderKey(workspaceId: string | null, provider: string): Promise<ProviderKey | null>;
  upsertProviderKey(workspaceId: string | null, provider: string, encryptedKey: string, baseUrl: string | null, label: string | null, updatedBy: string | null): Promise<ProviderKey>;
  deleteProviderKey(workspaceId: string | null, provider: string): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string) {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string) {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async createUser(data: { username: string; passwordHash: string; name?: string; role?: "admin" | "member" }) {
    const [user] = await db.insert(users).values({
      username: data.username,
      passwordHash: data.passwordHash,
      name: data.name ?? data.username,
      role: data.role ?? "member",
    }).returning();
    return user;
  }

  async upsertUser(data: InsertUser) {
    const [user] = await db.insert(users).values(data)
      .onConflictDoUpdate({ target: users.id, set: { ...data } })
      .returning();
    return user;
  }

  async listWorkspaceMembers(workspaceId: string): Promise<WorkspaceMemberWithUser[]> {
    const rows = await db
      .select({
        memberId: workspaceMembers.id,
        userId: workspaceMembers.userId,
        username: users.username,
        name: users.name,
        email: users.email,
        role: workspaceMembers.role,
      })
      .from(workspaceMembers)
      .innerJoin(users, eq(workspaceMembers.userId, users.id))
      .where(eq(workspaceMembers.workspaceId, workspaceId));
    return rows as WorkspaceMemberWithUser[];
  }

  async addWorkspaceMember(workspaceId: string, userId: string, role: "admin" | "member") {
    await db.insert(workspaceMembers)
      .values({ workspaceId, userId, role })
      .onConflictDoNothing();
  }

  async removeWorkspaceMember(workspaceId: string, userId: string) {
    await db.delete(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)));
  }

  async updateWorkspaceMemberRole(workspaceId: string, userId: string, role: "admin" | "member") {
    await db.update(workspaceMembers)
      .set({ role })
      .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)));
  }

  async isWorkspaceMember(workspaceId: string, userId: string): Promise<boolean> {
    const [row] = await db.select({ id: workspaceMembers.id })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)));
    return !!row;
  }

  async isWorkspaceAdminMember(workspaceId: string, userId: string): Promise<boolean> {
    const [row] = await db.select({ id: workspaceMembers.id })
      .from(workspaceMembers)
      .where(and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.userId, userId),
        eq(workspaceMembers.role, "admin"),
      ));
    return !!row;
  }

  async getWorkspaceAdminIds(userId: string): Promise<string[]> {
    const rows = await db.select({ workspaceId: workspaceMembers.workspaceId })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.userId, userId), eq(workspaceMembers.role, "admin")));
    return rows.map((r) => r.workspaceId);
  }

  async getUserWorkspaces(userId: string): Promise<Workspace[]> {
    const rows = await db
      .select({ workspace: workspaces })
      .from(workspaceMembers)
      .innerJoin(workspaces, eq(workspaceMembers.workspaceId, workspaces.id))
      .where(eq(workspaceMembers.userId, userId))
      .orderBy(desc(workspaces.createdAt));
    return rows.map((r) => r.workspace);
  }

  async getAdminWorkspaces(userId: string): Promise<Workspace[]> {
    const rows = await db
      .select({ workspace: workspaces })
      .from(workspaceMembers)
      .innerJoin(workspaces, eq(workspaceMembers.workspaceId, workspaces.id))
      .where(and(eq(workspaceMembers.userId, userId), eq(workspaceMembers.role, "admin")))
      .orderBy(desc(workspaces.createdAt));
    return rows.map((r) => r.workspace);
  }

  async getWorkspace(id: string) {
    const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, id));
    return ws;
  }

  async getWorkspaceBySlug(slug: string) {
    const normalized = slug.trim().toLowerCase();
    const [ws] = await db.select().from(workspaces)
      .where(sql`lower(trim(${workspaces.slug})) = ${normalized}`);
    return ws;
  }

  async listWorkspaces() {
    return db.select().from(workspaces).orderBy(desc(workspaces.createdAt));
  }

  async createWorkspace(data: InsertWorkspace) {
    const normalized = { ...data, slug: data.slug?.trim().toLowerCase().replace(/\s+/g, "-") };
    const [ws] = await db.insert(workspaces).values(normalized).returning();
    return ws;
  }

  async updateWorkspace(id: string, data: Partial<InsertWorkspace>) {
    if (data.slug !== undefined) {
      data = { ...data, slug: data.slug?.trim().toLowerCase().replace(/\s+/g, "-") };
    }
    const [ws] = await db.update(workspaces).set(data).where(eq(workspaces.id, id)).returning();
    return ws;
  }

  async deleteWorkspace(id: string) {
    await db.delete(workspaces).where(eq(workspaces.id, id));
  }

  async getWorkspaceConfig(workspaceId: string) {
    const [cfg] = await db.select().from(workspaceConfig).where(eq(workspaceConfig.workspaceId, workspaceId));
    return cfg;
  }

  async upsertWorkspaceConfig(workspaceId: string, data: Partial<Omit<WorkspaceConfig, "workspaceId" | "updatedAt">>) {
    const [cfg] = await db
      .insert(workspaceConfig)
      .values({ workspaceId, ...data, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: workspaceConfig.workspaceId,
        set: { ...data, updatedAt: new Date() },
      })
      .returning();
    return cfg;
  }

  async countOrchestrators(workspaceId: string) {
    const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(orchestrators).where(eq(orchestrators.workspaceId, workspaceId));
    return r?.n ?? 0;
  }

  async countAgentsInWorkspace(workspaceId: string) {
    const [r] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(agents)
      .innerJoin(orchestrators, eq(agents.orchestratorId, orchestrators.id))
      .where(eq(orchestrators.workspaceId, workspaceId));
    return r?.n ?? 0;
  }

  async countChannelsInWorkspace(workspaceId: string) {
    const [r] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(channels)
      .innerJoin(orchestrators, eq(channels.orchestratorId, orchestrators.id))
      .where(eq(orchestrators.workspaceId, workspaceId));
    return r?.n ?? 0;
  }

  async countScheduledJobsInWorkspace(workspaceId: string) {
    const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(scheduledJobs).where(eq(scheduledJobs.workspaceId, workspaceId));
    return r?.n ?? 0;
  }

  async countCloudIntegrations(workspaceId: string) {
    const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(cloudIntegrations).where(eq(cloudIntegrations.workspaceId, workspaceId));
    return r?.n ?? 0;
  }

  async listOrchestrators(workspaceId: string) {
    return db.select().from(orchestrators).where(eq(orchestrators.workspaceId, workspaceId)).orderBy(desc(orchestrators.createdAt));
  }

  async getOrchestrator(id: string) {
    const [orch] = await db.select().from(orchestrators).where(eq(orchestrators.id, id));
    return orch;
  }

  async createOrchestrator(data: InsertOrchestrator) {
    const [orch] = await db.insert(orchestrators).values(data).returning();
    return orch;
  }

  async updateOrchestrator(id: string, data: Partial<InsertOrchestrator>) {
    const [orch] = await db.update(orchestrators).set(data).where(eq(orchestrators.id, id)).returning();
    return orch;
  }

  async deleteOrchestrator(id: string) {
    await db.delete(orchestrators).where(eq(orchestrators.id, id));
  }

  async listAgents(orchestratorId: string) {
    return db.select().from(agents).where(eq(agents.orchestratorId, orchestratorId)).orderBy(desc(agents.createdAt));
  }

  async listAgentsWithHeartbeat() {
    return db.select().from(agents).where(eq(agents.heartbeatEnabled, true));
  }

  async getAgent(id: string) {
    const [agent] = await db.select().from(agents).where(eq(agents.id, id));
    return agent;
  }

  async createAgent(data: InsertAgent) {
    const [agent] = await db.insert(agents).values(data).returning();
    return agent;
  }

  async updateAgent(id: string, data: Partial<InsertAgent>) {
    const [agent] = await db.update(agents).set(data).where(eq(agents.id, id)).returning();
    return agent;
  }

  async updateAgentHeartbeatLastFired(id: string) {
    await db.update(agents).set({ heartbeatLastFiredAt: new Date() }).where(eq(agents.id, id));
  }

  async deleteAgent(id: string) {
    await db.delete(agents).where(eq(agents.id, id));
  }

  async listChannels(orchestratorId: string) {
    return db.select().from(channels).where(eq(channels.orchestratorId, orchestratorId)).orderBy(desc(channels.createdAt));
  }

  async getChannel(id: string) {
    const [ch] = await db.select().from(channels).where(eq(channels.id, id));
    return ch;
  }

  async getChannelByApiKey(apiKey: string) {
    const [ch] = await db.select().from(channels).where(eq(channels.apiKey, apiKey));
    return ch;
  }

  async createChannel(data: InsertChannel) {
    const [ch] = await db.insert(channels).values(data).returning();
    return ch;
  }

  async updateChannel(id: string, data: Partial<InsertChannel>) {
    const [ch] = await db.update(channels).set(data).where(eq(channels.id, id)).returning();
    return ch;
  }

  async deleteChannel(id: string) {
    await db.delete(channels).where(eq(channels.id, id));
  }

  async listTasks(orchestratorId: string, limit = 50, offset = 0, status?: string) {
    type TaskStatus = "pending" | "running" | "completed" | "failed";
    const conditions = [eq(tasks.orchestratorId, orchestratorId)];
    if (status) conditions.push(eq(tasks.status, status as TaskStatus));
    return db.select().from(tasks)
      .where(and(...conditions))
      .orderBy(desc(tasks.createdAt))
      .limit(limit)
      .offset(offset);
  }

  async countTasks(orchestratorId: string, status?: string): Promise<number> {
    type TaskStatus = "pending" | "running" | "completed" | "failed";
    const conditions = [eq(tasks.orchestratorId, orchestratorId)];
    if (status) conditions.push(eq(tasks.status, status as TaskStatus));
    const [row] = await db.select({ count: count() }).from(tasks).where(and(...conditions));
    return row?.count ?? 0;
  }

  async listAllTasks(limit = 100, offset = 0) {
    return db.select().from(tasks).orderBy(desc(tasks.createdAt)).limit(limit).offset(offset);
  }

  async listPendingTasks() {
    return db.select().from(tasks).where(eq(tasks.status, "pending")).orderBy(tasks.priority, tasks.createdAt);
  }

  async getTask(id: string) {
    const [task] = await db.select().from(tasks).where(eq(tasks.id, id));
    return task;
  }

  async createTask(data: InsertTask) {
    const [task] = await db.insert(tasks).values(data).returning();
    return task;
  }

  async updateTask(id: string, data: Partial<Task>) {
    const [task] = await db.update(tasks).set(data).where(eq(tasks.id, id)).returning();
    return task;
  }

  async listTaskLogs(taskId: string) {
    return db.select().from(taskLogs).where(eq(taskLogs.taskId, taskId)).orderBy(taskLogs.timestamp);
  }

  async createTaskLog(data: { taskId: string; level: "info" | "warn" | "error"; message: string; metadata?: Record<string, unknown>; logType?: string; parentLogId?: number }) {
    const [log] = await db.insert(taskLogs).values({
      taskId: data.taskId,
      level: data.level,
      message: data.message,
      metadata: data.metadata ?? {},
      logType: data.logType ?? "info",
      parentLogId: data.parentLogId ?? null,
    }).returning();
    return log;
  }

  async getAgentMemory(agentId: string, key: string): Promise<string | null> {
    const [mem] = await db.select().from(agentMemory)
      .where(and(eq(agentMemory.agentId, agentId), eq(agentMemory.key, key)));
    return mem?.value ?? null;
  }

  async setAgentMemory(agentId: string, key: string, value: string) {
    await db.insert(agentMemory).values({ agentId, key, value })
      .onConflictDoUpdate({ target: [agentMemory.agentId, agentMemory.key], set: { value, updatedAt: new Date() } });
  }

  async listAgentMemory(agentId: string) {
    return db.select().from(agentMemory).where(eq(agentMemory.agentId, agentId));
  }

  async storeVectorMemory(
    agentId: string,
    workspaceId: string,
    content: string,
    embedding: number[],
    source: string,
    taskId?: string,
  ): Promise<void> {
    const embStr = `[${embedding.join(",")}]`;
    await pool.query(
      `INSERT INTO agent_memory_vectors (agent_id, workspace_id, task_id, content, embedding, source)
       VALUES ($1, $2, $3, $4, $5::vector, $6)`,
      [agentId, workspaceId, taskId ?? null, content.slice(0, 2000), embStr, source],
    );
  }

  async retrieveVectorMemories(
    agentId: string,
    workspaceId: string,
    queryEmbedding: number[],
    limit = 5,
  ): Promise<Array<{ content: string; source: string; similarity: number }>> {
    const embStr = `[${queryEmbedding.join(",")}]`;
    const { rows } = await pool.query(
      `SELECT content, source, 1 - (embedding <=> $1::vector) AS similarity
       FROM agent_memory_vectors
       WHERE agent_id = $2 AND workspace_id = $3
       ORDER BY embedding <=> $1::vector
       LIMIT $4`,
      [embStr, agentId, workspaceId, limit],
    );
    return rows as Array<{ content: string; source: string; similarity: number }>;
  }

  async listCloudIntegrations(workspaceId: string) {
    return db.select().from(cloudIntegrations)
      .where(eq(cloudIntegrations.workspaceId, workspaceId))
      .orderBy(desc(cloudIntegrations.createdAt));
  }

  async getCloudIntegration(id: string) {
    const [ci] = await db.select().from(cloudIntegrations).where(eq(cloudIntegrations.id, id));
    return ci;
  }

  async createCloudIntegration(data: InsertCloudIntegration) {
    const [ci] = await db.insert(cloudIntegrations).values(data).returning();
    return ci;
  }

  async updateCloudIntegration(id: string, data: Partial<InsertCloudIntegration>) {
    const [ci] = await db.update(cloudIntegrations).set(data).where(eq(cloudIntegrations.id, id)).returning();
    return ci;
  }

  async deleteCloudIntegration(id: string) {
    await db.delete(cloudIntegrations).where(eq(cloudIntegrations.id, id));
  }

  async getCloudIntegrationsForWorkspace(workspaceId: string) {
    return db.select().from(cloudIntegrations)
      .where(and(eq(cloudIntegrations.workspaceId, workspaceId), eq(cloudIntegrations.isActive, true)));
  }

  async touchCloudIntegration(id: string) {
    await db.update(cloudIntegrations).set({ lastUsedAt: new Date() }).where(eq(cloudIntegrations.id, id));
  }

  async listChatConversations(workspaceId: string) {
    return db.select().from(chatConversations)
      .where(eq(chatConversations.workspaceId, workspaceId))
      .orderBy(desc(chatConversations.createdAt));
  }

  async getChatConversation(id: string) {
    const [conv] = await db.select().from(chatConversations).where(eq(chatConversations.id, id));
    return conv;
  }

  async getOrCreateDefaultConversation(workspaceId: string) {
    const [existing] = await db.select().from(chatConversations)
      .where(eq(chatConversations.workspaceId, workspaceId))
      .orderBy(chatConversations.createdAt)
      .limit(1);
    if (existing) return existing;
    const [created] = await db.insert(chatConversations)
      .values({ workspaceId, title: "General" })
      .returning();
    return created;
  }

  async createChatConversation(data: InsertChatConversation) {
    const [conv] = await db.insert(chatConversations).values(data).returning();
    return conv;
  }

  async updateChatConversation(id: string, title: string) {
    const [conv] = await db.update(chatConversations)
      .set({ title })
      .where(eq(chatConversations.id, id))
      .returning();
    return conv;
  }

  async deleteChatConversation(id: string) {
    await db.delete(chatConversations).where(eq(chatConversations.id, id));
  }

  async listChatMessages(conversationId: string) {
    return db.select().from(chatMessages)
      .where(eq(chatMessages.conversationId, conversationId))
      .orderBy(chatMessages.createdAt);
  }

  async getChatMessage(id: string) {
    const [msg] = await db.select().from(chatMessages).where(eq(chatMessages.id, id));
    return msg;
  }

  async createChatMessage(data: InsertChatMessage) {
    const [msg] = await db.insert(chatMessages).values(data).returning();
    return msg;
  }

  async updateChatMessage(id: string, data: Partial<ChatMessage>) {
    const [msg] = await db.update(chatMessages).set(data).where(eq(chatMessages.id, id)).returning();
    return msg;
  }

  async listAgentsForWorkspace(workspaceId: string) {
    const rows = await db
      .select({
        id: agents.id,
        orchestratorId: agents.orchestratorId,
        name: agents.name,
        description: agents.description,
        instructions: agents.instructions,
        tools: agents.tools,
        memoryEnabled: agents.memoryEnabled,
        reactEnabled: agents.reactEnabled,
        maxTokens: agents.maxTokens,
        temperature: agents.temperature,
        sandboxTimeoutSeconds: agents.sandboxTimeoutSeconds,
        heartbeatEnabled: agents.heartbeatEnabled,
        heartbeatIntervalMinutes: agents.heartbeatIntervalMinutes,
        heartbeatChecklist: agents.heartbeatChecklist,
        heartbeatTarget: agents.heartbeatTarget,
        heartbeatModel: agents.heartbeatModel,
        heartbeatSilencePhrase: agents.heartbeatSilencePhrase,
        heartbeatLastFiredAt: agents.heartbeatLastFiredAt,
        heartbeatNotifyChannelId: agents.heartbeatNotifyChannelId,
        createdAt: agents.createdAt,
        orchestratorName: orchestrators.name,
        provider: orchestrators.provider,
        model: orchestrators.model,
        baseUrl: orchestrators.baseUrl,
      })
      .from(agents)
      .innerJoin(orchestrators, eq(agents.orchestratorId, orchestrators.id))
      .where(eq(orchestrators.workspaceId, workspaceId))
      .orderBy(agents.name);
    return rows;
  }

  async getWorkspaceStats(workspaceId: string) {
    const orchRows = await db.select({ id: orchestrators.id }).from(orchestrators).where(eq(orchestrators.workspaceId, workspaceId));
    const orchIds = orchRows.map((r) => r.id);

    const agentCount = orchIds.length === 0 ? 0 :
      (await db.select({ count: sql<number>`count(*)::int` }).from(agents).where(inArray(agents.orchestratorId, orchIds)))[0]?.count ?? 0;

    if (orchIds.length === 0) {
      return { orchestrators: 0, agents: 0, completedTasks: 0, failedTasks: 0, runningTasks: 0, pendingTasks: 0 };
    }

    const taskRows = await db
      .select({ status: tasks.status, count: sql<number>`count(*)::int` })
      .from(tasks)
      .where(inArray(tasks.orchestratorId, orchIds))
      .groupBy(tasks.status);

    const counts: Record<string, number> = {};
    for (const row of taskRows) counts[row.status ?? "pending"] = row.count;

    return {
      orchestrators: orchIds.length,
      agents: agentCount,
      completedTasks: counts["completed"] ?? 0,
      failedTasks: counts["failed"] ?? 0,
      runningTasks: counts["running"] ?? 0,
      pendingTasks: counts["pending"] ?? 0,
    };
  }

  async getWorkspaceActivity(workspaceId: string, limit = 25) {
    const orchRows = await db.select({ id: orchestrators.id }).from(orchestrators).where(eq(orchestrators.workspaceId, workspaceId));
    const orchIds = orchRows.map(r => r.id);

    const pipelineRows = orchIds.length > 0
      ? await db.select({ id: pipelines.id, name: pipelines.name }).from(pipelines).where(inArray(pipelines.orchestratorId, orchIds))
      : [];
    const pipelineMap: Record<string, string> = Object.fromEntries(pipelineRows.map(p => [p.id, p.name]));
    const pipelineIds = pipelineRows.map(p => p.id);

    type Item = { id: string; type: string; status: string; title: string; subtitle: string; at: Date };
    const items: Item[] = [];

    if (orchIds.length > 0) {
      const recentTasks = await db
        .select({ id: tasks.id, status: tasks.status, input: tasks.input, orchestratorId: tasks.orchestratorId, agentName: agents.name, createdAt: tasks.createdAt })
        .from(tasks)
        .leftJoin(agents, eq(tasks.agentId, agents.id))
        .where(inArray(tasks.orchestratorId, orchIds))
        .orderBy(desc(tasks.createdAt))
        .limit(15);
      for (const t of recentTasks) {
        items.push({ id: `task-${t.id}`, type: "task", status: t.status ?? "pending",
          title: t.agentName ? `${t.agentName}` : "Task", subtitle: (t.input ?? "").slice(0, 100), at: t.createdAt ?? new Date() });
      }
    }

    if (pipelineIds.length > 0) {
      const recentRuns = await db
        .select({ id: pipelineRuns.id, pipelineId: pipelineRuns.pipelineId, status: pipelineRuns.status, triggeredBy: pipelineRuns.triggeredBy, createdAt: pipelineRuns.createdAt })
        .from(pipelineRuns)
        .where(inArray(pipelineRuns.pipelineId, pipelineIds))
        .orderBy(desc(pipelineRuns.createdAt))
        .limit(10);
      for (const r of recentRuns) {
        items.push({ id: `pipeline-${r.id}`, type: "pipeline_run", status: r.status,
          title: `Pipeline: ${pipelineMap[r.pipelineId] ?? "Unknown"}`, subtitle: `Triggered by ${r.triggeredBy ?? "manual"}`, at: r.createdAt ?? new Date() });
      }
    }

    const recentApprovals = await db
      .select({ id: approvalRequests.id, status: approvalRequests.status, agentName: approvalRequests.agentName, message: approvalRequests.message, createdAt: approvalRequests.createdAt })
      .from(approvalRequests)
      .where(eq(approvalRequests.workspaceId, workspaceId))
      .orderBy(desc(approvalRequests.createdAt))
      .limit(10);
    for (const a of recentApprovals) {
      items.push({ id: `approval-${a.id}`, type: "approval", status: a.status,
        title: a.agentName ? `${a.agentName} requested approval` : "Approval requested", subtitle: (a.message ?? "").slice(0, 100), at: a.createdAt ?? new Date() });
    }

    items.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
    return items.slice(0, limit);
  }

  async listScheduledJobs(workspaceId: string) {
    return db.select().from(scheduledJobs).where(eq(scheduledJobs.workspaceId, workspaceId)).orderBy(desc(scheduledJobs.createdAt));
  }

  async listAllActiveScheduledJobs() {
    return db.select().from(scheduledJobs).where(eq(scheduledJobs.isActive, true));
  }

  async getScheduledJob(id: string) {
    const [job] = await db.select().from(scheduledJobs).where(eq(scheduledJobs.id, id));
    return job;
  }

  async createScheduledJob(data: InsertScheduledJob) {
    const [job] = await db.insert(scheduledJobs).values(data).returning();
    return job;
  }

  async updateScheduledJob(id: string, data: Partial<ScheduledJob>) {
    const [job] = await db.update(scheduledJobs).set(data).where(eq(scheduledJobs.id, id)).returning();
    return job;
  }

  async deleteScheduledJob(id: string) {
    await db.delete(scheduledJobs).where(eq(scheduledJobs.id, id));
  }

  async listOutboundChannels(orchestratorId: string): Promise<Channel[]> {
    return db.select().from(channels).where(
      and(
        eq(channels.orchestratorId, orchestratorId),
        eq(channels.isActive, true),
        inArray(channels.type, ["slack", "teams", "google_chat", "generic_webhook"] as any),
      )
    );
  }

  async logChannelDelivery(data: { channelId: string; event: string; statusCode?: number; responseBody?: string; error?: string }): Promise<void> {
    await db.insert(channelDeliveries).values({
      channelId: data.channelId,
      event: data.event,
      statusCode: data.statusCode ?? null,
      responseBody: data.responseBody ?? null,
      error: data.error ?? null,
    });
  }

  async listChannelDeliveries(channelId: string, limit = 50): Promise<ChannelDelivery[]> {
    return db.select().from(channelDeliveries)
      .where(eq(channelDeliveries.channelId, channelId))
      .orderBy(desc(channelDeliveries.sentAt))
      .limit(limit);
  }

  async listApprovalRequests(workspaceId: string, status?: string, limit = 20, offset = 0): Promise<ApprovalRequest[]> {
    const conditions = [eq(approvalRequests.workspaceId, workspaceId)];
    if (status) conditions.push(eq(approvalRequests.status, status));
    return db.select().from(approvalRequests)
      .where(and(...conditions))
      .orderBy(desc(approvalRequests.createdAt))
      .limit(limit)
      .offset(offset);
  }

  async countApprovalRequests(workspaceId: string, status?: string): Promise<number> {
    const conditions = [eq(approvalRequests.workspaceId, workspaceId)];
    if (status) conditions.push(eq(approvalRequests.status, status));
    const [row] = await db.select({ count: count() }).from(approvalRequests).where(and(...conditions));
    return row?.count ?? 0;
  }

  async getApprovalRequest(id: string): Promise<ApprovalRequest | undefined> {
    const [row] = await db.select().from(approvalRequests).where(eq(approvalRequests.id, id));
    return row;
  }

  async createApprovalRequest(data: InsertApprovalRequest): Promise<ApprovalRequest> {
    const [row] = await db.insert(approvalRequests).values(data).returning();
    return row;
  }

  async resolveApprovalRequest(id: string, resolvedBy: string, resolution: string, status: "approved" | "rejected"): Promise<ApprovalRequest> {
    const [row] = await db.update(approvalRequests)
      .set({ status, resolvedBy, resolution, resolvedAt: new Date() })
      .where(eq(approvalRequests.id, id))
      .returning();
    return row;
  }

  async countPendingApprovals(workspaceId: string): Promise<number> {
    const [row] = await db.select({ count: sql<number>`count(*)::int` })
      .from(approvalRequests)
      .where(and(eq(approvalRequests.workspaceId, workspaceId), eq(approvalRequests.status, "pending")));
    return row?.count ?? 0;
  }

  async listPipelines(workspaceId: string): Promise<Pipeline[]> {
    return db.select().from(pipelines)
      .where(eq(pipelines.workspaceId, workspaceId))
      .orderBy(desc(pipelines.createdAt));
  }

  async getPipeline(id: string): Promise<Pipeline | undefined> {
    const [row] = await db.select().from(pipelines).where(eq(pipelines.id, id));
    return row;
  }

  async createPipeline(data: InsertPipeline): Promise<Pipeline> {
    const [row] = await db.insert(pipelines).values(data).returning();
    return row;
  }

  async updatePipeline(id: string, data: Partial<Pipeline>): Promise<Pipeline> {
    const [row] = await db.update(pipelines).set(data).where(eq(pipelines.id, id)).returning();
    return row;
  }

  async deletePipeline(id: string): Promise<void> {
    await db.delete(pipelines).where(eq(pipelines.id, id));
  }

  async listPipelineSteps(pipelineId: string): Promise<PipelineStep[]> {
    return db.select().from(pipelineSteps)
      .where(eq(pipelineSteps.pipelineId, pipelineId))
      .orderBy(pipelineSteps.stepOrder);
  }

  async createPipelineStep(data: InsertPipelineStep): Promise<PipelineStep> {
    const [row] = await db.insert(pipelineSteps).values(data).returning();
    return row;
  }

  async updatePipelineStep(id: string, data: Partial<PipelineStep>): Promise<PipelineStep> {
    const [row] = await db.update(pipelineSteps).set(data).where(eq(pipelineSteps.id, id)).returning();
    return row;
  }

  async deletePipelineStep(id: string): Promise<void> {
    await db.delete(pipelineSteps).where(eq(pipelineSteps.id, id));
  }

  async deleteAllPipelineSteps(pipelineId: string): Promise<void> {
    await db.delete(pipelineSteps).where(eq(pipelineSteps.pipelineId, pipelineId));
  }

  async listPipelineRuns(pipelineId: string, limit = 20): Promise<PipelineRun[]> {
    return db.select().from(pipelineRuns)
      .where(eq(pipelineRuns.pipelineId, pipelineId))
      .orderBy(desc(pipelineRuns.createdAt))
      .limit(limit);
  }

  async getPipelineRun(id: string): Promise<PipelineRun | undefined> {
    const [row] = await db.select().from(pipelineRuns).where(eq(pipelineRuns.id, id));
    return row;
  }

  async createPipelineRun(data: InsertPipelineRun): Promise<PipelineRun> {
    const [row] = await db.insert(pipelineRuns).values(data).returning();
    return row;
  }

  async updatePipelineRun(id: string, data: Partial<PipelineRun>): Promise<PipelineRun> {
    const [row] = await db.update(pipelineRuns).set(data).where(eq(pipelineRuns.id, id)).returning();
    return row;
  }

  async listPipelineStepRuns(runId: string): Promise<PipelineStepRun[]> {
    return db.select().from(pipelineStepRuns)
      .where(eq(pipelineStepRuns.runId, runId))
      .orderBy(pipelineStepRuns.startedAt);
  }

  async createPipelineStepRun(data: Partial<PipelineStepRun> & { runId: string; stepId: string }): Promise<PipelineStepRun> {
    const [row] = await db.insert(pipelineStepRuns).values({
      runId: data.runId,
      stepId: data.stepId,
      taskId: data.taskId ?? null,
      status: data.status ?? "pending",
      startedAt: data.startedAt ?? new Date(),
    }).returning();
    return row;
  }

  async updatePipelineStepRun(id: string, data: Partial<PipelineStepRun>): Promise<PipelineStepRun> {
    const [row] = await db.update(pipelineStepRuns).set(data).where(eq(pipelineStepRuns.id, id)).returning();
    return row;
  }

  async createTokenUsage(data: InsertTokenUsage): Promise<TokenUsage> {
    const [row] = await db.insert(tokenUsage).values(data).returning();
    return row;
  }

  async getWorkspaceTokenStats(workspaceId: string, days = 30) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const rows = await db.select().from(tokenUsage)
      .where(and(eq(tokenUsage.workspaceId, workspaceId), gte(tokenUsage.createdAt, since)))
      .orderBy(desc(tokenUsage.createdAt));

    const totalInputTokens = rows.reduce((s, r) => s + r.inputTokens, 0);
    const totalOutputTokens = rows.reduce((s, r) => s + r.outputTokens, 0);
    const totalCostUsd = rows.reduce((s, r) => s + (r.estimatedCostUsd ?? 0), 0);

    const agentMap = new Map<string, { inputTokens: number; outputTokens: number; costUsd: number; calls: number }>();
    for (const r of rows) {
      const key = r.agentName ?? "Unknown";
      const existing = agentMap.get(key) ?? { inputTokens: 0, outputTokens: 0, costUsd: 0, calls: 0 };
      agentMap.set(key, {
        inputTokens: existing.inputTokens + r.inputTokens,
        outputTokens: existing.outputTokens + r.outputTokens,
        costUsd: existing.costUsd + (r.estimatedCostUsd ?? 0),
        calls: existing.calls + 1,
      });
    }
    const byAgent = Array.from(agentMap.entries()).map(([agentName, stats]) => ({ agentName, ...stats }));

    const dayMap = new Map<string, { inputTokens: number; outputTokens: number; costUsd: number }>();
    for (const r of rows) {
      const date = (r.createdAt ?? new Date()).toISOString().slice(0, 10);
      const existing = dayMap.get(date) ?? { inputTokens: 0, outputTokens: 0, costUsd: 0 };
      dayMap.set(date, {
        inputTokens: existing.inputTokens + r.inputTokens,
        outputTokens: existing.outputTokens + r.outputTokens,
        costUsd: existing.costUsd + (r.estimatedCostUsd ?? 0),
      });
    }
    const byDay = Array.from(dayMap.entries())
      .map(([date, stats]) => ({ date, ...stats }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const provMap = new Map<string, { inputTokens: number; outputTokens: number; costUsd: number }>();
    for (const r of rows) {
      const key = `${r.provider}::${r.model}`;
      const existing = provMap.get(key) ?? { inputTokens: 0, outputTokens: 0, costUsd: 0 };
      provMap.set(key, {
        inputTokens: existing.inputTokens + r.inputTokens,
        outputTokens: existing.outputTokens + r.outputTokens,
        costUsd: existing.costUsd + (r.estimatedCostUsd ?? 0),
      });
    }
    const byProvider = Array.from(provMap.entries()).map(([key, stats]) => {
      const [provider, model] = key.split("::");
      return { provider, model, ...stats };
    });

    return { totalInputTokens, totalOutputTokens, totalCostUsd, byAgent, byDay, byProvider, recentUsage: rows.slice(0, 50) };
  }

  async getGlobalTokenStats(days = 30) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const rows = await db
      .select({
        workspaceId: tokenUsage.workspaceId,
        workspaceName: workspaces.name,
        provider: tokenUsage.provider,
        model: tokenUsage.model,
        inputTokens: tokenUsage.inputTokens,
        outputTokens: tokenUsage.outputTokens,
        estimatedCostUsd: tokenUsage.estimatedCostUsd,
        createdAt: tokenUsage.createdAt,
      })
      .from(tokenUsage)
      .leftJoin(workspaces, eq(tokenUsage.workspaceId, workspaces.id))
      .where(gte(tokenUsage.createdAt, since))
      .orderBy(desc(tokenUsage.createdAt));

    const totalInputTokens = rows.reduce((s, r) => s + r.inputTokens, 0);
    const totalOutputTokens = rows.reduce((s, r) => s + r.outputTokens, 0);
    const totalCostUsd = rows.reduce((s, r) => s + (r.estimatedCostUsd ?? 0), 0);

    const allWorkspaces = await db.select({ id: workspaces.id, name: workspaces.name }).from(workspaces);

    const wsMap = new Map<string, { workspaceName: string; inputTokens: number; outputTokens: number; costUsd: number; calls: number }>();
    for (const ws of allWorkspaces) {
      wsMap.set(ws.id, { workspaceName: ws.name, inputTokens: 0, outputTokens: 0, costUsd: 0, calls: 0 });
    }
    for (const r of rows) {
      const existing = wsMap.get(r.workspaceId) ?? { workspaceName: r.workspaceName ?? r.workspaceId, inputTokens: 0, outputTokens: 0, costUsd: 0, calls: 0 };
      wsMap.set(r.workspaceId, {
        workspaceName: existing.workspaceName,
        inputTokens: existing.inputTokens + r.inputTokens,
        outputTokens: existing.outputTokens + r.outputTokens,
        costUsd: existing.costUsd + (r.estimatedCostUsd ?? 0),
        calls: existing.calls + 1,
      });
    }
    const byWorkspace = Array.from(wsMap.entries())
      .map(([workspaceId, stats]) => ({ workspaceId, ...stats }))
      .sort((a, b) => b.calls - a.calls);

    const dayMap = new Map<string, { inputTokens: number; outputTokens: number; costUsd: number }>();
    for (const r of rows) {
      const date = (r.createdAt ?? new Date()).toISOString().slice(0, 10);
      const existing = dayMap.get(date) ?? { inputTokens: 0, outputTokens: 0, costUsd: 0 };
      dayMap.set(date, {
        inputTokens: existing.inputTokens + r.inputTokens,
        outputTokens: existing.outputTokens + r.outputTokens,
        costUsd: existing.costUsd + (r.estimatedCostUsd ?? 0),
      });
    }
    const byDay = Array.from(dayMap.entries())
      .map(([date, stats]) => ({ date, ...stats }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const provMap = new Map<string, { inputTokens: number; outputTokens: number; costUsd: number }>();
    for (const r of rows) {
      const key = `${r.provider}::${r.model}`;
      const existing = provMap.get(key) ?? { inputTokens: 0, outputTokens: 0, costUsd: 0 };
      provMap.set(key, {
        inputTokens: existing.inputTokens + r.inputTokens,
        outputTokens: existing.outputTokens + r.outputTokens,
        costUsd: existing.costUsd + (r.estimatedCostUsd ?? 0),
      });
    }
    const byProvider = Array.from(provMap.entries()).map(([key, stats]) => {
      const [provider, model] = key.split("::");
      return { provider, model, ...stats };
    });

    return { totalInputTokens, totalOutputTokens, totalCostUsd, byWorkspace, byDay, byProvider };
  }

  async getChannelById(id: string) {
    return this.getChannel(id);
  }

  async getOrchestratorForChannel(channelId: string): Promise<Orchestrator | undefined> {
    const [ch] = await db.select().from(channels).where(eq(channels.id, channelId));
    if (!ch) return undefined;
    return this.getOrchestrator(ch.orchestratorId);
  }

  async createCommsThread(data: InsertCommsThread): Promise<CommsThread> {
    const [thread] = await db.insert(commsThreads).values(data as any).returning();
    return thread;
  }

  async getCommsThread(channelId: string, externalThreadId: string): Promise<CommsThread | undefined> {
    const [thread] = await db.select().from(commsThreads).where(
      and(eq(commsThreads.channelId, channelId), eq(commsThreads.externalThreadId, externalThreadId)),
    );
    return thread;
  }

  async getCommsThreadById(id: string): Promise<CommsThread | undefined> {
    const [thread] = await db.select().from(commsThreads).where(eq(commsThreads.id, id));
    return thread;
  }

  async touchCommsThread(id: string): Promise<void> {
    await db.update(commsThreads).set({ lastActivityAt: new Date() }).where(eq(commsThreads.id, id));
  }

  async updateCommsThreadRef(id: string, ref: Record<string, unknown>): Promise<void> {
    await db.update(commsThreads).set({ conversationRef: ref, lastActivityAt: new Date() }).where(eq(commsThreads.id, id));
  }

  async appendCommsThreadHistory(id: string, entry: { role: string; content: string }): Promise<void> {
    const thread = await this.getCommsThreadById(id);
    if (!thread) return;
    const existing = (thread.history as Array<{ role: string; content: string }>) ?? [];
    const updated = [...existing, entry].slice(-50);
    await db.update(commsThreads).set({ history: updated, lastActivityAt: new Date() }).where(eq(commsThreads.id, id));
  }

  async resetCommsThreadHistory(id: string): Promise<void> {
    await db.update(commsThreads).set({ history: [], lastActivityAt: new Date() }).where(eq(commsThreads.id, id));
  }

  async getLastTaskForCommsThread(commsThreadId: string): Promise<Task | undefined> {
    const [task] = await db
      .select()
      .from(tasks)
      .where(eq(tasks.commsThreadId, commsThreadId))
      .orderBy(desc(tasks.createdAt))
      .limit(1);
    return task;
  }

  // ── SSO Providers ───────────────────────────────────────────────────────────

  async listSsoProviders(): Promise<SsoProvider[]> {
    return db.select().from(ssoProviders).orderBy(ssoProviders.createdAt);
  }

  async getActiveSsoProviders(): Promise<SsoProvider[]> {
    return db.select().from(ssoProviders).where(eq(ssoProviders.isActive, true)).orderBy(ssoProviders.name);
  }

  async getSsoProvider(id: string): Promise<SsoProvider | undefined> {
    const [p] = await db.select().from(ssoProviders).where(eq(ssoProviders.id, id));
    return p;
  }

  async createSsoProvider(data: InsertSsoProvider): Promise<SsoProvider> {
    const [p] = await db.insert(ssoProviders).values(data).returning();
    return p;
  }

  async updateSsoProvider(id: string, data: Partial<InsertSsoProvider>): Promise<SsoProvider> {
    const [p] = await db.update(ssoProviders).set(data).where(eq(ssoProviders.id, id)).returning();
    return p;
  }

  async deleteSsoProvider(id: string): Promise<void> {
    await db.delete(ssoProviders).where(eq(ssoProviders.id, id));
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  // ── Event Triggers ──────────────────────────────────────────────────────────

  async listEventTriggers(workspaceId: string): Promise<EventTrigger[]> {
    return db.select().from(eventTriggers).where(eq(eventTriggers.workspaceId, workspaceId)).orderBy(eventTriggers.createdAt);
  }

  async getEventTrigger(id: string): Promise<EventTrigger | undefined> {
    const [t] = await db.select().from(eventTriggers).where(eq(eventTriggers.id, id));
    return t;
  }

  async createEventTrigger(data: InsertEventTrigger): Promise<EventTrigger> {
    const [t] = await db.insert(eventTriggers).values(data).returning();
    return t;
  }

  async updateEventTrigger(id: string, data: Partial<InsertEventTrigger>): Promise<EventTrigger> {
    const [t] = await db.update(eventTriggers).set(data).where(eq(eventTriggers.id, id)).returning();
    return t;
  }

  async deleteEventTrigger(id: string): Promise<void> {
    await db.delete(eventTriggers).where(eq(eventTriggers.id, id));
  }

  async logTriggerEvent(data: { triggerId: string; source: string; eventType: string; payloadPreview?: string; matched: boolean; taskId?: string; error?: string }): Promise<TriggerEvent> {
    const [ev] = await db.insert(triggerEvents).values({
      triggerId: data.triggerId,
      source: data.source,
      eventType: data.eventType,
      payloadPreview: data.payloadPreview,
      matched: data.matched,
      taskId: data.taskId,
      error: data.error,
    }).returning();
    return ev;
  }

  async listTriggerEvents(triggerId: string, limit = 20, offset = 0): Promise<TriggerEvent[]> {
    return db.select().from(triggerEvents)
      .where(eq(triggerEvents.triggerId, triggerId))
      .orderBy(desc(triggerEvents.receivedAt))
      .limit(limit)
      .offset(offset);
  }

  async countTriggerEvents(triggerId: string): Promise<number> {
    const [row] = await db.select({ count: count() }).from(triggerEvents).where(eq(triggerEvents.triggerId, triggerId));
    return row?.count ?? 0;
  }

  async listChannelsForWorkspace(workspaceId: string): Promise<Channel[]> {
    const rows = await db
      .select({ channel: channels })
      .from(channels)
      .innerJoin(orchestrators, eq(channels.orchestratorId, orchestrators.id))
      .where(eq(orchestrators.workspaceId, workspaceId));
    return rows.map((r) => r.channel);
  }

  async createMcpApiKey(data: { workspaceId: string; name: string; keyHash: string; createdBy?: string }): Promise<McpApiKey> {
    const [key] = await db.insert(mcpApiKeys).values({
      workspaceId: data.workspaceId,
      name: data.name,
      keyHash: data.keyHash,
      createdBy: data.createdBy ?? null,
    }).returning();
    return key;
  }

  async listMcpApiKeys(workspaceId: string): Promise<McpApiKey[]> {
    return db.select().from(mcpApiKeys).where(eq(mcpApiKeys.workspaceId, workspaceId)).orderBy(desc(mcpApiKeys.createdAt));
  }

  async getMcpApiKeyByHash(keyHash: string): Promise<McpApiKey | undefined> {
    const [key] = await db.select().from(mcpApiKeys).where(eq(mcpApiKeys.keyHash, keyHash));
    return key;
  }

  async updateMcpApiKeyLastUsed(id: string): Promise<void> {
    await db.update(mcpApiKeys).set({ lastUsedAt: new Date() }).where(eq(mcpApiKeys.id, id));
  }

  async deleteMcpApiKey(id: string): Promise<void> {
    await db.delete(mcpApiKeys).where(eq(mcpApiKeys.id, id));
  }

  async listGitAgents(workspaceId: string): Promise<GitAgent[]> {
    return db.select().from(gitAgents).where(eq(gitAgents.workspaceId, workspaceId)).orderBy(desc(gitAgents.createdAt));
  }

  async getGitAgent(id: string): Promise<GitAgent | undefined> {
    const [row] = await db.select().from(gitAgents).where(eq(gitAgents.id, id));
    return row;
  }

  async getGitAgentBySlug(workspaceId: string, slug: string): Promise<GitAgent | undefined> {
    const [row] = await db.select().from(gitAgents).where(and(eq(gitAgents.workspaceId, workspaceId), eq(gitAgents.slug, slug)));
    return row;
  }

  async createGitAgent(data: InsertGitAgent): Promise<GitAgent> {
    const [row] = await db.insert(gitAgents).values(data as any).returning();
    return row;
  }

  async updateGitAgent(id: string, data: Partial<InsertGitAgent>): Promise<GitAgent> {
    const [row] = await db.update(gitAgents).set(data as any).where(eq(gitAgents.id, id)).returning();
    return row;
  }

  async deleteGitAgent(id: string): Promise<void> {
    await db.delete(gitAgents).where(eq(gitAgents.id, id));
  }

  async countGitAgentRuns(gitAgentId: string): Promise<number> {
    const [row] = await db.select({ count: count() }).from(gitAgentRuns).where(eq(gitAgentRuns.gitAgentId, gitAgentId));
    return row?.count ?? 0;
  }

  async listGitRepos(workspaceId: string): Promise<GitRepo[]> {
    return db.select().from(gitRepos).where(eq(gitRepos.workspaceId, workspaceId)).orderBy(desc(gitRepos.createdAt));
  }

  async getGitRepo(id: string): Promise<GitRepo | undefined> {
    const [row] = await db.select().from(gitRepos).where(eq(gitRepos.id, id));
    return row;
  }

  async createGitRepo(data: InsertGitRepo): Promise<GitRepo> {
    const [row] = await db.insert(gitRepos).values(data).returning();
    return row;
  }

  async updateGitRepo(id: string, data: Partial<GitRepo>): Promise<GitRepo> {
    const [row] = await db.update(gitRepos).set(data).where(eq(gitRepos.id, id)).returning();
    return row;
  }

  async deleteGitRepo(id: string): Promise<void> {
    await db.delete(gitRepos).where(eq(gitRepos.id, id));
  }

  async listGitAgentRuns(repoId: string, limit = 50): Promise<GitAgentRun[]> {
    return db.select().from(gitAgentRuns).where(eq(gitAgentRuns.repoId, repoId)).orderBy(desc(gitAgentRuns.createdAt)).limit(limit);
  }

  async listGitAgentRunsByAgent(gitAgentId: string, limit = 50): Promise<GitAgentRun[]> {
    return db.select().from(gitAgentRuns).where(eq(gitAgentRuns.gitAgentId, gitAgentId)).orderBy(desc(gitAgentRuns.createdAt)).limit(limit);
  }

  async createGitAgentRun(data: Omit<GitAgentRun, "id" | "createdAt">): Promise<GitAgentRun> {
    const [row] = await db.insert(gitAgentRuns).values(data as any).returning();
    return row;
  }

  async updateGitAgentRun(id: string, data: Partial<GitAgentRun>): Promise<GitAgentRun> {
    const [row] = await db.update(gitAgentRuns).set(data as any).where(eq(gitAgentRuns.id, id)).returning();
    return row;
  }

  async getGlobalSettings(): Promise<GlobalSettings> {
    const [row] = await db.select().from(globalSettings).where(eq(globalSettings.id, "singleton"));
    return row ?? { id: "singleton", appName: "NanoOrch", appLogoUrl: null, faviconUrl: null, updatedAt: new Date() };
  }

  async updateGlobalSettings(data: Partial<Pick<GlobalSettings, "appName" | "appLogoUrl" | "faviconUrl">>): Promise<GlobalSettings> {
    const [row] = await db
      .update(globalSettings)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(globalSettings.id, "singleton"))
      .returning();
    return row;
  }

  async listProviderKeys(workspaceId: string | null): Promise<ProviderKey[]> {
    if (workspaceId === null) {
      return db.select().from(providerKeys).where(sql`${providerKeys.workspaceId} IS NULL`);
    }
    return db.select().from(providerKeys).where(eq(providerKeys.workspaceId, workspaceId));
  }

  async getProviderKey(workspaceId: string | null, provider: string): Promise<ProviderKey | null> {
    let rows: ProviderKey[];
    if (workspaceId === null) {
      rows = await db.select().from(providerKeys).where(
        and(sql`${providerKeys.workspaceId} IS NULL`, eq(providerKeys.provider, provider))
      );
    } else {
      rows = await db.select().from(providerKeys).where(
        and(eq(providerKeys.workspaceId, workspaceId), eq(providerKeys.provider, provider))
      );
    }
    return rows[0] ?? null;
  }

  async upsertProviderKey(workspaceId: string | null, provider: string, encryptedKey: string, baseUrl: string | null, label: string | null, updatedBy: string | null): Promise<ProviderKey> {
    const existing = await this.getProviderKey(workspaceId, provider);
    if (existing) {
      const [row] = await db.update(providerKeys)
        .set({ encryptedKey, baseUrl, label, updatedBy, updatedAt: new Date() })
        .where(eq(providerKeys.id, existing.id))
        .returning();
      return row;
    }
    const [row] = await db.insert(providerKeys)
      .values({ workspaceId, provider, encryptedKey, baseUrl, label, updatedBy, updatedAt: new Date() })
      .returning();
    return row;
  }

  async deleteProviderKey(workspaceId: string | null, provider: string): Promise<void> {
    const existing = await this.getProviderKey(workspaceId, provider);
    if (existing) {
      await db.delete(providerKeys).where(eq(providerKeys.id, existing.id));
    }
  }
}

export const storage = new DatabaseStorage();

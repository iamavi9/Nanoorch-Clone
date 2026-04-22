import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Plus, Bot, Trash2, Edit, Brain, Thermometer, Wrench, ChevronDown, ChevronRight, Database, Cloud, Timer, GitBranch, Heart, Zap, Clock, MessageSquare, Users, LayoutTemplate } from "lucide-react";
import TemplateGalleryDialog, { type AgentTemplate } from "@/components/TemplateGalleryDialog";
import { SiJira, SiGithub, SiGitlab, SiSlack } from "react-icons/si";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Agent, CloudIntegration } from "@shared/schema";

interface Props {
  orchestratorId: string;
  workspaceId: string;
}

interface AgentForm {
  name: string;
  description: string;
  instructions: string;
  maxTokens: number;
  temperature: number;
  memoryEnabled: boolean;
  reactEnabled: boolean;
  tools: string[];
  sandboxTimeoutSeconds: number | null;
  heartbeatEnabled: boolean;
  heartbeatIntervalMinutes: number;
  heartbeatChecklist: string;
  heartbeatTarget: string;
  heartbeatModel: string;
  heartbeatSilencePhrase: string;
  heartbeatNotifyChannelId: string;
}

const defaultForm: AgentForm = {
  name: "",
  description: "",
  instructions: "",
  maxTokens: 4096,
  temperature: 70,
  memoryEnabled: false,
  reactEnabled: false,
  tools: [],
  sandboxTimeoutSeconds: null,
  heartbeatEnabled: false,
  heartbeatIntervalMinutes: 30,
  heartbeatChecklist: "",
  heartbeatTarget: "none",
  heartbeatModel: "",
  heartbeatSilencePhrase: "HEARTBEAT_OK",
  heartbeatNotifyChannelId: "",
};

const HEARTBEAT_INTERVALS = [
  { value: "5", label: "Every 5 minutes" },
  { value: "10", label: "Every 10 minutes" },
  { value: "15", label: "Every 15 minutes" },
  { value: "30", label: "Every 30 minutes" },
  { value: "60", label: "Every hour" },
  { value: "120", label: "Every 2 hours" },
  { value: "240", label: "Every 4 hours" },
  { value: "480", label: "Every 8 hours" },
];

const PROVIDER_TOOLS: Record<string, { name: string; label: string; description: string }[]> = {
  ragflow: [
    { name: "ragflow_list_datasets", label: "List Datasets", description: "List all knowledge base datasets" },
    { name: "ragflow_query_dataset", label: "Query Dataset", description: "Query a single dataset with a question" },
    { name: "ragflow_query_multiple_datasets", label: "Query Multiple Datasets", description: "Query across multiple datasets at once" },
  ],
  aws: [
    { name: "aws_list_s3_buckets", label: "List S3 Buckets", description: "List all S3 buckets" },
    { name: "aws_list_s3_objects", label: "List S3 Objects", description: "List objects in an S3 bucket" },
    { name: "aws_list_ec2_instances", label: "List EC2 Instances", description: "List EC2 instances" },
    { name: "aws_list_lambda_functions", label: "List Lambda Functions", description: "List Lambda functions" },
    { name: "aws_get_cloudwatch_logs", label: "Get CloudWatch Logs", description: "Fetch CloudWatch log events" },
  ],
  gcp: [
    { name: "gcp_list_storage_buckets", label: "List Storage Buckets", description: "List GCS buckets" },
    { name: "gcp_list_compute_instances", label: "List Compute Instances", description: "List GCE instances" },
    { name: "gcp_list_cloud_functions", label: "List Cloud Functions", description: "List Cloud Functions" },
  ],
  azure: [
    { name: "azure_list_resource_groups", label: "List Resource Groups", description: "List Azure resource groups" },
    { name: "azure_list_virtual_machines", label: "List Virtual Machines", description: "List Azure VMs" },
    { name: "azure_list_storage_accounts", label: "List Storage Accounts", description: "List Azure storage accounts" },
  ],
  jira: [
    { name: "jira_list_projects", label: "List Projects", description: "List all accessible Jira projects" },
    { name: "jira_search_issues", label: "Search Issues (JQL)", description: "Search issues using JQL" },
    { name: "jira_get_issue", label: "Get Issue", description: "Get full details of a Jira issue including attachments list" },
    { name: "jira_create_issue", label: "Create Issue", description: "Create a Bug, Task, Story, or Epic" },
    { name: "jira_update_issue", label: "Update Issue", description: "Update summary, status, priority or assignee" },
    { name: "jira_add_comment", label: "Add Comment", description: "Add a comment to a Jira issue" },
    { name: "jira_list_sprints", label: "List Sprints", description: "List sprints for a board" },
    { name: "jira_get_attachment", label: "Get Attachment", description: "Download attachment content by ID (text or base64 for binary files)" },
    { name: "jira_upload_attachment", label: "Upload Attachment", description: "Upload a file (base64 or text) as an attachment to a Jira issue" },
  ],
  github: [
    { name: "github_list_repos", label: "List Repos", description: "List repositories for a user or org" },
    { name: "github_list_issues", label: "List Issues", description: "List issues in a repository" },
    { name: "github_get_issue", label: "Get Issue", description: "Get full details of an issue" },
    { name: "github_create_issue", label: "Create Issue", description: "Create a new GitHub issue" },
    { name: "github_list_pull_requests", label: "List Pull Requests", description: "List PRs in a repository" },
    { name: "github_create_pull_request", label: "Create Pull Request", description: "Open a new PR between branches" },
    { name: "github_list_workflow_runs", label: "List Workflow Runs", description: "List GitHub Actions workflow runs" },
  ],
  gitlab: [
    { name: "gitlab_list_projects", label: "List Projects", description: "List accessible GitLab projects" },
    { name: "gitlab_list_issues", label: "List Issues", description: "List issues in a project" },
    { name: "gitlab_get_issue", label: "Get Issue", description: "Get full details of an issue" },
    { name: "gitlab_create_issue", label: "Create Issue", description: "Create a new GitLab issue" },
    { name: "gitlab_list_merge_requests", label: "List Merge Requests", description: "List MRs in a project" },
    { name: "gitlab_create_merge_request", label: "Create Merge Request", description: "Open a new MR" },
    { name: "gitlab_list_pipelines", label: "List Pipelines", description: "List CI/CD pipelines" },
    { name: "gitlab_trigger_pipeline", label: "Trigger Pipeline", description: "Trigger a CI/CD pipeline" },
  ],
  teams: [
    { name: "teams_send_message", label: "Send Message", description: "Send a message to a Teams channel or chat" },
    { name: "teams_send_notification", label: "Send Notification", description: "Send a formatted notification card to Teams" },
  ],
  slack: [
    { name: "slack_send_message", label: "Send Message", description: "Send a message to a Slack channel" },
    { name: "slack_send_notification", label: "Send Notification", description: "Send a formatted notification to Slack" },
  ],
  google_chat: [
    { name: "google_chat_send_message", label: "Send Message", description: "Send a plain text message to a Google Chat space" },
    { name: "google_chat_send_card", label: "Send Card", description: "Send a rich card message to Google Chat" },
  ],
  servicenow: [
    { name: "servicenow_search_records", label: "Search Records", description: "Search ServiceNow records by table and query" },
    { name: "servicenow_get_incident", label: "Get Incident", description: "Get full details of a ServiceNow incident" },
    { name: "servicenow_create_incident", label: "Create Incident", description: "Create a new ServiceNow incident" },
    { name: "servicenow_update_record", label: "Update Record", description: "Update a ServiceNow record by sys_id" },
    { name: "servicenow_add_work_note", label: "Add Work Note", description: "Add a work note to an incident or record" },
    { name: "servicenow_get_ritm", label: "Get RITM", description: "Get a Requested Item (RITM) from a service request" },
    { name: "servicenow_create_ritm", label: "Create RITM", description: "Create a new Requested Item" },
    { name: "servicenow_create_change_request", label: "Create Change Request", description: "Create a new change request" },
    { name: "servicenow_get_catalog_items", label: "Get Catalog Items", description: "List items from the service catalog" },
  ],
  postgresql: [
    // Query & Read
    { name: "pg_list_schemas", label: "List Schemas", description: "List all non-system schemas in the database" },
    { name: "pg_list_tables", label: "List Tables", description: "List tables with type and estimated row count" },
    { name: "pg_describe_table", label: "Describe Table", description: "Show columns, types, nullability, and primary keys" },
    { name: "pg_query", label: "Run Query", description: "Execute a read-only SELECT or WITH statement" },
    { name: "pg_query_page", label: "Paginated Query", description: "Run a paginated SELECT with total row count and hasMore flag" },
    { name: "pg_explain", label: "Explain Query", description: "Return the query execution plan without running the query" },
    { name: "pg_explain_analyze", label: "Explain Analyze", description: "Run a query and return execution plan with actual runtimes" },
    // Schema & Metadata
    { name: "pg_list_indexes", label: "List Indexes", description: "List all indexes including uniqueness and primary key status" },
    { name: "pg_list_views", label: "List Views", description: "List all views and materialized views" },
    { name: "pg_list_functions", label: "List Functions", description: "List stored functions and procedures with signatures" },
    { name: "pg_list_triggers", label: "List Triggers", description: "List all triggers with event type and timing" },
    { name: "pg_list_constraints", label: "List Constraints", description: "List PK, FK, UNIQUE, CHECK constraints with relationships" },
    { name: "pg_list_extensions", label: "List Extensions", description: "List installed PostgreSQL extensions" },
    { name: "pg_column_stats", label: "Column Statistics", description: "Show per-column statistics from pg_stats" },
    // DBA Monitoring
    { name: "pg_active_connections", label: "Active Connections", description: "List active database connections and their current queries" },
    { name: "pg_long_queries", label: "Long Running Queries", description: "List queries running longer than a threshold" },
    { name: "pg_list_locks", label: "List Locks", description: "Show current database locks and which queries hold them" },
    { name: "pg_blocking_queries", label: "Blocking Queries", description: "Show which queries are blocking others" },
    { name: "pg_table_sizes", label: "Table Sizes", description: "Show disk size for all tables sorted by total size" },
    { name: "pg_database_size", label: "Database Size", description: "Return the total disk size of the current database" },
    { name: "pg_table_health", label: "Table Health", description: "Show live/dead row counts and last vacuum timestamps" },
    { name: "pg_index_usage", label: "Index Usage", description: "Show index scan counts to find unused indexes" },
    { name: "pg_slow_queries", label: "Slow Queries", description: "Top slowest queries by mean execution time (requires pg_stat_statements)" },
    { name: "pg_replication_lag", label: "Replication Lag", description: "Show replication lag for all connected standby replicas" },
    // Write / DDL (approval-gated)
    { name: "pg_execute", label: "Execute SQL", description: "Execute a write SQL statement — requires approval" },
    { name: "pg_upsert", label: "Upsert Row", description: "Insert or update a row on conflict — requires approval" },
    { name: "pg_bulk_insert", label: "Bulk Insert", description: "Insert up to 1000 rows from a JSON array — requires approval" },
    { name: "pg_call_procedure", label: "Call Procedure", description: "Call a stored procedure with arguments — requires approval" },
    { name: "pg_truncate", label: "Truncate Table", description: "Remove all rows from a table — requires approval" },
    { name: "pg_create_table", label: "Create Table", description: "Create a new table from column definitions — requires approval" },
    { name: "pg_drop_table", label: "Drop Table", description: "Permanently drop a table — requires approval" },
    { name: "pg_alter_table", label: "Alter Table", description: "Add/drop/rename columns, set defaults — requires approval" },
    { name: "pg_create_index", label: "Create Index", description: "Create an index on a table — requires approval" },
    { name: "pg_drop_index", label: "Drop Index", description: "Drop an index — requires approval" },
    { name: "pg_refresh_matview", label: "Refresh Materialized View", description: "Refresh a materialized view — requires approval" },
    { name: "pg_transaction", label: "Transaction", description: "Run multiple statements atomically — requires approval" },
    { name: "pg_terminate_connection", label: "Terminate Connection", description: "Kill a database connection by PID — requires approval" },
    { name: "pg_vacuum", label: "Vacuum Table", description: "Reclaim dead tuple space with VACUUM ANALYZE — requires approval" },
    // Advanced
    { name: "pg_vector_search", label: "Vector Search", description: "Nearest-neighbour search using pgvector embeddings" },
    { name: "pg_fulltext_search", label: "Full-Text Search", description: "Search text or tsvector columns using PostgreSQL FTS" },
    { name: "pg_notify", label: "Notify Channel", description: "Send a NOTIFY event to a PostgreSQL pub/sub channel" },
    { name: "pg_list_partitions", label: "List Partitions", description: "List child partitions of a partitioned table" },
    { name: "pg_list_policies", label: "List RLS Policies", description: "List Row Level Security policies on tables" },
    { name: "pg_list_replication_slots", label: "List Replication Slots", description: "List logical and physical replication slots with lag" },
  ],
};

const PROVIDER_ICONS: Record<string, { icon: any; color: string; bg: string }> = {
  ragflow: { icon: Database, color: "text-violet-400", bg: "bg-violet-500/10" },
  aws: { icon: Cloud, color: "text-orange-400", bg: "bg-orange-500/10" },
  gcp: { icon: Cloud, color: "text-blue-400", bg: "bg-blue-500/10" },
  azure: { icon: Cloud, color: "text-sky-400", bg: "bg-sky-500/10" },
  jira: { icon: SiJira, color: "text-blue-600", bg: "bg-blue-600/10" },
  github: { icon: SiGithub, color: "text-gray-300", bg: "bg-gray-500/10" },
  gitlab: { icon: SiGitlab, color: "text-orange-400", bg: "bg-orange-400/10" },
  teams: { icon: Users, color: "text-purple-400", bg: "bg-purple-500/10" },
  slack: { icon: SiSlack, color: "text-green-400", bg: "bg-green-500/10" },
  google_chat: { icon: MessageSquare, color: "text-blue-400", bg: "bg-blue-500/10" },
  servicenow: { icon: Wrench, color: "text-emerald-400", bg: "bg-emerald-500/10" },
  postgresql: { icon: Database, color: "text-cyan-400", bg: "bg-cyan-500/10" },
  kubernetes: { icon: Cloud, color: "text-blue-400", bg: "bg-blue-500/10" },
};

function ToolsPicker({ workspaceId, selected, onChange }: {
  workspaceId: string;
  selected: string[];
  onChange: (tools: string[]) => void;
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const { data: integrations = [], isLoading } = useQuery<CloudIntegration[]>({
    queryKey: [`/api/workspaces/${workspaceId}/integrations`],
  });

  const toggle = (toolName: string) => {
    onChange(selected.includes(toolName)
      ? selected.filter((t) => t !== toolName)
      : [...selected, toolName]);
  };

  const toggleExpand = (id: string) => setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));

  if (isLoading) return <Skeleton className="h-16 w-full" />;

  if (integrations.length === 0) {
    return (
      <div className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
        No cloud integrations configured.{" "}
        <a href={`/workspaces/${workspaceId}/integrations`} className="underline text-primary hover:text-primary/80">
          Add one on the Integrations page.
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {integrations.map((ci) => {
        const tools = PROVIDER_TOOLS[ci.provider] ?? [];
        if (tools.length === 0) return null;
        const isOpen = expanded[ci.id] ?? true;
        const providerMeta = PROVIDER_ICONS[ci.provider] ?? { icon: Cloud, color: "text-muted-foreground", bg: "bg-muted" };
        const Icon = providerMeta.icon;
        const enabledCount = tools.filter((t) => selected.includes(t.name)).length;

        return (
          <div key={ci.id} className="rounded-md border">
            <button
              type="button"
              className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-muted/40 transition-colors text-left"
              onClick={() => toggleExpand(ci.id)}
              data-testid={`expand-tools-${ci.id}`}
            >
              <div className="flex items-center gap-2">
                <div className={`w-6 h-6 rounded flex items-center justify-center ${providerMeta.bg}`}>
                  <Icon className={`w-3.5 h-3.5 ${providerMeta.color}`} />
                </div>
                <span className="text-sm font-medium">{ci.name}</span>
                <Badge variant="outline" className="text-xs px-1.5 py-0">{{ aws: "AWS", gcp: "GCP", azure: "Azure", ragflow: "RAGFlow", jira: "Jira", github: "GitHub", gitlab: "GitLab", teams: "MS Teams", slack: "Slack", google_chat: "Google Chat", servicenow: "ServiceNow", postgresql: "PostgreSQL", kubernetes: "Kubernetes" }[ci.provider] ?? ci.provider}</Badge>
              </div>
              <div className="flex items-center gap-2">
                {enabledCount > 0 && (
                  <Badge className="text-xs bg-primary/20 text-primary border-primary/30 px-1.5 py-0">
                    {enabledCount}/{tools.length}
                  </Badge>
                )}
                {isOpen ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
              </div>
            </button>

            {isOpen && (
              <div className="border-t px-3 py-2 space-y-2">
                {tools.map((tool) => (
                  <div key={tool.name} className="flex items-start gap-2.5 py-1">
                    <Checkbox
                      id={`tool-${tool.name}`}
                      checked={selected.includes(tool.name)}
                      onCheckedChange={() => toggle(tool.name)}
                      data-testid={`checkbox-tool-${tool.name}`}
                    />
                    <label htmlFor={`tool-${tool.name}`} className="cursor-pointer flex-1 min-w-0">
                      <div className="text-sm font-medium leading-none">{tool.label}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{tool.description}</div>
                    </label>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function AgentsPage({ orchestratorId, workspaceId }: Props) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [editAgent, setEditAgent] = useState<Agent | null>(null);
  const [form, setForm] = useState<AgentForm>(defaultForm);
  const [templateGalleryOpen, setTemplateGalleryOpen] = useState(false);
  const [appliedTemplate, setAppliedTemplate] = useState<string | null>(null);

  const { data: agents, isLoading } = useQuery<Agent[]>({
    queryKey: [`/api/orchestrators/${orchestratorId}/agents`],
  });

  const { data: channels = [] } = useQuery<{ id: string; name: string; type: string }[]>({
    queryKey: [`/api/workspaces/${workspaceId}/channels`],
    enabled: !!workspaceId,
  });
  const outboundChannels = channels.filter((c) => ["slack", "teams", "google_chat", "generic_webhook"].includes(c.type));

  const createMutation = useMutation({
    mutationFn: (data: AgentForm) => apiRequest("POST", `/api/orchestrators/${orchestratorId}/agents`, data),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: [`/api/orchestrators/${orchestratorId}/agents`] });
      setOpen(false);
      setForm(defaultForm);
      toast({ title: "Agent created" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: AgentForm }) => apiRequest("PUT", `/api/agents/${id}`, data),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: [`/api/orchestrators/${orchestratorId}/agents`] });
      setEditAgent(null);
      setOpen(false);
      toast({ title: "Agent updated" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/agents/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [`/api/orchestrators/${orchestratorId}/agents`] }),
  });

  const fireHeartbeatMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/agents/${id}/heartbeat/fire`);
      return res.json() as Promise<{ taskId: string; message: string }>;
    },
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: [`/api/orchestrators/${orchestratorId}/agents`] });
      toast({ title: "Heartbeat fired", description: `Task ${data.taskId} created` });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const openCreate = () => {
    setEditAgent(null);
    setForm(defaultForm);
    setAppliedTemplate(null);
    setOpen(true);
  };

  const handleTemplateSelect = (template: AgentTemplate) => {
    setEditAgent(null);
    setAppliedTemplate(template.name);
    setForm({
      ...defaultForm,
      name: template.name,
      description: template.description,
      instructions: template.systemPrompt,
      tools: template.tools,
      temperature: template.defaultTemperature,
      maxTokens: template.defaultMaxTokens,
    });
    setOpen(true);
  };

  const openEdit = (agent: Agent) => {
    setEditAgent(agent);
    setForm({
      name: agent.name,
      description: agent.description ?? "",
      instructions: agent.instructions ?? "",
      maxTokens: agent.maxTokens ?? 4096,
      temperature: agent.temperature ?? 70,
      memoryEnabled: agent.memoryEnabled ?? false,
      reactEnabled: agent.reactEnabled ?? false,
      tools: Array.isArray(agent.tools) ? (agent.tools as string[]) : [],
      sandboxTimeoutSeconds: agent.sandboxTimeoutSeconds ?? null,
      heartbeatEnabled: agent.heartbeatEnabled ?? false,
      heartbeatIntervalMinutes: agent.heartbeatIntervalMinutes ?? 30,
      heartbeatChecklist: agent.heartbeatChecklist ?? "",
      heartbeatTarget: agent.heartbeatTarget ?? "none",
      heartbeatModel: agent.heartbeatModel ?? "",
      heartbeatSilencePhrase: agent.heartbeatSilencePhrase ?? "HEARTBEAT_OK",
      heartbeatNotifyChannelId: (agent as any).heartbeatNotifyChannelId ?? "",
    });
    setOpen(true);
  };

  const handleSubmit = () => {
    if (editAgent) {
      updateMutation.mutate({ id: editAgent.id, data: form });
    } else {
      createMutation.mutate(form);
    }
  };

  const formatLastFired = (agent: Agent) => {
    const lastFired = agent.heartbeatLastFiredAt;
    if (!lastFired) return "Never";
    const d = new Date(lastFired);
    const diff = Date.now() - d.getTime();
    if (diff < 60_000) return "Just now";
    if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`;
    return d.toLocaleDateString();
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Agents</h1>
          <p className="text-muted-foreground mt-1">AI agents within this orchestrator</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setTemplateGalleryOpen(true)} data-testid="button-from-template">
            <LayoutTemplate className="w-4 h-4 mr-2" /> From Template
          </Button>
          <Button onClick={openCreate} data-testid="button-new-agent">
            <Plus className="w-4 h-4 mr-2" /> New Agent
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-40" />)}
        </div>
      ) : agents?.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-16 text-center">
            <Bot className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
            <h3 className="font-semibold mb-2">No agents yet</h3>
            <p className="text-muted-foreground mb-4">Start from a template or build from scratch</p>
            <div className="flex items-center justify-center gap-2">
              <Button variant="outline" onClick={() => setTemplateGalleryOpen(true)} data-testid="button-template-empty-state">
                <LayoutTemplate className="w-4 h-4 mr-2" /> From Template
              </Button>
              <Button onClick={openCreate} data-testid="button-create-first-agent">
                <Plus className="w-4 h-4 mr-2" /> Create Agent
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {agents?.map((agent) => {
            const toolCount = Array.isArray(agent.tools) ? (agent.tools as string[]).length : 0;
            const heartbeatOn = agent.heartbeatEnabled;
            return (
              <Card key={agent.id} className="group" data-testid={`card-agent-${agent.id}`}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div className="w-9 h-9 rounded-lg bg-violet-500/10 flex items-center justify-center mb-2">
                      <Bot className="w-5 h-5 text-violet-400" />
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100">
                      {heartbeatOn && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-green-400"
                          onClick={() => fireHeartbeatMutation.mutate(agent.id)}
                          disabled={fireHeartbeatMutation.isPending}
                          title="Fire heartbeat now"
                          data-testid={`button-fire-heartbeat-${agent.id}`}
                        >
                          <Zap className="w-3.5 h-3.5" />
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(agent)}
                        data-testid={`button-edit-agent-${agent.id}`}>
                        <Edit className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteMutation.mutate(agent.id)}
                        data-testid={`button-delete-agent-${agent.id}`}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                  <CardTitle className="text-base">{agent.name}</CardTitle>
                  {agent.description && <p className="text-xs text-muted-foreground">{agent.description}</p>}
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-1.5">
                    <Badge variant="secondary" className="text-xs gap-1">
                      <Thermometer className="w-3 h-3" /> {(agent.temperature ?? 70) / 100}
                    </Badge>
                    <Badge variant="secondary" className="text-xs">{agent.maxTokens ?? 4096} tokens</Badge>
                    {agent.memoryEnabled && (
                      <Badge className="text-xs bg-blue-500/20 text-blue-400 border-blue-500/30 gap-1">
                        <Brain className="w-3 h-3" /> Memory
                      </Badge>
                    )}
                    {agent.reactEnabled && (
                      <Badge className="text-xs bg-yellow-500/20 text-yellow-400 border-yellow-500/30 gap-1">
                        <Zap className="w-3 h-3" /> ReAct
                      </Badge>
                    )}
                    {toolCount > 0 && (
                      <Badge className="text-xs bg-violet-500/20 text-violet-400 border-violet-500/30 gap-1"
                        data-testid={`badge-tools-${agent.id}`}>
                        <Wrench className="w-3 h-3" /> {toolCount} tool{toolCount !== 1 ? "s" : ""}
                      </Badge>
                    )}
                    {agent.sandboxTimeoutSeconds != null && (
                      <Badge variant="secondary" className="text-xs gap-1"
                        data-testid={`badge-timeout-${agent.id}`}>
                        <Timer className="w-3 h-3" /> {agent.sandboxTimeoutSeconds}s
                      </Badge>
                    )}
                    {heartbeatOn && (
                      <Badge className="text-xs bg-green-500/20 text-green-400 border-green-500/30 gap-1"
                        data-testid={`badge-heartbeat-${agent.id}`}>
                        <Heart className="w-3 h-3" /> {agent.heartbeatIntervalMinutes ?? 30}m
                      </Badge>
                    )}
                  </div>
                  {heartbeatOn && (
                    <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground"
                      data-testid={`text-heartbeat-last-${agent.id}`}>
                      <Clock className="w-3 h-3" />
                      Last fired: {formatLastFired(agent)}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editAgent ? "Edit Agent" : "Create Agent"}</DialogTitle>
          </DialogHeader>
          {appliedTemplate && !editAgent && (
            <div className="flex items-center gap-2 text-xs rounded-lg border border-primary/30 bg-primary/5 px-3 py-2">
              <LayoutTemplate className="w-3.5 h-3.5 text-primary shrink-0" />
              <span className="text-primary font-medium">Based on template:</span>
              <span className="text-muted-foreground">{appliedTemplate}</span>
              <button
                onClick={() => { setAppliedTemplate(null); setForm(defaultForm); }}
                className="ml-auto text-muted-foreground hover:text-foreground"
                title="Clear template"
              >
                ×
              </button>
            </div>
          )}
          <div className="space-y-4 py-2">
            <div>
              <Label>Name</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Research Agent" className="mt-1" data-testid="input-agent-name" />
            </div>
            <div>
              <Label>Description</Label>
              <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Optional description" className="mt-1" />
            </div>
            <div>
              <Label>Instructions</Label>
              <Textarea value={form.instructions} onChange={(e) => setForm({ ...form, instructions: e.target.value })}
                placeholder="You are a research agent specialized in..." className="mt-1 font-mono text-sm" rows={4}
                data-testid="input-agent-instructions" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs">Temperature: {(form.temperature / 100).toFixed(2)}</Label>
                <Slider min={0} max={100} step={5} value={[form.temperature]}
                  onValueChange={([v]) => setForm({ ...form, temperature: v })} className="mt-2" />
              </div>
              <div>
                <Label className="text-xs">Max Tokens</Label>
                <Input type="number" value={form.maxTokens} className="mt-1"
                  onChange={(e) => setForm({ ...form, maxTokens: parseInt(e.target.value) || 4096 })} />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={form.memoryEnabled} onCheckedChange={(v) => setForm({ ...form, memoryEnabled: v })}
                id="memory-switch" data-testid="switch-memory" />
              <Label htmlFor="memory-switch" className="cursor-pointer">
                <span className="flex items-center gap-1.5"><Brain className="w-4 h-4" /> Enable Memory</span>
                <span className="text-xs text-muted-foreground">Agent retains context between tasks and chat</span>
              </Label>
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={form.reactEnabled} onCheckedChange={(v) => setForm({ ...form, reactEnabled: v })}
                id="react-switch" data-testid="switch-react" />
              <Label htmlFor="react-switch" className="cursor-pointer">
                <span className="flex items-center gap-1.5"><Zap className="w-4 h-4" /> Enable ReAct Mode</span>
                <span className="text-xs text-muted-foreground">Agent reasons explicitly before every action (Thought → Act → Observe)</span>
              </Label>
            </div>
            <div>
              <Label className="flex items-center gap-1.5 text-xs">
                <Timer className="w-3.5 h-3.5" /> Code Execution Timeout (seconds)
              </Label>
              <div className="flex items-center gap-2 mt-1">
                <Input
                  type="number"
                  min={5}
                  max={300}
                  placeholder="Default (30s)"
                  value={form.sandboxTimeoutSeconds ?? ""}
                  onChange={(e) => {
                    const val = e.target.value === "" ? null : Math.min(300, Math.max(5, parseInt(e.target.value) || 5));
                    setForm({ ...form, sandboxTimeoutSeconds: val });
                  }}
                  className="w-40"
                  data-testid="input-sandbox-timeout"
                />
                {form.sandboxTimeoutSeconds != null && (
                  <Button type="button" variant="ghost" size="sm" className="text-xs text-muted-foreground"
                    onClick={() => setForm({ ...form, sandboxTimeoutSeconds: null })}>
                    Reset to default
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                How long the sandbox can run before being killed. Min 5s, max 300s. Leave blank to use the system default (30s).
              </p>
            </div>
            <div>
              <Label className="flex items-center gap-1.5 mb-2">
                <Wrench className="w-4 h-4" /> Tools
              </Label>
              <ToolsPicker
                workspaceId={workspaceId}
                selected={form.tools}
                onChange={(tools) => setForm({ ...form, tools })}
              />
            </div>

            <div className="rounded-lg border border-green-500/30 bg-green-500/5 p-4 space-y-4">
              <div className="flex items-center gap-3">
                <Switch
                  checked={form.heartbeatEnabled}
                  onCheckedChange={(v) => setForm({ ...form, heartbeatEnabled: v })}
                  id="heartbeat-switch"
                  data-testid="switch-heartbeat"
                />
                <Label htmlFor="heartbeat-switch" className="cursor-pointer">
                  <span className="flex items-center gap-1.5 text-green-400">
                    <Heart className="w-4 h-4" /> Heartbeat
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Agent proactively monitors and alerts on a schedule
                  </span>
                </Label>
              </div>

              {form.heartbeatEnabled && (
                <div className="space-y-3 pt-1">
                  <div>
                    <Label className="text-xs">Check Interval</Label>
                    <Select
                      value={String(form.heartbeatIntervalMinutes)}
                      onValueChange={(v) => setForm({ ...form, heartbeatIntervalMinutes: parseInt(v) })}
                    >
                      <SelectTrigger className="mt-1" data-testid="select-heartbeat-interval">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {HEARTBEAT_INTERVALS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label className="text-xs">Checklist (Markdown)</Label>
                    <Textarea
                      value={form.heartbeatChecklist}
                      onChange={(e) => setForm({ ...form, heartbeatChecklist: e.target.value })}
                      placeholder={`- Check for urgent unread messages\n- Look for failed jobs in the last hour\n- Report any critical alerts`}
                      className="mt-1 font-mono text-xs"
                      rows={5}
                      data-testid="input-heartbeat-checklist"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Tasks to run each cycle. Leave blank for a general status check.
                    </p>
                  </div>

                  <div>
                    <Label className="text-xs">Alert Target</Label>
                    <Select
                      value={form.heartbeatTarget}
                      onValueChange={(v) => setForm({ ...form, heartbeatTarget: v })}
                    >
                      <SelectTrigger className="mt-1" data-testid="select-heartbeat-target">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None — silent (no alerts sent)</SelectItem>
                        <SelectItem value="channel">Notify channels</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground mt-1">
                      Where to send alerts when the agent finds something. Silent mode still logs the result.
                    </p>
                  </div>

                  <div>
                    <Label className="text-xs">Model Override (optional)</Label>
                    <Input
                      value={form.heartbeatModel}
                      onChange={(e) => setForm({ ...form, heartbeatModel: e.target.value })}
                      placeholder="e.g. gpt-5.4-mini (leave blank to use orchestrator model)"
                      className="mt-1 text-xs"
                      data-testid="input-heartbeat-model"
                    />
                  </div>

                  <div>
                    <Label className="text-xs">Silence Phrase</Label>
                    <Input
                      value={form.heartbeatSilencePhrase}
                      onChange={(e) => setForm({ ...form, heartbeatSilencePhrase: e.target.value })}
                      placeholder="HEARTBEAT_OK"
                      className="mt-1 font-mono text-xs"
                      data-testid="input-heartbeat-silence"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      If the agent's response starts/ends with this phrase, the result is suppressed — no alert is sent.
                    </p>
                  </div>

                  <div>
                    <Label className="text-xs">Alert Channel (optional)</Label>
                    <Select
                      value={form.heartbeatNotifyChannelId || "none"}
                      onValueChange={(v) => setForm({ ...form, heartbeatNotifyChannelId: v === "none" ? "" : v })}
                    >
                      <SelectTrigger className="mt-1" data-testid="select-heartbeat-channel">
                        <SelectValue placeholder="None — use orchestrator default" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None — use orchestrator default</SelectItem>
                        {outboundChannels.map((ch) => (
                          <SelectItem key={ch.id} value={ch.id}>{ch.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground mt-1">
                      Override the delivery channel for this agent's heartbeat alerts.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending || !form.name}
              data-testid="button-submit-agent">
              {createMutation.isPending || updateMutation.isPending ? "Saving..." : editAgent ? "Update Agent" : "Create Agent"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <TemplateGalleryDialog
        open={templateGalleryOpen}
        onClose={() => setTemplateGalleryOpen(false)}
        onSelect={handleTemplateSelect}
      />
    </div>
  );
}

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { APP_NAME, APP_TAGLINE } from "@/lib/config";
import { Plus, Network, Zap, Trash2, Moon, Sun, Settings2, ShieldAlert, Pencil, MessageSquare, Settings, BarChart2, DollarSign, Activity, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useTheme } from "@/components/ThemeProvider";
import { useAuth, useLogout } from "@/hooks/useAuth";
import type { Workspace, WorkspaceConfig } from "@shared/schema";

const AI_PROVIDERS = ["openai", "anthropic", "gemini", "ollama", "vllm"] as const;
const CLOUD_PROVIDERS = ["aws", "gcp", "azure", "jira", "github", "gitlab", "ragflow", "teams", "slack", "google_chat", "servicenow", "postgresql", "kubernetes"] as const;
const CHANNEL_TYPES = ["api", "webhook", "slack", "teams", "google_chat", "generic_webhook"] as const;

type QuotaData = {
  config: WorkspaceConfig | null;
  counts: { orchestrators: number; agents: number; channels: number; scheduledJobs: number };
};

function QuotaBar({ label, count, max }: { label: string; count: number; max: number | null }) {
  if (max == null) return null;
  const pct = Math.min(100, (count / max) * 100);
  const near = pct >= 80;
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-28 text-muted-foreground shrink-0">{label}</span>
      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full transition-all ${near ? "bg-destructive" : "bg-primary"}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`w-14 text-right tabular-nums ${near ? "text-destructive font-medium" : "text-muted-foreground"}`}>{count}/{max}</span>
    </div>
  );
}

const PROVIDER_DISPLAY_NAMES: Record<string, string> = {
  aws: "AWS", gcp: "Google Cloud", azure: "Azure",
  ragflow: "RAGFlow", jira: "Jira", github: "GitHub", gitlab: "GitLab",
  teams: "MS Teams", slack: "Slack", google_chat: "Google Chat",
  servicenow: "ServiceNow", postgresql: "PostgreSQL", kubernetes: "Kubernetes",
  openai: "OpenAI", anthropic: "Anthropic", gemini: "Gemini", ollama: "Ollama", vllm: "vLLM",
  api: "API", webhook: "Webhook", generic_webhook: "Generic Webhook",
};

function fmtProvider(opt: string): string {
  return PROVIDER_DISPLAY_NAMES[opt] ?? opt.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function ProviderGroup({
  label, allOptions, value, onChange,
}: {
  label: string;
  allOptions: readonly string[];
  value: string[] | null;
  onChange: (v: string[] | null) => void;
}) {
  const restricted = value !== null;
  const checked = value ?? [...allOptions];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">{label}</Label>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{restricted ? "Restricted" : "All allowed"}</span>
          <Switch
            checked={restricted}
            onCheckedChange={(on) => onChange(on ? [...allOptions] : null)}
            data-testid={`switch-restrict-${label.toLowerCase().replace(/\s/g, "-")}`}
          />
        </div>
      </div>
      {restricted && (
        <div className="grid grid-cols-2 gap-2 pl-1">
          {allOptions.map((opt) => (
            <div key={opt} className="flex items-center gap-2">
              <Checkbox
                id={`${label}-${opt}`}
                checked={checked.includes(opt)}
                onCheckedChange={(c) => {
                  const next = c ? [...checked, opt] : checked.filter((x) => x !== opt);
                  onChange(next.length === 0 ? [] : next);
                }}
                data-testid={`checkbox-${label.toLowerCase().replace(/\s/g, "-")}-${opt}`}
              />
              <label htmlFor={`${label}-${opt}`} className="text-xs cursor-pointer">{fmtProvider(opt)}</label>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function WorkspaceLimitsModal({ workspace, onClose }: { workspace: Workspace; onClose: () => void }) {
  const { toast } = useToast();

  const { data: quota, isLoading } = useQuery<QuotaData>({
    queryKey: [`/api/workspaces/${workspace.id}/quota`],
  });

  const [maxOrch, setMaxOrch] = useState<string>("");
  const [maxAgents, setMaxAgents] = useState<string>("");
  const [maxChannels, setMaxChannels] = useState<string>("");
  const [maxJobs, setMaxJobs] = useState<string>("");
  const [aiProviders, setAiProviders] = useState<string[] | null>(null);
  const [cloudProviders, setCloudProviders] = useState<string[] | null>(null);
  const [channelTypes, setChannelTypes] = useState<string[] | null>(null);
  const [initialised, setInitialised] = useState(false);

  if (quota && !initialised) {
    const cfg = quota.config;
    setMaxOrch(cfg?.maxOrchestrators != null ? String(cfg.maxOrchestrators) : "");
    setMaxAgents(cfg?.maxAgents != null ? String(cfg.maxAgents) : "");
    setMaxChannels(cfg?.maxChannels != null ? String(cfg.maxChannels) : "");
    setMaxJobs(cfg?.maxScheduledJobs != null ? String(cfg.maxScheduledJobs) : "");
    setAiProviders(cfg?.allowedAiProviders ?? null);
    setCloudProviders(cfg?.allowedCloudProviders ?? null);
    setChannelTypes(cfg?.allowedChannelTypes ?? null);
    setInitialised(true);
  }

  const saveMutation = useMutation({
    mutationFn: (data: object) => apiRequest("PUT", `/api/workspaces/${workspace.id}/config`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/workspaces/${workspace.id}/quota`] });
      toast({ title: "Limits saved" });
      onClose();
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const toInt = (s: string) => { const n = parseInt(s); return isNaN(n) || n < 0 ? null : n; };

  const handleSave = () => {
    saveMutation.mutate({
      maxOrchestrators: toInt(maxOrch),
      maxAgents: toInt(maxAgents),
      maxChannels: toInt(maxChannels),
      maxScheduledJobs: toInt(maxJobs),
      allowedAiProviders: aiProviders,
      allowedCloudProviders: cloudProviders,
      allowedChannelTypes: channelTypes,
    });
  };

  const counts = quota?.counts;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-primary" />
            Workspace Limits — {workspace.name}
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-2 py-4">{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-6" />)}</div>
        ) : (
          <Tabs defaultValue="quotas">
            <TabsList className="w-full">
              <TabsTrigger value="quotas" className="flex-1">Resource Quotas</TabsTrigger>
              <TabsTrigger value="providers" className="flex-1">Allowed Providers</TabsTrigger>
            </TabsList>

            <TabsContent value="quotas" className="space-y-4 pt-4">
              <p className="text-xs text-muted-foreground">Leave blank for unlimited. Current usage shown below each field.</p>

              {(["orchestrators", "agents", "channels", "scheduledJobs"] as const).map((key) => {
                const labelMap = { orchestrators: "Orchestrators", agents: "Agents", channels: "Channels", scheduledJobs: "Scheduled Jobs" };
                const stateMap = {
                  orchestrators: { val: maxOrch, set: setMaxOrch, testId: "input-max-orchestrators" },
                  agents: { val: maxAgents, set: setMaxAgents, testId: "input-max-agents" },
                  channels: { val: maxChannels, set: setMaxChannels, testId: "input-max-channels" },
                  scheduledJobs: { val: maxJobs, set: setMaxJobs, testId: "input-max-jobs" },
                };
                const maxMap = {
                  orchestrators: toInt(maxOrch),
                  agents: toInt(maxAgents),
                  channels: toInt(maxChannels),
                  scheduledJobs: toInt(maxJobs),
                };
                const { val, set, testId } = stateMap[key];
                return (
                  <div key={key} className="space-y-1.5">
                    <Label className="text-sm">{labelMap[key]}</Label>
                    <Input
                      type="number" min={0} placeholder="Unlimited"
                      value={val} onChange={(e) => set(e.target.value)}
                      data-testid={testId}
                    />
                    {counts && <QuotaBar label="Current usage" count={counts[key]} max={maxMap[key]} />}
                  </div>
                );
              })}
            </TabsContent>

            <TabsContent value="providers" className="space-y-5 pt-4">
              <p className="text-xs text-muted-foreground">Toggle "Restricted" to choose exactly which providers are allowed. When unrestricted, all providers are available.</p>
              <ProviderGroup label="AI Providers" allOptions={AI_PROVIDERS} value={aiProviders} onChange={setAiProviders} />
              <ProviderGroup label="Cloud Integrations" allOptions={CLOUD_PROVIDERS} value={cloudProviders} onChange={setCloudProviders} />
              <ProviderGroup label="Channel Types" allOptions={CHANNEL_TYPES} value={channelTypes} onChange={setChannelTypes} />
            </TabsContent>
          </Tabs>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saveMutation.isPending || isLoading} data-testid="button-save-limits">
            {saveMutation.isPending ? "Saving..." : "Save Limits"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function WorkspacesPage() {
  const { toast } = useToast();
  const { theme, toggleTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const [limitsWorkspace, setLimitsWorkspace] = useState<Workspace | null>(null);
  const [editWorkspace, setEditWorkspace] = useState<Workspace | null>(null);
  const [editForm, setEditForm] = useState({ name: "", slug: "", description: "", isCommsWorkspace: false });
  const [form, setForm] = useState({ name: "", slug: "", description: "", isCommsWorkspace: false });
  const { user } = useAuth();
  const logout = useLogout();
  const isGlobalAdmin = user?.role === "admin";

  const [globalDays, setGlobalDays] = useState("30");

  const { data: workspaces, isLoading } = useQuery<Workspace[]>({
    queryKey: isGlobalAdmin ? ["/api/workspaces"] : ["/api/auth/my-admin-workspaces"],
  });

  const { data: globalStats, isLoading: globalStatsLoading } = useQuery<{
    totalInputTokens: number;
    totalOutputTokens: number;
    totalCostUsd: number;
    byWorkspace: Array<{ workspaceId: string; workspaceName: string; inputTokens: number; outputTokens: number; costUsd: number; calls: number }>;
    byDay: Array<{ date: string; inputTokens: number; outputTokens: number; costUsd: number }>;
    byProvider: Array<{ provider: string; model: string; inputTokens: number; outputTokens: number; costUsd: number }>;
  }>({
    queryKey: ["/api/admin/observability", globalDays],
    queryFn: async () => {
      const res = await fetch(`/api/admin/observability?days=${globalDays}`, { credentials: "include" });
      return res.json();
    },
    enabled: isGlobalAdmin,
  });

  const createMutation = useMutation({
    mutationFn: (data: typeof form) => apiRequest("POST", "/api/workspaces", data),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/workspaces"] });
      setOpen(false);
      setForm({ name: "", slug: "", description: "", isCommsWorkspace: false });
      toast({ title: "Workspace created" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: (data: typeof editForm) => apiRequest("PUT", `/api/workspaces/${editWorkspace!.id}`, data),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/workspaces"] });
      setEditWorkspace(null);
      toast({ title: "Workspace updated" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/workspaces/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/workspaces"] }),
  });

  const handleNameChange = (name: string) => {
    setForm((f) => ({
      ...f,
      name,
      slug: f.slug || name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, ""),
    }));
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <Zap className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-lg">{APP_NAME}</span>
            <Badge variant="secondary" className="text-xs">{APP_TAGLINE}</Badge>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={toggleTheme} data-testid="button-toggle-theme">
              {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </Button>
            <Button variant="ghost" size="icon" onClick={() => logout.mutate()} data-testid="button-logout">
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold">Workspaces</h1>
            <p className="text-muted-foreground mt-1">
              {isGlobalAdmin ? "Isolated environments for each team or use case" : "Workspaces you administer"}
            </p>
          </div>
          {isGlobalAdmin && (
            <div className="flex items-center gap-2">
              <Link href="/admin">
                <Button variant="outline" data-testid="link-platform-admin">
                  <Settings className="w-4 h-4 mr-2" />
                  Platform Admin
                </Button>
              </Link>
              <Button onClick={() => setOpen(true)} data-testid="button-create-workspace">
                <Plus className="w-4 h-4 mr-2" />
                New Workspace
              </Button>
            </div>
          )}
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-48" />)}
          </div>
        ) : workspaces?.length === 0 ? (
          <div className="text-center py-24">
            <Network className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No workspaces yet</h3>
            <p className="text-muted-foreground mb-6">
              {isGlobalAdmin ? "Create your first workspace to get started" : "You have not been assigned as workspace admin to any workspace yet."}
            </p>
            {isGlobalAdmin && (
              <Button onClick={() => setOpen(true)}>
                <Plus className="w-4 h-4 mr-2" /> Create Workspace
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {workspaces?.map((ws) => (
              <Card key={ws.id} className="hover:border-primary/50 transition-colors group" data-testid={`card-workspace-${ws.id}`}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-2">
                      <Network className="w-5 h-5 text-primary" />
                    </div>
                    {isGlobalAdmin && (
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          variant="ghost" size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-foreground"
                          onClick={(e) => { e.preventDefault(); setEditForm({ name: ws.name, slug: ws.slug, description: ws.description ?? "", isCommsWorkspace: ws.isCommsWorkspace ?? false }); setEditWorkspace(ws); }}
                          title="Edit workspace"
                          data-testid={`button-edit-workspace-${ws.id}`}
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost" size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-foreground"
                          onClick={(e) => { e.preventDefault(); setLimitsWorkspace(ws); }}
                          title="Configure limits"
                          data-testid={`button-configure-limits-${ws.id}`}
                        >
                          <Settings2 className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost" size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          onClick={(e) => { e.preventDefault(); deleteMutation.mutate(ws.id); }}
                          data-testid={`button-delete-workspace-${ws.id}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-base">{ws.name}</CardTitle>
                    {ws.isCommsWorkspace && (
                      <Badge variant="secondary" className="text-xs gap-1 py-0" data-testid={`badge-comms-${ws.id}`}>
                        <MessageSquare className="w-3 h-3" />Comms
                      </Badge>
                    )}
                  </div>
                  <CardDescription className="text-xs font-mono text-muted-foreground">{ws.slug}</CardDescription>
                </CardHeader>
                <CardContent>
                  {ws.description && <p className="text-sm text-muted-foreground mb-3 line-clamp-2">{ws.description}</p>}
                  <Link href={`/workspaces/${ws.id}`}>
                    <Button variant="outline" size="sm" className="w-full" data-testid={`button-open-workspace-${ws.id}`}>
                      Open Workspace
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Global token usage overview — system admins only */}
        {isGlobalAdmin && (
          <div className="mt-12">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <BarChart2 className="w-5 h-5 text-primary" />
                  Global Token Usage
                </h2>
                <p className="text-sm text-muted-foreground mt-0.5">Aggregated AI token consumption across all workspaces</p>
              </div>
              <select
                value={globalDays}
                onChange={(e) => setGlobalDays(e.target.value)}
                className="text-sm border border-border rounded-md px-2 py-1 bg-background"
                data-testid="select-global-days"
              >
                <option value="7">Last 7 days</option>
                <option value="30">Last 30 days</option>
                <option value="90">Last 90 days</option>
              </select>
            </div>

            {globalStatsLoading ? (
              <div className="grid grid-cols-3 gap-4 mb-6">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                  <Card>
                    <CardContent className="pt-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-sm text-muted-foreground">Total Tokens</p>
                          <p className="text-2xl font-bold mt-1" data-testid="stat-global-total-tokens">
                            {((globalStats?.totalInputTokens ?? 0) + (globalStats?.totalOutputTokens ?? 0)).toLocaleString()}
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {(globalStats?.totalInputTokens ?? 0).toLocaleString()} in / {(globalStats?.totalOutputTokens ?? 0).toLocaleString()} out
                          </p>
                        </div>
                        <div className="w-9 h-9 rounded-lg bg-blue-500 flex items-center justify-center shrink-0">
                          <Activity className="w-5 h-5 text-white" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-sm text-muted-foreground">Est. Cost</p>
                          <p className="text-2xl font-bold mt-1" data-testid="stat-global-cost">
                            ${(globalStats?.totalCostUsd ?? 0).toFixed(4)}
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5">Last {globalDays} days</p>
                        </div>
                        <div className="w-9 h-9 rounded-lg bg-emerald-500 flex items-center justify-center shrink-0">
                          <DollarSign className="w-5 h-5 text-white" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-sm text-muted-foreground">Active Workspaces</p>
                          <p className="text-2xl font-bold mt-1" data-testid="stat-global-active-workspaces">
                            {globalStats?.byWorkspace.filter(w => w.calls > 0).length ?? 0}
                            <span className="text-base font-normal text-muted-foreground ml-1">/ {globalStats?.byWorkspace.length ?? 0}</span>
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5">Active (with usage) in period</p>
                        </div>
                        <div className="w-9 h-9 rounded-lg bg-violet-500 flex items-center justify-center shrink-0">
                          <Network className="w-5 h-5 text-white" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {(globalStats?.byWorkspace.filter(w => w.calls > 0).length ?? 0) === 0 ? (
                  <Card>
                    <CardContent className="py-10 text-center text-muted-foreground text-sm">
                      No token usage recorded in the last {globalDays} days.
                    </CardContent>
                  </Card>
                ) : (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">Tokens by Workspace</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <ResponsiveContainer width="100%" height={220}>
                          <BarChart data={globalStats?.byWorkspace} layout="vertical" margin={{ left: 8, right: 16 }}>
                            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                            <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => v >= 1000 ? `${(v/1000).toFixed(0)}K` : String(v)} />
                            <YAxis type="category" dataKey="workspaceName" tick={{ fontSize: 11 }} width={100} />
                            <Tooltip formatter={(v: number, name: string) => [v.toLocaleString(), name === "inputTokens" ? "Input" : "Output"]} />
                            <Bar dataKey="inputTokens" stackId="a" fill="hsl(var(--primary))" name="inputTokens" />
                            <Bar dataKey="outputTokens" stackId="a" fill="hsl(var(--primary) / 0.4)" name="outputTokens" />
                          </BarChart>
                        </ResponsiveContainer>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">Usage Breakdown by Workspace</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2">
                          {globalStats?.byWorkspace.map((ws) => {
                            const total = (globalStats.totalInputTokens + globalStats.totalOutputTokens) || 1;
                            const wsPct = Math.round(((ws.inputTokens + ws.outputTokens) / total) * 100);
                            const hasUsage = ws.calls > 0;
                            return (
                              <div key={ws.workspaceId} className={`space-y-1 ${!hasUsage ? "opacity-50" : ""}`} data-testid={`usage-row-${ws.workspaceId}`}>
                                <div className="flex items-center justify-between text-sm">
                                  <Link href={`/workspaces/${ws.workspaceId}/observability`} className="font-medium hover:text-primary transition-colors truncate max-w-[180px]">
                                    {ws.workspaceName}
                                  </Link>
                                  <div className="flex items-center gap-3 text-xs text-muted-foreground shrink-0">
                                    {hasUsage ? (
                                      <>
                                        <span>{(ws.inputTokens + ws.outputTokens).toLocaleString()} tokens</span>
                                        <span className="w-10 text-right">${ws.costUsd.toFixed(4)}</span>
                                        <span className="w-8 text-right text-primary font-medium">{wsPct}%</span>
                                      </>
                                    ) : (
                                      <span className="italic">no usage in period</span>
                                    )}
                                  </div>
                                </div>
                                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                                  <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${wsPct}%` }} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </main>

      {/* Create workspace dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Workspace</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label htmlFor="ws-name">Name</Label>
              <Input id="ws-name" value={form.name} onChange={(e) => handleNameChange(e.target.value)}
                placeholder="My Team" className="mt-1" data-testid="input-workspace-name" />
            </div>
            <div>
              <Label htmlFor="ws-slug">Slug</Label>
              <Input id="ws-slug" value={form.slug} onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
                placeholder="my-team" className="mt-1 font-mono" data-testid="input-workspace-slug" />
            </div>
            <div>
              <Label htmlFor="ws-desc">Description</Label>
              <Textarea id="ws-desc" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Optional description..." className="mt-1" rows={3} data-testid="input-workspace-description" />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <div>
                <p className="text-sm font-medium">Comms Workspace</p>
                <p className="text-xs text-muted-foreground mt-0.5">Enables two-way Slack / Teams inbound channels</p>
              </div>
              <Switch
                checked={form.isCommsWorkspace}
                onCheckedChange={(v) => setForm((f) => ({ ...f, isCommsWorkspace: v }))}
                data-testid="switch-is-comms-workspace"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => createMutation.mutate(form)} disabled={createMutation.isPending || !form.name || !form.slug}
              data-testid="button-submit-workspace">
              {createMutation.isPending ? "Creating..." : "Create Workspace"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit workspace dialog */}
      <Dialog open={!!editWorkspace} onOpenChange={(o) => { if (!o) setEditWorkspace(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Workspace</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label htmlFor="edit-ws-name">Name</Label>
              <Input id="edit-ws-name" value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="My Team" className="mt-1" data-testid="input-edit-workspace-name" />
            </div>
            <div>
              <Label htmlFor="edit-ws-slug">Slug</Label>
              <Input id="edit-ws-slug" value={editForm.slug} onChange={(e) => setEditForm((f) => ({ ...f, slug: e.target.value }))}
                placeholder="my-team" className="mt-1 font-mono" data-testid="input-edit-workspace-slug" />
            </div>
            <div>
              <Label htmlFor="edit-ws-desc">Description</Label>
              <Textarea id="edit-ws-desc" value={editForm.description} onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Optional description..." className="mt-1" rows={3} data-testid="input-edit-workspace-description" />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <div>
                <p className="text-sm font-medium">Comms Workspace</p>
                <p className="text-xs text-muted-foreground mt-0.5">Enables two-way Slack / Teams inbound channels</p>
              </div>
              <Switch
                checked={editForm.isCommsWorkspace}
                onCheckedChange={(v) => setEditForm((f) => ({ ...f, isCommsWorkspace: v }))}
                data-testid="switch-edit-is-comms-workspace"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditWorkspace(null)}>Cancel</Button>
            <Button onClick={() => updateMutation.mutate(editForm)} disabled={updateMutation.isPending || !editForm.name || !editForm.slug}
              data-testid="button-submit-edit-workspace">
              {updateMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Configure limits dialog */}
      {limitsWorkspace && (
        <WorkspaceLimitsModal workspace={limitsWorkspace} onClose={() => setLimitsWorkspace(null)} />
      )}
    </div>
  );
}

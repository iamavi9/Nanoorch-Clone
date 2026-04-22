import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  Network, Bot, ListTodo, Plus, CheckCircle2, XCircle, Clock,
  Loader2, ShieldAlert, GitBranch, Activity,
  CheckCheck, Circle, ArrowRight, Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { Workspace, Orchestrator } from "@shared/schema";

interface Props { workspaceId: string }

interface WorkspaceStats {
  orchestrators: number; agents: number;
  completedTasks: number; failedTasks: number;
  runningTasks: number; pendingTasks: number;
}

interface ActivityItem {
  id: string; type: string; status: string;
  title: string; subtitle: string; at: string;
}

const STATUS_DOTS: Record<string, string> = {
  pending: "bg-yellow-400",
  running: "bg-blue-400 animate-pulse",
  completed: "bg-green-400",
  failed: "bg-red-400",
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function ActivityIcon({ type, status }: { type: string; status: string }) {
  if (type === "approval") return <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />;
  if (type === "pipeline_run") return <GitBranch className="w-3.5 h-3.5 text-violet-400" />;
  if (status === "completed") return <CheckCheck className="w-3.5 h-3.5 text-green-400" />;
  if (status === "failed") return <XCircle className="w-3.5 h-3.5 text-red-400" />;
  if (status === "running") return <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin" />;
  if (status === "pending") return <Circle className="w-3.5 h-3.5 text-yellow-400" />;
  return <Activity className="w-3.5 h-3.5 text-muted-foreground" />;
}

function StatCard({ icon: Icon, label, value, color, loading, highlight, href, workspaceId }:
  { icon: any; label: string; value: number; color: string; loading?: boolean; highlight?: boolean; href?: string; workspaceId?: string }) {
  const content = (
    <Card className={highlight && value > 0 ? "border-amber-500/50 bg-amber-500/5" : ""}>
      <CardContent className="p-4 flex items-center gap-3">
        <Icon className={`w-7 h-7 shrink-0 ${highlight && value > 0 ? "text-amber-400" : color}`} />
        <div className="min-w-0">
          {loading ? <Skeleton className="h-7 w-8 mb-1" /> : (
            <div className={`text-2xl font-bold ${highlight && value > 0 ? "text-amber-400" : ""}`}
              data-testid={`stat-${label.toLowerCase().replace(/\s+/g, "-")}`}>{value}</div>
          )}
          <div className="text-xs text-muted-foreground truncate">{label}</div>
        </div>
        {href && value > 0 && <ArrowRight className="w-3.5 h-3.5 ml-auto text-muted-foreground shrink-0" />}
      </CardContent>
    </Card>
  );
  if (href && value > 0) return <Link href={href}>{content}</Link>;
  return content;
}

export default function WorkspaceDashboard({ workspaceId }: Props) {
  const basePath = `/workspaces/${workspaceId}`;

  const { data: workspace } = useQuery<Workspace>({ queryKey: [`/api/workspaces/${workspaceId}`] });
  const { data: orchestrators, isLoading: orchLoading } = useQuery<Orchestrator[]>({
    queryKey: [`/api/workspaces/${workspaceId}/orchestrators`],
  });
  const { data: stats, isLoading: statsLoading } = useQuery<WorkspaceStats>({
    queryKey: [`/api/workspaces/${workspaceId}/stats`],
    refetchInterval: 15000,
  });
  const { data: pendingCount } = useQuery<{ count: number }>({
    queryKey: [`/api/workspaces/${workspaceId}/approvals/pending-count`],
    refetchInterval: 30000,
  });
  const { data: activity, isLoading: activityLoading } = useQuery<ActivityItem[]>({
    queryKey: [`/api/workspaces/${workspaceId}/activity`],
    refetchInterval: 20000,
  });

  const pending = pendingCount?.count ?? 0;
  const statsIsLoading = statsLoading && !stats;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold" data-testid="dashboard-title">
            {workspace?.name ?? "Dashboard"}
          </h1>
          {workspace?.description && (
            <p className="text-muted-foreground mt-1 text-sm">{workspace.description}</p>
          )}
        </div>
        <Link href={`${basePath}/orchestrators/new`}>
          <Button size="sm" data-testid="button-create-orchestrator-dashboard">
            <Plus className="w-4 h-4 mr-1" /> New Orchestrator
          </Button>
        </Link>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard icon={Network}      label="Orchestrators"    value={stats?.orchestrators ?? orchestrators?.length ?? 0} color="text-primary"     loading={statsIsLoading} />
        <StatCard icon={Bot}          label="Agents"           value={stats?.agents ?? 0}          color="text-violet-400"  loading={statsIsLoading} />
        <StatCard icon={Loader2}      label="Running"          value={stats?.runningTasks ?? 0}    color="text-blue-400"    loading={statsIsLoading} />
        <StatCard icon={CheckCircle2} label="Completed"        value={stats?.completedTasks ?? 0}  color="text-green-400"   loading={statsIsLoading} />
        <StatCard icon={XCircle}      label="Failed"           value={stats?.failedTasks ?? 0}     color="text-red-400"     loading={statsIsLoading} />
        <StatCard icon={ShieldAlert}  label="Pending Approvals" value={pending}                   color="text-amber-400"   highlight
          href={`${basePath}/approvals`} workspaceId={workspaceId} />
      </div>

      {/* Main content — orchestrators + activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Orchestrators — 2/3 width */}
        <div className="lg:col-span-2 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-base">Orchestrators</h2>
          </div>

          {orchLoading ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {[1, 2].map(i => <Skeleton key={i} className="h-36" />)}
            </div>
          ) : orchestrators?.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-12 text-center">
                <Network className="w-10 h-10 mx-auto text-muted-foreground/40 mb-3" />
                <p className="text-sm text-muted-foreground mb-4">No orchestrators yet. Create one to start running agents.</p>
                <Link href={`${basePath}/orchestrators/new`}>
                  <Button size="sm" data-testid="button-create-first-orchestrator">
                    <Plus className="w-4 h-4 mr-1" /> Create Orchestrator
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {orchestrators?.map(orch => (
                <OrchestratorCard key={orch.id} orch={orch} workspaceId={workspaceId} />
              ))}
            </div>
          )}
        </div>

        {/* Activity feed — 1/3 width */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-base flex items-center gap-2">
              <Activity className="w-4 h-4 text-muted-foreground" />
              Activity
            </h2>
            <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" title="Live" />
          </div>

          <Card className="min-h-[300px]">
            <CardContent className="p-0">
              {activityLoading ? (
                <div className="p-4 space-y-3">
                  {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-12" />)}
                </div>
              ) : !activity?.length ? (
                <div className="flex flex-col items-center justify-center h-48 text-center px-4">
                  <Activity className="w-8 h-8 text-muted-foreground/30 mb-2" />
                  <p className="text-sm text-muted-foreground">No activity yet</p>
                  <p className="text-xs text-muted-foreground/60 mt-1">Events appear here as agents run tasks</p>
                </div>
              ) : (
                <div className="divide-y divide-border/50" data-testid="activity-feed">
                  {activity
                    .filter((item, _, arr) => arr.findIndex(a => a.type === item.type) === arr.indexOf(item))
                    .map(item => (
                    <div key={item.id} className="flex items-start gap-2.5 px-3 py-2.5 hover:bg-muted/30 transition-colors"
                      data-testid={`activity-item-${item.id}`}>
                      <div className="mt-0.5 shrink-0">
                        <ActivityIcon type={item.type} status={item.status} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium truncate">{item.title}</p>
                        {item.subtitle && (
                          <p className="text-xs text-muted-foreground truncate mt-0.5">{item.subtitle}</p>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground/60 shrink-0 mt-0.5">
                        {timeAgo(item.at)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Quick links */}
          <div className="grid grid-cols-2 gap-2">
            <Link href={`${basePath}/scheduled-jobs`}>
              <Button variant="outline" size="sm" className="w-full h-8 text-xs justify-start gap-2"
                data-testid="quicklink-scheduled-jobs">
                <Clock className="w-3.5 h-3.5" /> Scheduled Jobs
              </Button>
            </Link>
            <Link href={`${basePath}/pipelines`}>
              <Button variant="outline" size="sm" className="w-full h-8 text-xs justify-start gap-2"
                data-testid="quicklink-pipelines">
                <GitBranch className="w-3.5 h-3.5" /> Pipelines
              </Button>
            </Link>
            <Link href={`${basePath}/observability`}>
              <Button variant="outline" size="sm" className="w-full h-8 text-xs justify-start gap-2"
                data-testid="quicklink-observability">
                <Activity className="w-3.5 h-3.5" /> Observability
              </Button>
            </Link>
            <Link href={`${basePath}/integrations`}>
              <Button variant="outline" size="sm" className="w-full h-8 text-xs justify-start gap-2"
                data-testid="quicklink-integrations">
                <Zap className="w-3.5 h-3.5" /> Integrations
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function OrchestratorCard({ orch, workspaceId }: { orch: Orchestrator; workspaceId: string }) {
  const base = `/workspaces/${workspaceId}/orchestrators/${orch.id}`;
  const { data: recentTasks } = useQuery<any>({
    queryKey: [`/api/orchestrators/${orch.id}/tasks`],
    select: (data: any) => (Array.isArray(data) ? data : data?.tasks ?? []) as any[],
  });

  const tasks: any[] = recentTasks ?? [];
  const running = tasks.filter((t: any) => t.status === "running").length;
  const failed = tasks.filter((t: any) => t.status === "failed").length;

  return (
    <Card className="hover:border-primary/40 transition-colors" data-testid={`card-orchestrator-${orch.id}`}>
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="text-sm truncate">{orch.name}</CardTitle>
            <CardDescription className="text-xs mt-0.5 flex items-center gap-1.5 flex-wrap">
              <Badge variant="outline" className="text-xs px-1.5 py-0">{{ openai: "OpenAI", anthropic: "Anthropic", gemini: "Gemini", ollama: "Ollama", vllm: "vLLM" }[orch.provider] ?? orch.provider}</Badge>
              <span className="font-mono text-muted-foreground/70 truncate">{orch.model}</span>
            </CardDescription>
          </div>
          <Badge className={`text-xs shrink-0 ${orch.status === "active" ? "bg-green-500/20 text-green-400 border-green-500/30" : "bg-yellow-500/20 text-yellow-400 border-yellow-500/30"}`}>
            {orch.status}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="pb-3 px-4">
        {/* Task status dots */}
        <div className="flex items-center gap-1 mb-3 min-h-[8px]">
          {tasks.slice(0, 12).map((t: any) => (
            <div key={t.id} className={`w-2 h-2 rounded-full shrink-0 ${STATUS_DOTS[t.status ?? "pending"]}`}
              title={t.status ?? "pending"} />
          ))}
          {tasks.length === 0 && <span className="text-xs text-muted-foreground">No tasks yet</span>}
        </div>
        {/* Running/failed inline indicators */}
        {(running > 0 || failed > 0) && (
          <div className="flex gap-3 mb-2 text-xs">
            {running > 0 && <span className="text-blue-400 flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" />{running} running</span>}
            {failed > 0 && <span className="text-red-400 flex items-center gap-1"><XCircle className="w-3 h-3" />{failed} failed</span>}
          </div>
        )}
        <div className="flex gap-1.5">
          <Link href={base}>
            <Button variant="outline" size="sm" className="h-7 text-xs" data-testid={`button-open-orchestrator-${orch.id}`}>View</Button>
          </Link>
          <Link href={`${base}/agents`}>
            <Button variant="ghost" size="sm" className="h-7 text-xs"><Bot className="w-3 h-3 mr-1" />Agents</Button>
          </Link>
          <Link href={`${base}/tasks`}>
            <Button variant="ghost" size="sm" className="h-7 text-xs"><ListTodo className="w-3 h-3 mr-1" />Tasks</Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend, ReferenceLine,
} from "recharts";
import { BarChart2, Zap, DollarSign, Activity, TrendingUp, Bell } from "lucide-react";
import { useState, useMemo, useEffect } from "react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface ObservabilityPageProps {
  workspaceId: string;
}

interface ObsStats {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUsd: number;
  byAgent: Array<{ agentName: string; inputTokens: number; outputTokens: number; costUsd: number; calls: number }>;
  byDay: Array<{ date: string; inputTokens: number; outputTokens: number; costUsd: number }>;
  byProvider: Array<{ provider: string; model: string; inputTokens: number; outputTokens: number; costUsd: number }>;
  recentUsage: Array<{ id: string; agentName: string | null; provider: string; model: string; inputTokens: number; outputTokens: number; estimatedCostUsd: number | null; createdAt: string }>;
}

function StatCard({ title, value, sub, icon: Icon, color, badge }: { title: string; value: string; sub?: string; icon: any; color: string; badge?: string }) {
  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-sm text-muted-foreground">{title}</p>
              {badge && <Badge variant="secondary" className="text-xs px-1.5 py-0">{badge}</Badge>}
            </div>
            <p className="text-2xl font-bold mt-1 truncate" data-testid={`stat-${title.toLowerCase().replace(/\s/g, "-")}`}>{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
          </div>
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ml-3 ${color}`}>
            <Icon className="w-5 h-5 text-white" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function fmt(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function fmtCost(n: number) {
  if (n >= 100) return `$${n.toFixed(2)}`;
  if (n >= 1) return `$${n.toFixed(3)}`;
  return `$${n.toFixed(4)}`;
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function computeForecast(byDay: ObsStats["byDay"]) {
  if (byDay.length === 0) return null;

  const daysWithUsage = byDay.filter((d) => d.costUsd > 0);
  if (daysWithUsage.length === 0) return null;

  const totalCost = daysWithUsage.reduce((s, d) => s + d.costUsd, 0);
  const avgDailyCost = totalCost / daysWithUsage.length;

  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  const remainingDays = endOfMonth.getDate() - today.getDate() + 1;

  const lastDate = byDay[byDay.length - 1]?.date ?? todayStr;

  const forecastPoints: Array<{ date: string; projected: number }> = [];
  for (let i = 1; i <= 14; i++) {
    forecastPoints.push({ date: addDays(lastDate, i), projected: avgDailyCost });
  }

  return {
    avgDailyCost,
    forecast7d: avgDailyCost * 7,
    forecast30d: avgDailyCost * 30,
    forecast90d: avgDailyCost * 90,
    remainingMonthCost: avgDailyCost * remainingDays,
    remainingDays,
    forecastPoints,
    todayStr,
  };
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-background border rounded-lg shadow-lg p-3 text-xs space-y-1">
      <p className="font-medium text-foreground">{label}</p>
      {payload.map((p: any) => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name}: {p.name.toLowerCase().includes("cost") || p.name.toLowerCase().includes("projected") || p.name.toLowerCase().includes("actual")
            ? fmtCost(p.value)
            : fmt(p.value)}
        </p>
      ))}
    </div>
  );
};

export default function ObservabilityPage({ workspaceId }: ObservabilityPageProps) {
  const { toast } = useToast();
  const [days, setDays] = useState("30");
  const [alertThreshold, setAlertThreshold] = useState("");
  const [alertChannelId, setAlertChannelId] = useState("none");

  const { data: stats, isLoading } = useQuery<ObsStats>({
    queryKey: [`/api/workspaces/${workspaceId}/observability`, days],
    queryFn: async () => {
      const res = await fetch(`/api/workspaces/${workspaceId}/observability?days=${days}`, { credentials: "include" });
      return res.json();
    },
  });

  const { data: workspaceConfig } = useQuery<{
    utilizationAlertThresholdTokens: number | null;
    utilizationAlertChannelId: string | null;
  }>({
    queryKey: [`/api/workspaces/${workspaceId}/config`],
  });

  useEffect(() => {
    if (workspaceConfig) {
      setAlertThreshold(workspaceConfig.utilizationAlertThresholdTokens != null ? String(workspaceConfig.utilizationAlertThresholdTokens) : "");
      setAlertChannelId(workspaceConfig.utilizationAlertChannelId ?? "none");
    }
  }, [workspaceConfig]);

  const { data: allChannels = [] } = useQuery<{ id: string; name: string; type: string }[]>({
    queryKey: [`/api/workspaces/${workspaceId}/channels`],
  });
  const outboundChannels = allChannels.filter((c) => ["slack", "teams", "google_chat", "generic_webhook"].includes(c.type));

  const updateConfigMutation = useMutation({
    mutationFn: () => apiRequest("PUT", `/api/workspaces/${workspaceId}/config`, {
      utilizationAlertThresholdTokens: alertThreshold ? parseInt(alertThreshold) : null,
      utilizationAlertChannelId: alertChannelId === "none" ? null : alertChannelId,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/workspaces/${workspaceId}/config`] });
      toast({ title: "Alert settings saved" });
    },
    onError: () => toast({ title: "Failed to save settings", variant: "destructive" }),
  });

  const totalTokens = (stats?.totalInputTokens ?? 0) + (stats?.totalOutputTokens ?? 0);
  const forecast = useMemo(() => stats?.byDay ? computeForecast(stats.byDay) : null, [stats?.byDay]);

  const costChartData = useMemo(() => {
    if (!stats?.byDay) return [];
    const actual = stats.byDay.map((d) => ({ date: d.date, actual: d.costUsd, projected: undefined as number | undefined }));
    if (!forecast) return actual;
    const projectedPoints = forecast.forecastPoints.map((p) => ({ date: p.date, actual: undefined as number | undefined, projected: p.projected }));
    return [...actual, ...projectedPoints];
  }, [stats?.byDay, forecast]);

  const todayStr = new Date().toISOString().slice(0, 10);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BarChart2 className="w-6 h-6 text-primary" />
            Observability
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Token usage, cost tracking, and spend forecasting.</p>
        </div>
        <Select value={days} onValueChange={setDays}>
          <SelectTrigger className="w-32" data-testid="select-days">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="90">Last 90 days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading && <p className="text-muted-foreground text-sm">Loading metrics…</p>}

      {!isLoading && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard title="Total Tokens" value={fmt(totalTokens)} sub={`${fmt(stats?.totalInputTokens ?? 0)} in / ${fmt(stats?.totalOutputTokens ?? 0)} out`} icon={Zap} color="bg-blue-500" />
            <StatCard title="Est. Cost" value={fmtCost(stats?.totalCostUsd ?? 0)} sub={`Last ${days} days`} icon={DollarSign} color="bg-emerald-500" />
            <StatCard title="Agent Calls" value={String(stats?.recentUsage?.length ?? 0)} sub="Token records" icon={Activity} color="bg-violet-500" />
            <StatCard title="Active Agents" value={String(stats?.byAgent?.length ?? 0)} sub="With usage" icon={BarChart2} color="bg-orange-500" />
          </div>

          {forecast && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp className="w-4 h-4 text-primary" />
                <h2 className="text-base font-semibold">Cost Forecast</h2>
                <Badge variant="outline" className="text-xs">Based on last {days} days avg</Badge>
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard
                  title="Daily Burn Rate"
                  value={fmtCost(forecast.avgDailyCost)}
                  sub="Average per active day"
                  icon={TrendingUp}
                  color="bg-sky-500"
                  data-testid="stat-daily-burn-rate"
                />
                <StatCard
                  title="7-Day Projection"
                  value={fmtCost(forecast.forecast7d)}
                  sub="Next 7 days"
                  icon={TrendingUp}
                  color="bg-sky-500"
                  badge="7d"
                />
                <StatCard
                  title="30-Day Projection"
                  value={fmtCost(forecast.forecast30d)}
                  sub="Next 30 days"
                  icon={TrendingUp}
                  color="bg-indigo-500"
                  badge="30d"
                />
                <StatCard
                  title="Month-End Estimate"
                  value={fmtCost(forecast.remainingMonthCost)}
                  sub={`${forecast.remainingDays} days remaining`}
                  icon={DollarSign}
                  color="bg-amber-500"
                  badge="EOM"
                />
              </div>
            </div>
          )}

          {costChartData.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  Daily Cost
                  {forecast && <Badge variant="outline" className="text-xs font-normal">Dashed = 14-day projection</Badge>}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={costChartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                    <YAxis tickFormatter={(v) => `$${v.toFixed(3)}`} tick={{ fontSize: 10 }} width={60} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend />
                    {forecast && (
                      <ReferenceLine x={todayStr} stroke="#94a3b8" strokeDasharray="4 2" label={{ value: "Today", position: "top", fontSize: 10, fill: "#94a3b8" }} />
                    )}
                    <Line
                      type="monotone"
                      dataKey="actual"
                      name="Actual cost"
                      stroke="#10b981"
                      strokeWidth={2}
                      dot={false}
                      connectNulls={false}
                    />
                    {forecast && (
                      <Line
                        type="monotone"
                        dataKey="projected"
                        name="Projected cost"
                        stroke="#6366f1"
                        strokeWidth={2}
                        strokeDasharray="6 3"
                        dot={false}
                        connectNulls={false}
                      />
                    )}
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {(stats?.byDay?.length ?? 0) > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base">Daily Token Usage</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={stats!.byDay} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tickFormatter={fmt} tick={{ fontSize: 11 }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend />
                    <Line type="monotone" dataKey="inputTokens" name="Input Tokens" stroke="#3b82f6" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="outputTokens" name="Output Tokens" stroke="#8b5cf6" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {(stats?.byAgent?.length ?? 0) > 0 && (
              <Card>
                <CardHeader><CardTitle className="text-base">Tokens by Agent</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={stats!.byAgent.slice(0, 8)} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="agentName" tick={{ fontSize: 10 }} />
                      <YAxis tickFormatter={fmt} tick={{ fontSize: 10 }} />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend />
                      <Bar dataKey="inputTokens" name="Input" fill="#3b82f6" radius={[2, 2, 0, 0]} />
                      <Bar dataKey="outputTokens" name="Output" fill="#8b5cf6" radius={[2, 2, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}

            {(stats?.byProvider?.length ?? 0) > 0 && (
              <Card>
                <CardHeader><CardTitle className="text-base">Usage by Provider / Model</CardTitle></CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {stats!.byProvider.map((p) => (
                      <div key={`${p.provider}-${p.model}`} className="flex items-center justify-between text-sm p-2 rounded-md bg-muted/40">
                        <div>
                          <span className="font-medium">{{ openai: "OpenAI", anthropic: "Anthropic", gemini: "Gemini", ollama: "Ollama", vllm: "vLLM" }[p.provider] ?? p.provider}</span>
                          <span className="text-muted-foreground mx-1">·</span>
                          <span className="text-muted-foreground text-xs">{p.model}</span>
                        </div>
                        <div className="text-right text-xs">
                          <div>{fmt(p.inputTokens + p.outputTokens)} tokens</div>
                          <div className="text-muted-foreground">{fmtCost(p.costUsd)}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {(stats?.byAgent?.length ?? 0) > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base">Agent Performance</CardTitle></CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2 font-medium text-muted-foreground">Agent</th>
                        <th className="text-right py-2 font-medium text-muted-foreground">Calls</th>
                        <th className="text-right py-2 font-medium text-muted-foreground">Input</th>
                        <th className="text-right py-2 font-medium text-muted-foreground">Output</th>
                        <th className="text-right py-2 font-medium text-muted-foreground">Est. Cost</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats!.byAgent.map((a, i) => (
                        <tr key={i} className="border-b last:border-0" data-testid={`row-agent-${i}`}>
                          <td className="py-2 font-medium">{a.agentName}</td>
                          <td className="py-2 text-right text-muted-foreground">{a.calls}</td>
                          <td className="py-2 text-right text-muted-foreground">{fmt(a.inputTokens)}</td>
                          <td className="py-2 text-right text-muted-foreground">{fmt(a.outputTokens)}</td>
                          <td className="py-2 text-right font-medium">{fmtCost(a.costUsd)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {totalTokens === 0 && !isLoading && (
            <div className="text-center py-20 text-muted-foreground">
              <BarChart2 className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No token usage data yet. Run some tasks to see metrics here.</p>
            </div>
          )}
        </>
      )}

      {/* Utilization Alert Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Bell className="w-4 h-4 text-primary" /> Utilization Alert Settings
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Token Threshold (optional)</Label>
              <Input
                type="number"
                placeholder="e.g. 100000"
                value={alertThreshold}
                onChange={(e) => setAlertThreshold(e.target.value)}
                data-testid="input-alert-threshold"
              />
              <p className="text-xs text-muted-foreground">
                Send an alert when total tokens used in a task run exceeds this number.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>Alert Channel</Label>
              <Select value={alertChannelId} onValueChange={setAlertChannelId}>
                <SelectTrigger data-testid="select-alert-channel">
                  <SelectValue placeholder="Select a channel" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None — disabled</SelectItem>
                  {outboundChannels.map((ch) => (
                    <SelectItem key={ch.id} value={ch.id}>{ch.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Channel to notify when the token threshold is exceeded.
              </p>
            </div>
          </div>
          <div className="flex justify-end">
            <Button
              onClick={() => updateConfigMutation.mutate()}
              disabled={updateConfigMutation.isPending}
              data-testid="button-save-alert-settings"
            >
              {updateConfigMutation.isPending ? "Saving…" : "Save Alert Settings"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

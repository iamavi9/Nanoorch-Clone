import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Clock, Plus, Trash2, Loader2, Play, Pencil, CheckCircle2, XCircle, PauseCircle, ExternalLink, ShieldOff } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import type { ScheduledJob } from "@shared/schema";
import type { Orchestrator, Agent } from "@shared/schema";

interface Props { workspaceId: string; }

const CRON_PRESETS = [
  { label: "Every 15 min", value: "*/15 * * * *" },
  { label: "Every 30 min", value: "*/30 * * * *" },
  { label: "Every hour", value: "0 * * * *" },
  { label: "Daily midnight", value: "0 0 * * *" },
  { label: "Daily 9am", value: "0 9 * * *" },
  { label: "Weekdays 9am", value: "0 9 * * 1-5" },
  { label: "Mondays 9am", value: "0 9 * * 1" },
  { label: "Custom", value: "custom" },
];

const TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Toronto",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Madrid",
  "Europe/Rome",
  "Asia/Kolkata",
  "Asia/Dubai",
  "Asia/Singapore",
  "Asia/Shanghai",
  "Asia/Tokyo",
  "Australia/Sydney",
  "Pacific/Auckland",
];

type AgentWithOrch = Agent & { orchestratorName: string; orchestratorId: string };

function describeCron(expr: string): string {
  const presets: Record<string, string> = {
    "*/15 * * * *": "Every 15 minutes",
    "*/30 * * * *": "Every 30 minutes",
    "0 * * * *": "Every hour",
    "0 0 * * *": "Daily at midnight",
    "0 9 * * *": "Daily at 9:00 AM",
    "0 9 * * 1-5": "Weekdays at 9:00 AM",
    "0 9 * * 1": "Every Monday at 9:00 AM",
  };
  return presets[expr] ?? expr;
}

const EMPTY_FORM = {
  name: "",
  agentId: "",
  orchestratorId: "",
  prompt: "",
  cronExpression: "0 9 * * *",
  timezone: "UTC",
  bypassApproval: false,
  notifyChannelId: "",
  intent: "",
};

function JobForm({
  initial,
  agents,
  channels,
  onSave,
  isPending,
  onCancel,
}: {
  initial: typeof EMPTY_FORM;
  agents: AgentWithOrch[];
  channels: { id: string; name: string; type: string }[];
  onSave: (data: typeof EMPTY_FORM) => void;
  isPending: boolean;
  onCancel: () => void;
}) {
  const [form, setForm] = useState(initial);
  const [preset, setPreset] = useState(() => {
    const found = CRON_PRESETS.find((p) => p.value !== "custom" && p.value === initial.cronExpression);
    return found ? found.value : "custom";
  });

  const handlePreset = (val: string) => {
    setPreset(val);
    if (val !== "custom") setForm((f) => ({ ...f, cronExpression: val }));
  };

  const handleAgent = (agentId: string) => {
    const agent = agents.find((a) => a.id === agentId);
    setForm((f) => ({ ...f, agentId, orchestratorId: agent?.orchestratorId ?? "" }));
  };

  return (
    <div className="flex flex-col">
      {/* Scrollable body — buttons stay pinned outside */}
      <div className="overflow-y-auto pr-1 space-y-4" style={{ maxHeight: "62vh" }}>

        <div className="space-y-2">
          <Label>Job Name</Label>
          <Input data-testid="input-job-name" placeholder="Daily summary" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>

        <div className="space-y-2">
          <Label>Agent</Label>
          <Select value={form.agentId} onValueChange={handleAgent}>
            <SelectTrigger data-testid="select-agent">
              <SelectValue placeholder="Select an agent…" />
            </SelectTrigger>
            <SelectContent>
              {agents.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name} <span className="text-muted-foreground">— {a.orchestratorName}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Prompt</Label>
          <Textarea
            data-testid="input-job-prompt"
            placeholder="Summarise all open tasks and list any blockers…"
            className="min-h-[90px] resize-none"
            value={form.prompt}
            onChange={(e) => setForm({ ...form, prompt: e.target.value })}
          />
          <p className="text-xs text-muted-foreground">This prompt is sent to the agent on every scheduled run.</p>
        </div>

        <div className="space-y-2">
          <Label>Schedule</Label>
          <div className="flex flex-wrap gap-1.5">
            {CRON_PRESETS.map((p) => (
              <button
                key={p.value}
                type="button"
                onClick={() => handlePreset(p.value)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
                  preset === p.value
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-muted/30 text-muted-foreground hover:bg-muted/60"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <Input
            data-testid="input-cron"
            placeholder="*/30 * * * *"
            value={form.cronExpression}
            onChange={(e) => { setForm({ ...form, cronExpression: e.target.value }); setPreset("custom"); }}
            className="font-mono text-sm"
          />
          <p className="text-xs text-muted-foreground">Standard 5-field cron syntax: minute hour day month weekday</p>
        </div>

        <div className="space-y-2">
          <Label>Timezone</Label>
          <Select value={form.timezone} onValueChange={(v) => setForm({ ...form, timezone: v })}>
            <SelectTrigger data-testid="select-timezone">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIMEZONES.map((tz) => (
                <SelectItem key={tz} value={tz}>{tz}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Notify Channel (optional)</Label>
          <Select
            value={form.notifyChannelId || "none"}
            onValueChange={(v) => setForm({ ...form, notifyChannelId: v === "none" ? "" : v })}
          >
            <SelectTrigger data-testid="select-notify-channel">
              <SelectValue placeholder="None — use orchestrator default" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None — use orchestrator default</SelectItem>
              {channels.map((ch) => (
                <SelectItem key={ch.id} value={ch.id}>{ch.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">Channel to notify when this job completes or fails.</p>
        </div>

        <div className="space-y-2">
          <Label>Intent Classification</Label>
          <Select
            value={form.intent || "auto"}
            onValueChange={(v) => setForm({ ...form, intent: v === "auto" ? "" : v })}
          >
            <SelectTrigger data-testid="select-intent">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">Auto-detect (classify from prompt)</SelectItem>
              <SelectItem value="conversational">Conversational — in-process executor</SelectItem>
              <SelectItem value="action">Docker — container-isolated action</SelectItem>
              <SelectItem value="code_execution">Sandbox — K3s / gVisor execution</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Auto-detect uses the prompt to classify the execution path. Override when the auto-classification is incorrect.
          </p>
        </div>

        <div className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-2">
          <div>
            <p className="text-sm font-medium">Skip approval gates</p>
            <p className="text-xs text-muted-foreground">Tasks created by this job bypass approval requests.</p>
          </div>
          <Switch
            data-testid="switch-job-bypass-approval"
            checked={form.bypassApproval}
            onCheckedChange={(v) => setForm({ ...form, bypassApproval: v })}
          />
        </div>

      </div>

      {/* Pinned footer — always visible regardless of scroll position */}
      <div className="flex justify-end gap-2 pt-3 mt-2 border-t">
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        <Button data-testid="button-save-job" onClick={() => onSave(form)} disabled={isPending}>
          {isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
          Save Job
        </Button>
      </div>
    </div>
  );
}

export default function ScheduledJobsPage({ workspaceId }: Props) {
  const { toast } = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [editingJob, setEditingJob] = useState<ScheduledJob | null>(null);

  const { data: jobs = [], isLoading } = useQuery<ScheduledJob[]>({
    queryKey: [`/api/workspaces/${workspaceId}/scheduled-jobs`],
  });

  const { data: agents = [] } = useQuery<AgentWithOrch[]>({
    queryKey: [`/api/workspaces/${workspaceId}/agents`],
  });

  const { data: allChannels = [] } = useQuery<{ id: string; name: string; type: string }[]>({
    queryKey: [`/api/workspaces/${workspaceId}/channels`],
  });
  const outboundChannels = allChannels.filter((c) => ["slack", "teams", "google_chat", "generic_webhook"].includes(c.type));

  const invalidate = () => queryClient.invalidateQueries({ queryKey: [`/api/workspaces/${workspaceId}/scheduled-jobs`] });

  const createMutation = useMutation({
    mutationFn: (body: typeof EMPTY_FORM) => apiRequest("POST", `/api/workspaces/${workspaceId}/scheduled-jobs`, body),
    onSuccess: () => { invalidate(); setCreateOpen(false); toast({ title: "Job created" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const editMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<typeof EMPTY_FORM> }) =>
      apiRequest("PUT", `/api/scheduled-jobs/${id}`, body),
    onSuccess: () => { invalidate(); setEditingJob(null); toast({ title: "Job updated" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/scheduled-jobs/${id}`),
    onSuccess: () => { invalidate(); toast({ title: "Job deleted" }); },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      apiRequest("PUT", `/api/scheduled-jobs/${id}`, { isActive }),
    onSuccess: () => invalidate(),
  });

  const runMutation = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/scheduled-jobs/${id}/run`, {}),
    onSuccess: (_, id) => {
      invalidate();
      toast({ title: "Job triggered", description: "Task created and queued." });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const handleCreate = (form: typeof EMPTY_FORM) => {
    if (!form.name.trim() || !form.agentId || !form.prompt.trim() || !form.cronExpression.trim()) {
      toast({ title: "All fields are required", variant: "destructive" }); return;
    }
    createMutation.mutate(form);
  };

  const handleEdit = (form: typeof EMPTY_FORM) => {
    if (!editingJob) return;
    editMutation.mutate({ id: editingJob.id, body: form });
  };

  const agentMap = Object.fromEntries(agents.map((a) => [a.id, a]));

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Clock className="w-6 h-6 text-primary" />
            Scheduled Jobs
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Run agents automatically on a cron schedule. Jobs create tasks that appear in the Tasks view.
          </p>
        </div>
        <Button data-testid="button-add-job" onClick={() => setCreateOpen(true)}>
          <Plus className="w-4 h-4 mr-2" /> Add Job
        </Button>
      </div>

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Create Scheduled Job</DialogTitle></DialogHeader>
          <JobForm
            initial={EMPTY_FORM}
            agents={agents}
            channels={outboundChannels}
            onSave={handleCreate}
            isPending={createMutation.isPending}
            onCancel={() => setCreateOpen(false)}
          />
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={!!editingJob} onOpenChange={(o) => { if (!o) setEditingJob(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Edit Scheduled Job</DialogTitle></DialogHeader>
          {editingJob && (
            <JobForm
              initial={{
                name: editingJob.name,
                agentId: editingJob.agentId,
                orchestratorId: editingJob.orchestratorId,
                prompt: editingJob.prompt,
                cronExpression: editingJob.cronExpression,
                timezone: editingJob.timezone ?? "UTC",
                bypassApproval: (editingJob as any).bypassApproval ?? false,
                notifyChannelId: (editingJob as any).notifyChannelId ?? "",
                intent: (editingJob as any).intent ?? "",
              }}
              agents={agents}
              channels={outboundChannels}
              onSave={handleEdit}
              isPending={editMutation.isPending}
              onCancel={() => setEditingJob(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      {isLoading ? (
        <div className="flex items-center justify-center h-40 text-muted-foreground">
          <Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading…
        </div>
      ) : jobs.length === 0 ? (
        <div className="border-2 border-dashed rounded-xl p-12 text-center">
          <Clock className="w-10 h-10 mx-auto mb-3 text-muted-foreground/40" />
          <p className="font-medium text-muted-foreground">No scheduled jobs yet</p>
          <p className="text-sm text-muted-foreground/60 mt-1 mb-4">
            Set up cron jobs to run agents automatically — daily summaries, health checks, report generation, and more.
          </p>
          <Button variant="outline" onClick={() => setCreateOpen(true)}>
            <Plus className="w-4 h-4 mr-2" /> Create your first job
          </Button>
        </div>
      ) : (
        <div className="grid gap-4">
          {jobs.map((job) => {
            const agent = agentMap[job.agentId];
            return (
              <Card key={job.id} data-testid={`card-job-${job.id}`} className={!job.isActive ? "opacity-60" : ""}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <CardTitle className="text-base flex items-center gap-2 flex-wrap">
                        {job.name}
                        <Badge variant={job.isActive ? "default" : "secondary"} className="text-xs" data-testid={`status-job-${job.id}`}>
                          {job.isActive ? (
                            <><CheckCircle2 className="w-3 h-3 mr-1" />Active</>
                          ) : (
                            <><PauseCircle className="w-3 h-3 mr-1" />Paused</>
                          )}
                        </Badge>
                        {(job as any).bypassApproval && (
                          <Badge variant="outline" className="text-xs text-orange-600 border-orange-400 gap-1" data-testid={`badge-bypass-${job.id}`}>
                            <ShieldOff className="w-3 h-3" />No gates
                          </Badge>
                        )}
                        {(job as any).intent && (job as any).intent !== "conversational" && (
                          <Badge variant="outline" className="text-xs" data-testid={`badge-intent-${job.id}`}>
                            {(job as any).intent === "action" ? "Docker" : "Sandbox"}
                          </Badge>
                        )}
                      </CardTitle>
                      <CardDescription className="text-xs mt-0.5">
                        {agent ? `${agent.name} · ${agent.orchestratorName}` : job.agentId}
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Button
                        variant="outline" size="sm"
                        data-testid={`button-run-${job.id}`}
                        onClick={() => runMutation.mutate(job.id)}
                        disabled={runMutation.isPending}
                        title="Run now"
                      >
                        {runMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                      </Button>
                      <Button variant="outline" size="sm" data-testid={`button-edit-${job.id}`} onClick={() => setEditingJob(job)}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="outline" size="sm"
                        data-testid={`button-toggle-${job.id}`}
                        onClick={() => toggleMutation.mutate({ id: job.id, isActive: !job.isActive })}
                      >
                        {job.isActive ? "Pause" : "Resume"}
                      </Button>
                      <Button
                        variant="ghost" size="sm"
                        data-testid={`button-delete-${job.id}`}
                        className="text-destructive hover:text-destructive"
                        onClick={() => deleteMutation.mutate(job.id)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="bg-muted/40 rounded-md p-2.5 mb-3 text-sm text-muted-foreground font-mono line-clamp-2">
                    {job.prompt}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      <strong className="text-foreground">{describeCron(job.cronExpression)}</strong>
                      {job.timezone && job.timezone !== "UTC" && <span>({job.timezone})</span>}
                    </span>
                    {job.nextRunAt && (
                      <span>Next: {new Date(job.nextRunAt).toLocaleString()}</span>
                    )}
                    {job.lastRunAt ? (
                      <span>Last run: {new Date(job.lastRunAt).toLocaleString()}</span>
                    ) : (
                      <span>Never run</span>
                    )}
                    {job.lastTaskId && (
                      <a
                        href={`/workspaces/${workspaceId}/orchestrators/${job.orchestratorId}/tasks/${job.lastTaskId}`}
                        className="flex items-center gap-1 text-primary hover:underline"
                        data-testid={`link-last-task-${job.id}`}
                      >
                        <ExternalLink className="w-3 h-3" /> Last task
                      </a>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

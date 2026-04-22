import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { GitBranch, Plus, Play, Trash2, ChevronRight, Clock, CheckCircle2, XCircle, Loader2, RefreshCw, ChevronDown, ChevronUp, Pencil } from "lucide-react";
import { useState } from "react";
import type { Pipeline, Orchestrator, Agent } from "@shared/schema";

interface PipelinesPageProps {
  workspaceId: string;
}

interface PipelineStep {
  agentId: string;
  name: string;
  promptTemplate: string;
  stepOrder: number;
}

interface PipelineWithSteps extends Pipeline {
  steps?: PipelineStep[];
}

interface PipelineRun {
  id: string;
  status: string;
  triggeredBy: string;
  startedAt: string | null;
  completedAt: string | null;
  error: string | null;
  createdAt: string;
  stepRuns?: Array<{ id: string; stepId: string; status: string; output?: string; error?: string; startedAt?: string; completedAt?: string }>;
}

const emptyForm = { name: "", description: "", orchestratorId: "", cronExpression: "", timezone: "UTC", notifyChannelId: "" };

function RunStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; class: string; icon: any }> = {
    pending: { label: "Pending", class: "text-yellow-600 border-yellow-400 bg-yellow-50 dark:bg-yellow-900/20", icon: Clock },
    running: { label: "Running", class: "text-blue-600 border-blue-400 bg-blue-50 dark:bg-blue-900/20", icon: Loader2 },
    completed: { label: "Completed", class: "text-green-600 border-green-400 bg-green-50 dark:bg-green-900/20", icon: CheckCircle2 },
    failed: { label: "Failed", class: "text-red-600 border-red-400 bg-red-50 dark:bg-red-900/20", icon: XCircle },
  };
  const cfg = map[status] ?? { label: status, class: "", icon: Clock };
  const Icon = cfg.icon;
  return <Badge variant="outline" className={cfg.class}><Icon className="w-3 h-3 mr-1" />{cfg.label}</Badge>;
}

function StepOutput({ output }: { output: string }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = output.length > 300;
  const displayed = isLong && !expanded ? output.slice(0, 300) + "…" : output;
  return (
    <div className="mt-1">
      <pre className="text-muted-foreground whitespace-pre-wrap break-words font-sans text-xs leading-relaxed">{displayed}</pre>
      {isLong && (
        <button type="button" onClick={() => setExpanded((e) => !e)}
          className="mt-0.5 flex items-center gap-0.5 text-xs text-primary hover:underline">
          {expanded ? <><ChevronUp className="w-3 h-3" />Show less</> : <><ChevronDown className="w-3 h-3" />Show full output</>}
        </button>
      )}
    </div>
  );
}

function PipelineRunDetail({ runId }: { runId: string }) {
  const { data, isLoading } = useQuery<PipelineRun>({
    queryKey: ["/api/pipeline-runs", runId],
    queryFn: () => fetch(`/api/pipeline-runs/${runId}`, { credentials: "include" }).then((r) => r.json()),
    refetchInterval: (q) => {
      const d = q.state.data as PipelineRun | undefined;
      return (!d || d.status === "running" || d.status === "pending") ? 2000 : false;
    },
  });

  if (isLoading) return <p className="text-sm text-muted-foreground py-2">Loading run details…</p>;
  if (!data) return null;

  return (
    <div className="space-y-2 mt-2">
      {data.stepRuns?.map((sr, i) => (
        <div key={sr.id} className="flex items-start gap-2 text-xs p-2 rounded bg-muted/30">
          <span className="font-medium text-muted-foreground w-5 shrink-0">{i + 1}.</span>
          <div className="flex-1 min-w-0">
            <RunStatusBadge status={sr.status} />
            {sr.output && <StepOutput output={sr.output} />}
            {sr.error && <p className="mt-1 text-red-500 whitespace-pre-wrap">{sr.error}</p>}
          </div>
        </div>
      ))}
      {data.error && <p className="text-xs text-red-500 p-2 bg-red-50 dark:bg-red-900/20 rounded whitespace-pre-wrap">{data.error}</p>}
    </div>
  );
}

function PipelineFormFields({
  form,
  steps,
  orchestrators,
  agents,
  channels,
  onFormChange,
  onStepChange,
  onAddStep,
  onRemoveStep,
  mode,
}: {
  form: typeof emptyForm;
  steps: PipelineStep[];
  orchestrators: Orchestrator[];
  agents: Agent[];
  channels: { id: string; name: string; type: string }[];
  onFormChange: (f: Partial<typeof emptyForm>) => void;
  onStepChange: (i: number, field: keyof PipelineStep, value: string | number) => void;
  onAddStep: () => void;
  onRemoveStep: (i: number) => void;
  mode: "create" | "edit";
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Name *</Label>
          <Input value={form.name} onChange={(e) => onFormChange({ name: e.target.value })} placeholder="e.g. Nightly Report" data-testid="input-pipeline-name" />
        </div>
        <div className="space-y-1.5">
          <Label>Orchestrator *</Label>
          <Select value={form.orchestratorId} onValueChange={(v) => onFormChange({ orchestratorId: v })}>
            <SelectTrigger data-testid="select-orchestrator">
              <SelectValue placeholder="Select orchestrator" />
            </SelectTrigger>
            <SelectContent>
              {orchestrators.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Description</Label>
        <Textarea value={form.description} onChange={(e) => onFormChange({ description: e.target.value })} rows={2} placeholder="What does this pipeline do?" data-testid="textarea-pipeline-description" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Cron Schedule (optional)</Label>
          <Input value={form.cronExpression} onChange={(e) => onFormChange({ cronExpression: e.target.value })} placeholder="0 8 * * * (daily at 8am)" data-testid="input-cron" />
        </div>
        <div className="space-y-1.5">
          <Label>Timezone</Label>
          <Input value={form.timezone} onChange={(e) => onFormChange({ timezone: e.target.value })} placeholder="UTC" />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Notify Channel (optional)</Label>
        <Select
          value={form.notifyChannelId || "none"}
          onValueChange={(v) => onFormChange({ notifyChannelId: v === "none" ? "" : v })}
        >
          <SelectTrigger data-testid="select-pipeline-channel">
            <SelectValue placeholder="None — use orchestrator default" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">None — use orchestrator default</SelectItem>
            {channels.map((ch) => (
              <SelectItem key={ch.id} value={ch.id}>{ch.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">Channel to notify when this pipeline completes or fails.</p>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <Label>Steps</Label>
          <Button variant="outline" size="sm" onClick={onAddStep} data-testid="button-add-step">
            <Plus className="w-3.5 h-3.5 mr-1" />Add Step
          </Button>
        </div>
        {steps.length === 0 && (
          <p className="text-xs text-muted-foreground">Add at least one step. Each step runs an agent and passes its output to the next.</p>
        )}
        <div className="space-y-3">
          {steps.map((step, i) => (
            <div key={i} className="border rounded-lg p-3 space-y-2" data-testid={`step-${i}`}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">Step {i + 1}</span>
                <Button variant="ghost" size="icon" className="h-5 w-5 text-destructive" onClick={() => onRemoveStep(i)}>
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Step Name</Label>
                  <Input value={step.name} onChange={(e) => onStepChange(i, "name", e.target.value)} placeholder="e.g. Fetch Data" className="h-7 text-xs" data-testid={`input-step-name-${i}`} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Agent *</Label>
                  <Select value={step.agentId} onValueChange={(v) => onStepChange(i, "agentId", v)}>
                    <SelectTrigger className="h-7 text-xs" data-testid={`select-step-agent-${i}`}>
                      <SelectValue placeholder="Choose agent" />
                    </SelectTrigger>
                    <SelectContent>
                      {agents.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Prompt Template</Label>
                <Textarea
                  value={step.promptTemplate}
                  onChange={(e) => onStepChange(i, "promptTemplate", e.target.value)}
                  placeholder="Describe the task for this agent. Previous step outputs are automatically prepended."
                  rows={3}
                  className="text-xs"
                  data-testid={`textarea-step-prompt-${i}`}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function PipelinesPage({ workspaceId }: PipelinesPageProps) {
  const { toast } = useToast();
  const [creating, setCreating] = useState(false);
  const [editingPipeline, setEditingPipeline] = useState<PipelineWithSteps | null>(null);
  const [viewRunsFor, setViewRunsFor] = useState<string | null>(null);
  const [openRunId, setOpenRunId] = useState<string | null>(null);

  const [form, setForm] = useState(emptyForm);
  const [steps, setSteps] = useState<PipelineStep[]>([]);

  const [editForm, setEditForm] = useState(emptyForm);
  const [editSteps, setEditSteps] = useState<PipelineStep[]>([]);

  const { data: pipelines = [], isLoading } = useQuery<Pipeline[]>({
    queryKey: [`/api/workspaces/${workspaceId}/pipelines`],
  });

  const { data: orchestrators = [] } = useQuery<Orchestrator[]>({
    queryKey: [`/api/workspaces/${workspaceId}/orchestrators`],
  });

  const { data: agents = [] } = useQuery<Agent[]>({
    queryKey: [`/api/workspaces/${workspaceId}/agents`],
  });

  const { data: allChannels = [] } = useQuery<{ id: string; name: string; type: string }[]>({
    queryKey: [`/api/workspaces/${workspaceId}/channels`],
  });
  const outboundChannels = allChannels.filter((c) => ["slack", "teams", "google_chat", "generic_webhook"].includes(c.type));

  const { data: runs = [], refetch: refetchRuns } = useQuery<PipelineRun[]>({
    queryKey: [`/api/pipelines/${viewRunsFor}/runs`],
    enabled: !!viewRunsFor,
    refetchInterval: 5000,
  });

  const createMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/workspaces/${workspaceId}/pipelines`, { ...form, steps }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/workspaces/${workspaceId}/pipelines`] });
      toast({ title: "Pipeline created" });
      setCreating(false);
      setForm(emptyForm);
      setSteps([]);
    },
    onError: () => toast({ title: "Error", description: "Failed to create pipeline.", variant: "destructive" }),
  });

  const editMutation = useMutation({
    mutationFn: () => apiRequest("PUT", `/api/pipelines/${editingPipeline!.id}`, { ...editForm, steps: editSteps }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/workspaces/${workspaceId}/pipelines`] });
      toast({ title: "Pipeline updated" });
      setEditingPipeline(null);
    },
    onError: () => toast({ title: "Error", description: "Failed to update pipeline.", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/pipelines/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/workspaces/${workspaceId}/pipelines`] });
      toast({ title: "Pipeline deleted" });
    },
  });

  const runMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/pipelines/${id}/run`, {});
      return res.json() as Promise<{ runId: string }>;
    },
    onSuccess: (data, id: string) => {
      queryClient.invalidateQueries({ queryKey: [`/api/pipelines/${id}/runs`] });
      setViewRunsFor(id);
      toast({ title: "Pipeline started", description: `Run ID: ${data?.runId ?? "..."}` });
    },
    onError: () => toast({ title: "Error", description: "Failed to start pipeline.", variant: "destructive" }),
  });

  const openEdit = async (pipeline: Pipeline) => {
    try {
      const res = await fetch(`/api/pipelines/${pipeline.id}`, { credentials: "include" });
      const data: PipelineWithSteps = await res.json();
      setEditingPipeline(data);
      setEditForm({
        name: data.name ?? "",
        description: data.description ?? "",
        orchestratorId: data.orchestratorId ?? "",
        cronExpression: data.cronExpression ?? "",
        timezone: data.timezone ?? "UTC",
        notifyChannelId: (data as any).notifyChannelId ?? "",
      });
      setEditSteps(
        (data.steps ?? [])
          .sort((a, b) => a.stepOrder - b.stepOrder)
          .map((s) => ({ agentId: s.agentId, name: s.name, promptTemplate: s.promptTemplate, stepOrder: s.stepOrder }))
      );
    } catch {
      toast({ title: "Error", description: "Failed to load pipeline details.", variant: "destructive" });
    }
  };

  const addStep = () => setSteps((p) => [...p, { agentId: "", name: `Step ${p.length + 1}`, promptTemplate: "", stepOrder: p.length + 1 }]);
  const updateStep = (i: number, field: keyof PipelineStep, value: string | number) => setSteps((p) => p.map((s, idx) => idx === i ? { ...s, [field]: value } : s));
  const removeStep = (i: number) => setSteps((p) => p.filter((_, idx) => idx !== i).map((s, idx) => ({ ...s, stepOrder: idx + 1 })));

  const addEditStep = () => setEditSteps((p) => [...p, { agentId: "", name: `Step ${p.length + 1}`, promptTemplate: "", stepOrder: p.length + 1 }]);
  const updateEditStep = (i: number, field: keyof PipelineStep, value: string | number) => setEditSteps((p) => p.map((s, idx) => idx === i ? { ...s, [field]: value } : s));
  const removeEditStep = (i: number) => setEditSteps((p) => p.filter((_, idx) => idx !== i).map((s, idx) => ({ ...s, stepOrder: idx + 1 })));

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <GitBranch className="w-6 h-6 text-primary" />
            Pipelines
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Chain agents sequentially — each step passes its output to the next.
          </p>
        </div>
        <Button onClick={() => setCreating(true)} data-testid="button-create-pipeline">
          <Plus className="w-4 h-4 mr-1" />New Pipeline
        </Button>
      </div>

      {isLoading && <p className="text-muted-foreground text-sm">Loading…</p>}

      {!isLoading && pipelines.length === 0 && (
        <div className="text-center py-20 text-muted-foreground">
          <GitBranch className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No pipelines yet. Create one to chain agents in sequence.</p>
        </div>
      )}

      <div className="space-y-3">
        {pipelines.map((pipeline) => (
          <Card key={pipeline.id} data-testid={`card-pipeline-${pipeline.id}`}>
            <CardContent className="pt-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold">{pipeline.name}</h3>
                    <Badge variant={pipeline.isActive ? "default" : "secondary"} className="text-xs">
                      {pipeline.isActive ? "Active" : "Inactive"}
                    </Badge>
                    {pipeline.cronExpression && (
                      <Badge variant="outline" className="text-xs"><Clock className="w-3 h-3 mr-1" />{pipeline.cronExpression}</Badge>
                    )}
                  </div>
                  {pipeline.description && <p className="text-sm text-muted-foreground">{pipeline.description}</p>}
                  {pipeline.lastRunAt && (
                    <p className="text-xs text-muted-foreground mt-1">Last run: {new Date(pipeline.lastRunAt).toLocaleString()}</p>
                  )}
                </div>
                <div className="flex gap-1.5 shrink-0">
                  <Button variant="outline" size="sm" onClick={() => { setViewRunsFor(pipeline.id === viewRunsFor ? null : pipeline.id); }} data-testid={`button-runs-${pipeline.id}`}>
                    <ChevronRight className={`w-3.5 h-3.5 mr-1 transition-transform ${viewRunsFor === pipeline.id ? "rotate-90" : ""}`} />Runs
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => runMutation.mutate(pipeline.id)} disabled={runMutation.isPending} data-testid={`button-run-${pipeline.id}`}>
                    <Play className="w-3.5 h-3.5 mr-1" />Run
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => openEdit(pipeline)} data-testid={`button-edit-${pipeline.id}`}>
                    <Pencil className="w-3.5 h-3.5 mr-1" />Edit
                  </Button>
                  <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => deleteMutation.mutate(pipeline.id)} data-testid={`button-delete-${pipeline.id}`}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>

              {viewRunsFor === pipeline.id && (
                <div className="mt-4 border-t pt-4">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-sm font-medium">Run History</h4>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => {
                      refetchRuns();
                      queryClient.invalidateQueries({ queryKey: ["/api/pipeline-runs"] });
                    }}><RefreshCw className="w-3 h-3" /></Button>
                  </div>
                  {runs.length === 0 && <p className="text-xs text-muted-foreground">No runs yet.</p>}
                  <div className="space-y-2">
                    {runs.map((run) => (
                      <div key={run.id} className="text-xs">
                        <div className="flex items-center gap-2 cursor-pointer" onClick={() => setOpenRunId(openRunId === run.id ? null : run.id)}>
                          <RunStatusBadge status={run.status} />
                          <span className="text-muted-foreground">{new Date(run.createdAt).toLocaleString()}</span>
                          <span className="text-muted-foreground capitalize">· {run.triggeredBy}</span>
                        </div>
                        {openRunId === run.id && <PipelineRunDetail runId={run.id} />}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Create Dialog */}
      <Dialog open={creating} onOpenChange={(o) => { if (!o) { setCreating(false); setSteps([]); setForm(emptyForm); } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Pipeline</DialogTitle>
          </DialogHeader>
          <PipelineFormFields
            form={form}
            steps={steps}
            orchestrators={orchestrators}
            agents={agents}
            channels={outboundChannels}
            onFormChange={(f) => setForm((prev) => ({ ...prev, ...f }))}
            onStepChange={updateStep}
            onAddStep={addStep}
            onRemoveStep={removeStep}
            mode="create"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => { setCreating(false); setSteps([]); setForm(emptyForm); }}>Cancel</Button>
            <Button
              onClick={() => createMutation.mutate()}
              disabled={!form.name || !form.orchestratorId || steps.length === 0 || createMutation.isPending}
              data-testid="button-confirm-create-pipeline"
            >
              {createMutation.isPending ? "Creating…" : "Create Pipeline"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editingPipeline} onOpenChange={(o) => { if (!o) setEditingPipeline(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Pipeline</DialogTitle>
          </DialogHeader>
          <PipelineFormFields
            form={editForm}
            steps={editSteps}
            orchestrators={orchestrators}
            agents={agents}
            channels={outboundChannels}
            onFormChange={(f) => setEditForm((prev) => ({ ...prev, ...f }))}
            onStepChange={updateEditStep}
            onAddStep={addEditStep}
            onRemoveStep={removeEditStep}
            mode="edit"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingPipeline(null)}>Cancel</Button>
            <Button
              onClick={() => editMutation.mutate()}
              disabled={!editForm.name || !editForm.orchestratorId || editSteps.length === 0 || editMutation.isPending}
              data-testid="button-confirm-edit-pipeline"
            >
              {editMutation.isPending ? "Saving…" : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

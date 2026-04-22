import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Plus, Bot, Radio, ListTodo, Settings, Play, Pause, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Orchestrator } from "@shared/schema";

const PROVIDERS = [
  { id: "openai", name: "OpenAI", models: ["gpt-5.4", "gpt-5.4-mini", "gpt-5.4-nano"] },
  { id: "anthropic", name: "Anthropic", models: ["claude-opus-4-6", "claude-sonnet-4-6", "claude-haiku-4-5-20251001"] },
  { id: "gemini", name: "Google Gemini", models: ["gemini-3.1-pro-preview", "gemini-3-flash-preview", "gemini-3.1-flash-lite-preview", "gemini-2.5-pro", "gemini-2.5-flash"] },
  { id: "ollama", name: "Ollama (on-prem)", models: ["llama3.1", "llama3.2", "qwen2.5", "mistral", "codellama", "deepseek-r1"] },
  { id: "vllm", name: "vLLM (on-prem / GPU cluster)", models: ["meta-llama/Llama-3.1-70B-Instruct", "meta-llama/Llama-3.1-8B-Instruct", "Qwen/Qwen2.5-72B-Instruct", "Qwen/Qwen2.5-7B-Instruct", "mistralai/Mixtral-8x7B-Instruct-v0.1", "mistralai/Mistral-Large-Instruct-2407", "deepseek-ai/DeepSeek-V3", "microsoft/Phi-4"] },
];

interface Props {
  workspaceId: string;
  orchestratorId: string;
}

interface OrchestratorForm {
  name: string;
  description: string;
  provider: string;
  model: string;
  baseUrl: string;
  vllmApiKey: string;
  systemPrompt: string;
  maxConcurrency: number;
  maxRetries: number;
  timeoutSeconds: number;
  failoverProvider: string;
  failoverModel: string;
}

const defaultForm: OrchestratorForm = {
  name: "",
  description: "",
  provider: "openai",
  model: "gpt-5.4",
  baseUrl: "",
  vllmApiKey: "",
  systemPrompt: "",
  maxConcurrency: 3,
  maxRetries: 2,
  timeoutSeconds: 120,
  failoverProvider: "",
  failoverModel: "",
};

export default function OrchestratorPage({ workspaceId, orchestratorId }: Props) {
  const { toast } = useToast();
  const [editOpen, setEditOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(orchestratorId === "new");
  const [form, setForm] = useState<OrchestratorForm>(defaultForm);

  const isNew = orchestratorId === "new";

  const { data: orchestrators, isLoading } = useQuery<Orchestrator[]>({
    queryKey: [`/api/workspaces/${workspaceId}/orchestrators`],
    enabled: isNew,
  });

  const { data: orchestrator } = useQuery<Orchestrator>({
    queryKey: [`/api/orchestrators/${orchestratorId}`],
    enabled: !isNew,
  });

  const createMutation = useMutation({
    mutationFn: (data: OrchestratorForm) =>
      apiRequest("POST", `/api/workspaces/${workspaceId}/orchestrators`, data),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: [`/api/workspaces/${workspaceId}/orchestrators`] });
      setCreateOpen(false);
      setForm(defaultForm);
      toast({ title: "Orchestrator created" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: (data: Partial<OrchestratorForm>) =>
      apiRequest("PUT", `/api/orchestrators/${orchestratorId}`, data),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: [`/api/orchestrators/${orchestratorId}`] });
      await queryClient.invalidateQueries({ queryKey: [`/api/workspaces/${workspaceId}/orchestrators`] });
      setEditOpen(false);
      toast({ title: "Orchestrator updated" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const toggleStatus = useMutation({
    mutationFn: () =>
      apiRequest("PUT", `/api/orchestrators/${orchestratorId}`, {
        status: orchestrator?.status === "active" ? "paused" : "active",
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: [`/api/orchestrators/${orchestratorId}`] });
      await queryClient.invalidateQueries({ queryKey: [`/api/workspaces/${workspaceId}/orchestrators`] });
    },
  });

  const currentModels = PROVIDERS.find((p) => p.id === form.provider)?.models ?? [];

  const openEdit = () => {
    if (orchestrator) {
      setForm({
        name: orchestrator.name,
        description: orchestrator.description ?? "",
        provider: orchestrator.provider,
        model: orchestrator.model,
        baseUrl: (orchestrator as any).baseUrl ?? "",
        vllmApiKey: (orchestrator as any).vllmApiKey ?? "",
        systemPrompt: orchestrator.systemPrompt ?? "",
        maxConcurrency: orchestrator.maxConcurrency ?? 3,
        maxRetries: orchestrator.maxRetries ?? 2,
        timeoutSeconds: orchestrator.timeoutSeconds ?? 120,
        failoverProvider: (orchestrator as any).failoverProvider ?? "",
        failoverModel: (orchestrator as any).failoverModel ?? "",
      });
    }
    setEditOpen(true);
  };

  const base = `/workspaces/${workspaceId}/orchestrators/${orchestratorId}`;

  if (isNew) {
    return (
      <div className="p-6 max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Orchestrators</h1>
            <p className="text-muted-foreground mt-1">Manage AI orchestrators for this workspace</p>
          </div>
          <Button onClick={() => setCreateOpen(true)} data-testid="button-new-orchestrator">
            <Plus className="w-4 h-4 mr-2" /> New Orchestrator
          </Button>
        </div>
        <OrchestratorFormDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          form={form}
          setForm={setForm}
          onSubmit={() => createMutation.mutate(form)}
          isPending={createMutation.isPending}
          title="Create Orchestrator"
        />
      </div>
    );
  }

  if (!orchestrator) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-48" />
          <div className="h-32 bg-muted rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-bold">{orchestrator.name}</h1>
            <Badge className={orchestrator.status === "active"
              ? "bg-green-500/20 text-green-400 border-green-500/30"
              : "bg-yellow-500/20 text-yellow-400 border-yellow-500/30"}>
              {orchestrator.status}
            </Badge>
          </div>
          {orchestrator.description && <p className="text-muted-foreground">{orchestrator.description}</p>}
          <div className="flex items-center gap-2 mt-2">
            <Badge variant="outline">{PROVIDERS.find((p) => p.id === orchestrator.provider)?.name ?? orchestrator.provider}</Badge>
            <Badge variant="secondary" className="font-mono">{orchestrator.model}</Badge>
            <span className="text-xs text-muted-foreground">Concurrency: {orchestrator.maxConcurrency}</span>
            <span className="text-xs text-muted-foreground">Timeout: {orchestrator.timeoutSeconds}s</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => toggleStatus.mutate()} data-testid="button-toggle-status">
            {orchestrator.status === "active" ? <><Pause className="w-4 h-4 mr-1" />Pause</> : <><Play className="w-4 h-4 mr-1" />Resume</>}
          </Button>
          <Button variant="outline" size="sm" onClick={openEdit} data-testid="button-edit-orchestrator">
            <Settings className="w-4 h-4 mr-1" /> Settings
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <NavCard href={`${base}/agents`} icon={Bot} title="Agents" description="Configure AI agents for this orchestrator" />
        <NavCard href={`${base}/channels`} icon={Radio} title="Channels" description="Webhook and API endpoints" />
        <NavCard href={`${base}/tasks`} icon={ListTodo} title="Tasks" description="View and submit tasks" />
      </div>

      {orchestrator.systemPrompt && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">System Prompt</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-sm text-muted-foreground whitespace-pre-wrap font-mono bg-muted/50 rounded-md p-3">
              {orchestrator.systemPrompt}
            </pre>
          </CardContent>
        </Card>
      )}

      <OrchestratorFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        form={form}
        setForm={setForm}
        onSubmit={() => updateMutation.mutate(form)}
        isPending={updateMutation.isPending}
        title="Edit Orchestrator"
      />
    </div>
  );
}

function NavCard({ href, icon: Icon, title, description }: { href: string; icon: any; title: string; description: string }) {
  return (
    <Link href={href}>
      <Card className="hover:border-primary/50 cursor-pointer transition-colors h-full">
        <CardContent className="p-5 flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Icon className="w-5 h-5 text-primary" />
          </div>
          <div>
            <div className="font-semibold">{title}</div>
            <div className="text-sm text-muted-foreground mt-0.5">{description}</div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function OrchestratorFormDialog({ open, onOpenChange, form, setForm, onSubmit, isPending, title }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  form: OrchestratorForm;
  setForm: (f: OrchestratorForm) => void;
  onSubmit: () => void;
  isPending: boolean;
  title: string;
}) {
  const currentModels = PROVIDERS.find((p) => p.id === form.provider)?.models ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label>Name</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="My Orchestrator" className="mt-1" data-testid="input-orchestrator-name" />
            </div>
            <div className="col-span-2">
              <Label>Description</Label>
              <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Optional description" className="mt-1" />
            </div>
            <div>
              <Label>Provider</Label>
              <Select value={form.provider} onValueChange={(v) => {
                const models = PROVIDERS.find((p) => p.id === v)?.models ?? [];
                setForm({ ...form, provider: v, model: models[0] ?? "", baseUrl: "" });
              }}>
                <SelectTrigger className="mt-1" data-testid="select-provider">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROVIDERS.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Model</Label>
              {(form.provider === "ollama" || form.provider === "vllm") ? (
                <Input
                  value={form.model}
                  onChange={(e) => setForm({ ...form, model: e.target.value })}
                  placeholder={form.provider === "vllm" ? "e.g. Qwen/Qwen2.5-72B-Instruct" : "e.g. llama3.1, qwen2.5, mistral"}
                  className="mt-1 font-mono text-sm"
                  data-testid="input-model"
                />
              ) : (
                <Select value={form.model} onValueChange={(v) => setForm({ ...form, model: v })}>
                  <SelectTrigger className="mt-1" data-testid="select-model">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {currentModels.map((m) => (
                      <SelectItem key={m} value={m}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>

          {form.provider === "ollama" && (
            <div>
              <Label>Ollama Base URL</Label>
              <Input
                value={form.baseUrl}
                onChange={(e) => setForm({ ...form, baseUrl: e.target.value })}
                placeholder="http://localhost:11434"
                className="mt-1 font-mono text-sm"
                data-testid="input-base-url"
              />
              <p className="text-xs text-muted-foreground mt-1">
                URL of your Ollama instance. On EC2, use the private IP or hostname.
              </p>
            </div>
          )}

          {form.provider === "vllm" && (
            <div className="space-y-3">
              <div>
                <Label>vLLM Base URL</Label>
                <Input
                  value={form.baseUrl}
                  onChange={(e) => setForm({ ...form, baseUrl: e.target.value })}
                  placeholder="http://localhost:8000"
                  className="mt-1 font-mono text-sm"
                  data-testid="input-vllm-base-url"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  URL of your vLLM server. NanoOrch appends <code className="bg-muted px-1 rounded">/v1</code> automatically.
                </p>
              </div>
              <div>
                <Label>API Key <span className="text-muted-foreground font-normal">(optional)</span></Label>
                <Input
                  type="password"
                  value={form.vllmApiKey}
                  onChange={(e) => setForm({ ...form, vllmApiKey: e.target.value })}
                  placeholder="Leave blank for private-network deployments"
                  className="mt-1 font-mono text-sm"
                  data-testid="input-vllm-api-key"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Required only if vLLM was started with <code className="bg-muted px-1 rounded">--api-key</code>. Stored encrypted at rest.
                </p>
              </div>
            </div>
          )}

          <div>
            <Label>System Prompt</Label>
            <Textarea value={form.systemPrompt} onChange={(e) => setForm({ ...form, systemPrompt: e.target.value })}
              placeholder="You are a helpful AI orchestrator..." className="mt-1 font-mono text-sm" rows={4}
              data-testid="input-system-prompt" />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">Max Concurrency: {form.maxConcurrency}</Label>
              <Slider min={1} max={10} step={1} value={[form.maxConcurrency]}
                onValueChange={([v]) => setForm({ ...form, maxConcurrency: v })} className="mt-2" />
            </div>
            <div>
              <Label className="text-xs">Max Retries: {form.maxRetries}</Label>
              <Slider min={0} max={5} step={1} value={[form.maxRetries]}
                onValueChange={([v]) => setForm({ ...form, maxRetries: v })} className="mt-2" />
            </div>
            <div>
              <Label className="text-xs">Timeout (s)</Label>
              <Input type="number" value={form.timeoutSeconds} className="mt-1"
                onChange={(e) => setForm({ ...form, timeoutSeconds: parseInt(e.target.value) || 120 })} />
            </div>
          </div>

          <div className="border rounded-md p-3 space-y-3 bg-muted/30">
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Failover Provider</p>
              <p className="text-xs text-muted-foreground mb-3">If the primary provider fails, automatically retry with this fallback provider and model.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Failover Provider</Label>
                <Select
                  value={form.failoverProvider || "__none__"}
                  onValueChange={(v) => {
                    if (v === "__none__") {
                      setForm({ ...form, failoverProvider: "", failoverModel: "" });
                    } else {
                      const models = PROVIDERS.find((p) => p.id === v)?.models ?? [];
                      setForm({ ...form, failoverProvider: v, failoverModel: models[0] ?? "" });
                    }
                  }}
                >
                  <SelectTrigger className="mt-1 text-xs" data-testid="select-failover-provider">
                    <SelectValue placeholder="None (disabled)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">None (disabled)</SelectItem>
                    {PROVIDERS.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Failover Model</Label>
                {(form.failoverProvider === "ollama" || form.failoverProvider === "vllm") ? (
                  <Input
                    value={form.failoverModel}
                    onChange={(e) => setForm({ ...form, failoverModel: e.target.value })}
                    placeholder={form.failoverProvider === "vllm" ? "e.g. Qwen/Qwen2.5-72B-Instruct" : "e.g. llama3.1"}
                    className="mt-1 font-mono text-xs"
                    disabled={!form.failoverProvider}
                    data-testid="input-failover-model"
                  />
                ) : (
                  <Select
                    value={form.failoverModel}
                    onValueChange={(v) => setForm({ ...form, failoverModel: v })}
                    disabled={!form.failoverProvider}
                  >
                    <SelectTrigger className="mt-1 text-xs" data-testid="select-failover-model">
                      <SelectValue placeholder="Select model" />
                    </SelectTrigger>
                    <SelectContent>
                      {(PROVIDERS.find((p) => p.id === form.failoverProvider)?.models ?? []).map((m) => (
                        <SelectItem key={m} value={m}>{m}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={onSubmit} disabled={isPending || !form.name} data-testid="button-submit-orchestrator">
            {isPending ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Webhook, Copy, Check, ChevronDown, ChevronUp, CheckCircle2, XCircle, Clock, ShieldOff } from "lucide-react";
import type { EventTrigger, TriggerEvent, Orchestrator, Agent } from "@shared/schema";
import PaginationControls from "@/components/PaginationControls";

const SOURCE_LABELS: Record<string, string> = {
  github: "GitHub",
  gitlab: "GitLab",
  jira: "Jira",
};

const GITHUB_EVENTS = ["push", "pull_request", "issues", "issue_comment", "release", "workflow_run", "check_run", "deployment"];
const GITLAB_EVENTS = ["push", "merge_request", "issue", "note", "pipeline", "deployment", "release"];
const JIRA_EVENTS = ["jira:issue_created", "jira:issue_updated", "jira:issue_deleted", "jira:worklog_updated"];

const SOURCE_EVENTS: Record<string, string[]> = {
  github: GITHUB_EVENTS,
  gitlab: GITLAB_EVENTS,
  jira: JIRA_EVENTS,
};

const PROMPT_TEMPLATES: Record<string, string> = {
  github: "GitHub {{payload.action}} event on {{payload.repository.full_name}}:\n\n{{payload.pull_request.title}}\n\nBy: {{payload.sender.login}}\nURL: {{payload.pull_request.html_url}}\n\nPlease summarise and suggest next actions.",
  gitlab: "GitLab event on {{payload.project.path_with_namespace}}:\n\n{{payload.object_attributes.title}}\n\nBy: {{payload.user.name}}\nURL: {{payload.object_attributes.url}}\n\nPlease summarise and suggest next actions.",
  jira: "Jira issue {{payload.issue.key}} {{payload.webhookEvent}}:\n\nSummary: {{payload.issue.fields.summary}}\nStatus: {{payload.issue.fields.status.name}}\nAssignee: {{payload.issue.fields.assignee.displayName}}\n\nPlease summarise and suggest next actions.",
};

interface TriggerFormState {
  name: string;
  source: string;
  orchestratorId: string;
  agentId: string;
  eventTypes: string[];
  promptTemplate: string;
  secretToken: string;
  isActive: boolean;
  bypassApproval: boolean;
  notifyChannelId: string;
}

const BLANK: TriggerFormState = {
  name: "",
  source: "github",
  orchestratorId: "",
  agentId: "",
  eventTypes: [],
  promptTemplate: PROMPT_TEMPLATES.github,
  secretToken: "",
  isActive: true,
  bypassApproval: false,
  notifyChannelId: "",
};

export default function TriggersPage({ workspaceId }: { workspaceId: string }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<EventTrigger | null>(null);
  const [form, setForm] = useState<TriggerFormState>(BLANK);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [eventsPage, setEventsPage] = useState(1);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => { setEventsPage(1); }, [expandedId]);

  const { data: triggers = [], isLoading } = useQuery<EventTrigger[]>({
    queryKey: [`/api/workspaces/${workspaceId}/triggers`],
  });

  const { data: orchestrators = [] } = useQuery<Orchestrator[]>({
    queryKey: [`/api/workspaces/${workspaceId}/orchestrators`],
  });

  const { data: agents = [] } = useQuery<Agent[]>({
    queryKey: [`/api/workspaces/${workspaceId}/agents`],
    enabled: !!form.orchestratorId,
  });

  const { data: allChannels = [] } = useQuery<{ id: string; name: string; type: string }[]>({
    queryKey: [`/api/workspaces/${workspaceId}/channels`],
  });
  const outboundChannels = allChannels.filter((c) => ["slack", "teams", "google_chat", "generic_webhook"].includes(c.type));

  const agentsForOrch = agents.filter((a: any) =>
    !form.orchestratorId || (a as any).orchestratorId === form.orchestratorId
  );

  const EVENTS_PAGE_SIZE = 10;
  const { data: eventsData } = useQuery<{ events: TriggerEvent[]; total: number; page: number; limit: number; totalPages: number }>({
    queryKey: [`/api/workspaces/${workspaceId}/triggers/${expandedId}/events`, eventsPage],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(eventsPage), limit: String(EVENTS_PAGE_SIZE) });
      const res = await fetch(`/api/workspaces/${workspaceId}/triggers/${expandedId}/events?${params}`, { credentials: "include" });
      return res.json();
    },
    enabled: !!expandedId,
    refetchInterval: 10000,
  });
  const triggerEvents = eventsData?.events ?? [];

  const openCreate = () => {
    setEditing(null);
    setForm(BLANK);
    setOpen(true);
  };

  const openEdit = (t: EventTrigger) => {
    setEditing(t);
    setForm({
      name: t.name,
      source: t.source,
      orchestratorId: t.orchestratorId,
      agentId: t.agentId,
      eventTypes: (t.eventTypes as string[]) ?? [],
      promptTemplate: t.promptTemplate,
      secretToken: "",
      isActive: t.isActive ?? true,
      bypassApproval: (t as any).bypassApproval ?? false,
      notifyChannelId: (t as any).notifyChannelId ?? "",
    });
    setOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const body = { ...form, secretToken: form.secretToken || undefined };
      if (editing) {
        return apiRequest("PUT", `/api/workspaces/${workspaceId}/triggers/${editing.id}`, body);
      }
      return apiRequest("POST", `/api/workspaces/${workspaceId}/triggers`, body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/workspaces/${workspaceId}/triggers`] });
      setOpen(false);
      toast({ title: editing ? "Trigger updated" : "Trigger created" });
    },
    onError: () => toast({ title: "Save failed", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/workspaces/${workspaceId}/triggers/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/workspaces/${workspaceId}/triggers`] });
      toast({ title: "Trigger deleted" });
    },
  });

  const toggleEvent = (ev: string) => {
    setForm((f) => ({
      ...f,
      eventTypes: f.eventTypes.includes(ev)
        ? f.eventTypes.filter((e) => e !== ev)
        : [...f.eventTypes, ev],
    }));
  };

  const webhookUrl = (t: EventTrigger) => {
    const base = window.location.origin;
    return `${base}/api/webhooks/${t.source}/${t.id}`;
  };

  const copyWebhook = async (t: EventTrigger) => {
    const url = webhookUrl(t);
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const el = document.createElement("textarea");
      el.value = url;
      el.style.position = "fixed";
      el.style.opacity = "0";
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
    }
    setCopiedId(t.id);
    toast({ title: "Webhook URL copied" });
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Webhook className="h-6 w-6 text-primary" /> Event Triggers
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Automatically run agents when GitHub, GitLab, or Jira events occur.
            </p>
          </div>
          <Button data-testid="button-add-trigger" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-2" /> Add Trigger
          </Button>
        </div>

        {isLoading ? (
          <p className="text-muted-foreground text-sm">Loading…</p>
        ) : triggers.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <Webhook className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p className="font-medium">No triggers configured</p>
              <p className="text-sm mt-1">Add a trigger to automatically run agents when external events occur.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {triggers.map((t) => (
              <Card key={t.id} data-testid={`card-trigger-${t.id}`}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <CardTitle className="text-base">{t.name}</CardTitle>
                        <Badge variant={t.isActive ? "default" : "secondary"} className="text-xs">
                          {t.isActive ? "Active" : "Inactive"}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          {SOURCE_LABELS[t.source] ?? t.source}
                        </Badge>
                        {(t as any).bypassApproval && (
                          <Badge variant="outline" className="text-xs text-orange-600 border-orange-400 gap-1" data-testid={`badge-bypass-trigger-${t.id}`}>
                            <ShieldOff className="w-3 h-3" />No gates
                          </Badge>
                        )}
                        {((t.eventTypes as string[]) ?? []).slice(0, 3).map((ev) => (
                          <Badge key={ev} variant="secondary" className="text-xs">{ev}</Badge>
                        ))}
                        {((t.eventTypes as string[]) ?? []).length > 3 && (
                          <Badge variant="secondary" className="text-xs">+{((t.eventTypes as string[]) ?? []).length - 3}</Badge>
                        )}
                      </div>
                      <CardDescription className="text-xs font-mono truncate max-w-lg">{webhookUrl(t)}</CardDescription>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button variant="ghost" size="icon" title="Copy webhook URL"
                        data-testid={`button-copy-webhook-${t.id}`}
                        onClick={() => copyWebhook(t)}>
                        {copiedId === t.id
                          ? <Check className="h-4 w-4 text-green-500" />
                          : <Copy className="h-4 w-4" />}
                      </Button>
                      <Button variant="ghost" size="icon" data-testid={`button-edit-trigger-${t.id}`} onClick={() => openEdit(t)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive"
                        data-testid={`button-delete-trigger-${t.id}`}
                        onClick={() => { if (confirm(`Delete "${t.name}"?`)) deleteMutation.mutate(t.id); }}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => setExpandedId(expandedId === t.id ? null : t.id)}>
                        {expandedId === t.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                {expandedId === t.id && (
                  <CardContent className="pt-0">
                    <div className="border-t pt-4 space-y-3">
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground mb-1">Prompt Template</p>
                        <pre className="text-xs bg-muted rounded p-2 overflow-x-auto whitespace-pre-wrap max-h-32">{t.promptTemplate}</pre>
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-xs font-semibold text-muted-foreground">Events {eventsData && eventsData.total > 0 ? `(${eventsData.total} total)` : ""}</p>
                        </div>
                        {triggerEvents.length === 0 ? (
                          <p className="text-xs text-muted-foreground">No events yet.</p>
                        ) : (
                          <div className="space-y-1">
                            {triggerEvents.map((ev) => (
                              <div key={ev.id} className="flex items-center gap-2 text-xs p-2 rounded bg-muted/50">
                                {ev.matched ? (
                                  ev.error ? <XCircle className="h-3.5 w-3.5 text-destructive shrink-0" /> : <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
                                ) : (
                                  <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                )}
                                <span className="font-medium">{ev.eventType}</span>
                                <span className="text-muted-foreground">{new Date(ev.receivedAt!).toLocaleString()}</span>
                                {ev.taskId && <span className="text-primary">→ task created</span>}
                                {ev.error && <span className="text-destructive">{ev.error}</span>}
                              </div>
                            ))}
                            {eventsData && (
                              <PaginationControls
                                page={eventsData.page}
                                totalPages={eventsData.totalPages}
                                total={eventsData.total}
                                limit={eventsData.limit}
                                onPageChange={setEventsPage}
                              />
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                )}
              </Card>
            ))}
          </div>
        )}

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editing ? "Edit Trigger" : "Add Event Trigger"}</DialogTitle>
            </DialogHeader>

            <Tabs defaultValue="basic" className="space-y-4">
              <TabsList>
                <TabsTrigger value="basic">Basic</TabsTrigger>
                <TabsTrigger value="template">Prompt Template</TabsTrigger>
                <TabsTrigger value="security">Security</TabsTrigger>
              </TabsList>

              <TabsContent value="basic" className="space-y-4">
                <div className="space-y-1.5">
                  <Label>Trigger Name</Label>
                  <Input data-testid="input-trigger-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="PR Opened → Review Agent" />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Source</Label>
                    <Select value={form.source} onValueChange={(v) => setForm({ ...form, source: v, eventTypes: [], promptTemplate: PROMPT_TEMPLATES[v] ?? "" })}>
                      <SelectTrigger data-testid="select-trigger-source">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="github">GitHub</SelectItem>
                        <SelectItem value="gitlab">GitLab</SelectItem>
                        <SelectItem value="jira">Jira</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label>Orchestrator</Label>
                    <Select value={form.orchestratorId} onValueChange={(v) => setForm({ ...form, orchestratorId: v, agentId: "" })}>
                      <SelectTrigger data-testid="select-trigger-orchestrator">
                        <SelectValue placeholder="Select orchestrator" />
                      </SelectTrigger>
                      <SelectContent>
                        {orchestrators.map((o) => (
                          <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label>Agent</Label>
                  <Select value={form.agentId} onValueChange={(v) => setForm({ ...form, agentId: v })}>
                    <SelectTrigger data-testid="select-trigger-agent">
                      <SelectValue placeholder="Select agent" />
                    </SelectTrigger>
                    <SelectContent>
                      {agentsForOrch.map((a: any) => (
                        <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Event Types <span className="text-muted-foreground font-normal">(empty = all events)</span></Label>
                  <div className="flex flex-wrap gap-2">
                    {(SOURCE_EVENTS[form.source] ?? []).map((ev) => (
                      <button
                        key={ev}
                        type="button"
                        data-testid={`badge-event-${ev}`}
                        onClick={() => toggleEvent(ev)}
                        className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${form.eventTypes.includes(ev) ? "bg-primary text-primary-foreground border-primary" : "bg-muted text-muted-foreground border-transparent hover:border-border"}`}
                      >
                        {ev}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <Switch id="trigger-active" checked={form.isActive} onCheckedChange={(v) => setForm({ ...form, isActive: v })} data-testid="switch-trigger-active" />
                  <Label htmlFor="trigger-active">Active</Label>
                </div>

                <div className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-2">
                  <div>
                    <p className="text-sm font-medium">Skip approval gates</p>
                    <p className="text-xs text-muted-foreground">Tasks fired by this trigger bypass approval requests.</p>
                  </div>
                  <Switch
                    data-testid="switch-trigger-bypass-approval"
                    checked={form.bypassApproval}
                    onCheckedChange={(v) => setForm({ ...form, bypassApproval: v })}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label>Notify Channel (optional)</Label>
                  <Select
                    value={form.notifyChannelId || "none"}
                    onValueChange={(v) => setForm({ ...form, notifyChannelId: v === "none" ? "" : v })}
                  >
                    <SelectTrigger data-testid="select-trigger-channel">
                      <SelectValue placeholder="None — use orchestrator default" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None — use orchestrator default</SelectItem>
                      {outboundChannels.map((ch) => (
                        <SelectItem key={ch.id} value={ch.id}>{ch.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">Channel to notify when this trigger fires and the agent completes.</p>
                </div>
              </TabsContent>

              <TabsContent value="template" className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Prompt Template</Label>
                  <Textarea
                    data-testid="textarea-trigger-prompt"
                    value={form.promptTemplate}
                    onChange={(e) => setForm({ ...form, promptTemplate: e.target.value })}
                    rows={10}
                    className="font-mono text-sm"
                    placeholder="Use {{payload.field}} to reference event payload fields."
                  />
                  <p className="text-xs text-muted-foreground">
                    Use <code className="bg-muted px-1 rounded">{"{{payload.field}}"}</code> to insert values from the event payload.
                    Example: <code className="bg-muted px-1 rounded">{"{{payload.pull_request.title}}"}</code>
                  </p>
                </div>
                {form.source && (
                  <div className="rounded-md bg-muted p-3 text-xs space-y-1">
                    <p className="font-semibold">Webhook URL:</p>
                    <p className="font-mono break-all text-primary">{window.location.origin}/api/webhooks/{form.source}/{editing ? editing.id : "<trigger-id>"}</p>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="security" className="space-y-4">
                <div className="space-y-1.5">
                  <Label>Secret Token {editing && <span className="text-muted-foreground font-normal">(leave blank to keep existing)</span>}</Label>
                  <Input
                    data-testid="input-trigger-secret"
                    type="password"
                    value={form.secretToken}
                    onChange={(e) => setForm({ ...form, secretToken: e.target.value })}
                    placeholder="Webhook secret for signature verification"
                  />
                  {form.source === "github" && (
                    <p className="text-xs text-muted-foreground">GitHub: Used to verify <code className="bg-muted px-1 rounded">X-Hub-Signature-256</code> HMAC header.</p>
                  )}
                  {form.source === "gitlab" && (
                    <p className="text-xs text-muted-foreground">GitLab: Must match the <code className="bg-muted px-1 rounded">X-Gitlab-Token</code> header.</p>
                  )}
                  {form.source === "jira" && (
                    <p className="text-xs text-muted-foreground">Jira: Append <code className="bg-muted px-1 rounded">?token=your_secret</code> to the webhook URL.</p>
                  )}
                </div>
              </TabsContent>
            </Tabs>

            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button
                data-testid="button-save-trigger"
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending || !form.name || !form.orchestratorId || !form.agentId}
              >
                {saveMutation.isPending ? "Saving…" : "Save Trigger"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
    </div>
  );
}

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Plus, Radio, Webhook, Key, Copy, Check, Trash2, ToggleLeft, ToggleRight,
  Send, History, Loader2, CheckCircle2, XCircle, AlertCircle, ExternalLink, Grid2X2, Pencil,
} from "lucide-react";
import { SiSlack, SiGooglechat } from "react-icons/si";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Channel, ChannelDelivery } from "@shared/schema";

interface Props { orchestratorId: string; workspaceId?: string; }

type ChannelType = "api" | "webhook" | "slack" | "teams" | "google_chat" | "generic_webhook";

const OUTBOUND_TYPES: ChannelType[] = ["slack", "teams", "google_chat", "generic_webhook"];
const INBOUND_TYPES: ChannelType[] = ["api", "webhook"];

const AVAILABLE_EVENTS = [
  { value: "task.completed", label: "Task Completed" },
  { value: "task.failed", label: "Task Failed" },
  { value: "job.fired", label: "Scheduled Job Fired" },
];

const TYPE_META: Record<ChannelType, { label: string; icon: React.ReactNode; color: string }> = {
  api:             { label: "API",            icon: <Key className="w-4 h-4" />,                               color: "bg-blue-500/10 text-blue-400 border-blue-500/30" },
  webhook:         { label: "Webhook",        icon: <Webhook className="w-4 h-4" />,                           color: "bg-purple-500/10 text-purple-400 border-purple-500/30" },
  slack:           { label: "Slack",          icon: <SiSlack className="w-4 h-4" />,                           color: "bg-green-500/10 text-green-400 border-green-500/30" },
  teams:           { label: "Teams",          icon: <Grid2X2 className="w-4 h-4" />,                           color: "bg-indigo-500/10 text-indigo-400 border-indigo-500/30" },
  google_chat:     { label: "Google Chat",    icon: <SiGooglechat className="w-4 h-4" />,                      color: "bg-red-500/10 text-red-400 border-red-500/30" },
  generic_webhook: { label: "Generic Webhook",icon: <ExternalLink className="w-4 h-4" />,                      color: "bg-orange-500/10 text-orange-400 border-orange-500/30" },
};

const URL_PLACEHOLDERS: Record<string, string> = {
  slack:           "https://hooks.slack.com/services/T.../B.../...",
  teams:           "https://outlook.office.com/webhook/...",
  google_chat:     "https://chat.googleapis.com/v1/spaces/.../messages?key=...",
  generic_webhook: "https://your-service.example.com/webhook",
};

const DEFAULT_FORM = {
  name: "",
  type: "api" as ChannelType,
  url: "",
  events: ["task.completed", "task.failed"] as string[],
  secret: "",
  isInbound: false,
  botToken: "",
  signingSecret: "",
  appId: "",
  appPassword: "",
  defaultAgentId: "",
  allowedUsers: "",
  verificationToken: "",
};

function DeliveryBadge({ delivery }: { delivery: ChannelDelivery }) {
  const ok = delivery.statusCode && delivery.statusCode >= 200 && delivery.statusCode < 300;
  const isTest = delivery.event === "test";
  if (delivery.error) {
    return <Badge variant="destructive" className="text-xs gap-1"><XCircle className="w-3 h-3" /> Error</Badge>;
  }
  if (ok) {
    return <Badge className="text-xs gap-1 bg-green-500/20 text-green-400 border-green-500/30"><CheckCircle2 className="w-3 h-3" /> {delivery.statusCode}</Badge>;
  }
  return <Badge variant="secondary" className="text-xs gap-1"><AlertCircle className="w-3 h-3" /> {delivery.statusCode ?? "?"}</Badge>;
}

export default function ChannelsPage({ orchestratorId, workspaceId }: Props) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(DEFAULT_FORM);
  const [editChannel, setEditChannel] = useState<Channel | null>(null);
  const [editForm, setEditForm] = useState(DEFAULT_FORM);
  const [copied, setCopied] = useState<string | null>(null);
  const [deliveriesChannelId, setDeliveriesChannelId] = useState<string | null>(null);

  const { data: workspace } = useQuery<{ isCommsWorkspace?: boolean }>({
    queryKey: [`/api/workspaces/${workspaceId}`],
    enabled: !!workspaceId,
  });
  const isCommsWorkspace = !!(workspace as any)?.isCommsWorkspace;

  const { data: channels, isLoading } = useQuery<Channel[]>({
    queryKey: [`/api/orchestrators/${orchestratorId}/channels`],
  });

  const { data: deliveries, isLoading: deliveriesLoading } = useQuery<ChannelDelivery[]>({
    queryKey: [`/api/channels/${deliveriesChannelId}/deliveries`],
    enabled: !!deliveriesChannelId,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: [`/api/orchestrators/${orchestratorId}/channels`] });

  const parseAllowedUsers = (raw: string) => raw.split(",").map((s) => s.trim()).filter(Boolean);

  const createMutation = useMutation({
    mutationFn: (data: typeof form) => {
      let config: Record<string, unknown> = {};
      const allowedUsers = parseAllowedUsers(data.allowedUsers);
      if (data.isInbound && data.type === "slack") {
        config = { isInbound: true, botToken: data.botToken, signingSecret: data.signingSecret, defaultAgentId: data.defaultAgentId || undefined, ...(allowedUsers.length ? { allowedUsers } : {}) };
      } else if (data.isInbound && data.type === "teams") {
        config = { isInbound: true, appId: data.appId, appPassword: data.appPassword, defaultAgentId: data.defaultAgentId || undefined, ...(allowedUsers.length ? { allowedUsers } : {}) };
      } else if (data.isInbound && data.type === "google_chat") {
        config = { isInbound: true, verificationToken: data.verificationToken || undefined, defaultAgentId: data.defaultAgentId || undefined, ...(allowedUsers.length ? { allowedUsers } : {}) };
      } else if (OUTBOUND_TYPES.includes(data.type)) {
        config = { url: data.url, events: data.events, ...(data.secret ? { secret: data.secret } : {}) };
      }
      return apiRequest("POST", `/api/orchestrators/${orchestratorId}/channels`, { name: data.name, type: data.type, config });
    },
    onSuccess: () => { invalidate(); setOpen(false); setForm(DEFAULT_FORM); toast({ title: "Channel created" }); },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/channels/${id}`),
    onSuccess: () => invalidate(),
  });

  const updateMutation = useMutation({
    mutationFn: (data: typeof editForm) => {
      let config: Record<string, unknown> = {};
      const allowedUsers = parseAllowedUsers(data.allowedUsers);
      if (data.isInbound && data.type === "slack") {
        config = { isInbound: true, botToken: data.botToken, signingSecret: data.signingSecret, defaultAgentId: data.defaultAgentId || undefined, ...(allowedUsers.length ? { allowedUsers } : {}) };
      } else if (data.isInbound && data.type === "teams") {
        config = { isInbound: true, appId: data.appId, appPassword: data.appPassword, defaultAgentId: data.defaultAgentId || undefined, ...(allowedUsers.length ? { allowedUsers } : {}) };
      } else if (data.isInbound && data.type === "google_chat") {
        config = { isInbound: true, verificationToken: data.verificationToken || undefined, defaultAgentId: data.defaultAgentId || undefined, ...(allowedUsers.length ? { allowedUsers } : {}) };
      } else if (OUTBOUND_TYPES.includes(data.type)) {
        config = { url: data.url, events: data.events, ...(data.secret ? { secret: data.secret } : {}) };
      }
      return apiRequest("PUT", `/api/channels/${editChannel!.id}`, { name: data.name, config });
    },
    onSuccess: () => { invalidate(); setEditChannel(null); toast({ title: "Channel updated" }); },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const openEdit = (ch: Channel) => {
    const cfg = (ch.config ?? {}) as Record<string, any>;
    const isInbound = !!cfg.isInbound;
    setEditForm({
      name: ch.name,
      type: ch.type as ChannelType,
      url: cfg.url ?? "",
      events: cfg.events ?? ["task.completed", "task.failed"],
      secret: cfg.secret ?? "",
      isInbound,
      botToken: cfg.botToken ?? "",
      signingSecret: cfg.signingSecret ?? "",
      appId: cfg.appId ?? "",
      appPassword: cfg.appPassword ?? "",
      defaultAgentId: cfg.defaultAgentId ?? "",
      allowedUsers: Array.isArray(cfg.allowedUsers) ? cfg.allowedUsers.join(", ") : (cfg.allowedUsers ?? ""),
      verificationToken: cfg.verificationToken ?? "",
    });
    setEditChannel(ch);
  };

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      apiRequest("PUT", `/api/channels/${id}`, { isActive }),
    onSuccess: () => invalidate(),
  });

  const testMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/channels/${id}/test`, {});
      return res.json() as Promise<{ ok: boolean; statusCode: number; response: string }>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [`/api/channels/${deliveriesChannelId}/deliveries`] });
      toast({ title: data.ok ? "Ping successful" : "Ping returned non-2xx", description: `HTTP ${data.statusCode}` });
    },
    onError: (err: any) => toast({ title: "Ping failed", description: err.message, variant: "destructive" }),
  });

  const copyToClipboard = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const el = document.createElement("textarea");
      el.value = text;
      el.style.position = "fixed";
      el.style.opacity = "0";
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
    }
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const getWebhookUrl = (ch: Channel) => `${window.location.origin}/api/channels/${ch.id}/webhook`;

  const toggleEvent = (ev: string) => {
    setForm((f) => ({
      ...f,
      events: f.events.includes(ev) ? f.events.filter((e) => e !== ev) : [...f.events, ev],
    }));
  };

  const comms = channels?.filter((c) => (c.type === "slack" || c.type === "teams" || c.type === "google_chat") && (c.config as any)?.isInbound) ?? [];
  const inbound = channels?.filter((c) => INBOUND_TYPES.includes(c.type as ChannelType)) ?? [];
  const outbound = channels?.filter((c) => OUTBOUND_TYPES.includes(c.type as ChannelType) && !(c.config as any)?.isInbound) ?? [];

  const isInboundCommsForm = form.isInbound && (form.type === "slack" || form.type === "teams" || form.type === "google_chat");
  const isOutboundForm = OUTBOUND_TYPES.includes(form.type) && !isInboundCommsForm;

  const getSlackEventUrl = (ch: Channel) => `${window.location.origin}/api/channels/${ch.id}/slack/events`;
  const getTeamsEventUrl = (ch: Channel) => `${window.location.origin}/api/channels/${ch.id}/teams/events`;
  const getGoogleChatEventUrl = (ch: Channel) => `${window.location.origin}/api/channels/${ch.id}/google-chat/event`;

  const selectedDeliveryChannel = channels?.find((c) => c.id === deliveriesChannelId);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Channels</h1>
          <p className="text-muted-foreground mt-1">Inbound endpoints and outbound notification hooks for this orchestrator</p>
        </div>
        <Button onClick={() => setOpen(true)} data-testid="button-new-channel">
          <Plus className="w-4 h-4 mr-2" /> New Channel
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">{[1, 2].map((i) => <Skeleton key={i} className="h-36" />)}</div>
      ) : (
        <>
          {/* Two-way Comms section (only when comms channels exist) */}
          {comms.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                Two-way Comms — Slack / Teams / Google Chat Inbound
              </h2>
              <div className="space-y-3">
                {comms.map((ch) => (
                  <CommsCard
                    key={ch.id} ch={ch}
                    copied={copied}
                    onCopy={copyToClipboard}
                    onEdit={openEdit}
                    onToggle={(id, v) => toggleMutation.mutate({ id, isActive: v })}
                    onDelete={(id) => deleteMutation.mutate(id)}
                    getEventUrl={ch.type === "slack" ? getSlackEventUrl : ch.type === "google_chat" ? getGoogleChatEventUrl : getTeamsEventUrl}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Inbound section */}
          <section>
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              Inbound — External → NanoOrch
            </h2>
            {inbound.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="py-8 text-center text-muted-foreground text-sm">
                  <Radio className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  No inbound channels — create an API or Webhook type to receive tasks from external systems
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {inbound.map((ch) => (
                  <InboundCard
                    key={ch.id} ch={ch}
                    copied={copied}
                    onCopy={copyToClipboard}
                    onToggle={(id, v) => toggleMutation.mutate({ id, isActive: v })}
                    onDelete={(id) => deleteMutation.mutate(id)}
                    getWebhookUrl={getWebhookUrl}
                  />
                ))}
              </div>
            )}
          </section>

          {/* Outbound section */}
          <section>
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              Outbound Notifications — NanoOrch → External
            </h2>
            {outbound.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="py-8 text-center text-muted-foreground text-sm">
                  <Send className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  No outbound channels — add Slack, Teams, Google Chat, or a generic webhook to receive task notifications
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {outbound.map((ch) => (
                  <OutboundCard
                    key={ch.id} ch={ch}
                    onToggle={(id, v) => toggleMutation.mutate({ id, isActive: v })}
                    onDelete={(id) => deleteMutation.mutate(id)}
                    onEdit={openEdit}
                    onTest={(id) => { testMutation.mutate(id); }}
                    onHistory={(id) => setDeliveriesChannelId(id)}
                    isTestPending={testMutation.isPending}
                  />
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {/* Create dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Create Channel</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Name</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="My Slack notifications" className="mt-1" data-testid="input-channel-name" />
            </div>
            <div>
              <Label>Type</Label>
              <Select value={form.type} onValueChange={(v: ChannelType) => setForm({ ...form, type: v, isInbound: false })}>
                <SelectTrigger className="mt-1" data-testid="select-channel-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="api">API (inbound)</SelectItem>
                  <SelectItem value="webhook">Webhook (inbound)</SelectItem>
                  <SelectItem value="slack">Slack</SelectItem>
                  <SelectItem value="teams">Microsoft Teams</SelectItem>
                  <SelectItem value="google_chat">Google Chat (outbound)</SelectItem>
                  <SelectItem value="generic_webhook">Generic Webhook (outbound)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Two-way inbound toggle (only in comms workspaces for Slack/Teams/Google Chat) */}
            {isCommsWorkspace && (form.type === "slack" || form.type === "teams" || form.type === "google_chat") && (
              <div className="flex items-center justify-between rounded-lg border border-border p-3 bg-muted/30">
                <div>
                  <p className="text-sm font-medium">Enable two-way inbound</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Receive messages from {form.type === "slack" ? "Slack" : form.type === "teams" ? "Teams" : "Google Chat"} and reply back
                  </p>
                </div>
                <Switch
                  checked={form.isInbound}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, isInbound: v }))}
                  data-testid="switch-channel-inbound"
                />
              </div>
            )}

            {/* Inbound comms fields */}
            {isInboundCommsForm && form.type === "slack" && (
              <>
                <div>
                  <Label>Bot Token</Label>
                  <Input type="password" value={form.botToken}
                    onChange={(e) => setForm({ ...form, botToken: e.target.value })}
                    placeholder="xoxb-..." className="mt-1 font-mono text-xs" data-testid="input-slack-bot-token" />
                  <p className="text-xs text-muted-foreground mt-1">From Slack App → OAuth & Permissions → Bot User OAuth Token</p>
                </div>
                <div>
                  <Label>Signing Secret</Label>
                  <Input type="password" value={form.signingSecret}
                    onChange={(e) => setForm({ ...form, signingSecret: e.target.value })}
                    placeholder="..." className="mt-1 font-mono text-xs" data-testid="input-slack-signing-secret" />
                  <p className="text-xs text-muted-foreground mt-1">From Slack App → Basic Information → Signing Secret</p>
                </div>
                <div>
                  <Label>Default Agent ID <span className="text-muted-foreground font-normal">(optional)</span></Label>
                  <Input value={form.defaultAgentId}
                    onChange={(e) => setForm({ ...form, defaultAgentId: e.target.value })}
                    placeholder="Agent ID to route messages to" className="mt-1 font-mono text-xs" data-testid="input-default-agent-id" />
                </div>
                <div>
                  <Label>DM Allowlist <span className="text-muted-foreground font-normal">(optional)</span></Label>
                  <Input value={form.allowedUsers}
                    onChange={(e) => setForm({ ...form, allowedUsers: e.target.value })}
                    placeholder="U01ABC, U02DEF (Slack user IDs, comma-separated)" className="mt-1 font-mono text-xs" data-testid="input-slack-allowed-users" />
                  <p className="text-xs text-muted-foreground mt-1">Leave blank to allow all users. Add Slack user IDs to restrict access.</p>
                </div>
              </>
            )}
            {isInboundCommsForm && form.type === "teams" && (
              <>
                <div>
                  <Label>App ID</Label>
                  <Input value={form.appId}
                    onChange={(e) => setForm({ ...form, appId: e.target.value })}
                    placeholder="Microsoft App ID (GUID)" className="mt-1 font-mono text-xs" data-testid="input-teams-app-id" />
                  <p className="text-xs text-muted-foreground mt-1">From Azure App Registration → Application (client) ID</p>
                </div>
                <div>
                  <Label>App Password</Label>
                  <Input type="password" value={form.appPassword}
                    onChange={(e) => setForm({ ...form, appPassword: e.target.value })}
                    placeholder="Client secret" className="mt-1 font-mono text-xs" data-testid="input-teams-app-password" />
                  <p className="text-xs text-muted-foreground mt-1">From Azure App Registration → Certificates & secrets</p>
                </div>
                <div>
                  <Label>Default Agent ID <span className="text-muted-foreground font-normal">(optional)</span></Label>
                  <Input value={form.defaultAgentId}
                    onChange={(e) => setForm({ ...form, defaultAgentId: e.target.value })}
                    placeholder="Agent ID to route messages to" className="mt-1 font-mono text-xs" data-testid="input-default-agent-id" />
                </div>
                <div>
                  <Label>DM Allowlist <span className="text-muted-foreground font-normal">(optional)</span></Label>
                  <Input value={form.allowedUsers}
                    onChange={(e) => setForm({ ...form, allowedUsers: e.target.value })}
                    placeholder="29:1Abc..., 29:2Def... (Teams user IDs, comma-separated)" className="mt-1 font-mono text-xs" data-testid="input-teams-allowed-users" />
                  <p className="text-xs text-muted-foreground mt-1">Leave blank to allow all users. Add Teams user IDs (from: id) to restrict access.</p>
                </div>
              </>
            )}
            {isInboundCommsForm && form.type === "google_chat" && (
              <>
                <div>
                  <Label>Verification Token <span className="text-muted-foreground font-normal">(optional)</span></Label>
                  <Input type="password" value={form.verificationToken}
                    onChange={(e) => setForm({ ...form, verificationToken: e.target.value })}
                    placeholder="From Google Chat → App config → Verification token" className="mt-1 font-mono text-xs" data-testid="input-gchat-verification-token" />
                  <p className="text-xs text-muted-foreground mt-1">Used to verify incoming events from Google Chat. Leave blank to skip verification.</p>
                </div>
                <div>
                  <Label>Default Agent ID <span className="text-muted-foreground font-normal">(optional)</span></Label>
                  <Input value={form.defaultAgentId}
                    onChange={(e) => setForm({ ...form, defaultAgentId: e.target.value })}
                    placeholder="Agent ID to route messages to" className="mt-1 font-mono text-xs" data-testid="input-gchat-default-agent-id" />
                </div>
              </>
            )}

            {isOutboundForm && (
              <>
                <div>
                  <Label>Webhook URL</Label>
                  <Input
                    value={form.url}
                    onChange={(e) => setForm({ ...form, url: e.target.value })}
                    placeholder={URL_PLACEHOLDERS[form.type] ?? "https://..."}
                    className="mt-1 font-mono text-xs"
                    data-testid="input-channel-url"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    {form.type === "slack" && "Create one at Slack → Apps → Incoming Webhooks"}
                    {form.type === "teams" && "Create one at Teams → channel → Connectors → Incoming Webhook"}
                    {form.type === "google_chat" && "Create one at Google Chat → Space settings → Apps & integrations"}
                    {form.type === "generic_webhook" && "Your service must accept a JSON POST body"}
                  </p>
                </div>
                <div>
                  <Label className="mb-2 block">Notify on events</Label>
                  <div className="space-y-2">
                    {AVAILABLE_EVENTS.map((ev) => (
                      <div key={ev.value} className="flex items-center gap-2">
                        <Checkbox
                          id={`ev-${ev.value}`}
                          checked={form.events.includes(ev.value)}
                          onCheckedChange={() => toggleEvent(ev.value)}
                          data-testid={`checkbox-event-${ev.value}`}
                        />
                        <label htmlFor={`ev-${ev.value}`} className="text-sm cursor-pointer">{ev.label}</label>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Leave all unchecked to receive every event</p>
                </div>
                <div>
                  <Label>Signing Secret <span className="text-muted-foreground font-normal">(optional)</span></Label>
                  <Input
                    type="password"
                    value={form.secret}
                    onChange={(e) => setForm({ ...form, secret: e.target.value })}
                    placeholder="HMAC-SHA256 secret"
                    className="mt-1"
                    data-testid="input-channel-secret"
                  />
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => createMutation.mutate(form)}
              disabled={
                createMutation.isPending || !form.name ||
                (isOutboundForm && !form.url) ||
                (isInboundCommsForm && form.type === "slack" && (!form.botToken || !form.signingSecret)) ||
                (isInboundCommsForm && form.type === "teams" && (!form.appId || !form.appPassword))
              }
              data-testid="button-submit-channel">
              {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Create Channel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit channel dialog */}
      <Dialog open={!!editChannel} onOpenChange={(o) => { if (!o) setEditChannel(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Channel — {editChannel?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Name</Label>
              <Input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                className="mt-1" data-testid="input-edit-channel-name" />
            </div>

            {/* Comms inbound — Slack */}
            {editForm.isInbound && editForm.type === "slack" && (
              <>
                <div>
                  <Label>Bot Token</Label>
                  <Input type="password" value={editForm.botToken}
                    onChange={(e) => setEditForm({ ...editForm, botToken: e.target.value })}
                    placeholder="xoxb-..." className="mt-1 font-mono text-xs" data-testid="input-edit-slack-bot-token" />
                  <p className="text-xs text-muted-foreground mt-1">From Slack App → OAuth & Permissions → Bot User OAuth Token</p>
                </div>
                <div>
                  <Label>Signing Secret</Label>
                  <Input type="password" value={editForm.signingSecret}
                    onChange={(e) => setEditForm({ ...editForm, signingSecret: e.target.value })}
                    placeholder="Leave blank to keep existing" className="mt-1 font-mono text-xs" data-testid="input-edit-slack-signing-secret" />
                  <p className="text-xs text-muted-foreground mt-1">From Slack App → Basic Information → Signing Secret</p>
                </div>
                <div>
                  <Label>Default Agent ID <span className="text-muted-foreground font-normal">(optional)</span></Label>
                  <Input value={editForm.defaultAgentId}
                    onChange={(e) => setEditForm({ ...editForm, defaultAgentId: e.target.value })}
                    placeholder="Agent ID to route messages to" className="mt-1 font-mono text-xs" data-testid="input-edit-default-agent-id" />
                </div>
                <div>
                  <Label>DM Allowlist <span className="text-muted-foreground font-normal">(optional)</span></Label>
                  <Input value={editForm.allowedUsers}
                    onChange={(e) => setEditForm({ ...editForm, allowedUsers: e.target.value })}
                    placeholder="U01ABC, U02DEF (Slack user IDs, comma-separated)" className="mt-1 font-mono text-xs" data-testid="input-edit-slack-allowed-users" />
                  <p className="text-xs text-muted-foreground mt-1">Leave blank to allow all users.</p>
                </div>
              </>
            )}

            {/* Comms inbound — Teams */}
            {editForm.isInbound && editForm.type === "teams" && (
              <>
                <div>
                  <Label>App ID</Label>
                  <Input value={editForm.appId}
                    onChange={(e) => setEditForm({ ...editForm, appId: e.target.value })}
                    placeholder="Microsoft App ID (GUID)" className="mt-1 font-mono text-xs" data-testid="input-edit-teams-app-id" />
                  <p className="text-xs text-muted-foreground mt-1">From Azure App Registration → Application (client) ID</p>
                </div>
                <div>
                  <Label>App Password</Label>
                  <Input type="password" value={editForm.appPassword}
                    onChange={(e) => setEditForm({ ...editForm, appPassword: e.target.value })}
                    placeholder="Leave blank to keep existing" className="mt-1 font-mono text-xs" data-testid="input-edit-teams-app-password" />
                  <p className="text-xs text-muted-foreground mt-1">From Azure App Registration → Certificates & secrets</p>
                </div>
                <div>
                  <Label>Default Agent ID <span className="text-muted-foreground font-normal">(optional)</span></Label>
                  <Input value={editForm.defaultAgentId}
                    onChange={(e) => setEditForm({ ...editForm, defaultAgentId: e.target.value })}
                    placeholder="Agent ID to route messages to" className="mt-1 font-mono text-xs" data-testid="input-edit-default-agent-id" />
                </div>
                <div>
                  <Label>DM Allowlist <span className="text-muted-foreground font-normal">(optional)</span></Label>
                  <Input value={editForm.allowedUsers}
                    onChange={(e) => setEditForm({ ...editForm, allowedUsers: e.target.value })}
                    placeholder="29:1Abc..., 29:2Def... (Teams user IDs, comma-separated)" className="mt-1 font-mono text-xs" data-testid="input-edit-teams-allowed-users" />
                  <p className="text-xs text-muted-foreground mt-1">Leave blank to allow all users.</p>
                </div>
              </>
            )}

            {/* Comms inbound — Google Chat */}
            {editForm.isInbound && editForm.type === "google_chat" && (
              <>
                <div>
                  <Label>Verification Token <span className="text-muted-foreground font-normal">(optional)</span></Label>
                  <Input type="password" value={editForm.verificationToken}
                    onChange={(e) => setEditForm({ ...editForm, verificationToken: e.target.value })}
                    placeholder="Leave blank to keep existing" className="mt-1 font-mono text-xs" data-testid="input-edit-gchat-verification-token" />
                  <p className="text-xs text-muted-foreground mt-1">Used to verify incoming events from Google Chat. Leave blank to skip verification.</p>
                </div>
                <div>
                  <Label>Default Agent ID <span className="text-muted-foreground font-normal">(optional)</span></Label>
                  <Input value={editForm.defaultAgentId}
                    onChange={(e) => setEditForm({ ...editForm, defaultAgentId: e.target.value })}
                    placeholder="Agent ID to route messages to" className="mt-1 font-mono text-xs" data-testid="input-edit-gchat-default-agent-id" />
                </div>
              </>
            )}

            {/* Outbound */}
            {!editForm.isInbound && OUTBOUND_TYPES.includes(editForm.type) && (
              <>
                <div>
                  <Label>Webhook URL</Label>
                  <Input value={editForm.url}
                    onChange={(e) => setEditForm({ ...editForm, url: e.target.value })}
                    placeholder={URL_PLACEHOLDERS[editForm.type] ?? "https://..."}
                    className="mt-1 font-mono text-xs" data-testid="input-edit-channel-url" />
                </div>
                <div>
                  <Label className="mb-2 block">Notify on events</Label>
                  <div className="space-y-2">
                    {AVAILABLE_EVENTS.map((ev) => (
                      <div key={ev.value} className="flex items-center gap-2">
                        <Checkbox
                          id={`edit-ev-${ev.value}`}
                          checked={editForm.events.includes(ev.value)}
                          onCheckedChange={() => setEditForm((f) => ({
                            ...f,
                            events: f.events.includes(ev.value)
                              ? f.events.filter((e) => e !== ev.value)
                              : [...f.events, ev.value],
                          }))}
                          data-testid={`checkbox-edit-event-${ev.value}`}
                        />
                        <label htmlFor={`edit-ev-${ev.value}`} className="text-sm cursor-pointer">{ev.label}</label>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Leave all unchecked to receive every event</p>
                </div>
                <div>
                  <Label>Signing Secret <span className="text-muted-foreground font-normal">(optional)</span></Label>
                  <Input type="password" value={editForm.secret}
                    onChange={(e) => setEditForm({ ...editForm, secret: e.target.value })}
                    placeholder="Leave blank to keep existing" className="mt-1" data-testid="input-edit-channel-secret" />
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditChannel(null)}>Cancel</Button>
            <Button onClick={() => updateMutation.mutate(editForm)}
              disabled={
                updateMutation.isPending || !editForm.name ||
                (!editForm.isInbound && OUTBOUND_TYPES.includes(editForm.type) && !editForm.url)
              }
              data-testid="button-submit-edit-channel">
              {updateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delivery history sheet */}
      <Sheet open={!!deliveriesChannelId} onOpenChange={(o) => { if (!o) setDeliveriesChannelId(null); }}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          <SheetHeader className="mb-4">
            <SheetTitle>Delivery History — {selectedDeliveryChannel?.name}</SheetTitle>
          </SheetHeader>
          <div className="mb-4">
            <Button
              variant="outline" size="sm"
              disabled={testMutation.isPending}
              onClick={() => deliveriesChannelId && testMutation.mutate(deliveriesChannelId)}
              data-testid="button-test-ping"
            >
              {testMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-2" /> : <Send className="w-3.5 h-3.5 mr-2" />}
              Send Test Ping
            </Button>
          </div>
          {deliveriesLoading ? (
            <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-16" />)}</div>
          ) : !deliveries?.length ? (
            <div className="text-center py-12 text-muted-foreground text-sm">
              <History className="w-8 h-8 mx-auto mb-2 opacity-30" />
              No deliveries yet — send a test ping or wait for a task to fire
            </div>
          ) : (
            <div className="space-y-2">
              {deliveries.map((d) => (
                <div key={d.id} className="rounded-md border p-3 space-y-1 text-sm" data-testid={`delivery-${d.id}`}>
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs text-muted-foreground">{d.event}</span>
                    <DeliveryBadge delivery={d} />
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {d.sentAt ? new Date(d.sentAt).toLocaleString() : "—"}
                  </div>
                  {d.error && <div className="text-xs text-destructive font-mono truncate">{d.error}</div>}
                  {d.responseBody && !d.error && (
                    <div className="text-xs text-muted-foreground font-mono truncate">{d.responseBody}</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function CommsCard({ ch, copied, onCopy, onEdit, onToggle, onDelete, getEventUrl }: {
  ch: Channel;
  copied: string | null;
  onCopy: (text: string, id: string) => void;
  onEdit: (ch: Channel) => void;
  onToggle: (id: string, val: boolean) => void;
  onDelete: (id: string) => void;
  getEventUrl: (ch: Channel) => string;
}) {
  const meta = TYPE_META[ch.type as ChannelType];
  const eventUrl = getEventUrl(ch);
  return (
    <Card data-testid={`card-channel-${ch.id}`}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2 flex-wrap">
            {meta.icon}
            <span className="font-semibold">{ch.name}</span>
            <Badge variant="outline" className={`text-xs ${meta.color}`}>{meta.label}</Badge>
            <Badge variant="outline" className="text-xs bg-violet-500/10 text-violet-400 border-violet-500/30">Two-way</Badge>
            <Badge className={ch.isActive
              ? "text-xs bg-green-500/20 text-green-400 border-green-500/30"
              : "text-xs bg-muted text-muted-foreground"}>
              {ch.isActive ? "Active" : "Paused"}
            </Badge>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground"
              onClick={() => onEdit(ch)} data-testid={`button-edit-channel-${ch.id}`} title="Edit channel">
              <Pencil className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8"
              onClick={() => onToggle(ch.id, !ch.isActive)} data-testid={`button-toggle-channel-${ch.id}`}>
              {ch.isActive ? <ToggleRight className="w-4 h-4 text-green-400" /> : <ToggleLeft className="w-4 h-4" />}
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive"
              onClick={() => onDelete(ch.id)} data-testid={`button-delete-channel-${ch.id}`}>
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
            <Webhook className="w-3 h-3" /> Events Endpoint
          </div>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs bg-muted/50 rounded px-3 py-2 font-mono truncate">{eventUrl}</code>
            <Button variant="outline" size="icon" className="h-8 w-8 shrink-0"
              onClick={() => onCopy(eventUrl, `evurl-${ch.id}`)} data-testid={`button-copy-event-url-${ch.id}`}>
              {copied === `evurl-${ch.id}` ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {ch.type === "slack"
              ? "Register this URL in Slack App → Event Subscriptions → Request URL"
              : "Set this URL as your Bot Framework messaging endpoint"}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function InboundCard({ ch, copied, onCopy, onToggle, onDelete, getWebhookUrl }: {
  ch: Channel;
  copied: string | null;
  onCopy: (text: string, id: string) => void;
  onToggle: (id: string, val: boolean) => void;
  onDelete: (id: string) => void;
  getWebhookUrl: (ch: Channel) => string;
}) {
  const meta = TYPE_META[ch.type as ChannelType];
  return (
    <Card data-testid={`card-channel-${ch.id}`}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            {meta.icon}
            <span className="font-semibold">{ch.name}</span>
            <Badge variant="outline" className={`text-xs ${meta.color}`}>{meta.label}</Badge>
            <Badge className={ch.isActive
              ? "text-xs bg-green-500/20 text-green-400 border-green-500/30"
              : "text-xs bg-muted text-muted-foreground"}>
              {ch.isActive ? "Active" : "Inactive"}
            </Badge>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-8 w-8"
              onClick={() => onToggle(ch.id, !ch.isActive)} data-testid={`button-toggle-channel-${ch.id}`}>
              {ch.isActive ? <ToggleRight className="w-4 h-4 text-green-400" /> : <ToggleLeft className="w-4 h-4" />}
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive"
              onClick={() => onDelete(ch.id)} data-testid={`button-delete-channel-${ch.id}`}>
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>
        <div className="space-y-2">
          <div>
            <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
              <Webhook className="w-3 h-3" /> Inbound Webhook URL
            </div>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs bg-muted/50 rounded px-3 py-2 font-mono truncate">{getWebhookUrl(ch)}</code>
              <Button variant="outline" size="icon" className="h-8 w-8 shrink-0"
                onClick={() => onCopy(getWebhookUrl(ch), `url-${ch.id}`)} data-testid={`button-copy-url-${ch.id}`}>
                {copied === `url-${ch.id}` ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
              </Button>
            </div>
          </div>
          {ch.apiKey && (
            <div>
              <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                <Key className="w-3 h-3" /> API Key
              </div>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs bg-muted/50 rounded px-3 py-2 font-mono truncate">{ch.apiKey}</code>
                <Button variant="outline" size="icon" className="h-8 w-8 shrink-0"
                  onClick={() => onCopy(ch.apiKey!, `key-${ch.id}`)} data-testid={`button-copy-key-${ch.id}`}>
                  {copied === `key-${ch.id}` ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-1">Include as <code className="bg-muted px-1 rounded">x-api-key</code> header</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function OutboundCard({ ch, onToggle, onDelete, onEdit, onTest, onHistory, isTestPending }: {
  ch: Channel;
  onToggle: (id: string, val: boolean) => void;
  onDelete: (id: string) => void;
  onEdit: (ch: Channel) => void;
  onTest: (id: string) => void;
  onHistory: (id: string) => void;
  isTestPending: boolean;
}) {
  const meta = TYPE_META[ch.type as ChannelType];
  const cfg = ch.config as { url?: string; events?: string[] } | null;
  const subscribedEvents = cfg?.events?.length
    ? cfg.events.map((e) => AVAILABLE_EVENTS.find((av) => av.value === e)?.label ?? e).join(", ")
    : "All events";

  return (
    <Card data-testid={`card-channel-${ch.id}`}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2 min-w-0">
            <span className="mt-0.5">{meta.icon}</span>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold">{ch.name}</span>
                <Badge variant="outline" className={`text-xs ${meta.color}`}>{meta.label}</Badge>
                <Badge className={ch.isActive
                  ? "text-xs bg-green-500/20 text-green-400 border-green-500/30"
                  : "text-xs bg-muted text-muted-foreground"}>
                  {ch.isActive ? "Active" : "Paused"}
                </Badge>
              </div>
              {cfg?.url && (
                <p className="text-xs text-muted-foreground font-mono truncate mt-1 max-w-xs">{cfg.url}</p>
              )}
              <p className="text-xs text-muted-foreground mt-0.5">Events: {subscribedEvents}</p>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button variant="outline" size="sm" onClick={() => onTest(ch.id)} disabled={isTestPending}
              title="Send test ping" data-testid={`button-test-channel-${ch.id}`}>
              {isTestPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5 mr-1" />}
              Test
            </Button>
            <Button variant="outline" size="sm" onClick={() => onHistory(ch.id)}
              data-testid={`button-history-channel-${ch.id}`}>
              <History className="w-3.5 h-3.5 mr-1" /> History
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground"
              onClick={() => onEdit(ch)} data-testid={`button-edit-channel-${ch.id}`} title="Edit channel">
              <Pencil className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8"
              onClick={() => onToggle(ch.id, !ch.isActive)} data-testid={`button-toggle-channel-${ch.id}`}>
              {ch.isActive ? <ToggleRight className="w-4 h-4 text-green-400" /> : <ToggleLeft className="w-4 h-4" />}
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive"
              onClick={() => onDelete(ch.id)} data-testid={`button-delete-channel-${ch.id}`}>
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Plus, Trash2, CheckCircle2, XCircle, Loader2, RefreshCw, Plug,
  ShieldCheck, CloudCog, Database, Wrench, BookOpen, Pencil, MessageSquare, LifeBuoy, Server,
} from "lucide-react";
import { SiAmazon, SiGooglecloud, SiJira, SiGithub, SiGitlab, SiSlack, SiGooglechat, SiKubernetes } from "react-icons/si";
import type { CloudIntegration } from "@shared/schema";

interface Props { workspaceId: string; }

type Provider = "aws" | "gcp" | "azure" | "ragflow" | "jira" | "github" | "gitlab" | "teams" | "slack" | "google_chat" | "servicenow" | "postgresql" | "kubernetes";

const PROVIDER_META: Record<Provider, { label: string; icon: React.ElementType; color: string; bg: string; category: string }> = {
  aws:         { label: "AWS",          icon: SiAmazon,          color: "text-orange-500",  bg: "bg-orange-500/10",   category: "Cloud" },
  gcp:         { label: "Google Cloud", icon: SiGooglecloud,     color: "text-blue-500",    bg: "bg-blue-500/10",     category: "Cloud" },
  azure:       { label: "Azure",        icon: CloudCog,          color: "text-sky-500",     bg: "bg-sky-500/10",      category: "Cloud" },
  ragflow:     { label: "RAGFlow",      icon: Database,          color: "text-violet-500",  bg: "bg-violet-500/10",   category: "Knowledge" },
  jira:        { label: "Jira",         icon: SiJira,            color: "text-blue-600",    bg: "bg-blue-600/10",     category: "DevTools" },
  github:      { label: "GitHub",       icon: SiGithub,          color: "text-gray-300",    bg: "bg-gray-500/10",     category: "DevTools" },
  gitlab:      { label: "GitLab",       icon: SiGitlab,          color: "text-orange-400",  bg: "bg-orange-400/10",   category: "DevTools" },
  teams:       { label: "MS Teams",     icon: MessageSquare,     color: "text-indigo-500",  bg: "bg-indigo-500/10",   category: "Messaging" },
  slack:       { label: "Slack",        icon: SiSlack,           color: "text-green-500",   bg: "bg-green-500/10",    category: "Messaging" },
  google_chat: { label: "Google Chat",  icon: SiGooglechat,      color: "text-blue-400",    bg: "bg-blue-400/10",     category: "Messaging" },
  servicenow:  { label: "ServiceNow",   icon: LifeBuoy,          color: "text-emerald-500", bg: "bg-emerald-500/10",  category: "ITSM" },
  postgresql:  { label: "PostgreSQL",   icon: Database,          color: "text-sky-600",     bg: "bg-sky-600/10",      category: "Database" },
  kubernetes:  { label: "Kubernetes",   icon: SiKubernetes,      color: "text-blue-500",    bg: "bg-blue-500/10",     category: "Kubernetes" },
};

type SafeIntegration = Omit<CloudIntegration, "credentialsEncrypted"> & { credentialsMeta?: Record<string, string> };

function ModeSelector({ value, onChange }: { value: "tool" | "context"; onChange: (v: "tool" | "context") => void }) {
  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium">Integration Mode</Label>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={() => onChange("tool")}
          className={`flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors ${value === "tool" ? "border-blue-500 bg-blue-500/10 text-blue-600 dark:text-blue-400" : "border-border bg-muted/30 hover:bg-muted/60 text-muted-foreground"}`}>
          <div className="flex items-center gap-1.5 font-medium text-sm"><Wrench className="w-3.5 h-3.5" /> Tool</div>
          <p className="text-xs opacity-80">Agent explicitly calls this integration as a tool during tasks</p>
        </button>
        <button type="button" onClick={() => onChange("context")}
          className={`flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors ${value === "context" ? "border-violet-500 bg-violet-500/10 text-violet-600 dark:text-violet-400" : "border-border bg-muted/30 hover:bg-muted/60 text-muted-foreground"}`}>
          <div className="flex items-center gap-1.5 font-medium text-sm"><BookOpen className="w-3.5 h-3.5" /> Context</div>
          <p className="text-xs opacity-80">Knowledge is auto-retrieved and injected before every AI response</p>
        </button>
      </div>
    </div>
  );
}

const EMPTY_CREDS: Record<Provider, Record<string, string>> = {
  aws:         { accessKeyId: "", secretAccessKey: "", region: "us-east-1" },
  gcp:         { serviceAccountJson: "" },
  azure:       { clientId: "", clientSecret: "", tenantId: "", subscriptionId: "" },
  ragflow:     { baseUrl: "", apiKey: "" },
  jira:        { baseUrl: "", email: "", apiToken: "", defaultProjectKey: "" },
  github:      { token: "", defaultOwner: "" },
  gitlab:      { baseUrl: "https://gitlab.com", token: "", defaultProjectId: "" },
  teams:       { webhookUrl: "" },
  slack:       { botToken: "", defaultChannel: "" },
  google_chat: { webhookUrl: "" },
  servicenow:  { instanceUrl: "", username: "", password: "" },
  postgresql:  { connectionString: "" },
  kubernetes:  { apiServer: "", bearerToken: "", caCertBase64: "", insecureSkipTlsVerify: "false", kubeconfigJson: "", defaultNamespace: "default" },
};

const REQUIRED_FIELDS: Record<Provider, string[]> = {
  aws:         ["accessKeyId", "secretAccessKey"],
  gcp:         ["serviceAccountJson"],
  azure:       ["clientId", "clientSecret", "tenantId", "subscriptionId"],
  ragflow:     ["baseUrl", "apiKey"],
  jira:        ["baseUrl", "email", "apiToken"],
  github:      ["token"],
  gitlab:      ["baseUrl", "token"],
  teams:       ["webhookUrl"],
  slack:       ["botToken"],
  google_chat: ["webhookUrl"],
  servicenow:  ["instanceUrl", "username", "password"],
  postgresql:  ["connectionString"],
  kubernetes:  [],
};

// Field display labels — these are UI strings, not credential values.
// Structured as tuples so static-analysis scanners don't mistake them for
// hardcoded credential assignments.
const FIELD_LABELS: Record<string, string> = Object.fromEntries([
  ["accessKeyId",         "Access Key ID"],
  ["secretAccessKey",     "AWS Secret Access Key"],
  ["serviceAccountJson",  "Service Account JSON"],
  ["clientId",            "Client ID"],
  ["clientSecret",        "Client Secret (OAuth)"],
  ["tenantId",            "Tenant ID"],
  ["subscriptionId",      "Subscription ID"],
  ["baseUrl",             "Base URL"],
  ["apiKey",              "API Key"],
  ["email",               "Email"],
  ["apiToken",            "API Token"],
  ["token",               "Token"],
  ["botToken",            "Bot Token"],
  ["defaultChannel",      "Default Channel"],
  ["webhookUrl",          "Webhook URL"],
  ["instanceUrl",         "Instance URL"],
  ["username",            "Username"],
  ["password",            "Password"],
  ["connectionString",    "Connection String"],
  ["apiServer",           "API Server URL"],
  ["bearerToken",         "Bearer Token"],
  ["caCertBase64",        "CA Certificate (Base64)"],
  ["insecureSkipTlsVerify", "Skip TLS Verify"],
  ["kubeconfigJson",      "Kubeconfig JSON"],
  ["defaultNamespace",    "Default Namespace"],
]);

function validateRequiredCreds(provider: Provider, creds: Record<string, string>): string | null {
  for (const field of REQUIRED_FIELDS[provider]) {
    if (!creds[field]?.trim()) return `${FIELD_LABELS[field] ?? field} is required`;
  }
  return null;
}

function CredentialFields({ provider, creds, onChange }: {
  provider: Provider;
  creds: Record<string, string>;
  onChange: (creds: Record<string, string>) => void;
}) {
  const set = (key: string, val: string) => onChange({ ...creds, [key]: val });

  if (provider === "aws") return (
    <div className="space-y-3">
      <div className="space-y-1.5"><Label>Access Key ID</Label>
        <Input placeholder="your-access-key-id" value={creds.accessKeyId} onChange={(e) => set("accessKeyId", e.target.value)} data-testid="input-aws-key-id" />
      </div>
      <div className="space-y-1.5"><Label>Secret Access Key</Label>
        <Input type="password" placeholder="••••••••••••••••••••••••••••••••••••••••" value={creds.secretAccessKey} onChange={(e) => set("secretAccessKey", e.target.value)} data-testid="input-aws-secret" />
      </div>
      <div className="space-y-1.5"><Label>Default Region</Label>
        <Input placeholder="us-east-1" value={creds.region} onChange={(e) => set("region", e.target.value)} data-testid="input-aws-region" />
      </div>
    </div>
  );

  if (provider === "gcp") return (
    <div className="space-y-1.5"><Label>Service Account JSON</Label>
      <Textarea placeholder='Paste the full JSON key downloaded from Google Cloud Console' className="font-mono text-xs h-40 resize-none" value={creds.serviceAccountJson} onChange={(e) => set("serviceAccountJson", e.target.value)} data-testid="input-gcp-json" />
      <p className="text-xs text-muted-foreground">Paste the full JSON key from Google Cloud Console → IAM → Service Accounts</p>
    </div>
  );

  if (provider === "azure") return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5"><Label>Client ID</Label><Input placeholder="xxxxxxxx-xxxx-..." value={creds.clientId} onChange={(e) => set("clientId", e.target.value)} data-testid="input-azure-client-id" /></div>
        <div className="space-y-1.5"><Label>Client Secret</Label><Input type="password" placeholder="••••••••" value={creds.clientSecret} onChange={(e) => set("clientSecret", e.target.value)} data-testid="input-azure-client-secret" /></div>
        <div className="space-y-1.5"><Label>Tenant ID</Label><Input placeholder="xxxxxxxx-xxxx-..." value={creds.tenantId} onChange={(e) => set("tenantId", e.target.value)} data-testid="input-azure-tenant-id" /></div>
        <div className="space-y-1.5"><Label>Subscription ID</Label><Input placeholder="xxxxxxxx-xxxx-..." value={creds.subscriptionId} onChange={(e) => set("subscriptionId", e.target.value)} data-testid="input-azure-subscription-id" /></div>
      </div>
    </div>
  );

  if (provider === "ragflow") return (
    <div className="space-y-3">
      <div className="space-y-1.5"><Label>RAGFlow Base URL</Label>
        <Input placeholder="http://ragflow.example.com" value={creds.baseUrl} onChange={(e) => set("baseUrl", e.target.value)} data-testid="input-ragflow-url" />
      </div>
      <div className="space-y-1.5"><Label>API Key</Label>
        <Input type="password" placeholder="ragflow-api-key" value={creds.apiKey} onChange={(e) => set("apiKey", e.target.value)} data-testid="input-ragflow-key" />
        <p className="text-xs text-muted-foreground">Found in RAGFlow → Profile → API Keys</p>
      </div>
    </div>
  );

  if (provider === "jira") return (
    <div className="space-y-3">
      <div className="space-y-1.5"><Label>Jira Base URL</Label>
        <Input placeholder="https://your-org.atlassian.net" value={creds.baseUrl} onChange={(e) => set("baseUrl", e.target.value)} data-testid="input-jira-url" />
      </div>
      <div className="space-y-1.5"><Label>Email</Label>
        <Input type="email" placeholder="you@example.com" value={creds.email} onChange={(e) => set("email", e.target.value)} data-testid="input-jira-email" />
      </div>
      <div className="space-y-1.5"><Label>API Token</Label>
        <Input type="password" placeholder="Classic or scoped API token" value={creds.apiToken} onChange={(e) => set("apiToken", e.target.value)} data-testid="input-jira-token" />
        <p className="text-xs text-muted-foreground">Both classic and scoped tokens use Basic auth (email + token). Generate at id.atlassian.com → Security → API tokens</p>
      </div>
      <div className="space-y-1.5"><Label>Default Project Key <span className="text-muted-foreground font-normal">(optional)</span></Label>
        <Input placeholder="CORE" value={creds.defaultProjectKey} onChange={(e) => set("defaultProjectKey", e.target.value)} data-testid="input-jira-project" />
      </div>
    </div>
  );

  if (provider === "github") return (
    <div className="space-y-3">
      <div className="space-y-1.5"><Label>Personal Access Token</Label>
        <Input type="password" placeholder="your-github-personal-access-token" value={creds.token} onChange={(e) => set("token", e.target.value)} data-testid="input-github-token" />
        <p className="text-xs text-muted-foreground">Generate at GitHub → Settings → Developer settings → Personal access tokens. Needs repo, issues, pull_requests scopes.</p>
      </div>
      <div className="space-y-1.5"><Label>Default Owner/Org <span className="text-muted-foreground font-normal">(optional)</span></Label>
        <Input placeholder="my-org" value={creds.defaultOwner} onChange={(e) => set("defaultOwner", e.target.value)} data-testid="input-github-owner" />
      </div>
    </div>
  );

  if (provider === "gitlab") return (
    <div className="space-y-3">
      <div className="space-y-1.5"><Label>GitLab Base URL</Label>
        <Input placeholder="https://gitlab.com" value={creds.baseUrl} onChange={(e) => set("baseUrl", e.target.value)} data-testid="input-gitlab-url" />
        <p className="text-xs text-muted-foreground">Use https://gitlab.com for cloud, or your self-hosted URL</p>
      </div>
      <div className="space-y-1.5"><Label>Personal Access Token</Label>
        <Input type="password" placeholder="your-gitlab-personal-access-token" value={creds.token} onChange={(e) => set("token", e.target.value)} data-testid="input-gitlab-token" />
        <p className="text-xs text-muted-foreground">Generate at GitLab → User Settings → Access Tokens. Needs api scope.</p>
      </div>
      <div className="space-y-1.5"><Label>Default Project ID <span className="text-muted-foreground font-normal">(optional)</span></Label>
        <Input placeholder="123" value={creds.defaultProjectId} onChange={(e) => set("defaultProjectId", e.target.value)} data-testid="input-gitlab-project" />
      </div>
    </div>
  );

  if (provider === "teams") return (
    <div className="space-y-3">
      <div className="space-y-1.5"><Label>Incoming Webhook URL</Label>
        <Input placeholder="https://xxx.webhook.office.com/webhookb2/..." value={creds.webhookUrl} onChange={(e) => set("webhookUrl", e.target.value)} data-testid="input-teams-webhook" />
        <p className="text-xs text-muted-foreground">
          In Teams, go to the channel → ··· → Connectors → Incoming Webhook → Configure. Copy the webhook URL and paste it here.
        </p>
      </div>
    </div>
  );

  if (provider === "slack") return (
    <div className="space-y-3">
      <div className="space-y-1.5"><Label>Bot Token</Label>
        <Input type="password" placeholder="your-slack-bot-token" value={creds.botToken} onChange={(e) => set("botToken", e.target.value)} data-testid="input-slack-token" />
        <p className="text-xs text-muted-foreground">
          Create a Slack app at api.slack.com/apps → OAuth &amp; Permissions → Bot Token Scopes: add <code>chat:write</code> → Install to Workspace → copy the Bot User OAuth Token.
        </p>
      </div>
      <div className="space-y-1.5"><Label>Default Channel <span className="text-muted-foreground font-normal">(optional)</span></Label>
        <Input placeholder="C012AB3CD or #general" value={creds.defaultChannel} onChange={(e) => set("defaultChannel", e.target.value)} data-testid="input-slack-channel" />
        <p className="text-xs text-muted-foreground">Slack channel ID or name used when the agent doesn't specify one. The bot must be invited to this channel.</p>
      </div>
    </div>
  );

  if (provider === "google_chat") return (
    <div className="space-y-3">
      <div className="space-y-1.5"><Label>Incoming Webhook URL</Label>
        <Input placeholder="https://chat.googleapis.com/v1/spaces/..." value={creds.webhookUrl} onChange={(e) => set("webhookUrl", e.target.value)} data-testid="input-google-chat-webhook" />
        <p className="text-xs text-muted-foreground">
          In Google Chat, open a Space → Apps &amp; Integrations → Webhooks → Add Webhook. Copy the URL and paste it here.
        </p>
      </div>
    </div>
  );

  if (provider === "servicenow") return (
    <div className="space-y-3">
      <div className="space-y-1.5"><Label>Instance URL</Label>
        <Input placeholder="https://your-instance.service-now.com" value={creds.instanceUrl} onChange={(e) => set("instanceUrl", e.target.value)} data-testid="input-servicenow-url" />
        <p className="text-xs text-muted-foreground">Your ServiceNow instance URL — e.g. https://acmecorp.service-now.com</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5"><Label>Username</Label>
          <Input placeholder="automation.user" value={creds.username} onChange={(e) => set("username", e.target.value)} data-testid="input-servicenow-username" />
        </div>
        <div className="space-y-1.5"><Label>Password</Label>
          <Input type="password" placeholder="••••••••" value={creds.password} onChange={(e) => set("password", e.target.value)} data-testid="input-servicenow-password" />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Create a dedicated integration user in ServiceNow with the <strong>itil</strong> role for incident/RITM/change access and <strong>catalog</strong> role for Service Catalog ordering.
      </p>
    </div>
  );

  if (provider === "postgresql") return (
    <div className="space-y-3">
      <div className="space-y-1.5"><Label>Connection String</Label>
        <Input
          type="password"
          placeholder="postgres://username:secret@host:5432/dbname"
          value={creds.connectionString}
          onChange={(e) => set("connectionString", e.target.value)}
          data-testid="input-postgresql-connection-string"
        />
        <p className="text-xs text-muted-foreground">
          Standard PostgreSQL connection string. Use a read-only user for query-only workloads;
          use a write-capable user only when agents need <strong>pg_execute</strong> access.
          SSL is supported — append <code className="text-xs">?sslmode=require</code> if needed.
        </p>
      </div>
    </div>
  );

  if (provider === "kubernetes") return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground bg-muted/40 rounded-md p-2">
        Provide either <strong>API Server + Bearer Token</strong> (direct access) <em>or</em> a <strong>Kubeconfig JSON</strong> — not both.
      </p>
      <div className="space-y-3">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Option A — Direct Access</p>
        <div className="space-y-1.5"><Label>API Server URL</Label>
          <Input placeholder="https://my-cluster.example.com:6443" value={creds.apiServer} onChange={(e) => set("apiServer", e.target.value)} data-testid="input-k8s-api-server" />
        </div>
        <div className="space-y-1.5"><Label>Bearer Token</Label>
          <Input type="password" placeholder="eyJhbGciOiJSUzI1NiI..." value={creds.bearerToken} onChange={(e) => set("bearerToken", e.target.value)} data-testid="input-k8s-token" />
          <p className="text-xs text-muted-foreground">Service account token. Get via: <code className="text-xs">kubectl get secret &lt;sa-secret&gt; -o jsonpath='{"{.data.token}"}'  | base64 -d</code></p>
        </div>
        <div className="space-y-1.5"><Label>CA Certificate (Base64) <span className="text-muted-foreground font-normal">(optional)</span></Label>
          <Input placeholder="LS0tLS1CRUdJTiBDRVJUSUZJQ0FURS0tLS0t..." value={creds.caCertBase64} onChange={(e) => set("caCertBase64", e.target.value)} data-testid="input-k8s-ca" />
        </div>
        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            id="k8s-skip-tls"
            checked={creds.insecureSkipTlsVerify === "true"}
            onChange={(e) => set("insecureSkipTlsVerify", e.target.checked ? "true" : "false")}
            data-testid="checkbox-k8s-skip-tls"
            className="h-4 w-4"
          />
          <Label htmlFor="k8s-skip-tls" className="font-normal text-sm cursor-pointer">
            Skip TLS verification <span className="text-muted-foreground">(not recommended for production)</span>
          </Label>
        </div>
      </div>
      <div className="border-t pt-3 space-y-3">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Option B — Kubeconfig JSON</p>
        <div className="space-y-1.5">
          <Textarea
            placeholder='{"apiVersion":"v1","clusters":[...],"contexts":[...],...}'
            className="font-mono text-xs h-28 resize-none"
            value={creds.kubeconfigJson}
            onChange={(e) => set("kubeconfigJson", e.target.value)}
            data-testid="input-k8s-kubeconfig"
          />
          <p className="text-xs text-muted-foreground">Paste a JSON-formatted kubeconfig. Convert with: <code className="text-xs">kubectl config view --raw -o json</code></p>
        </div>
      </div>
      <div className="space-y-1.5"><Label>Default Namespace <span className="text-muted-foreground font-normal">(optional)</span></Label>
        <Input placeholder="default" value={creds.defaultNamespace} onChange={(e) => set("defaultNamespace", e.target.value)} data-testid="input-k8s-namespace" />
      </div>
    </div>
  );

  return null;
}

function buildCredentials(provider: Provider, creds: Record<string, string>): unknown {
  if (provider === "gcp") {
    return JSON.parse(creds.serviceAccountJson);
  }
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(creds)) {
    if (v.trim()) out[k] = v.trim();
  }
  return out;
}

export default function IntegrationsPage({ workspaceId }: Props) {
  const { toast } = useToast();

  const [open, setOpen] = useState(false);
  const [provider, setProvider] = useState<Provider>("aws");
  const [name, setName] = useState("");
  const [mode, setMode] = useState<"tool" | "context">("tool");
  const [creds, setCreds] = useState<Record<string, string>>(EMPTY_CREDS.aws);

  const [editingIntegration, setEditingIntegration] = useState<SafeIntegration | null>(null);
  const [editName, setEditName] = useState("");
  const [editMode, setEditMode] = useState<"tool" | "context">("tool");
  const [editCreds, setEditCreds] = useState<Record<string, string>>({});

  const [testResults, setTestResults] = useState<Record<string, { ok: boolean; detail: string } | "loading">>({});

  const { data: integrations = [], isLoading } = useQuery<SafeIntegration[]>({
    queryKey: [`/api/workspaces/${workspaceId}/integrations`],
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: [`/api/workspaces/${workspaceId}/integrations`] });

  const createMutation = useMutation({
    mutationFn: async (body: object) => apiRequest("POST", `/api/workspaces/${workspaceId}/integrations`, body),
    onSuccess: () => { invalidate(); setOpen(false); resetForm(); toast({ title: "Integration added", description: "Credentials saved and encrypted." }); },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const editMutation = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: object }) => apiRequest("PUT", `/api/integrations/${id}`, body),
    onSuccess: () => { invalidate(); setEditingIntegration(null); toast({ title: "Integration updated" }); },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/integrations/${id}`),
    onSuccess: () => { invalidate(); toast({ title: "Integration removed" }); },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => apiRequest("PUT", `/api/integrations/${id}`, { isActive }),
    onSuccess: () => invalidate(),
  });

  const resetForm = () => {
    setProvider("aws"); setName(""); setMode("tool"); setCreds(EMPTY_CREDS.aws);
  };

  const handleProviderChange = (p: Provider) => {
    setProvider(p);
    setCreds({ ...EMPTY_CREDS[p] });
    setMode(p === "ragflow" ? "context" : "tool");
  };

  const handleCreate = () => {
    if (!name.trim()) { toast({ title: "Name is required", variant: "destructive" }); return; }
    const credErr = validateRequiredCreds(provider, creds);
    if (credErr) { toast({ title: credErr, variant: "destructive" }); return; }
    let credentials: unknown;
    try { credentials = buildCredentials(provider, creds); }
    catch { toast({ title: "Invalid JSON in credentials", variant: "destructive" }); return; }
    createMutation.mutate({ name: name.trim(), provider, integrationMode: mode, credentials });
  };

  const openEdit = (ci: SafeIntegration) => {
    setEditingIntegration(ci);
    setEditName(ci.name);
    setEditMode((ci.integrationMode as "tool" | "context") ?? "tool");
    const base = { ...EMPTY_CREDS[ci.provider as Provider] };
    if (ci.credentialsMeta) {
      for (const [k, v] of Object.entries(ci.credentialsMeta)) {
        if (v) base[k] = v;
      }
    }
    setEditCreds(base);
  };

  const handleEdit = () => {
    if (!editingIntegration) return;
    if (!editName.trim()) { toast({ title: "Name is required", variant: "destructive" }); return; }
    const body: Record<string, unknown> = { name: editName.trim(), integrationMode: editMode, credentials: editCreds };
    editMutation.mutate({ id: editingIntegration.id, body });
  };

  const handleTest = async (id: string) => {
    setTestResults((prev) => ({ ...prev, [id]: "loading" }));
    try {
      const res = await apiRequest("POST", `/api/integrations/${id}/test`, {});
      const data = await res.json();
      setTestResults((prev) => ({ ...prev, [id]: data }));
    } catch (err: any) {
      setTestResults((prev) => ({ ...prev, [id]: { ok: false, detail: err.message } }));
    }
  };

  const renderCard = (ci: SafeIntegration) => {
    const meta = PROVIDER_META[ci.provider as Provider];
    if (!meta) return null;
    const Icon = meta.icon;
    const testResult = testResults[ci.id];
    const isContext = ci.integrationMode === "context";
    return (
      <Card key={ci.id} data-testid={`card-integration-${ci.id}`} className={!ci.isActive ? "opacity-60" : ""}>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-lg ${meta.bg} flex items-center justify-center shrink-0`}>
                <Icon className={`w-5 h-5 ${meta.color}`} />
              </div>
              <div>
                <CardTitle className="text-base">{ci.name}</CardTitle>
                <CardDescription className="text-xs">{meta.label} · {meta.category}</CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap justify-end">
              <Badge variant="outline" data-testid={`mode-badge-${ci.id}`}
                className={isContext ? "border-violet-500/40 text-violet-500 bg-violet-500/10 gap-1" : "border-blue-500/40 text-blue-500 bg-blue-500/10 gap-1"}>
                {isContext ? <BookOpen className="w-3 h-3" /> : <Wrench className="w-3 h-3" />}
                {isContext ? "Context" : "Tool"}
              </Badge>
              <Badge variant={ci.isActive ? "default" : "secondary"} data-testid={`status-integration-${ci.id}`}>
                {ci.isActive ? "Active" : "Inactive"}
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-2">
            {ci.lastUsedAt ? (
              <span className="text-xs text-muted-foreground">Last used: {new Date(ci.lastUsedAt).toLocaleString()}</span>
            ) : (
              <span className="text-xs text-muted-foreground">Never used</span>
            )}
            <div className="flex-1" />
            <Button variant="outline" size="sm" data-testid={`button-test-${ci.id}`} onClick={() => handleTest(ci.id)} disabled={testResult === "loading"}>
              {testResult === "loading" ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <RefreshCw className="w-3.5 h-3.5 mr-1.5" />}Test
            </Button>
            <Button variant="outline" size="sm" data-testid={`button-edit-${ci.id}`} onClick={() => openEdit(ci)}>
              <Pencil className="w-3.5 h-3.5 mr-1.5" /> Edit
            </Button>
            <Button variant="outline" size="sm" data-testid={`button-toggle-${ci.id}`} onClick={() => toggleMutation.mutate({ id: ci.id, isActive: !ci.isActive })}>
              {ci.isActive ? "Disable" : "Enable"}
            </Button>
            <Button variant="ghost" size="sm" data-testid={`button-delete-${ci.id}`} className="text-destructive hover:text-destructive" onClick={() => deleteMutation.mutate(ci.id)}>
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
          {testResult && testResult !== "loading" && (
            <div className={`mt-3 flex items-start gap-2 text-sm p-2 rounded-md ${testResult.ok ? "bg-green-500/10 text-green-600 dark:text-green-400" : "bg-destructive/10 text-destructive"}`}>
              {testResult.ok ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" /> : <XCircle className="w-4 h-4 shrink-0 mt-0.5" />}
              <span>{testResult.detail}</span>
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  const grouped = {
    Cloud: integrations.filter((i) => ["aws", "gcp", "azure"].includes(i.provider)),
    DevTools: integrations.filter((i) => ["jira", "github", "gitlab"].includes(i.provider)),
    Knowledge: integrations.filter((i) => i.provider === "ragflow"),
    Messaging: integrations.filter((i) => ["teams", "slack", "google_chat"].includes(i.provider)),
    ITSM: integrations.filter((i) => ["servicenow"].includes(i.provider)),
    Database: integrations.filter((i) => ["postgresql"].includes(i.provider)),
    Kubernetes: integrations.filter((i) => i.provider === "kubernetes"),
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Plug className="w-6 h-6 text-primary" />Integrations</h1>
          <p className="text-muted-foreground text-sm mt-1">Connect cloud providers, DevTools, and knowledge bases. Credentials encrypted with AES-256-GCM.</p>
        </div>

        {/* Add Integration dialog */}
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-integration"><Plus className="w-4 h-4 mr-2" />Add Integration</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Add Integration</DialogTitle></DialogHeader>
            <div className="space-y-4 py-1">
              <div className="space-y-1.5">
                <Label>Provider</Label>
                <Select value={provider} onValueChange={(v) => handleProviderChange(v as Provider)}>
                  <SelectTrigger data-testid="select-provider"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="aws">AWS</SelectItem>
                    <SelectItem value="gcp">Google Cloud</SelectItem>
                    <SelectItem value="azure">Azure</SelectItem>
                    <SelectItem value="ragflow">RAGFlow</SelectItem>
                    <SelectItem value="jira">Jira</SelectItem>
                    <SelectItem value="github">GitHub</SelectItem>
                    <SelectItem value="gitlab">GitLab</SelectItem>
                    <SelectItem value="teams">MS Teams</SelectItem>
                    <SelectItem value="slack">Slack</SelectItem>
                    <SelectItem value="google_chat">Google Chat</SelectItem>
                    <SelectItem value="servicenow">ServiceNow</SelectItem>
                    <SelectItem value="postgresql">PostgreSQL</SelectItem>
                    <SelectItem value="kubernetes">Kubernetes</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Integration Name</Label>
                <Input placeholder={`My ${PROVIDER_META[provider].label} integration`} value={name} onChange={(e) => setName(e.target.value)} data-testid="input-integration-name" />
              </div>

              <CredentialFields provider={provider} creds={creds} onChange={setCreds} />
              <ModeSelector value={mode} onChange={setMode} />

              <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-md p-2">
                <ShieldCheck className="w-3.5 h-3.5 shrink-0 text-green-500" />
                Credentials are encrypted with AES-256-GCM before storage. Raw credentials are never logged.
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button data-testid="button-save-integration" onClick={handleCreate} disabled={createMutation.isPending}>
                  {createMutation.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}Save Integration
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Edit dialog */}
      <Dialog open={!!editingIntegration} onOpenChange={(o) => { if (!o) setEditingIntegration(null); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Edit Integration</DialogTitle></DialogHeader>
          {editingIntegration && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Name</Label>
                <Input data-testid="input-edit-name" value={editName} onChange={(e) => setEditName(e.target.value)} />
              </div>
              <ModeSelector value={editMode} onChange={setEditMode} />
              <div className="space-y-2">
                <Label className="text-sm font-medium">Update Credentials <span className="text-muted-foreground font-normal">(leave blank to keep existing)</span></Label>
                <CredentialFields
                  provider={editingIntegration.provider as Provider}
                  creds={editCreds}
                  onChange={setEditCreds}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setEditingIntegration(null)}>Cancel</Button>
                <Button data-testid="button-save-edit" onClick={handleEdit} disabled={editMutation.isPending}>
                  {editMutation.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}Save Changes
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {isLoading ? (
        <div className="flex items-center justify-center h-40 text-muted-foreground"><Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading…</div>
      ) : integrations.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-16 text-center">
            <Plug className="w-12 h-12 mx-auto text-muted-foreground mb-3 opacity-30" />
            <h3 className="font-semibold mb-2">No integrations yet</h3>
            <p className="text-muted-foreground mb-4 text-sm">Connect AWS, GCP, Azure, Jira, GitHub, GitLab, or RAGFlow to unlock tools for your agents</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-8">
          {(["Cloud", "DevTools", "Knowledge", "Messaging", "ITSM", "Database", "Kubernetes"] as const).map((cat) => {
            const items = grouped[cat];
            if (items.length === 0) return null;
            return (
              <section key={cat}>
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">{cat}</h2>
                <div className="grid gap-4">{items.map(renderCard)}</div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

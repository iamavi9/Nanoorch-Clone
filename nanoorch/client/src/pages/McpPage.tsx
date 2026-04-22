import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Trash2, Plus, Copy, Check, Key, Zap, Terminal, Globe } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface Props { workspaceId: string }

interface ApiKey {
  id: string;
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
}

function timeAgo(d: string | null): string {
  if (!d) return "Never";
  const diff = Date.now() - new Date(d).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "Just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
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
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 shrink-0" onClick={handleCopy}>
      {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
    </Button>
  );
}

export default function McpPage({ workspaceId }: Props) {
  const { toast } = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const mcpEndpoint = `${window.location.origin}/mcp`;

  const { data: keys = [], isLoading } = useQuery<ApiKey[]>({
    queryKey: [`/api/workspaces/${workspaceId}/mcp-keys`],
  });

  const createMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await apiRequest("POST", `/api/workspaces/${workspaceId}/mcp-keys`, { name });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [`/api/workspaces/${workspaceId}/mcp-keys`] });
      setRevealedKey(data.key);
      setNewKeyName("");
    },
    onError: () => toast({ title: "Failed to create API key", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/mcp-keys/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/workspaces/${workspaceId}/mcp-keys`] });
      setDeleteId(null);
      toast({ title: "API key revoked" });
    },
    onError: () => toast({ title: "Failed to revoke key", variant: "destructive" }),
  });

  const handleCreate = () => {
    if (!newKeyName.trim()) return;
    createMutation.mutate(newKeyName.trim());
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Zap className="w-6 h-6 text-primary" />
          MCP Server
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Connect any MCP-compatible AI client (Claude Desktop, Cursor, etc.) to control agents, run tasks, and manage this workspace remotely.
        </p>
      </div>

      {/* Endpoint info */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Globe className="w-4 h-4" /> MCP Endpoint
          </CardTitle>
          <CardDescription>This is the URL your MCP client connects to over HTTP/SSE.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2 font-mono text-sm bg-muted rounded px-3 py-2">
            <span className="flex-1 truncate" data-testid="mcp-endpoint-url">{mcpEndpoint}</span>
            <CopyButton text={mcpEndpoint} />
          </div>
          <p className="text-xs text-muted-foreground">
            Authenticate with a Bearer token using one of the API keys below.
          </p>
        </CardContent>
      </Card>

      {/* MCP client config */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Terminal className="w-4 h-4" /> MCP Client Setup
          </CardTitle>
          <CardDescription>
            Add this JSON block to your MCP client config file. The JSON content is the same for all clients — only the file path differs:
            <span className="block mt-1 space-y-0.5">
              <span className="block"><strong>Claude Desktop</strong> — <code className="text-xs bg-muted px-1 py-0.5 rounded">claude_desktop_config.json</code></span>
              <span className="block"><strong>Cursor</strong> — <code className="text-xs bg-muted px-1 py-0.5 rounded">.cursor/mcp.json</code> (in project root or home dir)</span>
              <span className="block"><strong>Windsurf</strong> — <code className="text-xs bg-muted px-1 py-0.5 rounded">~/.codeium/windsurf/mcp_config.json</code></span>
              <span className="block"><strong>Cline / other</strong> — check your client's MCP settings</span>
            </span>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="relative">
            <pre className="text-xs bg-muted rounded p-3 overflow-auto whitespace-pre-wrap break-all"
              data-testid="claude-config-snippet">{JSON.stringify({
                mcpServers: {
                  nanoorch: {
                    url: mcpEndpoint,
                    headers: { Authorization: "Bearer <YOUR_API_KEY>" },
                  },
                },
              }, null, 2)}</pre>
            <div className="absolute top-2 right-2">
              <CopyButton text={JSON.stringify({
                mcpServers: {
                  nanoorch: {
                    url: mcpEndpoint,
                    headers: { Authorization: "Bearer <YOUR_API_KEY>" },
                  },
                },
              }, null, 2)} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Replace <code className="bg-muted px-1 py-0.5 rounded text-xs">&lt;YOUR_API_KEY&gt;</code> with an API key you create below.
          </p>
        </CardContent>
      </Card>

      {/* Available Tools */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Available MCP Tools</CardTitle>
          <CardDescription>These tools are exposed to connected AI clients in this workspace.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid sm:grid-cols-2 gap-2">
            {[
              { name: "list_orchestrators", desc: "List all orchestrators with status, provider, and model" },
              { name: "list_agents", desc: "List all agents with their orchestrator and intent" },
              { name: "run_task", desc: "Submit a task to an agent and get the output" },
              { name: "get_task_status", desc: "Check status, output, and logs for any task" },
              { name: "list_pending_approvals", desc: "See all approval requests waiting for review" },
              { name: "approve_request", desc: "Approve or reject a pending approval gate" },
              { name: "trigger_pipeline", desc: "Manually fire a pipeline run" },
              { name: "fire_scheduled_job", desc: "Immediately run a scheduled job on demand" },
            ].map(tool => (
              <div key={tool.name} className="flex items-start gap-2 p-2 rounded border bg-card"
                data-testid={`tool-card-${tool.name}`}>
                <code className="text-xs font-mono text-primary shrink-0 mt-0.5">{tool.name}</code>
                <span className="text-xs text-muted-foreground">{tool.desc}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* API Keys */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Key className="w-4 h-4" /> API Keys
              </CardTitle>
              <CardDescription className="mt-1">Each key is scoped to this workspace. Keys are shown only once — store them securely.</CardDescription>
            </div>
            <Button size="sm" onClick={() => setCreateOpen(true)} data-testid="button-create-mcp-key">
              <Plus className="w-4 h-4 mr-1" /> New Key
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading keys…</p>
          ) : keys.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Key className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No API keys yet. Create one to connect an MCP client.</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {keys.map(key => (
                <div key={key.id} className="flex items-center justify-between py-3 gap-4"
                  data-testid={`mcp-key-row-${key.id}`}>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{key.name}</p>
                    <p className="text-xs text-muted-foreground">
                      Created {timeAgo(key.createdAt)} · Last used: {timeAgo(key.lastUsedAt)}
                    </p>
                  </div>
                  <Button variant="ghost" size="sm" className="text-red-400 hover:text-red-300 h-7 w-7 p-0 shrink-0"
                    onClick={() => setDeleteId(key.id)} data-testid={`button-revoke-key-${key.id}`}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create key dialog */}
      <Dialog open={createOpen} onOpenChange={v => { setCreateOpen(v); if (!v) setRevealedKey(null); }}>
        <DialogContent data-testid="dialog-create-mcp-key">
          <DialogHeader>
            <DialogTitle>New MCP API Key</DialogTitle>
            <DialogDescription>Give this key a descriptive name to identify what's using it.</DialogDescription>
          </DialogHeader>

          {!revealedKey ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="key-name">Key Name</Label>
                <Input id="key-name" placeholder="e.g. Claude Desktop – laptop"
                  value={newKeyName}
                  onChange={e => setNewKeyName(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleCreate()}
                  data-testid="input-mcp-key-name" />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
                <Button onClick={handleCreate} disabled={!newKeyName.trim() || createMutation.isPending}
                  data-testid="button-confirm-create-mcp-key">
                  {createMutation.isPending ? "Creating…" : "Create Key"}
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <Alert className="border-green-500/40 bg-green-500/5">
                <AlertDescription className="text-green-400 text-sm">
                  Key created! Copy it now — it won't be shown again.
                </AlertDescription>
              </Alert>
              <div className="flex items-center gap-2 font-mono text-sm bg-muted rounded px-3 py-2">
                <span className="flex-1 break-all" data-testid="revealed-api-key">{revealedKey}</span>
                <CopyButton text={revealedKey} />
              </div>
              <DialogFooter>
                <Button onClick={() => { setCreateOpen(false); setRevealedKey(null); }}
                  data-testid="button-done-create-mcp-key">Done</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Confirm revoke dialog */}
      <Dialog open={!!deleteId} onOpenChange={v => !v && setDeleteId(null)}>
        <DialogContent data-testid="dialog-revoke-mcp-key">
          <DialogHeader>
            <DialogTitle>Revoke API Key</DialogTitle>
            <DialogDescription>Any client using this key will immediately lose access. This cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => deleteId && deleteMutation.mutate(deleteId)}
              disabled={deleteMutation.isPending} data-testid="button-confirm-revoke-mcp-key">
              {deleteMutation.isPending ? "Revoking…" : "Revoke Key"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

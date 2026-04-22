import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { KeyRound, Trash2, Pencil, Globe, Building2, CheckCircle2, XCircle } from "lucide-react";
import type { Workspace } from "@shared/schema";

const PROVIDERS = [
  { id: "openai",    label: "OpenAI",    placeholder: "sk-…" },
  { id: "anthropic", label: "Anthropic", placeholder: "sk-ant-…" },
  { id: "gemini",    label: "Google Gemini", placeholder: "AIza…" },
];

interface ProviderKeyEntry {
  id: string;
  workspaceId: string | null;
  provider: string;
  baseUrl: string | null;
  hasKey: boolean;
}

interface KeyDialogState {
  scope: "global" | "workspace";
  workspaceId: string | null;
  workspaceName: string;
  provider: string;
  existingBaseUrl: string;
}

export default function ProviderKeysPage() {
  const { toast } = useToast();
  const [dialog, setDialog] = useState<KeyDialogState | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [selectedWid, setSelectedWid] = useState<string>("__none__");

  const { data: globalKeys = [] } = useQuery<ProviderKeyEntry[]>({
    queryKey: ["/api/admin/provider-keys"],
  });

  const { data: workspaces = [] } = useQuery<Workspace[]>({
    queryKey: ["/api/workspaces"],
  });

  const { data: wsKeys = [] } = useQuery<ProviderKeyEntry[]>({
    queryKey: ["/api/workspaces", selectedWid, "provider-keys"],
    queryFn: async () => {
      if (!selectedWid || selectedWid === "__none__") return [];
      const res = await fetch(`/api/workspaces/${selectedWid}/provider-keys`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: selectedWid !== "__none__",
  });

  const upsertGlobal = useMutation({
    mutationFn: ({ provider, apiKey, baseUrl }: { provider: string; apiKey: string; baseUrl?: string }) =>
      apiRequest("PUT", `/api/admin/provider-keys/${provider}`, { apiKey, baseUrl }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/provider-keys"] });
      toast({ title: "Key saved", description: "Global provider key updated." });
      setDialog(null);
    },
    onError: () => toast({ title: "Error", description: "Failed to save key.", variant: "destructive" }),
  });

  const deleteGlobal = useMutation({
    mutationFn: (provider: string) => apiRequest("DELETE", `/api/admin/provider-keys/${provider}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/provider-keys"] });
      toast({ title: "Key removed", description: "Global key deleted." });
    },
    onError: () => toast({ title: "Error", description: "Failed to delete key.", variant: "destructive" }),
  });

  const upsertWs = useMutation({
    mutationFn: ({ wid, provider, apiKey, baseUrl }: { wid: string; provider: string; apiKey: string; baseUrl?: string }) =>
      apiRequest("PUT", `/api/workspaces/${wid}/provider-keys/${provider}`, { apiKey, baseUrl }),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/workspaces", vars.wid, "provider-keys"] });
      toast({ title: "Key saved", description: "Workspace provider key updated." });
      setDialog(null);
    },
    onError: () => toast({ title: "Error", description: "Failed to save key.", variant: "destructive" }),
  });

  const deleteWs = useMutation({
    mutationFn: ({ wid, provider }: { wid: string; provider: string }) =>
      apiRequest("DELETE", `/api/workspaces/${wid}/provider-keys/${provider}`),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/workspaces", vars.wid, "provider-keys"] });
      toast({ title: "Key removed", description: "Workspace key deleted." });
    },
    onError: () => toast({ title: "Error", description: "Failed to delete key.", variant: "destructive" }),
  });

  function openDialog(state: KeyDialogState) {
    setDialog(state);
    setApiKey("");
    setBaseUrl(state.existingBaseUrl ?? "");
  }

  function handleSave() {
    if (!dialog) return;
    if (!apiKey.trim()) {
      toast({ title: "API key required", variant: "destructive" });
      return;
    }
    if (dialog.scope === "global") {
      upsertGlobal.mutate({ provider: dialog.provider, apiKey: apiKey.trim(), baseUrl: baseUrl.trim() || undefined });
    } else {
      upsertWs.mutate({ wid: dialog.workspaceId!, provider: dialog.provider, apiKey: apiKey.trim(), baseUrl: baseUrl.trim() || undefined });
    }
  }

  const isSaving = upsertGlobal.isPending || upsertWs.isPending;

  const globalKeyMap = Object.fromEntries(globalKeys.map((k) => [k.provider, k]));
  const wsKeyMap = Object.fromEntries(wsKeys.map((k) => [k.provider, k]));

  return (
    <div className="p-6 space-y-8 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <KeyRound className="w-6 h-6 text-primary" />
          Provider Keys
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage AI provider API keys. Global keys act as platform-wide defaults; workspace keys override them per workspace (BYOK).
        </p>
      </div>

      {/* Global keys */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Globe className="w-4 h-4 text-blue-500" />
            Platform Keys
          </CardTitle>
          <CardDescription>Set by global admins — used as fallback for all workspaces unless overridden.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {PROVIDERS.map((p) => {
            const existing = globalKeyMap[p.id];
            return (
              <div key={p.id} className="flex items-center justify-between rounded-lg border px-4 py-3 bg-card" data-testid={`global-key-row-${p.id}`}>
                <div className="flex items-center gap-3">
                  <span className="font-medium text-sm">{p.label}</span>
                  {existing?.hasKey ? (
                    <Badge variant="secondary" className="flex items-center gap-1 text-xs text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/40 border-green-200 dark:border-green-800">
                      <CheckCircle2 className="w-3 h-3" /> Key set
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="flex items-center gap-1 text-xs text-muted-foreground">
                      <XCircle className="w-3 h-3" /> Not set
                    </Badge>
                  )}
                  {existing?.baseUrl && (
                    <span className="text-xs text-muted-foreground truncate max-w-[180px]">{existing.baseUrl}</span>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline" size="sm"
                    data-testid={`btn-set-global-${p.id}`}
                    onClick={() => openDialog({
                      scope: "global", workspaceId: null, workspaceName: "Platform",
                      provider: p.id, existingBaseUrl: existing?.baseUrl ?? "",
                    })}
                  >
                    <Pencil className="w-3.5 h-3.5 mr-1" />
                    {existing?.hasKey ? "Update" : "Set"}
                  </Button>
                  {existing?.hasKey && (
                    <Button
                      variant="ghost" size="sm"
                      data-testid={`btn-delete-global-${p.id}`}
                      className="text-destructive hover:text-destructive"
                      onClick={() => deleteGlobal.mutate(p.id)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Workspace BYOK */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Building2 className="w-4 h-4 text-violet-500" />
            Workspace Keys (BYOK)
          </CardTitle>
          <CardDescription>Per-workspace overrides — takes precedence over platform keys for that workspace.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <Label className="shrink-0 text-sm">Workspace</Label>
            <Select value={selectedWid} onValueChange={setSelectedWid}>
              <SelectTrigger className="w-64" data-testid="select-workspace">
                <SelectValue placeholder="Select a workspace…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">— select —</SelectItem>
                {workspaces.map((w) => (
                  <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedWid !== "__none__" && (
            <div className="space-y-3">
              {PROVIDERS.map((p) => {
                const existing = wsKeyMap[p.id];
                const ws = workspaces.find((w) => w.id === selectedWid);
                return (
                  <div key={p.id} className="flex items-center justify-between rounded-lg border px-4 py-3 bg-card" data-testid={`ws-key-row-${p.id}`}>
                    <div className="flex items-center gap-3">
                      <span className="font-medium text-sm">{p.label}</span>
                      {existing?.hasKey ? (
                        <Badge variant="secondary" className="flex items-center gap-1 text-xs text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/40 border-green-200 dark:border-green-800">
                          <CheckCircle2 className="w-3 h-3" /> Override set
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="flex items-center gap-1 text-xs text-muted-foreground">
                          <XCircle className="w-3 h-3" /> Uses platform key
                        </Badge>
                      )}
                      {existing?.baseUrl && (
                        <span className="text-xs text-muted-foreground truncate max-w-[180px]">{existing.baseUrl}</span>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline" size="sm"
                        data-testid={`btn-set-ws-${p.id}`}
                        onClick={() => openDialog({
                          scope: "workspace", workspaceId: selectedWid,
                          workspaceName: ws?.name ?? selectedWid,
                          provider: p.id, existingBaseUrl: existing?.baseUrl ?? "",
                        })}
                      >
                        <Pencil className="w-3.5 h-3.5 mr-1" />
                        {existing?.hasKey ? "Update" : "Set"}
                      </Button>
                      {existing?.hasKey && (
                        <Button
                          variant="ghost" size="sm"
                          data-testid={`btn-delete-ws-${p.id}`}
                          className="text-destructive hover:text-destructive"
                          onClick={() => deleteWs.mutate({ wid: selectedWid, provider: p.id })}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Set/Update key dialog */}
      <Dialog open={!!dialog} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="w-4 h-4" />
              {dialog?.scope === "global" ? "Platform" : dialog?.workspaceName} — {PROVIDERS.find((p) => p.id === dialog?.provider)?.label}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="api-key-input">API Key</Label>
              <Input
                id="api-key-input"
                type="password"
                placeholder={PROVIDERS.find((p) => p.id === dialog?.provider)?.placeholder ?? "sk-…"}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                autoComplete="off"
                data-testid="input-api-key"
              />
              <p className="text-xs text-muted-foreground">Stored encrypted with AES-256-GCM. Leave blank to keep existing key.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="base-url-input">Custom Base URL <span className="text-muted-foreground">(optional)</span></Label>
              <Input
                id="base-url-input"
                placeholder="https://your-proxy.example.com/v1"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                data-testid="input-base-url"
              />
              <p className="text-xs text-muted-foreground">Override the default API endpoint (e.g., Azure OpenAI, vLLM, or local proxy).</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>Cancel</Button>
            <Button onClick={handleSave} disabled={isSaving} data-testid="btn-save-key">
              {isSaving ? "Saving…" : "Save Key"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

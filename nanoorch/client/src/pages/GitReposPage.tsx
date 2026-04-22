import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Plus, Trash2, Copy, GitBranch, CheckCircle, XCircle, Clock,
  RefreshCw, Info, ChevronDown, ChevronUp, Eye, EyeOff,
} from "lucide-react";
import { SiGithub, SiGitlab } from "react-icons/si";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

interface GitRepo {
  id: string;
  workspaceId: string;
  provider: string;
  repoPath: string;
  repoUrl: string | null;
  webhookId: string | null;
  lastYmlSha: string | null;
  lastYmlProcessedAt: string | null;
  isActive: boolean;
  createdAt: string;
}

interface GitAgentRun {
  id: string;
  repoId: string;
  gitAgentId: string | null;
  gitAgentSlug: string;
  taskId: string | null;
  eventType: string;
  eventRef: string | null;
  status: string;
  skipReason: string | null;
  errorMessage: string | null;
  createdAt: string;
}

interface ConnectResult extends GitRepo {
  webhookSecret: string;
}

const connectSchema = z.object({
  provider: z.enum(["github", "gitlab"]),
  repoPath: z.string().min(1, "Required (e.g. org/repo)").regex(/^[^/]+\/[^/]+$/, "Must be in format org/repo"),
  repoUrl: z.string().optional(),
  token: z.string().min(1, "Access token is required"),
});

type ConnectValues = z.infer<typeof connectSchema>;

interface Props { workspaceId: string }

export default function GitReposPage({ workspaceId }: Props) {
  const { toast } = useToast();
  const [connectOpen, setConnectOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [expandedRuns, setExpandedRuns] = useState<Set<string>>(new Set());
  const [secretVisible, setSecretVisible] = useState<Record<string, boolean>>({});
  const [justConnected, setJustConnected] = useState<ConnectResult | null>(null);

  const { data: repos = [], isLoading } = useQuery<GitRepo[]>({
    queryKey: [`/api/workspaces/${workspaceId}/git-repos`],
  });

  const { data: runsMap } = useQuery<Record<string, GitAgentRun[]>>({
    queryKey: [`/api/workspaces/${workspaceId}/git-repos/all-runs`],
    enabled: repos.length > 0,
    queryFn: async () => {
      const results: Record<string, GitAgentRun[]> = {};
      await Promise.all(repos.map(async (r) => {
        try {
          const res = await fetch(`/api/workspaces/${workspaceId}/git-repos/${r.id}/runs?limit=10`, { credentials: "include" });
          if (res.ok) results[r.id] = await res.json();
        } catch {}
      }));
      return results;
    },
  });

  const form = useForm<ConnectValues>({
    resolver: zodResolver(connectSchema),
    defaultValues: { provider: "github", repoPath: "", repoUrl: "", token: "" },
  });

  const connectMutation = useMutation({
    mutationFn: async (data: ConnectValues) => {
      const res = await apiRequest("POST", `/api/workspaces/${workspaceId}/git-repos`, data);
      return res.json() as Promise<ConnectResult>;
    },
    onSuccess: (data: ConnectResult) => {
      queryClient.invalidateQueries({ queryKey: [`/api/workspaces/${workspaceId}/git-repos`] });
      setConnectOpen(false);
      form.reset();
      setJustConnected(data);
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/workspaces/${workspaceId}/git-repos/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/workspaces/${workspaceId}/git-repos`] });
      toast({ title: "Repository disconnected" });
      setDeleteId(null);
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  function toggleRuns(repoId: string) {
    setExpandedRuns((prev) => {
      const next = new Set(prev);
      if (next.has(repoId)) next.delete(repoId); else next.add(repoId);
      return next;
    });
  }

  function copyToClipboard(text: string, label: string) {
    navigator.clipboard.writeText(text);
    toast({ title: `${label} copied` });
  }

  function webhookUrl(repoId: string) {
    return `${window.location.origin}/api/webhooks/git/${repoId}`;
  }

  const statusBadge = (status: string) => {
    switch (status) {
      case "completed": return <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-0 text-[10px] h-4 px-1.5"><CheckCircle className="w-2.5 h-2.5 mr-0.5" />done</Badge>;
      case "failed": return <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-0 text-[10px] h-4 px-1.5"><XCircle className="w-2.5 h-2.5 mr-0.5" />failed</Badge>;
      case "running": return <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border-0 text-[10px] h-4 px-1.5"><RefreshCw className="w-2.5 h-2.5 mr-0.5 animate-spin" />running</Badge>;
      case "skipped": return <Badge variant="secondary" className="text-[10px] h-4 px-1.5">skipped</Badge>;
      default: return <Badge variant="secondary" className="text-[10px] h-4 px-1.5"><Clock className="w-2.5 h-2.5 mr-0.5" />{status}</Badge>;
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <GitBranch className="w-6 h-6 text-primary" />
            Git Repositories
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Connect GitHub or GitLab repositories to receive webhook events and trigger git agents.
          </p>
        </div>
        <Button data-testid="button-connect-repo" size="sm" onClick={() => setConnectOpen(true)}>
          <Plus className="w-4 h-4 mr-1.5" />
          Connect Repo
        </Button>
      </div>

      {/* How it works */}
      <div className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30 p-4 flex gap-3">
        <Info className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
        <div className="text-sm text-blue-800 dark:text-blue-200 space-y-1">
          <p className="font-medium">How it works</p>
          <ol className="text-blue-700 dark:text-blue-300 text-xs list-decimal list-inside space-y-0.5">
            <li>Connect a repo here with a read-only access token and obtain the webhook URL + secret.</li>
            <li>Add the webhook to your repository settings (GitHub: Settings → Webhooks; GitLab: Settings → Webhooks). Content type: application/json.</li>
            <li>Push a <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">.nanoorch.yml</code> to your repository root listing which agents to enable.</li>
            <li>NanoOrch validates the signature, fetches the YAML at the commit SHA, matches agents, and creates tasks.</li>
          </ol>
        </div>
      </div>

      {/* Repos list */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => <div key={i} className="border rounded-xl p-5 h-24 animate-pulse bg-muted/30" />)}
        </div>
      ) : repos.length === 0 ? (
        <div className="border-2 border-dashed rounded-xl p-12 text-center text-muted-foreground">
          <GitBranch className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No repositories connected</p>
          <p className="text-sm mt-1">Click "Connect Repo" to link your first GitHub or GitLab repository.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {repos.map((repo) => {
            const runs = runsMap?.[repo.id] ?? [];
            const expanded = expandedRuns.has(repo.id);
            const wUrl = webhookUrl(repo.id);

            return (
              <div key={repo.id} data-testid={`card-git-repo-${repo.id}`} className="border rounded-xl overflow-hidden bg-card">
                <div className="p-5 space-y-4">
                  {/* Repo header */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      {repo.provider === "github" ? (
                        <SiGithub className="w-5 h-5 shrink-0 text-foreground" />
                      ) : (
                        <SiGitlab className="w-5 h-5 shrink-0 text-orange-500" />
                      )}
                      <div className="min-w-0">
                        <div className="font-semibold text-sm">{repo.repoPath}</div>
                        <div className="text-xs text-muted-foreground">{{ github: "GitHub", gitlab: "GitLab" }[repo.provider] ?? repo.provider}</div>
                      </div>
                      {!repo.isActive && <Badge variant="secondary" className="text-[10px]">Inactive</Badge>}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        data-testid={`button-toggle-runs-${repo.id}`}
                        variant="ghost" size="sm" className="text-xs gap-1"
                        onClick={() => toggleRuns(repo.id)}
                      >
                        {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        {runs.length} run{runs.length !== 1 ? "s" : ""}
                      </Button>
                      <Button
                        data-testid={`button-delete-repo-${repo.id}`}
                        variant="ghost" size="icon" className="w-7 h-7 text-destructive hover:text-destructive"
                        onClick={() => setDeleteId(repo.id)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>

                  {/* Webhook URL */}
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Webhook URL</Label>
                    <div className="flex items-center gap-2 bg-muted rounded px-3 py-2">
                      <code className="text-xs flex-1 truncate">{wUrl}</code>
                      <Button variant="ghost" size="icon" className="w-6 h-6 shrink-0" onClick={() => copyToClipboard(wUrl, "Webhook URL")}>
                        <Copy className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>

                  {/* Metadata */}
                  {repo.lastYmlProcessedAt && (
                    <div className="text-xs text-muted-foreground flex items-center gap-4">
                      <span>Last processed: {new Date(repo.lastYmlProcessedAt).toLocaleString()}</span>
                      {repo.lastYmlSha && <span>SHA: <code>{repo.lastYmlSha.slice(0, 8)}</code></span>}
                    </div>
                  )}
                </div>

                {/* Runs panel */}
                {expanded && (
                  <>
                    <Separator />
                    <div className="p-4 space-y-2">
                      <p className="text-xs font-medium text-muted-foreground">Recent runs</p>
                      {runs.length === 0 ? (
                        <p className="text-xs text-muted-foreground italic">No runs yet. Webhook events will appear here.</p>
                      ) : (
                        <div className="space-y-1.5">
                          {runs.map((run) => (
                            <div key={run.id} data-testid={`row-run-${run.id}`} className="flex items-center gap-3 text-xs py-1.5 border-b border-border/50 last:border-0">
                              <div className="w-28 shrink-0">{statusBadge(run.status)}</div>
                              <code className="text-muted-foreground shrink-0">{run.gitAgentSlug}</code>
                              <span className="text-muted-foreground shrink-0">{run.eventType}</span>
                              {run.eventRef && <code className="text-muted-foreground truncate max-w-[100px]">{run.eventRef}</code>}
                              {run.skipReason && <span className="text-muted-foreground truncate italic">{run.skipReason}</span>}
                              {run.errorMessage && <span className="text-red-600 dark:text-red-400 truncate">{run.errorMessage}</span>}
                              <span className="ml-auto text-muted-foreground shrink-0">{new Date(run.createdAt).toLocaleTimeString()}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Connect dialog */}
      <Dialog open={connectOpen} onOpenChange={(o) => { setConnectOpen(o); if (!o) form.reset(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Connect Repository</DialogTitle>
            <DialogDescription>Link a GitHub or GitLab repository. NanoOrch will generate a webhook secret for HMAC signature validation.</DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit((d) => connectMutation.mutate(d))} className="space-y-4">
              <FormField control={form.control} name="provider" render={({ field }) => (
                <FormItem>
                  <FormLabel>Provider</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger data-testid="select-repo-provider">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="github"><div className="flex items-center gap-2"><SiGithub className="w-4 h-4" />GitHub</div></SelectItem>
                      <SelectItem value="gitlab"><div className="flex items-center gap-2"><SiGitlab className="w-4 h-4 text-orange-500" />GitLab</div></SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="repoPath" render={({ field }) => (
                <FormItem>
                  <FormLabel>Repository Path</FormLabel>
                  <FormControl><Input data-testid="input-repo-path" placeholder="org/repository-name" {...field} /></FormControl>
                  <FormDescription>The full repository path in <code>owner/repo</code> format.</FormDescription>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="repoUrl" render={({ field }) => (
                <FormItem>
                  <FormLabel>Base URL <span className="text-muted-foreground">(GitLab self-hosted only)</span></FormLabel>
                  <FormControl><Input data-testid="input-repo-url" placeholder="https://gitlab.yourcompany.com" {...field} /></FormControl>
                  <FormDescription>Leave blank for github.com or gitlab.com.</FormDescription>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="token" render={({ field }) => (
                <FormItem>
                  <FormLabel>Access Token</FormLabel>
                  <FormControl><Input data-testid="input-repo-token" type="password" placeholder="ghp_… or glpat-…" {...field} /></FormControl>
                  <FormDescription>Used to fetch <code>.nanoorch.yml</code> from the repository. Stored encrypted at rest.</FormDescription>
                  <FormMessage />
                </FormItem>
              )} />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setConnectOpen(false)}>Cancel</Button>
                <Button data-testid="button-submit-connect-repo" type="submit" disabled={connectMutation.isPending}>
                  {connectMutation.isPending ? "Connecting…" : "Connect Repository"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Post-connect: show webhook secret */}
      <Dialog open={!!justConnected} onOpenChange={(o) => !o && setJustConnected(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><CheckCircle className="w-5 h-5 text-green-600" /> Repository Connected</DialogTitle>
            <DialogDescription>
              Copy these values now — the webhook secret is shown only once and cannot be retrieved later.
            </DialogDescription>
          </DialogHeader>
          {justConnected && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Webhook URL (paste into repository settings)</Label>
                <div className="flex items-center gap-2 bg-muted rounded px-3 py-2">
                  <code className="text-xs flex-1 truncate">{webhookUrl(justConnected.id)}</code>
                  <Button variant="ghost" size="icon" className="w-6 h-6" onClick={() => copyToClipboard(webhookUrl(justConnected.id), "Webhook URL")}>
                    <Copy className="w-3 h-3" />
                  </Button>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Webhook Secret (set in repository webhook settings as "Secret")</Label>
                <div className="flex items-center gap-2 bg-muted rounded px-3 py-2">
                  <code className="text-xs flex-1 truncate font-mono">
                    {secretVisible["new"] ? justConnected.webhookSecret : "••••••••••••••••••••••••"}
                  </code>
                  <Button variant="ghost" size="icon" className="w-6 h-6" onClick={() => setSecretVisible((p) => ({ ...p, new: !p["new"] }))}>
                    {secretVisible["new"] ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                  </Button>
                  <Button variant="ghost" size="icon" className="w-6 h-6" onClick={() => copyToClipboard(justConnected.webhookSecret, "Webhook secret")}>
                    <Copy className="w-3 h-3" />
                  </Button>
                </div>
              </div>
              <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-3 text-xs text-amber-800 dark:text-amber-200">
                <strong>Content type:</strong> application/json &nbsp;|&nbsp; <strong>Events:</strong> push, pull_request (or merge request events for GitLab)
              </div>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setJustConnected(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect Repository?</AlertDialogTitle>
            <AlertDialogDescription>This will permanently remove the repository, its webhook configuration, and all run history. Webhooks from this repo will return 404.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteMutation.mutate(deleteId!)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Disconnect
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

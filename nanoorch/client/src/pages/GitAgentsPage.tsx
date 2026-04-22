import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Plus, GitBranch, Trash2, Edit, Shield, Lock, CheckCircle,
  ChevronRight, Copy, Cpu, Zap, LayoutList, Box, Search, Info,
  MessageSquare, Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
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
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { Orchestrator } from "@shared/schema";

interface GitAgent {
  id: string;
  workspaceId: string;
  name: string;
  slug: string;
  description: string | null;
  orchestratorId: string | null;
  systemPrompt: string | null;
  tools: string[];
  memoryEnabled: boolean;
  outputConfig: { defaultOutputs: Array<{ type: string; channel?: string; context?: string; onlyOnFailure?: boolean }> };
  approvalConfig: { required: boolean; channelId?: string; timeoutSeconds?: number };
  isMandatory: boolean;
  requiresAdminApproval: boolean;
  isActive: boolean;
  notifyChannelId: string | null;
  postGitComment: boolean;
  createdAt: string;
  runCount: number;
}

interface CommsChannel {
  id: string;
  name: string;
  type: string;
}

const TEMPLATES = [
  {
    name: "Code Reviewer",
    slug: "code-reviewer",
    description: "Reviews merge/pull requests for code quality, best practices, and potential bugs.",
    systemPrompt: `You are a senior software engineer performing a code review. Analyze the code changes described in the event context above. Focus on:
- Correctness and logic errors
- Code quality and maintainability
- Security concerns
- Performance implications
- Missing tests or documentation

Provide structured, actionable feedback. Be specific about file:line references when possible. Format your response as a clear review summary.`,
    isMandatory: false,
    requiresAdminApproval: false,
    memoryEnabled: false,
  },
  {
    name: "Security Scanner",
    slug: "security-scanner",
    description: "Scans pushes and MRs for secrets, vulnerabilities, and dangerous code patterns.",
    systemPrompt: `You are a security expert performing an automated security scan. Analyze the code changes described in the event context above for:
- Hardcoded secrets, API keys, credentials, or tokens
- SQL injection, XSS, path traversal, and other OWASP Top 10 issues
- Insecure dependencies or imports
- Authentication/authorisation bypasses
- Sensitive data exposure

Return a structured security report: PASS if no critical issues, FAIL with detailed findings otherwise. Flag severity as CRITICAL, HIGH, MEDIUM, or LOW.`,
    isMandatory: true,
    requiresAdminApproval: false,
    memoryEnabled: false,
  },
  {
    name: "Dependency Auditor",
    slug: "dependency-auditor",
    description: "Checks for outdated, vulnerable, or license-non-compliant dependencies on package file changes.",
    systemPrompt: `You are a dependency management expert. Analyze the dependency file changes in the event context above (package.json, requirements.txt, go.mod, etc). Check for:
- Known vulnerable package versions
- Packages with incompatible open-source licenses
- Unnecessarily heavy dependencies
- Packages with poor maintenance signals

Provide a dependency audit report with recommended actions.`,
    isMandatory: false,
    requiresAdminApproval: false,
    memoryEnabled: false,
  },
  {
    name: "Pipeline Failure Analyst",
    slug: "pipeline-analyst",
    description: "Analyses CI/CD pipeline failures and suggests root causes and fixes.",
    systemPrompt: `You are a DevOps expert specialising in CI/CD pipeline analysis. Based on the pipeline failure event context above, provide:
- Likely root cause of the failure
- Specific steps to reproduce and fix the issue
- Preventative recommendations to avoid recurrence

Be concise and actionable. If the cause is ambiguous, list the top 3 hypotheses ranked by likelihood.`,
    isMandatory: false,
    requiresAdminApproval: false,
    memoryEnabled: false,
  },
  {
    name: "Release Notes Generator",
    slug: "release-notes",
    description: "Generates human-readable release notes from commits when pushing to main.",
    systemPrompt: `You are a technical writer. Based on the commit information in the event context above, generate professional release notes suitable for a changelog or announcement. Group changes into: New Features, Bug Fixes, Performance Improvements, Breaking Changes, and Other. Use clear, non-technical language where possible while preserving important technical details.`,
    isMandatory: false,
    requiresAdminApproval: false,
    memoryEnabled: true,
  },
  {
    name: "Daily Standup Summariser",
    slug: "standup-summariser",
    description: "Scheduled agent that summarises recent repository activity for morning standups.",
    systemPrompt: `You are an engineering team assistant. Summarise the recent repository activity from the event context for a daily standup meeting. Include: what was merged/pushed yesterday, any open PRs needing review, and any pipeline failures. Keep it concise — 5-10 bullet points maximum. Format for Slack.`,
    isMandatory: false,
    requiresAdminApproval: false,
    memoryEnabled: false,
  },
];

const agentFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  slug: z.string().min(1, "Slug is required").regex(/^[a-z0-9-]+$/, "Slug must be lowercase letters, numbers and hyphens only"),
  description: z.string().optional(),
  orchestratorId: z.string().nullable().optional(),
  systemPrompt: z.string().optional(),
  memoryEnabled: z.boolean().default(false),
  isMandatory: z.boolean().default(false),
  requiresAdminApproval: z.boolean().default(false),
  isActive: z.boolean().default(true),
  approvalRequired: z.boolean().default(false),
  approvalTimeoutSeconds: z.number().nullable().optional(),
  postGitComment: z.boolean().default(true),
  notifyChannelId: z.string().nullable().optional(),
});

type AgentFormValues = z.infer<typeof agentFormSchema>;

const EVENT_VARIABLES = [
  "{{ event.repo_path }}", "{{ event.provider }}", "{{ event.event_type }}",
  "{{ event.branch }}", "{{ event.target_branch }}", "{{ event.source_branch }}",
  "{{ event.commit_sha }}", "{{ event.commit_message }}", "{{ event.author_login }}",
  "{{ event.pr_title }}", "{{ event.pr_number }}", "{{ event.changed_files }}",
];

interface Props { workspaceId: string }

export default function GitAgentsPage({ workspaceId }: Props) {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingAgent, setEditingAgent] = useState<GitAgent | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<typeof TEMPLATES[0] | null>(null);

  const { data: agents = [], isLoading } = useQuery<GitAgent[]>({
    queryKey: [`/api/workspaces/${workspaceId}/git-agents`],
  });

  const { data: orchestrators = [] } = useQuery<Orchestrator[]>({
    queryKey: [`/api/workspaces/${workspaceId}/orchestrators`],
  });

  const { data: commsChannels = [] } = useQuery<CommsChannel[]>({
    queryKey: [`/api/workspaces/${workspaceId}/channels`],
  });

  const form = useForm<AgentFormValues>({
    resolver: zodResolver(agentFormSchema),
    defaultValues: {
      name: "", slug: "", description: "", orchestratorId: null,
      systemPrompt: "", memoryEnabled: false, isMandatory: false,
      requiresAdminApproval: false, isActive: true, approvalRequired: false,
      approvalTimeoutSeconds: null, postGitComment: true, notifyChannelId: null,
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: AgentFormValues) => apiRequest("POST", `/api/workspaces/${workspaceId}/git-agents`, buildPayload(data)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/workspaces/${workspaceId}/git-agents`] });
      toast({ title: "Git agent created" });
      setDialogOpen(false);
      form.reset();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: (data: AgentFormValues) => apiRequest("PUT", `/api/workspaces/${workspaceId}/git-agents/${editingAgent!.id}`, buildPayload(data)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/workspaces/${workspaceId}/git-agents`] });
      toast({ title: "Git agent updated" });
      setDialogOpen(false);
      setEditingAgent(null);
      form.reset();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/workspaces/${workspaceId}/git-agents/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/workspaces/${workspaceId}/git-agents`] });
      toast({ title: "Git agent deleted" });
      setDeleteId(null);
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  function buildPayload(data: AgentFormValues) {
    return {
      name: data.name,
      slug: data.slug,
      description: data.description || null,
      orchestratorId: data.orchestratorId || null,
      systemPrompt: data.systemPrompt || "",
      memoryEnabled: data.memoryEnabled,
      isMandatory: data.isMandatory,
      requiresAdminApproval: data.requiresAdminApproval,
      isActive: data.isActive,
      approvalConfig: { required: data.approvalRequired, timeoutSeconds: data.approvalTimeoutSeconds ?? undefined },
      outputConfig: { defaultOutputs: [] },
      tools: [],
      postGitComment: data.postGitComment,
      notifyChannelId: data.notifyChannelId || null,
    };
  }

  function openCreate() {
    setEditingAgent(null);
    form.reset({ name: "", slug: "", description: "", orchestratorId: null, systemPrompt: "", memoryEnabled: false, isMandatory: false, requiresAdminApproval: false, isActive: true, approvalRequired: false, approvalTimeoutSeconds: null, postGitComment: true, notifyChannelId: null });
    setDialogOpen(true);
  }

  function openEdit(agent: GitAgent) {
    setEditingAgent(agent);
    const approvalConfig = agent.approvalConfig as { required?: boolean; timeoutSeconds?: number } | null;
    form.reset({
      name: agent.name,
      slug: agent.slug,
      description: agent.description ?? "",
      orchestratorId: agent.orchestratorId ?? null,
      systemPrompt: agent.systemPrompt ?? "",
      memoryEnabled: agent.memoryEnabled,
      isMandatory: agent.isMandatory,
      requiresAdminApproval: agent.requiresAdminApproval,
      isActive: agent.isActive,
      approvalRequired: approvalConfig?.required ?? false,
      approvalTimeoutSeconds: approvalConfig?.timeoutSeconds ?? null,
      postGitComment: agent.postGitComment ?? true,
      notifyChannelId: agent.notifyChannelId ?? null,
    });
    setDialogOpen(true);
  }

  function applyTemplate(tpl: typeof TEMPLATES[0]) {
    form.setValue("name", tpl.name);
    form.setValue("slug", tpl.slug);
    form.setValue("description", tpl.description);
    form.setValue("systemPrompt", tpl.systemPrompt);
    form.setValue("isMandatory", tpl.isMandatory);
    form.setValue("requiresAdminApproval", tpl.requiresAdminApproval);
    form.setValue("memoryEnabled", tpl.memoryEnabled);
    setTemplateDialogOpen(false);
    setDialogOpen(true);
  }

  function onSubmit(data: AgentFormValues) {
    if (editingAgent) {
      updateMutation.mutate(data);
    } else {
      createMutation.mutate(data);
    }
  }

  const filtered = agents.filter((a) =>
    !search || a.name.toLowerCase().includes(search.toLowerCase()) || a.slug.includes(search.toLowerCase())
  );

  const webhookBase = `${window.location.origin}/api/webhooks/git`;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <GitBranch className="w-6 h-6 text-primary" />
            Git Agents
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Admin-controlled agents triggered by repository events via <code className="text-xs bg-muted px-1 py-0.5 rounded">.nanoorch.yml</code>. Developers toggle agents on/off; admins control prompts, tools, and security.
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button data-testid="button-add-template" variant="outline" size="sm" onClick={() => setTemplateDialogOpen(true)}>
            <LayoutList className="w-4 h-4 mr-1.5" />
            Templates
          </Button>
          <Button data-testid="button-new-git-agent" size="sm" onClick={openCreate}>
            <Plus className="w-4 h-4 mr-1.5" />
            New Agent
          </Button>
        </div>
      </div>

      {/* Security model banner */}
      <div className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30 p-4 flex gap-3">
        <Shield className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
        <div className="text-sm text-blue-800 dark:text-blue-200 space-y-1">
          <p className="font-medium">Security model</p>
          <p className="text-blue-700 dark:text-blue-300">Developers can only enable/disable agents in <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">.nanoorch.yml</code> — they cannot see or modify system prompts, tools, or output configuration. Event variables are auto-injected and sanitised by NanoOrch before reaching the prompt.</p>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          data-testid="input-search-git-agents"
          placeholder="Search agents…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Agent grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="border rounded-lg p-5 space-y-3 animate-pulse">
              <div className="h-4 w-1/2 bg-muted rounded" />
              <div className="h-3 w-3/4 bg-muted rounded" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="border-2 border-dashed rounded-xl p-12 text-center text-muted-foreground">
          <GitBranch className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">{search ? "No agents match your search" : "No git agents yet"}</p>
          <p className="text-sm mt-1">
            {!search && (
              <>Create your first agent or{" "}
                <button className="text-primary underline" onClick={() => setTemplateDialogOpen(true)}>pick a template</button>.
              </>
            )}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((agent) => {
            const orch = orchestrators.find((o) => o.id === agent.orchestratorId);
            return (
              <div
                key={agent.id}
                data-testid={`card-git-agent-${agent.id}`}
                className={`border rounded-xl p-5 space-y-3 bg-card transition-all hover:shadow-sm ${!agent.isActive ? "opacity-60" : ""}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm truncate">{agent.name}</span>
                      {agent.isMandatory && (
                        <Badge variant="destructive" className="text-[10px] px-1.5 py-0 h-4 shrink-0">
                          <Lock className="w-2.5 h-2.5 mr-0.5" /> MANDATORY
                        </Badge>
                      )}
                      {!agent.isActive && <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 shrink-0">Inactive</Badge>}
                    </div>
                    <code className="text-[11px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded mt-1 inline-block">{agent.slug}</code>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button data-testid={`button-edit-git-agent-${agent.id}`} variant="ghost" size="icon" className="w-7 h-7" onClick={() => openEdit(agent)}>
                      <Edit className="w-3.5 h-3.5" />
                    </Button>
                    <Button data-testid={`button-delete-git-agent-${agent.id}`} variant="ghost" size="icon" className="w-7 h-7 text-destructive hover:text-destructive" onClick={() => setDeleteId(agent.id)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>

                {agent.description && (
                  <p className="text-xs text-muted-foreground line-clamp-2">{agent.description}</p>
                )}

                <div className="space-y-1.5 text-xs text-muted-foreground">
                  {orch ? (
                    <div className="flex items-center gap-1.5">
                      <Cpu className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">{orch.name} · {orch.provider}/{orch.model}</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 text-yellow-600 dark:text-yellow-400">
                      <Cpu className="w-3.5 h-3.5 shrink-0" />
                      <span>No orchestrator</span>
                    </div>
                  )}
                  <div className="flex items-center gap-3 flex-wrap">
                    {agent.memoryEnabled && <span className="flex items-center gap-1"><Zap className="w-3 h-3" /> Memory</span>}
                    {(agent.approvalConfig as any)?.required && <span className="flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Approval</span>}
                    {agent.requiresAdminApproval && <span className="flex items-center gap-1"><Shield className="w-3 h-3" /> Admin gate</span>}
                    {agent.postGitComment && <span className="flex items-center gap-1 text-green-600 dark:text-green-400"><Send className="w-3 h-3" /> PR comment</span>}
                    {agent.notifyChannelId && <span className="flex items-center gap-1 text-blue-600 dark:text-blue-400"><MessageSquare className="w-3 h-3" /> Notify</span>}
                  </div>
                </div>

                <Separator />

                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{agent.runCount ?? 0} runs</span>
                  <div className="flex items-center gap-1 text-primary/70 hover:text-primary cursor-pointer" onClick={() => openEdit(agent)}>
                    Configure <ChevronRight className="w-3 h-3" />
                  </div>
                </div>

                {/* Webhook URL hint */}
                <div className="rounded bg-muted px-2.5 py-1.5 flex items-center gap-2 text-[10px] text-muted-foreground">
                  <Box className="w-3 h-3 shrink-0" />
                  <span className="truncate font-mono">Use slug: <strong>{agent.slug}</strong> in .nanoorch.yml</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* .nanoorch.yml Reference */}
      {agents.length > 0 && (
        <div className="border rounded-xl p-5 space-y-3">
          <h2 className="text-sm font-semibold flex items-center gap-2"><Info className="w-4 h-4 text-muted-foreground" /> Developer reference — .nanoorch.yml</h2>
          <p className="text-xs text-muted-foreground">Share this format with developers. They can only toggle agents and set event filters — prompts and tools are admin-controlled.</p>
          <pre className="text-xs bg-muted rounded-lg p-4 overflow-x-auto whitespace-pre">{`version: "1"
agents:
${agents.slice(0, 3).map((a) => `  ${a.slug}:\n    enabled: true\n    on: merge_request          # push | merge_request | pipeline\n    branches: [main, develop]   # optional branch filter\n    files: ["src/**", "*.py"]  # optional file glob filter`).join("\n\n")}${agents.length > 3 ? `\n\n  # … ${agents.length - 3} more agent(s)` : ""}`}</pre>
        </div>
      )}

      {/* Webhook Base URL reference */}
      <div className="border rounded-xl p-5 space-y-3">
        <h2 className="text-sm font-semibold flex items-center gap-2"><Info className="w-4 h-4 text-muted-foreground" /> Webhook endpoint pattern</h2>
        <p className="text-xs text-muted-foreground">Set this URL as the webhook in your GitHub/GitLab repository settings. Each connected repo has a unique endpoint shown in the Git Repos page.</p>
        <div className="flex items-center gap-2 bg-muted rounded px-3 py-2">
          <code className="text-xs flex-1 truncate">{webhookBase}/<span className="text-primary">:repoId</span></code>
          <Button variant="ghost" size="icon" className="w-6 h-6" onClick={() => { navigator.clipboard.writeText(webhookBase); toast({ title: "Copied" }); }}>
            <Copy className="w-3 h-3" />
          </Button>
        </div>
      </div>

      {/* Template picker dialog */}
      <Dialog open={templateDialogOpen} onOpenChange={setTemplateDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Agent Templates</DialogTitle>
            <DialogDescription>Choose a pre-configured template to get started quickly. You can customise everything after.</DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh] pr-2">
            <div className="space-y-3">
              {TEMPLATES.map((tpl) => (
                <div
                  key={tpl.slug}
                  data-testid={`template-${tpl.slug}`}
                  onClick={() => { setSelectedTemplate(tpl); applyTemplate(tpl); }}
                  className="border rounded-lg p-4 cursor-pointer hover:border-primary hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{tpl.name}</span>
                        {tpl.isMandatory && <Badge variant="destructive" className="text-[10px] px-1.5 py-0 h-4"><Lock className="w-2.5 h-2.5 mr-0.5" />Mandatory</Badge>}
                      </div>
                      <code className="text-[10px] text-muted-foreground">{tpl.slug}</code>
                      <p className="text-xs text-muted-foreground mt-1">{tpl.description}</p>
                    </div>
                    <Button size="sm" variant="outline" className="shrink-0 text-xs" onClick={(e) => { e.stopPropagation(); applyTemplate(tpl); }}>
                      Use template
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) { setEditingAgent(null); form.reset(); } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingAgent ? "Edit Git Agent" : "New Git Agent"}</DialogTitle>
            <DialogDescription>
              {editingAgent ? "Update this agent's configuration. Prompt and tools are admin-only — never exposed to developers." : "Configure a new git-triggered agent. Developers can only enable/disable it in .nanoorch.yml."}
            </DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-0">
              <Tabs defaultValue="identity">
                <TabsList className="grid grid-cols-5 w-full mb-4">
                  <TabsTrigger value="identity">Identity</TabsTrigger>
                  <TabsTrigger value="inference">Inference</TabsTrigger>
                  <TabsTrigger value="prompt">Prompt</TabsTrigger>
                  <TabsTrigger value="feedback">Feedback</TabsTrigger>
                  <TabsTrigger value="governance">Governance</TabsTrigger>
                </TabsList>

                {/* Identity */}
                <TabsContent value="identity" className="space-y-4">
                  <FormField control={form.control} name="name" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Display Name</FormLabel>
                      <FormControl><Input data-testid="input-git-agent-name" placeholder="Code Reviewer" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="slug" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Slug</FormLabel>
                      <FormControl>
                        <Input
                          data-testid="input-git-agent-slug"
                          placeholder="code-reviewer"
                          {...field}
                          onChange={(e) => field.onChange(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))}
                        />
                      </FormControl>
                      <FormDescription>Used in <code>.nanoorch.yml</code> to reference this agent. Lowercase, hyphens only. Cannot change after creation without updating all YAML files.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="description" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description <span className="text-muted-foreground">(shown to developers)</span></FormLabel>
                      <FormControl><Textarea data-testid="input-git-agent-description" placeholder="Describes what this agent does…" rows={2} {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="isActive" render={({ field }) => (
                    <FormItem className="flex items-center gap-3">
                      <FormControl><Switch data-testid="switch-git-agent-active" checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                      <div><FormLabel>Active</FormLabel><FormDescription>Inactive agents are silently skipped on all webhooks.</FormDescription></div>
                    </FormItem>
                  )} />
                </TabsContent>

                {/* Inference */}
                <TabsContent value="inference" className="space-y-4">
                  <FormField control={form.control} name="orchestratorId" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Orchestrator</FormLabel>
                      <Select value={field.value ?? ""} onValueChange={(v) => field.onChange(v || null)}>
                        <FormControl>
                          <SelectTrigger data-testid="select-git-agent-orchestrator">
                            <SelectValue placeholder="Select orchestrator…" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {orchestrators.map((o) => (
                            <SelectItem key={o.id} value={o.id}>{o.name} — {o.provider}/{o.model}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormDescription>Which LLM provider and model this agent will use for inference.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="memoryEnabled" render={({ field }) => (
                    <FormItem className="flex items-center gap-3">
                      <FormControl><Switch data-testid="switch-git-agent-memory" checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                      <div><FormLabel>Vector Memory</FormLabel><FormDescription>Enables long-term memory retrieval across runs using pgvector.</FormDescription></div>
                    </FormItem>
                  )} />
                </TabsContent>

                {/* Prompt */}
                <TabsContent value="prompt" className="space-y-4">
                  <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-3 text-xs text-amber-800 dark:text-amber-200 flex gap-2">
                    <Shield className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>This prompt is <strong>admin-only</strong>. Developers cannot view or modify it. NanoOrch auto-injects a sanitised event context block at the top before this prompt runs.</span>
                  </div>
                  <FormField control={form.control} name="systemPrompt" render={({ field }) => (
                    <FormItem>
                      <FormLabel>System Prompt</FormLabel>
                      <FormControl>
                        <Textarea
                          data-testid="input-git-agent-prompt"
                          placeholder="You are a senior engineer reviewing code changes…"
                          rows={12}
                          className="font-mono text-xs"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-2">Auto-injected event variables (read-only context NanoOrch prepends):</p>
                    <div className="flex flex-wrap gap-1.5">
                      {EVENT_VARIABLES.map((v) => (
                        <code key={v} className="text-[10px] bg-muted px-1.5 py-0.5 rounded cursor-pointer hover:bg-muted/70" onClick={() => {
                          const current = form.getValues("systemPrompt") ?? "";
                          form.setValue("systemPrompt", current + "\n" + v);
                        }}>{v}</code>
                      ))}
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1.5">These are provided as context automatically — you don't need to explicitly reference them unless you want to use them in your prompt text.</p>
                  </div>
                </TabsContent>

                {/* Feedback */}
                <TabsContent value="feedback" className="space-y-5">
                  <div className="rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/30 p-3 text-xs text-green-800 dark:text-green-200 flex gap-2">
                    <MessageSquare className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>Feedback is posted <strong>after</strong> each successful run. GitHub/GitLab comments appear on the PR or commit that triggered the agent. Comms channel notifications are sent via your configured Slack, Teams, or Google Chat webhooks.</span>
                  </div>

                  <FormField control={form.control} name="postGitComment" render={({ field }) => (
                    <FormItem className="flex items-start gap-3 rounded-lg border p-4">
                      <FormControl>
                        <Switch
                          data-testid="switch-git-agent-post-comment"
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          className="mt-0.5"
                        />
                      </FormControl>
                      <div>
                        <FormLabel className="flex items-center gap-1.5">
                          <Send className="w-3.5 h-3.5 text-primary" /> Post PR / commit comment
                        </FormLabel>
                        <FormDescription>
                          When enabled, NanoOrch posts the agent's findings as a comment on the triggering GitHub PR or GitLab MR (for pull request events) or on the commit (for push events). Uses the repo's stored access token.
                        </FormDescription>
                      </div>
                    </FormItem>
                  )} />

                  <FormField control={form.control} name="notifyChannelId" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-1.5">
                        <MessageSquare className="w-3.5 h-3.5 text-primary" /> Notify Comms Channel
                      </FormLabel>
                      <Select
                        value={field.value ?? "__none__"}
                        onValueChange={(v) => field.onChange(v === "__none__" ? null : v)}
                      >
                        <FormControl>
                          <SelectTrigger data-testid="select-git-agent-notify-channel">
                            <SelectValue placeholder="None — don't send to a channel" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="__none__">None — don't send to a channel</SelectItem>
                          {commsChannels.map((ch) => (
                            <SelectItem key={ch.id} value={ch.id}>
                              {ch.name} ({ch.type})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        Optionally send a summary of each run's output to a Slack, Teams, or Google Chat channel. Configure channels in the Channels section.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )} />
                </TabsContent>

                {/* Governance */}
                <TabsContent value="governance" className="space-y-5">
                  <FormField control={form.control} name="isMandatory" render={({ field }) => (
                    <FormItem className="flex items-start gap-3 rounded-lg border p-4">
                      <FormControl><Switch data-testid="switch-git-agent-mandatory" checked={field.value} onCheckedChange={field.onChange} className="mt-0.5" /></FormControl>
                      <div>
                        <FormLabel className="flex items-center gap-1.5"><Lock className="w-3.5 h-3.5 text-destructive" /> Mandatory</FormLabel>
                        <FormDescription>This agent runs on every matching webhook event even if the developer omits or disables it in <code>.nanoorch.yml</code>. Use for security and compliance agents.</FormDescription>
                      </div>
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="requiresAdminApproval" render={({ field }) => (
                    <FormItem className="flex items-start gap-3 rounded-lg border p-4">
                      <FormControl><Switch data-testid="switch-git-agent-admin-gate" checked={field.value} onCheckedChange={field.onChange} className="mt-0.5" /></FormControl>
                      <div>
                        <FormLabel className="flex items-center gap-1.5"><Shield className="w-3.5 h-3.5 text-primary" /> Admin approval gate</FormLabel>
                        <FormDescription>When a new repository adds this agent to its <code>.nanoorch.yml</code>, the agent won't activate until a workspace admin approves that specific repository.</FormDescription>
                      </div>
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="approvalRequired" render={({ field }) => (
                    <FormItem className="flex items-start gap-3 rounded-lg border p-4">
                      <FormControl><Switch data-testid="switch-git-agent-approval" checked={field.value} onCheckedChange={field.onChange} className="mt-0.5" /></FormControl>
                      <div>
                        <FormLabel className="flex items-center gap-1.5"><CheckCircle className="w-3.5 h-3.5 text-green-600" /> Task approval required</FormLabel>
                        <FormDescription>Each run of this agent must be approved by a workspace admin before the task executes. Useful for agents that take destructive or high-impact actions.</FormDescription>
                      </div>
                    </FormItem>
                  )} />
                </TabsContent>
              </Tabs>

              <DialogFooter className="mt-6">
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                <Button
                  data-testid="button-save-git-agent"
                  type="submit"
                  disabled={createMutation.isPending || updateMutation.isPending}
                >
                  {createMutation.isPending || updateMutation.isPending ? "Saving…" : editingAgent ? "Update Agent" : "Create Agent"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Git Agent?</AlertDialogTitle>
            <AlertDialogDescription>This will permanently delete the agent and all its run history. Repositories that reference this slug in their <code>.nanoorch.yml</code> will silently skip it on future webhooks.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteMutation.mutate(deleteId!)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

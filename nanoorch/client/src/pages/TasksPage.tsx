import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Plus, ListTodo, Clock, CheckCircle, XCircle, Loader2, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Task, Agent } from "@shared/schema";
import { formatDistanceToNow } from "date-fns";
import PaginationControls from "@/components/PaginationControls";

interface Props {
  orchestratorId: string;
  workspaceId: string;
}

interface TasksResponse {
  tasks: Task[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  stats: { pending: number; running: number; completed: number; failed: number };
}

const STATUS_CONFIG = {
  pending: { icon: Clock, color: "text-yellow-400", spin: false, badge: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" },
  running: { icon: Loader2, color: "text-blue-400", spin: true, badge: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
  completed: { icon: CheckCircle, color: "text-green-400", spin: false, badge: "bg-green-500/20 text-green-400 border-green-500/30" },
  failed: { icon: XCircle, color: "text-red-400", spin: false, badge: "bg-red-500/20 text-red-400 border-red-500/30" },
};

const PAGE_SIZE = 20;

export default function TasksPage({ orchestratorId, workspaceId }: Props) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ input: "", agentId: "" });
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("all");

  const statusParam = statusFilter === "all" ? undefined : statusFilter;

  const { data, isLoading } = useQuery<TasksResponse>({
    queryKey: [`/api/orchestrators/${orchestratorId}/tasks`, page, PAGE_SIZE, statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
      if (statusParam) params.set("status", statusParam);
      const res = await fetch(`/api/orchestrators/${orchestratorId}/tasks?${params}`, { credentials: "include" });
      return res.json();
    },
    refetchInterval: 5000,
  });

  const { data: agents } = useQuery<Agent[]>({
    queryKey: [`/api/orchestrators/${orchestratorId}/agents`],
  });

  const createMutation = useMutation({
    mutationFn: (d: typeof form) =>
      apiRequest("POST", `/api/orchestrators/${orchestratorId}/tasks`, {
        input: d.input,
        agentId: d.agentId || null,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: [`/api/orchestrators/${orchestratorId}/tasks`] });
      setOpen(false);
      setForm({ input: "", agentId: "" });
      setPage(1);
      toast({ title: "Task queued", description: "Task has been added to the execution queue" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const handlePageChange = (p: number) => setPage(p);
  const handleStatusFilter = (v: string) => { setStatusFilter(v); setPage(1); };

  const stats = data?.stats ?? { pending: 0, running: 0, completed: 0, failed: 0 };
  const tasks = data?.tasks ?? [];

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Tasks</h1>
          <p className="text-muted-foreground mt-1">Task queue and execution history</p>
        </div>
        <Button onClick={() => setOpen(true)} data-testid="button-new-task">
          <Plus className="w-4 h-4 mr-2" /> Submit Task
        </Button>
      </div>

      <div className="grid grid-cols-4 gap-3 mb-6">
        {(Object.entries(STATUS_CONFIG) as [keyof typeof STATUS_CONFIG, typeof STATUS_CONFIG[keyof typeof STATUS_CONFIG]][]).map(([status, config]) => {
          const cnt = stats[status] ?? 0;
          return (
            <Card key={status} className={`cursor-pointer transition-colors ${statusFilter === status ? "border-primary" : "hover:border-primary/40"}`}
              onClick={() => handleStatusFilter(statusFilter === status ? "all" : status)}
              data-testid={`card-status-${status}`}>
              <CardContent className="p-3 flex items-center gap-2">
                <config.icon className={`w-5 h-5 ${config.color}${config.spin && cnt > 0 ? " animate-spin" : ""}`} />
                <div>
                  <div className="text-lg font-bold">{cnt}</div>
                  <div className="text-xs capitalize text-muted-foreground">{status}</div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="flex items-center justify-between mb-3">
        <p className="text-sm text-muted-foreground">
          {data ? `${data.total} task${data.total !== 1 ? "s" : ""}${statusFilter !== "all" ? ` (${statusFilter})` : ""}` : ""}
        </p>
        <Select value={statusFilter} onValueChange={handleStatusFilter}>
          <SelectTrigger className="w-36 h-8 text-sm" data-testid="select-task-status-filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="running">Running</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-16" />)}
        </div>
      ) : tasks.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-16 text-center">
            <ListTodo className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
            <h3 className="font-semibold mb-2">{statusFilter === "all" ? "No tasks yet" : `No ${statusFilter} tasks`}</h3>
            <p className="text-muted-foreground mb-4">
              {statusFilter === "all" ? "Submit your first task to get started" : "Try a different status filter"}
            </p>
            {statusFilter === "all" ? (
              <Button onClick={() => setOpen(true)} data-testid="button-create-first-task">
                <Plus className="w-4 h-4 mr-2" /> Submit Task
              </Button>
            ) : (
              <Button variant="outline" onClick={() => handleStatusFilter("all")} data-testid="button-clear-filter">
                Clear filter
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="space-y-2">
            {tasks.map((task) => {
              const statusConfig = STATUS_CONFIG[task.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.pending;
              return (
                <Link key={task.id} href={`/workspaces/${workspaceId}/orchestrators/${orchestratorId}/tasks/${task.id}`}>
                  <div className="flex items-center gap-3 p-4 rounded-lg border border-border bg-card hover:border-primary/40 cursor-pointer transition-colors group"
                    data-testid={`row-task-${task.id}`}>
                    <statusConfig.icon className={`w-4 h-4 shrink-0 ${statusConfig.color}${statusConfig.spin ? " animate-spin" : ""}`} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{task.input}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {task.createdAt ? formatDistanceToNow(new Date(task.createdAt), { addSuffix: true }) : ""}
                        {task.agentId && agents && (
                          <span className="ml-2">
                            · {agents.find((a) => a.id === task.agentId)?.name ?? "Unknown agent"}
                          </span>
                        )}
                      </div>
                    </div>
                    <Badge className={`text-xs shrink-0 ${statusConfig.badge}`}>
                      {task.status}
                    </Badge>
                    <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 shrink-0" />
                  </div>
                </Link>
              );
            })}
          </div>
          {data && (
            <PaginationControls
              page={data.page}
              totalPages={data.totalPages}
              total={data.total}
              limit={data.limit}
              onPageChange={handlePageChange}
              isLoading={isLoading}
            />
          )}
        </>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Submit Task</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Task Input</Label>
              <Textarea value={form.input} onChange={(e) => setForm({ ...form, input: e.target.value })}
                placeholder="Describe what you want the agent to do..." className="mt-1" rows={5}
                data-testid="input-task-input" />
            </div>
            {agents && agents.length > 0 && (
              <div>
                <Label>Agent (optional)</Label>
                <Select value={form.agentId || "none"} onValueChange={(v) => setForm({ ...form, agentId: v === "none" ? "" : v })}>
                  <SelectTrigger className="mt-1" data-testid="select-task-agent">
                    <SelectValue placeholder="Use default agent" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Use first available agent</SelectItem>
                    {agents.map((a) => (
                      <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => createMutation.mutate(form)} disabled={createMutation.isPending || !form.input}
              data-testid="button-submit-task">
              {createMutation.isPending ? "Submitting..." : "Submit Task"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

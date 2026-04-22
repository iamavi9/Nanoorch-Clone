import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle, XCircle, Clock, ShieldAlert, RefreshCw } from "lucide-react";
import { useState } from "react";
import type { ApprovalRequest } from "@shared/schema";
import PaginationControls from "@/components/PaginationControls";

interface ApprovalsPageProps {
  workspaceId: string;
}

interface ApprovalsResponse {
  approvals: ApprovalRequest[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

function StatusBadge({ status }: { status: string }) {
  if (status === "pending") return <Badge variant="outline" className="text-yellow-600 border-yellow-400 bg-yellow-50 dark:bg-yellow-900/20"><Clock className="w-3 h-3 mr-1" />Pending</Badge>;
  if (status === "approved") return <Badge variant="outline" className="text-green-600 border-green-400 bg-green-50 dark:bg-green-900/20"><CheckCircle className="w-3 h-3 mr-1" />Approved</Badge>;
  return <Badge variant="outline" className="text-red-600 border-red-400 bg-red-50 dark:bg-red-900/20"><XCircle className="w-3 h-3 mr-1" />Rejected</Badge>;
}

const PAGE_SIZE = 20;

export default function ApprovalsPage({ workspaceId }: ApprovalsPageProps) {
  const { toast } = useToast();
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [resolving, setResolving] = useState<ApprovalRequest | null>(null);
  const [resolution, setResolution] = useState("");

  const statusParam = filter === "all" ? undefined : filter;

  const { data, isLoading, refetch } = useQuery<ApprovalsResponse>({
    queryKey: [`/api/workspaces/${workspaceId}/approvals`, filter, page],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
      if (statusParam) params.set("status", statusParam);
      const res = await fetch(`/api/workspaces/${workspaceId}/approvals?${params}`, { credentials: "include" });
      return res.json();
    },
    refetchInterval: 10000,
  });

  const { data: pendingCountData } = useQuery<{ count: number }>({
    queryKey: [`/api/workspaces/${workspaceId}/approvals/pending-count`],
    refetchInterval: 10000,
  });

  const resolveMutation = useMutation({
    mutationFn: async ({ id, status, resolution }: { id: string; status: "approved" | "rejected"; resolution: string }) =>
      apiRequest("POST", `/api/approvals/${id}/resolve`, { status, resolution }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/workspaces/${workspaceId}/approvals`] });
      queryClient.invalidateQueries({ queryKey: [`/api/workspaces/${workspaceId}/approvals/pending-count`] });
      toast({ title: "Approval resolved", description: "The request has been updated." });
      setResolving(null);
      setResolution("");
    },
    onError: () => toast({ title: "Error", description: "Failed to resolve approval.", variant: "destructive" }),
  });

  const approvals = data?.approvals ?? [];
  const pendingCount = pendingCountData?.count ?? 0;

  const handleFilterChange = (v: string) => { setFilter(v); setPage(1); };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShieldAlert className="w-6 h-6 text-primary" />
            Approval Gates
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Review and act on agent approval requests before they proceed with high-impact actions.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={filter} onValueChange={handleFilterChange}>
            <SelectTrigger className="w-36" data-testid="select-approval-filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={() => refetch()} data-testid="button-refresh-approvals">
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {pendingCount > 0 && (
        <Card className="border-yellow-400 dark:border-yellow-600 bg-yellow-50 dark:bg-yellow-900/10">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-yellow-700 dark:text-yellow-400">
              {pendingCount} pending {pendingCount === 1 ? "request" : "requests"} awaiting your review
            </CardTitle>
          </CardHeader>
        </Card>
      )}

      {isLoading && <p className="text-muted-foreground text-sm">Loading…</p>}

      {!isLoading && approvals.length === 0 && (
        <div className="text-center py-20 text-muted-foreground">
          <ShieldAlert className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No approval requests {filter !== "all" ? `with status "${filter}"` : ""}.</p>
        </div>
      )}

      <div className="space-y-3">
        {approvals.map((approval) => (
          <Card key={approval.id} data-testid={`card-approval-${approval.id}`} className={approval.status === "pending" ? "border-yellow-300 dark:border-yellow-700" : ""}>
            <CardContent className="pt-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-2">
                    <StatusBadge status={approval.status} />
                    <span className="text-xs text-muted-foreground">
                      {approval.agentName && <span className="font-medium">{approval.agentName}</span>}
                      {" · "}
                      {new Date(approval.createdAt!).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-sm font-medium mb-1">{approval.message}</p>
                  <div className="space-y-1">
                    <p className="text-xs"><span className="font-medium text-muted-foreground">Action:</span> {approval.action}</p>
                    {approval.impact && <p className="text-xs"><span className="font-medium text-muted-foreground">Impact:</span> {approval.impact}</p>}
                    {approval.resolution && <p className="text-xs"><span className="font-medium text-muted-foreground">Resolution note:</span> {approval.resolution}</p>}
                    {approval.resolvedBy && <p className="text-xs text-muted-foreground">Resolved by: {approval.resolvedBy}</p>}
                  </div>
                </div>
                {approval.status === "pending" && (
                  <div className="flex gap-2 shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-green-600 border-green-400 hover:bg-green-50"
                      onClick={() => setResolving(approval)}
                      data-testid={`button-approve-${approval.id}`}
                    >
                      <CheckCircle className="w-3.5 h-3.5 mr-1" />Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-red-600 border-red-400 hover:bg-red-50"
                      onClick={() => { setResolving({ ...approval, _action: "rejected" } as any); }}
                      data-testid={`button-reject-${approval.id}`}
                    >
                      <XCircle className="w-3.5 h-3.5 mr-1" />Reject
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {data && (
        <PaginationControls
          page={data.page}
          totalPages={data.totalPages}
          total={data.total}
          limit={data.limit}
          onPageChange={setPage}
          isLoading={isLoading}
        />
      )}

      <Dialog open={!!resolving} onOpenChange={(o) => { if (!o) { setResolving(null); setResolution(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {(resolving as any)?._action === "rejected" ? "Reject" : "Approve"} Request
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Action: <span className="font-medium text-foreground">{resolving?.action}</span></p>
            <Textarea
              placeholder="Optional note or reason (visible to audit trail)…"
              value={resolution}
              onChange={(e) => setResolution(e.target.value)}
              rows={3}
              data-testid="textarea-resolution"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setResolving(null); setResolution(""); }}>Cancel</Button>
            <Button
              onClick={() => resolveMutation.mutate({
                id: resolving!.id,
                status: (resolving as any)?._action === "rejected" ? "rejected" : "approved",
                resolution,
              })}
              disabled={resolveMutation.isPending}
              className={(resolving as any)?._action === "rejected" ? "bg-red-600 hover:bg-red-700" : ""}
              data-testid="button-confirm-resolve"
            >
              {resolveMutation.isPending ? "Saving…" : ((resolving as any)?._action === "rejected" ? "Reject" : "Approve")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

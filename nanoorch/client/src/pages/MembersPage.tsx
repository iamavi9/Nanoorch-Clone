import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { UserPlus, Trash2, Users, ShieldCheck, ShieldOff } from "lucide-react";

type WorkspaceMember = {
  memberId: number;
  userId: string;
  username: string | null;
  name: string | null;
  email: string | null;
  role: "admin" | "member";
};

interface MembersPageProps {
  workspaceId: string;
}

export default function MembersPage({ workspaceId }: MembersPageProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const isGlobalAdmin = user?.role === "admin";
  const [open, setOpen] = useState(false);
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"admin" | "member">("member");

  const { data: members = [], isLoading } = useQuery<WorkspaceMember[]>({
    queryKey: ["/api/workspaces", workspaceId, "members"],
    queryFn: async () => {
      const res = await fetch(`/api/workspaces/${workspaceId}/members`);
      return res.json();
    },
  });

  const addMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/workspaces/${workspaceId}/members`, {
        username,
        name: displayName || username,
        password,
        role,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/workspaces", workspaceId, "members"] });
      toast({ title: "Member added", description: `${username} can now access this workspace.` });
      setOpen(false);
      setUsername("");
      setDisplayName("");
      setPassword("");
      setRole("member");
    },
    onError: async (err: any) => {
      const data = await err.response?.json().catch(() => ({}));
      toast({ title: "Error", description: data?.error || "Failed to add member", variant: "destructive" });
    },
  });

  const removeMutation = useMutation({
    mutationFn: (userId: string) =>
      apiRequest("DELETE", `/api/workspaces/${workspaceId}/members/${userId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/workspaces", workspaceId, "members"] });
      toast({ title: "Member removed" });
    },
  });

  const changeRoleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: "admin" | "member" }) =>
      apiRequest("PATCH", `/api/workspaces/${workspaceId}/members/${userId}`, { role }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/workspaces", workspaceId, "members"] });
      toast({
        title: variables.role === "admin" ? "Promoted to workspace admin" : "Demoted to member",
      });
    },
    onError: async (err: any) => {
      const data = await err.response?.json().catch(() => ({}));
      toast({ title: "Error", description: data?.error || "Failed to change role", variant: "destructive" });
    },
  });

  return (
    <div className="p-6 max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-xl font-semibold">Members</h2>
          <Badge variant="secondary">{members.length}</Badge>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" data-testid="button-add-member">
              <UserPlus className="h-4 w-4 mr-2" />
              Add Member
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Workspace Member</DialogTitle>
            </DialogHeader>
            <form
              className="space-y-4 mt-2"
              onSubmit={(e) => { e.preventDefault(); addMutation.mutate(); }}
            >
              <div className="space-y-1.5">
                <Label htmlFor="m-username">Username</Label>
                <Input
                  id="m-username"
                  data-testid="input-member-username"
                  placeholder="jane"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                />
                <p className="text-xs text-muted-foreground">If this username exists, they'll be added to the workspace. Otherwise a new account is created.</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="m-name">Display name</Label>
                <Input
                  id="m-name"
                  data-testid="input-member-name"
                  placeholder="Jane Smith"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="m-password">Password</Label>
                <Input
                  id="m-password"
                  data-testid="input-member-password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label>Role in this workspace</Label>
                <Select value={role} onValueChange={(v) => setRole(v as "admin" | "member")}>
                  <SelectTrigger data-testid="select-member-role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="member">Member — chat only</SelectItem>
                    <SelectItem value="admin">Workspace Admin — full workspace access</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button type="submit" className="w-full" disabled={addMutation.isPending} data-testid="button-confirm-add-member">
                {addMutation.isPending ? "Adding…" : "Add Member"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Workspace Members</CardTitle>
          <CardDescription>
            Members can log in and chat. Workspace admins can fully manage this workspace.
            {!isGlobalAdmin && " Only top-level admins can create workspaces or manage the platform."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2].map((i) => (
                <div key={i} className="h-12 rounded bg-muted animate-pulse" />
              ))}
            </div>
          ) : members.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No members yet. Add members to give them chat access.</p>
          ) : (
            <div className="divide-y">
              {members.map((m) => (
                <div
                  key={m.memberId}
                  className="flex items-center justify-between py-3"
                  data-testid={`row-member-${m.userId}`}
                >
                  <div>
                    <p className="text-sm font-medium">{m.name || m.username}</p>
                    <p className="text-xs text-muted-foreground">@{m.username}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={m.role === "admin" ? "default" : "secondary"}
                      data-testid={`badge-role-${m.userId}`}
                    >
                      {m.role === "admin" ? "Workspace Admin" : "Member"}
                    </Badge>
                    {m.role === "member" ? (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-primary"
                        title="Promote to workspace admin"
                        data-testid={`button-promote-${m.userId}`}
                        onClick={() => changeRoleMutation.mutate({ userId: m.userId, role: "admin" })}
                        disabled={changeRoleMutation.isPending}
                      >
                        <ShieldCheck className="h-4 w-4" />
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-orange-500"
                        title="Demote to member"
                        data-testid={`button-demote-${m.userId}`}
                        onClick={() => changeRoleMutation.mutate({ userId: m.userId, role: "member" })}
                        disabled={changeRoleMutation.isPending}
                      >
                        <ShieldOff className="h-4 w-4" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      data-testid={`button-remove-member-${m.userId}`}
                      onClick={() => removeMutation.mutate(m.userId)}
                      disabled={removeMutation.isPending}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

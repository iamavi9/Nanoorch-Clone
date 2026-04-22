import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { useAuth, useLogout } from "@/hooks/useAuth";
import { APP_NAME } from "@/lib/config";
import { Bot, LogOut, ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import ChatPage from "@/pages/ChatPage";
import type { Workspace } from "@shared/schema";

interface MemberChatPageProps {
  slug: string;
}

export default function MemberChatPage({ slug }: MemberChatPageProps) {
  const { user } = useAuth();
  const logout = useLogout();
  const [, navigate] = useLocation();

  const { data: workspace, isLoading, isError } = useQuery<Workspace>({
    queryKey: ["/api/workspaces/by-slug", slug],
    queryFn: async () => {
      const res = await fetch(`/api/workspaces/by-slug/${slug}`);
      if (!res.ok) throw new Error("Not found");
      return res.json();
    },
  });

  useEffect(() => {
    if (!isLoading && (isError || !workspace)) {
      const t = setTimeout(() => navigate("/member"), 3000);
      return () => clearTimeout(t);
    }
  }, [isLoading, isError, workspace, navigate]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-muted-foreground text-sm">Loading…</div>
      </div>
    );
  }

  if (isError || !workspace) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-3">
          <p className="text-muted-foreground text-sm">Workspace not found.</p>
          <p className="text-xs text-muted-foreground/60">Redirecting you back…</p>
          <Button variant="ghost" size="sm" onClick={() => navigate("/member")}>Go back now</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      <header className="border-b px-4 py-2.5 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            data-testid="button-back"
            onClick={() => navigate("/member")}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-1.5">
            <Bot className="h-4 w-4 text-primary" />
            <span className="font-semibold text-sm">{APP_NAME}</span>
          </div>
          <span className="text-sm text-muted-foreground">/ {workspace.name}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground hidden sm:block">{user?.name || user?.username}</span>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            data-testid="button-logout"
            onClick={() => logout.mutate()}
          >
            <LogOut className="h-3.5 w-3.5 mr-1" />
            Sign out
          </Button>
        </div>
      </header>
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
        <ChatPage workspaceId={workspace.id} />
      </div>
    </div>
  );
}

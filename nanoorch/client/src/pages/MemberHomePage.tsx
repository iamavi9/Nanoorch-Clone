import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useAuth, useLogout } from "@/hooks/useAuth";
import { APP_NAME } from "@/lib/config";
import { Bot, MessageSquare, LogOut } from "lucide-react";
import type { Workspace } from "@shared/schema";

export default function MemberHomePage() {
  const { user } = useAuth();
  const logout = useLogout();
  const [, navigate] = useLocation();

  const { data: workspaces = [], isLoading } = useQuery<Workspace[]>({
    queryKey: ["/api/auth/my-workspaces"],
  });

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bot className="h-5 w-5 text-primary" />
          <span className="font-semibold">{APP_NAME}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">{user?.name || user?.username}</span>
          <Button
            variant="ghost"
            size="sm"
            data-testid="button-logout"
            onClick={() => logout.mutate()}
          >
            <LogOut className="h-4 w-4 mr-1.5" />
            Sign out
          </Button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto p-8 space-y-6">
        <div>
          <h1 className="text-xl font-semibold">Your Workspaces</h1>
          <p className="text-sm text-muted-foreground mt-1">Select a workspace to open its chat.</p>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2].map((i) => <div key={i} className="h-20 rounded-lg border bg-muted animate-pulse" />)}
          </div>
        ) : workspaces.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground text-sm">
              You haven't been added to any workspace yet. Ask your administrator to add you.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {workspaces.map((ws) => (
              <Card
                key={ws.id}
                className="cursor-pointer hover:border-primary/50 transition-colors"
                data-testid={`card-workspace-${ws.id}`}
                onClick={() => navigate(`/chat/${ws.slug.trim().toLowerCase()}`)}
              >
                <CardHeader className="pb-2 pt-4">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">{ws.name}</CardTitle>
                    <Button size="sm" variant="outline" data-testid={`button-open-chat-${ws.id}`}>
                      <MessageSquare className="h-4 w-4 mr-1.5" />
                      Open Chat
                    </Button>
                  </div>
                  {ws.description && (
                    <CardDescription className="text-xs">{ws.description}</CardDescription>
                  )}
                </CardHeader>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

import { Switch, Route, Redirect, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "./components/ThemeProvider";
import NotFound from "@/pages/not-found";
import WorkspacesPage from "@/pages/WorkspacesPage";
import WorkspaceDashboard from "@/pages/WorkspaceDashboard";
import OrchestratorPage from "@/pages/OrchestratorPage";
import AgentsPage from "@/pages/AgentsPage";
import ChannelsPage from "@/pages/ChannelsPage";
import TasksPage from "@/pages/TasksPage";
import TaskDetailPage from "@/pages/TaskDetailPage";
import IntegrationsPage from "@/pages/IntegrationsPage";
import ScheduledJobsPage from "@/pages/ScheduledJobsPage";
import ChatPage from "@/pages/ChatPage";
import MembersPage from "@/pages/MembersPage";
import LoginPage from "@/pages/LoginPage";
import ApprovalsPage from "@/pages/ApprovalsPage";
import PipelinesPage from "@/pages/PipelinesPage";
import ObservabilityPage from "@/pages/ObservabilityPage";
import MemberHomePage from "@/pages/MemberHomePage";
import MemberChatPage from "@/pages/MemberChatPage";
import AppLayout from "@/components/AppLayout";
import AdminLayout from "@/components/AdminLayout";
import SSOPage from "@/pages/SSOPage";
import BrandingPage from "@/pages/BrandingPage";
import TriggersPage from "@/pages/TriggersPage";
import McpPage from "@/pages/McpPage";
import GitAgentsPage from "@/pages/GitAgentsPage";
import GitReposPage from "@/pages/GitReposPage";
import PricingPage from "@/pages/PricingPage";
import ProviderKeysPage from "@/pages/ProviderKeysPage";
import { useAuth } from "@/hooks/useAuth";

function AuthGuard({
  children,
  adminOnly = false,
  superAdminOnly = false,
  workspaceId,
}: {
  children: React.ReactNode;
  adminOnly?: boolean;
  superAdminOnly?: boolean;
  workspaceId?: string;
}) {
  const { user, isLoading, isWorkspaceAdmin, isAnyWorkspaceAdmin } = useAuth();
  const [location] = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-muted-foreground text-sm">Loading…</div>
      </div>
    );
  }

  if (!user) {
    return <Redirect to={`/login?redirect=${encodeURIComponent(location)}`} />;
  }

  if (superAdminOnly) {
    if (user.role !== "admin") {
      return <Redirect to={isAnyWorkspaceAdmin ? "/workspaces" : "/member"} />;
    }
  } else if (adminOnly) {
    if (workspaceId) {
      if (!isWorkspaceAdmin(workspaceId)) {
        return <Redirect to="/member" />;
      }
    } else {
      if (user.role !== "admin" && !isAnyWorkspaceAdmin) {
        return <Redirect to="/member" />;
      }
    }
  }

  return <>{children}</>;
}

function RootRedirect() {
  const { user, isLoading, isAnyWorkspaceAdmin } = useAuth();
  if (isLoading) return null;
  if (!user) return <Redirect to="/login" />;
  if (user.role === "admin") return <Redirect to="/workspaces" />;
  if (isAnyWorkspaceAdmin) return <Redirect to="/workspaces" />;
  return <Redirect to="/member" />;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={RootRedirect} />
      <Route path="/login" component={LoginPage} />
      <Route path="/pricing" component={PricingPage} />

      {/* Member routes */}
      <Route path="/member">
        <AuthGuard>
          <MemberHomePage />
        </AuthGuard>
      </Route>
      <Route path="/chat/:slug">
        {(params) => (
          <AuthGuard>
            <MemberChatPage slug={params.slug} />
          </AuthGuard>
        )}
      </Route>

      {/* Admin / workspace-admin routes */}
      <Route path="/workspaces">
        <AuthGuard adminOnly>
          <WorkspacesPage />
        </AuthGuard>
      </Route>
      <Route path="/workspaces/:wid">
        {(params) => (
          <AuthGuard adminOnly workspaceId={params.wid}>
            <AppLayout workspaceId={params.wid}>
              <WorkspaceDashboard workspaceId={params.wid} />
            </AppLayout>
          </AuthGuard>
        )}
      </Route>
      <Route path="/workspaces/:wid/members">
        {(params) => (
          <AuthGuard adminOnly workspaceId={params.wid}>
            <AppLayout workspaceId={params.wid}>
              <MembersPage workspaceId={params.wid} />
            </AppLayout>
          </AuthGuard>
        )}
      </Route>
      <Route path="/workspaces/:wid/orchestrators/:oid">
        {(params) => (
          <AuthGuard adminOnly workspaceId={params.wid}>
            <AppLayout workspaceId={params.wid}>
              <OrchestratorPage workspaceId={params.wid} orchestratorId={params.oid} />
            </AppLayout>
          </AuthGuard>
        )}
      </Route>
      <Route path="/workspaces/:wid/orchestrators/:oid/agents">
        {(params) => (
          <AuthGuard adminOnly workspaceId={params.wid}>
            <AppLayout workspaceId={params.wid}>
              <AgentsPage orchestratorId={params.oid} workspaceId={params.wid} />
            </AppLayout>
          </AuthGuard>
        )}
      </Route>
      <Route path="/workspaces/:wid/orchestrators/:oid/channels">
        {(params) => (
          <AuthGuard adminOnly workspaceId={params.wid}>
            <AppLayout workspaceId={params.wid}>
              <ChannelsPage orchestratorId={params.oid} workspaceId={params.wid} />
            </AppLayout>
          </AuthGuard>
        )}
      </Route>
      <Route path="/workspaces/:wid/orchestrators/:oid/tasks">
        {(params) => (
          <AuthGuard adminOnly workspaceId={params.wid}>
            <AppLayout workspaceId={params.wid}>
              <TasksPage orchestratorId={params.oid} workspaceId={params.wid} />
            </AppLayout>
          </AuthGuard>
        )}
      </Route>
      <Route path="/workspaces/:wid/orchestrators/:oid/tasks/:tid">
        {(params) => (
          <AuthGuard adminOnly workspaceId={params.wid}>
            <AppLayout workspaceId={params.wid}>
              <TaskDetailPage taskId={params.tid} workspaceId={params.wid} orchestratorId={params.oid} />
            </AppLayout>
          </AuthGuard>
        )}
      </Route>
      <Route path="/workspaces/:wid/integrations">
        {(params) => (
          <AuthGuard adminOnly workspaceId={params.wid}>
            <AppLayout workspaceId={params.wid}>
              <IntegrationsPage workspaceId={params.wid} />
            </AppLayout>
          </AuthGuard>
        )}
      </Route>
      <Route path="/workspaces/:wid/mcp">
        {(params) => (
          <AuthGuard adminOnly workspaceId={params.wid}>
            <AppLayout workspaceId={params.wid}>
              <McpPage workspaceId={params.wid} />
            </AppLayout>
          </AuthGuard>
        )}
      </Route>
      <Route path="/workspaces/:wid/scheduled-jobs">
        {(params) => (
          <AuthGuard adminOnly workspaceId={params.wid}>
            <AppLayout workspaceId={params.wid}>
              <ScheduledJobsPage workspaceId={params.wid} />
            </AppLayout>
          </AuthGuard>
        )}
      </Route>
      <Route path="/workspaces/:wid/chat">
        {(params) => (
          <AuthGuard adminOnly workspaceId={params.wid}>
            <AppLayout workspaceId={params.wid}>
              <ChatPage workspaceId={params.wid} />
            </AppLayout>
          </AuthGuard>
        )}
      </Route>
      <Route path="/workspaces/:wid/approvals">
        {(params) => (
          <AuthGuard adminOnly workspaceId={params.wid}>
            <AppLayout workspaceId={params.wid}>
              <ApprovalsPage workspaceId={params.wid} />
            </AppLayout>
          </AuthGuard>
        )}
      </Route>
      <Route path="/workspaces/:wid/pipelines">
        {(params) => (
          <AuthGuard adminOnly workspaceId={params.wid}>
            <AppLayout workspaceId={params.wid}>
              <PipelinesPage workspaceId={params.wid} />
            </AppLayout>
          </AuthGuard>
        )}
      </Route>
      <Route path="/workspaces/:wid/observability">
        {(params) => (
          <AuthGuard adminOnly workspaceId={params.wid}>
            <AppLayout workspaceId={params.wid}>
              <ObservabilityPage workspaceId={params.wid} />
            </AppLayout>
          </AuthGuard>
        )}
      </Route>
      <Route path="/workspaces/:wid/triggers">
        {(params) => (
          <AuthGuard adminOnly workspaceId={params.wid}>
            <AppLayout workspaceId={params.wid}>
              <TriggersPage workspaceId={params.wid} />
            </AppLayout>
          </AuthGuard>
        )}
      </Route>
      <Route path="/workspaces/:wid/git-agents">
        {(params) => (
          <AuthGuard adminOnly workspaceId={params.wid}>
            <AppLayout workspaceId={params.wid}>
              <GitAgentsPage workspaceId={params.wid} />
            </AppLayout>
          </AuthGuard>
        )}
      </Route>
      <Route path="/workspaces/:wid/git-repos">
        {(params) => (
          <AuthGuard adminOnly workspaceId={params.wid}>
            <AppLayout workspaceId={params.wid}>
              <GitReposPage workspaceId={params.wid} />
            </AppLayout>
          </AuthGuard>
        )}
      </Route>

      {/* Global super-admin-only routes */}
      <Route path="/admin/sso">
        <AuthGuard superAdminOnly>
          <AdminLayout>
            <SSOPage />
          </AdminLayout>
        </AuthGuard>
      </Route>

      <Route path="/admin/branding">
        <AuthGuard superAdminOnly>
          <AdminLayout>
            <BrandingPage />
          </AdminLayout>
        </AuthGuard>
      </Route>

      <Route path="/admin/provider-keys">
        <AuthGuard superAdminOnly>
          <AdminLayout>
            <ProviderKeysPage />
          </AdminLayout>
        </AuthGuard>
      </Route>

      <Route path="/admin">
        <AuthGuard superAdminOnly>
          <Redirect to="/admin/branding" />
        </AuthGuard>
      </Route>

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;

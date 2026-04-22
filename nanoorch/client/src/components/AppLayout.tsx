import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  Bot, LayoutDashboard, Network, Radio, ListTodo, ChevronLeft,
  Moon, Sun, Zap, Plug, MessageSquare, Users, LogOut, Clock,
  ShieldAlert, GitBranch, BarChart2, Webhook, PanelLeftClose, PanelLeftOpen,
  GitFork, GitPullRequest,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useTheme } from "./ThemeProvider";
import { useAuth, useLogout } from "@/hooks/useAuth";
import { useBranding } from "@/hooks/useBranding";
import type { Workspace, Orchestrator } from "@shared/schema";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface AppLayoutProps {
  workspaceId: string;
  children: React.ReactNode;
}

const STORAGE_KEY = "nanoorch-sidebar-collapsed";

export default function AppLayout({ workspaceId, children }: AppLayoutProps) {
  const { theme, toggleTheme } = useTheme();
  const [location] = useLocation();
  const { user } = useAuth();
  const logout = useLogout();
  const branding = useBranding();

  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === "true";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, String(collapsed));
    } catch {}
  }, [collapsed]);

  const { data: workspace } = useQuery<Workspace>({
    queryKey: [`/api/workspaces/${workspaceId}`],
  });

  const { data: orchestrators } = useQuery<Orchestrator[]>({
    queryKey: [`/api/workspaces/${workspaceId}/orchestrators`],
  });

  const { data: pendingCount } = useQuery<{ count: number }>({
    queryKey: [`/api/workspaces/${workspaceId}/approvals/pending-count`],
    refetchInterval: 30000,
  });

  const basePath = `/workspaces/${workspaceId}`;
  const pendingApprovals = pendingCount?.count ?? 0;

  const navItems = [
    { label: "Dashboard",      icon: LayoutDashboard, path: basePath },
    { label: "Chat",           icon: MessageSquare,   path: `${basePath}/chat` },
    { label: "Members",        icon: Users,           path: `${basePath}/members` },
    { label: "Integrations",   icon: Plug,            path: `${basePath}/integrations` },
    { label: "MCP",            icon: Zap,             path: `${basePath}/mcp` },
    { label: "Scheduled Jobs", icon: Clock,           path: `${basePath}/scheduled-jobs` },
    { label: "Pipelines",      icon: GitBranch,       path: `${basePath}/pipelines`,     badge: null },
    { label: "Triggers",       icon: Webhook,         path: `${basePath}/triggers`,      badge: null },
    { label: "Git Agents",     icon: GitPullRequest,  path: `${basePath}/git-agents`,    badge: null },
    { label: "Git Repos",      icon: GitFork,         path: `${basePath}/git-repos`,     badge: null },
    { label: "Approvals",      icon: ShieldAlert,     path: `${basePath}/approvals`,     badge: pendingApprovals > 0 ? pendingApprovals : null },
    { label: "Observability",  icon: BarChart2,       path: `${basePath}/observability`, badge: null },
  ];

  const NavItem = ({ label, icon: Icon, path, badge }: { label: string; icon: any; path: string; badge?: number | null }) => {
    const isActive = location === path;
    const link = (
      <Link
        href={path}
        data-testid={`nav-${label.toLowerCase().replace(/\s/g, "-")}`}
        className={cn(
          "flex items-center rounded-md transition-colors",
          collapsed
            ? "justify-center w-10 h-10 mx-auto"
            : "gap-2 px-3 py-2 w-full",
          isActive
            ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
            : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        )}
      >
        <Icon className="w-4 h-4 shrink-0" />
        {!collapsed && <span className="flex-1 text-sm">{label}</span>}
        {!collapsed && badge != null && (
          <Badge className="h-4 min-w-4 px-1 text-[10px] bg-yellow-500 hover:bg-yellow-500 text-white">
            {badge}
          </Badge>
        )}
        {collapsed && badge != null && (
          <span className="absolute top-0.5 right-0.5 w-2 h-2 rounded-full bg-yellow-500" />
        )}
      </Link>
    );

    if (collapsed) {
      return (
        <div className="relative flex justify-center py-0.5">
          <Tooltip>
            <TooltipTrigger asChild>{link}</TooltipTrigger>
            <TooltipContent side="right" className="text-xs">
              {label}
              {badge != null && ` (${badge})`}
            </TooltipContent>
          </Tooltip>
        </div>
      );
    }

    return <div className="px-2 py-0.5">{link}</div>;
  };

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex h-screen overflow-hidden bg-background">
        <aside
          className={cn(
            "flex flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border shrink-0 transition-[width] duration-200 overflow-hidden",
            collapsed ? "w-[60px]" : "w-64"
          )}
        >
          {/* Header */}
          <div className={cn(
            "h-14 flex items-center border-b border-sidebar-border shrink-0",
            collapsed ? "justify-center px-2" : "gap-2 px-4"
          )}>
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center shrink-0 overflow-hidden">
              {branding.appLogoUrl
                ? <img src={branding.appLogoUrl} alt={branding.appName} className="w-8 h-8 object-cover rounded-lg" />
                : <Zap className="w-4 h-4 text-white" />
              }
            </div>
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold text-sidebar-foreground/60 uppercase tracking-wider truncate">{branding.appName}</div>
                <div className="text-sm font-semibold truncate">{workspace?.name ?? "Loading..."}</div>
              </div>
            )}
          </div>

          {/* Toggle button */}
          <div className={cn("flex shrink-0 border-b border-sidebar-border", collapsed ? "justify-center py-1" : "justify-end px-2 py-1")}>
            <Button
              variant="ghost"
              size="icon"
              data-testid="button-toggle-sidebar"
              onClick={() => setCollapsed((c) => !c)}
              className="w-7 h-7 text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent"
            >
              {collapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
            </Button>
          </div>

          <ScrollArea className="flex-1 py-2">
            <nav className={cn("space-y-0", collapsed ? "px-0" : "px-0")}>

              {/* Back to workspaces */}
              {collapsed ? (
                <div className="flex justify-center py-0.5">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Link
                        href="/workspaces"
                        className="flex items-center justify-center w-10 h-10 rounded-md text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </Link>
                    </TooltipTrigger>
                    <TooltipContent side="right" className="text-xs">All Workspaces</TooltipContent>
                  </Tooltip>
                </div>
              ) : (
                <div className="px-2 py-0.5">
                  <Link
                    href="/workspaces"
                    className="flex items-center gap-2 px-3 py-2 text-sm rounded-md text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    All Workspaces
                  </Link>
                </div>
              )}

              {/* Section label */}
              {!collapsed && (
                <div className="pt-2 pb-1 px-5">
                  <span className="text-xs font-semibold text-sidebar-foreground/40 uppercase tracking-wider">Workspace</span>
                </div>
              )}
              {collapsed && <div className="py-1 border-t border-sidebar-border/50 mx-2" />}

              {navItems.map((item) => (
                <NavItem key={item.path} {...item} />
              ))}

              {/* Orchestrators */}
              {orchestrators && orchestrators.length > 0 && (
                <>
                  {!collapsed && (
                    <div className="pt-4 pb-1 px-5">
                      <span className="text-xs font-semibold text-sidebar-foreground/40 uppercase tracking-wider">Orchestrators</span>
                    </div>
                  )}
                  {collapsed && <div className="py-1 border-t border-sidebar-border/50 mx-2 mt-2" />}
                  {orchestrators.map((orch) => {
                    const orchBase = `${basePath}/orchestrators/${orch.id}`;
                    const isActive = location.startsWith(orchBase);
                    const orchLink = (
                      <Link
                        href={orchBase}
                        className={cn(
                          "flex items-center rounded-md transition-colors",
                          collapsed
                            ? "justify-center w-10 h-10 mx-auto"
                            : "gap-2 px-3 py-2 w-full",
                          isActive
                            ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                            : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                        )}
                      >
                        <Network className="w-4 h-4 shrink-0" />
                        {!collapsed && <span className="truncate text-sm">{orch.name}</span>}
                      </Link>
                    );

                    return (
                      <div key={orch.id}>
                        {collapsed ? (
                          <div className="flex justify-center py-0.5">
                            <Tooltip>
                              <TooltipTrigger asChild>{orchLink}</TooltipTrigger>
                              <TooltipContent side="right" className="text-xs">{orch.name}</TooltipContent>
                            </Tooltip>
                          </div>
                        ) : (
                          <div className="px-2 py-0.5">{orchLink}</div>
                        )}

                        {/* Sub-items only when expanded and active */}
                        {!collapsed && isActive && (
                          <div className="ml-4 mt-0.5 space-y-0.5 px-2">
                            {[
                              { label: "Agents",   icon: Bot,      path: `${orchBase}/agents` },
                              { label: "Channels", icon: Radio,    path: `${orchBase}/channels` },
                              { label: "Tasks",    icon: ListTodo, path: `${orchBase}/tasks` },
                            ].map((sub) => (
                              <Link
                                key={sub.path}
                                href={sub.path}
                                className={cn(
                                  "flex items-center gap-2 px-3 py-1.5 text-xs rounded-md transition-colors",
                                  location.startsWith(sub.path)
                                    ? "bg-sidebar-primary/20 text-sidebar-primary font-medium"
                                    : "text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                                )}
                              >
                                <sub.icon className="w-3.5 h-3.5" />
                                {sub.label}
                              </Link>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </>
              )}
            </nav>
          </ScrollArea>

          {/* Bottom: user + theme + logout */}
          <div className={cn("border-t border-sidebar-border shrink-0", collapsed ? "py-2 flex flex-col items-center gap-1" : "p-3 space-y-1")}>
            {collapsed ? (
              <>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center cursor-default">
                      <span className="text-xs font-semibold text-primary">
                        {(user?.name || user?.username || "?")[0].toUpperCase()}
                      </span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="text-xs">{user?.name || user?.username}</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={toggleTheme}
                      className="w-8 h-8 text-sidebar-foreground/70 hover:bg-sidebar-accent"
                    >
                      {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="text-xs">{theme === "dark" ? "Light mode" : "Dark mode"}</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      data-testid="button-logout"
                      onClick={() => logout.mutate()}
                      className="w-8 h-8 text-sidebar-foreground/70 hover:bg-sidebar-accent"
                    >
                      <LogOut className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="text-xs">Sign out</TooltipContent>
                </Tooltip>
              </>
            ) : (
              <>
                <div className="px-3 py-1.5 flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                    <span className="text-xs font-semibold text-primary">
                      {(user?.name || user?.username || "?")[0].toUpperCase()}
                    </span>
                  </div>
                  <span className="text-xs text-sidebar-foreground/70 truncate" data-testid="text-current-user">
                    {user?.name || user?.username}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={toggleTheme}
                  className="w-full justify-start gap-2 text-sidebar-foreground/70"
                >
                  {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                  {theme === "dark" ? "Light mode" : "Dark mode"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  data-testid="button-logout"
                  onClick={() => logout.mutate()}
                  className="w-full justify-start gap-2 text-sidebar-foreground/70"
                >
                  <LogOut className="w-4 h-4" />
                  Sign out
                </Button>
              </>
            )}
          </div>
        </aside>

        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </TooltipProvider>
  );
}

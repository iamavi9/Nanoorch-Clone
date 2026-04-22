import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import {
  Paintbrush, KeyRound, Shield, ChevronLeft,
  Moon, Sun, Zap, LogOut, PanelLeftClose, PanelLeftOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "./ThemeProvider";
import { useAuth, useLogout } from "@/hooks/useAuth";
import { useBranding } from "@/hooks/useBranding";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const STORAGE_KEY = "nanoorch-admin-sidebar-collapsed";

const NAV_ITEMS = [
  { label: "Branding",      icon: Paintbrush, path: "/admin/branding" },
  { label: "Provider Keys", icon: KeyRound,   path: "/admin/provider-keys" },
  { label: "SSO",           icon: Shield,     path: "/admin/sso" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
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

  const NavItem = ({ label, icon: Icon, path }: { label: string; icon: any; path: string }) => {
    const isActive = location === path;
    const link = (
      <Link
        href={path}
        data-testid={`admin-nav-${label.toLowerCase().replace(/\s/g, "-")}`}
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
      </Link>
    );

    if (collapsed) {
      return (
        <div className="relative flex justify-center py-0.5">
          <Tooltip>
            <TooltipTrigger asChild>{link}</TooltipTrigger>
            <TooltipContent side="right" className="text-xs">{label}</TooltipContent>
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
                <div className="text-sm font-semibold truncate">Platform Admin</div>
              </div>
            )}
          </div>

          {/* Toggle button */}
          <div className={cn("flex shrink-0 border-b border-sidebar-border", collapsed ? "justify-center py-1" : "justify-end px-2 py-1")}>
            <Button
              variant="ghost"
              size="icon"
              data-testid="button-toggle-admin-sidebar"
              onClick={() => setCollapsed((c) => !c)}
              className="w-7 h-7 text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent"
            >
              {collapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
            </Button>
          </div>

          <ScrollArea className="flex-1 py-2">
            <nav className="space-y-0">

              {/* Back to workspaces */}
              {collapsed ? (
                <div className="flex justify-center py-0.5">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Link
                        href="/workspaces"
                        className="flex items-center justify-center w-10 h-10 rounded-md text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
                        data-testid="admin-nav-back-workspaces"
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
                    data-testid="admin-nav-back-workspaces"
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
                  <span className="text-xs font-semibold text-sidebar-foreground/40 uppercase tracking-wider">Platform</span>
                </div>
              )}
              {collapsed && <div className="py-1 border-t border-sidebar-border/50 mx-2" />}

              {NAV_ITEMS.map((item) => (
                <NavItem key={item.path} {...item} />
              ))}
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
                  <span className="text-xs text-sidebar-foreground/70 truncate" data-testid="text-admin-current-user">
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

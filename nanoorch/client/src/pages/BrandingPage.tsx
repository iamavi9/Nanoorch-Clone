import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Zap, ExternalLink } from "lucide-react";
import type { Branding } from "@/hooks/useBranding";

function isSafeUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const { protocol } = new URL(url);
    return protocol === "https:" || protocol === "http:";
  } catch {
    return false;
  }
}

export default function BrandingPage() {
  const { toast } = useToast();

  const { data: current, isLoading } = useQuery<Branding>({
    queryKey: ["/api/settings/branding"],
  });

  const [appName, setAppName] = useState("");
  const [appLogoUrl, setAppLogoUrl] = useState("");
  const [faviconUrl, setFaviconUrl] = useState("");

  useEffect(() => {
    if (current) {
      setAppName(current.appName ?? "");
      setAppLogoUrl(current.appLogoUrl ?? "");
      setFaviconUrl(current.faviconUrl ?? "");
    }
  }, [current]);

  const saveMutation = useMutation({
    mutationFn: () =>
      apiRequest("PUT", "/api/settings/branding", {
        appName,
        appLogoUrl: appLogoUrl || null,
        faviconUrl: faviconUrl || null,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/settings/branding"] });
      toast({ title: "Branding saved", description: "Changes are live across the application." });
    },
    onError: () => {
      toast({ title: "Failed to save", description: "Check your inputs and try again.", variant: "destructive" });
    },
  });

  // Reconstruct via URL object so the taint chain from useState is broken
  // and static analysis can confirm this value is a parsed, safe URL.
  const logoToShow = (() => {
    if (!isSafeUrl(appLogoUrl.trim())) return null;
    try { return new URL(appLogoUrl.trim()).href; } catch { return null; }
  })();

  return (
    <div className="max-w-2xl mx-auto px-6 py-10 space-y-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">White Label Branding</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Customize the application name and logo that appear across all workspaces.
          </p>
        </div>

        {isLoading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : (
          <div className="space-y-6">
            {/* App name */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Application Name</CardTitle>
                <CardDescription>
                  Replaces "NanoOrch" everywhere — sidebar, browser tab, and login page.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-1.5">
                  <Label htmlFor="input-app-name">Name</Label>
                  <Input
                    id="input-app-name"
                    data-testid="input-app-name"
                    value={appName}
                    onChange={(e) => setAppName(e.target.value)}
                    placeholder="NanoOrch"
                    maxLength={64}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Logo */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Logo</CardTitle>
                <CardDescription>
                  URL to a square image (PNG, SVG, or WebP). Displayed in the sidebar header (32×32 px). Leave blank to use the default lightning-bolt icon.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="input-logo-url">Logo URL</Label>
                  <Input
                    id="input-logo-url"
                    data-testid="input-logo-url"
                    value={appLogoUrl}
                    onChange={(e) => setAppLogoUrl(e.target.value)}
                    placeholder="https://example.com/logo.png"
                  />
                </div>

                {/* Preview */}
                <div className="flex items-center gap-4">
                  <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center overflow-hidden shrink-0">
                    {logoToShow
                      ? <img src={logoToShow} alt="Logo preview" className="w-8 h-8 object-cover rounded-lg" />
                      : <Zap className="w-4 h-4 text-white" />
                    }
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {logoToShow
                      ? <span className="flex items-center gap-1">Custom logo preview <a href={logoToShow} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-0.5"><ExternalLink className="w-3 h-3" /></a></span>
                      : "Default icon (no URL set)"
                    }
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Favicon */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Favicon</CardTitle>
                <CardDescription>
                  URL to a small icon (ICO, PNG, or SVG) shown in browser tabs. Leave blank to keep the default.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="input-favicon-url">Favicon URL</Label>
                  <Input
                    id="input-favicon-url"
                    data-testid="input-favicon-url"
                    value={faviconUrl}
                    onChange={(e) => setFaviconUrl(e.target.value)}
                    placeholder="https://example.com/favicon.ico"
                  />
                </div>
                {isSafeUrl(faviconUrl.trim()) && (
                  <div className="flex items-center gap-3">
                    <img
                      src={(() => { try { return new URL(faviconUrl.trim()).href; } catch { return ""; } })()}
                      alt="Favicon preview"
                      className="w-6 h-6 object-contain"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                    />
                    <span className="text-sm text-muted-foreground">Favicon preview</span>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Live preview panel */}
            <Card className="border-dashed">
              <CardHeader>
                <CardTitle className="text-base text-muted-foreground">Sidebar Preview</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-3 p-3 bg-sidebar rounded-lg w-fit">
                  <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center overflow-hidden shrink-0">
                    {logoToShow
                      ? <img src={logoToShow} alt={appName || "Logo"} className="w-8 h-8 object-cover rounded-lg" />
                      : <Zap className="w-4 h-4 text-white" />
                    }
                  </div>
                  <div className="min-w-0">
                    <div className="text-[10px] font-semibold text-sidebar-foreground/60 uppercase tracking-wider truncate">
                      {appName || "NanoOrch"}
                    </div>
                    <div className="text-sm font-semibold text-sidebar-foreground truncate">My Workspace</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="flex justify-end">
              <Button
                data-testid="button-save-branding"
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending || !appName.trim()}
              >
                {saveMutation.isPending ? "Saving…" : "Save Branding"}
              </Button>
            </div>
          </div>
        )}
    </div>
  );
}

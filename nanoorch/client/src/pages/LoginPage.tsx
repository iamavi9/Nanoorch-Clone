import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient, setCsrfToken } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { APP_NAME, APP_TAGLINE } from "@/lib/config";
import { AlertCircle, Bot, LogIn } from "lucide-react";
import type { AuthUser } from "@/hooks/useAuth";

interface SsoProviderPublic {
  id: string;
  name: string;
  type: "oidc" | "saml";
}

export default function LoginPage() {
  const [, navigate] = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const { data: ssoProviders = [] } = useQuery<SsoProviderPublic[]>({
    queryKey: ["/api/sso/providers"],
    retry: false,
  });

  const loginMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/auth/login", { username, password });
      return res.json() as Promise<AuthUser>;
    },
    onSuccess: (user) => {
      if (user.csrfToken) setCsrfToken(user.csrfToken);
      queryClient.setQueryData(["/api/auth/me"], user);
      const redirectParam = new URLSearchParams(window.location.search).get("redirect");
      // Only follow redirect if it's a relative path (prevents open redirect)
      if (redirectParam && redirectParam.startsWith("/")) {
        navigate(redirectParam);
        return;
      }
      if (user.role === "admin" || (user.workspaceAdminIds && user.workspaceAdminIds.length > 0)) {
        navigate("/workspaces");
      } else {
        navigate("/member");
      }
    },
    onError: async (err: any) => {
      try {
        const data = await err.response?.json();
        setError(data?.error || "Invalid credentials");
      } catch {
        setError("Invalid credentials");
      }
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    loginMutation.mutate();
  };

  const ssoStart = (provider: SsoProviderPublic) => {
    const redirect = encodeURIComponent(window.location.search.includes("redirect=")
      ? new URLSearchParams(window.location.search).get("redirect") ?? "/workspaces"
      : "/workspaces");
    const type = provider.type === "saml" ? "saml" : "oidc";
    window.location.href = `/api/auth/sso/${type}/${provider.id}/start?redirect=${redirect}`;
  };

  const params = new URLSearchParams(window.location.search);
  const ssoError = params.get("error");

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-2">
            <Bot className="h-8 w-8 text-primary" />
            <span className="text-2xl font-bold">{APP_NAME}</span>
          </div>
          <p className="text-sm text-muted-foreground">{APP_TAGLINE}</p>
        </div>

        {ssoProviders.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">Sign in with SSO</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {ssoProviders.map((p) => (
                <Button
                  key={p.id}
                  variant="outline"
                  className="w-full justify-start gap-2"
                  data-testid={`button-sso-${p.id}`}
                  onClick={() => ssoStart(p)}
                >
                  <LogIn className="h-4 w-4" />
                  Sign in with {p.name}
                </Button>
              ))}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">Sign in</CardTitle>
            <CardDescription>Enter your credentials to continue</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  data-testid="input-username"
                  type="text"
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="admin"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  data-testid="input-password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                />
              </div>

              {(error || ssoError) && (
                <div className="flex items-center gap-2 text-destructive text-sm" data-testid="text-login-error">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {error || decodeURIComponent(ssoError ?? "")}
                </div>
              )}

              <Button
                type="submit"
                className="w-full"
                data-testid="button-login"
                disabled={loginMutation.isPending}
              >
                {loginMutation.isPending ? "Signing in…" : "Sign in"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

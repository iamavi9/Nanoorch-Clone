import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Key, Shield, Copy, ExternalLink } from "lucide-react";
import type { SsoProvider } from "@shared/schema";

type SsoType = "oidc" | "saml";

interface OidcConfig {
  clientId: string;
  clientSecret: string;
  discoveryUrl: string;
}

interface SamlConfig {
  entryPoint: string;
  cert: string;
}

const BLANK_OIDC: OidcConfig = { clientId: "", clientSecret: "", discoveryUrl: "" };
const BLANK_SAML: SamlConfig = { entryPoint: "", cert: "" };

export default function SSOPage() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<SsoProvider | null>(null);
  const [name, setName] = useState("");
  const [type, setType] = useState<SsoType>("oidc");
  const [isActive, setIsActive] = useState(true);
  const [defaultRole, setDefaultRole] = useState<"admin" | "member">("member");
  const [oidcCfg, setOidcCfg] = useState<OidcConfig>(BLANK_OIDC);
  const [samlCfg, setSamlCfg] = useState<SamlConfig>(BLANK_SAML);

  const { data: providers = [], isLoading } = useQuery<SsoProvider[]>({
    queryKey: ["/api/admin/sso-providers"],
  });

  const openCreate = () => {
    setEditing(null);
    setName("");
    setType("oidc");
    setIsActive(true);
    setDefaultRole("member");
    setOidcCfg(BLANK_OIDC);
    setSamlCfg(BLANK_SAML);
    setOpen(true);
  };

  const openEdit = (p: SsoProvider) => {
    setEditing(p);
    setName(p.name);
    setType(p.type as SsoType);
    setIsActive(p.isActive ?? true);
    setDefaultRole((p.defaultRole ?? "member") as "admin" | "member");
    const cfg = (p.config ?? {}) as Record<string, string>;
    if (p.type === "oidc") {
      setOidcCfg({ clientId: cfg.clientId ?? "", clientSecret: "", discoveryUrl: cfg.discoveryUrl ?? "" });
    } else {
      setSamlCfg({ entryPoint: cfg.entryPoint ?? "", cert: "" });
    }
    setOpen(true);
  };

  const buildConfig = (): Record<string, string> => {
    if (type === "oidc") return { ...oidcCfg };
    return { ...samlCfg };
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const body = { name, type, isActive, defaultRole, config: buildConfig() };
      if (editing) {
        return apiRequest("PUT", `/api/admin/sso-providers/${editing.id}`, body);
      }
      return apiRequest("POST", "/api/admin/sso-providers", body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/sso-providers"] });
      setOpen(false);
      toast({ title: editing ? "Provider updated" : "Provider created" });
    },
    onError: () => toast({ title: "Save failed", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/admin/sso-providers/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/sso-providers"] });
      toast({ title: "Provider deleted" });
    },
    onError: () => toast({ title: "Delete failed", variant: "destructive" }),
  });

  const copyUrl = (providerId: string, type: string) => {
    const base = window.location.origin;
    const url = type === "saml"
      ? `${base}/api/auth/sso/saml/${providerId}/metadata`
      : `${base}/api/auth/sso/oidc/${providerId}/callback`;
    navigator.clipboard.writeText(url);
    toast({ title: "URL copied" });
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="h-6 w-6 text-primary" /> SSO Configuration
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Configure OIDC and SAML identity providers for single sign-on.</p>
        </div>
        <Button data-testid="button-add-sso-provider" onClick={openCreate}>
          <Plus className="h-4 w-4 mr-2" /> Add Provider
        </Button>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : providers.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Key className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p className="font-medium">No SSO providers configured</p>
            <p className="text-sm mt-1">Add an OIDC or SAML provider to enable single sign-on.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {providers.map((p) => (
            <Card key={p.id} data-testid={`card-sso-${p.id}`}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-base">{p.name}</CardTitle>
                      <Badge variant={p.isActive ? "default" : "secondary"} className="text-xs">
                        {p.isActive ? "Active" : "Inactive"}
                      </Badge>
                      <Badge variant="outline" className="text-xs uppercase">{p.type}</Badge>
                    </div>
                    <CardDescription className="text-xs">
                      Default role: <span className="font-medium">{p.defaultRole ?? "member"}</span>
                    </CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="icon" title={p.type === "saml" ? "Copy metadata URL" : "Copy callback URL"} onClick={() => copyUrl(p.id, p.type)}>
                      <Copy className="h-4 w-4" />
                    </Button>
                    {p.type === "saml" && (
                      <Button variant="ghost" size="icon" title="View SP metadata" asChild>
                        <a href={`/api/auth/sso/saml/${p.id}/metadata`} target="_blank" rel="noreferrer">
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" data-testid={`button-edit-sso-${p.id}`} onClick={() => openEdit(p)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" data-testid={`button-delete-sso-${p.id}`}
                      onClick={() => { if (confirm(`Delete "${p.name}"?`)) deleteMutation.mutate(p.id); }}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="text-xs text-muted-foreground font-mono bg-muted rounded px-2 py-1 truncate">
                  {p.type === "oidc"
                    ? `${window.location.origin}/api/auth/sso/oidc/${p.id}/callback`
                    : `${window.location.origin}/api/auth/sso/saml/${p.id}/acs`}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit SSO Provider" : "Add SSO Provider"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Display Name</Label>
              <Input data-testid="input-sso-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Google Workspace" />
            </div>

            <div className="space-y-1.5">
              <Label>Protocol</Label>
              <Select value={type} onValueChange={(v) => setType(v as SsoType)}>
                <SelectTrigger data-testid="select-sso-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="oidc">OIDC / OAuth 2.0</SelectItem>
                  <SelectItem value="saml">SAML 2.0</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {type === "oidc" ? (
              <>
                <div className="space-y-1.5">
                  <Label>Discovery URL</Label>
                  <Input data-testid="input-oidc-discovery-url" value={oidcCfg.discoveryUrl}
                    onChange={(e) => setOidcCfg({ ...oidcCfg, discoveryUrl: e.target.value })}
                    placeholder="https://accounts.google.com" />
                  <p className="text-xs text-muted-foreground">The OIDC issuer URL (e.g. https://accounts.google.com, https://login.microsoftonline.com/tenant/v2.0)</p>
                </div>
                <div className="space-y-1.5">
                  <Label>Client ID</Label>
                  <Input data-testid="input-oidc-client-id" value={oidcCfg.clientId}
                    onChange={(e) => setOidcCfg({ ...oidcCfg, clientId: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>{editing ? "Client Secret (leave blank to keep existing)" : "Client Secret"}</Label>
                  <Input data-testid="input-oidc-client-secret" type="password" value={oidcCfg.clientSecret}
                    onChange={(e) => setOidcCfg({ ...oidcCfg, clientSecret: e.target.value })} placeholder="••••••••" />
                </div>
              </>
            ) : (
              <>
                <div className="space-y-1.5">
                  <Label>IdP SSO Entry Point</Label>
                  <Input data-testid="input-saml-entry-point" value={samlCfg.entryPoint}
                    onChange={(e) => setSamlCfg({ ...samlCfg, entryPoint: e.target.value })}
                    placeholder="https://idp.example.com/sso/saml" />
                </div>
                <div className="space-y-1.5">
                  <Label>{editing ? "IdP Certificate (leave blank to keep existing)" : "IdP Certificate (PEM)"}</Label>
                  <Textarea data-testid="input-saml-cert" value={samlCfg.cert}
                    onChange={(e) => setSamlCfg({ ...samlCfg, cert: e.target.value })}
                    placeholder="MIIEgDCCAmgCAg..." rows={4} className="font-mono text-xs" />
                  <p className="text-xs text-muted-foreground">Paste the X.509 certificate from your IdP (without PEM headers)</p>
                </div>
              </>
            )}

            <div className="space-y-1.5">
              <Label>Default role for new users</Label>
              <Select value={defaultRole} onValueChange={(v) => setDefaultRole(v as "admin" | "member")}>
                <SelectTrigger data-testid="select-sso-default-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="member">Member</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-3">
              <Switch id="sso-active" checked={isActive} onCheckedChange={setIsActive} data-testid="switch-sso-active" />
              <Label htmlFor="sso-active">Active</Label>
            </div>

            {editing && (
              <div className="rounded-md bg-muted p-3 space-y-1 text-xs">
                <p className="font-semibold">URLs to configure in your IdP:</p>
                {type === "oidc" ? (
                  <p className="font-mono break-all">{window.location.origin}/api/auth/sso/oidc/{editing.id}/callback</p>
                ) : (
                  <>
                    <p><span className="font-semibold">ACS URL:</span> <span className="font-mono break-all">{window.location.origin}/api/auth/sso/saml/{editing.id}/acs</span></p>
                    <p><span className="font-semibold">Metadata:</span> <span className="font-mono break-all">{window.location.origin}/api/auth/sso/saml/{editing.id}/metadata</span></p>
                  </>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button data-testid="button-save-sso-provider" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !name}>
              {saveMutation.isPending ? "Saving…" : "Save Provider"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

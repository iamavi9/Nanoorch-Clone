import * as oidcClient from "openid-client";
import { SAML } from "@node-saml/node-saml";

export interface OidcProviderConfig {
  clientId: string;
  clientSecret: string;
  discoveryUrl: string;
}

export interface SamlProviderConfig {
  entryPoint: string;
  cert: string;
  issuer: string;
  callbackUrl: string;
}

export interface SsoUserInfo {
  sub: string;
  email?: string;
  name?: string;
}

// ── OIDC ──────────────────────────────────────────────────────────────────────

export async function oidcDiscover(config: OidcProviderConfig): Promise<oidcClient.Configuration> {
  return await oidcClient.discovery(
    new URL(config.discoveryUrl),
    config.clientId,
    config.clientSecret,
  );
}

export function oidcBuildRedirectUrl(
  config: oidcClient.Configuration,
  redirectUri: string,
  state: string,
  codeChallenge: string,
): string {
  const url = oidcClient.buildAuthorizationUrl(config, {
    redirect_uri: redirectUri,
    scope: "openid email profile",
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });
  return url.href;
}

export async function oidcHandleCallback(
  config: oidcClient.Configuration,
  callbackUrl: URL,
  expectedState: string,
  codeVerifier: string,
  redirectUri: string,
): Promise<SsoUserInfo> {
  const tokens = await oidcClient.authorizationCodeGrant(config, callbackUrl, {
    expectedState,
    pkceCodeVerifier: codeVerifier,
  });

  const claims = tokens.claims();
  let email = claims?.email as string | undefined;
  let name = (claims?.name ?? claims?.given_name) as string | undefined;

  if ((!email || !name) && tokens.access_token) {
    try {
      const userInfo = await oidcClient.fetchUserInfo(
        config,
        tokens.access_token,
        oidcClient.skipSubjectCheck,
      );
      email = email ?? (userInfo.email as string | undefined);
      name = name ?? (userInfo.name as string | undefined);
    } catch { /* use claims only */ }
  }

  return { sub: (claims?.sub as string) ?? "", email, name };
}

export function oidcRandomState(): string {
  return oidcClient.randomState();
}

export function oidcRandomCodeVerifier(): string {
  return oidcClient.randomPKCECodeVerifier();
}

export async function oidcCodeChallenge(verifier: string): Promise<string> {
  return await oidcClient.calculatePKCECodeChallenge(verifier);
}

// ── SAML ──────────────────────────────────────────────────────────────────────

function makeSaml(config: SamlProviderConfig): SAML {
  return new SAML({
    callbackUrl: config.callbackUrl,
    entryPoint: config.entryPoint,
    issuer: config.issuer,
    idpCert: config.cert,
    wantAssertionsSigned: false,
    wantAuthnResponseSigned: false,
  });
}

export async function samlBuildRedirectUrl(config: SamlProviderConfig): Promise<string> {
  const saml = makeSaml(config);
  return await saml.getAuthorizeUrlAsync("", undefined, {});
}

export async function samlValidateResponse(
  config: SamlProviderConfig,
  body: Record<string, string>,
): Promise<SsoUserInfo> {
  const saml = makeSaml(config);
  const { profile } = await saml.validatePostResponseAsync(body);
  if (!profile) throw new Error("No SAML profile in response");

  const email =
    (profile.email as string | undefined) ??
    (profile["urn:oid:1.2.840.113549.1.9.1"] as string | undefined) ??
    (profile.nameID?.includes("@") ? profile.nameID : undefined);

  const name =
    (profile.displayName as string | undefined) ??
    (profile["http://schemas.microsoft.com/identity/claims/displayname"] as string | undefined) ??
    (profile["urn:oid:2.16.840.1.113730.3.1.241"] as string | undefined);

  return { sub: profile.nameID ?? "", email, name };
}

export function samlGetMetadata(config: SamlProviderConfig): string {
  const saml = makeSaml(config);
  return saml.generateServiceProviderMetadata(null, null);
}

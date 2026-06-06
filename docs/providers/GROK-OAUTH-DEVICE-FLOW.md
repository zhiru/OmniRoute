---
title: "Grok (xAI) OAuth — Device Authorization Flow (RFC 8628)"
version: 1.0.0
lastUpdated: 2026-06-06
status: "Spec + implementation plan — NOT yet implemented"
---

# Grok (xAI) OAuth — Device Authorization Flow (RFC 8628)

> **Status:** 📋 Specification + implementation plan. **No production code exists yet.**
> Today OmniRoute only ships two Grok auth paths — `xai` (API key) and `grok-web`
> (web cookie `sso`+`sso-rw`). This document specifies adding a real **OAuth Device
> Authorization Grant** so subscription accounts (SuperGrok / X Premium+) can log in
> without a browser on the OmniRoute host.
>
> **Tracking:** [OmniRoute #2760](https://github.com/diegosouzapw/OmniRoute/issues/2760)
> (closed without code). **Upstream precedent:** OpenAI Codex device flow already
> implemented in OmniRoute — [`src/lib/oauth/codexDeviceFlow.ts`](../../src/lib/oauth/codexDeviceFlow.ts).

---

## 1. TL;DR

- xAI **officially supports** RFC 8628 device flow. Verified live against the
  production OIDC discovery document and the device/token endpoints (June 2026).
- The official CLI is `@xai-official/grok` (`grok login --device-auth`). Third-party
  proxies (CLIProxyAPI, Hermes Agent, OpenClaw) already integrate the same OAuth client.
- **Crucial difference vs Codex:** the Grok device flow can run **entirely
  server-side** in OmniRoute (RFC 8628 is *designed* for the polling client to be the
  backend). Codex had to be browser-driven because `auth.openai.com` blocks datacenter
  IPs via Cloudflare. **This must still be verified for `auth.x.ai` from the VPS**
  (see [§7 Open questions](#7-open-questions)). If `auth.x.ai` also blocks datacenter
  IPs, fall back to the Codex browser-driven pattern.
- The OAuth client is a **public CLI client** (PKCE, `token_endpoint_auth_method=none`).
  The client_id is a plain UUID — it does **not** match any secret-scanning pattern,
  so it can be embedded as a literal with an env override, exactly like
  `CODEX_CONFIG.clientId` (see [§6 Security](#6-security-notes)).

---

## 2. Verified protocol

All values below were captured **live** from the production xAI endpoints and
cross-checked against the CLIProxyAPI Go source (`internal/auth/xai/*`), which
reverse-engineered the official `@xai-official/grok` CLI.

### 2.1 OIDC discovery

`GET https://auth.x.ai/.well-known/openid-configuration` →

```json
{
  "issuer": "https://auth.x.ai",
  "authorization_endpoint": "https://auth.x.ai/oauth2/authorize",
  "device_authorization_endpoint": "https://auth.x.ai/oauth2/device/code",
  "token_endpoint": "https://auth.x.ai/oauth2/token",
  "userinfo_endpoint": "https://auth.x.ai/oauth2/userinfo",
  "revocation_endpoint": "https://auth.x.ai/oauth2/revoke",
  "jwks_uri": "https://auth.x.ai/.well-known/jwks.json",
  "id_token_signing_alg_values_supported": ["ES256"],
  "scopes_supported": [
    "openid", "profile", "email", "offline_access",
    "grok-cli:access", "team:read", "org:read", "api:access", "office-addins:access"
  ],
  "token_endpoint_auth_methods_supported": ["client_secret_basic", "client_secret_post", "none"],
  "grant_types_supported": [
    "authorization_code", "refresh_token",
    "urn:ietf:params:oauth:grant-type:device_code"
  ],
  "code_challenge_methods_supported": ["S256"]
}
```

> **Best practice:** resolve endpoints via discovery at runtime (CLIProxyAPI does this
> and validates every endpoint is `https` on `*.x.ai`). Hardcode the values below only
> as a fallback if discovery is unreachable.

### 2.2 Fixed constants (public, from the CLI)

| Constant | Value | Source |
| --- | --- | --- |
| Issuer | `https://auth.x.ai` | discovery |
| Device endpoint | `https://auth.x.ai/oauth2/device/code` | discovery |
| Token endpoint | `https://auth.x.ai/oauth2/token` | discovery |
| Verification URI (shown to user) | `https://accounts.x.ai/oauth2/device` | live device response |
| **client_id** (public) | `b1a00492-073a-47ea-816f-4c329264a828` | CLIProxyAPI `internal/auth/xai/types.go` |
| **scope** | `openid profile email offline_access grok-cli:access api:access` | CLIProxyAPI |
| PKCE method | `S256` (verifier = 96 random bytes, base64url no-pad) | discovery + CLIProxyAPI |
| id_token alg | `ES256` (claims: `sub`, `email`) | discovery |
| API base URL | `https://api.x.ai/v1` | CLIProxyAPI |
| Token refresh lead | 5 min before expiry | CLIProxyAPI |

### 2.3 Step 1 — request device + user code

```
POST https://auth.x.ai/oauth2/device/code
Content-Type: application/x-www-form-urlencoded
Accept: application/json

client_id=b1a00492-073a-47ea-816f-4c329264a828
&scope=openid profile email offline_access grok-cli:access api:access
&code_challenge=<S256 challenge>          # PKCE — accepted; recommended
&code_challenge_method=S256
```

**Live 200 response:**

```json
{
  "device_code": "NlXxcF3wtYF8RQU9pYFO0uVwZesJL9gekCYyFBF2mX9a…",
  "user_code": "4XWJ-JJAZ",
  "verification_uri": "https://accounts.x.ai/oauth2/device",
  "verification_uri_complete": "https://accounts.x.ai/oauth2/device?user_code=4XWJ-JJAZ",
  "expires_in": 900,
  "interval": 5
}
```

- `expires_in`: **900 s (15 min)** — overall deadline.
- `interval`: **5 s** — minimum poll interval.
- PKCE is **optional** here (the request succeeds without it) but **should** be sent —
  if `code_challenge` is provided, the poll must include the matching `code_verifier`.

### 2.4 Step 2 — user authorizes

The user opens `verification_uri` (or `verification_uri_complete`, which pre-fills the
code) on **any** device with a browser, signs in with their SuperGrok (grok.com) or X
Premium+ account, and approves. Display the `user_code` prominently in the dashboard.

### 2.5 Step 3 — poll for tokens

```
POST https://auth.x.ai/oauth2/token
Content-Type: application/x-www-form-urlencoded     # ⚠️ JSON returns HTTP 415
Accept: application/json

grant_type=urn:ietf:params:oauth:grant-type:device_code
&device_code=<device_code from step 1>
&client_id=b1a00492-073a-47ea-816f-4c329264a828
&code_verifier=<PKCE verifier>                      # only if code_challenge was sent
```

**While pending (live, HTTP 400):**

```json
{ "error": "authorization_pending", "error_description": "User has not yet authorized" }
```

**On success (HTTP 200, shape from CLIProxyAPI token parser):**

```json
{
  "access_token": "…",
  "refresh_token": "…",
  "id_token": "<ES256 JWT — claims: sub, email>",
  "token_type": "Bearer",
  "expires_in": 3600
}
```

Standard RFC 8628 polling errors to handle:

| `error` | Meaning | Action |
| --- | --- | --- |
| `authorization_pending` | user hasn't approved yet | keep polling at `interval` |
| `slow_down` | polling too fast | increase `interval` by 5 s, keep polling |
| `expired_token` | the 15-min window elapsed | stop; restart the flow |
| `access_denied` | user rejected | stop; show "declined" |

> **Verified gotcha:** the token endpoint **rejects JSON** (`HTTP 415 — Form requests
> must have Content-Type: application/x-www-form-urlencoded`). Always post
> form-urlencoded.

### 2.6 Step 4 — refresh

```
POST https://auth.x.ai/oauth2/token   (form-urlencoded)
grant_type=refresh_token
&client_id=b1a00492-073a-47ea-816f-4c329264a828
&refresh_token=<refresh_token>
```

Returns the same token shape. Refresh ~5 min before `expires_in` (CLIProxyAPI default),
or reactively on the first upstream `401`.

---

## 3. How this differs from existing OmniRoute flows

| | Codex device flow | **Grok device flow (this doc)** | Kilo device flow |
| --- | --- | --- | --- |
| Spec | OpenAI custom `deviceauth` | **RFC 8628 (standard)** | Kilo custom |
| Endpoint | `auth.openai.com/api/accounts/deviceauth/*` | `auth.x.ai/oauth2/device/code` + `/oauth2/token` | `api.kilo.ai/api/device-auth/codes` |
| Poll grant_type | n/a (custom JSON poll) | `urn:ietf:params:oauth:grant-type:device_code` | custom |
| PKCE | server-generated, returned in poll | **client-generated S256** (optional) | n/a |
| Must run in browser? | **Yes** (datacenter IP block) | **TBD** — RFC 8628 allows server-side; verify VPS reachability | server-side |
| Config home | `codexDeviceFlow.ts` (literal) | `XAI_DEVICE_CONFIG` in `oauth.ts` (proposed) | `KILOCODE_CONFIG` in `oauth.ts` |

The **Kilo Code** flow ([`oauth.ts:142`](../../src/lib/oauth/constants/oauth.ts#L142)) is
the closest server-side `initiate → poll` precedent. The **Codex** flow
([`codexDeviceFlow.ts`](../../src/lib/oauth/codexDeviceFlow.ts)) is the closest
device-UX precedent (user_code + verification_uri + polling state machine). The Grok
implementation should borrow the **state machine from Codex** and the **server-side
routing from Kilo**.

---

## 4. OmniRoute integration plan

> Implementation is intentionally deferred. This section is the build checklist for the
> follow-up PR. Each step must follow CLAUDE.md hard rules (tests with prod code,
> error sanitization, route-guard classification).

1. **Config** — add `XAI_DEVICE_CONFIG` (or extend an `XAI_OAUTH_CONFIG`) in
   [`src/lib/oauth/constants/oauth.ts`](../../src/lib/oauth/constants/oauth.ts):
   `issuer`, `deviceCodeUrl`, `tokenUrl`, `verificationUri`, `clientId` (env override
   `XAI_OAUTH_CLIENT_ID` ‖ literal UUID), `scope`. Mirror `KIMI_CODING_CONFIG` /
   `KILOCODE_CONFIG` shape.
2. **Flow module** — add the device-flow state machine. Two options:
   - **Server-side** (preferred if `auth.x.ai` is reachable from the VPS): a service
     under `open-sse/services/` or an OAuth route action that does
     `initiate → poll(interval) → tokens`, modeled on the Kilo server poll.
   - **Browser-driven** (fallback, if datacenter IPs are blocked): a client-side
     module like [`codexDeviceFlow.ts`](../../src/lib/oauth/codexDeviceFlow.ts) — the
     user's browser hits `auth.x.ai` directly via CORS and ships only the final tokens
     to the backend. **Decide via the §7 reachability probe before writing code.**
3. **Provider mapping** — add a `grok`/`xai-oauth` entry to
   [`src/lib/oauth/providers/`](../../src/lib/oauth/providers/) with
   `flowType: "device_code"`, `mapTokens` parsing the ES256 `id_token` for
   `email`/`sub` (reuse the JWT-decode pattern; **verify ES256 signature against
   `jwks_uri`** if we trust claims for routing).
4. **Provider registry** — register the OAuth Grok provider (distinct from `xai`
   API-key and `grok-web` cookie) in
   [`src/shared/constants/providers.ts`](../../src/shared/constants/providers.ts) and
   [`open-sse/config/providerRegistry.ts`](../../open-sse/config/providerRegistry.ts),
   with `baseUrl: https://api.x.ai/v1`.
5. **Route** — wire `src/app/api/oauth/[provider]/[action]/route.ts` (and, if a public
   shareable link is wanted like Codex's "Adicionar Externo", reuse
   [`deviceFlowTickets.ts`](../../src/lib/oauth/deviceFlowTickets.ts) +
   `src/app/connect/`). All error bodies through `buildErrorBody()`.
6. **UI** — provider screen buttons (Adicionar / device-code), reusing `OAuthModal`'s
   existing `user_code` + verification-URI display and polling UI.
7. **Refresh** — register in [`open-sse/services/tokenRefresh.ts`](../../open-sse/services/tokenRefresh.ts)
   with the 5-min lead.
8. **Tests** (required, same PR): unit tests for the flow state machine
   (`authorization_pending` / `slow_down` / `expired_token` / `access_denied` / success
   / interval normalization) with mocked `fetch`; `mapTokens` with a sample ES256
   id_token; a route test asserting error bodies don't leak stack traces.

---

## 5. Reference: authoritative source files

CLIProxyAPI ([`router-for-me/CLIProxyAPI`](https://github.com/router-for-me/CLIProxyAPI),
`internal/auth/xai/`) is the cleanest reverse-engineered reference (loopback PKCE
variant — same client/endpoints, different grant):

- `types.go` — `ClientID`, `Scope`, `Issuer`, `DiscoveryURL`, API base, refresh lead.
- `xai.go` — discovery, authorize URL builder, `authorization_code` + `refresh_token`
  exchange, `id_token` JWT identity parse.
- `pkce.go` — S256 verifier/challenge generation.
- `token.go` — credential persistence shape.

It implements the **loopback** grant, not device_code, so the device-specific bits
(`device_authorization_endpoint`, `urn:…:device_code` poll) in this doc come from the
**live discovery + endpoint probes**, not from CLIProxyAPI.

---

## 6. Security notes

- **client_id handling:** `b1a00492-073a-47ea-816f-4c329264a828` is a plain UUID. It
  does **not** match any GitHub Secret-Scanning / Semgrep pattern (`AIza…`, `GOCSPX-…`,
  `…apps.googleusercontent.com`, `Iv1.…`), so per
  [`docs/security/PUBLIC_CREDS.md`](../security/PUBLIC_CREDS.md) §"When NOT to use this
  helper", it does **not** require `resolvePublicCred()`. Embed it as a literal with an
  env override, exactly like `CODEX_CONFIG.clientId` and `CLAUDE_CONFIG.clientId`:
  ```ts
  clientId: process.env.XAI_OAUTH_CLIENT_ID || "b1a00492-073a-47ea-816f-4c329264a828",
  ```
- **PKCE:** always send `code_challenge`/`code_verifier` (S256) even though the device
  endpoint accepts requests without it — it binds the token exchange to this client.
- **Public connect link (if implemented):** reuse the Codex ticket model — strong random
  token, short expiry, single-use, scoped only to start/finish this provider's device
  flow. Never expose a free-form poll endpoint.
- **id_token trust:** if `email`/`sub` from the id_token drive account identity, verify
  the ES256 signature against `https://auth.x.ai/.well-known/jwks.json` rather than
  trusting unverified claims.
- **Error bodies:** route all HTTP/SSE errors through `buildErrorBody()` /
  `sanitizeErrorMessage()` (CLAUDE.md hard rule #12).

---

## 7. Open questions (resolve before/at implementation)

1. **Datacenter IP reachability** — does `auth.x.ai` (Cloudflare) serve datacenter IPs,
   or block them like `auth.openai.com`? Probe from the production VPS
   (`root@192.168.0.15`): `curl -sS -X POST https://auth.x.ai/oauth2/device/code -d
   'client_id=…&scope=…'`. If blocked → use the browser-driven pattern (step 2b);
   if served → server-side polling is simpler and supports OmniRoute's proxy context.
2. **Eligibility gating** — multiple sources note "xAI decides which accounts can
   receive OAuth API tokens." Confirm what a non-eligible account returns at poll time
   and surface a clear message (analogous to Codex's admin-gating 404).
3. **`api:access` vs subscription models** — confirm the OAuth bearer actually grants
   `https://api.x.ai/v1` chat access for `grok-build-0.1` / `grok-4.3` on a SuperGrok
   plan (vs only `grok-cli:access`). May require the `api:access` scope (already
   included) plus an eligible plan.
4. **Multi-account** — verify two device logins on the same OmniRoute instance don't
   invalidate each other's refresh-token family (the issue that forced `prompt=login`
   on Codex/Claude). The device flow's browser step is on `accounts.x.ai`; behavior TBD.

---

## 8. References

- [xAI Enterprise Deployments — device code (RFC 8628)](https://docs.x.ai/build/enterprise)
- [xAI OIDC discovery (live)](https://auth.x.ai/.well-known/openid-configuration)
- [CLIProxyAPI — `internal/auth/xai`](https://github.com/router-for-me/CLIProxyAPI/tree/main/internal/auth/xai)
- [Hermes Agent — xAI Grok OAuth guide](https://hermes-agent.nousresearch.com/docs/guides/xai-grok-oauth)
- [OpenClaw — xAI provider](https://docs.openclaw.ai/providers/xai)
- [RFC 8628 — OAuth 2.0 Device Authorization Grant](https://datatracker.ietf.org/doc/html/rfc8628)
- OmniRoute precedent: [`src/lib/oauth/codexDeviceFlow.ts`](../../src/lib/oauth/codexDeviceFlow.ts),
  [`KILOCODE_CONFIG`](../../src/lib/oauth/constants/oauth.ts#L142)
- Tracking issue: [OmniRoute #2760](https://github.com/diegosouzapw/OmniRoute/issues/2760)

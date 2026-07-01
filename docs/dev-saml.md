---
title: "SSO / SAML (Local Dev)"
description: "Set up SAML/OIDC single sign-on locally with Keycloak"
---

# Local SAML SSO Testing with Keycloak

## Overview

SkillSpell's backend includes a full SAML 2.0 Service Provider (SP). During development you don't need a real corporate Identity Provider (IdP) — this guide walks you through running a local Keycloak container so you can test the complete SSO login flow — including `skillspell login --sso` — entirely on your local machine without any external dependency.

Keycloak is a production-grade IdP with a real admin UI, real SAML metadata endpoints, and full support for arbitrary realm and client configuration. It replaces the previous containerized mock IdP that was used for local SAML testing.

---

## One-Time Setup

Follow these steps once after cloning (or after resetting your local environment).

### Step 1 — Start Keycloak

```bash
npm run saml:up
```

This starts the `keycloak/keycloak:latest` container in detached mode on port 8080.

> **Optional dev overrides:** The following env vars customize the Keycloak Docker container and can be set before running `saml:up`. They are dev-only and have no effect on the backend.
>
> | Variable | Default | Description |
> | --- | --- | --- |
> | `KEYCLOAK_PORT` | `8080` | Host port Keycloak listens on |
> | `KEYCLOAK_ADMIN` | `admin` | Keycloak admin username |
> | `KEYCLOAK_ADMIN_PASSWORD` | `admin` | Keycloak admin password |

### Step 2 — Open the Keycloak Admin UI

Navigate to [http://localhost:8080](http://localhost:8080) and log in with:

- **Username:** `admin`
- **Password:** `admin`

If the page is not yet reachable, wait 10–15 seconds for Keycloak to finish initializing and refresh.

### Step 3 — Create a realm (recommended)

Using the `master` realm works, but a dedicated realm keeps things tidy:

1. Click the realm drop-down in the top-left corner (shows **Keycloak** by default).
2. Click **Create realm**.
3. Set the **Realm name** to `skillspell` and click **Create**.

All subsequent steps use this realm. Replace `{realm}` with `skillspell` (or `master` if you skipped this step).

### Step 4 — Create a SAML client for SkillSpell

1. In the left sidebar, go to **Clients** → **Create client**.
2. Set **Client type** to `SAML`.
3. Set **Client ID** to your `APP_PUBLIC_URL` (e.g. `http://skillspell.localhost:1355`). This must exactly match the SP Entity ID — it becomes the `Issuer` in every SAMLRequest.
4. Click **Next**.
5. Set **Valid redirect URIs** to `{APP_PUBLIC_URL}/api/auth/saml/callback`.
6. Set **Master SAML Processing URL** to `{APP_PUBLIC_URL}/api/auth/saml/callback`. This is the field Keycloak actually validates against — Valid redirect URIs alone is not enough.
7. Click **Save**.

### Step 5 — Apply required client settings

Three settings must be changed from their defaults or Keycloak will reject the flow:

1. Open the client → **Settings** tab:
   - **Sign assertions** → **On** — SkillSpell verifies assertion-level signatures; Keycloak signs only the response envelope by default.
   - **Client signature required** → **Off** — SkillSpell does not sign AuthnRequests.

2. Save.

### Step 6 — Configure SAML attribute mappers

By default Keycloak does not include email/name attributes in the assertion. Add them:

1. Open the client → **Client scopes** tab → click the `{clientId}-dedicated` scope.
2. Click **Add mapper** → **By configuration** → **User Property**.
3. Add the following mappers (one at a time, click Save after each):

| Name | Property | SAML Attribute Name | SAML Attribute Name Format |
| --- | --- | --- | --- |
| `email` | `email` | `email` | Basic |
| `firstName` | `firstName` | `firstName` | Basic |
| `lastName` | `lastName` | `lastName` | Basic |

### Step 7 — Create a test user

1. In the left sidebar, go to **Users** → **Add user**.
2. Fill in **Username**, **Email**, **First name**, and **Last name**.
3. Click **Create**.
4. Go to the **Credentials** tab → **Set password** — set a password and turn off **Temporary**.

### Step 8 — Obtain the signing certificate

Run this command to extract the signing certificate directly:

```bash
curl -s http://localhost:8080/realms/skillspell/protocol/saml/descriptor \
  | grep -o '<ds:X509Certificate>[^<]*</ds:X509Certificate>' \
  | sed 's/<ds:X509Certificate>//;s/<\/ds:X509Certificate>//'
```

This prints the certificate as a single base64 line — copy the entire output. Do not add line breaks, spaces, or PEM headers.

### Step 9 — Configure SAML via the SkillSpell Admin UI

Go to **Admin → Organization Settings → SSO / SAML** and fill in these values:

| Field | Value |
| --- | --- |
| Provider ID | `keycloak-dev` |
| Display Name | `Keycloak (Local Dev)` |
| IdP Entity ID | `http://localhost:8080/realms/{realm}` |
| IdP SSO URL | `http://localhost:8080/realms/{realm}/protocol/saml` |
| IdP Certificate | Output from the command in Step 8 — single line, no headers |
| SP Entity ID | Your `APP_PUBLIC_URL` — must exactly match the Keycloak Client ID from Step 4 |
| Attribute Mapping — email | `email` |
| Attribute Mapping — firstName | `firstName` |
| Attribute Mapping — lastName | `lastName` |
| Auto-provision users | ✓ enabled |
| Default Role | `user` |

Click **Save SSO Configuration**.

---

## Testing the CLI SSO Flow

Make sure the backend is running and Keycloak is up (`npm run saml:up`).

> **Base URLs:** The default `npm run dev` (portless) setup serves the app at `http://skillspell.localhost:1355` and the backend at `http://api.skillspell.localhost:1355`. The examples below use these. `http://localhost:3000` is only the fallback when you run the backend/frontend individually (`npm run backend:dev` / `npm run frontend:dev`) without portless routing. The CLI does not hardcode a port — it uses a configurable base URL set via `skillspell config url`.

```bash
skillspell login --sso
```

What happens:

1. The CLI starts a local callback server and opens your browser to:
   `http://api.skillspell.localhost:1355/api/auth/saml/login?cli_redirect=http://localhost:<port>/callback`

2. The backend generates a SAML AuthnRequest and redirects your browser to Keycloak:
   `http://localhost:8080/realms/{realm}/protocol/saml`

3. You see the Keycloak login form. Enter the email and password of the test user you created in Step 6.

4. Keycloak POSTs a signed SAMLResponse to the SP callback (`/api/auth/saml/callback`).

5. The backend validates the assertion, creates the user account (first login), generates tokens, and redirects to the CLI callback server.

6. The CLI receives the auth code, exchanges it for tokens, and prints:

   ```text
   Authenticated as user@example.com
   ```

---

## Testing the Browser SSO Flow

1. Navigate to `http://skillspell.localhost:1355` and click **Sign in with SSO**.
2. Enter the email of your test user and click **Continue**.
3. You are redirected to the Keycloak login form.
4. Enter your test user's email and password. Click **Sign in**.
5. You are redirected back to the SkillSpell app, now authenticated.

---

## Stopping Keycloak

```bash
npm run saml:down
```

This stops the `keycloak` container. Your seeded SAML config in the database is preserved — you do not need to reconfigure next time (though Keycloak's own data is ephemeral unless you add a volume).

---

## Troubleshooting

### Container not starting / port 8080 already in use

Check if another process is using port 8080:

```bash
lsof -i :8080
```

If so, set a different port in your `.env` (or shell):

```bash
KEYCLOAK_PORT=9080 npm run saml:up
```

Then update the IdP URLs in the Admin UI to use the new port.

### Admin UI not accessible after `saml:up`

Keycloak takes 10–20 seconds to start in dev mode. Wait and refresh. Check container logs:

```bash
docker logs $(docker ps -qf "ancestor=keycloak/keycloak:latest")
```

Look for `Listening on: http://0.0.0.0:8080` to confirm it is ready.

### "Invalid requester" on the Keycloak login page

Keycloak cannot match the SAMLRequest to a registered client. Check:

1. **Client ID** in Keycloak must exactly match the **SP Entity ID** in SkillSpell Admin UI — including protocol, host, and port (e.g. `http://skillspell.localhost:1355`).
2. **Master SAML Processing URL** must be set to `{SP Entity ID}/api/auth/saml/callback` — Valid redirect URIs alone is not enough.
3. **Client signature required** must be **Off** — SkillSpell does not sign AuthnRequests.

### "SAML assertion validation failed — invalid signature"

Two possible causes:

#### 1. Sign assertions is Off in Keycloak (most common)

SkillSpell requires assertion-level signatures. Keycloak signs only the response envelope by default.

Fix: Keycloak → client → **Settings** → **Sign assertions** → **On**.

#### 2. Certificate mismatch — container recreated (new keys generated)

Fix: re-run the extraction command and update the IdP Certificate in the Admin UI:

```bash
curl -s http://localhost:8080/realms/skillspell/protocol/saml/descriptor \
  | grep -o '<ds:X509Certificate>[^<]*</ds:X509Certificate>' \
  | sed 's/<ds:X509Certificate>//;s/<\/ds:X509Certificate>//'
```

### "SAML SSO is not configured or is disabled"

The SAML config has not been saved, or the org's SSO toggle is off.

1. Complete Step 9 (Admin UI configuration) if not done yet.
2. If you still see this error, check `GET /api/auth/sso-status` — if `samlEnabled: false`, enable SSO via the admin UI (Settings → Organization → SSO).

---

## Key Details

| Property | Value |
| --- | --- |
| Admin UI | `http://localhost:8080` (admin / admin) |
| IdP Entity ID | `http://localhost:8080/realms/{realm}` |
| IdP SSO URL | `http://localhost:8080/realms/{realm}/protocol/saml` |
| IdP Metadata URL | `http://localhost:8080/realms/{realm}/protocol/saml/descriptor` |
| SP ACS Callback | `{APP_PUBLIC_URL}/api/auth/saml/callback` |
| Docker image | `keycloak/keycloak:latest` |
| Default credentials | `admin` / `admin` (dev only — never use in production) |

---

## How It All Fits Together

```text
Developer:
  npm run saml:up                            # starts Keycloak on :8080
  Keycloak Admin UI → create realm + client  # one-time setup
  Keycloak Admin UI → create test user       # add a user to log in with
  SkillSpell Admin UI → SSO / SAML → Save   # provisions SAML config into DB

SAML Login Flow:
  Browser → backend api.skillspell.localhost:1355/api/auth/saml/login
         → Keycloak :8080/realms/{realm}/protocol/saml
         → (user enters test user credentials)
         → backend api.skillspell.localhost:1355/api/auth/saml/callback
         → authenticated
```

Keycloak is fully isolated under the `saml` Docker Compose profile — it does not start with `docker compose up` (no profile) or `--profile app`. Only `npm run saml:up` brings it online.

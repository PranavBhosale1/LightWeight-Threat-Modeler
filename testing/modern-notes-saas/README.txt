=============================================================
MODERN NOTES SAAS  -  ThreatModeler Step 1 prefill (New flow)
=============================================================

Use this file as the copy/paste source when running the
Lightweight Threat Modeling Tool on the modern SaaS demo.

-------------------------------------------------------------
FLOW
-------------------------------------------------------------
Select: New / In Development
(Design the architecture from typed components in the
stencil designer; threats and security requirements attach
automatically.)

When you click "Open stencil designer", compose the system
from these components and connections (matches
ARCHITECTURE.md):

    Stencils to drop on the canvas:
      1. External Actor        - "End user (browser + SPA)"
      2. External Actor        - "Tenant-owned webhook endpoint"
      3. CDN / TLS edge        - "CDN"
      4. Reverse Proxy / nginx - "nginx (SPA + /api proxy)"
      5. API Service           - "Notes API (Node/Express)"
      6. Relational DB         - "Postgres 16 (multi-tenant)"
      7. Cache / KV            - "Redis 7 (rate limits + refresh deny-list)"
      8. Object Store          - "S3-compatible bucket"
      9. (optional) Anonymous  - "Public share-link viewer"

    Connections to draw:
      End user ---HTTPS--->                CDN
      CDN ---HTTPS--->                     nginx
      nginx ---HTTP (in-pod)--->           Notes API
      Notes API ---SQL (TLS)--->           Postgres
      Notes API ---RESP (TLS)--->          Redis
      Notes API ---presigned PUT URL--->   End user
      End user ---direct upload--->        Object Store
      Notes API ---HMAC-signed POST--->    Tenant webhook
      Share viewer ---HTTPS--->            CDN ---> nginx ---> Notes API

-------------------------------------------------------------
APPLICATION METADATA (Step 1 form fields)
-------------------------------------------------------------
Application Name *:
    Notes SaaS

Application Type:
    Web Application (multi-tenant SaaS)

Deployment Environment:
    Cloud (Public)

Application Status:
    New / In Development

Technology Stack:
    React 18 + Vite + TypeScript (SPA),
    Node 20 + Express + TypeScript (API),
    Postgres 16, Redis 7,
    S3-compatible object storage (MinIO in dev),
    Argon2id + JWT (access) + rotating refresh tokens,
    Docker Compose (local) / Kubernetes-style (prod),
    managed CDN + TLS edge, HMAC-signed outbound webhooks

Business Criticality:
    Medium-High - Customer content, multi-tenant,
    confidentiality of user notes is a core promise

Primary Compliance Scope:
    SOC 2 Type II (target), GDPR (EU tenants),
    ISO 27001 alignment

Functional Description:

    A multi-tenant note-taking SaaS. Users sign up with
    email + password (Argon2id); each signup provisions a
    tenant. Logged-in users create workspaces, author notes,
    attach files, and optionally share a single note via an
    unguessable public URL. Tenants can register outbound
    webhooks that receive HMAC-signed POSTs whenever a note
    is created or updated.

    The SPA is served by nginx and talks to a stateless
    Node/Express API. Postgres is the system of record,
    scoped per-tenant; Redis holds rate-limit counters,
    refresh-token metadata, and short-lived share-link
    caches. Attachments are uploaded directly by the
    browser to object storage via presigned PUT URLs;
    downloads go through presigned GET URLs that the API
    only issues after verifying tenant ownership.

    The threat model should focus on architectural risks:
    token rotation and revocation, webhook replay /
    SSRF-to-tenant URLs, presigned URL scope and expiry,
    share-link enumeration and cache coherency,
    multi-tenant row scoping, rate-limit bypass, and
    egress controls on webhook delivery.


=============================================================
PROJECT DESCRIPTION (plain-text mirror of original README)
=============================================================

Modern Notes SaaS
-----------------

A small-but-real note-taking SaaS, designed in 2025. Users
sign up, organize notes into workspaces, attach files, share
notes via public links, and subscribe to outbound webhooks
when notes change.

The project is intentionally modest in size but is
structured the way most new greenfield services are
structured today: a Vite + React SPA, a stateless
Node/Express API, Postgres for persistence, Redis for rate
limiting and short-lived tokens, and an S3-compatible
object store for attachments. The whole thing runs under
`docker compose` locally and is intended to be deployed to
a managed container platform.

It exists here as a "modern greenfield" counterpart to the
Legacy HR Portal, so the threat modeler can be exercised
against a system whose risks are less obvious and more
architectural than code-level.

What the application does
-------------------------
- Users sign up with email + password. Passwords are hashed
  with Argon2id.
- A short-lived JWT (access token) + rotating refresh token
  are returned on login.
- Users create workspaces; each workspace has notes and
  attachments.
- A note can be shared via a public, unguessable link
  (/s/:token).
- Tenants can register outbound webhooks; the API POSTs to
  those URLs whenever a note is created or updated.
- Attachments are uploaded via a presigned URL directly to
  object storage.

Tech stack
----------
- web/    Vite + React 18 + TypeScript SPA, served by nginx.
- server/ Node 20 + Express + pg + ioredis + jsonwebtoken
           + argon2.
- Postgres 16 - primary data store.
- Redis 7 - rate limits, refresh-token revocation list,
           share-link cache.
- S3-compatible object store (MinIO in local dev) -
           attachments.
- Docker Compose for local dev, Kubernetes-style deployment
           in prod.

High-level architecture (ASCII mirror of the Mermaid DFD)
---------------------------------------------------------

   +------------------+       HTTPS        +--------------+
   | Browser / SPA    | -----------------> | CDN / TLS    |
   | (end user)       |                    | edge         |
   +--------+---------+                    +------+-------+
            |                                     |
            |  direct upload (presigned PUT)      |
            |                                     v
            |                              +--------------+
            |                              | nginx        |
            |                              | serves SPA + |
            |                              | proxies /api |
            |                              +------+-------+
            |                                     |
            |                                     v
            |                              +--------------+
            |                              | Notes API    |
            |                              | Node/Express |
            |                              +--+--------+--+
            |                                 |        |
            |      +--------------------------+        |
            |      |                                   |
            v      v                                   v
        +-------------+                         +-----------+
        | S3 / MinIO  |                         | Postgres  |
        | attachments |                         | (tenants, |
        +-------------+                         |  notes,   |
                  ^                             |  hooks)   |
                  |                             +-----+-----+
                  |                                   |
                  |                                   v
                  |                             +-----------+
                  |                             | Redis     |
                  |                             | rate lim, |
                  |                             | refresh   |
                  |                             | deny-list |
                  |                             +-----------+
                  |
                  |  (HMAC-signed POST, outbound)
                  v
                   +-------------------------+
                   | Tenant-registered       |
                   | webhook endpoint        |
                   +-------------------------+

See ARCHITECTURE.md for the Mermaid diagram, trust
boundaries, asset inventory, and the authn/authz model
used for threat modeling.

Directory layout
----------------
modern-notes-saas/
  ARCHITECTURE.md
  docker-compose.yml
  .env.example
  server/
    package.json
    tsconfig.json
    src/
      index.ts             # Express app + middleware wiring
      db.ts                # pg pool, redis client
      middleware/auth.ts   # JWT verification, tenant scoping
      routes/
        auth.ts            # signup, login, refresh, logout
        notes.ts           # CRUD + share links + attachments
        webhooks.ts        # register / rotate secret / deliver
  web/
    package.json
    vite.config.ts
    src/
      App.tsx
      api.ts

Security posture (as designed)
------------------------------
- TLS everywhere at the edge; service-to-service traffic is
  on a private network.
- Argon2id for passwords, rotating refresh tokens,
  short-lived access JWTs.
- Per-tenant row scoping in every SQL query.
- Attachments uploaded directly via presigned URLs (API
  never sees bytes).
- Webhook deliveries are signed with an HMAC-SHA256 secret
  per subscription.
- Redis-based rate limiting on /auth/* and /api/*.

The threat model should focus on architectural and
operational risks (token rotation, webhook replay, SSRF via
public share fetching, rate-limit bypass, presigned URL
scope, multi-tenant data isolation) rather than obvious
code-level bugs.

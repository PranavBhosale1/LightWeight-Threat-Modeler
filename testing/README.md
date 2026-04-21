# Testing projects for the Lightweight Threat Modeler

Two small, self-contained example projects for demoing and exercising the
Lightweight Threat Modeler. Each one is designed to produce a meaningfully
different STRIDE output so you can show contrast in a single demo.

| Project                                     | Type                | Stack                                      | What it highlights                                                                                  |
| ------------------------------------------- | ------------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| [`legacy-hr-portal/`](./legacy-hr-portal/)  | Legacy monolith     | PHP 5/7 · Apache · MySQL · plain SMTP      | Loud, code-level STRIDE findings: SQLi, MD5 passwords, IDOR via query param, plaintext secrets, etc. |
| [`modern-notes-saas/`](./modern-notes-saas/) | Greenfield SaaS    | React (Vite) · Node/Express · Postgres · Redis · S3 | Architectural STRIDE findings: JWT rotation, webhook replay, SSRF surface, presigned URL scoping, multi-tenant isolation. |

## How to use them in the demo

1. Zip one of the project folders:

   ```bash
   cd testing
   zip -r legacy-hr-portal.zip legacy-hr-portal
   zip -r modern-notes-saas.zip modern-notes-saas
   ```

2. Open the Lightweight Threat Modeler in the browser.

3. Upload the ZIP. The `projectZipContext.js` extractor will pick up:
   - The full file tree.
   - `README.txt` and `ARCHITECTURE.md` (both include a diagram).
   - Manifests: `composer.json` for the legacy app, `package.json` +
     `docker-compose.yml` + `tsconfig.json` + `vite.config.ts` for the
     modern one.

   Each project's `README.txt` is pre-formatted for the demo: the top half
   is the exact values to paste into the ThreatModeler Step 1 form (flow,
   repo URL, application metadata, functional description), and the bottom
   half is the plain-text project description. Open it side-by-side with
   the wizard.

4. Run the STRIDE questionnaire. The two projects should give you visibly
   different threat catalogs, which is the point of the demo:

   - **Legacy**: many concrete Tampering / Information-Disclosure /
     Elevation-of-Privilege findings tied directly to source files.
   - **Modern**: fewer code-level findings, more **flow-level** and
     **trust-boundary** findings (auth tokens, webhook delivery, share
     links, object storage, multi-tenant scoping).

## Why two projects

Threat modeling behaves very differently on legacy vs. greenfield systems:

- On legacy systems, the hardest part is noticing how many standard
  patterns were simply never applied (hashing, parameterized queries,
  CSRF, audit logs, TLS between services).
- On greenfield systems, those patterns are usually already present; the
  interesting threats live in the seams — token lifecycle, webhook
  delivery semantics, presigned URL scope, egress to tenant-controlled
  URLs, cache coherency on share links, rate-limit bypass.

Having a concrete example of each lets the demo show the tool reasoning
about both styles of system, without hand-waving.

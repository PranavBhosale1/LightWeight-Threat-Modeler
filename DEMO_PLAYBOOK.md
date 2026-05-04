# LightWeight Threat Modeler Demo Playbook

Use this guide to explain what the project does, step-by-step, during a live demo.

## 1) What This Project Does

`LightWeight Threat Modeler` is a local-first threat modeling app that helps teams move from architecture context to a prioritized risk report using:

- **STRIDE** for threat discovery
- **DREAD** for risk scoring and prioritization
- **Component library seeding** for faster, structured starting points
- **Optional Gemini AI** for suggestions (not required for full workflow)

Core value to communicate in demo:

1. It is guided and repeatable (6-step wizard).
2. It works without AI (AI is optional acceleration).
3. Project data stays local in browser storage.
4. Final output is actionable (threat register, controls, mitigations, export).

---

## 2) Suggested Demo Flow (10-15 mins)

### Demo Storyline

Show one realistic application and walk from context to report:

1. Create/open a project
2. Define app profile and context
3. Generate and refine modules
4. Build/analyze DFD and trust boundaries
5. Review STRIDE threats
6. Score with DREAD
7. Generate final report and exports

### Opening Talk Track (30-45 sec)

Say:

> "This tool gives teams a practical threat-modeling pipeline. We capture architecture context, decompose into modules, model trust boundaries, identify STRIDE threats, score with DREAD, and generate a report that engineering can act on. Everything is local-first; AI suggestions are optional."

---

## 3) Screen-by-Screen Demo Script

## Home

### What to do

- Open the app home screen.
- Point at:
  - `Start new threat model`
  - `Try sample project`
  - dashboard cards (active models, threats, risk split, hotspots)

### What to explain

- Home is both entry point and quick portfolio view.
- It summarizes risk posture across all local projects.
- You can start blank or load sample data for faster demos.

### One-liner to say

> "Home gives me an instant security posture snapshot across all models and a one-click way to start new analysis."

---

## Project Hub

### What to do

- Open `My models` / hub.
- Show project cards with progress, critical/high counts, top STRIDE, and max DREAD.
- Mention actions: Continue, Duplicate, Export JSON, Delete.

### What to explain

- Hub is the operational view for multiple threat models.
- Teams can resume incomplete work and compare model maturity.
- JSON export makes backup/sharing/tracking easy.

### One-liner to say

> "Hub is where security and engineering track model progress and quickly see what needs triage next."

---

## Step 1 - Application Profile

### What to do

- Select flow:
  - `Legacy / Production`
  - `New / In Development`
  - `Redesign / Major Update`
- Fill metadata (name, type, environment, stack, compliance, description).
- For legacy/redesign, show repo context + ZIP option.
- Optional: click `Load demo data (testing)` for speed.

### What to explain

- This step defines scope and modeling assumptions.
- Legacy path can parse ZIP context locally for grounded analysis.
- New path opens stencil designer for architecture-first modeling.

### One-liner to say

> "Step 1 makes the model concrete: business context, technical context, and the right workflow path."

---

## Step 2 - Module Decomposition

### What to do

- Click `Analyze project and generate modules`.
- Show generated modules and edit fields (inputs, outputs, data stores, external entities).
- Show component type assignment and unresolved classification.
- Optional: run `Classify unresolved with Gemini`.

### What to explain

- The app first uses deterministic local signals (manifests/imports) and then optional AI refinement.
- Every module can map to a component type, which auto-attaches threat patterns and security requirements.
- Manual editing is always available (human-in-the-loop).

### One-liner to say

> "Step 2 converts raw codebase context into a structured attack-surface inventory."

---

## Step 3 - Data Flow Diagram (DFD)

### What to do

- Choose `Auto diagrams` or `Interactive canvas`.
- Show context-level and level-1 DFD.
- Add trust boundaries and assign modules.
- Click `Analyze trust boundaries (Gemini)` (optional AI).
- Show flagged cross-boundary flows.

### What to explain

- DFD is where data movement and trust transitions become visible.
- Trust boundaries are critical because they often define risk jumps.
- AI analysis here provides summary, risky flows, and boundary guidance.

### One-liner to say

> "Step 3 is where architecture turns into security reasoning, especially around boundary crossings."

---

## Step 4 - STRIDE Threat Analysis

### What to do

- Show library-seeded threats from typed components.
- Use guided questionnaire for a selected DFD element.
- Convert questionnaire answers into threat drafts.
- Optional: run `Auto-Suggest Threats with Gemini`.
- Mark each threat as:
  - Applicable
  - Under Review
  - Not Applicable

### What to explain

- Threats come from multiple sources: library, questionnaire, AI, and manual entries.
- The workflow preserves analyst judgment; suggestions are not auto-accepted.
- Triage status keeps the backlog clean and auditable.

### One-liner to say

> "Step 4 creates a traceable threat backlog and forces clear applicability decisions."

---

## Step 5 - DREAD Risk Scoring

### What to do

- Filter to applicable threats.
- Score each threat on DREAD dimensions:
  - Damage
  - Reproducibility
  - Exploitability
  - Affected Users
  - Discoverability
- Show severity output (Critical/High/Medium/Low).

### What to explain

- This is prioritization, not just enumeration.
- DREAD gives a defendable, transparent scoring method.
- Filters help teams focus by module, STRIDE category, and severity.

### One-liner to say

> "Step 5 turns a long threat list into an execution priority list."

---

## Step 6 - Threat Modeling Report

### What to do

- Show executive summary metrics.
- Show threats grouped by module/source.
- Show security requirements table and status tracking.
- Optional: `Generate Remediation Recommendations`.
- Export outputs:
  - `Export JSON`
  - `Print / Save PDF`

### What to explain

- Final output is immediately useful for engineering planning.
- Security requirements are tracked with status and issue key mapping.
- The prioritization matrix recommends testing cadence based on risk profile.

### One-liner to say

> "Step 6 converts analysis into an actionable plan with ownership and reporting outputs."

---

## 4) Fast Demo Modes

## Mode A: 5-Minute Executive Demo

Focus only on:

1. Home value
2. One wizard pass (high-level only)
3. Report output + top risk counts

Use phrases like:
- "local-first"
- "repeatable process"
- "prioritized output"

## Mode B: 12-15 Minute Technical Demo

Include:

1. ZIP/context ingestion
2. Module decomposition details
3. Trust boundary setup
4. STRIDE triage
5. DREAD scoring logic
6. Report export path

---

## 5) Demo Checklist (Before Presenting)

- Open app and verify project data is present.
- Keep one prepared project in hub for fallback.
- Have one "quick story" and one "deep story".
- Decide if you will use AI in the demo:
  - If yes: verify API key.
  - If no: explicitly call out full manual/local flow.
- Keep Step 6 ready in another tab as backup ending.

---

## 6) Common Questions + Suggested Answers

### "Do we need AI for this tool?"

No. AI is optional. The full workflow works with manual and deterministic local logic.

### "Where is data stored?"

In browser local storage on this device. You can export JSON/PDF for sharing.

### "How is this different from a static checklist?"

It links architecture context, trust boundaries, STRIDE triage, and DREAD scoring into one continuous workflow with traceable outputs.

### "Can engineering teams use this continuously?"

Yes. Hub supports multiple projects, progress tracking, duplication, and exports for ongoing threat-model lifecycle use.

---

## 7) Closing Statement for Demo

> "The core outcome is not just finding threats; it is creating a repeatable, local-first security workflow that teams can run regularly and convert into prioritized remediation work."


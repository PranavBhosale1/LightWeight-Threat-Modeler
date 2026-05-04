import { useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { C, STRIDE } from "../threatModeler/modelConstants.js";
import {
  createBlankProject,
  makeProjectId,
  saveProjectSnapshot,
  listProjectSummaries,
  loadProjectSnapshot
} from "../lib/projectPersistence.js";
import { averageScore, createModule } from "../threatModeler/modelHelpers.js";
import { getSampleSnapshot } from "../lib/sampleProject.js";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function Home() {
  const navigate = useNavigate();
  const dashboard = useMemo(() => {
    const summaries = listProjectSummaries();
    const threats = summaries.flatMap((summary) => {
      const snapshot = loadProjectSnapshot(summary.id);
      return Array.isArray(snapshot?.threats) ? snapshot.threats : [];
    });
    const applicable = threats.filter((threat) => threat.status === "applicable");
    const review = threats.filter((threat) => threat.status === "review");
    const scored = applicable.map((threat) => averageScore(threat.dreadScores));
    const critical = scored.filter((score) => score > 8).length;
    const high = scored.filter((score) => score >= 6 && score <= 8).length;
    const medium = scored.filter((score) => score >= 4 && score < 6).length;
    const low = scored.filter((score) => score < 4).length;
    const strideCounts = STRIDE.map((stride) => ({
      ...stride,
      count: applicable.filter((threat) => threat.strideCategory === stride.id).length
    }));
    const dreadFactors = [
      { id: "damage", name: "Damage" },
      { id: "reproducibility", name: "Reproducibility" },
      { id: "exploitability", name: "Exploitability" },
      { id: "affectedUsers", name: "Affected users" },
      { id: "discoverability", name: "Discoverability" }
    ];
    const dreadAverages = dreadFactors.map((factor) => {
      const values = applicable
        .map((threat) => Number(threat?.dreadScores?.[factor.id]))
        .filter((value) => Number.isFinite(value) && value > 0);
      const average = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
      return {
        ...factor,
        score: Number(average.toFixed(1))
      };
    });
    const hotspotMap = {};
    applicable.forEach((threat) => {
      const moduleName = threat.moduleName || "Unassigned component";
      hotspotMap[moduleName] = (hotspotMap[moduleName] || 0) + 1;
    });
    const hotspots = Object.entries(hotspotMap)
      .map(([moduleName, count]) => ({ moduleName, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);
    return {
      models: summaries.length,
      threats: threats.length,
      applicable: applicable.length,
      review: review.length,
      critical,
      high,
      medium,
      low,
      strideCounts,
      dreadAverages,
      hotspots
    };
  }, []);

  const startNew = () => {
    const id = createBlankProject(createModule);
    navigate(`/project/${id}`);
  };

  const loadSample = () => {
    const id = makeProjectId();
    saveProjectSnapshot(id, getSampleSnapshot());
    navigate(`/project/${id}`);
  };

  return (
    <div className="tm-page-enter" style={{ ...C.root, minHeight: "100vh" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=Inter:wght@400;500;600;700&display=swap');*{box-sizing:border-box}`}</style>
      <header style={C.hdr}>
        <div style={C.hdrIn}>
          <span style={{ fontWeight: 800, fontFamily: "Manrope, sans-serif", letterSpacing: -0.2, fontSize: 20 }}>ThreatModeler</span>
          <nav style={{ display: "flex", gap: 14 }}>
            <Link to="/hub" style={{ color: "#586064", fontSize: 13, textDecoration: "none" }}>My models</Link>
            <Link to="/help" style={{ color: "#586064", fontSize: 13, textDecoration: "none" }}>Help</Link>
            <Link to="/settings" style={{ color: "#586064", fontSize: 13, textDecoration: "none" }}>Settings</Link>
          </nav>
        </div>
      </header>

      <main className="tm-stagger" style={{ ...C.main, paddingTop: 46 }}>
        <section className="tm-hero" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(280px,430px)", gap: 24, alignItems: "stretch", marginBottom: 28 }}>
          <div className="tm-card-hover" style={{ position: "relative", paddingLeft: 20 }}>
            <div style={{ position: "absolute", left: 0, top: 6, bottom: 10, width: 4, borderRadius: 4, background: "#436086" }} />
            <h1 style={{ fontFamily: "Manrope, sans-serif", fontSize: "clamp(2.2rem, 4.8vw, 3.5rem)", lineHeight: 1.05, letterSpacing: "-0.02em", margin: "0 0 14px", color: "#2b3437" }}>
              Architectural integrity for threat modeling.
            </h1>
            <p style={{ color: "#586064", fontSize: 16, lineHeight: 1.7, maxWidth: 760, margin: 0 }}>
              Move from ad-hoc checklists to a calm, structured STRIDE + DREAD workflow. Model architecture, analyze trust boundaries, and produce an actionable report your team can actually use.
            </p>
            <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
              <Badge variant="secondary">STRIDE</Badge>
              <Badge variant="secondary">DREAD</Badge>
              <Badge variant="outline">Local-first data</Badge>
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 24 }}>
              <Button type="button" onClick={startNew} className="h-11 px-5" style={{ background: "linear-gradient(135deg, #436086 0%, #375479 100%)" }}>
                Start new threat model
              </Button>
              <Button type="button" onClick={() => navigate("/hub")} variant="outline" className="h-11 px-5">
                Open recent
              </Button>
              <Button type="button" onClick={loadSample} variant="outline" className="h-11 px-5">
                Try sample project
              </Button>
            </div>
          </div>

          <Card className="tm-card-hover gap-0 py-0" style={{ ...C.card, marginBottom: 0, background: "rgba(255,255,255,0.85)", backdropFilter: "blur(18px)", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
            <CardContent className="p-0">
              <div style={{ color: "#436086", fontFamily: "Manrope, sans-serif", fontSize: 11, letterSpacing: 1.4, textTransform: "uppercase", marginBottom: 14 }}>Signal Overview</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                {[ ["Active models", String(dashboard.models)], ["Applicable threats", String(dashboard.applicable)], ["Critical risk", String(dashboard.critical)], ["Review queue", String(dashboard.review)] ].map(([k, v]) => (
                  <div className="tm-card-hover" key={k} style={{ background: "#f1f4f6", borderRadius: 10, padding: "10px 12px" }}>
                    <div style={{ color: "#586064", fontSize: 11 }}>{k}</div>
                    <div style={{ color: "#2b3437", fontFamily: "Manrope, sans-serif", fontWeight: 700, marginTop: 3 }}>{v}</div>
                  </div>
                ))}
              </div>
            </CardContent>
            <p style={{ color: "#586064", fontSize: 12, lineHeight: 1.55, margin: "16px 0 0" }}>
              ZIP parsing and project snapshots stay in your browser. AI suggestions are optional and use your configured key.
            </p>
          </Card>
        </section>

        <section className="tm-card-hover" style={{ ...C.card, padding: 24 }}>
          <div style={{ color: "#436086", fontFamily: "Manrope, sans-serif", fontSize: 11, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 14 }}>
            Threat Dashboard
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {[["Total threats", dashboard.threats], ["High risk", dashboard.high], ["Medium risk", dashboard.medium], ["Low risk", dashboard.low]].map(([title, value]) => (
                <article className="tm-card-hover" key={title} style={{ background: "#f1f4f6", borderRadius: 10, padding: 12 }}>
                  <div style={{ color: "#586064", fontSize: 11 }}>{title}</div>
                  <div style={{ color: "#2b3437", fontFamily: "Manrope, sans-serif", fontWeight: 700, marginTop: 3 }}>{value}</div>
                </article>
              ))}
            </div>
            <div style={{ background: "#f1f4f6", borderRadius: 12, padding: 12 }}>
              <div style={{ color: "#586064", fontSize: 12, marginBottom: 10 }}>STRIDE distribution (applicable)</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {dashboard.strideCounts.map((item) => {
                  const max = Math.max(...dashboard.strideCounts.map((s) => s.count), 1);
                  const width = `${Math.max(10, Math.round((item.count / max) * 100))}%`;
                  return (
                    <div key={item.id}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#586064", marginBottom: 4 }}>
                        <span>{item.name}</span>
                        <span>{item.count}</span>
                      </div>
                      <div style={{ height: 6, background: "#d6dde0", borderRadius: 6, overflow: "hidden" }}>
                        <div style={{ width, height: "100%", background: item.color }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div style={{ background: "#f1f4f6", borderRadius: 12, padding: 12 }}>
              <div style={{ color: "#586064", fontSize: 12, marginBottom: 10 }}>DREAD profile (avg 0-10)</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {dashboard.dreadAverages.map((item) => {
                  const width = `${Math.max(10, Math.round((item.score / 10) * 100))}%`;
                  return (
                    <div key={item.id}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#586064", marginBottom: 4 }}>
                        <span>{item.name}</span>
                        <span>{item.score.toFixed(1)}</span>
                      </div>
                      <div style={{ height: 6, background: "#d6dde0", borderRadius: 6, overflow: "hidden" }}>
                        <div style={{ width, height: "100%", background: "#375479" }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          <div style={{ marginTop: 14, color: "#586064", fontSize: 12 }}>
            Top hotspots: {dashboard.hotspots.length
              ? dashboard.hotspots.map((item) => `${item.moduleName} (${item.count})`).join(" · ")
              : "Add threats in STRIDE step to populate hotspots"}
          </div>
        </section>

        <section className="tm-card-hover" style={{ ...C.card, padding: 24 }}>
          <div style={{ color: "#436086", fontFamily: "Manrope, sans-serif", fontSize: 11, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 14 }}>Methodology</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
            {[
              ["1 · Profile", "Capture business context, critical assets, and regulatory pressure before modeling.", "Outcome: clear scope and security assumptions."],
              ["2 · Modules", "Break architecture into services, APIs, data stores, and external actors.", "Outcome: attack surface inventory by component."],
              ["3 · DFD", "Map trust boundaries, data movement, and privilege transitions end to end.", "Outcome: visibility into boundary-crossing flows."],
              ["4 · STRIDE", "Generate likely threats per element and mark applicability with rationale.", "Outcome: triaged threat backlog ready for scoring."],
              ["5 · DREAD", "Score impact and exploitability to prioritize the highest-risk scenarios.", "Outcome: ranked risk list with focus order."],
              ["6 · Report", "Export findings, mitigations, and ownership into a shareable artifact.", "Outcome: actionable plan for engineering teams."]
            ].map(([title, desc, outcome]) => (
              <article className="tm-card-hover" key={title} style={{ background: "#f1f4f6", borderRadius: 12, padding: 14, minHeight: 96 }}>
                <h3 style={{ margin: 0, fontFamily: "Manrope, sans-serif", fontSize: 15, color: "#2b3437" }}>{title}</h3>
                <p style={{ margin: "6px 0 0", fontSize: 13, color: "#586064", lineHeight: 1.45 }}>{desc}</p>
                <p style={{ margin: "7px 0 0", fontSize: 12, color: "#4b565a", lineHeight: 1.4 }}>{outcome}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="tm-card-hover" style={{ ...C.card, padding: 24 }}>
          <div style={{ color: "#436086", fontFamily: "Manrope, sans-serif", fontSize: 11, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 14 }}>
            Threat Lens
          </div>
          <p style={{ margin: "0 0 12px", color: "#586064", fontSize: 13, lineHeight: 1.6 }}>
            Each STRIDE category includes a quick attack example and a validation question to guide threat review discussions.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 10 }}>
            {[
              { id: "S", name: "Spoofing", desc: "Impersonating an entity", example: "Example: stolen session token used to act as an admin.", ask: "Ask: how do we strongly verify identity for every sensitive action?" },
              { id: "T", name: "Tampering", desc: "Modifying data or code", example: "Example: payload alteration between client, API gateway, and service.", ask: "Ask: where do we enforce integrity checks and signed updates?" },
              { id: "R", name: "Repudiation", desc: "Denying an action", example: "Example: user claims they never changed billing settings.", ask: "Ask: do logs provide non-repudiation and traceability?" },
              { id: "I", name: "Info Disclosure", desc: "Exposing private data", example: "Example: debug endpoint leaks PII or secrets in responses.", ask: "Ask: what controls prevent sensitive data leakage at rest and in transit?" },
              { id: "D", name: "Denial of Service", desc: "Degrading availability", example: "Example: expensive query floods starve critical workloads.", ask: "Ask: where are limits, backpressure, and graceful degradation defined?" },
              { id: "E", name: "Elevation of Privilege", desc: "Gaining extra permissions", example: "Example: IDOR lets basic users perform admin-only actions.", ask: "Ask: are authorization checks centralized and default-deny?" }
            ].map((item) => (
              <article className="tm-card-hover" key={item.id} style={{ background: "#f1f4f6", borderRadius: 12, padding: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <h3 style={{ margin: 0, fontFamily: "Manrope, sans-serif", fontSize: 14, color: "#2b3437" }}>{item.name}</h3>
                  <Badge variant="outline">{item.id}</Badge>
                </div>
                <p style={{ margin: 0, fontSize: 12, color: "#586064", lineHeight: 1.5 }}>{item.desc}</p>
                <p style={{ margin: "8px 0 0", fontSize: 12, color: "#4b565a", lineHeight: 1.45 }}>{item.example}</p>
                <p style={{ margin: "6px 0 0", fontSize: 12, color: "#2f3a3d", lineHeight: 1.45 }}>{item.ask}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="tm-card-hover" style={{ ...C.card, padding: 24 }}>
          <div style={{ color: "#436086", fontFamily: "Manrope, sans-serif", fontSize: 11, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 14 }}>
            DREAD Lens
          </div>
          <p style={{ margin: "0 0 12px", color: "#586064", fontSize: 13, lineHeight: 1.6 }}>
            Each DREAD factor includes a quick scoring cue and a calibration question to align risk rating discussions.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 10 }}>
            {[
              { id: "D", name: "Damage", desc: "How severe is the impact if exploited?", example: "Example: compromise exposes customer PII and causes regulatory penalties.", ask: "Ask: what is the operational, legal, and business impact at worst case?" },
              { id: "R", name: "Reproducibility", desc: "How reliably can the attack be repeated?", example: "Example: a single crafted request consistently bypasses validation.", ask: "Ask: can an attacker repeat this on demand across environments?" },
              { id: "E", name: "Exploitability", desc: "How easy is it to execute the attack?", example: "Example: exploitation needs only browser tools and no special access.", ask: "Ask: what skill, tooling, and preconditions are required?" },
              { id: "A", name: "Affected Users", desc: "How many users or systems are impacted?", example: "Example: one insecure endpoint impacts every tenant in a shared platform.", ask: "Ask: is blast radius isolated to one account or broad across customers?" },
              { id: "D2", name: "Discoverability", desc: "How likely is the issue to be found?", example: "Example: vulnerable debug route is indexed in public API docs.", ask: "Ask: would a routine scan or code review uncover this quickly?" }
            ].map((item) => (
              <article className="tm-card-hover" key={item.id} style={{ background: "#f1f4f6", borderRadius: 12, padding: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <h3 style={{ margin: 0, fontFamily: "Manrope, sans-serif", fontSize: 14, color: "#2b3437" }}>{item.name}</h3>
                  <Badge variant="outline">{item.id === "D2" ? "D" : item.id}</Badge>
                </div>
                <p style={{ margin: 0, fontSize: 12, color: "#586064", lineHeight: 1.5 }}>{item.desc}</p>
                <p style={{ margin: "8px 0 0", fontSize: 12, color: "#4b565a", lineHeight: 1.45 }}>{item.example}</p>
                <p style={{ margin: "6px 0 0", fontSize: 12, color: "#2f3a3d", lineHeight: 1.45 }}>{item.ask}</p>
              </article>
            ))}
          </div>
        </section>

        <p style={{ color: "#586064", fontSize: 12, lineHeight: 1.6, marginTop: 16 }}>
          Data handling: project data stays in localStorage on this device. Add a Gemini key only if you want optional AI suggestions.
        </p>
      </main>
    </div>
  );
}

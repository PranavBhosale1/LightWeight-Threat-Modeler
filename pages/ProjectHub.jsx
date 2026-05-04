import { useState, useCallback, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { C, STRIDE } from "../threatModeler/modelConstants.js";
import {
  listProjectSummaries,
  createBlankProject,
  deleteProject,
  duplicateProject,
  exportProjectDownload,
  completionPercent,
  loadProjectSnapshot
} from "../lib/projectPersistence.js";
import { averageScore, createModule } from "../threatModeler/modelHelpers.js";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function ProjectHub() {
  const navigate = useNavigate();
  const [rows, setRows] = useState(() => listProjectSummaries());
  const refresh = useCallback(() => setRows(listProjectSummaries()), []);
  const projectThreatInsights = useMemo(() => {
    return rows.map((row) => {
      const snapshot = loadProjectSnapshot(row.id);
      const threats = Array.isArray(snapshot?.threats) ? snapshot.threats : [];
      const applicableThreats = threats.filter((threat) => threat.status === "applicable");
      const reviewThreats = threats.filter((threat) => threat.status === "review");
      const notApplicableThreats = threats.filter((threat) => threat.status === "not-applicable");
      const applicableScores = applicableThreats.map((threat) => averageScore(threat.dreadScores));
      const critical = applicableScores.filter((score) => score > 8).length;
      const high = applicableScores.filter((score) => score >= 6 && score <= 8).length;
      const strideCounts = applicableThreats.reduce((acc, threat) => {
        const key = threat.strideCategory || "S";
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {});
      const dominantStrideId = Object.entries(strideCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "";
      const dominantStride = STRIDE.find((item) => item.id === dominantStrideId);
      return {
        id: row.id,
        totalThreats: threats.length,
        applicable: applicableThreats.length,
        review: reviewThreats.length,
        notApplicable: notApplicableThreats.length,
        critical,
        high,
        maxScore: applicableScores.length ? Math.max(...applicableScores) : 0,
        averageScore: applicableScores.length
          ? applicableScores.reduce((sum, score) => sum + score, 0) / applicableScores.length
          : 0,
        dominantStride
      };
    });
  }, [rows]);
  const overview = useMemo(() => {
    const strideTotals = projectThreatInsights.reduce((acc, insight) => {
      if (!insight.dominantStride?.id) return acc;
      acc[insight.dominantStride.id] = (acc[insight.dominantStride.id] || 0) + 1;
      return acc;
    }, {});
    const dominantStrideId = Object.entries(strideTotals).sort((a, b) => b[1] - a[1])[0]?.[0] || "";
    const dominantStride = STRIDE.find((item) => item.id === dominantStrideId);
    const totalApplicable = projectThreatInsights.reduce((sum, insight) => sum + insight.applicable, 0);
    return {
      totalThreats: projectThreatInsights.reduce((sum, insight) => sum + insight.totalThreats, 0),
      totalApplicable,
      totalReview: projectThreatInsights.reduce((sum, insight) => sum + insight.review, 0),
      totalCritical: projectThreatInsights.reduce((sum, insight) => sum + insight.critical, 0),
      totalHigh: projectThreatInsights.reduce((sum, insight) => sum + insight.high, 0),
      averageDread: totalApplicable
        ? projectThreatInsights.reduce((sum, insight) => sum + (insight.averageScore * insight.applicable), 0) / totalApplicable
        : 0,
      dominantStride
    };
  }, [projectThreatInsights]);
  const projectThreatInsightsById = useMemo(
    () => Object.fromEntries(projectThreatInsights.map((insight) => [insight.id, insight])),
    [projectThreatInsights]
  );

  return (
    <div className="tm-page-enter" style={{ ...C.root, minHeight: "100vh" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=Inter:wght@400;500;600;700&display=swap');
        *{box-sizing:border-box}
      `}</style>
      <header style={C.hdr}>
        <div style={C.hdrIn}>
          <Link to="/" style={{ color: "#2b3437", textDecoration: "none", fontWeight: 800, fontFamily: "Manrope, sans-serif", fontSize: 20 }}>ThreatModeler</Link>
          <nav style={{ display: "flex", gap: 14 }}>
            <Link to="/help" style={{ color: "#586064", fontSize: 13, textDecoration: "none" }}>Help</Link>
            <Link to="/settings" style={{ color: "#586064", fontSize: 13, textDecoration: "none" }}>Settings</Link>
          </nav>
        </div>
      </header>
      <main className="tm-stagger" style={{ ...C.main, paddingTop: 40 }}>
        <div style={{ position: "relative", paddingLeft: 18, marginBottom: 20 }}>
          <div style={{ position: "absolute", left: 0, top: 6, bottom: 6, width: 4, background: "#436086", borderRadius: 4 }} />
          <h1 style={{ margin: 0, fontSize: "clamp(2rem, 4vw, 3rem)", fontFamily: "Manrope, sans-serif", letterSpacing: "-0.02em", color: "#2b3437" }}>Project Hub</h1>
          <p style={{ margin: "8px 0 0", color: "#586064", fontSize: 14 }}>
            Track active threat posture across your models: STRIDE coverage, DREAD exposure, and what needs triage next.
          </p>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12, marginBottom: 20 }}>
          <div className="tm-card-hover" style={{ ...C.card, marginBottom: 0 }}>
            <div style={{ color: "#586064", fontSize: 12 }}>Saved models</div>
            <div style={{ fontFamily: "Manrope, sans-serif", fontSize: 28, fontWeight: 700, marginTop: 6 }}>{rows.length}</div>
          </div>
          <div className="tm-card-hover" style={{ ...C.card, marginBottom: 0 }}>
            <div style={{ color: "#586064", fontSize: 12 }}>Average progress</div>
            <div style={{ fontFamily: "Manrope, sans-serif", fontSize: 28, fontWeight: 700, marginTop: 6 }}>
              {rows.length ? Math.round(rows.reduce((s, r) => s + completionPercent(r.step), 0) / rows.length) : 0}%
            </div>
          </div>
          <div className="tm-card-hover" style={{ ...C.card, marginBottom: 0 }}>
            <div style={{ color: "#586064", fontSize: 12 }}>Applicable threats</div>
            <div style={{ fontFamily: "Manrope, sans-serif", fontSize: 28, fontWeight: 700, marginTop: 6 }}>{overview.totalApplicable}</div>
            <div style={{ marginTop: 4, color: "#586064", fontSize: 12 }}>
              {overview.totalThreats} total discovered
            </div>
          </div>
          <div className="tm-card-hover" style={{ ...C.card, marginBottom: 0 }}>
            <div style={{ color: "#586064", fontSize: 12 }}>Critical / High risk</div>
            <div style={{ fontFamily: "Manrope, sans-serif", fontSize: 28, fontWeight: 700, marginTop: 6 }}>
              {overview.totalCritical} / {overview.totalHigh}
            </div>
            <div style={{ marginTop: 4, color: "#586064", fontSize: 12 }}>
              Avg DREAD {overview.averageDread ? overview.averageDread.toFixed(1) : "0.0"}
            </div>
          </div>
          <div className="tm-card-hover" style={{ ...C.card, marginBottom: 0 }}>
            <div style={{ color: "#586064", fontSize: 12 }}>Most frequent STRIDE focus</div>
            <div style={{ fontFamily: "Manrope, sans-serif", fontSize: 18, fontWeight: 700, marginTop: 8 }}>
              {overview.dominantStride ? overview.dominantStride.name : "Not enough data"}
            </div>
            <div style={{ marginTop: 6, color: "#586064", fontSize: 12 }}>
              Review: {overview.totalReview} pending threat decisions
            </div>
          </div>
          <div className="tm-card-hover" style={{ ...C.card, marginBottom: 0, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
            <div>
              <div style={{ color: "#586064", fontSize: 12 }}>New analysis</div>
              <div style={{ color: "#2b3437", fontSize: 13, marginTop: 4 }}>Start from scratch</div>
            </div>
            <Button type="button" onClick={() => navigate(`/project/${createBlankProject(createModule)}`)} style={{ background: "linear-gradient(135deg, #436086 0%, #375479 100%)" }}>
              New project
            </Button>
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap", marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: 20, color: "#2b3437", fontFamily: "Manrope, sans-serif" }}>Recent threat models</h2>
          <Button type="button" onClick={() => navigate(`/project/${createBlankProject(createModule)}`)} style={{ background: "linear-gradient(135deg, #436086 0%, #375479 100%)" }}>
            New project
          </Button>
        </div>

        {!rows.length && (
          <div className="tm-card-hover" style={{ ...C.card, color: "#586064", textAlign: "center", padding: 36 }}>
            No saved models yet. Start from the <Link to="/" style={{ color: "#436086" }}>home page</Link> or create a new project above.
          </div>
        )}

        {rows.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {rows.map((row) => {
              const insight = projectThreatInsightsById[row.id];
              return (
              <Card className="tm-card-hover gap-0 py-0" key={row.id} style={{ ...C.card, display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12, borderLeft: "4px solid #436086" }}>
                <CardContent className="p-0">
                <div>
                  <div style={{ fontWeight: 700, color: "#2b3437", marginBottom: 4, fontFamily: "Manrope, sans-serif", fontSize: 16 }}>{row.name || "Untitled"}</div>
                  <div style={{ fontSize: 12, color: "#586064", fontFamily: "Inter, sans-serif" }}>
                    {row.appStatus} · Step {row.step}/6 · {completionPercent(row.step)}% · Updated {new Date(row.updatedAt).toLocaleString()}
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8, alignItems: "center" }}>
                    <Badge variant={insight?.critical ? "destructive" : "secondary"}>
                      Critical {insight?.critical || 0}
                    </Badge>
                    <Badge variant="secondary">
                      High {insight?.high || 0}
                    </Badge>
                    <Badge variant="secondary">
                      Applicable {insight?.applicable || 0}
                    </Badge>
                    <Badge variant="secondary">
                      Review {insight?.review || 0}
                    </Badge>
                    <span style={{ fontSize: 11, color: "#586064" }}>
                      {insight?.dominantStride
                        ? `Top STRIDE: ${insight.dominantStride.name}`
                        : "Top STRIDE: n/a"}
                      {" · "}
                      Max DREAD {(insight?.maxScore || 0).toFixed(1)}
                    </span>
                  </div>
                </div>
                <div style={{ marginTop: 8 }}>
                  <Badge variant={completionPercent(row.step) >= 70 ? "default" : "secondary"}>
                    {completionPercent(row.step)}% complete
                  </Badge>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <Button type="button" onClick={() => navigate(`/project/${row.id}`)} size="sm" style={{ background: "linear-gradient(135deg, #436086 0%, #375479 100%)" }}>
                    Continue
                  </Button>
                  <Button
                    type="button"
                    onClick={() => {
                      const newId = duplicateProject(row.id);
                      if (newId) navigate(`/project/${newId}`);
                    }}
                    size="sm"
                    variant="outline"
                  >
                    Duplicate
                  </Button>
                  <Button type="button" onClick={() => exportProjectDownload(row.id)} size="sm" variant="outline">
                    Export JSON
                  </Button>
                  <Button type="button" onClick={() => { if (window.confirm("Delete this project?")) { deleteProject(row.id); refresh(); } }} size="sm" variant="destructive">
                    Delete
                  </Button>
                </div>
                </CardContent>
              </Card>
            );})}
          </div>
        )}
      </main>
    </div>
  );
}

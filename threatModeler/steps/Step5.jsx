import { useState } from "react";
import { STRIDE, DREAD, C } from "../modelConstants.js";
import { SHdr, Fld, Sel, Tag } from "../modelPrimitives.jsx";
import { averageScore, risk } from "../modelHelpers.js";
export default function Step5({ threats, setThreats, modules }) {
  const [moduleFilter, setModuleFilter] = useState("all");
  const [severityFilter, setSeverityFilter] = useState("all");
  const [strideFilter, setStrideFilter] = useState("all");
  const applicable = threats.filter((threat) => threat.status === "applicable");
  const setScore = (id, dimension, value) => setThreats((current) => current.map((threat) => threat.id === id ? { ...threat, dreadScores: { ...threat.dreadScores, [dimension]: value } } : threat));
  const threatIdRank = (id = "") => {
    const match = String(id).match(/\d+/);
    return match ? Number(match[0]) : Number.MAX_SAFE_INTEGER;
  };

  const filteredApplicable = applicable.filter((threat) => {
    if (moduleFilter !== "all" && threat.moduleId !== moduleFilter) return false;
    if (severityFilter !== "all" && risk(averageScore(threat.dreadScores)).label.toLowerCase() !== severityFilter) return false;
    if (strideFilter !== "all" && threat.strideCategory !== strideFilter) return false;
    return true;
  }).sort((a, b) => {
    const byId = threatIdRank(a.id) - threatIdRank(b.id);
    if (byId !== 0) return byId;
    return String(a.id).localeCompare(String(b.id));
  });

  if (!applicable.length) {
    return (
      <>
        <SHdr n={5} title="DREAD Risk Scoring" sub="Score threats across the five DREAD dimensions once they have been marked as applicable." />
        <div style={{ ...C.card, textAlign: "center", color: "#737c7f", padding: 40 }}>No applicable threats yet. Go back to Step 4 and mark threats as Applicable.</div>
      </>
    );
  }

  return (
    <>
      <SHdr n={5} title="DREAD Risk Scoring" sub="Score each applicable threat from 1-10 per dimension and use filters to focus on the riskiest slices of the application." />

      <div style={C.card}>
        <div style={{ color: "#436086", fontFamily: "monospace", fontSize: 11, marginBottom: 12 }}>RISK DASHBOARD · {filteredApplicable.length} THREATS IN VIEW</div>
        <div style={C.g3}>
          <Fld label="STRIDE Filter">
            <Sel value={strideFilter} onChange={(event) => setStrideFilter(event.target.value)}>
              <option value="all">All STRIDE categories</option>
              {STRIDE.map((item) => <option key={item.id} value={item.id}>{item.id} · {item.name}</option>)}
            </Sel>
          </Fld>
          <Fld label="Module Filter">
            <Sel value={moduleFilter} onChange={(event) => setModuleFilter(event.target.value)}>
              <option value="all">All modules</option>
              {modules.filter((module) => module.name.trim()).map((module) => <option key={module.id} value={module.id}>{module.name}</option>)}
            </Sel>
          </Fld>
          <Fld label="Severity Filter">
            <Sel value={severityFilter} onChange={(event) => setSeverityFilter(event.target.value)}>
              <option value="all">All severities</option>
              {["critical", "high", "medium", "low"].map((severity) => <option key={severity} value={severity}>{severity[0].toUpperCase() + severity.slice(1)}</option>)}
            </Sel>
          </Fld>
        </div>

        {!filteredApplicable.length && <div style={{ color: "#737c7f", fontSize: 13 }}>No threats match the current filters.</div>}

        {filteredApplicable.map((threat) => {
          const score = +averageScore(threat.dreadScores).toFixed(1);
          const severity = risk(score);
          return (
            <div key={threat.id} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <span style={{ fontFamily: "monospace", fontSize: 11, color: "#737c7f", width: 36 }}>{threat.id}</span>
              <span style={{ flex: 1, fontSize: 12, color: "#2b3437", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{threat.title}</span>
              <div style={{ width: 100, height: 5, background: "#e3e9ec", borderRadius: 3, overflow: "hidden", flexShrink: 0 }}>
                <div style={{ width: `${score * 10}%`, height: "100%", background: severity.color, borderRadius: 3 }} />
              </div>
              <Tag label={severity.label} color={severity.color} bg={severity.bg} />
              <span style={{ fontFamily: "monospace", fontSize: 12, color: severity.color, width: 28, textAlign: "right" }}>{score}</span>
            </div>
          );
        })}
      </div>

      {filteredApplicable.map((threat) => {
        const score = +averageScore(threat.dreadScores).toFixed(1);
        const severity = risk(score);

        return (
          <div key={threat.id} style={{ ...C.card, borderLeft: `3px solid ${severity.color}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, gap: 12, flexWrap: "wrap" }}>
              <div>
                <span style={{ fontFamily: "monospace", fontSize: 11, color: "#737c7f", marginRight: 8 }}>{threat.id}</span>
                <span style={{ color: "#2b3437", fontSize: 13, fontWeight: 500 }}>{threat.title}</span>
                <span style={{ color: "#737c7f", fontSize: 11, marginLeft: 8 }}>to {threat.moduleName}</span>
              </div>
              <Tag label={`${severity.label} · ${score}`} color={severity.color} bg={severity.bg} />
            </div>

            {DREAD.map((dimension) => (
              <div key={dimension.id} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <span style={{ fontSize: 12, color: "#586064", width: 150, flexShrink: 0 }}>{dimension.label}</span>
                <input type="range" min={1} max={10} step={1} value={threat.dreadScores[dimension.id]} onChange={(event) => setScore(threat.id, dimension.id, Number(event.target.value))} style={{ flex: 1, accentColor: severity.color }} />
                <span style={{ fontFamily: "monospace", fontSize: 13, color: severity.color, width: 18, textAlign: "center" }}>{threat.dreadScores[dimension.id]}</span>
              </div>
            ))}
          </div>
        );
      })}
    </>
  );
}

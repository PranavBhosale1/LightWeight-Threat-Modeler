import { useState, Fragment } from "react";
import { parseGeminiJson } from "../../geminiJson.js";
import { getComponent } from "../../componentEngine.js";
import { C, STRIDE } from "../modelConstants.js";
import { SHdr, Fld, Sel, Inp, Err, AiBtn, Tag, Pill, Btn } from "../modelPrimitives.jsx";
import {
  averageScore,
  buildReportPayload,
  criticalityKey,
  gemini,
  profileContextForLlm,
  recommendedTestingFrequency,
  risk,
  slugify,
  strideMeta,
  threatProneness,
  downloadTextFile
} from "../modelHelpers.js";
import { ContextDFDCanvas, Level1DFDCanvas } from "../DfdSvgs.jsx";

function CanvasDfdSnapshot({ canvasModel }) {
  if (!canvasModel?.nodes?.length) return null;
  const nodes = canvasModel.nodes;
  const edges = canvasModel.edges || [];
  const minX = Math.min(...nodes.map((n) => n.x - n.w / 2)) - 60;
  const minY = Math.min(...nodes.map((n) => n.y - n.h / 2)) - 60;
  const maxX = Math.max(...nodes.map((n) => n.x + n.w / 2)) + 60;
  const maxY = Math.max(...nodes.map((n) => n.y + n.h / 2)) + 70;
  const W = maxX - minX;
  const H = maxY - minY;
  const pathFor = (a, b) => {
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2 - 40;
    return `M${a.x},${a.y} Q${mx},${my} ${b.x},${b.y}`;
  };

  return (
    <svg viewBox={`${minX} ${minY} ${W} ${H}`} style={{ width: "100%", background: "#f8f9fa", borderRadius: 8, border: "1px solid #737c7f" }}>
      <defs>
        <marker id="tm-canvas-arr" markerWidth={8} markerHeight={8} refX={7} refY={3} orient="auto">
          <path d="M0,0 L0,6 L7,3 z" fill="#737c7f" />
        </marker>
      </defs>
      {edges.map((edge) => {
        const from = nodes.find((n) => n.id === edge.from);
        const to = nodes.find((n) => n.id === edge.to);
        if (!from || !to) return null;
        const lx = (from.x + to.x) / 2;
        const ly = (from.y + to.y) / 2 - 52;
        const label = String(edge.label || "").trim();
        const display = label.length > 26 ? `${label.slice(0, 23)}...` : label;
        const labelW = Math.max(34, display.length * 6.4 + 10);
        return (
          <g key={edge.id}>
            <path d={pathFor(from, to)} fill="none" stroke="#737c7f" strokeWidth={1.4} strokeDasharray="6,4" markerEnd="url(#tm-canvas-arr)" />
            {display && (
              <>
                <rect x={lx - labelW / 2} y={ly - 10} width={labelW} height={14} rx={3} fill="rgba(241,244,246,0.95)" stroke="rgba(88,96,100,0.35)" />
                <text x={lx} y={ly} textAnchor="middle" fill="#2b3437" fontSize={10} fontFamily="monospace">{display}</text>
              </>
            )}
          </g>
        );
      })}
      {nodes.filter((n) => n.type === "boundary").map((node) => (
        <g key={node.id} transform={`translate(${node.x},${node.y})`}>
          <rect x={-node.w / 2} y={-node.h / 2} width={node.w} height={node.h} rx={10} fill="rgba(255,159,10,0.03)" stroke={node.color || "#ff9f0a"} strokeWidth={1.2} strokeDasharray="8,4" />
          <text x={-node.w / 2 + 10} y={-node.h / 2 + 16} fill={node.color || "#ff9f0a"} fontSize={10} fontFamily="monospace">{node.label}</text>
        </g>
      ))}
      {nodes.filter((n) => n.type !== "boundary").map((node) => (
        <g key={node.id} transform={`translate(${node.x},${node.y})`}>
          {node.type === "entity" && <rect x={-node.w / 2} y={-node.h / 2} width={node.w} height={node.h} rx={5} fill={`${node.color}14`} stroke={node.color} strokeWidth={1.4} />}
          {node.type === "process" && <ellipse rx={node.w / 2} ry={node.h / 2} fill={`${node.color}14`} stroke={node.color} strokeWidth={1.4} />}
          {node.type === "store" && (
            <>
              <rect x={-node.w / 2} y={-node.h / 2} width={node.w} height={node.h} fill={`${node.color}12`} stroke="none" />
              <line x1={-node.w / 2} y1={-node.h / 2} x2={node.w / 2} y2={-node.h / 2} stroke={node.color} strokeWidth={1.8} />
              <line x1={-node.w / 2} y1={node.h / 2} x2={node.w / 2} y2={node.h / 2} stroke={node.color} strokeWidth={1.8} />
            </>
          )}
          <text textAnchor="middle" fill="#2b3437" fontSize={11} fontFamily="monospace">{node.label}</text>
        </g>
      ))}
    </svg>
  );
}

export default function Step6({ profile, modules, setModules, threats, apiKey, mitigations, setMitigations, trustBoundaries, dfd, canvasModel }) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [strideFilter, setStrideFilter] = useState("all");
  const [expandedSource, setExpandedSource] = useState(null);
  const applicable = [...threats.filter((threat) => threat.status === "applicable")].sort((a, b) => averageScore(b.dreadScores) - averageScore(a.dreadScores));

  const updateRequirement = (moduleId, instanceId, patch) => {
    setModules((current) => current.map((m) => {
      if (m.id !== moduleId) return m;
      return {
        ...m,
        securityRequirements: (m.securityRequirements || []).map((r) => r.instanceId === instanceId ? { ...r, ...patch } : r)
      };
    }));
  };

  const bySource = modules
    .filter((m) => m.name.trim())
    .map((m) => {
      const moduleThreats = threats.filter((t) => t.moduleId === m.id);
      const filtered = strideFilter === "all" ? moduleThreats : moduleThreats.filter((t) => t.strideCategory === strideFilter);
      return {
        module: m,
        threats: moduleThreats,
        filteredThreats: filtered,
        component: getComponent(m.componentType)
      };
    });
  const criticalCount = applicable.filter((threat) => averageScore(threat.dreadScores) > 8).length;
  const highCount = applicable.filter((threat) => {
    const score = averageScore(threat.dreadScores);
    return score >= 6 && score <= 8;
  }).length;
  const proneness = threatProneness(applicable);
  const businessCriticality = criticalityKey(profile.criticality);
  const testingFrequency = recommendedTestingFrequency(businessCriticality, proneness.key, criticalCount);

  const generate = async () => {
    setLoading(true);
    setErr(null);

    try {
      const payload = applicable.map((threat) => ({
        id: threat.id,
        title: threat.title,
        category: threat.strideName,
        description: threat.description,
        score: +averageScore(threat.dreadScores).toFixed(1)
      }));

      const zipAndNotes = profileContextForLlm(profile, 12_000);

      const text = await gemini(apiKey, `You are a security engineer. Provide specific actionable remediation for these threats.

Application: ${profile.name}, Stack: ${profile.techStack}
${zipAndNotes ? `Context:\n${zipAndNotes}\n` : ""}
Threats: ${JSON.stringify(payload)}

Return ONLY valid JSON (no markdown):
{"T001":{"shortFix":"one-liner","recommendations":["step1","step2","step3"],"effort":"Low|Medium|High","securityControl":"OWASP/security control reference"}}`);

      setMitigations(parseGeminiJson(text));
    } catch (error) {
      setErr(error.message);
    } finally {
      setLoading(false);
    }
  };

  const exportJson = () => {
    const payload = buildReportPayload({ profile, modules, trustBoundaries, threats, mitigations, dfd, canvasModel });
    downloadTextFile(`${slugify(profile.name || "threat-model")}-report.json`, JSON.stringify(payload, null, 2), "application/json;charset=utf-8");
  };

  const matrixRows = ["high", "medium", "low"];
  const matrixCols = ["low", "medium", "high"];
  const matrixLabel = { low: "Low", medium: "Medium", high: "High" };
  const threatStatusLabel = (status) => (status === "applicable" ? "Applicable" : status === "not-applicable" ? "Not Applicable" : "Under Review");

  return (
    <>
      <SHdr n={6} title="Threat Modeling Report" sub="Review the final report, export machine-readable data, and use the prioritization matrix to recommend testing frequency." />

      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <AiBtn onClick={generate} loading={loading} label="Generate Remediation Recommendations" />
        <Btn onClick={exportJson}>Export JSON</Btn>
        <Btn onClick={() => window.print()}>Print / Save PDF</Btn>
      </div>
      <Err msg={err} />

      <div style={{ ...C.card, borderColor: "#436086" }}>
        <div style={{ color: "#436086", fontFamily: "monospace", fontSize: 11, marginBottom: 12, letterSpacing: 2 }}>EXECUTIVE SUMMARY</div>
        <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
          <Pill label="Threats" value={applicable.length} color="#436086" />
          <Pill label="Critical" value={criticalCount} color="#ff2d55" />
          <Pill label="High" value={highCount} color="#ff9f0a" />
          <Pill label="Modules" value={modules.filter((module) => module.name).length} color="#30d158" />
        </div>
        <p style={{ color: "#586064", fontSize: 13, lineHeight: 1.7, margin: 0 }}>
          Threat modeling was performed on <strong style={{ color: "#2b3437" }}>{profile.name || "this application"}</strong> ({profile.type}) deployed on {profile.deployEnv} using <strong style={{ color: "#2b3437" }}>{profile.techStack || "an unspecified stack"}</strong>. The STRIDE methodology identified <strong style={{ color: "#2b3437" }}>{applicable.length} applicable threats</strong> across {modules.filter((module) => module.name).length} modules.
          {criticalCount > 0 && <> <strong style={{ color: "#ff2d55" }}>{criticalCount} Critical</strong> and <strong style={{ color: "#ff9f0a" }}>{highCount} High</strong> severity threats should be prioritized first.</>}
          {profile.compliance && <> Compliance scope: {profile.compliance}.</>}
        </p>
      </div>

      <div style={C.card}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, gap: 12, flexWrap: "wrap" }}>
          <div style={{ color: "#ec4899", fontFamily: "monospace", fontSize: 11, letterSpacing: 2 }}>THREATS BY SOURCE</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {["all", ...STRIDE.map((s) => s.id)].map((cat) => {
              const stride = STRIDE.find((s) => s.id === cat);
              const color = stride?.color || "#ec4899";
              const active = strideFilter === cat;
              return (
                <button key={cat} onClick={() => setStrideFilter(cat)} style={{ padding: "3px 9px", borderRadius: 4, fontSize: 11, fontFamily: "monospace", cursor: "pointer", background: active ? color : "transparent", border: `1px solid ${color}`, color: active ? "#000" : "#586064" }}>
                  {cat === "all" ? "All" : cat}
                </button>
              );
            })}
          </div>
        </div>
        <p style={{ color: "#586064", fontSize: 12, marginBottom: 12 }}>Threats grouped by the module / component that owns them. Click a row to expand.</p>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid rgba(171, 179, 183, 0.22)" }}>
                {["Source", "Component Type", "Threats", "Applicable", "Severity Mix"].map((heading) => (
                  <th key={heading} style={{ padding: "8px 8px", textAlign: "left", color: "#586064", fontFamily: "monospace", fontWeight: 400 }}>{heading}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bySource.map(({ module, threats: ts, filteredThreats, component }) => {
                const isOpen = expandedSource === module.id;
                const sevMix = ["Critical", "High", "Medium", "Low"].map((label) => {
                  const c = ts.filter((t) => risk(averageScore(t.dreadScores)).label === label).length;
                  if (!c) return null;
                  const meta = risk(label === "Critical" ? 9 : label === "High" ? 7 : label === "Medium" ? 5 : 3);
                  return <Tag key={label} label={`${label[0]}·${c}`} color={meta.color} bg={meta.bg} />;
                }).filter(Boolean);

                return (
                  <Fragment key={module.id}>
                    <tr style={{ borderBottom: "1px solid #0e1728", cursor: "pointer" }} onClick={() => setExpandedSource(isOpen ? null : module.id)}>
                      <td style={{ padding: "10px 8px", color: "#2b3437", fontWeight: 500 }}>{isOpen ? "▾" : "▸"} {module.name}</td>
                      <td style={{ padding: "10px 8px", color: component ? component.color : "#586064", fontFamily: "monospace", fontSize: 11 }}>
                        {component ? `${component.category} · ${component.label}` : "Unclassified"}
                      </td>
                      <td style={{ padding: "10px 8px", color: "#2b3437", fontFamily: "monospace" }}>{filteredThreats.length}{strideFilter !== "all" && ` / ${ts.length}`}</td>
                      <td style={{ padding: "10px 8px", color: "#30d158", fontFamily: "monospace" }}>{ts.filter((t) => t.status === "applicable").length}</td>
                      <td style={{ padding: "10px 8px" }}>
                        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>{sevMix.length ? sevMix : <span style={{ color: "#737c7f", fontSize: 11 }}>—</span>}</div>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr>
                        <td colSpan={5} style={{ padding: 0, background: "#f1f4f6" }}>
                          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                            <tbody>
                              {filteredThreats.length === 0 && (
                                <tr><td style={{ padding: "10px 16px", color: "#586064", fontSize: 12 }}>No threats for current filter.</td></tr>
                              )}
                              {filteredThreats.map((t) => {
                                const stride = strideMeta(t.strideCategory);
                                const score = +averageScore(t.dreadScores).toFixed(1);
                                const sev = risk(score);
                                return (
                                  <tr key={t.id} style={{ borderBottom: "1px solid #0e1728" }}>
                                    <td style={{ padding: "8px 16px", width: 60, color: "#737c7f", fontFamily: "monospace", fontSize: 11 }}>{t.id}</td>
                                    <td style={{ padding: "8px 8px", width: 40 }}><Tag label={stride.id} color={stride.color} /></td>
                                    <td style={{ padding: "8px 8px", color: "#2b3437" }}>{t.title}</td>
                                    <td style={{ padding: "8px 8px", width: 90 }}><Tag label={`${sev.label} ${score}`} color={sev.color} bg={sev.bg} /></td>
                                    <td style={{ padding: "8px 16px", width: 90, color: t.status === "applicable" ? "#30d158" : t.status === "not-applicable" ? "#586064" : "#ff9f0a", fontFamily: "monospace", fontSize: 11 }}>{threatStatusLabel(t.status)}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
              {bySource.length === 0 && (
                <tr><td colSpan={5} style={{ padding: 12, color: "#586064", fontSize: 12, textAlign: "center" }}>No modules defined yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div style={C.card}>
        <div style={{ color: "#a78bfa", fontFamily: "monospace", fontSize: 11, marginBottom: 10, letterSpacing: 2 }}>SECURITY REQUIREMENTS</div>
        <p style={{ color: "#586064", fontSize: 12, marginBottom: 12 }}>Component-library security controls grouped by source. Track status and link Jira tickets.</p>
        {bySource.filter(({ module }) => (module.securityRequirements || []).length).length === 0 && (
          <div style={{ color: "#586064", fontSize: 12, padding: "10px 0" }}>No security requirements yet — assign Component Types in Step 2 to attach the library's controls.</div>
        )}
        {bySource.map(({ module, component }) => {
          const reqs = module.securityRequirements || [];
          if (!reqs.length) return null;
          const counts = reqs.reduce((acc, r) => ({ ...acc, [r.status]: (acc[r.status] || 0) + 1 }), {});
          return (
            <div key={module.id} style={{ borderBottom: "1px solid #e3e9ec", marginBottom: 12, paddingBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, gap: 8, flexWrap: "wrap" }}>
                <div>
                  <span style={{ color: "#2b3437", fontSize: 13, fontWeight: 600 }}>{module.name}</span>
                  {component && <span style={{ marginLeft: 8 }}><Tag label={component.label} color={component.color} /></span>}
                </div>
                <div style={{ display: "flex", gap: 4 }}>
                  <Tag label={`Open ${counts.open || 0}`} color="#ff9f0a" />
                  <Tag label={`Partial ${counts.partial || 0}`} color="#ffd60a" />
                  <Tag label={`Closed ${counts.closed || 0}`} color="#30d158" />
                </div>
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid rgba(171, 179, 183, 0.22)" }}>
                      {["Security Requirement", "Source", "Status", "Issue"].map((h) => (
                        <th key={h} style={{ padding: "8px 8px", textAlign: "left", color: "#586064", fontFamily: "monospace", fontWeight: 400 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {reqs.map((r) => {
                      const statusColor = r.status === "closed" ? "#30d158" : r.status === "partial" ? "#ffd60a" : "#ff9f0a";
                      return (
                        <tr key={r.instanceId} style={{ borderBottom: "1px solid #0e1728" }}>
                          <td style={{ padding: "8px 8px" }}>
                            <div style={{ color: "#2b3437" }}>{r.title}</div>
                            <div style={{ color: "#586064", fontSize: 11, marginTop: 2 }}>{r.description}</div>
                            {r.controlFamily && <div style={{ color: "#737c7f", fontSize: 10, fontFamily: "monospace", marginTop: 2 }}>{r.controlFamily}</div>}
                          </td>
                          <td style={{ padding: "8px 8px", color: "#586064", fontSize: 11, whiteSpace: "nowrap" }}>{module.name}</td>
                          <td style={{ padding: "8px 8px", width: 140 }}>
                            <Sel value={r.status} onChange={(event) => updateRequirement(module.id, r.instanceId, { status: event.target.value })} style={{ padding: "5px 8px", fontSize: 11, color: statusColor, borderColor: statusColor }}>
                              <option value="open">Open</option>
                              <option value="partial">Partially Mitigated</option>
                              <option value="closed">Closed</option>
                            </Sel>
                          </td>
                          <td style={{ padding: "8px 8px", width: 130 }}>
                            <Inp value={r.jiraKey || ""} onChange={(event) => updateRequirement(module.id, r.instanceId, { jiraKey: event.target.value })} placeholder="TJ-1234" style={{ padding: "5px 8px", fontSize: 11 }} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </div>

      <div style={C.card}>
        <div style={{ color: "#2b3437", fontFamily: "monospace", fontSize: 11, marginBottom: 12, letterSpacing: 2 }}>APPLICATION OVERVIEW</div>
        <div style={C.g2}>
          {[["Name", profile.name || "—"], ["Type", profile.type], ["Deployment", profile.deployEnv], ["Status", profile.appStatus], ["Tech Stack", profile.techStack || "—"], ["Compliance", profile.compliance || "—"]].map(([key, value]) => (
            <div key={key} style={{ marginBottom: 8 }}>
              <div style={{ color: "#586064", fontSize: 11, fontFamily: "monospace" }}>{key}</div>
              <div style={{ color: "#2b3437", fontSize: 13 }}>{value}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={C.card}>
        <div style={{ color: "#ff9f0a", fontFamily: "monospace", fontSize: 11, marginBottom: 12, letterSpacing: 2 }}>APPLICATION PRIORITIZATION MATRIX</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
          <Tag label={`Business Criticality: ${matrixLabel[businessCriticality]}`} color={businessCriticality === "high" ? "#ff2d55" : businessCriticality === "medium" ? "#ff9f0a" : "#30d158"} />
          <Tag label={`Threat Proneness: ${proneness.label}`} color={proneness.color} />
          <Tag label={`Recommended Testing: ${testingFrequency}`} color="#436086" />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "140px repeat(3, 1fr)", gap: 6 }}>
          <div />
          {matrixCols.map((column) => <div key={column} style={{ color: "#586064", fontSize: 11, fontFamily: "monospace", textAlign: "center" }}>BUSINESS {matrixLabel[column].toUpperCase()}</div>)}
          {matrixRows.map((row) => (
            <div key={row} style={{ display: "contents" }}>
              <div key={`${row}-label`} style={{ color: "#586064", fontSize: 11, fontFamily: "monospace", display: "flex", alignItems: "center" }}>THREAT {matrixLabel[row].toUpperCase()}</div>
              {matrixCols.map((column) => {
                const active = row === proneness.key && column === businessCriticality;
                const cellFrequency = recommendedTestingFrequency(column, row, criticalCount);
                return (
                  <div key={`${row}-${column}`} style={{ border: `1px solid ${active ? "#436086" : "rgba(171, 179, 183, 0.22)"}`, background: active ? "rgba(0,180,216,.12)" : "rgba(255,255,255,.02)", borderRadius: 8, padding: 14, minHeight: 74 }}>
                    <div style={{ color: active ? "#436086" : "#586064", fontSize: 12, fontWeight: 600 }}>{cellFrequency}</div>
                    <div style={{ color: "#586064", fontSize: 11, marginTop: 6 }}>{active ? "Current application placement" : "Reference cadence"}</div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <div style={C.card}>
        <div style={{ color: "#30d158", fontFamily: "monospace", fontSize: 11, marginBottom: 12, letterSpacing: 2 }}>DFD SNAPSHOT</div>
        {canvasModel?.nodes?.length ? (
          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 12 }}>
            <div style={{ color: "#586064", fontSize: 12, fontFamily: "monospace" }}>
              Using interactive canvas diagram ({canvasModel.nodes.length} nodes, {canvasModel.edges?.length || 0} flows)
            </div>
            <CanvasDfdSnapshot canvasModel={canvasModel} />
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 12 }}>
            <ContextDFDCanvas profile={profile} modules={modules} svgId="tm-report-context" />
            <Level1DFDCanvas modules={modules} trustBoundaries={trustBoundaries} svgId="tm-report-level1" />
          </div>
        )}
      </div>

      <div style={C.card}>
        <div style={{ color: "#2b3437", fontFamily: "monospace", fontSize: 11, marginBottom: 14, letterSpacing: 2 }}>THREAT REGISTER ({applicable.length})</div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid rgba(171, 179, 183, 0.22)" }}>
                {["ID", "Module", "Category", "Threat Title", "D", "R", "E", "A", "Di", "Score", "Severity"].map((heading) => (
                  <th key={heading} style={{ padding: "8px 8px", textAlign: "left", color: "#586064", fontFamily: "monospace", fontWeight: 400, whiteSpace: "nowrap" }}>{heading}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {applicable.map((threat, index) => {
                const score = +averageScore(threat.dreadScores).toFixed(1);
                const severity = risk(score);
                const stride = strideMeta(threat.strideCategory);

                return (
                  <tr key={threat.id} style={{ borderBottom: "1px solid #0e1728", background: index % 2 ? "rgba(255,255,255,.01)" : "transparent" }}>
                    <td style={{ padding: "8px 8px", color: "#737c7f", fontFamily: "monospace", whiteSpace: "nowrap" }}>{threat.id}</td>
                    <td style={{ padding: "8px 8px", color: "#586064", maxWidth: 100, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{threat.moduleName}</td>
                    <td style={{ padding: "8px 8px" }}><Tag label={threat.strideCategory} color={stride.color} /></td>
                    <td style={{ padding: "8px 8px", color: "#2b3437" }}>{threat.title}</td>
                    {["damage", "reproducibility", "exploitability", "affectedUsers", "discoverability"].map((dimension) => (
                      <td key={dimension} style={{ padding: "8px 8px", fontFamily: "monospace", color: "#586064", textAlign: "center" }}>{threat.dreadScores[dimension]}</td>
                    ))}
                    <td style={{ padding: "8px 8px", fontFamily: "monospace", color: severity.color, fontWeight: 700 }}>{score}</td>
                    <td style={{ padding: "8px 8px" }}><Tag label={severity.label} color={severity.color} bg={severity.bg} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {Object.keys(mitigations).length > 0 && <div style={C.card}>
        <div style={{ color: "#30d158", fontFamily: "monospace", fontSize: 11, marginBottom: 14, letterSpacing: 2 }}>REMEDIATION RECOMMENDATIONS</div>
        {applicable.map((threat) => {
          const mitigation = mitigations[threat.id];
          if (!mitigation) return null;

          const score = +averageScore(threat.dreadScores).toFixed(1);
          const severity = risk(score);
          const effortColor = { Low: "#30d158", Medium: "#ff9f0a", High: "#ff2d55" }[mitigation.effort] || "#586064";

          return (
            <div key={threat.id} style={{ borderBottom: "1px solid #e3e9ec", paddingBottom: 16, marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, flexWrap: "wrap", gap: 6 }}>
                <div>
                  <span style={{ fontFamily: "monospace", fontSize: 11, color: "#737c7f", marginRight: 8 }}>{threat.id}</span>
                  <span style={{ color: "#2b3437", fontSize: 13, fontWeight: 500 }}>{threat.title}</span>
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <Tag label={`Effort: ${mitigation.effort}`} color={effortColor} />
                  <Tag label={severity.label} color={severity.color} bg={severity.bg} />
                </div>
              </div>
              <div style={{ color: "#30d158", fontSize: 13, marginBottom: 8 }}>- {mitigation.shortFix}</div>
              {mitigation.recommendations?.map((recommendation, index) => <div key={index} style={{ color: "#586064", fontSize: 12, padding: "3px 0", paddingLeft: 14 }}>{index + 1}. {recommendation}</div>)}
              {mitigation.securityControl && <div style={{ color: "#737c7f", fontSize: 11, marginTop: 8 }}>Control: <span style={{ color: "#586064" }}>{mitigation.securityControl}</span></div>}
            </div>
          );
        })}
      </div>}

      <div style={C.card}>
        <div style={{ color: "#2b3437", fontFamily: "monospace", fontSize: 11, marginBottom: 12, letterSpacing: 2 }}>STRIDE CATEGORY BREAKDOWN</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          {STRIDE.map((item) => {
            const count = applicable.filter((threat) => threat.strideCategory === item.id).length;
            return (
              <div key={item.id} style={{ background: `${item.color}10`, border: `1px solid ${item.color}30`, borderRadius: 6, padding: "10px 16px", textAlign: "center", minWidth: 110 }}>
                <div style={{ color: item.color, fontSize: 22, fontFamily: "monospace", fontWeight: 700 }}>{count}</div>
                <div style={{ color: item.color, fontSize: 11, fontFamily: "monospace" }}>{item.id}</div>
                <div style={{ color: "#586064", fontSize: 11 }}>{item.name}</div>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ textAlign: "center", color: "#737c7f", fontSize: 11, fontFamily: "monospace", marginTop: 16 }}>
        Generated by ThreatModeler v1.1 · {new Date().toLocaleDateString()}
      </div>
    </>
  );
}

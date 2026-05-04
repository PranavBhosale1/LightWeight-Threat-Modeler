import { useState } from "react";
import { parseGeminiJson } from "../../geminiJson.js";
import { C } from "../modelConstants.js";
import { SHdr, Fld, Inp, Txt, Err, AiBtn, Tag, Btn } from "../modelPrimitives.jsx";
import {
  buildDfdElements,
  createTrustBoundary,
  gemini,
  moduleHierarchyName,
  parseCsv,
  profileContextForLlm,
  slugify,
  downloadSvg
} from "../modelHelpers.js";
import { ContextDFDCanvas, Level1DFDCanvas } from "../DfdSvgs.jsx";
export default function Step3({ profile, modules, apiKey, dfd, setDfd, trustBoundaries, setTrustBoundaries, dfdMode, setDfdMode, onOpenCanvas, canvasModel }) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const { validModules, flows } = buildDfdElements(modules, trustBoundaries);
  const crossBoundaryFlows = flows.filter((flow) => flow.crossesBoundary);
  const modulesWithoutFlows = validModules.filter((module) => parseCsv(module.externalEntities).length === 0 && parseCsv(module.dataStores).length === 0);
  const level1Ready = validModules.length > 0;
  const hasLevel2Candidates = modules.some((module) => module.parentId);

  const addBoundary = () => setTrustBoundaries((current) => [...current, createTrustBoundary(`tb-${Date.now()}`)]);
  const removeBoundary = (id) => setTrustBoundaries((current) => current.filter((boundary) => boundary.id !== id));
  const updateBoundary = (id, key, value) => setTrustBoundaries((current) => current.map((boundary) => boundary.id === id ? { ...boundary, [key]: value } : boundary));
  const toggleModule = (boundaryId, moduleId) => setTrustBoundaries((current) => current.map((boundary) => {
    if (boundary.id !== boundaryId) return boundary;
    const exists = (boundary.moduleIds || []).includes(moduleId);
    return { ...boundary, moduleIds: exists ? boundary.moduleIds.filter((id) => id !== moduleId) : [...boundary.moduleIds, moduleId] };
  }));

  const analyze = async () => {
    setLoading(true);
    setErr(null);

    try {
      const moduleSummary = validModules.map((module) => `Module: ${moduleHierarchyName(module, modules)}\n  Inputs: ${module.inputs}\n  Outputs: ${module.outputs}\n  Data Stores: ${module.dataStores}\n  External Entities: ${module.externalEntities}`).join("\n\n");
      const boundarySummary = trustBoundaries.filter((boundary) => boundary.name.trim()).map((boundary) => {
        const names = validModules.filter((module) => boundary.moduleIds.includes(module.id)).map((module) => module.name);
        return `Boundary: ${boundary.name}\n  Includes: ${names.join(", ") || "none"}\n  Notes: ${boundary.description || "none"}`;
      }).join("\n\n");
      const crossBoundarySummary = crossBoundaryFlows.map((flow) => `${flow.from} -> ${flow.to} (${flow.boundaryNames.join(", ") || "manual"})`).join("\n");
      const zipAndNotes = profileContextForLlm(profile, 80_000);

      const text = await gemini(apiKey, `You are a security architect. Analyze this application and return ONLY valid JSON (no markdown).

Application: ${profile.name || "Unnamed Application"} (${profile.type})
Stack: ${profile.techStack}
Description: ${profile.description}

DFD modeling baseline to follow:
- Level 0 (context): one system process interacting with external entities.
- Level 1 (decomposition): modules as processes, with connected data stores and flows.
- Trust boundaries indicate cross-zone risk.
- Do not invent extra levels unless clearly implied by module hierarchy/context.

${zipAndNotes ? `Additional context for analysis:\n${zipAndNotes}` : ""}

Modules:
${moduleSummary}

Manual Trust Boundaries:
${boundarySummary || "None defined"}

Flows crossing manual trust boundaries:
${crossBoundarySummary || "None"}

Return:
{
  "trustBoundaries": [{"name":"string","includes":["module names"],"description":"why this boundary matters"}],
  "highRiskFlows": [{"from":"string","to":"string","risk":"string","strideCategories":["S","T"]}],
  "securityNotes": ["note1","note2","note3"],
  "summary": "2-3 sentence security posture summary"
}`);

      setDfd(parseGeminiJson(text));
    } catch (error) {
      setErr(error.message);
    } finally {
      setLoading(false);
    }
  };

  const modeBtn = (active, onClick, label, sub) => (
    <Btn
      type="button"
      onClick={onClick}
      variant="outline"
      style={{
        flex: "1 1 220px",
        textAlign: "left",
        padding: "12px 14px",
        background: active ? "rgba(0,180,216,.12)" : "transparent",
        border: `1px solid ${active ? "#436086" : "#abb3b7"}`,
        color: active ? "#2b3437" : "#586064"
      }}
    >
      <div style={{ fontWeight: 600, fontSize: 13, marginBottom: sub ? 4 : 0 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: "#586064", fontWeight: 400, lineHeight: 1.4 }}>{sub}</div>}
    </Btn>
  );

  return (
    <>
      <SHdr n={3} title="Data Flow Diagram" sub="Pick auto-generated diagrams from your modules, or draw flows on the interactive canvas. Add trust boundaries, then run Gemini analysis before STRIDE." />

      <div style={C.card}>
        <div style={{ color: "#436086", fontFamily: "monospace", fontSize: 11, marginBottom: 10 }}>HOW SHOULD WE MODEL DATA FLOWS?</div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: dfdMode === "canvas" ? 12 : 0 }}>
          {modeBtn(dfdMode === "auto", () => setDfdMode("auto"), "Auto diagrams", "Level-0 / Level-1 SVGs from modules (step 2). Best after generating modules from your ZIP/context.")}
          {modeBtn(dfdMode === "canvas", () => setDfdMode("canvas"), "Interactive canvas", "Place processes, stores, boundaries yourself. STRIDE + DREAD still use your module list for the questionnaire.")}
        </div>
        {dfdMode === "canvas" && (
          <div style={{ padding: 14, background: "rgba(0,180,216,.06)", border: "1px solid rgba(0,180,216,.25)", borderRadius: 8 }}>
            <p style={{ color: "#586064", fontSize: 13, lineHeight: 1.6, marginBottom: 12 }}>
              Open the canvas to sketch entities, processes, data stores, and trust boundaries. Use <strong style={{ color: "#2b3437" }}>Analyze</strong> there for component-level STRIDE threats. Saved canvas trust boundaries are imported back into this wizard and used in STRIDE questionnaire mapping.
            </p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <Btn type="button" onClick={() => onOpenCanvas("continue")} variant="default" style={{ background: "linear-gradient(135deg, #436086 0%, #375479 100%)" }}>
                {canvasModel?.nodes?.length ? "Edit saved canvas" : "Open interactive canvas"}
              </Btn>
              <Btn type="button" onClick={() => onOpenCanvas("import-auto")} variant="outline">Import auto DFD as base</Btn>
              <Btn type="button" onClick={() => onOpenCanvas("blank")} variant="outline">Start blank canvas</Btn>
            </div>
            <div style={{ color: "#586064", fontSize: 11, marginTop: 8, fontFamily: "monospace" }}>
              {canvasModel?.nodes?.length
                ? `Saved canvas: ${canvasModel.nodes.length} nodes · ${canvasModel.edges?.length || 0} flows`
                : "No saved canvas yet."}
            </div>
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        {dfdMode === "auto" && (
          <>
            <Btn type="button" onClick={() => downloadSvg("tm-context-dfd", `${slugify(profile.name || "application")}-context-dfd.svg`)}>Download Level-0 SVG</Btn>
            <Btn type="button" onClick={() => downloadSvg("tm-level1-dfd", `${slugify(profile.name || "application")}-level1-dfd.svg`)}>Download Level-1 SVG</Btn>
          </>
        )}
        <AiBtn onClick={analyze} loading={loading} label="Analyze trust boundaries (Gemini)" />
      </div>
      <Err msg={err} />

      {dfdMode === "auto" && (
        <>
          <div style={{ ...C.card, paddingBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", marginBottom: 10, flexWrap: "wrap" }}>
              <div style={{ color: "#436086", fontFamily: "monospace", fontSize: 11 }}>LEVEL-0 CONTEXT DFD</div>
              <div style={{ color: "#586064", fontSize: 11, fontFamily: "monospace" }}>Hover any component or connection for full label</div>
            </div>
            <ContextDFDCanvas profile={profile} modules={modules} svgId="tm-context-dfd" />
          </div>

          <div style={{ ...C.card, paddingBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", marginBottom: 10, flexWrap: "wrap" }}>
              <div style={{ color: "#30d158", fontFamily: "monospace", fontSize: 11 }}>LEVEL-1 MODULE DFD</div>
              <div style={{ color: "#586064", fontSize: 11, fontFamily: "monospace" }}>Hover any component or connection for full label</div>
            </div>
            <Level1DFDCanvas modules={modules} trustBoundaries={trustBoundaries} svgId="tm-level1-dfd" />
          </div>
        </>
      )}

      <div style={C.card}>
        <div style={{ color: "#a78bfa", fontFamily: "monospace", fontSize: 11, marginBottom: 10 }}>DFD LEVEL CONFORMANCE CHECK</div>
        <div style={{ display: "grid", gap: 8 }}>
          <div style={{ padding: "9px 11px", border: "1px solid rgba(67, 96, 134, 0.22)", borderRadius: 6, background: "rgba(67, 96, 134, 0.06)" }}>
            <div style={{ color: "#436086", fontSize: 12, fontWeight: 600 }}>Level 0 (Context) - enforced in auto diagram</div>
            <div style={{ color: "#586064", fontSize: 12, marginTop: 4 }}>Rendered as one system process with external entities only.</div>
          </div>
          <div style={{ padding: "9px 11px", border: `1px solid ${level1Ready ? "rgba(48,209,88,.3)" : "rgba(239,68,68,.35)"}`, borderRadius: 6, background: level1Ready ? "rgba(48,209,88,.07)" : "rgba(239,68,68,.06)" }}>
            <div style={{ color: level1Ready ? "#30d158" : "#ef4444", fontSize: 12, fontWeight: 600 }}>Level 1 (Process decomposition) - {level1Ready ? "ready" : "missing modules"}</div>
            <div style={{ color: "#586064", fontSize: 12, marginTop: 4 }}>
              {level1Ready ? `${validModules.length} module process${validModules.length === 1 ? "" : "es"} and ${flows.length} derived data flow${flows.length === 1 ? "" : "s"}.` : "Add at least one module in Step 2 to decompose the context process."}
            </div>
            {modulesWithoutFlows.length > 0 && (
              <div style={{ color: "#ef4444", fontSize: 11, marginTop: 6 }}>
                Modules without external-entity/store flow anchors: {modulesWithoutFlows.map((module) => module.name).join(", ")}
              </div>
            )}
          </div>
          <div style={{ padding: "9px 11px", border: "1px solid rgba(171, 179, 183, 0.22)", borderRadius: 6, background: "rgba(171, 179, 183, 0.08)" }}>
            <div style={{ color: "#2b3437", fontSize: 12, fontWeight: 600 }}>Level 2 / Level 3 (Detailed decomposition)</div>
            <div style={{ color: "#586064", fontSize: 12, marginTop: 4 }}>
              Create only for complex modules. Use parent-child modules and/or the interactive canvas for deep drill-down diagrams.
              {hasLevel2Candidates ? " Parent-child module links already exist in this model." : " No parent-child module decomposition detected yet."}
            </div>
          </div>
        </div>
      </div>

      <div style={C.card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ color: "#ff9f0a", fontFamily: "monospace", fontSize: 11 }}>MANUAL TRUST BOUNDARY ANNOTATIONS</div>
            <div style={{ color: "#586064", fontSize: 12, marginTop: 4 }}>Assign modules to one or more trust zones so cross-boundary flows are flagged before STRIDE review.</div>
          </div>
          <Btn onClick={addBoundary}>+ Add Boundary</Btn>
        </div>

        {!trustBoundaries.length && <div style={{ color: "#737c7f", fontSize: 13, padding: "8px 0" }}>No manual trust boundaries yet. Add one if the DFD crosses internal/external or sensitive trust zones.</div>}

        {trustBoundaries.map((boundary) => (
          <div key={boundary.id} style={{ border: "1px solid rgba(171, 179, 183, 0.22)", borderRadius: 8, padding: 14, marginBottom: 12 }}>
            <div style={C.g2}>
              <Fld label="Boundary Name"><Inp value={boundary.name} onChange={(event) => updateBoundary(boundary.id, "name", event.target.value)} placeholder="e.g. Public Internet Zone" /></Fld>
              <Fld label="Color"><Inp type="color" value={boundary.color || "#ff9f0a"} onChange={(event) => updateBoundary(boundary.id, "color", event.target.value)} style={{ padding: 4, height: 42 }} /></Fld>
              <Fld label="Notes" span><Txt value={boundary.description} onChange={(event) => updateBoundary(boundary.id, "description", event.target.value)} placeholder="Why this boundary exists or what makes it sensitive..." style={{ height: 74 }} /></Fld>
              <Fld label="Included Modules" span>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {validModules.map((module) => {
                    const active = boundary.moduleIds.includes(module.id);
                    return (
                      <label key={`${boundary.id}-${module.id}`} style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 6, border: `1px solid ${active ? boundary.color || "#ff9f0a" : "rgba(171, 179, 183, 0.22)"}`, background: active ? `${boundary.color || "#ff9f0a"}18` : "transparent", cursor: "pointer", fontSize: 12 }}>
                        <input type="checkbox" checked={active} onChange={() => toggleModule(boundary.id, module.id)} />
                        <span>{module.name}</span>
                      </label>
                    );
                  })}
                </div>
              </Fld>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <Btn onClick={() => removeBoundary(boundary.id)} variant="destructive">Remove Boundary</Btn>
            </div>
          </div>
        ))}
      </div>

      <div style={C.card}>
        <div style={{ color: "#ef4444", fontFamily: "monospace", fontSize: 11, marginBottom: 10 }}>HIGH-PRIORITY CROSS-BOUNDARY FLOWS ({crossBoundaryFlows.length})</div>
        {crossBoundaryFlows.length === 0 && <div style={{ color: "#737c7f", fontSize: 13 }}>No flows are currently marked as crossing a manual trust boundary.</div>}
        {crossBoundaryFlows.map((flow) => (
          <div key={flow.id} style={{ padding: "10px 12px", background: "rgba(239,68,68,.05)", border: "1px solid rgba(239,68,68,.2)", borderRadius: 6, marginBottom: 8 }}>
            <div style={{ color: "#fca5a5", fontSize: 12, fontFamily: "monospace", marginBottom: 4 }}>{flow.from}{" -> "}{flow.to}</div>
            <div style={{ color: "#586064", fontSize: 12 }}>Boundary: {flow.boundaryNames.join(", ") || "Manual"}</div>
          </div>
        ))}
      </div>

      {dfd && (
        <>
          <div style={{ ...C.card, borderColor: "#436086" }}>
            <div style={{ color: "#436086", fontFamily: "monospace", fontSize: 11, marginBottom: 8 }}>GEMINI SECURITY ANALYSIS</div>
            <p style={{ color: "#2b3437", fontSize: 13, lineHeight: 1.7, margin: 0 }}>{dfd.summary}</p>
          </div>

          {dfd.trustBoundaries?.length > 0 && <div style={C.card}>
            <div style={{ color: "#ff9f0a", fontFamily: "monospace", fontSize: 11, marginBottom: 10 }}>AI-SUGGESTED TRUST BOUNDARIES ({dfd.trustBoundaries.length})</div>
            {dfd.trustBoundaries.map((boundary, index) => (
              <div key={index} style={{ padding: "10px 12px", background: "rgba(255,159,10,.06)", border: "1px solid rgba(255,159,10,.2)", borderRadius: 6, marginBottom: 8 }}>
                <div style={{ color: "#ff9f0a", fontSize: 13, fontWeight: 600 }}>{boundary.name}</div>
                <div style={{ color: "#586064", fontSize: 12, marginTop: 4 }}>{boundary.description}</div>
                {boundary.includes && <div style={{ color: "#586064", fontSize: 11, marginTop: 4 }}>Includes: {boundary.includes.join(", ")}</div>}
              </div>
            ))}
          </div>}

          {dfd.highRiskFlows?.length > 0 && <div style={C.card}>
            <div style={{ color: "#ef4444", fontFamily: "monospace", fontSize: 11, marginBottom: 10 }}>AI HIGH-RISK FLOWS ({dfd.highRiskFlows.length})</div>
            {dfd.highRiskFlows.map((flow, index) => (
              <div key={index} style={{ padding: "10px 12px", background: "rgba(239,68,68,.05)", border: "1px solid rgba(239,68,68,.2)", borderRadius: 6, marginBottom: 8 }}>
                <div style={{ color: "#fca5a5", fontSize: 12, fontFamily: "monospace", marginBottom: 4 }}>{flow.from}{" -> "}{flow.to}</div>
                <div style={{ color: "#586064", fontSize: 12 }}>{flow.risk}</div>
                <div style={{ display: "flex", gap: 4, marginTop: 6, flexWrap: "wrap" }}>
                  {flow.strideCategories?.map((category) => <Tag key={category} label={category} color="#ef4444" />)}
                </div>
              </div>
            ))}
          </div>}

          {dfd.securityNotes?.length > 0 && <div style={C.card}>
            <div style={{ color: "#a78bfa", fontFamily: "monospace", fontSize: 11, marginBottom: 10 }}>SECURITY NOTES</div>
            {dfd.securityNotes.map((note, index) => (
              <div key={index} style={{ color: "#586064", fontSize: 13, padding: "5px 0", borderBottom: index < dfd.securityNotes.length - 1 ? "1px solid #e3e9ec" : "none" }}>- {note}</div>
            ))}
          </div>}
        </>
      )}
    </>
  );
}

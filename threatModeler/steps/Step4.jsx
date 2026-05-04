import { useState, useEffect } from "react";
import { getComponent, reseedLibraryThreats } from "../../componentEngine.js";
import { parseGeminiJson } from "../../geminiJson.js";
import { C, STRIDE, QUESTIONNAIRE } from "../modelConstants.js";
import { SHdr, Fld, Sel, Txt, Err, AiBtn, Pill, Tag, Inp, Btn } from "../modelPrimitives.jsx";
import {
  averageScore,
  buildQuestionnaireElements,
  createThreatIdFactory,
  defaultDreadScores,
  gemini,
  profileContextForLlm,
  questionStateKey,
  risk,
  strideMeta
} from "../modelHelpers.js";
export default function Step4({ threats, setThreats, modules, apiKey, profile, trustBoundaries, questionnaireAnswers, setQuestionnaireAnswers }) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [filter, setFilter] = useState("all");
  const [moduleFilter, setModuleFilter] = useState("all");
  const [severityFilter, setSeverityFilter] = useState("all");
  const [expanded, setExpanded] = useState(null);
  const [selectedElementId, setSelectedElementId] = useState("");
  const [librarySeedMeta, setLibrarySeedMeta] = useState(null);
  const [draftSyncMeta, setDraftSyncMeta] = useState(null);
  const questionnaireElements = buildQuestionnaireElements(modules, trustBoundaries);
  const selectedElement = questionnaireElements.find((element) => element.id === selectedElementId) || questionnaireElements[0] || null;
  const questions = selectedElement ? (QUESTIONNAIRE[selectedElement.kind] || []) : [];

  const typedModules = modules.filter((m) => m.componentType && m.name.trim());
  const hasLibraryThreats = threats.some((t) => t.source === "library");
  const expectedLibraryThreats = typedModules.reduce((total, m) => {
    const c = getComponent(m.componentType);
    return total + (c?.threats?.length || 0);
  }, 0);

  useEffect(() => {
    if (hasLibraryThreats) return;
    if (!typedModules.length) return;
    setThreats((current) => {
      if (current.some((t) => t.source === "library")) return current;
      const idFactory = createThreatIdFactory(current);
      return reseedLibraryThreats({
        existingThreats: current,
        modules: typedModules,
        idFactory,
        strideMeta,
        dreadDefaults: defaultDreadScores()
      });
    });
    setLibrarySeedMeta(`Seeded ${expectedLibraryThreats} threats from ${typedModules.length} typed components.`);
  }, [hasLibraryThreats, typedModules.length, expectedLibraryThreats, setThreats]);

  const reseedLibrary = () => {
    setThreats((current) => {
      const idFactory = createThreatIdFactory(current);
      const next = reseedLibraryThreats({
        existingThreats: current,
        modules: typedModules,
        idFactory,
        strideMeta,
        dreadDefaults: defaultDreadScores()
      });
      const added = next.filter((t) => t.source === "library").length;
      setLibrarySeedMeta(`Re-seeded ${added} library threats from ${typedModules.length} typed components. Manual / questionnaire / AI threats preserved.`);
      return next;
    });
  };

  const analyze = async () => {
    setLoading(true);
    setErr(null);

    try {
      const modulePayload = modules.filter((module) => module.name).map((module) => ({
        id: module.id,
        name: module.name,
        parentId: module.parentId,
        inputs: module.inputs,
        outputs: module.outputs,
        dataStores: module.dataStores,
        externalEntities: module.externalEntities
      }));

      const boundaryPayload = trustBoundaries.filter((boundary) => boundary.name.trim()).map((boundary) => ({
        name: boundary.name,
        description: boundary.description,
        modules: modules.filter((module) => boundary.moduleIds.includes(module.id)).map((module) => module.name)
      }));

      const zipAndNotes = profileContextForLlm(profile, 70_000);

      const text = await gemini(apiKey, `You are a threat modeling expert using STRIDE. Identify specific threats for this application.

Application: ${profile.name} (${profile.type})
Stack: ${profile.techStack}
Description: ${profile.description}
${zipAndNotes ? `Context (ZIP / author notes):\n${zipAndNotes}\n` : ""}
Modules: ${JSON.stringify(modulePayload)}
Manual Trust Boundaries: ${JSON.stringify(boundaryPayload)}

Return ONLY a valid JSON array (10-18 threats, all 6 STRIDE categories covered, specific to the tech stack):
[{
  "moduleId":"module-id",
  "moduleName":"exact module name",
  "strideCategory":"S",
  "title":"Short threat title",
  "description":"2-3 sentence specific description",
  "attackVector":"Concrete attack technique"
}]`);

      const data = parseGeminiJson(text);

      setThreats((current) => {
        const preserved = current.filter((threat) => threat.source !== "gemini");
        const makeId = createThreatIdFactory(preserved);

        const nextThreats = data.map((item) => {
          const stride = strideMeta(item.strideCategory);
          const fallbackModule = modules.find((module) => module.name === item.moduleName) || modules.find((module) => module.id === item.moduleId) || modules[0];

          return {
            id: item.id || makeId(),
            moduleId: item.moduleId || fallbackModule?.id || "",
            moduleName: item.moduleName || fallbackModule?.name || "Application",
            strideCategory: item.strideCategory || "S",
            strideName: stride.name,
            title: item.title || "Suggested threat",
            description: item.description || "",
            attackVector: item.attackVector || "",
            status: "review",
            source: "gemini",
            dreadScores: defaultDreadScores()
          };
        });

        return [...preserved, ...nextThreats];
      });
    } catch (error) {
      setErr(error.message);
    } finally {
      setLoading(false);
    }
  };

  const addManualThreat = () => setThreats((current) => {
    const makeId = createThreatIdFactory(current);
    const defaultModule = modules.find((module) => module.name.trim()) || modules[0];
    return [...current, {
      id: makeId(),
      moduleId: defaultModule?.id || "",
      moduleName: defaultModule?.name || "",
      strideCategory: "S",
      strideName: "Spoofing",
      title: "New Threat",
      description: "",
      attackVector: "",
      status: "review",
      source: "manual",
      dreadScores: defaultDreadScores()
    }];
  });

  const setStatus = (id, status) => setThreats((current) => current.map((threat) => threat.id === id ? { ...threat, status } : threat));
  const updateThreat = (id, patch) => setThreats((current) => current.map((threat) => threat.id === id ? { ...threat, ...patch } : threat));
  const removeThreat = (id) => setThreats((current) => current.filter((threat) => threat.id !== id));

  const updateQuestion = (elementId, questionId, patch) => {
    const key = questionStateKey(elementId, questionId);
    setQuestionnaireAnswers((current) => ({ ...current, [key]: { ...(current[key] || { status: "review", notes: "" }), ...patch } }));
  };

  const createThreatDrafts = () => {
    const makeId = createThreatIdFactory(threats);
    const questionnaireItems = [];

    questionnaireElements.forEach((element) => {
      const elementQuestions = QUESTIONNAIRE[element.kind] || [];
      elementQuestions.forEach((question) => {
        const key = questionStateKey(element.id, question.id);
        questionnaireItems.push({ key, element, question, answer: questionnaireAnswers[key] });
      });
    });

    const itemByKey = new Map(questionnaireItems.map((item) => [item.key, item]));
    const statusFromAnswer = (answer) => (answer?.status === "applicable" ? "applicable" : answer?.status === "not-applicable" ? "not-applicable" : "review");

    let synced = 0;
    const updatedThreats = threats.map((threat) => {
      if (threat.source !== "questionnaire" || !threat.sourceKey) return threat;

      const item = itemByKey.get(threat.sourceKey);
      if (!item || !item.answer) return threat;

      const stride = strideMeta(item.question.strideCategory);
      const patch = {
        moduleId: item.element.moduleId || "",
        moduleName: item.element.moduleName || item.element.label,
        strideCategory: item.question.strideCategory,
        strideName: stride.name,
        description: item.answer.notes?.trim() || item.question.prompt,
        attackVector: item.question.attackVectorHint,
        status: statusFromAnswer(item.answer)
      };

      const changed = Object.keys(patch).some((key) => threat[key] !== patch[key]);
      if (!changed) return threat;
      synced += 1;
      return { ...threat, ...patch };
    });

    const existingKeys = new Set(updatedThreats.filter((threat) => threat.source === "questionnaire" && threat.sourceKey).map((threat) => threat.sourceKey));
    const additions = questionnaireItems.reduce((acc, item) => {
      if (!item.answer || item.answer.status === "not-applicable") return acc;
      if (existingKeys.has(item.key)) return acc;

      const stride = strideMeta(item.question.strideCategory);
      acc.push({
        id: makeId(),
        moduleId: item.element.moduleId || "",
        moduleName: item.element.moduleName || item.element.label,
        strideCategory: item.question.strideCategory,
        strideName: stride.name,
        title: item.question.suggestedTitle.replace(/\{\{element\}\}/g, item.element.label),
        description: item.answer.notes?.trim() || item.question.prompt,
        attackVector: item.question.attackVectorHint,
        status: statusFromAnswer(item.answer),
        source: "questionnaire",
        sourceKey: item.key,
        dreadScores: defaultDreadScores()
      });
      return acc;
    }, []);

    setThreats([...updatedThreats, ...additions]);
    setDraftSyncMeta(`Created ${additions.length} draft${additions.length === 1 ? "" : "s"} and synced ${synced} existing questionnaire threat${synced === 1 ? "" : "s"}.`);
  };

  const draftableQuestions = questionnaireElements.reduce((count, element) => {
    const elementQuestions = QUESTIONNAIRE[element.kind] || [];
    return count + elementQuestions.filter((question) => {
      const answer = questionnaireAnswers[questionStateKey(element.id, question.id)];
      return answer && answer.status !== "not-applicable";
    }).length;
  }, 0);

  const counts = {
    applicable: threats.filter((threat) => threat.status === "applicable").length,
    review: threats.filter((threat) => threat.status === "review").length,
    na: threats.filter((threat) => threat.status === "not-applicable").length
  };

  const filteredThreats = threats.filter((threat) => {
    if (filter !== "all" && threat.strideCategory !== filter) return false;
    if (moduleFilter !== "all" && threat.moduleId !== moduleFilter) return false;
    if (severityFilter !== "all" && risk(averageScore(threat.dreadScores)).label.toLowerCase() !== severityFilter) return false;
    return true;
  });

  const sourceStyles = {
    gemini: { label: "AI", color: "#436086" },
    manual: { label: "Manual", color: "#30d158" },
    questionnaire: { label: "Questionnaire", color: "#a78bfa" },
    library: { label: "Library", color: "#ec4899" }
  };

  return (
    <>
      <SHdr n={4} title="STRIDE Threat Analysis" sub="Library-seeded threats appear automatically per typed component. Add questionnaire-driven, AI, or manual threats on top, and confirm what is actually relevant." />

      <div style={C.card}>
        <div style={{ color: "#ec4899", fontFamily: "monospace", fontSize: 11, marginBottom: 10 }}>COMPONENT-LIBRARY SEEDED THREATS</div>
        {typedModules.length === 0 ? (
          <p style={{ color: "#586064", fontSize: 13, lineHeight: 1.55, margin: 0 }}>
            None of your modules are typed yet. Go back to <strong style={{ color: "#2b3437" }}>Step 2</strong> and assign a Component Type so we can attach the relevant STRIDE threats and security requirements.
          </p>
        ) : (
          <>
            <p style={{ color: "#586064", fontSize: 13, marginBottom: 12, lineHeight: 1.55 }}>
              {threats.filter((t) => t.source === "library").length} library threats currently attached, drawn from {typedModules.length} typed component{typedModules.length === 1 ? "" : "s"}. Re-seed if you changed component types in Step 2.
            </p>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <Btn onClick={reseedLibrary} className="border-pink-500 text-pink-500 hover:text-pink-500">Re-seed library threats</Btn>
              {librarySeedMeta && <span style={{ color: "#586064", fontSize: 12, fontFamily: "monospace" }}>{librarySeedMeta}</span>}
            </div>
          </>
        )}
      </div>

      <div style={C.card}>
        <div style={{ color: "#a78bfa", fontFamily: "monospace", fontSize: 11, marginBottom: 12 }}>GUIDED STRIDE QUESTIONNAIRE</div>
        <div style={C.g2}>
          <Fld label="DFD Element">
            <Sel value={selectedElement?.id || ""} onChange={(event) => setSelectedElementId(event.target.value)}>
              {questionnaireElements.map((element) => <option key={element.id} value={element.id}>{element.kind} · {element.label}</option>)}
            </Sel>
          </Fld>
          <Fld label="Boundary Context">
            <div style={{ minHeight: 40, display: "flex", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
              {selectedElement?.boundaryNames?.length ? selectedElement.boundaryNames.map((name) => <Tag key={name} label={name} color="#ff9f0a" />) : <span style={{ color: "#586064", fontSize: 12 }}>No manual trust boundary assigned.</span>}
            </div>
          </Fld>
        </div>

        {!selectedElement && <div style={{ color: "#737c7f", fontSize: 13 }}>Add modules and DFD elements first to start the questionnaire.</div>}

        {selectedElement && questions.map((question) => {
          const key = questionStateKey(selectedElement.id, question.id);
          const answer = questionnaireAnswers[key] || { status: "review", notes: "" };
          const stride = strideMeta(question.strideCategory);

          return (
            <div key={question.id} style={{ border: "1px solid rgba(171, 179, 183, 0.22)", borderRadius: 8, padding: 12, marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 8, flexWrap: "wrap" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 6, flexWrap: "wrap" }}>
                    <Tag label={`${stride.id} · ${stride.name}`} color={stride.color} />
                    <span style={{ color: "#737c7f", fontSize: 11 }}>{selectedElement.kind}</span>
                  </div>
                  <div style={{ color: "#2b3437", fontSize: 13 }}>{question.prompt}</div>
                </div>
                <Sel value={answer.status} onChange={(event) => updateQuestion(selectedElement.id, question.id, { status: event.target.value })} style={{ width: 180, flexShrink: 0 }}>
                  <option value="applicable">Applicable</option>
                  <option value="review">Under Review</option>
                  <option value="not-applicable">Not Applicable</option>
                </Sel>
              </div>
              <Txt value={answer.notes} onChange={(event) => updateQuestion(selectedElement.id, question.id, { notes: event.target.value })} placeholder="Capture evidence, assumptions, or a concrete scenario for this STRIDE prompt..." style={{ height: 72 }} />
            </div>
          );
        })}

        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ color: "#586064", fontSize: 12 }}>{draftableQuestions} questionnaire items are ready for draft create/sync.</div>
          <Btn onClick={createThreatDrafts}>Create / Sync Threat Drafts</Btn>
        </div>
        {draftSyncMeta && <div style={{ color: "#586064", fontSize: 12, marginTop: 8, fontFamily: "monospace" }}>{draftSyncMeta}</div>}
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <AiBtn onClick={analyze} loading={loading} label="Auto-Suggest Threats with Gemini" />
        <Btn onClick={addManualThreat}>+ Manual Threat</Btn>
      </div>
      <Err msg={err} />

      {threats.length > 0 && (
        <>
          <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
            <Pill label="Total" value={threats.length} color="#436086" />
            <Pill label="Applicable" value={counts.applicable} color="#30d158" />
            <Pill label="Under Review" value={counts.review} color="#ff9f0a" />
            <Pill label="Not Applicable" value={counts.na} color="#586064" />
          </div>

          <div style={{ ...C.card, paddingBottom: 8 }}>
            <div style={{ color: "#586064", fontSize: 12, marginBottom: 10 }}>Filter by STRIDE, module, and current DREAD severity.</div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
              {["all", ...STRIDE.map((item) => item.id)].map((category) => {
                const stride = STRIDE.find((item) => item.id === category);
                const color = stride?.color || "#436086";

                return (
                  <button key={category} onClick={() => setFilter(category)} style={{ padding: "4px 10px", borderRadius: 4, fontSize: 11, fontFamily: "monospace", cursor: "pointer", background: filter === category ? (category === "all" ? "#436086" : color) : "transparent", border: `1px solid ${category === "all" ? "#436086" : color}`, color: filter === category ? "#111827" : "#586064" }}>
                    {category === "all" ? "All" : `${stride.id} · ${stride.name}`}
                  </button>
                );
              })}
            </div>
            <div style={C.g2}>
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
          </div>

          <div style={{ color: "#586064", fontSize: 12, marginBottom: 8 }}>
            Threat status shortcut labels: <strong style={{ color: "#2b3437" }}>Applicable</strong>, <strong style={{ color: "#2b3437" }}>Under Review</strong>, <strong style={{ color: "#2b3437" }}>Not Applicable</strong>.
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {filteredThreats.map((threat) => {
              const stride = strideMeta(threat.strideCategory);
              const severity = risk(averageScore(threat.dreadScores));
              const isExpanded = expanded === threat.id;
              const source = sourceStyles[threat.source] || sourceStyles.manual;

              return (
                <div key={threat.id} style={{ ...C.card, borderLeft: `3px solid ${stride.color}`, marginBottom: 0, padding: "12px 14px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                    <div style={{ flex: 1, cursor: "pointer" }} onClick={() => setExpanded(isExpanded ? null : threat.id)}>
                      <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 5, flexWrap: "wrap" }}>
                        <span style={{ fontFamily: "monospace", fontSize: 11, color: "#737c7f" }}>{threat.id}</span>
                        <Tag label={`${stride.id} · ${stride.name}`} color={stride.color} />
                        <Tag label={source.label} color={source.color} />
                        <Tag label={severity.label} color={severity.color} bg={severity.bg} />
                        <span style={{ color: "#737c7f", fontSize: 11 }}>to {threat.moduleName || "Unassigned"}</span>
                      </div>
                      <div style={{ color: "#2b3437", fontSize: 13, fontWeight: 500 }}>{threat.title}</div>
                    </div>
                    <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                      {[["applicable", "Applicable", "#30d158"], ["review", "Under Review", "#ff9f0a"], ["not-applicable", "Not Applicable", "#586064"]].map(([status, label, color]) => (
                        <button key={status} title={label} onClick={() => setStatus(threat.id, status)} style={{ minWidth: 72, height: 28, padding: "0 8px", borderRadius: 4, border: `1px solid ${threat.status === status ? color : "#737c7f"}`, background: threat.status === status ? `${color}22` : "transparent", color: threat.status === status ? color : "#737c7f", cursor: "pointer", fontSize: 11, fontWeight: 700 }}>
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {isExpanded && (
                    <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #e3e9ec" }}>
                      <div style={C.g2}>
                        <Fld label="Threat Title"><Inp value={threat.title} onChange={(event) => updateThreat(threat.id, { title: event.target.value })} /></Fld>
                        <Fld label="Module">
                          <Sel value={threat.moduleId || ""} onChange={(event) => {
                            const module = modules.find((candidate) => candidate.id === event.target.value);
                            updateThreat(threat.id, { moduleId: event.target.value, moduleName: module?.name || "" });
                          }}>
                            <option value="">Unassigned</option>
                            {modules.filter((module) => module.name.trim()).map((module) => <option key={module.id} value={module.id}>{module.name}</option>)}
                          </Sel>
                        </Fld>
                        <Fld label="STRIDE Category">
                          <Sel value={threat.strideCategory} onChange={(event) => {
                            const strideInfo = strideMeta(event.target.value);
                            updateThreat(threat.id, { strideCategory: event.target.value, strideName: strideInfo.name });
                          }}>
                            {STRIDE.map((item) => <option key={item.id} value={item.id}>{item.id} · {item.name}</option>)}
                          </Sel>
                        </Fld>
                        <Fld label="Status">
                          <Sel value={threat.status} onChange={(event) => updateThreat(threat.id, { status: event.target.value })}>
                            <option value="applicable">Applicable</option>
                            <option value="review">Under Review</option>
                            <option value="not-applicable">Not Applicable</option>
                          </Sel>
                        </Fld>
                        <Fld label="Description" span><Txt value={threat.description} onChange={(event) => updateThreat(threat.id, { description: event.target.value })} style={{ height: 92 }} /></Fld>
                        <Fld label="Attack Vector" span><Inp value={threat.attackVector} onChange={(event) => updateThreat(threat.id, { attackVector: event.target.value })} placeholder="Concrete technique or abuse path" /></Fld>
                      </div>
                      <div style={{ display: "flex", justifyContent: "flex-end" }}>
                        <Btn onClick={() => removeThreat(threat.id)} variant="destructive">Delete Threat</Btn>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}

import { useState, useRef, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import ThreatModelerCanvas from "../ThreatModelerCanvas.jsx";
import StencilDesigner from "../stencilDesigner.jsx";
import { DEFAULT_GEMINI_API_KEY } from "../geminiEnv.js";
import { reseedLibraryThreats } from "../componentEngine.js";
import { C } from "./modelConstants.js";
import {
  createModule,
  normalizeModule,
  createThreatIdFactory,
  strideMeta,
  defaultDreadScores,
  canAdvanceFromStep,
  canNavigateToStep
} from "./modelHelpers.js";
import { buildSnapshot, saveProjectSnapshot, loadProjectSnapshot } from "../lib/projectPersistence.js";
import { getStoredGeminiApiKey, setStoredGeminiApiKey } from "../lib/appPrefs.js";
import GeminiSettingsPopover from "./GeminiSettingsPopover.jsx";
import {
  buildCanvasModelFromModules,
  canvasTrustBoundariesToWizard,
  normalizeCanvasModel
} from "./canvasInterop.js";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import Step1 from "./steps/Step1.jsx";
import Step2 from "./steps/Step2.jsx";
import Step3 from "./steps/Step3.jsx";
import Step4 from "./steps/Step4.jsx";
import Step5 from "./steps/Step5.jsx";
import Step6 from "./steps/Step6.jsx";

function defaultProfile() {
  return {
    name: "",
    type: "Web Application",
    deployEnv: "Cloud (Public)",
    appStatus: "legacy",
    techStack: "",
    description: "",
    criticality: "High — Mission critical / PII / Financial",
    compliance: "",
    repoUrl: "",
    repoBranch: "",
    repoContext: "",
    zipFileName: "",
    zipDerivedContext: "",
    modelContextNotes: ""
  };
}

export default function ThreatModelerWizard() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const zipBufferRef = useRef(null);
  const [hydrated, setHydrated] = useState(false);
  const [workspace, setWorkspace] = useState("wizard");
  const [step, setStep] = useState(1);
  const [apiKey, setApiKey] = useState(() => DEFAULT_GEMINI_API_KEY || getStoredGeminiApiKey());
  const [geminiSettingsOpen, setGeminiSettingsOpen] = useState(false);
  const [saveHint, setSaveHint] = useState("");
  const [profile, setProfile] = useState(defaultProfile);
  const [modules, setModules] = useState([createModule("m-1")]);
  const [dfd, setDfd] = useState(null);
  const [trustBoundaries, setTrustBoundaries] = useState([]);
  const [threats, setThreats] = useState([]);
  const [questionnaireAnswers, setQuestionnaireAnswers] = useState({});
  const [mitigations, setMitigations] = useState({});
  const [dfdMode, setDfdMode] = useState("auto");
  const [canvasModel, setCanvasModel] = useState(null);

  useEffect(() => {
    setStoredGeminiApiKey(apiKey);
  }, [apiKey]);

  useEffect(() => {
    if (!projectId) {
      navigate("/hub", { replace: true });
      return;
    }
    const snap = loadProjectSnapshot(projectId);
    if (!snap) {
      navigate("/hub", { replace: true });
      return;
    }
    setProfile(snap.profile || defaultProfile());
    setModules(snap.modules?.length ? snap.modules : [createModule("m-1")]);
    setDfd(snap.dfd ?? null);
    setTrustBoundaries(snap.trustBoundaries || []);
    setThreats(snap.threats || []);
    setQuestionnaireAnswers(snap.questionnaireAnswers || {});
    setMitigations(snap.mitigations && typeof snap.mitigations === "object" ? snap.mitigations : {});
    setDfdMode(snap.dfdMode || "auto");
    setCanvasModel(snap.canvasModel || null);
    setStep(snap.step || 1);
    setWorkspace("wizard");
    zipBufferRef.current = null;
    setHydrated(true);
  }, [projectId, navigate]);

  useEffect(() => {
    if (!hydrated || !projectId) return;
    setSaveHint("Saving…");
    const t = window.setTimeout(() => {
      const snapshot = buildSnapshot({
        profile,
        modules,
        dfd,
        trustBoundaries,
        threats,
        questionnaireAnswers,
        mitigations,
        canvasModel,
        dfdMode,
        step
      });
      saveProjectSnapshot(projectId, snapshot);
      setSaveHint("Saved locally");
      window.setTimeout(() => setSaveHint(""), 2000);
    }, 700);
    return () => window.clearTimeout(t);
  }, [hydrated, projectId, profile, modules, dfd, trustBoundaries, threats, questionnaireAnswers, mitigations, canvasModel, dfdMode, step]);

  const navState = { profile, modules, threats };

  const canNext = () => canAdvanceFromStep(step, navState);

  const openDesignerFresh = () => {
    setModules([createModule("m-1")]);
    setThreats([]);
    setDfd(null);
    setTrustBoundaries([]);
    setQuestionnaireAnswers({});
    setMitigations({});
    setWorkspace("designer");
  };

  const openCanvas = (mode = "continue") => {
    if (mode === "import-auto") {
      setCanvasModel(buildCanvasModelFromModules(profile, modules, trustBoundaries));
    } else if (mode === "blank") {
      setCanvasModel({
        appName: profile.name || "Untitled Model",
        appDesc: [profile.modelContextNotes, profile.description].filter((s) => s?.trim()).join("\n\n"),
        appStack: profile.techStack || "",
        nodes: [],
        edges: []
      });
    }
    setWorkspace("canvas");
  };

  const closeCanvas = () => {
    if (canvasModel?.nodes?.length) {
      const imported = canvasTrustBoundariesToWizard(canvasModel, modules);
      if (imported.length) {
        setTrustBoundaries((current) => [
          ...current.filter((b) => b.source !== "canvas"),
          ...imported
        ]);
      }
    }
    setWorkspace("wizard");
  };

  const steps = ["Profile", "Modules", "DFD", "STRIDE", "DREAD", "Report"];

  const trySetStep = (n) => {
    if (!canNavigateToStep(step, n, navState)) return;
    setStep(n);
  };

  if (!hydrated) {
    return (
      <div style={{ ...C.root, display: "flex", alignItems: "center", justifyContent: "center", color: "#586064", fontFamily: "'Manrope', sans-serif" }}>
        Loading project…
      </div>
    );
  }

  if (workspace === "canvas") {
    return (
      <div className="tm-page-enter" style={{ ...C.root, minHeight: "100vh", display: "flex", flexDirection: "column" }}>
        <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=Inter:wght@400;500;600;700&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
      `}</style>
        <div className="no-print" style={{ flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "10px 20px", borderBottom: "1px solid rgba(171, 179, 183, 0.22)", background: "#f1f4f6" }}>
          <Button type="button" onClick={closeCanvas} variant="outline">Back to wizard</Button>
          <span style={{ color: "#586064", fontSize: 12, fontFamily: "'Manrope', sans-serif", textAlign: "center", flex: 1 }}>
            {(profile.name || "Project").trim() || "Project"} › Interactive DFD canvas
          </span>
          <GeminiSettingsPopover apiKey={apiKey} setApiKey={setApiKey} open={geminiSettingsOpen} onOpenChange={setGeminiSettingsOpen} />
        </div>
        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
          <ThreatModelerCanvas
            embedded
            hideApiKeyInToolbar
            onRequestApiKeySettings={() => setGeminiSettingsOpen(true)}
            apiKey={apiKey}
            setApiKey={setApiKey}
            initialAppName={profile.name}
            initialAppDesc={[profile.modelContextNotes, profile.description].filter((s) => s?.trim()).join("\n\n") || profile.description}
            initialAppStack={profile.techStack}
            initialModel={canvasModel}
            onModelChange={(model) => setCanvasModel(normalizeCanvasModel(model))}
          />
        </div>
      </div>
    );
  }

  if (workspace === "designer") {
    return (
      <div className="tm-page-enter" style={{ ...C.root, minHeight: "100vh", display: "flex", flexDirection: "column" }}>
        <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=Inter:wght@400;500;600;700&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
      `}</style>
        <div className="no-print" style={{ flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "10px 20px", borderBottom: "1px solid rgba(171, 179, 183, 0.22)", background: "#f1f4f6" }}>
          <Button type="button" onClick={() => setWorkspace("wizard")} variant="outline">Back to wizard</Button>
          <span style={{ color: "#586064", fontSize: 12, fontFamily: "'Manrope', sans-serif", textAlign: "center", flex: 1 }}>
            {(profile.name || "Project").trim() || "Project"} › Stencil designer
          </span>
          <GeminiSettingsPopover apiKey={apiKey} setApiKey={setApiKey} open={geminiSettingsOpen} onOpenChange={setGeminiSettingsOpen} />
        </div>
        <div style={{ flex: 1, minHeight: 0, display: "flex" }}>
          <StencilDesigner
            initialModules={modules.filter((m) => m.componentType)}
            onCancel={() => setWorkspace("wizard")}
            onCommit={({ modules: designerModules }) => {
              if (designerModules.length > 0) {
                setModules(designerModules.map((m) => normalizeModule(m)));
                setThreats((current) => {
                  const idFactory = createThreatIdFactory(current);
                  return reseedLibraryThreats({
                    existingThreats: current,
                    modules: designerModules,
                    idFactory,
                    strideMeta,
                    dreadDefaults: defaultDreadScores()
                  });
                });
              }
              setWorkspace("wizard");
              setStep((current) => (current < 2 ? 2 : current));
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="tm-page-enter" style={C.root}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=Inter:wght@400;500;600;700&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        input:focus,select:focus,textarea:focus{border-color:#436086!important;box-shadow:0 0 0 2px rgba(67,96,134,0.12)!important}
        input[type=range]{-webkit-appearance:none;height:4px;background:rgba(171, 179, 183, 0.22);border-radius:2px;outline:none;border:none!important;padding:0!important}
        input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:14px;height:14px;border-radius:50%;background:var(--thumb-color,#436086);cursor:pointer}
        ::-webkit-scrollbar{width:4px}::-webkit-scrollbar-track{background:#f1f4f6}::-webkit-scrollbar-thumb{background:rgba(171, 179, 183, 0.22);border-radius:2px}
        select option{background:#ffffff;color:#2b3437}
        @media print{.no-print{display:none!important}body{background:#fff!important;color:#000!important}}
        @media(max-width:720px){.grid2,.grid3{grid-template-columns:1fr!important}}
      `}</style>

      <header style={C.hdr} className="no-print">
        <div style={C.hdrIn}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <div>
              <Link to="/" style={{ textDecoration: "none", color: "inherit" }}>
                <div style={{ fontSize: 15, fontWeight: 700, fontFamily: "'Manrope', sans-serif", letterSpacing: 1, color: "#2b3437" }}>ThreatModeler</div>
              </Link>
              <div style={{ fontSize: 10, color: "#737c7f", fontFamily: "'Manrope', sans-serif" }}>Lightweight Threat Modeling Tool · v1.1</div>
            </div>
            <nav style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <Link to="/hub" style={{ color: "#586064", fontSize: 12, fontFamily: "'Manrope', sans-serif" }}>Hub</Link>
              <Link to="/help" style={{ color: "#586064", fontSize: 12, fontFamily: "'Manrope', sans-serif" }}>Help</Link>
              <Link to="/settings" style={{ color: "#586064", fontSize: 12, fontFamily: "'Manrope', sans-serif" }}>Settings</Link>
            </nav>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
            {saveHint && <Badge className="tm-pulse-dot bg-emerald-600/15 text-emerald-600 hover:bg-emerald-600/15">{saveHint}</Badge>}
            {profile.name && <span style={{ color: "#737c7f", fontSize: 12, fontFamily: "'Manrope', sans-serif" }}>{profile.name}</span>}
          </div>
        </div>
      </header>

      <div style={{ background: "#f1f4f6", borderBottom: "1px solid rgba(171, 179, 183, 0.22)", padding: "10px 20px", display: "flex", justifyContent: "center", alignItems: "center", gap: 0, flexWrap: "wrap" }} className="no-print">
        {steps.map((label, index) => {
          const n = index + 1;
          const active = n === step;
          const done = n < step;
          const allowed = canNavigateToStep(step, n, navState);
          const cursor = allowed ? "pointer" : "not-allowed";
          const dim = !allowed && !active ? 0.45 : 1;

          return (
            <div
              key={n}
              role="button"
              tabIndex={0}
              style={{ display: "flex", alignItems: "center", cursor, opacity: dim }}
              onClick={() => trySetStep(n)}
              onKeyDown={(e) => e.key === "Enter" && trySetStep(n)}
              title={!allowed && n > step ? "Complete earlier steps first" : `Go to ${label}`}
            >
              <div style={{ width: 26, height: 26, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontFamily: "'Manrope', sans-serif", flexShrink: 0, border: `1px solid ${active ? "#436086" : done ? "#30d158" : "#737c7f"}`, background: active ? "rgba(67,96,134,0.12)" : done ? "rgba(58,87,100,0.08)" : "transparent", color: active ? "#436086" : done ? "#30d158" : "#737c7f" }}>
                {done ? "+" : n}
              </div>
              <span style={{ fontSize: 11, margin: "0 6px", fontFamily: "'Manrope', sans-serif", color: active ? "#436086" : done ? "#30d158" : "#737c7f" }}>{label}</span>
              {index < steps.length - 1 && <div style={{ width: 24, height: 1, background: done ? "#30d158" : "rgba(171, 179, 183, 0.22)", margin: "0 2px" }} />}
            </div>
          );
        })}
      </div>

      <main style={C.main} className="grid2 grid3 tm-stagger">
        {step === 1 && <Step1 profile={profile} setProfile={setProfile} zipBufferRef={zipBufferRef} onOpenDesigner={openDesignerFresh} />}
        {step === 2 && <Step2 modules={modules} setModules={setModules} apiKey={apiKey} profile={profile} setProfile={setProfile} zipBufferRef={zipBufferRef} />}
        {step === 3 && (
          <Step3
            profile={profile}
            modules={modules}
            apiKey={apiKey}
            dfd={dfd}
            setDfd={setDfd}
            trustBoundaries={trustBoundaries}
            setTrustBoundaries={setTrustBoundaries}
            dfdMode={dfdMode}
            setDfdMode={setDfdMode}
            canvasModel={canvasModel}
            onOpenCanvas={openCanvas}
          />
        )}
        {step === 4 && <Step4 threats={threats} setThreats={setThreats} modules={modules} apiKey={apiKey} profile={profile} trustBoundaries={trustBoundaries} questionnaireAnswers={questionnaireAnswers} setQuestionnaireAnswers={setQuestionnaireAnswers} />}
        {step === 5 && <Step5 threats={threats} setThreats={setThreats} modules={modules} />}
        {step === 6 && <Step6 profile={profile} modules={modules} setModules={setModules} threats={threats} apiKey={apiKey} mitigations={mitigations} setMitigations={setMitigations} trustBoundaries={trustBoundaries} dfd={dfd} canvasModel={canvasModel} />}
      </main>

      <footer style={C.foot} className="no-print">
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", width: "100%", justifyContent: "space-between" }}>
          <Button variant="outline" type="button" onClick={() => setStep((current) => Math.max(1, current - 1))} disabled={step === 1}>Back</Button>
          <span style={{ color: "#737c7f", fontSize: 12, fontFamily: "'Manrope', sans-serif" }}>Step {step} / {steps.length}</span>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            {step === 6 && (
              <Button variant="outline" asChild>
                <Link to="/hub">Project hub</Link>
              </Button>
            )}
            {step < steps.length ? (
              <Button
                type="button"
                style={{ background: "linear-gradient(135deg, #436086 0%, #375479 100%)", opacity: canNext() ? 1 : 0.4 }}
                onClick={() => {
                  if (!canNext()) return;
                  if (step === 1 && profile.appStatus === "new") {
                    openDesignerFresh();
                    return;
                  }
                  setStep((current) => current + 1);
                }}
                disabled={!canNext()}
              >
                {step === 1 && profile.appStatus === "new" ? "Continue to stencil designer" : "Continue"}
              </Button>
            ) : (
              <Button type="button" style={{ background: "linear-gradient(135deg, #436086 0%, #375479 100%)" }} onClick={() => window.print()}>Print / Save PDF</Button>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
}

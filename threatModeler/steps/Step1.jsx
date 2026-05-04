import { useState, useRef } from "react";
import { C } from "../modelConstants.js";
import { SHdr, Fld, Inp, Sel, Txt, Err, Btn } from "../modelPrimitives.jsx";
import { extractProjectZipContext } from "../../projectZipContext.js";

const LEGACY_TESTING_DEMO = {
  name: "Legacy HR Portal",
  type: "Web Application",
  deployEnv: "On-Premises",
  appStatus: "legacy",
  techStack: "PHP 7.4, Apache 2.4 (mod_php), MySQL 5.7, PHPMailer 5.x, jQuery 1.8, Bootstrap 3, Postfix SMTP relay, F5 load balancer (TLS edge)",
  criticality: "High — Mission critical / PII / Financial",
  compliance: "GDPR (EU employee data), SOX (payroll integrity), internal HR data handling policy",
  modelContextNotes: `Legacy HR portal on a single VM in a corporate data center.
Sensitive data includes employee PII, salary, and bank details.
Trust zones: F5 TLS edge -> app over HTTP -> MySQL + SMTP relay.
Focus on auth/session abuse, SQL injection, privilege escalation, and payroll export confidentiality.`,
  description: `Internal HR portal used by employees, HR staff, and admins. Employees can view profile data and payslips, HR staff edit records, and admins trigger payroll exports.

A nightly cron job exports payroll CSV and emails it to finance. The app is only reachable from corporate network or VPN; TLS terminates at the F5 load balancer and the app serves plain HTTP.`
};

export default function Step1({ profile, setProfile, zipBufferRef, onOpenDesigner }) {
  const [zipLoading, setZipLoading] = useState(false);
  const [zipErr, setZipErr] = useState(null);
  const [zipMeta, setZipMeta] = useState(null);
  const zipInputRef = useRef(null);
  const update = (key, value) => setProfile((current) => ({ ...current, [key]: value }));
  const isLegacy = profile.appStatus === "legacy" || profile.appStatus === "redesign";
  const isNew = profile.appStatus === "new";

  const clearZip = () => {
    setZipErr(null);
    setZipMeta(null);
    if (zipBufferRef) zipBufferRef.current = null;
    setProfile((current) => ({ ...current, zipDerivedContext: "", zipFileName: "" }));
    if (zipInputRef.current) zipInputRef.current.value = "";
  };

  const onZipSelected = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setZipErr(null);
    setZipLoading(true);
    try {
      const buf = await file.arrayBuffer();
      if (zipBufferRef) zipBufferRef.current = buf;
      const { text, meta } = await extractProjectZipContext(buf);
      setProfile((current) => ({
        ...current,
        zipDerivedContext: text,
        zipFileName: file.name
      }));
      setZipMeta(meta);
    } catch (err) {
      setZipErr(err.message || String(err));
      clearZip();
    } finally {
      setZipLoading(false);
      event.target.value = "";
    }
  };

  const flowTile = (id, label, sub, accent) => {
    const active = profile.appStatus === id;
    return (
      <button
        key={id}
        type="button"
        onClick={() => update("appStatus", id)}
        style={{
          flex: 1,
          minWidth: 200,
          textAlign: "left",
          background: active ? `${accent}10` : "#f1f4f6",
          border: `1px solid ${active ? accent : "rgba(171, 179, 183, 0.22)"}`,
          borderRadius: 8,
          padding: "12px 14px",
          cursor: "pointer",
          color: "#2b3437",
          fontFamily: "'Inter',sans-serif"
        }}
      >
        <div style={{ color: accent, fontFamily: "monospace", fontSize: 11, letterSpacing: 1 }}>{active ? "ACTIVE" : "OPTION"}</div>
        <div style={{ color: "#2b3437", fontSize: 14, fontWeight: 700, marginTop: 4 }}>{label}</div>
        <div style={{ color: "#586064", fontSize: 12, marginTop: 4, lineHeight: 1.5 }}>{sub}</div>
      </button>
    );
  };

  const applyLegacyDemoData = () => {
    setProfile((current) => ({ ...current, ...LEGACY_TESTING_DEMO }));
  };

  return (
    <>
      <style>{`
        .tm-zip-input {
          width: 100%;
          max-width: 520px;
          color: #2b3437;
          font-size: 12px;
          font-family: Inter, sans-serif;
        }
        .tm-zip-input::file-selector-button {
          margin-right: 10px;
          border: 1px solid rgba(48, 209, 88, 0.6);
          background: rgba(48, 209, 88, 0.18);
          color: #0f5132;
          border-radius: 6px;
          padding: 6px 10px;
          cursor: pointer;
          font-weight: 600;
        }
        .tm-zip-input::-webkit-file-upload-button {
          margin-right: 10px;
          border: 1px solid rgba(48, 209, 88, 0.6);
          background: rgba(48, 209, 88, 0.18);
          color: #0f5132;
          border-radius: 6px;
          padding: 6px 10px;
          cursor: pointer;
          font-weight: 600;
        }
      `}</style>
      <SHdr n={1} title="Application Profile" sub="Pick a flow, fill in metadata, and (depending on the flow) add ZIP/context notes or open the stencil designer. AI suggestions are optional." />

      <div style={C.card}>
        <div style={{ color: "#436086", fontFamily: "monospace", fontSize: 12, marginBottom: 10 }}>FLOW</div>
        <p style={{ color: "#586064", fontSize: 12, marginBottom: 12, lineHeight: 1.5 }}>
          Pick the flow that matches what you have. <strong style={{ color: "#2b3437" }}>Legacy</strong> reverse-engineers components from ZIP + context notes. <strong style={{ color: "#2b3437" }}>New</strong> opens a drag-and-drop stencil designer where you compose the architecture from typed components.
        </p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {flowTile("legacy", "Legacy / Production", "Reverse-engineer modules and components from an uploaded ZIP and context notes.", "#ff9f0a")}
          {flowTile("new", "New / In Development", "Design the architecture from typed components in the stencil designer; threats and security requirements attach automatically.", "#436086")}
          {flowTile("redesign", "Redesign / Major Update", "Hybrid — start from ZIP/context and free-edit modules + DFD as you redesign.", "#a78bfa")}
        </div>
      </div>

      {isNew && (
        <div style={{ ...C.card, borderColor: "#436086" }}>
          <div style={{ color: "#436086", fontFamily: "monospace", fontSize: 12, marginBottom: 10 }}>STENCIL DESIGNER</div>
          <p style={{ color: "#586064", fontSize: 12, marginBottom: 12, lineHeight: 1.5 }}>
            Fill in the application metadata below, then click <strong style={{ color: "#2b3437" }}>Continue</strong> to open the stencil designer. Drag typed components onto the canvas (Login, Database, Payment Gateway, Queue …) and connect them — each stencil instantly attaches its STRIDE threats and security requirements from the built-in library. Saving the diagram returns you to the wizard at Modules so you can continue with DFD, STRIDE, DREAD, and Report.
          </p>
          <Btn type="button" onClick={onOpenDesigner}>Open stencil designer now</Btn>
        </div>
      )}

      {isLegacy && (
      <div style={{ ...C.card, borderColor: "rgba(48, 209, 88, 0.35)" }}>
        <div style={{ color: "#30d158", fontFamily: "monospace", fontSize: 12, marginBottom: 10 }}>UPLOAD .ZIP FOLDER + CONTEXT NOTES</div>
        <p style={{ color: "#586064", fontSize: 12, marginBottom: 12, lineHeight: 1.5 }}>
          Upload a <strong style={{ color: "#30d158" }}>.zip</strong> folder of your project (source only; large folders like <code style={{ color: "#586064" }}>node_modules</code> are skipped). We build a file tree and read key manifests (package.json, README, Docker, etc.) in your browser, so nothing is uploaded to a server. This parsing does not need an API key.
        </p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
          <input
            ref={zipInputRef}
            className="tm-zip-input"
            type="file"
            accept=".zip,application/zip"
            onChange={onZipSelected}
            disabled={zipLoading}
            style={{ maxWidth: "100%" }}
          />
          {zipLoading && <span style={{ color: "#30d158", fontSize: 12, fontFamily: "monospace" }}>Reading ZIP…</span>}
          {profile.zipFileName && (
            <Btn type="button" onClick={clearZip} variant="destructive" className="h-8 px-3 text-xs" disabled={zipLoading}>
              Remove ZIP
            </Btn>
          )}
        </div>
        {profile.zipFileName && zipMeta && (
          <div style={{ color: "#586064", fontSize: 12, marginBottom: 10, fontFamily: "monospace" }}>
            {profile.zipFileName} · {zipMeta.pathCount} paths · {Math.round(zipMeta.bytesInZip / 1024)} KB archive · {zipMeta.snippetCount} text extracts
            {zipMeta.truncated ? " · output truncated" : ""}
          </div>
        )}
        <Err msg={zipErr} />
        <Fld label="Describe the project context (architecture, sensitive data, deployment, assumptions)" span>
          <Txt
            value={profile.modelContextNotes}
            onChange={(event) => update("modelContextNotes", event.target.value)}
            placeholder="e.g. Monorepo: React SPA + Node API + worker consuming SQS. Users are B2B; PII in Postgres; JWT auth; no mobile clients yet…"
            style={{ height: 88 }}
          />
        </Fld>
      </div>
      )}

      <div style={C.card}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
          <div style={{ color: "#436086", fontFamily: "monospace", fontSize: 12 }}>APPLICATION METADATA</div>
          <Btn type="button" onClick={applyLegacyDemoData} className="h-8 px-3 text-xs">Load demo data (testing)</Btn>
        </div>
        <div style={C.g2}>
          <Fld label="Application Name *"><Inp value={profile.name} onChange={(event) => update("name", event.target.value)} placeholder="e.g. LoanPro Banking Portal" /></Fld>
          <Fld label="Application Type">
            <Sel value={profile.type} onChange={(event) => update("type", event.target.value)}>
              {["Web Application", "Mobile App", "API / Microservice", "Desktop Application", "IoT System", "Embedded System"].map((item) => <option key={item}>{item}</option>)}
            </Sel>
          </Fld>
          <Fld label="Deployment Environment">
            <Sel value={profile.deployEnv} onChange={(event) => update("deployEnv", event.target.value)}>
              {["Cloud (Public)", "Cloud (Private)", "On-Premises", "Hybrid", "Edge / CDN"].map((item) => <option key={item}>{item}</option>)}
            </Sel>
          </Fld>
          <Fld label="Application Status">
            <Sel value={profile.appStatus} onChange={(event) => update("appStatus", event.target.value)}>
              <option value="legacy">Legacy / Production (no prior TM)</option>
              <option value="new">New / In Development</option>
              <option value="redesign">Redesign / Major Update</option>
            </Sel>
          </Fld>
          <Fld label="Technology Stack" span><Inp value={profile.techStack} onChange={(event) => update("techStack", event.target.value)} placeholder="e.g. React, Node.js, PostgreSQL, Redis, AWS ECS" /></Fld>
          <Fld label="Business Criticality">
            <Sel value={profile.criticality} onChange={(event) => update("criticality", event.target.value)}>
              {["High — Mission critical / PII / Financial", "Medium — Internal tooling / moderate impact", "Low — Informational / low sensitivity"].map((item) => <option key={item}>{item}</option>)}
            </Sel>
          </Fld>
          <Fld label="Primary Compliance Scope"><Inp value={profile.compliance} onChange={(event) => update("compliance", event.target.value)} placeholder="e.g. PCI-DSS, RBI Guidelines, ISO 27001, GDPR" /></Fld>
          <Fld label="Functional Description" span><Txt value={profile.description} onChange={(event) => update("description", event.target.value)} placeholder="Describe what the app does, who uses it, and what sensitive data it handles..." style={{ height: 90 }} /></Fld>
        </div>
      </div>
    </>
  );
}

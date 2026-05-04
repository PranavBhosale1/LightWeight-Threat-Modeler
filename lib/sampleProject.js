import { injectFromLibrary, reseedLibraryThreats } from "../componentEngine.js";
import {
  createModule,
  normalizeModule,
  defaultDreadScores,
  createThreatIdFactory,
  strideMeta
} from "../threatModeler/modelHelpers.js";
import { buildSnapshot } from "./projectPersistence.js";

function sampleDread() {
  return { damage: 7, reproducibility: 6, exploitability: 6, affectedUsers: 5, discoverability: 5 };
}

export function getSampleSnapshot() {
  let m1 = normalizeModule({
    ...createModule("m-sample-1"),
    name: "Authentication API",
    componentType: "auth.login",
    componentTypeSource: "user"
  });
  m1 = injectFromLibrary(m1);

  let m2 = normalizeModule({
    ...createModule("m-sample-2"),
    name: "HR Database",
    componentType: "data.database",
    componentTypeSource: "user"
  });
  m2 = injectFromLibrary(m2);

  const idFactory = createThreatIdFactory([]);
  let threats = reseedLibraryThreats({
    existingThreats: [],
    modules: [m1, m2],
    idFactory,
    strideMeta,
    dreadDefaults: defaultDreadScores()
  });

  threats = threats.map((t, i) => ({
    ...t,
    status: t.source === "library" && i < 10 ? "applicable" : t.status === "library" ? "review" : t.status,
    dreadScores: t.source === "library" && i < 10 ? sampleDread() : t.dreadScores
  }));

  const profile = {
    name: "Sample: HR Portal",
    type: "Web Application",
    deployEnv: "Cloud (Public)",
    appStatus: "legacy",
    techStack: "React, Node.js, PostgreSQL",
    description: "Sample internal HR portal for policies, PTO, and employee records.",
    criticality: "Medium — Internal tooling / moderate impact",
    compliance: "GDPR (employee data)",
    repoUrl: "",
    repoBranch: "",
    repoContext: "",
    zipFileName: "",
    zipDerivedContext: "",
    modelContextNotes: "Demo project — explore DFD, STRIDE, DREAD, and report without uploading a ZIP."
  };

  const trustBoundaries = [
    {
      id: "tb-sample-1",
      name: "Corporate network",
      description: "VPN / office access only",
      color: "#ff9f0a",
      moduleIds: ["m-sample-1", "m-sample-2"]
    }
  ];

  return buildSnapshot({
    profile,
    modules: [m1, m2],
    dfd: {
      summary: "Sample posture: authentication and database are primary trust anchors; enforce TLS, least-privilege DB roles, and structured auth logging.",
      trustBoundaries: [],
      highRiskFlows: [{ from: "End User", to: "Authentication API", risk: "Credential attacks at perimeter", strideCategories: ["S", "T"] }],
      securityNotes: ["This is canned demo data — replace with your own model."]
    },
    trustBoundaries,
    threats,
    questionnaireAnswers: {},
    mitigations: {},
    dfdMode: "auto",
    step: 4
  });
}


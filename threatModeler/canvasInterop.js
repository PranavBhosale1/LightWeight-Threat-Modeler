import { buildDfdElements } from "./modelHelpers.js";

const NODE_STYLE = {
  entity: { w: 136, h: 52, color: "#436086" },
  process: { w: 144, h: 64, color: "#4ade80" },
  store: { w: 144, h: 52, color: "#a78bfa" },
  boundary: { w: 230, h: 160, color: "#ff9f0a" }
};

function createNode(id, type, label, x, y, extra = {}) {
  const style = NODE_STYLE[type] || NODE_STYLE.process;
  return {
    id,
    type,
    label,
    x,
    y,
    w: style.w,
    h: style.h,
    color: style.color,
    threats: [],
    analyzing: false,
    ...extra
  };
}

function nodeCenterInsideBoundary(node, boundary) {
  const xMin = boundary.x - boundary.w / 2;
  const xMax = boundary.x + boundary.w / 2;
  const yMin = boundary.y - boundary.h / 2;
  const yMax = boundary.y + boundary.h / 2;
  return node.x >= xMin && node.x <= xMax && node.y >= yMin && node.y <= yMax;
}

function fallbackEdgeLabel(flow, moduleByName) {
  if (flow.label && String(flow.label).trim()) return flow.label;
  if (moduleByName.has(flow.from) && !moduleByName.has(flow.to)) return "write";
  if (!moduleByName.has(flow.from) && moduleByName.has(flow.to)) return "request";
  return "data";
}

export function normalizeCanvasModel(model) {
  if (!model || typeof model !== "object") return null;
  return {
    appName: model.appName || "",
    appDesc: model.appDesc || "",
    appStack: model.appStack || "",
    nodes: Array.isArray(model.nodes) ? model.nodes.map((n) => ({ ...n })) : [],
    edges: Array.isArray(model.edges) ? model.edges.map((e) => ({ ...e })) : []
  };
}

export function buildCanvasModelFromModules(profile, modules, trustBoundaries = []) {
  const { validModules, entities, stores, flows } = buildDfdElements(modules, trustBoundaries);
  const nodes = [];
  const edges = [];
  const moduleByName = new Map(validModules.map((m) => [m.name, m]));
  const entityByName = new Map(entities.map((e) => [e.name, e]));
  const storeByName = new Map(stores.map((s) => [s.name, s]));

  const processPos = new Map();
  validModules.forEach((m, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = 430 + col * 220;
    const y = 160 + row * 120;
    processPos.set(m.id, { x, y });
    nodes.push(createNode(`p-${m.id}`, "process", m.name, x, y));
  });

  entities.forEach((e, i) => {
    nodes.push(createNode(`ent-${i}`, "entity", e.name, 120, 120 + i * 90));
  });

  stores.forEach((s, i) => {
    nodes.push(createNode(`store-${i}`, "store", s.name, 860, 120 + i * 90));
  });

  trustBoundaries.forEach((b, i) => {
    const boundaryModules = validModules.filter((m) => (b.moduleIds || []).includes(m.id));
    if (!boundaryModules.length) return;
    const centers = boundaryModules
      .map((m) => processPos.get(m.id))
      .filter(Boolean);
    if (!centers.length) return;

    const minX = Math.min(...centers.map((c) => c.x));
    const maxX = Math.max(...centers.map((c) => c.x));
    const minY = Math.min(...centers.map((c) => c.y));
    const maxY = Math.max(...centers.map((c) => c.y));
    const w = Math.max(240, (maxX - minX) + 220);
    const h = Math.max(170, (maxY - minY) + 130);

    nodes.push(createNode(`tb-${i}`, "boundary", b.name || `Boundary ${i + 1}`, (minX + maxX) / 2, (minY + maxY) / 2, {
      w,
      h,
      color: b.color || NODE_STYLE.boundary.color
    }));
  });

  const idByLabel = new Map(nodes.map((n) => [n.label, n.id]));
  flows.forEach((flow, i) => {
    const fromId = idByLabel.get(flow.from);
    const toId = idByLabel.get(flow.to);
    if (!fromId || !toId) return;
    edges.push({
      id: `edge-${i}`,
      from: fromId,
      to: toId,
      label: fallbackEdgeLabel(flow, moduleByName),
      crossesBoundary: !!flow.crossesBoundary,
      boundaryNames: flow.boundaryNames || []
    });
  });

  return normalizeCanvasModel({
    appName: profile?.name || "",
    appDesc: [profile?.modelContextNotes, profile?.description].filter((s) => s?.trim()).join("\n\n"),
    appStack: profile?.techStack || "",
    nodes,
    edges
  });
}

export function canvasTrustBoundariesToWizard(canvasModel, modules) {
  if (!canvasModel?.nodes?.length) return [];
  const boundaries = canvasModel.nodes.filter((n) => n.type === "boundary");
  const processes = canvasModel.nodes.filter((n) => n.type === "process");
  if (!boundaries.length || !processes.length) return [];

  const moduleByName = new Map(
    modules
      .filter((m) => m.name?.trim())
      .map((m) => [m.name.trim().toLowerCase(), m.id])
  );

  return boundaries.map((boundary, index) => {
    const moduleIds = processes
      .filter((proc) => nodeCenterInsideBoundary(proc, boundary))
      .map((proc) => moduleByName.get(proc.label.trim().toLowerCase()))
      .filter(Boolean);

    return {
      id: `tb-canvas-${index}-${Date.now()}`,
      name: boundary.label || `Canvas Boundary ${index + 1}`,
      description: "Imported from interactive canvas",
      color: boundary.color || NODE_STYLE.boundary.color,
      moduleIds: [...new Set(moduleIds)],
      source: "canvas"
    };
  }).filter((b) => b.moduleIds.length > 0);
}

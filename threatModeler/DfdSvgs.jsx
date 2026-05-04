import { buildDfdElements, parseCsv } from "./modelHelpers.js";

function wrapText(value = "", maxCharsPerLine = 24, maxLines = 2) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return [""];
  const words = text.split(" ");
  const lines = [];
  let current = "";

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length <= maxCharsPerLine) {
      current = next;
      continue;
    }
    if (current) lines.push(current);
    current = word;
    if (lines.length === maxLines - 1) break;
  }
  if (lines.length < maxLines && current) lines.push(current);

  if (lines.length > maxLines) lines.length = maxLines;
  if (lines.length === maxLines && words.join(" ").length > lines.join(" ").length) {
    lines[maxLines - 1] = `${lines[maxLines - 1].slice(0, Math.max(0, maxCharsPerLine - 1))}...`;
  }
  return lines.length ? lines : [text.slice(0, maxCharsPerLine)];
}

function DFDNode({ node }) {
  const cx = node.x + node.w / 2;
  const cy = node.y + node.h / 2;
  const labelLines = wrapText(
    node.label,
    node.type === "process" ? 28 : node.type === "store" ? 24 : 22,
    2
  );
  const textPrimary = "#2b3437";
  const textSecondary = "#586064";

  if (node.type === "entity") {
    return (
      <g>
        <rect x={node.x} y={node.y} width={node.w} height={node.h} rx={4} fill="#f7fbff" stroke="#436086" strokeWidth={1.5}>
          <title>{node.label}</title>
        </rect>
        <text x={cx} y={cy - 10} textAnchor="middle" fill={textSecondary} fontSize={9} fontFamily="monospace">EXT ENTITY</text>
        <text x={cx} y={cy + 2} textAnchor="middle" fill={textPrimary} fontSize={12} fontFamily="monospace">
          <title>{node.label}</title>
          {labelLines.map((line, index) => (
            <tspan key={`${node.id}-entity-${index}`} x={cx} dy={index === 0 ? 0 : 12}>
              {line}
            </tspan>
          ))}
        </text>
      </g>
    );
  }

  if (node.type === "process") {
    return (
      <g>
        <rect x={node.x} y={node.y} width={node.w} height={node.h} rx={node.context ? 16 : 22} fill="#f2fff6" stroke="#34c759" strokeWidth={1.5}>
          <title>{node.label}</title>
        </rect>
        <text x={cx} y={cy - 12} textAnchor="middle" fill={textSecondary} fontSize={9} fontFamily="monospace">{node.context ? "SYSTEM" : "PROCESS"}</text>
        <text x={cx} y={cy} textAnchor="middle" fill={textPrimary} fontSize={12} fontFamily="monospace">
          <title>{node.label}</title>
          {labelLines.map((line, index) => (
            <tspan key={`${node.id}-process-${index}`} x={cx} dy={index === 0 ? 0 : 12}>
              {line}
            </tspan>
          ))}
        </text>
      </g>
    );
  }

  return (
    <g>
      <rect x={node.x} y={node.y + 6} width={node.w} height={node.h - 12} fill="#fbf7ff" stroke="none" />
      <line x1={node.x} y1={node.y} x2={node.x + node.w} y2={node.y} stroke="#a78bfa" strokeWidth={2} />
      <line x1={node.x} y1={node.y + node.h} x2={node.x + node.w} y2={node.y + node.h} stroke="#a78bfa" strokeWidth={2} />
      <text x={cx} y={cy - 10} textAnchor="middle" fill={textSecondary} fontSize={9} fontFamily="monospace">DATA STORE</text>
      <text x={cx} y={cy + 2} textAnchor="middle" fill={textPrimary} fontSize={12} fontFamily="monospace">
        <title>{node.label}</title>
        {labelLines.map((line, index) => (
          <tspan key={`${node.id}-store-${index}`} x={cx} dy={index === 0 ? 0 : 12}>
            {line}
          </tspan>
        ))}
      </text>
    </g>
  );
}

function FlowLabel({ x, y, text, warning = false }) {
  const safeText = String(text || "").trim();
  if (!safeText) return null;
  const lines = wrapText(safeText, warning ? 26 : 32, 2);
  const widest = lines.reduce((m, line) => Math.max(m, line.length), 0);
  const width = Math.max(54, widest * 6.4 + 12);
  const height = 8 + lines.length * 12;
  return (
    <g>
      <rect
        x={x - width / 2}
        y={y - 10}
        width={width}
        height={height}
        rx={3}
        fill="rgba(248,249,250,0.96)"
        stroke={warning ? "rgba(251,191,36,0.55)" : "rgba(115,124,127,0.45)"}
      >
        <title>{safeText}</title>
      </rect>
      <text x={x} y={y} textAnchor="middle" fill={warning ? "#d97706" : "#2b3437"} fontSize={10} fontFamily="monospace">
        <title>{safeText}</title>
        {lines.map((line, index) => (
          <tspan key={`${line}-${index}`} x={x} dy={index === 0 ? 0 : 12}>
            {line}
          </tspan>
        ))}
      </text>
    </g>
  );
}

export function ContextDFDCanvas({ profile, modules, svgId }) {
  const { entities, validModules } = buildDfdElements(modules, []);
  const W = 840;
  const sideCount = Math.max(Math.ceil(entities.length / 2), 1);
  const H = Math.max(360, sideCount * 96 + 80);
  const processNode = { id: "app-context", label: profile.name || "Application", type: "process", x: W / 2 - 130, y: H / 2 - 38, w: 260, h: 76, context: true };
  const leftCount = Math.ceil(entities.length / 2);
  const leftEntities = entities.slice(0, leftCount);
  const rightEntities = entities.slice(leftCount);
  const entityNodes = [
    ...leftEntities.map((entity, index) => ({ ...entity, label: entity.name, type: "entity", side: "left", sideIndex: index, sideTotal: leftEntities.length, x: 18, y: 34 + index * 92, w: 170, h: 56 })),
    ...rightEntities.map((entity, index) => ({ ...entity, label: entity.name, type: "entity", side: "right", sideIndex: index, sideTotal: rightEntities.length, x: W - 188, y: 34 + index * 92, w: 170, h: 56 }))
  ];
  const contextFlowsByEntity = {};

  validModules.forEach((module) => {
    const moduleEntities = parseCsv(module.externalEntities);
    const inputs = parseCsv(module.inputs);
    const outputs = parseCsv(module.outputs);
    moduleEntities.forEach((entityName, index) => {
      if (!contextFlowsByEntity[entityName]) {
        contextFlowsByEntity[entityName] = { toSystem: [], fromSystem: [] };
      }
      contextFlowsByEntity[entityName].toSystem.push(inputs[index] || inputs[0] || "request");
      contextFlowsByEntity[entityName].fromSystem.push(outputs[index] || outputs[0] || "response");
    });
  });

  const compactLabel = (labels = [], fallback) => {
    const uniqueLabels = [...new Set(labels.map((label) => String(label || "").trim()).filter(Boolean))];
    if (!uniqueLabels.length) return fallback;
    const shortlist = uniqueLabels.slice(0, 2).join(" / ");
    return shortlist.length > 24 ? `${shortlist.slice(0, 21)}...` : shortlist;
  };

  const flowLabel = (toSystem, fromSystem) => {
    return `${toSystem} <-> ${fromSystem}`;
  };

  return (
    <svg id={svgId} viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", background: "#f8f9fa", borderRadius: 8, border: "1px solid #737c7f" }}>
      <defs>
        <marker id={`${svgId}-arr`} markerWidth={8} markerHeight={8} refX={6} refY={3} orient="auto-start-reverse">
          <path d="M0,0 L0,6 L8,3 z" fill="#737c7f" />
        </marker>
      </defs>
      <rect x={processNode.x - 18} y={processNode.y - 16} width={processNode.w + 36} height={processNode.h + 32} rx={8} fill="none" stroke="#ff9f0a" strokeWidth={1} strokeDasharray="8,4" opacity={0.45} />
      <text x={processNode.x - 14} y={processNode.y - 20} fill="#ff9f0a" fontSize={9} fontFamily="monospace">LEVEL-0 CONTEXT</text>

      {entityNodes.map((node) => {
        const yCenter = node.y + node.h / 2;
        const labels = contextFlowsByEntity[node.label] || { toSystem: [], fromSystem: [] };
        const toSystemLabel = compactLabel(labels.toSystem, "Request");
        const fromSystemLabel = compactLabel(labels.fromSystem, "Response");
        const isLeft = node.side !== "right";
        const entityAnchor = isLeft ? node.x + node.w : node.x;
        const processAnchor = isLeft ? processNode.x : processNode.x + processNode.w;
        const sideTotal = Math.max(node.sideTotal || 1, 1);
        const ratio = sideTotal === 1 ? 0.5 : node.sideIndex / (sideTotal - 1);
        const processPortY = processNode.y + 8 + ratio * Math.max(processNode.h - 16, 1);
        const mx = (entityAnchor + processAnchor) / 2;
        const labelY = (yCenter + processPortY) / 2 - 4;
        const smoothOut = isLeft ? 26 : -26;
        const smoothIn = isLeft ? -22 : 22;

        return (
          <g key={`${node.id}-edge`}>
            <path
              d={`M${entityAnchor},${yCenter} C${entityAnchor + smoothOut},${yCenter} ${processAnchor + smoothIn},${processPortY} ${processAnchor},${processPortY}`}
              fill="none"
              stroke="#737c7f"
              strokeWidth={1.5}
              markerStart={`url(#${svgId}-arr)`}
              markerEnd={`url(#${svgId}-arr)`}
            >
              <title>{`${node.label} <-> ${processNode.label}`}</title>
            </path>
            <FlowLabel x={mx} y={labelY} text={flowLabel(toSystemLabel, fromSystemLabel)} />
          </g>
        );
      })}

      {[...entityNodes, processNode].map((node) => <DFDNode key={node.id} node={node} />)}
    </svg>
  );
}

export function Level1DFDCanvas({ modules, trustBoundaries, svgId }) {
  const { validModules, entities, stores, flows } = buildDfdElements(modules, trustBoundaries);
  const W = 900;
  const H = Math.max(520, Math.max(entities.length, stores.length, Math.ceil(validModules.length / 2), 1) * 126 + 110);
  const NW = 170;
  const NH = 56;
  const PW = 220;
  const PH = 66;

  const entityNodes = entities.map((entity, index) => ({ id: entity.id, label: entity.name, type: "entity", x: 16, y: 40 + index * 82, w: NW, h: NH }));
  const storeNodes = stores.map((store, index) => ({ id: store.id, label: store.name, type: "store", x: W - NW - 16, y: 40 + index * 82, w: NW, h: NH }));
  const processNodes = validModules.map((module, index) => ({
    id: module.id,
    label: module.name,
    type: "process",
    x: 235 + (index % 2) * 250,
    y: 34 + Math.floor(index / 2) * 116,
    w: PW,
    h: PH
  }));

  const boundaryRects = trustBoundaries.map((boundary) => {
    const nodes = processNodes.filter((node) => (boundary.moduleIds || []).includes(node.id));
    if (!nodes.length) return null;

    const minX = Math.min(...nodes.map((node) => node.x)) - 24;
    const maxX = Math.max(...nodes.map((node) => node.x + node.w)) + 24;
    const minY = Math.min(...nodes.map((node) => node.y)) - 18;
    const maxY = Math.max(...nodes.map((node) => node.y + node.h)) + 18;

    return {
      ...boundary,
      x: minX,
      y: minY,
      w: maxX - minX,
      h: maxY - minY
    };
  }).filter(Boolean);

  const edges = [];
  validModules.forEach((module) => {
    const process = processNodes.find((node) => node.id === module.id);
    if (!process) return;

    parseCsv(module.externalEntities).forEach((entity, index) => {
      const source = entityNodes.find((node) => node.label === entity);
      if (!source) return;
      const flow = flows.find((item) => item.moduleId === module.id && item.from === entity && item.to === module.name && item.kind === "dataFlow" && item.label === (parseCsv(module.inputs)[index] || parseCsv(module.inputs)[0] || "request"))
        || flows.find((item) => item.moduleId === module.id && item.from === entity && item.to === module.name);
      edges.push({ id: `${source.id}-${process.id}-${index}`, from: source, to: process, label: flow?.label || "data", crossesBoundary: flow?.crossesBoundary, boundaryNames: flow?.boundaryNames || [] });
    });

    parseCsv(module.dataStores).forEach((store, index) => {
      const target = storeNodes.find((node) => node.label === store);
      if (!target) return;
      const flow = flows.find((item) => item.moduleId === module.id && item.from === module.name && item.to === store && item.kind === "dataFlow" && item.label === (parseCsv(module.outputs)[index] || parseCsv(module.outputs)[0] || "r/w"))
        || flows.find((item) => item.moduleId === module.id && item.from === module.name && item.to === store);
      edges.push({ id: `${process.id}-${target.id}-${index}`, from: process, to: target, label: flow?.label || "r/w", crossesBoundary: flow?.crossesBoundary, boundaryNames: flow?.boundaryNames || [] });
    });
  });

  return (
    <svg id={svgId} viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", background: "#f8f9fa", borderRadius: 8, border: "1px solid #737c7f" }}>
      <defs>
        <marker id={`${svgId}-arr`} markerWidth={8} markerHeight={8} refX={6} refY={3} orient="auto">
          <path d="M0,0 L0,6 L8,3 z" fill="#737c7f" />
        </marker>
      </defs>

      {boundaryRects.map((boundary) => (
        <g key={boundary.id}>
          <rect x={boundary.x} y={boundary.y} width={boundary.w} height={boundary.h} rx={6} fill="none" stroke={boundary.color || "#ff9f0a"} strokeWidth={1.2} strokeDasharray="8,4" opacity={0.6} />
          <text x={boundary.x + 6} y={boundary.y - 6} fill={boundary.color || "#ff9f0a"} fontSize={9} fontFamily="monospace">{boundary.name || "TRUST BOUNDARY"}</text>
        </g>
      ))}

      {edges.map((edge) => {
        const startOnRight = edge.from.type !== "process";
        const endOnLeft = edge.to.type === "process";
        const x1 = startOnRight ? edge.from.x + edge.from.w : edge.from.x + edge.from.w;
        const y1 = edge.from.y + edge.from.h / 2;
        const x2 = endOnLeft ? edge.to.x : edge.to.x;
        const y2 = edge.to.y + edge.to.h / 2;
        const mx = (x1 + x2) / 2;
        const stroke = edge.crossesBoundary ? "#ff9f0a" : "#737c7f";

        return (
          <g key={edge.id}>
            <path d={`M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`} fill="none" stroke={stroke} strokeWidth={edge.crossesBoundary ? 2 : 1.5} strokeDasharray={edge.crossesBoundary ? "0" : "4,3"} markerEnd={`url(#${svgId}-arr)`}>
              <title>
                {`${edge.from.label} -> ${edge.to.label}${edge.crossesBoundary && edge.boundaryNames?.length ? ` (Boundary: ${edge.boundaryNames.join(", ")})` : ""}`}
              </title>
            </path>
            <FlowLabel x={mx} y={(y1 + y2) / 2 - 6} text={edge.label} warning={edge.crossesBoundary} />
          </g>
        );
      })}

      {[...entityNodes, ...processNodes, ...storeNodes].map((node) => <DFDNode key={node.id} node={node} />)}

      <g transform={`translate(16,${H - 24})`}>
        <rect x={0} y={0} width={10} height={10} rx={1} fill="none" stroke="#436086" strokeWidth={1} />
        <text x={14} y={8} fill="#586064" fontSize={9}>External Entity</text>
        <rect x={112} y={0} width={10} height={10} rx={5} fill="none" stroke="#4ade80" strokeWidth={1} />
        <text x={126} y={8} fill="#586064" fontSize={9}>Process</text>
        <line x1={198} y1={0} x2={211} y2={0} stroke="#a78bfa" strokeWidth={2} />
        <line x1={198} y1={10} x2={211} y2={10} stroke="#a78bfa" strokeWidth={2} />
        <text x={215} y={8} fill="#586064" fontSize={9}>Data Store</text>
        <line x1={300} y1={5} x2={318} y2={5} stroke="#ff9f0a" strokeWidth={2} />
        <text x={324} y={8} fill="#586064" fontSize={9}>Crosses Trust Boundary</text>
      </g>
    </svg>
  );
}

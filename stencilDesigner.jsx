import { useCallback, useMemo, useRef, useState, useEffect } from "react";
import ReactFlow, {
  Background,
  Controls,
  Handle,
  Position,
  ReactFlowProvider,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  useReactFlow
} from "reactflow";
import "reactflow/dist/style.css";

import { COMPONENT_LIBRARY, componentsByCategory, getComponent, injectFromLibrary } from "./componentEngine.js";

const STRIDE_COLORS = {
  S: "#f59e0b",
  T: "#ef4444",
  R: "#8b5cf6",
  I: "#06b6d4",
  D: "#f97316",
  E: "#ec4899"
};

const STENCIL_MIME = "application/x-threatmodeler-stencil";

const PALETTE_GROUPS = componentsByCategory();

const C = {
  shell: { display: "flex", flex: 1, height: "100%", minHeight: 0, background: "#050810", color: "#e2e8f0", fontFamily: "'DM Sans',sans-serif" },
  sidebar: { width: 240, flexShrink: 0, background: "#08101e", borderRight: "1px solid #1a2540", overflowY: "auto", padding: "12px 12px 24px" },
  canvasWrap: { flex: 1, position: "relative", minWidth: 0, minHeight: 0, background: "#050810" },
  inspector: { width: 360, flexShrink: 0, background: "#08101e", borderLeft: "1px solid #1a2540", overflowY: "auto", padding: "14px 14px 24px" },
  groupHdr: { color: "#475569", fontFamily: "monospace", fontSize: 10, letterSpacing: 1, margin: "12px 0 6px", textTransform: "uppercase" },
  stencil: { display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", marginBottom: 6, borderRadius: 6, border: "1px solid #1a2540", cursor: "grab", background: "#0d1421" },
  card: { background: "#0d1421", border: "1px solid #1a2540", borderRadius: 8, padding: 12, marginBottom: 12 },
  pill: (color) => ({ display: "inline-block", padding: "1px 6px", borderRadius: 3, fontSize: 10, fontFamily: "monospace", color, border: `1px solid ${color}66`, background: `${color}14`, marginRight: 4, marginBottom: 4 }),
  inp: { width: "100%", background: "#080e1a", border: "1px solid #1a2540", borderRadius: 5, padding: "6px 8px", color: "#e2e8f0", fontSize: 12, outline: "none", boxSizing: "border-box", fontFamily: "'DM Sans',sans-serif" }
};

function StencilNode({ data, selected }) {
  const color = data.color || "#00b4d8";
  return (
    <div
      style={{
        background: `${color}15`,
        border: `${selected ? 2 : 1.5}px solid ${selected ? "#fff" : color}`,
        borderRadius: data.kind === "process" ? 24 : data.kind === "store" ? 4 : 6,
        padding: "8px 14px",
        minWidth: 140,
        textAlign: "center",
        fontFamily: "'DM Sans',sans-serif"
      }}
    >
      <Handle type="target" position={Position.Left} style={{ background: color, width: 8, height: 8 }} />
      <div style={{ color, fontSize: 9, fontFamily: "monospace", letterSpacing: 1, textTransform: "uppercase" }}>{data.category || "Component"}</div>
      <div style={{ color: "#e2e8f0", fontSize: 13, fontWeight: 600, marginTop: 2 }}>{data.label}</div>
      <Handle type="source" position={Position.Right} style={{ background: color, width: 8, height: 8 }} />
    </div>
  );
}

const NODE_TYPES = { stencil: StencilNode };

let nodeCounter = 0;
const nextNodeId = () => `node-${Date.now()}-${++nodeCounter}`;

function PaletteSidebar() {
  const onDragStart = (event, componentId) => {
    event.dataTransfer.setData(STENCIL_MIME, componentId);
    event.dataTransfer.effectAllowed = "move";
  };

  return (
    <div style={C.sidebar}>
      <div style={{ color: "#00b4d8", fontFamily: "monospace", fontSize: 11, letterSpacing: 1.5, marginBottom: 6 }}>STENCIL PALETTE</div>
      <p style={{ color: "#475569", fontSize: 11, lineHeight: 1.5, marginBottom: 4 }}>Drag a component onto the canvas. Threats and security requirements attach automatically.</p>
      {PALETTE_GROUPS.map((group) => (
        <div key={group.category}>
          <div style={C.groupHdr}>{group.category}</div>
          {group.items.map((c) => (
            <div
              key={c.id}
              draggable
              onDragStart={(event) => onDragStart(event, c.id)}
              style={{ ...C.stencil, borderLeft: `3px solid ${c.color || "#00b4d8"}` }}
              title={`${c.threats?.length || 0} threats · ${c.securityRequirements?.length || 0} requirements`}
            >
              <div style={{ width: 8, height: 8, borderRadius: 4, background: c.color || "#00b4d8" }} />
              <div style={{ flex: 1 }}>
                <div style={{ color: "#e2e8f0", fontSize: 12 }}>{c.label}</div>
                <div style={{ color: "#475569", fontSize: 10, fontFamily: "monospace" }}>{c.threats?.length || 0}t · {c.securityRequirements?.length || 0}r</div>
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function Inspector({ node, onUpdate, onDelete }) {
  if (!node) {
    return (
      <div style={C.inspector}>
        <div style={{ color: "#00b4d8", fontFamily: "monospace", fontSize: 11, letterSpacing: 1.5, marginBottom: 8 }}>INSPECTOR</div>
        <p style={{ color: "#475569", fontSize: 12, lineHeight: 1.5 }}>
          Select a component on the canvas to view its STRIDE threats and security requirements drawn from the library.
        </p>
        <div style={{ marginTop: 14, color: "#334155", fontSize: 11, fontFamily: "monospace" }}>
          {COMPONENT_LIBRARY.components.length} typed components in library.
        </div>
      </div>
    );
  }

  const data = node.data || {};
  const component = getComponent(data.componentId);
  if (!component) return <div style={C.inspector}>Unknown component.</div>;

  const updateRequirementStatus = (instanceId, status) => {
    onUpdate(node.id, {
      securityRequirements: (data.securityRequirements || []).map((r) => r.instanceId === instanceId ? { ...r, status } : r)
    });
  };

  const updateRequirementJira = (instanceId, jiraKey) => {
    onUpdate(node.id, {
      securityRequirements: (data.securityRequirements || []).map((r) => r.instanceId === instanceId ? { ...r, jiraKey } : r)
    });
  };

  const updateField = (key, value) => onUpdate(node.id, { [key]: value });

  return (
    <div style={C.inspector}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, gap: 6 }}>
        <div>
          <div style={{ color: component.color, fontFamily: "monospace", fontSize: 10, letterSpacing: 1, textTransform: "uppercase" }}>{component.category}</div>
          <div style={{ color: "#e2e8f0", fontSize: 16, fontWeight: 700 }}>{data.label || component.label}</div>
        </div>
        <button onClick={() => onDelete(node.id)} style={{ background: "transparent", border: "1px solid #ef4444", color: "#ef4444", padding: "4px 8px", borderRadius: 4, cursor: "pointer", fontSize: 11 }}>Delete</button>
      </div>

      <div style={C.card}>
        <div style={{ color: "#94a3b8", fontFamily: "monospace", fontSize: 10, marginBottom: 6 }}>NAME</div>
        <input style={C.inp} value={data.label || ""} onChange={(event) => updateField("label", event.target.value)} />
        <div style={{ color: "#94a3b8", fontFamily: "monospace", fontSize: 10, marginBottom: 6, marginTop: 10 }}>NOTES</div>
        <textarea style={{ ...C.inp, height: 56, resize: "vertical" }} value={data.notes || ""} onChange={(event) => updateField("notes", event.target.value)} placeholder="Architecture / context notes for this node..." />
      </div>

      <div style={C.card}>
        <div style={{ color: "#ec4899", fontFamily: "monospace", fontSize: 10, marginBottom: 6 }}>STRIDE THREATS ({component.threats?.length || 0})</div>
        {(component.threats || []).map((t) => (
          <div key={t.id} style={{ borderTop: "1px solid #141e30", padding: "8px 0" }}>
            <div style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap", marginBottom: 4 }}>
              <span style={C.pill(STRIDE_COLORS[t.stride] || "#94a3b8")}>{t.stride}</span>
              <span style={C.pill("#475569")}>{t.defaultSeverity}</span>
            </div>
            <div style={{ color: "#cbd5e1", fontSize: 12, fontWeight: 500 }}>{t.title}</div>
            <div style={{ color: "#475569", fontSize: 11, marginTop: 2, lineHeight: 1.4 }}>{t.attackVector}</div>
          </div>
        ))}
      </div>

      <div style={C.card}>
        <div style={{ color: "#a78bfa", fontFamily: "monospace", fontSize: 10, marginBottom: 6 }}>SECURITY REQUIREMENTS ({(data.securityRequirements || []).length})</div>
        {(data.securityRequirements || []).map((r) => {
          const statusColor = r.status === "closed" ? "#30d158" : r.status === "partial" ? "#ffd60a" : "#ff9f0a";
          return (
            <div key={r.instanceId} style={{ borderTop: "1px solid #141e30", padding: "8px 0" }}>
              <div style={{ color: "#cbd5e1", fontSize: 12, fontWeight: 500 }}>{r.title}</div>
              <div style={{ color: "#475569", fontSize: 11, margin: "2px 0 6px", lineHeight: 1.4 }}>{r.description}</div>
              {r.controlFamily && <div style={{ color: "#334155", fontSize: 10, fontFamily: "monospace", marginBottom: 6 }}>{r.controlFamily}</div>}
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <select value={r.status} onChange={(event) => updateRequirementStatus(r.instanceId, event.target.value)} style={{ ...C.inp, padding: "4px 6px", fontSize: 11, color: statusColor, borderColor: statusColor, width: 130 }}>
                  <option value="open">Open</option>
                  <option value="partial">Partial</option>
                  <option value="closed">Closed</option>
                </select>
                <input style={{ ...C.inp, padding: "4px 6px", fontSize: 11, flex: 1 }} placeholder="Jira key" value={r.jiraKey || ""} onChange={(event) => updateRequirementJira(r.instanceId, event.target.value)} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function nodeFromComponent(componentId, position) {
  const component = getComponent(componentId);
  if (!component) return null;
  const id = nextNodeId();

  const baseModule = {
    id,
    parentId: "",
    name: component.label,
    inputs: "",
    outputs: "",
    dataStores: "",
    externalEntities: "",
    componentType: componentId,
    componentTypeSource: "stencil",
    securityRequirements: []
  };
  const filled = injectFromLibrary(baseModule);

  return {
    id,
    type: "stencil",
    position,
    data: {
      label: component.label,
      componentId: component.id,
      category: component.category,
      kind: component.kind,
      color: component.color,
      notes: "",
      inputs: filled.inputs,
      outputs: filled.outputs,
      dataStores: filled.dataStores,
      externalEntities: filled.externalEntities,
      securityRequirements: filled.securityRequirements
    }
  };
}

function nodesToModules(nodes) {
  return nodes.map((node) => ({
    id: node.id,
    parentId: "",
    name: node.data?.label || "Untitled",
    inputs: node.data?.inputs || "",
    outputs: node.data?.outputs || "",
    dataStores: node.data?.dataStores || "",
    externalEntities: node.data?.externalEntities || "",
    componentType: node.data?.componentId || "",
    componentTypeSource: "stencil",
    securityRequirements: node.data?.securityRequirements || []
  }));
}

function applyImportedModules(initialModules) {
  return (initialModules || [])
    .filter((m) => m.componentType && getComponent(m.componentType))
    .map((m, index) => {
      const component = getComponent(m.componentType);
      return {
        id: m.id || nextNodeId(),
        type: "stencil",
        position: { x: 80 + (index % 4) * 220, y: 80 + Math.floor(index / 4) * 160 },
        data: {
          label: m.name || component.label,
          componentId: component.id,
          category: component.category,
          kind: component.kind,
          color: component.color,
          notes: "",
          inputs: m.inputs || component.defaultInputs || "",
          outputs: m.outputs || component.defaultOutputs || "",
          dataStores: m.dataStores || component.defaultDataStores || "",
          externalEntities: m.externalEntities || component.defaultExternalEntities || "",
          securityRequirements: m.securityRequirements?.length ? m.securityRequirements : injectFromLibrary({ id: m.id || nextNodeId(), componentType: m.componentType }).securityRequirements
        }
      };
    });
}

function DesignerInner({ initialModules, onCommit, onCancel }) {
  const wrapperRef = useRef(null);
  const reactFlowInstance = useReactFlow();
  const [nodes, setNodes] = useState(() => applyImportedModules(initialModules));
  const [edges, setEdges] = useState([]);
  const [selectedNodeId, setSelectedNodeId] = useState(null);

  const onNodesChange = useCallback((changes) => setNodes((nds) => applyNodeChanges(changes, nds)), []);
  const onEdgesChange = useCallback((changes) => setEdges((eds) => applyEdgeChanges(changes, eds)), []);
  const onConnect = useCallback((params) => setEdges((eds) => addEdge({ ...params, animated: true, style: { stroke: "#00b4d8", strokeWidth: 1.6 } }, eds)), []);

  const onDragOver = useCallback((event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback((event) => {
    event.preventDefault();
    const componentId = event.dataTransfer.getData(STENCIL_MIME);
    if (!componentId) return;
    if (!reactFlowInstance || !wrapperRef.current) return;
    const bounds = wrapperRef.current.getBoundingClientRect();
    const position = reactFlowInstance.screenToFlowPosition({
      x: event.clientX - (bounds.left || 0),
      y: event.clientY - (bounds.top || 0)
    });
    const node = nodeFromComponent(componentId, position);
    if (!node) return;
    setNodes((nds) => nds.concat(node));
    setSelectedNodeId(node.id);
  }, [reactFlowInstance]);

  const updateNodeData = useCallback((nodeId, patch) => {
    setNodes((nds) => nds.map((n) => n.id === nodeId ? { ...n, data: { ...n.data, ...patch } } : n));
  }, []);

  const deleteNode = useCallback((nodeId) => {
    setNodes((nds) => nds.filter((n) => n.id !== nodeId));
    setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
    setSelectedNodeId((current) => current === nodeId ? null : current);
  }, []);

  const onSelectionChange = useCallback((params) => {
    const first = params.nodes?.[0];
    setSelectedNodeId(first ? first.id : null);
  }, []);

  const selectedNode = useMemo(() => nodes.find((n) => n.id === selectedNodeId) || null, [nodes, selectedNodeId]);

  const commit = () => {
    const modules = nodesToModules(nodes);
    const dfdEdges = edges.map((e) => ({ id: e.id, source: e.source, target: e.target }));
    onCommit({ modules, edges: dfdEdges });
  };

  const totalThreats = nodes.reduce((sum, n) => sum + (getComponent(n.data?.componentId)?.threats?.length || 0), 0);
  const totalReqs = nodes.reduce((sum, n) => sum + (n.data?.securityRequirements?.length || 0), 0);

  return (
    <div style={C.shell}>
      <PaletteSidebar />
      <div style={C.canvasWrap} ref={wrapperRef}>
        <div style={{ position: "absolute", top: 10, left: 10, right: 10, zIndex: 5, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, pointerEvents: "none" }}>
          <div style={{ background: "#08101eee", border: "1px solid #1a2540", borderRadius: 6, padding: "6px 10px", color: "#94a3b8", fontSize: 12, fontFamily: "monospace", pointerEvents: "auto" }}>
            {nodes.length} components · {edges.length} flows · {totalThreats} threats · {totalReqs} requirements
          </div>
          <div style={{ display: "flex", gap: 6, pointerEvents: "auto" }}>
            <button onClick={onCancel} style={{ padding: "6px 14px", borderRadius: 6, border: "1px solid #2a3a55", background: "transparent", color: "#94a3b8", cursor: "pointer", fontSize: 12, fontFamily: "'DM Sans',sans-serif" }}>Cancel</button>
            <button onClick={commit} style={{ padding: "6px 14px", borderRadius: 6, border: "none", background: "#00b4d8", color: "#000", fontWeight: 600, cursor: "pointer", fontSize: 12, fontFamily: "'DM Sans',sans-serif" }}>Save & continue</button>
          </div>
        </div>
        <div style={{ width: "100%", height: "100%", minHeight: 0 }} onDrop={onDrop} onDragOver={onDragOver}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onSelectionChange={onSelectionChange}
            nodeTypes={NODE_TYPES}
            fitView
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={20} color="#1a2540" />
            <Controls position="bottom-right" />
          </ReactFlow>
        </div>
      </div>
      <Inspector node={selectedNode} onUpdate={updateNodeData} onDelete={deleteNode} />
    </div>
  );
}

export default function StencilDesigner({ initialModules, onCommit, onCancel }) {
  return (
    <ReactFlowProvider>
      <DesignerInner initialModules={initialModules} onCommit={onCommit} onCancel={onCancel} />
    </ReactFlowProvider>
  );
}

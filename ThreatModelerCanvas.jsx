import { useState, useRef, useCallback, useEffect } from "react";
import { DEFAULT_GEMINI_API_KEY } from "./geminiEnv.js";
import { parseGeminiJson } from "./geminiJson.js";

// ─── Constants ───────────────────────────────────────────────────────────────
const PALETTE = [
  { type:"entity",   label:"External Entity", color:"#00b4d8", w:136, h:52  },
  { type:"process",  label:"Process",          color:"#4ade80", w:144, h:64  },
  { type:"store",    label:"Data Store",       color:"#a78bfa", w:144, h:52  },
  { type:"boundary", label:"Trust Boundary",   color:"#ff9f0a", w:230, h:160 },
];

const STRIDE_CATS = [
  { id:"S", name:"Spoofing",               color:"#f59e0b" },
  { id:"T", name:"Tampering",              color:"#ef4444" },
  { id:"R", name:"Repudiation",            color:"#8b5cf6" },
  { id:"I", name:"Info Disclosure",        color:"#06b6d4" },
  { id:"D", name:"Denial of Service",      color:"#f97316" },
  { id:"E", name:"Elevation of Privilege", color:"#ec4899" },
];

const DREAD_DIMS = [
  {id:"damage",         label:"Damage"},
  {id:"reproducibility",label:"Reprod."},
  {id:"exploitability", label:"Exploit"},
  {id:"affectedUsers",  label:"Affected"},
  {id:"discoverability",label:"Discov."},
];

const DRAG_THRESHOLD = 5;
let _id = 0;
const uid = (p="n") => `${p}${++_id}`;
const dreadAvg = (t) => {
  const v = Object.values(t.dread||{});
  return v.length === 5 ? v.reduce((a,b)=>a+b,0)/5 : 0;
};
const riskOf = (s) =>
  s > 8 ? {label:"Critical",color:"#ff2d55",bg:"rgba(255,45,85,.12)"}
  : s>=6 ? {label:"High",    color:"#ff9f0a",bg:"rgba(255,159,10,.12)"}
  : s>=4 ? {label:"Medium",  color:"#ffd60a",bg:"rgba(255,214,10,.10)"}
  :        {label:"Low",     color:"#30d158",bg:"rgba(48,209,88,.12)"};

// ─── Gemini ───────────────────────────────────────────────────────────────────
async function gemini(key, prompt) {
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${key}`,
    { method:"POST", headers:{"Content-Type":"application/json"},
      body:JSON.stringify({contents:[{parts:[{text:prompt}]}],generationConfig:{temperature:.2,maxOutputTokens:8192,responseMimeType:"application/json"}}) }
  );
  const d = await r.json();
  if (!r.ok || d.error) throw new Error(d?.error?.message || `HTTP ${r.status}`);
  return d.candidates[0].content.parts[0].text;
}
const parseJ = (t) => parseGeminiJson(t);

// ─── Node Shape ───────────────────────────────────────────────────────────────
function NodeShape({ node, selected }) {
  const { type, w, h, color } = node;
  const sw = selected ? 2 : 1.5;
  const stroke = selected ? "#ffffff" : color;
  const fill = `${color}18`;
  if (type==="entity") return <rect x={-w/2} y={-h/2} width={w} height={h} rx={5} fill={fill} stroke={stroke} strokeWidth={sw}/>;
  if (type==="process") return <ellipse rx={w/2} ry={h/2} fill={fill} stroke={stroke} strokeWidth={sw}/>;
  if (type==="store") return <>
    <rect x={-w/2} y={-h/2} width={w} height={h} fill={fill} stroke="none"/>
    <line x1={-w/2} y1={-h/2} x2={w/2} y2={-h/2} stroke={stroke} strokeWidth={sw}/>
    <line x1={-w/2} y1={h/2}  x2={w/2} y2={h/2}  stroke={stroke} strokeWidth={sw}/>
  </>;
  if (type==="boundary") return (
    <rect x={-w/2} y={-h/2} width={w} height={h} rx={10}
      fill={`${color}07`} stroke={stroke} strokeWidth={1.5} strokeDasharray="10,5"/>
  );
  return null;
}

// ─── Canvas ───────────────────────────────────────────────────────────────────
function Canvas({ nodes, edges, selectedId, mode, onSelect, onConnect, onMove, onCanvasClick }) {
  const svgRef = useRef(null);
  const [drag, setDrag]           = useState(null);   // {nodeId, ox, oy}
  const [connectFrom, setConnectFrom] = useState(null);
  const [mouse, setMouse]         = useState({x:300,y:200});
  const didDragRef                = useRef(false);

  const svgPt = (e) => {
    const r = svgRef.current.getBoundingClientRect();
    return {x: e.clientX - r.left, y: e.clientY - r.top};
  };

  const handleNodeMD = (e, id) => {
    e.stopPropagation();
    const pos = svgPt(e);
    const nd  = nodes.find(n=>n.id===id);
    didDragRef.current = false;
    setDrag({nodeId:id, ox:pos.x-nd.x, oy:pos.y-nd.y, sx:pos.x, sy:pos.y});
  };

  const handleNodeClick = (e, id) => {
    e.stopPropagation();
    if (didDragRef.current) return;
    if (mode==="connect") {
      if (!connectFrom) { setConnectFrom(id); return; }
      if (connectFrom !== id) { onConnect(connectFrom, id); setConnectFrom(null); return; }
      setConnectFrom(null); return;
    }
    onSelect(id);
  };

  const handleMM = (e) => {
    const pos = svgPt(e);
    setMouse(pos);
    if (!drag) return;
    const dist = Math.hypot(pos.x-drag.sx, pos.y-drag.sy);
    if (dist > DRAG_THRESHOLD) didDragRef.current = true;
    if (didDragRef.current) onMove(drag.nodeId, {x: pos.x-drag.ox, y: pos.y-drag.oy});
  };

  const handleMU = () => setDrag(null);

  const handleSvgClick = () => {
    if (mode==="connect") { setConnectFrom(null); return; }
    onCanvasClick();
  };

  const fromNode = connectFrom ? nodes.find(n=>n.id===connectFrom) : null;
  const bounds   = nodes.filter(n=>n.type==="boundary");
  const others   = nodes.filter(n=>n.type!=="boundary");

  const edgePath = (a,b) => {
    const mx = (a.x+b.x)/2, my = (a.y+b.y)/2-40;
    return `M${a.x},${a.y} Q${mx},${my} ${b.x},${b.y}`;
  };

  return (
    <svg ref={svgRef} width="100%" height="100%"
      style={{display:"block",cursor:mode==="connect"?(connectFrom?"crosshair":"cell"):"default"}}
      onMouseMove={handleMM} onMouseUp={handleMU} onClick={handleSvgClick}>
      <defs>
        <pattern id="dots" width="30" height="30" patternUnits="userSpaceOnUse">
          <circle cx="15" cy="15" r=".9" fill="#1a2844"/>
        </pattern>
        <marker id="ah" markerWidth={8} markerHeight={8} refX={7} refY={3} orient="auto">
          <path d="M0,0 L0,6 L7,3 z" fill="#2a3d5a"/>
        </marker>
        <marker id="ah-live" markerWidth={8} markerHeight={8} refX={7} refY={3} orient="auto">
          <path d="M0,0 L0,6 L7,3 z" fill="#00b4d8"/>
        </marker>
      </defs>
      <rect width="100%" height="100%" fill="url(#dots)"/>

      {/* Boundaries (behind) */}
      {bounds.map(nd => (
        <g key={nd.id} transform={`translate(${nd.x},${nd.y})`}
          style={{cursor:"grab"}} onMouseDown={e=>handleNodeMD(e,nd.id)} onClick={e=>handleNodeClick(e,nd.id)}>
          <NodeShape node={nd} selected={selectedId===nd.id}/>
          <text x={-nd.w/2+12} y={-nd.h/2+18}
            fill={nd.color} fontSize={11} fontFamily="monospace" style={{pointerEvents:"none"}}>
            {nd.label}
          </text>
        </g>
      ))}

      {/* Edges */}
      {edges.map(edge => {
        const fn=nodes.find(n=>n.id===edge.from), tn=nodes.find(n=>n.id===edge.to);
        if(!fn||!tn) return null;
        return (
          <g key={edge.id}>
            <path d={edgePath(fn,tn)} fill="none" stroke="#1e3654" strokeWidth={1.5}
              strokeDasharray="6,4" markerEnd="url(#ah)"/>
            {edge.label && <text x={(fn.x+tn.x)/2} y={(fn.y+tn.y)/2-48}
              textAnchor="middle" fill="#2a3d5a" fontSize={10} fontFamily="monospace">{edge.label}</text>}
          </g>
        );
      })}

      {/* Live connect line */}
      {mode==="connect" && fromNode && (
        <path d={`M${fromNode.x},${fromNode.y} L${mouse.x},${mouse.y}`}
          fill="none" stroke="#00b4d8" strokeWidth={1.5} strokeDasharray="6,3" markerEnd="url(#ah-live)"/>
      )}
      {mode==="connect" && connectFrom && (
        <circle cx={fromNode?.x} cy={fromNode?.y} r={6}
          fill="none" stroke="#00b4d8" strokeWidth={2} opacity={.7}/>
      )}

      {/* Main nodes */}
      {others.map(nd => {
        const threatN = (nd.threats||[]).filter(t=>t.status!=="not-applicable").length;
        const isSelected = selectedId===nd.id;
        return (
          <g key={nd.id} transform={`translate(${nd.x},${nd.y})`}
            style={{cursor:drag?.nodeId===nd.id?"grabbing":"grab"}}
            onMouseDown={e=>handleNodeMD(e,nd.id)} onClick={e=>handleNodeClick(e,nd.id)}>
            {isSelected && (
              <NodeShape node={{...nd,w:nd.w+6,h:nd.h+6}} selected={false}/>
            )}
            <NodeShape node={nd} selected={isSelected}/>
            <text textAnchor="middle" dominantBaseline="central" y={nd.type==="store"?1:0}
              fill="#e2e8f0" fontSize={12} fontFamily="'DM Sans',sans-serif" style={{pointerEvents:"none"}}>
              {nd.label}
            </text>
            {/* Analyzing spinner */}
            {nd.analyzing && (
              <text textAnchor="middle" y={nd.h/2+15} fill="#00b4d8" fontSize={9} fontFamily="monospace" style={{pointerEvents:"none"}}>
                analyzing...
              </text>
            )}
            {/* Threat badge */}
            {threatN > 0 && (
              <g style={{pointerEvents:"none"}}>
                <circle cx={nd.w/2-2} cy={-nd.h/2+2} r={10} fill="#ff2d55"/>
                <text x={nd.w/2-2} y={-nd.h/2+2} textAnchor="middle" dominantBaseline="central"
                  fill="#fff" fontSize={9} fontFamily="monospace">{threatN}</text>
              </g>
            )}
          </g>
        );
      })}
    </svg>
  );
}

// ─── Shared UI ────────────────────────────────────────────────────────────────
const BG    = "#050810";
const PANEL = "#090f1c";
const CARD  = "#0d1421";
const BDR   = "#182038";
const TXT   = "#e2e8f0";
const MUT   = "#4a5568";
const ACT   = "#00b4d8";

const Tag = ({label,color,bg}) =>
  <span style={{background:bg||`${color}20`,color,padding:"2px 8px",borderRadius:3,fontSize:11,fontFamily:"monospace"}}>{label}</span>;
const Pill = ({label,value,color}) =>
  <div style={{background:`${color}10`,border:`1px solid ${color}30`,borderRadius:6,padding:"8px 14px",textAlign:"center",minWidth:72}}>
    <div style={{color,fontSize:20,fontFamily:"monospace",fontWeight:700}}>{value}</div>
    <div style={{color:MUT,fontSize:11}}>{label}</div>
  </div>;

// ─── App ──────────────────────────────────────────────────────────────────────
export default function ThreatModelerCanvas({
  embedded = false,
  hideApiKeyInToolbar = false,
  onRequestApiKeySettings,
  apiKey: apiKeyProp,
  setApiKey: setApiKeyProp,
  initialAppName,
  initialAppDesc,
  initialAppStack
}) {
  const [internalApiKey, setInternalApiKey] = useState(DEFAULT_GEMINI_API_KEY);
  const keyControlled = setApiKeyProp != null;
  const apiKey = keyControlled ? (apiKeyProp ?? "") : internalApiKey;
  const setApiKey = keyControlled ? setApiKeyProp : setInternalApiKey;

  const [view,      setView]      = useState("canvas");
  const [showKey,   setShowKey]   = useState(false);
  const [appName,   setAppName]   = useState(() => (initialAppName?.trim() ? initialAppName.trim() : "Untitled Model"));
  const [appDesc,   setAppDesc]   = useState(() => initialAppDesc ?? "");
  const [appStack,  setAppStack]  = useState(() => initialAppStack ?? "");
  const [mode,      setMode]      = useState("select");
  const [nodes,     setNodes]     = useState([]);
  const [edges,     setEdges]     = useState([]);
  const [selected,  setSelected]  = useState(null);
  const [error,     setError]     = useState(null);
  const [mitLoading,setMitLoading]= useState(false);
  const [allLoading,setAllLoading]= useState(false);
  const [mitigations,setMitigations] = useState({});
  const [activeFilter, setActiveFilter] = useState("all");

  const selectedNode = nodes.find(n=>n.id===selected);

  // Keyboard shortcuts
  useEffect(() => {
    const h = (e) => {
      if (["INPUT","TEXTAREA"].includes(e.target.tagName)) return;
      if ((e.key==="Delete"||e.key==="Backspace") && selected) {
        setNodes(ns=>ns.filter(n=>n.id!==selected));
        setEdges(es=>es.filter(e=>e.from!==selected&&e.to!==selected));
        setSelected(null);
      }
      if (e.key==="Escape") { setMode("select"); setSelected(null); }
    };
    window.addEventListener("keydown",h);
    return ()=>window.removeEventListener("keydown",h);
  }, [selected]);

  const addNode = (type) => {
    const p = PALETTE.find(x=>x.type===type);
    const cx = 200 + Math.random()*400, cy = 100 + Math.random()*280;
    const nd = { id:uid(), type, label:p.label, x:cx, y:cy, w:p.w, h:p.h, color:p.color, threats:[], analyzing:false };
    setNodes(ns=>[...ns,nd]);
    setSelected(nd.id);
  };

  const addEdge = (from, to) => {
    if (edges.find(e=>e.from===from&&e.to===to)) return;
    setEdges(es=>[...es,{id:uid("e"), from, to, label:""}]);
    setMode("select");
  };

  const updateNode = (id, upd) => setNodes(ns=>ns.map(n=>n.id===id?{...n,...upd}:n));

  const del = () => {
    if (!selected) return;
    setNodes(ns=>ns.filter(n=>n.id!==selected));
    setEdges(es=>es.filter(e=>e.from!==selected&&e.to!==selected));
    setSelected(null);
  };

  // Analyze single node
  const analyzeNode = async (nodeId) => {
    if (!apiKey.trim()) { setError("Paste your Gemini API key first (Settings)."); (hideApiKeyInToolbar ? onRequestApiKeySettings?.() : setShowKey(true)); return; }
    const nd = nodes.find(n=>n.id===nodeId);
    if (!nd) return;
    updateNode(nodeId, {analyzing:true});
    setError(null);
    try {
      const conns = edges.filter(e=>e.from===nodeId||e.to===nodeId).map(e=>{
        const other = nodes.find(x=>x.id===(e.from===nodeId?e.to:e.from));
        return `${e.from===nodeId?"->":"<-"} ${other?.label}`;
      }).join(", ");
      const txt = await gemini(apiKey,`STRIDE threat modeling expert. Identify threats for this DFD component.

App: ${appName}. Stack: ${appStack||"unspecified"}. ${appDesc?"Context: "+appDesc:""}
Component: "${nd.label}" (type: ${nd.type})
Data flows: ${conns||"none yet"}

Return ONLY valid JSON array — 5 to 8 specific, concrete threats:
[{
  "id":"T001",
  "strideCategory":"S",
  "strideName":"Spoofing",
  "title":"Concise threat name",
  "description":"2 sentences: what the attack is and why this component is vulnerable.",
  "status":"applicable"
}]`);
      const threats = parseJ(txt).map(t=>({...t,status:"applicable",dread:{damage:5,reproducibility:5,exploitability:5,affectedUsers:5,discoverability:5}}));
      updateNode(nodeId,{threats,analyzing:false});
    } catch(e) { setError(e.message); updateNode(nodeId,{analyzing:false}); }
  };

  // Analyze all nodes
  const analyzeAll = async () => {
    if (!apiKey.trim()) { setError("Paste your Gemini API key first"); (hideApiKeyInToolbar ? onRequestApiKeySettings?.() : setShowKey(true)); return; }
    const valid = nodes.filter(n=>n.type!=="boundary");
    if (!valid.length) { setError("Add at least one component first"); return; }
    setAllLoading(true); setError(null);
    try {
      const nodeList = valid.map(n=>({
        id:n.id, label:n.label, type:n.type,
        connectedTo: edges.filter(e=>e.from===n.id||e.to===n.id)
          .map(e=>{const o=nodes.find(x=>x.id===(e.from===n.id?e.to:e.from));return o?.label;}).filter(Boolean)
      }));
      const txt = await gemini(apiKey,`STRIDE threat expert. Identify threats for ALL components.

App: ${appName}. Stack: ${appStack||"unspecified"}. ${appDesc?"Context: "+appDesc:""}
Components: ${JSON.stringify(nodeList)}

Return ONLY valid JSON — object mapping each node's id to its threats array (4-6 per component, all 6 STRIDE categories covered across the whole system):
{
  "nodeId1": [{
    "id":"T001",
    "strideCategory":"S",
    "strideName":"Spoofing",
    "title":"Concise threat name",
    "description":"2 sentences specific to this component.",
    "status":"applicable"
  }]
}`);
      const result = parseJ(txt);
      setNodes(ns=>ns.map(n=>{
        const ts=result[n.id];
        if(!ts) return n;
        return {...n, threats:ts.map(t=>({...t,dread:{damage:5,reproducibility:5,exploitability:5,affectedUsers:5,discoverability:5}}))};
      }));
    } catch(e){ setError(e.message); }
    setAllLoading(false);
  };

  // Generate mitigations
  const generateMit = async () => {
    if (!apiKey.trim()) {
      if (hideApiKeyInToolbar) onRequestApiKeySettings?.();
      else setShowKey(true);
      return;
    }
    const threats = allApplicable;
    if (!threats.length) return;
    setMitLoading(true); setError(null);
    try {
      const txt = await gemini(apiKey,`Security engineer. Provide actionable remediation for these threats.

App: ${appName}. Stack: ${appStack}.
Threats: ${JSON.stringify(threats.map(t=>({id:t.id,title:t.title,category:t.strideName,component:t.nodeLabel})))}

Return ONLY valid JSON — map from threat id to remediation:
{"T001":{"shortFix":"One-line action","steps":["step 1","step 2","step 3"],"effort":"Low|Medium|High","control":"OWASP or security control reference"}}`);
      setMitigations(parseJ(txt));
    } catch(e){ setError(e.message); }
    setMitLoading(false);
  };

  const setThreatStatus = (nodeId, tid, status) =>
    setNodes(ns=>ns.map(n=>n.id!==nodeId?n:{...n,threats:n.threats.map(t=>t.id!==tid?t:{...t,status})}));

  const setThreatDread = (nodeId, tid, dim, val) =>
    setNodes(ns=>ns.map(n=>n.id!==nodeId?n:{...n,threats:n.threats.map(t=>t.id!==tid?t:{...t,dread:{...t.dread,[dim]:val}})}));

  // Aggregates
  const allApplicable = nodes.flatMap(n=>
    (n.threats||[]).filter(t=>t.status==="applicable").map(t=>({
      ...t, nodeId:n.id, nodeLabel:n.label, nodeColor:n.color, score:dreadAvg(t)
    }))
  ).sort((a,b)=>b.score-a.score);

  const filteredThreats = activeFilter==="all" ? allApplicable : allApplicable.filter(t=>t.strideCategory===activeFilter);
  const critN = allApplicable.filter(t=>t.score>8).length;
  const highN = allApplicable.filter(t=>t.score>=6&&t.score<=8).length;

  const tabBtn = (id, label) => (
    <button onClick={()=>setView(id)} style={{
      padding:"0 18px",height:"100%",background:"transparent",border:"none",
      borderBottom:`2px solid ${view===id?ACT:"transparent"}`,
      color:view===id?ACT:MUT,cursor:"pointer",fontSize:12,fontFamily:"monospace",letterSpacing:.5,transition:"all .15s"
    }}>{label}</button>
  );

  const paletteIcon = (type) => {
    if(type==="entity") return <rect width={10} height={10} rx={1} x={0} y={0} fill="currentColor"/>;
    if(type==="process") return <ellipse cx={5} cy={5} rx={5} ry={5} fill="currentColor"/>;
    if(type==="store") return <><line x1={0} y1={0} x2={10} y2={0} stroke="currentColor" strokeWidth={2}/><line x1={0} y1={10} x2={10} y2={10} stroke="currentColor" strokeWidth={2}/></>;
    return <rect width={10} height={10} rx={2} fill="none" stroke="currentColor" strokeWidth={1.5} strokeDasharray="3,2"/>;
  };

  const rootLayout = embedded
    ? { display: "flex", flexDirection: "column", flex: 1, minHeight: 0, height: "100%", width: "100%" }
    : { display: "flex", flexDirection: "column", height: "100vh" };

  return (
    <div style={{...rootLayout,background:BG,fontFamily:"'DM Sans',sans-serif",color:TXT,overflow:"hidden"}}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&display=swap');*{box-sizing:border-box;margin:0;padding:0}input:focus,textarea:focus{outline:none}::-webkit-scrollbar{width:3px}::-webkit-scrollbar-thumb{background:#182038}::-webkit-scrollbar-track{background:transparent}input[type=range]{-webkit-appearance:none;height:3px;background:#182038;border-radius:2px;outline:none}input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:12px;height:12px;border-radius:50%;cursor:pointer}select option{background:#0d1421}`}</style>

      {/* ── Top Bar ─────────────────────────────────────────────── */}
      <div style={{height:48,background:PANEL,borderBottom:`1px solid ${BDR}`,display:"flex",alignItems:"center",flexShrink:0,zIndex:10}}>
        {/* Brand */}
        <div style={{padding:"0 16px",display:"flex",alignItems:"center",gap:9,borderRight:`1px solid ${BDR}`,height:"100%",flexShrink:0}}>
          <span style={{fontSize:12,fontWeight:600,fontFamily:"monospace",letterSpacing:1.5,color:TXT}}>THREATMODELER</span>
        </div>
        {/* App name */}
        <input value={appName} onChange={e=>setAppName(e.target.value)}
          style={{background:"transparent",border:"none",color:TXT,fontSize:13,padding:"0 14px",height:"100%",minWidth:180,maxWidth:240,fontFamily:"'DM Sans',sans-serif"}}/>
        {/* Tabs */}
        <div style={{display:"flex",height:"100%",marginLeft:"auto"}}>
          {tabBtn("canvas","Canvas")}
          {tabBtn("threats","Threats")}
          {tabBtn("report","Report")}
        </div>
        {/* Stats chips */}
        {allApplicable.length>0 && (
          <div style={{display:"flex",gap:6,padding:"0 12px",borderLeft:`1px solid ${BDR}`,borderRight:`1px solid ${BDR}`}}>
            {[{l:"threats",v:allApplicable.length,c:ACT},{l:"critical",v:critN,c:"#ff2d55"},{l:"high",v:highN,c:"#ff9f0a"}].map(x=>(
              <span key={x.l} style={{background:`${x.c}15`,color:x.c,padding:"3px 9px",borderRadius:3,fontSize:11,fontFamily:"monospace"}}>{x.v} {x.l}</span>
            ))}
          </div>
        )}
        {!hideApiKeyInToolbar && (
          <div style={{padding:"0 12px",height:"100%",display:"flex",alignItems:"center",position:"relative",flexShrink:0}}>
            <button onClick={()=>setShowKey(s=>!s)} style={{background:apiKey?"rgba(48,209,88,.1)":"rgba(239,68,68,.1)",border:`1px solid ${apiKey?"#30d158":"#ef4444"}`,color:apiKey?"#30d158":"#ef4444",padding:"3px 10px",borderRadius:4,cursor:"pointer",fontSize:11,fontFamily:"monospace",whiteSpace:"nowrap"}}>
              {apiKey?"Gemini OK":"Add key"}
            </button>
            {showKey && (
              <div style={{position:"absolute",top:52,right:0,background:PANEL,border:`1px solid ${BDR}`,borderRadius:8,padding:14,zIndex:200,width:270,boxShadow:"0 8px 32px rgba(0,0,0,.5)"}}>
                <div style={{color:MUT,fontSize:10,fontFamily:"monospace",marginBottom:6,letterSpacing:1}}>GEMINI API KEY</div>
                <input type="password" value={apiKey} onChange={e=>setApiKey(e.target.value)}
                  placeholder="AIza..." style={{width:"100%",background:BG,border:`1px solid ${BDR}`,borderRadius:4,padding:"7px 9px",color:TXT,fontSize:12,fontFamily:"monospace"}}/>
                <p style={{color:"#2a3d5a",fontSize:10,margin:"6px 0 8px"}}>Get free key at <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" style={{color:ACT}}>aistudio.google.com</a></p>
                <button onClick={()=>setShowKey(false)} style={{width:"100%",padding:6,background:ACT,border:"none",borderRadius:4,color:"#000",cursor:"pointer",fontSize:12,fontWeight:600}}>Done</button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div style={{background:"rgba(239,68,68,.08)",borderBottom:"1px solid rgba(239,68,68,.25)",color:"#fca5a5",padding:"6px 16px",fontSize:12,display:"flex",justifyContent:"space-between",flexShrink:0}}>
          Error: {error}
          <button onClick={()=>setError(null)} style={{background:"none",border:"none",color:"#fca5a5",cursor:"pointer",fontSize:14}} type="button" aria-label="Dismiss">x</button>
        </div>
      )}

      {/* ══════════════════ CANVAS VIEW ══════════════════════════ */}
      {view==="canvas" && (
        <div style={{display:"flex",flex:1,overflow:"hidden"}}>

          {/* Left Palette */}
          <div style={{width:188,background:PANEL,borderRight:`1px solid ${BDR}`,display:"flex",flexDirection:"column",flexShrink:0,overflow:"auto"}}>
            <div style={{padding:"10px 10px 8px",borderBottom:`1px solid ${BDR}`}}>
              <div style={{color:MUT,fontSize:9,fontFamily:"monospace",letterSpacing:1.5,marginBottom:8}}>COMPONENTS</div>
              {PALETTE.map(p=>(
                <button key={p.type} onClick={()=>addNode(p.type)} style={{
                  width:"100%",display:"flex",alignItems:"center",gap:9,padding:"8px 10px",marginBottom:4,
                  background:"transparent",border:`1px solid ${BDR}`,borderRadius:5,cursor:"pointer",
                  color:TXT,fontSize:12,textAlign:"left",transition:"border-color .12s"
                }}
                  onMouseEnter={e=>e.currentTarget.style.borderColor=p.color}
                  onMouseLeave={e=>e.currentTarget.style.borderColor=BDR}
                >
                  <svg width={10} height={10} style={{color:p.color,flexShrink:0}}>
                    {paletteIcon(p.type)}
                  </svg>
                  <span>{p.label}</span>
                </button>
              ))}
            </div>

            <div style={{padding:"10px 10px 8px",borderBottom:`1px solid ${BDR}`}}>
              <div style={{color:MUT,fontSize:9,fontFamily:"monospace",letterSpacing:1.5,marginBottom:8}}>TOOLS</div>
              {[{m:"select",l:"Select",k:"Esc"},{m:"connect",l:"Connect",k:""}].map(({m,l,k})=>(
                <button key={m} onClick={()=>setMode(m)} style={{
                  width:"100%",display:"flex",justifyContent:"space-between",alignItems:"center",
                  padding:"7px 10px",marginBottom:4,background:mode===m?`${ACT}12`:"transparent",
                  border:`1px solid ${mode===m?ACT:BDR}`,borderRadius:5,cursor:"pointer",
                  color:mode===m?ACT:TXT,fontSize:12,transition:"all .12s"
                }}>
                  {l}<span style={{color:MUT,fontSize:9,fontFamily:"monospace"}}>{k}</span>
                </button>
              ))}
              <button onClick={del} disabled={!selected} style={{
                width:"100%",padding:"7px 10px",background:"transparent",
                border:`1px solid ${selected?"#ef4444":BDR}`,borderRadius:5,
                cursor:selected?"pointer":"default",color:selected?"#ef4444":MUT,fontSize:12
              }}>Delete  <span style={{color:MUT,fontSize:9,fontFamily:"monospace"}}>Del</span></button>
            </div>

            <div style={{padding:"10px 10px 8px",borderBottom:`1px solid ${BDR}`}}>
              <div style={{color:MUT,fontSize:9,fontFamily:"monospace",letterSpacing:1.5,marginBottom:8}}>APP CONTEXT</div>
              <textarea value={appDesc} onChange={e=>setAppDesc(e.target.value)} placeholder="What does this app do?" style={{width:"100%",background:BG,border:`1px solid ${BDR}`,borderRadius:4,padding:"6px 8px",color:TXT,fontSize:11,resize:"vertical",minHeight:52,fontFamily:"'DM Sans',sans-serif",marginBottom:6}}/>
              <input value={appStack} onChange={e=>setAppStack(e.target.value)} placeholder="Tech stack..." style={{width:"100%",background:BG,border:`1px solid ${BDR}`,borderRadius:4,padding:"6px 8px",color:TXT,fontSize:11,fontFamily:"'DM Sans',sans-serif"}}/>
            </div>

            <div style={{padding:"10px"}}>
              <button onClick={analyzeAll} disabled={allLoading||!nodes.length} style={{
                width:"100%",padding:"8px 0",background:allLoading?"transparent":ACT,
                border:`1px solid ${ACT}`,borderRadius:5,cursor:(allLoading||!nodes.length)?"default":"pointer",
                color:allLoading?ACT:"#000",fontSize:12,fontWeight:600,transition:"all .15s"
              }}>
                {allLoading?"Analyzing...":"Analyze All"}
              </button>
              <div style={{color:MUT,fontSize:10,textAlign:"center",marginTop:7,fontFamily:"monospace"}}>
                {nodes.length} nodes · {edges.length} flows
              </div>
            </div>
          </div>

          {/* Canvas */}
          <div style={{flex:1,position:"relative",overflow:"hidden"}}>
            {nodes.length===0 && (
              <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",pointerEvents:"none",gap:8}}>
                <div style={{fontSize:48,opacity:.06}}>+</div>
                <div style={{color:"#141e30",fontSize:13,fontFamily:"monospace"}}>Add components from the palette</div>
                <div style={{color:"#0e1728",fontSize:11,fontFamily:"monospace"}}>Use Connect tool to draw data flows. Click nodes to analyze threats.</div>
              </div>
            )}
            <Canvas nodes={nodes} edges={edges} selectedId={selected} mode={mode}
              onSelect={setSelected} onConnect={addEdge}
              onMove={(id,pos)=>updateNode(id,pos)}
              onCanvasClick={()=>setSelected(null)}/>
          </div>

          {/* Right Panel */}
          <div style={{width:272,background:PANEL,borderLeft:`1px solid ${BDR}`,overflow:"auto",flexShrink:0,display:"flex",flexDirection:"column"}}>
            {selectedNode ? (
              <>
                {/* Node Header */}
                <div style={{padding:"12px 14px",borderBottom:`1px solid ${BDR}`}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                    <span style={{color:selectedNode.color,fontSize:10,fontFamily:"monospace",letterSpacing:1}}>{selectedNode.type.toUpperCase()}</span>
                    <button onClick={del} type="button" aria-label="Remove component" style={{background:"none",border:"none",color:MUT,cursor:"pointer",fontSize:16,lineHeight:1}}>x</button>
                  </div>
                  <input value={selectedNode.label} onChange={e=>updateNode(selected,{label:e.target.value})}
                    style={{width:"100%",background:BG,border:`1px solid ${BDR}`,borderRadius:4,padding:"7px 9px",color:TXT,fontSize:13,fontFamily:"'DM Sans',sans-serif"}}/>
                </div>

                {/* Threats Panel */}
                <div style={{flex:1,overflow:"auto",padding:"12px 14px"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                    <span style={{color:MUT,fontSize:9,fontFamily:"monospace",letterSpacing:1}}>
                      STRIDE THREATS · {(selectedNode.threats||[]).filter(t=>t.status!=="not-applicable").length}
                    </span>
                    <button onClick={()=>analyzeNode(selected)} disabled={selectedNode.analyzing}
                      style={{background:"transparent",border:`1px solid ${ACT}`,borderRadius:3,color:ACT,padding:"3px 9px",cursor:"pointer",fontSize:10,fontFamily:"monospace"}}>
                      {selectedNode.analyzing?"...":"Analyze"}
                    </button>
                  </div>

                  {(selectedNode.threats||[]).length===0 ? (
                    <div style={{color:"#1e2d4a",fontSize:11,textAlign:"center",padding:"24px 0",fontFamily:"monospace",lineHeight:2}}>
                      No threats yet.<br/>Click Analyze to auto-identify<br/>STRIDE threats for this component.
                    </div>
                  ) : (
                    (selectedNode.threats||[]).map(t => {
                      const sc = STRIDE_CATS.find(s=>s.id===t.strideCategory);
                      const isNA = t.status==="not-applicable";
                      return (
                        <div key={t.id} style={{padding:"9px 10px",background:isNA?"transparent":`${sc?.color}07`,border:`1px solid ${sc?.color}${isNA?"15":"28"}`,borderRadius:5,marginBottom:7,opacity:isNA?.35:1,transition:"opacity .15s"}}>
                          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:5}}>
                            <Tag label={`${sc?.id} · ${sc?.name}`} color={sc?.color||"#fff"}/>
                            <div style={{display:"flex",gap:3}}>
                              {[["applicable","Ok","#30d158"],["not-applicable","No","#ef4444"]].map(([s,l,c])=>(
                                <button key={s} onClick={()=>setThreatStatus(selected,t.id,s)}
                                  style={{minWidth:26,height:22,padding:"0 4px",borderRadius:3,border:`1px solid ${t.status===s?c:BDR}`,background:t.status===s?`${c}20`:"transparent",color:t.status===s?c:MUT,cursor:"pointer",fontSize:10}}>
                                  {l}
                                </button>
                              ))}
                            </div>
                          </div>
                          <div style={{color:TXT,fontSize:12,fontWeight:500,marginBottom:3}}>{t.title}</div>
                          <div style={{color:MUT,fontSize:11,lineHeight:1.6,marginBottom:t.status==="applicable"?8:0}}>{t.description}</div>
                          {t.status==="applicable" && (
                            <div style={{marginTop:2}}>
                              {DREAD_DIMS.map(d=>{
                                const v=t.dread?.[d.id]||5;
                                return (
                                  <div key={d.id} style={{display:"flex",alignItems:"center",gap:6,marginBottom:3}}>
                                    <span style={{color:"#2a3d5a",fontSize:9,fontFamily:"monospace",width:46,flexShrink:0}}>{d.label}</span>
                                    <input type="range" min={1} max={10} step={1} value={v}
                                      onChange={e=>setThreatDread(selected,t.id,d.id,+e.target.value)}
                                      style={{flex:1,accentColor:sc?.color}}/>
                                    <span style={{color:sc?.color,fontSize:10,fontFamily:"monospace",width:14,textAlign:"right"}}>{v}</span>
                                  </div>
                                );
                              })}
                              {(() => {const s=+(dreadAvg(t).toFixed(1));const rv=riskOf(s);return(
                                <div style={{display:"flex",justifyContent:"flex-end",marginTop:4}}>
                                  <Tag label={`${rv.label} · ${s}`} color={rv.color} bg={rv.bg}/>
                                </div>
                              );})()}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </>
            ) : (
              <div style={{padding:16,flex:1}}>
                <div style={{color:"#1e2d4a",fontSize:11,textAlign:"center",fontFamily:"monospace",lineHeight:2,marginTop:32}}>
                  Select a component<br/>to view and analyze threats
                </div>
                {allApplicable.length>0 && (
                  <div style={{marginTop:20}}>
                    <div style={{color:MUT,fontSize:9,fontFamily:"monospace",letterSpacing:1.5,marginBottom:10}}>MODEL SUMMARY</div>
                    {STRIDE_CATS.map(s=>{
                      const cnt=allApplicable.filter(t=>t.strideCategory===s.id).length;
                      return cnt>0 && (
                        <div key={s.id} style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:`1px solid ${BDR}`}}>
                          <div style={{display:"flex",alignItems:"center",gap:6}}>
                            <span style={{width:4,height:4,borderRadius:"50%",background:s.color,display:"inline-block"}}/>
                            <span style={{color:s.color,fontSize:11}}>{s.id} · {s.name}</span>
                          </div>
                          <span style={{color:s.color,fontFamily:"monospace",fontSize:11,fontWeight:600}}>{cnt}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════ THREATS VIEW ════════════════════════ */}
      {view==="threats" && (
        <div style={{flex:1,overflow:"auto",padding:20}}>
          <div style={{maxWidth:900,margin:"0 auto"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
              <h2 style={{fontSize:16,fontWeight:600,fontFamily:"monospace",letterSpacing:1}}>THREAT REGISTER</h2>
              <button onClick={()=>setView("canvas")} style={{padding:"6px 14px",background:"transparent",border:`1px solid ${BDR}`,borderRadius:4,color:MUT,cursor:"pointer",fontSize:12}}>Back to Canvas</button>
            </div>

            {allApplicable.length===0 ? (
              <div style={{textAlign:"center",color:"#1e2d4a",padding:60,fontFamily:"monospace"}}>
                No applicable threats - analyze your components on the canvas first.
              </div>
            ) : (<>
              <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap"}}>
                {[{l:"Total",v:allApplicable.length,c:ACT},{l:"Critical",v:critN,c:"#ff2d55"},{l:"High",v:highN,c:"#ff9f0a"}].map(x=>(
                  <Pill key={x.l} label={x.l} value={x.v} color={x.c}/>
                ))}
              </div>

              {/* STRIDE Filter */}
              <div style={{display:"flex",gap:5,marginBottom:14,flexWrap:"wrap"}}>
                {["all",...STRIDE_CATS.map(s=>s.id)].map(f=>{
                  const sc=STRIDE_CATS.find(s=>s.id===f);
                  const col=sc?.color||ACT;
                  const cnt=f==="all"?allApplicable.length:allApplicable.filter(t=>t.strideCategory===f).length;
                  return (
                    <button key={f} onClick={()=>setActiveFilter(f)} style={{
                      padding:"4px 10px",borderRadius:4,fontSize:10,fontFamily:"monospace",cursor:"pointer",
                      background:activeFilter===f?col:"transparent",border:`1px solid ${col}`,
                      color:activeFilter===f?"#000":"#4a5568",transition:"all .12s"
                    }}>
                      {f==="all"?"All":f} ({cnt})
                    </button>
                  );
                })}
              </div>

              {filteredThreats.map(t => {
                const sc=STRIDE_CATS.find(s=>s.id===t.strideCategory);
                const s=+(t.score.toFixed(1)), rv=riskOf(s);
                return (
                  <div key={`${t.nodeId}-${t.id}`} style={{background:CARD,border:`1px solid ${BDR}`,borderLeft:`3px solid ${sc?.color}`,borderRadius:6,padding:"12px 14px",marginBottom:8}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8,flexWrap:"wrap",gap:6}}>
                      <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
                        <Tag label={`${sc?.id} · ${sc?.name}`} color={sc?.color||"#fff"}/>
                        <span style={{color:t.nodeColor,fontSize:11,fontFamily:"monospace"}}>@ {t.nodeLabel}</span>
                      </div>
                      <div style={{display:"flex",gap:6,alignItems:"center"}}>
                        {s>0 && <Tag label={`${rv.label} · ${s}`} color={rv.color} bg={rv.bg}/>}
                        <div style={{display:"flex",gap:3}}>
                          {[["applicable","Ok","#30d158"],["not-applicable","No","#ef4444"]].map(([st,l,c])=>(
                            <button key={st} onClick={()=>setThreatStatus(t.nodeId,t.id,st)}
                              style={{minWidth:28,height:22,padding:"0 4px",borderRadius:3,border:`1px solid ${t.status===st?c:BDR}`,background:t.status===st?`${c}20`:"transparent",color:t.status===st?c:MUT,cursor:"pointer",fontSize:10}}>
                              {l}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div style={{color:TXT,fontSize:13,fontWeight:500,marginBottom:4}}>{t.title}</div>
                    <div style={{color:MUT,fontSize:12,lineHeight:1.6,marginBottom:10}}>{t.description}</div>
                    <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:8}}>
                      {DREAD_DIMS.map(d=>{
                        const v=t.dread?.[d.id]||5;
                        return (
                          <div key={d.id}>
                            <div style={{color:"#2a3d5a",fontSize:9,fontFamily:"monospace",marginBottom:3}}>{d.label}</div>
                            <input type="range" min={1} max={10} step={1} value={v}
                              onChange={e=>setThreatDread(t.nodeId,t.id,d.id,+e.target.value)}
                              style={{width:"100%",accentColor:sc?.color}}/>
                            <div style={{color:sc?.color,fontSize:10,fontFamily:"monospace",textAlign:"center"}}>{v}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </>)}
          </div>
        </div>
      )}

      {/* ══════════════════ REPORT VIEW ════════════════════════ */}
      {view==="report" && (
        <div style={{flex:1,overflow:"auto",padding:20}}>
          <div style={{maxWidth:860,margin:"0 auto"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
              <h2 style={{fontSize:16,fontWeight:600,fontFamily:"monospace",letterSpacing:1}}>THREAT MODELING REPORT</h2>
              <div style={{display:"flex",gap:8}}>
                <button onClick={generateMit} disabled={mitLoading||!allApplicable.length} style={{
                  padding:"7px 14px",background:mitLoading?"transparent":ACT,
                  border:`1px solid ${ACT}`,borderRadius:5,cursor:(mitLoading||!allApplicable.length)?"default":"pointer",
                  color:mitLoading?ACT:"#000",fontSize:12,fontWeight:600
                }}>
                  {mitLoading?"Generating...":"Generate Remediation"}
                </button>
                <button onClick={()=>window.print()} style={{padding:"7px 14px",background:"transparent",border:`1px solid ${BDR}`,borderRadius:5,color:MUT,cursor:"pointer",fontSize:12}}>Print</button>
              </div>
            </div>

            {/* Executive Summary */}
            <div style={{background:CARD,border:`1px solid ${BDR}`,borderRadius:8,padding:16,marginBottom:12}}>
              <div style={{color:ACT,fontFamily:"monospace",fontSize:9,letterSpacing:2,marginBottom:10}}>EXECUTIVE SUMMARY</div>
              <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap"}}>
                {[{l:"Components",v:nodes.filter(n=>n.type!=="boundary").length,c:ACT},{l:"Data Flows",v:edges.length,c:"#a78bfa"},{l:"Threats",v:allApplicable.length,c:"#ff9f0a"},{l:"Critical",v:critN,c:"#ff2d55"}].map(x=><Pill key={x.l} label={x.l} value={x.v} color={x.c}/>)}
              </div>
              <p style={{color:"#94a3b8",fontSize:13,lineHeight:1.8}}>
                Threat modeling was performed on <strong style={{color:TXT}}>{appName}</strong>
                {appStack && <> using <strong style={{color:TXT}}>{appStack}</strong></>}.
                The STRIDE methodology identified <strong style={{color:TXT}}>{allApplicable.length} applicable threats</strong> across {nodes.filter(n=>n.type!=="boundary").length} components and {edges.length} data flows.
                {critN>0&&<> <strong style={{color:"#ff2d55"}}>{critN} Critical</strong> severity threats require immediate attention.</>}
              </p>
            </div>

            {/* Architecture */}
            {nodes.length>0 && <div style={{background:CARD,border:`1px solid ${BDR}`,borderRadius:8,padding:16,marginBottom:12}}>
              <div style={{color:MUT,fontFamily:"monospace",fontSize:9,letterSpacing:2,marginBottom:10}}>ARCHITECTURE COMPONENTS</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                {nodes.map(n=><span key={n.id} style={{background:`${n.color}10`,border:`1px solid ${n.color}28`,color:n.color,padding:"4px 10px",borderRadius:4,fontSize:12}}>{n.label}<span style={{opacity:.4,marginLeft:5}}>({n.type})</span></span>)}
              </div>
            </div>}

            {/* STRIDE Breakdown */}
            {allApplicable.length>0 && <div style={{background:CARD,border:`1px solid ${BDR}`,borderRadius:8,padding:16,marginBottom:12}}>
              <div style={{color:MUT,fontFamily:"monospace",fontSize:9,letterSpacing:2,marginBottom:10}}>STRIDE BREAKDOWN</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
                {STRIDE_CATS.map(s=>{const cnt=allApplicable.filter(t=>t.strideCategory===s.id).length;return(
                  <div key={s.id} style={{background:`${s.color}10`,border:`1px solid ${s.color}28`,borderRadius:6,padding:"8px 14px",textAlign:"center",minWidth:100}}>
                    <div style={{color:s.color,fontSize:18,fontFamily:"monospace",fontWeight:700}}>{cnt}</div>
                    <div style={{color:s.color,fontSize:10,fontFamily:"monospace"}}>{s.id}</div>
                    <div style={{color:MUT,fontSize:10}}>{s.name}</div>
                  </div>
                );})}
              </div>
            </div>}

            {/* Threat Table */}
            {allApplicable.length>0 && <div style={{background:CARD,border:`1px solid ${BDR}`,borderRadius:8,padding:16,marginBottom:12,overflowX:"auto"}}>
              <div style={{color:MUT,fontFamily:"monospace",fontSize:9,letterSpacing:2,marginBottom:12}}>THREAT REGISTER ({allApplicable.length})</div>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                <thead>
                  <tr style={{borderBottom:`1px solid ${BDR}`}}>
                    {["Component","STRIDE","Threat","D","R","E","A","Di","Score","Risk"].map(h=>(
                      <th key={h} style={{padding:"6px 8px",textAlign:"left",color:MUT,fontFamily:"monospace",fontWeight:400,whiteSpace:"nowrap"}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {allApplicable.map((t,i)=>{
                    const sc=STRIDE_CATS.find(s=>s.id===t.strideCategory);
                    const s=+(t.score.toFixed(1)),rv=riskOf(s);
                    return <tr key={i} style={{borderBottom:`1px solid #0a1020`,background:i%2?"rgba(255,255,255,.008)":"transparent"}}>
                      <td style={{padding:"7px 8px",color:t.nodeColor}}>{t.nodeLabel}</td>
                      <td style={{padding:"7px 8px"}}><Tag label={sc?.id||"?"} color={sc?.color||"#fff"}/></td>
                      <td style={{padding:"7px 8px",color:"#cbd5e1"}}>{t.title}</td>
                      {["damage","reproducibility","exploitability","affectedUsers","discoverability"].map(d=>(
                        <td key={d} style={{padding:"7px 8px",fontFamily:"monospace",color:MUT,textAlign:"center"}}>{t.dread?.[d]||"—"}</td>
                      ))}
                      <td style={{padding:"7px 8px",fontFamily:"monospace",color:rv.color,fontWeight:700}}>{s||"—"}</td>
                      <td style={{padding:"7px 8px"}}><Tag label={rv.label} color={rv.color} bg={rv.bg}/></td>
                    </tr>;
                  })}
                </tbody>
              </table>
            </div>}

            {/* Mitigations */}
            {Object.keys(mitigations).length>0 && <div style={{background:CARD,border:`1px solid ${BDR}`,borderRadius:8,padding:16,marginBottom:12}}>
              <div style={{color:"#30d158",fontFamily:"monospace",fontSize:9,letterSpacing:2,marginBottom:12}}>REMEDIATION RECOMMENDATIONS</div>
              {allApplicable.map(t=>{
                const mit=mitigations[t.id]; if(!mit) return null;
                const sc=STRIDE_CATS.find(s=>s.id===t.strideCategory);
                const ec={"Low":"#30d158","Medium":"#ff9f0a","High":"#ff2d55"}[mit.effort]||MUT;
                return <div key={t.id} style={{paddingBottom:14,marginBottom:14,borderBottom:`1px solid ${BDR}`}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6,gap:8,flexWrap:"wrap"}}>
                    <div>
                      <span style={{color:t.nodeColor,fontSize:11,marginRight:8}}>@ {t.nodeLabel}</span>
                      <span style={{color:TXT,fontSize:13,fontWeight:500}}>{t.title}</span>
                    </div>
                    <div style={{display:"flex",gap:5,flexShrink:0}}>
                      <Tag label={`Effort: ${mit.effort}`} color={ec}/>
                      <Tag label={sc?.id||""} color={sc?.color||"#fff"}/>
                    </div>
                  </div>
                  <div style={{color:"#30d158",fontSize:13,marginBottom:6}}>- {mit.shortFix}</div>
                  {mit.steps?.map((s,i)=><div key={i} style={{color:MUT,fontSize:12,paddingLeft:14,marginBottom:2}}>{i+1}. {s}</div>)}
                  {mit.control&&<div style={{color:"#2a3d5a",fontSize:11,marginTop:6}}>Control: <span style={{color:"#334155"}}>{mit.control}</span></div>}
                </div>;
              })}
            </div>}

            <div style={{textAlign:"center",color:"#182038",fontSize:10,fontFamily:"monospace",marginTop:16,paddingBottom:8}}>
              ThreatModeler · {appName} · {new Date().toLocaleDateString()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

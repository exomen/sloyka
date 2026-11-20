import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import yaml from 'js-yaml';
import { SAMPLE } from './sample.js';
import { AWS_WEB } from './aws-web.js';
import { AWS_SERVERLESS } from './aws-serverless.js';
import { AWS_DATA } from './aws-data.js';
const EXAMPLES = { 'aws-web': AWS_WEB, 'aws-serverless': AWS_SERVERLESS, 'aws-data': AWS_DATA, simple: SAMPLE };
const EXAMPLE_NAMES = { 'aws-web': 'AWS three-tier web app', 'aws-serverless': 'AWS serverless orders', 'aws-data': 'AWS data lake', simple: 'Simple AWS app' };

// ---------- Standard ----------
const TYPES = ['boundary', 'system', 'container', 'component', 'datastore', 'queue', 'actor'];
const CONTAINER_TYPES = new Set(['boundary', 'system', 'container']);
const CONTAINS = {
  boundary: ['boundary', 'system', 'container', 'component', 'datastore', 'queue', 'actor'],
  system: ['system', 'container', 'component', 'datastore', 'queue'],
  container: ['component', 'datastore', 'queue'],
  component: [], datastore: [], queue: [], actor: [],
};
const LEAF_SIZE = {
  component: [2.4, 1.1, 1.6], datastore: [1.8, 1.6, 1.8], queue: [2.8, 0.9, 1.0],
  actor: [1.2, 1.9, 1.2], system: [3, 1.6, 2.2], container: [2.6, 1.3, 1.8], boundary: [4, 2, 4],
};
const TYPE_COLOR = {
  boundary: '#8b5cf6', system: '#64748b', container: '#3b82f6', component: '#60a5fa',
  datastore: '#10b981', queue: '#f472b6', actor: '#f59e0b',
};
const CONN = {
  sync: { color: '#38bdf8', r: 0.07, speed: 1.4, desc: 'Synchronous call' },
  async: { color: '#c084fc', r: 0.06, speed: 0.7, desc: 'Async / event / internal flow' },
  replication: { color: '#34d399', r: 0.09, speed: 0.5, desc: 'Data replication' },
  deploy: { color: '#a78bfa', r: 0.045, speed: 0.3, desc: 'Deploys onto' },
  depends: { color: '#94a3b8', r: 0.045, speed: 0.25, desc: 'Depends on' },
  webhook: { color: '#f97316', r: 0.08, speed: 1.6, desc: 'Webhook (HTTP POST)' },
  api: { color: '#38bdf8', r: 0.06, speed: 1.2, desc: 'API call' },
  network: { color: '#cbd5e1', r: 0.1, speed: 0.9, desc: 'Network path (outbound HTTPS)' },
  auth: { color: '#facc15', r: 0.045, speed: 0.6, desc: 'Authenticates with / grants' },
  data: { color: '#34d399', r: 0.07, speed: 1.0, desc: 'Data / file transfer' },
  lifecycle: { color: '#f472b6', r: 0.06, speed: 0.8, desc: 'Lifecycle order / runs' },
  flow: { color: '#f8fafc', r: 0.05, speed: 1.2, desc: 'Flow-only step (no modelled connection)' },
};
const PAD = 0.9, GAP = 1.4;
const DEPTH_OPACITY = [0.07, 0.11, 0.15, 0.19, 0.23];
const STORE_KEY = 'sloyka.model.v2';
// One-time move of browser state saved under the old Arch3D key names.
try {
  const old = Object.keys(localStorage).filter((k) => k.startsWith('arch3d.'));
  old.forEach((k) => {
    const nk = `sloyka.${k.slice(7)}`;
    if (localStorage.getItem(nk) == null) localStorage.setItem(nk, localStorage.getItem(k));
    localStorage.removeItem(k);
  });
} catch (_) { /* storage unavailable */ }
const HEADER = `# Sloyka model (v1). Edit me: the scene updates live.
# Element types: ${TYPES.join(', ')}
# Connection types: ${Object.keys(CONN).join(', ')}
`;

// ---------- State ----------
let model = null;
const nodes = new Map();
let roots = [];
let wires = [];
let selected = null;
let focusLayer = null;
const hiddenLayers = new Set();
const opts = { addMode: false, move: false, snap: true, flow: true, solid: false, k: 1, labelScale: 1 };
try { const v = Number(localStorage.getItem('sloyka.labelScale')); if (v >= 0.6 && v <= 2.4) opts.labelScale = v; } catch (_) { /* ignore */ }
const history = { list: [], i: -1 };
const camHistory = [];
let activeFlow = null; // { id, step } where step -1 = all steps
let recording = null; // { name, steps, last }
let playing = null;
const hiddenConnTypes = new Set(); // connection types hidden in the view
const hiddenConns = new Set(); // single connections hidden in the view (by key)
let selectedConn = null; // key of the focused connection (the "current" item when it's a wire)
// Custom focus view: elements + connections pinned together, with parent levels per end.
// up keys: 's:<connKey>' / 't:<connKey>' (source/target parents), 'n:<id>' (element parents).
let fview = null; // { nodes, conns, up, flowId? }
// Isolate mode: the scene is rebuilt from a derived model holding only the view's subset.
let isolate = false;
let fullModel = null; // the real model while isolated (model holds the derived subset)
const APP_VERSION = '0.17';
// Connection filters for a selected element (outside of a pinned view).
let elemShowConns = true; // master on/off
const elemHiddenTypes = new Set(); // types filtered out (kept across selections)
const elemConnOff = new Set(); // single connections switched off (reset per element)
let elemConnFor = null; // { nodes: Set, conns: Set, up: Map }
const visibleFlows = new Set(); // flows shown as overlays in the view (any number)
const FLOW_COLORS = ['#f97316', '#22d3ee', '#a3e635', '#f472b6', '#facc15', '#c084fc', '#34d399', '#fb7185'];
opts.follow = true;

// ---------- DOM ----------
const $ = (s) => document.querySelector(s);
const viewport = $('#viewport');
const editor = $('#editor');
const msgs = $('#msgs');

// ---------- Three setup ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setClearColor(0x0b1020);
viewport.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x0b1020, 80, 180);
const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 500);
camera.position.set(28, 24, 32);
const orbit = new OrbitControls(camera, renderer.domElement);
orbit.enableDamping = true;
orbit.dampingFactor = 0.08;
scene.add(new THREE.HemisphereLight(0xdbeafe, 0x1e293b, 1.1));
const sun = new THREE.DirectionalLight(0xffffff, 1.4);
sun.position.set(20, 40, 25);
scene.add(sun);
const grid = new THREE.GridHelper(120, 120, 0x334155, 0x1e293b);
grid.material.transparent = true;
grid.material.opacity = 0.5;
scene.add(grid);
const world = new THREE.Group();
scene.add(world);
const wireGroup = new THREE.Group();
scene.add(wireGroup);
const flowGroup = new THREE.Group();
scene.add(flowGroup);

const tc = new TransformControls(camera, renderer.domElement);
tc.size = 0.85;
tc.setTranslationSnap(0.5);
tc.addEventListener('dragging-changed', (e) => {
  orbit.enabled = !e.value;
  if (!e.value) onDragEnd();
});
let wireRebuildPending = false;
tc.addEventListener('objectChange', () => {
  if (wireRebuildPending) return;
  wireRebuildPending = true;
  requestAnimationFrame(() => { wireRebuildPending = false; buildWires(); applyVisuals(); });
});
scene.add(tc);

function resize() {
  const w = viewport.clientWidth, h = viewport.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / Math.max(h, 1);
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(viewport);

// ---------- Textures ----------
const flowTex = (() => {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 8;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 128, 0);
  grad.addColorStop(0, '#5a5a5a');
  grad.addColorStop(0.55, '#7a7a7a');
  grad.addColorStop(0.8, '#ffffff');
  grad.addColorStop(1, '#5a5a5a');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 8);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
})();

function makeLabel(text, sub, height, kind = 'leaf') {
  const c = document.createElement('canvas');
  const g = c.getContext('2d');
  const S = 2; // render at 2x for sharp text when labels are enlarged
  const f1 = `600 ${44 * S}px system-ui, -apple-system, Segoe UI, sans-serif`;
  const f2 = `400 ${28 * S}px system-ui, -apple-system, Segoe UI, sans-serif`;
  g.font = f1;
  const w1 = g.measureText(text).width;
  g.font = f2;
  const w2 = sub ? g.measureText(sub).width : 0;
  const W = Math.ceil(Math.max(w1, w2) + 36 * S), H = (sub ? 96 : 64) * S;
  c.width = W; c.height = H;
  g.fillStyle = 'rgba(11,16,32,0.82)';
  g.beginPath();
  g.roundRect(0, 0, W, H, 14 * S);
  g.fill();
  g.fillStyle = '#f1f5f9';
  g.font = f1;
  g.textBaseline = 'top';
  g.fillText(text, 18 * S, 10 * S);
  if (sub) { g.fillStyle = '#94a3b8'; g.font = f2; g.fillText(sub, 18 * S, 60 * S); }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true });
  const s = new THREE.Sprite(mat);
  s.scale.set((W / H) * height, height, 1);
  s.renderOrder = 1000;
  Object.assign(s.userData, { baseH: height, aspect: W / H, ...LABEL_PX[kind] });
  return s;
}

// On-screen size limits (CSS px) per label kind; scaled by the label-size control.
const LABEL_PX = {
  leaf: { minPx: 16, maxPx: 34 },
  container: { minPx: 20, maxPx: 40 },
  wire: { minPx: 13, maxPx: 26 },
  badge: { minPx: 24, maxPx: 42 },
  badgeDim: { minPx: 16, maxPx: 28 },
};
const _lp = new THREE.Vector3();
function scaleLabels() {
  const h = renderer.domElement.clientHeight || 1;
  const perPx = (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) / h; // world units per px at distance 1
  const scaleOne = (o) => {
    if (!o.isSprite || !o.userData.baseH || !o.visible) return;
    if (!o.userData.emph) { o.scale.set(o.userData.baseH * o.userData.aspect, o.userData.baseH, 1); return; }
    o.getWorldPosition(_lp);
    const d = Math.max(0.1, _lp.distanceTo(camera.position));
    const px = o.userData.baseH / (d * perPx);
    const target = THREE.MathUtils.clamp(px, o.userData.minPx * opts.labelScale, o.userData.maxPx * opts.labelScale);
    const wh = target * d * perPx;
    o.scale.set(wh * o.userData.aspect, wh, 1);
  };
  world.traverse(scaleOne); wireGroup.traverse(scaleOne); flowGroup.traverse(scaleOne);
}

// ---------- Documentation links ----------
// docs can be a URL, { title, url }, or a list of either, on elements, connections, flows, steps, layers or the model.
// Without a title, the link text is derived from the URL path.
const DOC_WORDS = { github: 'GitHub', gitlab: 'GitLab', oidc: 'OIDC', api: 'API', rest: 'REST', graphql: 'GraphQL', mcp: 'MCP', sso: 'SSO', saml: 'SAML', cli: 'CLI', aws: 'AWS', ci: 'CI', k8s: 'k8s', eventbridge: 'EventBridge', opentelemetry: 'OpenTelemetry', ai: 'AI', iam: 'IAM', vpc: 'VPC', dns: 'DNS', sql: 'SQL' };
const GENERIC_SEG = new Set(['overview', 'using', 'directory', 'installing', 'reference', 'tools', 'welcome', 'introduction', 'intro', 'index', 'what-is']);
function humanSeg(seg) {
  return seg.split(/[-_]/).map((w, i) => DOC_WORDS[w.toLowerCase()] || (i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w)).join(' ');
}
function docTitle(url) {
  try {
    const u = new URL(url);
    const segs = u.pathname.replace(/\.(md|html?)$/i, '').split('/').filter(Boolean);
    if (!segs.length || (segs.length === 1 && segs[0] === 'docs')) return `${u.hostname.replace(/^www\./, '')} docs`;
    const last = segs[segs.length - 1];
    const t = humanSeg(last);
    return GENERIC_SEG.has(last.toLowerCase()) && segs.length > 1 ? `${humanSeg(segs[segs.length - 2])} › ${t}` : t;
  } catch (_) { return url; }
}
const isWebUrl = (u) => typeof u === 'string' && /^https?:\/\/[^\s]+$/i.test(u);
function normDocs(v) {
  if (v == null) return [];
  const list = Array.isArray(v) ? v : [v];
  return list.map((d) => (typeof d === 'string' ? { url: d } : d && typeof d === 'object' ? { url: d.url, title: d.title } : null))
    .filter((d) => d && isWebUrl(d.url))
    .map((d) => ({ url: d.url, title: d.title ? String(d.title) : docTitle(d.url) }));
}
function docsHtml(v, cls = '') {
  const list = normDocs(v);
  if (!list.length) return '';
  return `<div class="docs ${cls}"><span class="dicon" aria-hidden="true">📖</span>${list.map((d) =>
    `<a href="${esc(d.url)}" target="_blank" rel="noopener noreferrer" title="${esc(d.url)}">${esc(d.title)} ↗</a>`).join('')}</div>`;
}
function checkDocs(v, where, warnings) {
  if (v == null) return;
  (Array.isArray(v) ? v : [v]).forEach((d) => {
    const u = typeof d === 'string' ? d : d && d.url;
    if (!isWebUrl(u)) warnings.push(`${where}: docs link "${u}" isn't an http(s) URL, so it's ignored.`);
  });
}

// ---------- Model ----------
function parseModel(text) {
  const errors = [], warnings = [];
  let m;
  try { m = yaml.load(text); } catch (e) { return { errors: [e.message.split('\n')[0]], warnings }; }
  if (!m || typeof m !== 'object') return { errors: ['The model must be a YAML object.'], warnings };
  m.layers = Array.isArray(m.layers) ? m.layers : [];
  m.elements = Array.isArray(m.elements) ? m.elements : [];
  m.connections = Array.isArray(m.connections) ? m.connections : [];
  const ids = new Set();
  const layerIds = new Set(m.layers.map((l) => l && l.id));
  const walk = (list, parent, path) => list.forEach((el, i) => {
    if (!el || typeof el !== 'object') { errors.push(`${path}[${i}] is not an element.`); return; }
    if (el.id == null) errors.push(`Element at ${path}[${i}] has no id.`);
    else if (ids.has(String(el.id))) errors.push(`Duplicate id "${el.id}".`);
    else { el.id = String(el.id); ids.add(el.id); }
    if (!TYPES.includes(el.type)) errors.push(`"${el.id}": unknown type "${el.type}".`);
    if (parent && CONTAINS[parent.type] && TYPES.includes(el.type) && !CONTAINS[parent.type].includes(el.type))
      warnings.push(`"${parent.id}" (${parent.type}) shouldn't contain "${el.id}" (${el.type}).`);
    if (el.layer != null && !layerIds.has(el.layer)) warnings.push(`"${el.id}": unknown layer "${el.layer}".`);
    if (el.pos != null && !(Array.isArray(el.pos) && el.pos.length === 3 && el.pos.every(Number.isFinite)))
      errors.push(`"${el.id}": pos must be [x, y, z].`);
    if (el.children != null && !Array.isArray(el.children)) errors.push(`"${el.id}": children must be a list.`);
    if (Array.isArray(el.children)) walk(el.children, el, `${el.id}.children`);
  });
  walk(m.elements, null, 'elements');
  m.connections.forEach((c, i) => {
    if (!c || typeof c !== 'object') { errors.push(`Connection ${i + 1} is not an object.`); return; }
    if (!ids.has(String(c.from))) errors.push(`Connection ${i + 1}: unknown "from" id "${c.from}".`);
    if (!ids.has(String(c.to))) errors.push(`Connection ${i + 1}: unknown "to" id "${c.to}".`);
    if (c.type != null && !CONN[c.type]) errors.push(`Connection ${i + 1}: unknown type "${c.type}".`);
  });
  checkDocs(m.docs, 'Model', warnings);
  m.layers.forEach((l) => l && checkDocs(l.docs, `Layer "${l.id}"`, warnings));
  const walkDocs = (list) => list.forEach((el) => { if (el && typeof el === 'object') { checkDocs(el.docs, `"${el.id}"`, warnings); if (Array.isArray(el.children)) walkDocs(el.children); } });
  walkDocs(m.elements);
  m.connections.forEach((c, i) => c && checkDocs(c.docs, `Connection ${i + 1}`, warnings));
  m.flows = Array.isArray(m.flows) ? m.flows : [];
  const fids = new Set();
  m.flows.forEach((f, i) => {
    if (!f || typeof f !== 'object') { errors.push(`Flow ${i + 1} is not an object.`); return; }
    if (f.id == null) errors.push(`Flow ${i + 1} has no id.`);
    else if (fids.has(String(f.id))) errors.push(`Duplicate flow id "${f.id}".`);
    else { f.id = String(f.id); fids.add(f.id); }
    if (!Array.isArray(f.steps)) { errors.push(`Flow "${f.id}": steps must be a list.`); f.steps = []; return; }
    checkDocs(f.docs, `Flow "${f.id}"`, warnings);
    f.steps.forEach((st, j) => {
      if (!st || typeof st !== 'object') { errors.push(`Flow "${f.id}" step ${j + 1} is not an object.`); return; }
      checkDocs(st.docs, `Flow "${f.id}" step ${j + 1}`, warnings);
      if (!ids.has(String(st.from)) || !ids.has(String(st.to))) errors.push(`Flow "${f.id}" step ${j + 1}: unknown element "${ids.has(String(st.from)) ? st.to : st.from}".`);
      if (st.type != null && !CONN[st.type]) errors.push(`Flow "${f.id}" step ${j + 1}: unknown type "${st.type}".`);
    });
  });
  return { model: m, errors, warnings };
}

const flow = (v) => yaml.dump(v, { flowLevel: 0, lineWidth: 1000 }).trim();
function dumpModel(m) {
  const out = [HEADER + `version: ${m.version ?? 1}`, '', 'layers:'];
  m.layers.forEach((l) => out.push(`  - ${flow(l)}`));
  out.push('', 'elements:');
  const emit = (el, ind) => {
    const p = ' '.repeat(ind);
    if (!el.children || !el.children.length) { out.push(`${p}- ${flow(el)}`); return; }
    const { children, ...rest } = el;
    Object.entries(rest).forEach(([k, v], i) => out.push(`${p}${i ? '  ' : '- '}${k}: ${flow(v)}`));
    out.push(`${p}  children:`);
    children.forEach((c) => emit(c, ind + 4));
  };
  m.elements.forEach((el) => emit(el, 2));
  out.push('', 'connections:');
  m.connections.forEach((c) => out.push(`  - ${flow(c)}`));
  if (m.flows && m.flows.length) {
    out.push('', 'flows:');
    m.flows.forEach((f) => {
      const { steps, ...rest } = f;
      Object.entries(rest).forEach(([k, v], i) => out.push(`  ${i ? '  ' : '- '}${k}: ${flow(v)}`));
      out.push('    steps:');
      (steps || []).forEach((st) => out.push(`      - ${flow(st)}`));
    });
  }
  return out.join('\n') + '\n';
}

// ---------- Scene build ----------
function disposeTree(obj) {
  obj.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      (Array.isArray(o.material) ? o.material : [o.material]).forEach((mt) => {
        if (mt.map && mt.map !== flowTex) mt.map.dispose();
        mt.dispose();
      });
    }
  });
  obj.clear();
}

function colorFor(el, layer) {
  if (el.color) return el.color;
  const l = model.layers.find((x) => x.id === layer);
  return (l && l.color) || TYPE_COLOR[el.type] || '#94a3b8';
}

function leafGeometry(type, s) {
  if (type === 'datastore') return new THREE.CylinderGeometry(s.x / 2, s.x / 2, s.y, 40);
  if (type === 'queue') { const g = new THREE.CapsuleGeometry(s.y / 2, s.x - s.y, 8, 24); g.rotateZ(Math.PI / 2); return g; }
  if (type === 'actor') return new THREE.CapsuleGeometry(s.x / 2, s.y - s.x, 8, 24);
  return new THREE.BoxGeometry(s.x, s.y, s.z);
}

function buildNode(el, parent, depth) {
  const layer = el.layer ?? (parent && parent.layer) ?? null;
  const node = { el, parent, depth, layer, children: [], group: new THREE.Group() };
  node.group.userData.node = node;
  nodes.set(el.id, node);
  (el.children || []).forEach((c) => {
    const child = buildNode(c, node, depth + 1);
    node.children.push(child);
    node.group.add(child.group);
  });
  const isContainer = node.children.length > 0;
  node.isContainer = isContainer;
  if (isContainer) {
    layoutChildren(node.children);
    const min = new THREE.Vector3(Infinity, Infinity, Infinity), max = min.clone().negate();
    node.children.forEach((c) => {
      const cmin = c.group.position.clone().add(c.center).addScaledVector(c.size, -0.5);
      const cmax = c.group.position.clone().add(c.center).addScaledVector(c.size, 0.5);
      if (c.label && c.isContainer) cmax.y += 0.6; // room for child container labels
      min.min(cmin); max.max(cmax);
    });
    min.subScalar(PAD); max.addScalar(PAD);
    node.size = max.clone().sub(min);
    node.center = min.clone().add(max).multiplyScalar(0.5);
  } else {
    node.size = new THREE.Vector3(...(LEAF_SIZE[el.type] || LEAF_SIZE.component));
    node.center = new THREE.Vector3();
  }
  node.baseColor = new THREE.Color(colorFor(el, layer));
  const geom = isContainer ? new THREE.BoxGeometry(node.size.x, node.size.y, node.size.z) : leafGeometry(el.type, node.size);
  const mat = new THREE.MeshStandardMaterial({
    color: node.baseColor.clone(), roughness: 0.55, metalness: 0.05, transparent: true,
    side: isContainer ? THREE.DoubleSide : THREE.FrontSide, depthWrite: false,
  });
  node.mesh = new THREE.Mesh(geom, mat);
  node.mesh.position.copy(node.center);
  node.mesh.userData.node = node;
  node.mesh.renderOrder = isContainer ? depth : 100;
  const edgeMat = el.type === 'boundary'
    ? new THREE.LineDashedMaterial({ color: node.baseColor.clone(), dashSize: 0.5, gapSize: 0.3, transparent: true })
    : new THREE.LineBasicMaterial({ color: node.baseColor.clone(), transparent: true });
  node.edges = new THREE.LineSegments(new THREE.EdgesGeometry(geom, 30), edgeMat);
  if (el.type === 'boundary') node.edges.computeLineDistances();
  node.edges.position.copy(node.center);
  node.edges.renderOrder = node.mesh.renderOrder;
  node.group.add(node.mesh, node.edges);
  node.label = makeLabel(el.name || el.id, isContainer ? el.type : null, isContainer ? 0.75 : 0.5, isContainer ? 'container' : 'leaf');
  node.label.userData.node = node;
  node.label.userData.isLabel = true;
  if (isContainer) {
    node.label.center.set(0, 0); // anchor bottom-left at the box's top-front-left corner
    node.label.position.set(node.center.x - node.size.x / 2 + 0.2, node.center.y + node.size.y / 2 + 0.15, node.center.z + node.size.z / 2 - 0.3);
  } else {
    node.label.center.set(0.5, 0); // anchor bottom-centre just above the element
    node.label.position.set(0, node.size.y / 2 + 0.15, 0);
  }
  node.group.add(node.label);
  return node;
}

function layoutChildren(list) {
  list.filter((c) => Array.isArray(c.el.pos)).forEach((c) => c.group.position.set(...c.el.pos));
  const auto = list.filter((c) => !Array.isArray(c.el.pos));
  if (!auto.length) return;
  const cols = Math.ceil(Math.sqrt(auto.length));
  const rows = Math.ceil(auto.length / cols);
  const cw = Math.max(...auto.map((c) => c.size.x)) + GAP;
  const cd = Math.max(...auto.map((c) => c.size.z)) + GAP;
  auto.forEach((c, i) => {
    const col = i % cols, row = Math.floor(i / cols);
    const x = col * cw - ((cols - 1) * cw) / 2;
    const z = row * cd - ((rows - 1) * cd) / 2;
    c.group.position.set(x - c.center.x, -c.center.y + c.size.y / 2, z - c.center.z);
  });
}

function build() {
  tc.detach();
  disposeTree(world);
  nodes.clear();
  roots = model.elements.map((el) => buildNode(el, null, 0));
  layoutChildren(roots);
  roots.forEach((r) => world.add(r.group));
  world.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(world);
  if (!box.isEmpty()) grid.position.y = box.min.y - 0.6;
  if (selected && !nodes.has(selected)) selected = null;
  if (focusLayer && !model.layers.some((l) => l.id === focusLayer)) focusLayer = null;
  const keyOk = (k) => (k.startsWith('flow:') ? model.flows.some((f) => k.startsWith(`flow:${f.id}|`)) : model.connections.some((c) => connKey(c) === k.split('#')[0]));
  if (selectedConn && !keyOk(selectedConn)) selectedConn = null;
  if (fview) {
    [...fview.conns].forEach((k) => { if (!keyOk(k)) fview.conns.delete(k); });
    [...fview.nodes].forEach((id) => { if (!nodes.has(id)) fview.nodes.delete(id); });
    if (!fview.conns.size && !fview.nodes.size) fview = null;
  }
  if (activeFlow && activeFlow.id !== '__rec' && !model.flows.some((f) => f.id === activeFlow.id)) activeFlow = null;
  if (activeFlow && activeFlow.id !== '__rec') {
    const f = model.flows.find((x) => x.id === activeFlow.id);
    if (f && activeFlow.step >= f.steps.length) activeFlow.step = f.steps.length ? f.steps.length - 1 : -1;
  }
  document.body.classList.toggle('flow-on', !!(activeFlow && activeFlow.id !== '__rec'));
  if (!isolate) [...visibleFlows].forEach((id) => { if (!model.flows.some((f) => f.id === id)) visibleFlows.delete(id); });
  if (recording) recording.steps = recording.steps.filter((st) => nodes.has(String(st.from)) && nodes.has(String(st.to)));
  buildWires();
  applyVisuals();
  renderOutline();
  renderLayers();
  renderProps();
  renderFlowsPane();
  renderFlowbar();
  renderLinks();
  renderIsobar();
  renderKey();
  attachGizmo();
}

function insideBox(p, box) { return box.containsPoint(p); }

function makeWire(c) {
  const a = nodes.get(String(c.from)), b = nodes.get(String(c.to));
  if (!a || !b || a === b) return null;
  const style = CONN[c.type] || CONN.sync;
  const p0 = a.mesh.getWorldPosition(new THREE.Vector3());
  const p3 = b.mesh.getWorldPosition(new THREE.Vector3());
  const dist = p0.distanceTo(p3);
  const lift = new THREE.Vector3(0, Math.min(5, 0.8 + dist * 0.2), 0);
  const base = new THREE.CatmullRomCurve3([
    p0, p0.clone().lerp(p3, 0.33).add(lift), p0.clone().lerp(p3, 0.66).add(lift), p3,
  ]);
  // Trim the wire to where it leaves the source and enters the target.
  const ba = new THREE.Box3().setFromObject(a.mesh), bb = new THREE.Box3().setFromObject(b.mesh);
  let t0 = 0, t1 = 1;
  if (!bb.containsBox(ba) && !ba.containsBox(bb)) {
    for (let t = 0; t < 1; t += 0.01) { if (!insideBox(base.getPointAt(t), ba)) { t0 = t; break; } }
    for (let t = 1; t > 0; t -= 0.01) { if (!insideBox(base.getPointAt(t), bb)) { t1 = t; break; } }
    if (t1 - t0 < 0.05) { t0 = 0; t1 = 1; }
  }
  const pts = [];
  for (let i = 0; i <= 40; i++) pts.push(base.getPointAt(t0 + ((t1 - t0) * i) / 40));
  const curve = new THREE.CatmullRomCurve3(pts);
  const len = curve.getLength();
  const tex = flowTex.clone();
  tex.needsUpdate = true;
  tex.repeat.set(Math.max(1, len / 1.6), 1);
  const color = new THREE.Color(style.color);
  const mat = new THREE.MeshBasicMaterial({ color, map: tex, transparent: true });
  const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 80, style.r, 8, false), mat);
  tube.renderOrder = 50;
  const g = new THREE.Group();
  g.add(tube);
  const end = curve.getPointAt(1), tan = curve.getTangentAt(1);
  const cone = new THREE.Mesh(new THREE.ConeGeometry(style.r * 3, style.r * 8, 16), new THREE.MeshBasicMaterial({ color, transparent: true }));
  cone.position.copy(end).addScaledVector(tan, -style.r * 3);
  cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tan);
  cone.renderOrder = 50;
  g.add(cone);
  const mid = curve.getPointAt(0.5);
  let label = null;
  if (c.label) {
    label = makeLabel(String(c.label), null, 0.36, 'wire');
    label.center.set(0.5, 0);
    label.position.copy(mid).add(new THREE.Vector3(0, 0.25, 0));
    g.add(label);
  }
  // Invisible, thicker tube so thin wires are easy to click.
  const hit = new THREE.Mesh(new THREE.TubeGeometry(curve, 40, Math.max(0.3, style.r * 4), 6, false), new THREE.MeshBasicMaterial({ visible: false }));
  g.add(hit);
  wireGroup.add(g);
  const w = { conn: c, a, b, tube, cone, label, hit, tex, mid, speed: style.speed, flowOnly: null, type: c.type && CONN[c.type] ? c.type : 'sync' };
  hit.userData.wire = w;
  if (label) { label.userData.wire = w; label.userData.isLabel = true; }
  return w;
}

function allFlows() {
  const list = (model && model.flows) || [];
  return recording ? [...list, { id: '__rec', name: recording.name, steps: recording.steps }] : list;
}
const sameEnds = (w, st) => (String(w.conn.from) === String(st.from) && String(w.conn.to) === String(st.to))
  || (String(w.conn.from) === String(st.to) && String(w.conn.to) === String(st.from));
function findWire(flowId, st) {
  return wires.find((w) => !w.flowOnly && sameEnds(w, st)) || wires.find((w) => w.flowOnly === flowId && sameEnds(w, st));
}

function connKey(c) { return `${c.from}|${c.to}|${c.type || 'sync'}|${c.label || ''}`; }

function buildWires() {
  disposeTree(wireGroup);
  wires = [];
  world.updateMatrixWorld(true);
  const seen = new Map();
  model.connections.forEach((c) => {
    const w = makeWire(c); if (!w) return;
    const base = connKey(c);
    const k = seen.get(base) || 0;
    seen.set(base, k + 1);
    w.key = k ? `${base}#${k}` : base;
    wires.push(w);
  });
  // Flow steps without a modelled connection get their own flow-only wire.
  allFlows().forEach((f) => f.steps.forEach((st) => {
    if (findWire(f.id, st)) return;
    const w = makeWire({ from: st.from, to: st.to, type: st.type || 'flow', label: st.label });
    if (w) { w.flowOnly = f.id; w.key = `flow:${f.id}|${st.from}|${st.to}`; wires.push(w); }
  }));
}

// ---------- Visual state ----------
const GHOST = new THREE.Color('#334155');
function subtree(node, out = []) { out.push(node.el.id); node.children.forEach((c) => subtree(c, out)); return out; }
function isHidden(node) { return node.layer != null && hiddenLayers.has(node.layer); }

function flowSteps() {
  const f = activeFlow && allFlows().find((x) => x.id === activeFlow.id);
  if (!f) return null;
  return f.steps.map((st, i) => ({ st, i, w: findWire(f.id, st) }));
}

function flowColor(f) {
  const i = model.flows.indexOf(f);
  return f.color || FLOW_COLORS[Math.max(0, i) % FLOW_COLORS.length];
}
function overlayFlows() {
  if (!model || !visibleFlows.size) return null;
  return model.flows.filter((f) => visibleFlows.has(f.id))
    .map((f) => ({ f, color: flowColor(f), steps: f.steps.map((st, i) => ({ st, i, w: findWire(f.id, st) })) }));
}

function applyVisuals() {
  let primary = null;
  const secondary = new Set();
  const fs = flowSteps();
  const inFlow = fs && fs.length && activeFlow.id !== '__rec';
  const flowWire = new Map();
  if (fs) {
    const cur = activeFlow.step;
    fs.forEach(({ st, i, w }) => {
      const on = cur < 0 || i === cur;
      if (inFlow) { const set = on ? primary || (primary = new Set()) : secondary; set.add(String(st.from)); set.add(String(st.to)); }
      if (w) flowWire.set(w, Math.max(flowWire.get(w) || 0, on ? 1 : (i < cur ? 0.45 : 0.22)));
    });
    if (primary) primary.forEach((id) => secondary.delete(id));
  }
  // Overlay mode: one or more flows toggled on (and no flow playing / being recorded).
  const inView = !inFlow && !!fview;
  const viewWires = new Set();
  if (inView) {
    primary = new Set();
    const addUp = (n, lv) => {
      let p = n.parent;
      for (let i = 0; i < (lv || 0) && p; i++) {
        primary.add(p.el.id);
        p.children.forEach((c) => secondary.add(c.el.id)); // siblings give context
        p = p.parent;
      }
    };
    fview.conns.forEach((k) => {
      const w = wires.find((x) => x.key === k); if (!w) return;
      viewWires.add(w); flowWire.set(w, 1);
      primary.add(w.a.el.id); primary.add(w.b.el.id);
      addUp(w.a, fview.up.get(`s:${k}`)); addUp(w.b, fview.up.get(`t:${k}`));
    });
    fview.nodes.forEach((id) => {
      const n = nodes.get(id); if (!n) return;
      subtree(n).forEach((x) => primary.add(x));
      addUp(n, fview.up.get(`n:${id}`));
    });
    primary.forEach((id) => secondary.delete(id));
  }
  const focusWire = inView ? (viewWires.size ? [...viewWires][0] : null) : null;
  const ov = fs || inView ? null : overlayFlows();
  const overlay = !!(ov && ov.length);
  if (overlay) {
    primary = new Set();
    ov.forEach(({ steps }) => steps.forEach(({ st, w }) => { primary.add(String(st.from)); primary.add(String(st.to)); if (w) flowWire.set(w, 1); }));
  }
  if (!inFlow && !overlay && !inView) {
    const sel = selected && nodes.get(selected);
    if (sel) primary = new Set(subtree(sel));
    else if (focusLayer) primary = new Set([...nodes.values()].filter((n) => n.layer === focusLayer).map((n) => n.el.id));
    if (primary) {
      wires.forEach((w) => {
        if (w.flowOnly) return;
        if (sel && !elemWireShown(w)) return;
        if (primary.has(w.a.el.id) && !primary.has(w.b.el.id)) secondary.add(w.b.el.id);
        if (primary.has(w.b.el.id) && !primary.has(w.a.el.id)) secondary.add(w.a.el.id);
      });
    }
  }
  const selNode = !inFlow && selected ? nodes.get(selected) : null;
  nodes.forEach((n) => {
    const hidden = isHidden(n);
    // Enlarge labels only for what's in focus: the selected element and its direct children, or a playing flow's elements.
    n.label.userData.emph = inFlow || inView ? primary.has(n.el.id) : !!selNode && (n === selNode || n.parent === selNode);
    n.mesh.visible = n.edges.visible = n.label.visible = !hidden;
    const m = n.mesh.material, e = n.edges.material, l = n.label.material;
    const baseC = DEPTH_OPACITY[Math.min(n.depth, DEPTH_OPACITY.length - 1)];
    let op, eop, lop = 1, col = n.baseColor, emissive = 0;
    const id = n.el.id;
    if (!primary) {
      op = n.isContainer ? Math.min(0.95, baseC * opts.k) : 1;
      eop = n.isContainer ? 0.6 : 0.85;
    } else if (primary.has(id)) {
      op = n.isContainer ? (opts.solid ? 0.95 : Math.min(0.95, 0.4 * opts.k)) : 1;
      eop = 1; emissive = 0.18;
    } else if (secondary.has(id)) {
      op = n.isContainer ? Math.min(0.9, baseC * opts.k) : 0.75;
      eop = 0.7;
    } else if (overlay) {
      op = n.isContainer ? Math.min(0.95, baseC * opts.k) : 0.3;
      eop = n.isContainer ? 0.45 : 0.3; lop = 0.4;
      col = n.baseColor.clone().lerp(GHOST, 0.45);
    } else {
      op = n.isContainer ? 0.025 : 0.08;
      eop = 0.07; lop = 0.12;
      col = n.baseColor.clone().lerp(GHOST, 0.75);
    }
    m.color.copy(col);
    m.emissive.copy(n.baseColor).multiplyScalar(emissive);
    m.opacity = op;
    m.transparent = op < 0.99;
    m.depthWrite = op >= 0.99;
    e.color.copy(id === selected && !inView ? new THREE.Color('#ffffff') : col);
    e.opacity = eop;
    l.opacity = lop;
  });
  wires.forEach((w) => {
    let vis = !isHidden(w.a) && !isHidden(w.b);
    const flowOnlyOn = fs ? w.flowOnly === activeFlow.id : (inView ? viewWires.has(w) : overlay && visibleFlows.has(w.flowOnly));
    if (w.flowOnly && !flowOnlyOn) vis = false;
    // User-hidden connections stay hidden unless a flow or focus explicitly needs them.
    if (!w.flowOnly && (hiddenConnTypes.has(w.type) || hiddenConns.has(w.key)) && !flowWire.has(w)) vis = false;
    w.hit.visible = vis;
    w.tube.visible = w.cone.visible = vis;
    if (w.label) w.label.visible = vis;
    let op;
    if (fs && fs.length) op = flowWire.get(w) || (inFlow ? 0.03 : 0.15);
    else if (inView) op = viewWires.has(w) ? 1 : 0.04;
    else if (overlay) op = flowWire.get(w) || 0.06;
    else {
      const touches = !primary || primary.has(w.a.el.id) || primary.has(w.b.el.id);
      op = touches && (!selNode || elemWireShown(w)) ? 1 : (touches ? 0.03 : 0.06);
    }
    w.tube.material.opacity = op;
    w.cone.material.opacity = op;
    if (w.label) w.label.userData.emph = inFlow ? op >= 0.99 : inView ? viewWires.has(w) : !!selNode && (w.a === selNode || w.b === selNode) && elemWireShown(w);
    if (w.label) w.label.material.opacity = op >= 0.99 ? 1 : op * 0.5;
  });
  let badges = overlay ? ov : null;
  if (inView && fview.flowId) {
    const f = model.flows.find((x) => x.id === fview.flowId);
    if (f) badges = [{ color: f.color || flowColor(f), steps: f.steps.map((st, i) => ({ st, i, w: findWire(f.id, st) })).filter((x) => x.w && viewWires.has(x.w)) }];
  }
  renderFlowBadges(fs, badges);
}

function makeBadge(n, on, color) {
  const c = document.createElement('canvas');
  c.width = c.height = 192;
  const g = c.getContext('2d');
  g.fillStyle = color || (on ? '#f8fafc' : '#475569');
  g.beginPath(); g.arc(96, 96, 90, 0, Math.PI * 2); g.fill();
  g.fillStyle = on || color ? '#0b1020' : '#e2e8f0';
  g.font = '700 100px system-ui, -apple-system, Segoe UI, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(String(n), 96, 104);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  s.scale.set(on ? 0.85 : 0.6, on ? 0.85 : 0.6, 1);
  Object.assign(s.userData, { baseH: on ? 0.85 : 0.6, aspect: 1, emph: on, ...LABEL_PX.badge });
  s.center.set(0.5, 1); // hang below the wire so it never covers the wire label
  s.renderOrder = 1001;
  return s;
}
function renderFlowBadges(fs, ov) {
  disposeTree(flowGroup);
  const specs = [];
  if (fs) fs.forEach(({ i, w }) => specs.push({ w, n: i + 1, on: activeFlow.step < 0 || activeFlow.step === i, color: null }));
  else if (ov) ov.forEach(({ color, steps }) => steps.forEach(({ i, w }) => specs.push({ w, n: i + 1, on: true, color })));
  const stack = new Map();
  specs.forEach(({ w, n, on, color }) => {
    if (!w || !w.tube.visible) return;
    const k = stack.get(w) || 0;
    stack.set(w, k + 1);
    const b = makeBadge(n, on, color);
    b.position.copy(w.mid).add(new THREE.Vector3(0, -0.15 - k * 0.9, 0));
    flowGroup.add(b);
  });
}

// ---------- Selection, picking ----------
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
function pick(ev) {
  const r = renderer.domElement.getBoundingClientRect();
  ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const targets = [];
  nodes.forEach((n) => { if (n.mesh.visible) targets.push(n.mesh, n.label); });
  wires.forEach((w) => {
    if (!w.hit.visible) return;
    targets.push(w.hit);
    if (w.label && w.label.visible) targets.push(w.label);
  });
  const hits = raycaster.intersectObjects(targets, false);
  const labelHit = hits.find((h) => h.object.userData.isLabel && h.object.material.opacity > 0.5);
  if (labelHit) return labelHit.object.userData.wire ? { wire: labelHit.object.userData.wire } : { node: labelHit.object.userData.node };
  const wireHit = hits.find((h) => h.object.userData.wire);
  const leafHit = hits.find((h) => h.object.userData.node && !h.object.userData.isLabel && !h.object.userData.node.isContainer);
  // A wire wins if it's in front of the nearest solid element (container walls don't block wires).
  if (wireHit && (!leafHit || wireHit.distance < leafHit.distance)) return { wire: wireHit.object.userData.wire };
  const meshHits = hits.filter((h) => h.object.userData.node && !h.object.userData.isLabel);
  if (!meshHits.length) return null;
  // Prefer the deepest element along the ray, so clicks go "into" translucent containers.
  return { node: meshHits.reduce((best, h) => (h.object.userData.node.depth > best.depth ? h.object.userData.node : best), meshHits[0].object.userData.node) };
}

function elemWires(n) {
  const ids = new Set(subtree(n));
  return wires.filter((w) => !w.flowOnly && (ids.has(w.a.el.id) || ids.has(w.b.el.id)) && !(ids.has(w.a.el.id) && ids.has(w.b.el.id) && n.children.length === 0));
}
const elemWireShown = (w) => elemShowConns && !elemHiddenTypes.has(w.type) && !elemConnOff.has(w.key);
function refreshFocus() {
  if (isolate) {
    if (!fview) { exitIsolate(); return; }
    model = deriveModel(fullModel, fview);
    build();
    return;
  }
  applyVisuals(); renderOutline(); renderProps(); renderLinks(); attachGizmo();
}

// ---------- Flow focus + isolate ----------
// Build a model containing only the view's elements (plus included parents), compacted with auto-layout.
function deriveModel(full, v) {
  const idx = new Map();
  const walk = (list, parent, eff) => list.forEach((el) => {
    const layer = el.layer ?? eff;
    idx.set(String(el.id), { el, parent, layer });
    if (el.children) walk(el.children, el, layer);
  });
  walk(full.elements, null, null);
  const keep = new Set();
  const addSub = (el) => { keep.add(String(el.id)); (el.children || []).forEach(addSub); };
  const addUp = (id, lv) => { let p = idx.get(String(id)) && idx.get(String(id)).parent; for (let i = 0; i < (lv || 0) && p; i++) { keep.add(String(p.id)); p = idx.get(String(p.id)).parent; } };
  const conns = [];
  v.conns.forEach((k) => {
    let from, to;
    if (k.startsWith('flow:')) { const parts = k.slice(5).split('|'); from = parts[1]; to = parts[2]; }
    else {
      const c = full.connections.find((x) => connKey(x) === k.split('#')[0]);
      if (!c) return;
      conns.push({ ...c }); from = c.from; to = c.to;
    }
    keep.add(String(from)); keep.add(String(to));
    addUp(from, v.up.get(`s:${k}`)); addUp(to, v.up.get(`t:${k}`));
  });
  v.nodes.forEach((id) => { const e = idx.get(String(id)); if (e) { addSub(e.el); addUp(id, v.up.get(`n:${id}`)); } });
  // Order by first appearance in the flow so the compact layout reads in sequence.
  const flow = v.flowId ? full.flows.find((f) => f.id === v.flowId) : null;
  const rank = new Map();
  if (flow) flow.steps.forEach((st, i) => { [st.from, st.to].forEach((x) => { if (!rank.has(String(x))) rank.set(String(x), i); }); });
  const rankOf = (el) => Math.min(rank.has(String(el.id)) ? rank.get(String(el.id)) : 1e9, ...(el.children || []).map(rankOf));
  const prune = (list) => {
    const out = [];
    list.forEach((el) => {
      const kids = prune(el.children || []);
      if (keep.has(String(el.id))) {
        const { children, pos, ...rest } = el;
        const copy = { ...rest, layer: idx.get(String(el.id)).layer ?? undefined };
        if (copy.layer === undefined) delete copy.layer;
        if (kids.length) copy.children = kids;
        out.push(copy);
      } else out.push(...kids); // hoist kept descendants of dropped containers
    });
    return flow ? out.sort((a, b) => rankOf(a) - rankOf(b)) : out;
  };
  const fcolor = flow ? flow.color || FLOW_COLORS[Math.max(0, full.flows.indexOf(flow)) % FLOW_COLORS.length] : null;
  const flows = flow ? [{ ...flow, color: fcolor, steps: flow.steps.filter((st) => keep.has(String(st.from)) && keep.has(String(st.to))) }] : [];
  return { version: full.version, layers: full.layers, elements: prune(full.elements), connections: conns, flows };
}
function enterIsolate() {
  if (!fview) return;
  if (!isolate) { fullModel = model; isolate = true; pushCam(); }
  if (opts.move) toggle('move');
  stopPlay(); activeFlow = null;
  model = deriveModel(fullModel, fview);
  editor.readOnly = true;
  document.body.classList.add('isolated');
  build();
  renderIsobar();
  frameBox(worldBox(), VIEWS.iso.clone());
}
function exitIsolate() {
  if (!isolate) return;
  isolate = false;
  model = fullModel; fullModel = null;
  editor.readOnly = false;
  document.body.classList.remove('isolated');
  build();
  renderIsobar();
  const c = camHistory.pop();
  if (c) animateCamera(c.p, c.t); else frameBox(worldBox(), VIEWS.iso.clone());
}
function focusFlow(id) {
  if (isolate) { fview = null; exitIsolate(); }
  const f = model.flows.find((x) => x.id === id); if (!f) return;
  setFlow(null);
  const ns = new Set(), cs = new Set();
  f.steps.forEach((st) => { ns.add(String(st.from)); ns.add(String(st.to)); const w = findWire(f.id, st); if (w) cs.add(w.key); });
  fview = { nodes: ns, conns: cs, up: new Map(), flowId: f.id };
  selected = null; selectedConn = null; opts.addMode = false;
  enterIsolate();
  // Open the step player on the isolated subset so the flow can be followed step by step.
  activeFlow = { id: f.id, step: -1 };
  document.body.classList.add('flow-on');
  applyVisuals(); renderFlowbar(); renderFlowsPane(); renderProps(); renderIsobar();
}
function renderIsobar() {
  const bar = $('#isobar');
  if (!isolate || !fview) { bar.hidden = true; return; }
  const f = fview.flowId && fullModel.flows.find((x) => x.id === fview.flowId);
  bar.hidden = false;
  bar.innerHTML = `<span class="iso-dot"></span><b>Isolated</b><span>${f ? esc(f.name || f.id) : `${fview.nodes.size + fview.conns.size} items`} · ${nodes.size} elements</span>
    ${f && !(activeFlow && activeFlow.id === f.id) ? '<button data-act="steps" title="Step through this flow">Steps ▸</button>' : ''}
    <button data-act="ghost" title="Show the full diagram with this view highlighted">Show context</button><button data-act="exit" title="Back to the full diagram (Esc)">Exit</button>`;
}
// Selecting something while isolated changes what the panel shows, not the view itself.
function setCurrent(kind, id) {
  if (kind === 'conn') { selectedConn = id; selected = null; } else { selected = id; selectedConn = null; }
  applyVisuals(); renderOutline(); renderProps(); renderLinks();
}

function selectConn(key) {
  if (key && activeFlow && activeFlow.id !== '__rec') setFlow(null);
  selectedConn = key;
  selected = null;
  fview = key ? { nodes: new Set(), conns: new Set([key]), up: new Map() } : null;
  refreshFocus();
}
// Add or remove an element/connection from the custom view (Shift-click or "+ Add items").
function toggleInView(kind, id) {
  if (activeFlow && activeFlow.id !== '__rec') setFlow(null);
  if (!fview) {
    fview = { nodes: new Set(), conns: new Set(), up: new Map() };
    if (selectedConn) fview.conns.add(selectedConn);
    else if (selected) fview.nodes.add(selected);
  }
  const set = kind === 'node' ? fview.nodes : fview.conns;
  if (set.has(id)) {
    set.delete(id);
    if (kind === 'node') fview.up.delete(`n:${id}`); else { fview.up.delete(`s:${id}`); fview.up.delete(`t:${id}`); }
    if ((kind === 'node' && selected === id) || (kind === 'conn' && selectedConn === id)) {
      const lastC = [...fview.conns].pop(), lastN = [...fview.nodes].pop();
      selected = lastC ? null : lastN || null; selectedConn = lastC || null;
    }
  } else {
    set.add(id);
    if (kind === 'node') { selected = id; selectedConn = null; } else { selectedConn = id; selected = null; }
  }
  if (!fview.conns.size && !fview.nodes.size) { fview = null; selected = null; selectedConn = null; }
  refreshFocus();
}
const ancestors = (n) => { const out = []; let p = n.parent; while (p) { out.push(p); p = p.parent; } return out; };
function frameView() {
  if (!fview) return;
  const b = new THREE.Box3();
  fview.conns.forEach((k) => { const w = wires.find((x) => x.key === k); if (w) b.expandByObject(w.tube).expandByObject(w.a.mesh).expandByObject(w.b.mesh); });
  fview.nodes.forEach((id) => { const n = nodes.get(id); if (n) b.expandByObject(n.mesh); });
  if (!b.isEmpty()) { pushCam(); frameBox(b); }
}
function flyToWire(w) {
  pushCam();
  frameBox(new THREE.Box3().setFromObject(w.tube).expandByObject(w.a.mesh).expandByObject(w.b.mesh));
}

function select(id) {
  if (id !== elemConnFor) { elemConnOff.clear(); elemConnFor = id; }
  selected = id;
  fview = null;
  if (selectedConn) { selectedConn = null; renderLinks(); }
  applyVisuals();
  renderOutline();
  renderProps();
  attachGizmo();
}

function attachGizmo() {
  const n = selected && nodes.get(selected);
  if (opts.move && n) tc.attach(n.group); else tc.detach();
}

let down = null;
renderer.domElement.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; });
renderer.domElement.addEventListener('pointerup', (e) => {
  if (!down || tc.dragging || tc.axis) { down = null; return; }
  const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
  down = null;
  if (moved > 6) return;
  const hit = pick(e);
  if (recording) { if (hit && hit.node) recordClick(hit.node.el.id); return; }
  const adding = e.shiftKey || e.metaKey || e.ctrlKey || opts.addMode;
  if (adding) { if (hit) toggleInView(hit.node ? 'node' : 'conn', hit.node ? hit.node.el.id : hit.wire.key); return; }
  if (isolate) { if (hit) setCurrent(hit.node ? 'node' : 'conn', hit.node ? hit.node.el.id : hit.wire.key); return; }
  if (hit && hit.node) select(hit.node.el.id);
  else if (hit && hit.wire) selectConn(hit.wire.key);
  else if (fview || selectedConn) { opts.addMode = false; selectConn(null); }
  else if (selected) select(null);
  else if (focusLayer) { focusLayer = null; applyVisuals(); renderLayers(); }
});
renderer.domElement.addEventListener('dblclick', (e) => {
  const hit = pick(e);
  if (e.shiftKey || e.metaKey || e.ctrlKey || opts.addMode) return;
  if (isolate) { if (hit && hit.node) flyTo(hit.node); else if (hit && hit.wire) flyToWire(hit.wire); return; }
  if (hit && hit.node && !recording) { select(hit.node.el.id); flyTo(hit.node); }
  else if (hit && hit.wire && !recording) { selectConn(hit.wire.key); flyToWire(hit.wire); }
});

function onDragEnd() {
  if (isolate) return;
  const n = selected && nodes.get(selected);
  if (!n) return;
  const p = n.group.position;
  n.el.pos = [p.x, p.y, p.z].map((v) => Math.round(v * 100) / 100);
  const text = dumpModel(model);
  editor.value = text;
  commit(text);
  build();
}

// ---------- Camera ----------
let tween = null;
function animateCamera(pos, target, ms = 700) {
  tween = { p0: camera.position.clone(), t0: orbit.target.clone(), p1: pos, t1: target, start: performance.now(), ms };
}
function frameBox(box, dir) {
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  const vf = THREE.MathUtils.degToRad(camera.fov);
  const hf = 2 * Math.atan(Math.tan(vf / 2) * camera.aspect);
  const fit = (sphere.radius / Math.sin(Math.min(vf, hf) / 2)) * 0.85;
  const d = (dir || camera.position.clone().sub(orbit.target)).normalize();
  animateCamera(sphere.center.clone().addScaledVector(d, Math.max(fit, 4)), sphere.center.clone());
}
function pushCam() { camHistory.push({ p: camera.position.clone(), t: orbit.target.clone() }); if (camHistory.length > 30) camHistory.shift(); }
function flyTo(n) { pushCam(); frameBox(new THREE.Box3().setFromObject(n.mesh)); }
function worldBox() {
  const b = new THREE.Box3();
  nodes.forEach((n) => { if (n.mesh.visible) b.expandByObject(n.mesh); });
  return b.isEmpty() ? new THREE.Box3(new THREE.Vector3(-5, -5, -5), new THREE.Vector3(5, 5, 5)) : b;
}
const VIEWS = { iso: new THREE.Vector3(1, 0.85, 1.15), top: new THREE.Vector3(0.0001, 1, 0.02), front: new THREE.Vector3(0, 0.22, 1) };
function view(name) { pushCam(); frameBox(worldBox(), VIEWS[name].clone()); }

// ---------- Undo/redo + persistence ----------
function commit(text) {
  if (history.list[history.i] === text) return;
  history.list = history.list.slice(0, history.i + 1);
  history.list.push(text);
  if (history.list.length > 100) history.list.shift();
  history.i = history.list.length - 1;
  try { localStorage.setItem(STORE_KEY, text); } catch (_) { /* storage unavailable */ }
  updateUndoButtons();
}
function updateUndoButtons() {
  $('#undo').disabled = history.i <= 0;
  $('#redo').disabled = history.i >= history.list.length - 1;
}
function undo(dir) {
  if (isolate) { flash('Exit isolate mode to undo or redo'); return; }
  const j = history.i + dir;
  if (j < 0 || j >= history.list.length) return;
  history.i = j;
  editor.value = history.list[j];
  apply(editor.value, false);
  try { localStorage.setItem(STORE_KEY, editor.value); } catch (_) { /* ignore */ }
  updateUndoButtons();
}

function showMessages(errors, warnings) {
  msgs.innerHTML = '';
  errors.forEach((t) => msgs.insertAdjacentHTML('beforeend', `<div class="err">✕ ${esc(t)}</div>`));
  warnings.forEach((t) => msgs.insertAdjacentHTML('beforeend', `<div class="warn">! ${esc(t)}</div>`));
  if (!errors.length && !warnings.length) msgs.innerHTML = '<div class="ok">✓ Model is valid</div>';
}
function apply(text, doCommit = true) {
  const r = parseModel(text);
  showMessages(r.errors, r.warnings);
  if (r.errors.length) return false;
  model = r.model;
  build();
  if (doCommit) commit(text);
  return true;
}

// ---------- Panels ----------
function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

function renderOutline() {
  const el = $('#outline');
  const rows = [];
  if (isolate) {
    const walkFull = (list, depth, eff) => list.forEach((e) => {
      const layer = e.layer ?? eff;
      const lc = (fullModel.layers.find((l) => l.id === layer) || {}).color || TYPE_COLOR[e.type] || '#94a3b8';
      const inV = fview.nodes.has(String(e.id)), shown = nodes.has(String(e.id));
      rows.push(`<div class="row ${inV ? 'sel' : ''} ${shown ? '' : 'dim'}" data-id="${esc(e.id)}" style="padding-left:${10 + depth * 16}px">
        <span class="dot" style="background:${esc(e.color || lc)}"></span>${esc(e.name || e.id)}<span class="badge">${inV ? 'in view' : shown ? 'shown' : esc(e.type)}</span></div>`);
      if (e.children) walkFull(e.children, depth + 1, layer);
    });
    walkFull(fullModel.elements, 0, null);
    el.innerHTML = '<p class="hint">Isolated: tap an element to add it to or remove it from the view.</p>' + rows.join('');
    return;
  }
  const walk = (n) => {
    rows.push(`<div class="row ${n.el.id === selected || (fview && fview.nodes.has(n.el.id)) ? 'sel' : ''} ${isHidden(n) ? 'dim' : ''}" data-id="${esc(n.el.id)}" style="padding-left:${10 + n.depth * 16}px">
      <span class="dot" style="background:#${n.baseColor.getHexString()}"></span>${esc(n.el.name || n.el.id)}${normDocs(n.el.docs).length ? '<span class="hasdocs" title="Has documentation links">↗</span>' : ''}<span class="badge">${esc(n.el.type)}</span></div>`);
    n.children.forEach(walk);
  };
  roots.forEach(walk);
  el.innerHTML = rows.join('') || '<div class="empty">No elements yet.</div>';
}
$('#outline').addEventListener('click', (e) => {
  const r = e.target.closest('.row'); if (!r) return;
  if (recording) recordClick(r.dataset.id);
  else if (isolate || e.shiftKey || e.metaKey || e.ctrlKey || opts.addMode) toggleInView('node', r.dataset.id);
  else select(r.dataset.id);
});
$('#outline').addEventListener('dblclick', (e) => { const r = e.target.closest('.row'); if (r) flyTo(nodes.get(r.dataset.id)); });

function renderLayers() {
  const el = $('#layers');
  const counts = {};
  nodes.forEach((n) => { counts[n.layer] = (counts[n.layer] || 0) + 1; });
  el.innerHTML = (normDocs(model.docs).length ? `<div class="mdocs"><b>About this diagram</b>${docsHtml(model.docs)}</div>` : '') + model.layers.map((l) => `
    <div class="layer ${focusLayer === l.id ? 'focus' : ''}" data-id="${esc(l.id)}">
      <span class="swatch" style="background:${esc(l.color || '#94a3b8')}"></span>
      <div class="fcol"><button class="lname" data-act="focus">${esc(l.name || l.id)} <small>${counts[l.id] || 0}</small></button>${docsHtml(l.docs, 'small')}</div>
      <button class="eye" data-act="eye" title="Show/hide">${hiddenLayers.has(l.id) ? '◌' : '●'}</button>
    </div>`).join('') + `<p class="hint">Tap a layer to focus it: it turns solid and everything else fades. Tap again to clear.</p>
    <div class="legend"><b>Connections</b>${[...new Set(model.connections.map((c) => c.type || 'sync'))].filter((t) => CONN[t]).map((t) =>
      `<div><span class="wire" style="background:${CONN[t].color}"></span>${esc(t)} <small>${esc(CONN[t].desc)}</small></div>`).join('')}</div>`;
}
$('#layers').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  const id = b.closest('.layer').dataset.id;
  if (b.dataset.act === 'eye') { hiddenLayers.has(id) ? hiddenLayers.delete(id) : hiddenLayers.add(id); buildWires(); }
  else { focusLayer = focusLayer === id ? null : id; selected = null; attachGizmo(); renderOutline(); renderProps(); }
  applyVisuals(); renderLayers(); renderOutline();
});

// Parent chain from the real model (the isolated subset may have flattened it).
function fullAncestors(id) {
  const src = isolate ? fullModel : model;
  const path = [];
  const find = (list, trail) => list.some((e) => (String(e.id) === String(id) ? (path.push(...trail), true) : e.children && find(e.children, [e, ...trail])));
  find(src.elements, []);
  return path;
}
function upRow(label, key, node) {
  const anc = fullAncestors(node.el.id);
  const lv = Math.min(fview.up.get(key) || 0, anc.length);
  const chain = anc.slice(0, lv).map((a) => esc(a.name || a.id)).join(' › ');
  return `<div class="up"><span class="ul">${label}</span>
    <button data-act="up-" data-key="${esc(key)}" ${lv ? '' : 'disabled'} title="Fewer parent levels">−</button><b>${lv}</b>
    <button data-act="up+" data-key="${esc(key)}" ${lv < anc.length ? '' : 'disabled'} title="Include the next parent">+</button>
    <small>${anc.length ? (chain || 'no parents shown') : 'top level'}</small></div>`;
}
function viewSection() {
  if (!fview) return '';
  const items = [
    ...[...fview.conns].map((k) => { const w = wires.find((x) => x.key === k); return w ? { kind: 'conn', id: k, cur: k === selectedConn, text: `${nm(w.conn.from)} → ${nm(w.conn.to)}`, color: CONN[w.type].color } : null; }),
    ...[...fview.nodes].map((id) => { const n = nodes.get(id); return n ? { kind: 'node', id, cur: id === selected, text: n.el.name || n.el.id, color: `#${n.baseColor.getHexString()}` } : null; }),
  ].filter(Boolean);
  return `<div class="vs">
    <div class="vh"><b>In view</b><small>${items.length}</small>
      <button data-act="addmode" class="${opts.addMode ? 'on' : ''}">${opts.addMode ? 'Adding… (tap to stop)' : '+ Add items'}</button>
      <button data-act="iso" class="${isolate ? 'on' : ''}" title="Shrink the diagram to just this view">${isolate ? 'Isolated' : 'Isolate'}</button>
      <button data-act="vframe">Frame</button><button data-act="vclear">Clear</button></div>
    ${fview.flowId ? `<div class="muted">From flow: ${esc(((isolate ? fullModel : model).flows.find((f) => f.id === fview.flowId) || {}).name || fview.flowId)}</div>` : ''}
    <ul>${items.map((it) => `<li class="${it.cur ? 'cur' : ''}"><span class="${it.kind === 'conn' ? 'wire' : 'dot'}" style="background:${it.color}"></span>
      <button class="link vi" data-act="vcur" data-kind="${it.kind}" data-id="${esc(it.id)}">${esc(it.text)}</button>
      <button class="vx" data-act="vrm" data-kind="${it.kind}" data-id="${esc(it.id)}" title="Remove from view">✕</button></li>`).join('')}</ul>
    <p class="hint">${opts.addMode ? 'Tap elements or wires in the view, Outline or Links to add or remove them.' : 'Shift-click elements or wires (or use + Add items) to add more to this view.'}</p>
  </div>`;
}
function connControls(n, ew, inV) {
  if (!ew.length) return '';
  const ids = new Set(subtree(n));
  const isOn = (w) => (inV ? fview.conns.has(w.key) : elemWireShown(w));
  const types = [...new Set(ew.map((w) => w.type))];
  const shown = ew.filter(isOn).length;
  const typeOn = (t) => (inV ? ew.filter((w) => w.type === t).every((w) => fview.conns.has(w.key)) : elemShowConns && !elemHiddenTypes.has(t));
  const master = inV ? shown > 0 : elemShowConns;
  return `<div class="cf">
    <div class="cfh"><b>Connections</b><small>${shown} of ${ew.length} ${inV ? 'in view' : 'shown'}</small>
      <button class="tog ${master ? 'on' : ''}" data-act="cshow" title="${inV ? 'Add or remove all of these from the view' : 'Turn this element\'s connections on or off'}">${master ? 'On' : 'Off'}</button></div>
    <div class="chips">${types.map((t) => `<button class="chip ${typeOn(t) ? 'on' : ''}" data-act="ctype" data-type="${esc(t)}" title="Filter ${esc(t)} connections"><span class="wire" style="background:${CONN[t].color}"></span>${esc(t)} <small>${ew.filter((w) => w.type === t).length}</small></button>`).join('')}
      <button class="chip" data-act="call">All</button><button class="chip" data-act="cnone">None</button></div>
    <div class="pc cl">${ew.map((w) => {
      const out = ids.has(w.a.el.id);
      const me = out ? w.a : w.b, other = out ? w.b : w.a;
      const on = isOn(w);
      return `<div class="cn ${on ? '' : 'off'}">
        <button class="ck ${on ? 'on' : ''}" data-act="cone" data-key="${esc(w.key)}" title="Show/hide this connection" aria-pressed="${on}">${on ? '✓' : ''}</button>
        <span class="wire" style="background:${CONN[w.type].color}"></span>
        <button class="link cgo" data-act="cgo" data-key="${esc(w.key)}" title="Focus this connection">${out ? '→' : '←'} ${esc(other.el.name || other.el.id)}</button>
        <span class="badge">${esc(w.type)}${w.conn.label ? ' · ' + esc(w.conn.label) : ''}</span>
        ${me !== n ? `<div class="cd">via ${esc(me.el.name || me.el.id)}</div>` : ''}
        ${w.conn.description ? `<div class="cd">${esc(w.conn.description)}</div>` : ''}
        ${docsHtml(w.conn.docs, 'cd')}
      </div>`;
    }).join('')}</div>
  </div>`;
}
function renderProps() {
  const box = $('#props');
  const fw = selectedConn && wires.find((w) => w.key === selectedConn);
  if (fw) {
    const c = fw.conn, st = CONN[fw.type];
    const usedIn = (model.flows || []).filter((f) => f.steps.some((x) => sameEnds(fw, x)));
    const inV = fview && fview.conns.has(fw.key);
    box.hidden = false;
    box.innerHTML = `
      <div class="ph"><span class="wire" style="background:${st.color}"></span><b>${esc(nm(c.from))} → ${esc(nm(c.to))}</b><button class="x" data-act="close">✕</button></div>
      <div class="pm">${esc(fw.type)} · ${esc(st.desc)}${c.label ? ` · <code>${esc(c.label)}</code>` : ''}</div>
      ${c.description ? `<div class="pd">${esc(c.description)}</div>` : ''}
      ${docsHtml(c.docs)}
      ${usedIn.length ? `<div class="pc"><div class="muted">Used in flows:</div>${usedIn.map((f) => `<button class="link" data-act="flow" data-id="${esc(f.id)}">${esc(f.name || f.id)}</button>`).join('')}</div>` : ''}
      ${inV ? `<div class="ups"><div class="muted">Include parents</div>${upRow('Source', `s:${fw.key}`, fw.a)}${upRow('Target', `t:${fw.key}`, fw.b)}</div>` : ''}
      <div class="pa">
        <button data-act="wfly">Fly to</button>
        <button data-act="from">Source</button>
        <button data-act="to">Target</button>
        <button data-act="whide">Hide</button>
      </div>${viewSection()}`;
    return;
  }
  const n = selected && nodes.get(selected);
  if (!n && fview && activeFlow && activeFlow.id !== '__rec') { box.hidden = true; return; }
  if (!n && fview) {
    box.hidden = false;
    box.innerHTML = `<div class="ph"><b>Custom view</b><button class="x" data-act="vclear">✕</button></div>
      <div class="pm">Tap an element or wire to see its details, parents and connections.</div>${viewSection()}`;
    return;
  }
  if (!n) { box.hidden = true; return; }
  box.hidden = false;
  const inV = fview && fview.nodes.has(n.el.id);
  const ew = elemWires(n);
  const layer = model.layers.find((l) => l.id === n.layer);
  box.innerHTML = `
    <div class="ph"><span class="dot" style="background:#${n.baseColor.getHexString()}"></span><b>${esc(n.el.name || n.el.id)}</b><button class="x" data-act="close">✕</button></div>
    <div class="pm">${esc(n.el.type)} · ${esc(layer ? layer.name || layer.id : 'no layer')} · <code>${esc(n.el.id)}</code></div>
    ${n.el.description ? `<div class="pd">${esc(n.el.description)}</div>` : ''}
    ${docsHtml(n.el.docs)}
    ${!normDocs(n.el.docs).length && n.layer && normDocs((model.layers.find((l) => l.id === n.layer) || {}).docs).length ? docsHtml(model.layers.find((l) => l.id === n.layer).docs, 'inherited') : ''}
    ${connControls(n, ew, inV)}
    ${inV ? `<div class="ups">${upRow('Parents', `n:${n.el.id}`, n)}</div>` : ''}
    <div class="pa">
      <button data-act="fly">Fly in</button>
      ${n.parent && !fview ? '<button data-act="parent">Select parent</button>' : ''}
      ${!fview ? '<button data-act="startview" title="Pin this element and add more (or Shift-click)">+ Add items</button>' : ''}
      <button data-act="move" class="${opts.move ? 'on' : ''}">${opts.move ? 'Moving…' : 'Move'}</button>
    </div>${viewSection()}`;
}
$('#props').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  const a = b.dataset.act;
  // View controls (shared)
  if (a === 'up+' || a === 'up-') {
    const k = b.dataset.key;
    fview.up.set(k, Math.max(0, (fview.up.get(k) || 0) + (a === 'up+' ? 1 : -1)));
    refreshFocus(); return;
  }
  if (a === 'addmode') { opts.addMode = !opts.addMode; renderProps(); return; }
  if (a === 'vframe') { frameView(); return; }
  if (a === 'iso') { isolate ? exitIsolate() : enterIsolate(); return; }
  if (a === 'vclear') { opts.addMode = false; selectConn(null); return; }
  if (a === 'vrm') { toggleInView(b.dataset.kind, b.dataset.id); return; }
  if (a === 'vcur') {
    if (b.dataset.kind === 'conn') { selectedConn = b.dataset.id; selected = null; } else { selected = b.dataset.id; selectedConn = null; }
    refreshFocus(); return;
  }
  if (['cshow', 'ctype', 'call', 'cnone', 'cone', 'cgo'].includes(a)) {
    const n = nodes.get(selected); if (!n) return;
    const ew = elemWires(n);
    const inV = fview && fview.nodes.has(n.el.id);
    if (a === 'cgo') {
      if (inV) { if (!fview.conns.has(b.dataset.key)) fview.conns.add(b.dataset.key); selectedConn = b.dataset.key; selected = null; refreshFocus(); }
      else selectConn(b.dataset.key);
      return;
    }
    if (inV) {
      // In a pinned view these controls add/remove the element's connections to/from the view.
      const setAll = (list, on) => list.forEach((w) => (on ? fview.conns.add(w.key) : fview.conns.delete(w.key)));
      if (a === 'cshow') setAll(ew, !ew.some((w) => fview.conns.has(w.key)));
      if (a === 'ctype') { const l = ew.filter((w) => w.type === b.dataset.type); setAll(l, !l.every((w) => fview.conns.has(w.key))); }
      if (a === 'call') setAll(ew, true);
      if (a === 'cnone') setAll(ew, false);
      if (a === 'cone') { const k = b.dataset.key; fview.conns.has(k) ? fview.conns.delete(k) : fview.conns.add(k); }
      ew.forEach((w) => { if (fview.conns.has(w.key)) hiddenConns.delete(w.key); });
    } else {
      if (a === 'cshow') elemShowConns = !elemShowConns;
      if (a === 'ctype') { const t = b.dataset.type; if (!elemShowConns) { elemShowConns = true; elemHiddenTypes.clear(); ew.forEach((w) => { if (w.type !== t) elemHiddenTypes.add(w.type); }); } else elemHiddenTypes.has(t) ? elemHiddenTypes.delete(t) : elemHiddenTypes.add(t); }
      if (a === 'call') { elemShowConns = true; elemHiddenTypes.clear(); elemConnOff.clear(); }
      if (a === 'cnone') { ew.forEach((w) => elemConnOff.add(w.key)); }
      if (a === 'cone') {
        const k = b.dataset.key, w = ew.find((x) => x.key === k);
        if (elemWireShown(w)) elemConnOff.add(k);
        else {
          // Turn just this one on: if its type (or everything) was filtered out, keep the others of that type off.
          if (!elemShowConns) { elemShowConns = true; ew.forEach((x) => elemConnOff.add(x.key)); }
          if (elemHiddenTypes.has(w.type)) { elemHiddenTypes.delete(w.type); ew.filter((x) => x.type === w.type).forEach((x) => elemConnOff.add(x.key)); }
          elemConnOff.delete(k);
        }
      }
    }
    if (inV) refreshFocus(); else { applyVisuals(); renderProps(); renderLinks(); }
    return;
  }
  if (a === 'startview') {
    if (!fview) {
      // Pin what's on screen: the element plus the connections currently shown for it.
      const n = nodes.get(selected);
      fview = { nodes: new Set([selected]), conns: new Set(n ? elemWires(n).filter(elemWireShown).map((w) => w.key) : []), up: new Map() };
    }
    opts.addMode = true; refreshFocus(); return;
  }
  const fw = selectedConn && wires.find((w) => w.key === selectedConn);
  if (fw) {
    if (a === 'close') { opts.addMode = false; selectConn(null); }
    if (a === 'wfly') flyToWire(fw);
    if (a === 'from') flyTo(fw.a);
    if (a === 'to') flyTo(fw.b);
    if (a === 'whide') { hiddenConns.add(fw.key); fview && fview.conns.size > 1 ? toggleInView('conn', fw.key) : selectConn(null); }
    if (a === 'flow') { selectConn(null); setFlow(b.dataset.id); }
    return;
  }
  const n = nodes.get(selected); if (!n) return;
  if (a === 'close') { opts.addMode = false; if (fview) selectConn(null); else select(null); }
  if (a === 'fly') flyTo(n);
  if (a === 'parent') select(n.parent.el.id);
  if (a === 'move') toggle('move');
});

// ---------- Flows ----------
const nm = (id) => { const n = nodes.get(String(id)); return n ? n.el.name || n.el.id : String(id); };
const slug = (t) => String(t).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function setFlow(id, step = -1) {
  stopPlay();
  activeFlow = id ? { id, step } : null;
  if (id) { focusLayer = null; }
  applyVisuals(); renderFlowbar(); renderFlowsPane(); renderLayers(); renderProps(); renderIsobar();
  document.body.classList.toggle('flow-on', !!(activeFlow && activeFlow.id !== '__rec'));
  if (id && id !== '__rec' && opts.follow) { pushCam(); frameFlow(); }
}
function goStep(i) {
  const fs = flowSteps(); if (!fs || !fs.length) return;
  activeFlow.step = Math.max(-1, Math.min(fs.length - 1, i));
  applyVisuals(); renderFlowbar();
  if (opts.follow) (activeFlow.step < 0 ? frameFlow : frameStep)();
}
function stopPlay() { if (playing) { clearInterval(playing); playing = null; } }
function togglePlay() {
  if (playing) { stopPlay(); renderFlowbar(); return; }
  const fs = flowSteps(); if (!fs || !fs.length) return;
  if (activeFlow.step >= fs.length - 1) activeFlow.step = -1;
  playing = setInterval(() => {
    const f2 = flowSteps();
    if (!f2 || activeFlow.step >= f2.length - 1) { stopPlay(); renderFlowbar(); return; }
    goStep(activeFlow.step + 1);
  }, 2800);
  goStep(activeFlow.step + 1);
}
function boxOf(ids) {
  const b = new THREE.Box3();
  ids.forEach((id) => { const n = nodes.get(String(id)); if (n) b.expandByObject(n.mesh); });
  return b;
}
function frameFlow() {
  const fs = flowSteps(); if (!fs || !fs.length) return;
  frameBox(boxOf(fs.flatMap(({ st }) => [st.from, st.to])));
}
function frameStep() {
  const fs = flowSteps(); const cur = fs && fs[activeFlow.step];
  if (cur) frameBox(boxOf([cur.st.from, cur.st.to]).expandByScalar(1.5));
}

function renderFlowbar() {
  const bar = $('#flowbar');
  const fs = flowSteps();
  if (!fs || activeFlow.id === '__rec') { bar.hidden = true; return; }
  const f = allFlows().find((x) => x.id === activeFlow.id);
  const cur = activeFlow.step;
  const it = cur >= 0 ? fs[cur] : null;
  const lbl = it && (it.st.label || (it.w && it.w.conn.label));
  const note = it && (it.st.note || (it.w && !it.w.flowOnly && it.w.conn.description));
  bar.hidden = false;
  bar.innerHTML = `
    <div class="fh"><b>${esc(f.name || f.id)}</b><span>${cur < 0 ? `${fs.length} steps` : `Step ${cur + 1} of ${fs.length}`}</span><button class="x" data-act="close" title="Close flow (Esc)">✕</button></div>
    <div class="fs">${it
      ? `<div class="ft"><span class="num">${cur + 1}</span>${esc(nm(it.st.from))} → ${esc(nm(it.st.to))}${lbl ? ` <span class="badge">${esc(lbl)}</span>` : ''}</div>${note ? `<div class="fn">${esc(note)}</div>` : ''}${docsHtml(it.st.docs || (it.w && !it.w.flowOnly && it.w.conn.docs))}`
      : `<div class="fn">${esc(f.description || 'Step through the flow with Next, or press Play.')}</div>`}${docsHtml(f.docs, 'flowdocs')}</div>
    <div class="fc">
      <button data-act="prev" ${cur < 0 ? 'disabled' : ''}>‹ Prev</button>
      <button data-act="play" class="${playing ? 'on' : ''}">${playing ? 'Pause' : 'Play'}</button>
      <button data-act="next" ${cur >= fs.length - 1 ? 'disabled' : ''}>Next ›</button>
      <button data-act="all" class="${cur < 0 ? 'on' : ''}">All</button>
      <button data-act="follow" class="${opts.follow ? 'on' : ''}" title="Move the camera to each step">Follow</button>
      ${isolate ? '' : '<button data-act="ffocus" title="Narrow the diagram to just this flow\'s elements">Focus</button>'}
    </div>`;
}
$('#flowbar').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b || !activeFlow) return;
  const a = b.dataset.act;
  if (a === 'close') { setFlow(null); renderIsobar(); }
  if (a === 'prev') { stopPlay(); goStep(activeFlow.step - 1); }
  if (a === 'next') { stopPlay(); goStep(activeFlow.step + 1); }
  if (a === 'play') togglePlay();
  if (a === 'all') { stopPlay(); goStep(-1); }
  if (a === 'follow') { opts.follow = !opts.follow; renderFlowbar(); }
  if (a === 'ffocus') focusFlow(activeFlow.id);
});

function renderFlowsPane() {
  const el = $('#flows');
  if (!model) return;
  if (recording) {
    el.innerHTML = `<div class="rec">
      <label class="field">Flow name<input id="rec-name" value="${esc(recording.name)}" placeholder="e.g. Deploy to production"></label>
      <p class="hint">Click elements in the 3D view or the Outline, in order. Each click adds a step from the previous element. Steps use the modelled connection when one exists, otherwise a white flow-only wire is drawn.</p>
      <ol class="steps">${recording.steps.map((st, i) => `<li><span>${esc(nm(st.from))} → ${esc(nm(st.to))}</span><button data-act="rm" data-i="${i}" title="Remove step">✕</button></li>`).join('')}</ol>
      <p class="hint">${recording.last ? `Next step starts at <b>${esc(nm(recording.last))}</b>. <button class="link" data-act="restart">Start from a different element</button>` : 'Click the first element.'}</p>
      <div class="pa"><button data-act="save" ${recording.steps.length ? '' : 'disabled'}>Save flow</button><button data-act="cancel">Cancel</button></div>
    </div>`;
    return;
  }
  const flows = model.flows || [];
  const allOn = flows.length && flows.every((f) => visibleFlows.has(f.id));
  el.innerHTML = `<div class="pa top"><button data-act="new">+ New flow</button>${flows.length ? `<button data-act="${allOn ? 'hideall' : 'showall'}">${allOn ? 'Hide all' : 'Show all'}</button>` : ''}${!allOn && visibleFlows.size ? '<button data-act="hideall">Hide all</button>' : ''}${activeFlow ? '<button data-act="clear">Close player</button>' : ''}</div>`
    + (flows.length ? '<p class="hint">Tap ● to show or hide a flow in the view (any number at once). Tap a name to play it step by step.</p>' : '')
    + (flows.map((f) => `<div class="flow ${activeFlow && activeFlow.id === f.id ? 'focus' : ''}" data-id="${esc(f.id)}">
        <span class="swatch fsw" style="background:${esc(flowColor(f))}"></span>
        <div class="fcol"><button class="lname" data-act="open"><b>${esc(f.name || f.id)}</b> <small>${f.steps.length} steps</small>${f.description ? `<span class="fdesc">${esc(f.description)}</span>` : ''}</button>${docsHtml(f.docs, 'small')}</div>
        <button class="eye ${visibleFlows.has(f.id) ? 'on' : ''}" data-act="toggle" title="Show/hide this flow in the view" aria-pressed="${visibleFlows.has(f.id)}">${visibleFlows.has(f.id) ? '●' : '◌'}</button>
        <button class="eye" data-act="ffocus" title="Focus: narrow the diagram to this flow">⤢</button>
        <button class="eye" data-act="del" title="Delete flow">✕</button></div>`).join('')
      || '<p class="hint">No flows yet. Press "New flow" and click elements in order, or add a flows: section to the YAML.</p>');
}
$('#flows').addEventListener('input', (e) => { if (e.target.id === 'rec-name' && recording) recording.name = e.target.value; });
$('#flows').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  const a = b.dataset.act;
  const row = b.closest('.flow');
  if (a === 'open') { const id = row.dataset.id; setFlow(activeFlow && activeFlow.id === id ? null : id); if (window.innerWidth < 820) document.body.classList.remove('panel-open'), setTimeout(resize, 0); }
  if (a === 'clear') setFlow(null);
  if (a === 'ffocus') { focusFlow(row.dataset.id); if (window.innerWidth < 820) { document.body.classList.remove('panel-open'); setTimeout(resize, 0); } return; }
  if (a === 'toggle' || a === 'showall' || a === 'hideall') {
    if (isolate) { flash('Exit isolate mode to show flow overlays'); return; }
    if (a === 'toggle') { const id = row.dataset.id; visibleFlows.has(id) ? visibleFlows.delete(id) : visibleFlows.add(id); }
    if (a === 'showall') model.flows.forEach((f) => visibleFlows.add(f.id));
    if (a === 'hideall') visibleFlows.clear();
    if (activeFlow && activeFlow.id !== '__rec') setFlow(null); // overlays show once the player is closed
    applyVisuals(); renderFlowsPane(); renderKey();
  }
  if (a === 'del') {
    model.flows = model.flows.filter((f) => f.id !== row.dataset.id);
    visibleFlows.delete(row.dataset.id);
    if (activeFlow && activeFlow.id === row.dataset.id) setFlow(null);
    saveModel(); flash('Flow deleted. Undo with ↶');
  }
  if (a === 'new' && isolate) { flash('Exit isolate mode to record a flow'); return; }
  if (a === 'new') {
    recording = { name: '', steps: [], last: null };
    selected = null; attachGizmo(); renderProps();
    buildWires(); setFlow('__rec'); view('iso');
  }
  if (a === 'rm') { recording.steps.splice(Number(b.dataset.i), 1); recording.last = recording.steps.length ? String(recording.steps[recording.steps.length - 1].to) : recording.last; buildWires(); applyVisuals(); renderFlowsPane(); }
  if (a === 'restart') { recording.last = null; selected = null; applyVisuals(); renderFlowsPane(); }
  if (a === 'cancel') { recording = null; buildWires(); setFlow(null); }
  if (a === 'save') {
    const name = recording.name.trim() || `Flow ${model.flows.length + 1}`;
    const base = slug(name) || 'flow';
    let id = base, k = 2;
    while (model.flows.some((f) => f.id === id)) id = `${base}-${k++}`;
    model.flows.push({ id, name, steps: recording.steps.map((st) => ({ from: st.from, to: st.to })) });
    recording = null;
    saveModel();
    setFlow(id);
    flash(`Saved flow "${name}"`);
  }
});
function recordClick(id) {
  if (recording.last && recording.last !== id) recording.steps.push({ from: recording.last, to: id });
  recording.last = id;
  selected = id;
  buildWires(); applyVisuals(); renderFlowsPane(); renderOutline();
}
function saveModel() {
  if (isolate) { flash('Exit isolate mode to change the model'); build(); return; }
  const text = dumpModel(model);
  editor.value = text;
  commit(text);
  build();
}

// ---------- Links (connections) ----------
function renderLinks() {
  const el = $('#links');
  if (!model) return;
  const groups = new Map();
  wires.filter((w) => !w.flowOnly).forEach((w) => { if (!groups.has(w.type)) groups.set(w.type, []); groups.get(w.type).push(w); });
  const anyHidden = hiddenConnTypes.size || hiddenConns.size;
  el.innerHTML = `<div class="pa top"><button data-act="showall" ${anyHidden ? '' : 'disabled'}>Show all</button><button data-act="hideall">Hide all</button>${fview ? '<button data-act="unfocus">Clear focus</button>' : ''}</div>
    <p class="hint">Tap ● to show or hide a connection type or a single connection. Tap a connection to focus it (or click a wire in the view).</p>`
    + [...groups.entries()].map(([type, list]) => {
      const tOff = hiddenConnTypes.has(type);
      return `<div class="ltype" data-type="${esc(type)}">
        <span class="wire" style="background:${CONN[type].color}"></span>
        <div class="lt"><b>${esc(type)}</b> <small>${list.length}</small><span class="fdesc">${esc(CONN[type].desc)}</span></div>
        <button class="eye ${tOff ? '' : 'on'}" data-act="ttype" title="Show/hide all ${esc(type)} connections">${tOff ? '◌' : '●'}</button>
      </div>` + list.map((w) => {
        const off = tOff || hiddenConns.has(w.key);
        return `<div class="lrow ${w.key === selectedConn || (fview && fview.conns.has(w.key)) ? 'sel' : ''} ${off ? 'dim' : ''}" data-key="${esc(w.key)}">
          <button class="lname" data-act="focus">${esc(nm(w.conn.from))} → ${esc(nm(w.conn.to))}${w.conn.label ? ` <small>${esc(w.conn.label)}</small>` : ''}</button>
          <button class="eye ${off ? '' : 'on'}" data-act="tone" ${tOff ? 'disabled title="Type is hidden"' : 'title="Show/hide this connection"'}>${off ? '◌' : '●'}</button>
        </div>`;
      }).join('');
    }).join('');
}
$('#links').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  const a = b.dataset.act;
  if (a === 'showall') { hiddenConnTypes.clear(); hiddenConns.clear(); }
  if (a === 'hideall') Object.keys(CONN).forEach((t) => hiddenConnTypes.add(t));
  if (a === 'unfocus') { selectConn(null); return; }
  if (a === 'ttype') { const t = b.closest('.ltype').dataset.type; hiddenConnTypes.has(t) ? hiddenConnTypes.delete(t) : hiddenConnTypes.add(t); }
  if (a === 'tone') { const k = b.closest('.lrow').dataset.key; hiddenConns.has(k) ? hiddenConns.delete(k) : hiddenConns.add(k); }
  if (a === 'focus' && (isolate || e.shiftKey || e.metaKey || e.ctrlKey || opts.addMode)) {
    const k = b.closest('.lrow').dataset.key;
    hiddenConns.delete(k);
    toggleInView('conn', k);
    return;
  }
  if (a === 'focus') {
    const k = b.closest('.lrow').dataset.key;
    if (k === selectedConn) { selectConn(null); return; }
    hiddenConns.delete(k);
    const w = wires.find((x) => x.key === k);
    if (w) hiddenConnTypes.has(w.type) && hiddenConnTypes.delete(w.type);
    selectConn(k);
    if (w) flyToWire(w);
    if (window.innerWidth < 820) { document.body.classList.remove('panel-open'); setTimeout(resize, 0); }
    return;
  }
  if (selectedConn) { const fw = wires.find((w) => w.key === selectedConn); if (fw && !fw.hit.visible) selectedConn = null; }
  applyVisuals(); renderLinks(); renderProps();
});

$('#isobar').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.act === 'exit') { fview = null; selected = null; selectedConn = null; opts.addMode = false; exitIsolate(); }
  if (b.dataset.act === 'ghost') exitIsolate();
  if (b.dataset.act === 'steps' && fview && fview.flowId) {
    activeFlow = { id: fview.flowId, step: -1 };
    document.body.classList.add('flow-on');
    applyVisuals(); renderFlowbar(); renderIsobar(); renderProps();
  }
});

// ---------- Colour key (top right) ----------
const SHAPES = {
  box: '<svg viewBox="0 0 24 24"><path d="M4 8l8-4 8 4v8l-8 4-8-4z M4 8l8 4 8-4 M12 12v8" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
  cyl: '<svg viewBox="0 0 24 24"><ellipse cx="12" cy="6" rx="7" ry="3" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
  cap: '<svg viewBox="0 0 24 24"><rect x="2" y="8" width="20" height="8" rx="4" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
  pill: '<svg viewBox="0 0 24 24"><rect x="8" y="2" width="8" height="20" rx="4" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
  dash: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="3 2"/></svg>',
  glass: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" fill="currentColor" fill-opacity=".2" stroke="currentColor" stroke-width="1.5"/></svg>',
};
let keyOpen = false;
try { keyOpen = localStorage.getItem('sloyka.keyOpen') === '1'; } catch (_) { /* ignore */ }
function renderKey() {
  const el = $('#key');
  if (!model) return;
  el.classList.toggle('open', keyOpen);
  const head = `<button class="kbtn" data-act="key" aria-expanded="${keyOpen}" title="Colour key">Key <span>${keyOpen ? '▴' : '▾'}</span></button>`;
  if (!keyOpen) { el.innerHTML = head; return; }
  const types = new Set();
  nodes.forEach((n) => types.add(n.el.type));
  const used = new Set(model.connections.map((c) => (CONN[c.type] ? c.type : 'sync')));
  if (wires.some((w) => w.flowOnly)) used.add('flow');
  const counts = {};
  nodes.forEach((n) => { counts[n.layer] = (counts[n.layer] || 0) + 1; });
  const layers = model.layers.filter((l) => counts[l.id]);
  const shapeRows = [
    ['dash', 'boundary', 'Boundary / zone (dashed outline)'],
    ['glass', 'container', 'System or container (see-through box holding children)'],
    ['box', 'component', 'Component'],
    ['cyl', 'datastore', 'Datastore'],
    ['cap', 'queue', 'Queue'],
    ['pill', 'actor', 'Actor (person or external client)'],
  ].filter(([, t]) => types.has(t) || (t === 'container' && (types.has('system') || types.has('container'))));
  const ovs = overlayFlows() || [];
  const row = (icon, text, sub) => `<div class="kr">${icon}<span class="kt">${text}${sub ? `<small>${sub}</small>` : ''}</span></div>`;
  el.innerHTML = head + `<div class="kbody">
    ${layers.length ? `<div class="ks"><b>Layers</b>${layers.map((l) => row(`<span class="sw" style="background:${esc(l.color || '#94a3b8')}"></span>`, esc(l.name || l.id))).join('')}</div>` : ''}
    ${used.size ? `<div class="ks"><b>Connections</b>${[...used].map((t) => row(`<span class="wire" style="background:${CONN[t].color}"></span>`, esc(t), esc(CONN[t].desc))).join('')}
      ${row('<span class="arrow">→</span>', 'Direction', 'Arrowhead and moving bands point from source to target')}</div>` : ''}
    ${shapeRows.length ? `<div class="ks"><b>Shapes</b>${shapeRows.map(([k, , d]) => row(`<span class="shape">${SHAPES[k]}</span>`, esc(d))).join('')}</div>` : ''}
    <div class="ks"><b>States</b>
      ${row('<span class="sw solid"></span>', 'In focus', 'Solid and bright')}
      ${row('<span class="sw faded"></span>', 'Out of focus', 'Faded, kept for context')}
      ${row('<span class="badge-k">3</span>', 'Flow step number')}
      ${ovs.map(({ f, color }) => row(`<span class="badge-k" style="background:${esc(color)}">1</span>`, esc(f.name || f.id), 'Flow shown in the view')).join('')}
    </div>
  </div>`;
}
$('#key').addEventListener('click', (e) => {
  if (!e.target.closest('[data-act=key]')) return;
  keyOpen = !keyOpen;
  try { localStorage.setItem('sloyka.keyOpen', keyOpen ? '1' : '0'); } catch (_) { /* ignore */ }
  renderKey();
});

// ---------- Side panel toggle ----------
function setSidebar(hidden) {
  document.body.classList.toggle('side-hidden', hidden);
  $('#sidebar').classList.toggle('on', !hidden);
  $('#sidebar').title = hidden ? 'Show the side panel ( \\ )' : 'Hide the side panel ( \\ )';
  try { localStorage.setItem('sloyka.sideHidden', hidden ? '1' : '0'); } catch (_) { /* ignore */ }
  setTimeout(resize, 0);
}
$('#sidebar').addEventListener('click', () => setSidebar(!document.body.classList.contains('side-hidden')));
try { if (localStorage.getItem('sloyka.sideHidden') === '1') setSidebar(true); else setSidebar(false); } catch (_) { setSidebar(false); }

// ---------- Toolbar ----------
function toggle(key) {
  if (key === 'move' && isolate && !opts.move) { flash('Moving is off while isolated'); return; }
  opts[key] = !opts[key];
  document.querySelectorAll(`[data-toggle="${key}"]`).forEach((b) => b.classList.toggle('on', opts[key]));
  if (key === 'snap') tc.setTranslationSnap(opts.snap ? 0.5 : null);
  if (key === 'move') { attachGizmo(); renderProps(); }
  applyVisuals();
}
document.querySelectorAll('[data-toggle]').forEach((b) => {
  b.classList.toggle('on', opts[b.dataset.toggle]);
  b.addEventListener('click', () => toggle(b.dataset.toggle));
});
document.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => view(b.dataset.view)));
$('#back').addEventListener('click', () => { const c = camHistory.pop(); if (c) animateCamera(c.p, c.t); });
$('#undo').addEventListener('click', () => undo(-1));
$('#redo').addEventListener('click', () => undo(1));
$('#opacity').addEventListener('input', (e) => { opts.k = Number(e.target.value); applyVisuals(); });
function setLabelScale(v) {
  opts.labelScale = Math.round(THREE.MathUtils.clamp(v, 0.6, 2.4) * 10) / 10;
  $('#lsize').textContent = `${Math.round(opts.labelScale * 100)}%`;
  try { localStorage.setItem('sloyka.labelScale', String(opts.labelScale)); } catch (_) { /* ignore */ }
}
$('#lminus').addEventListener('click', () => setLabelScale(opts.labelScale - 0.2));
$('#lplus').addEventListener('click', () => setLabelScale(opts.labelScale + 0.2));
$('#lsize').addEventListener('click', () => setLabelScale(1));
setLabelScale(opts.labelScale);

function modal(html) {
  $('#modal-body').innerHTML = html;
  $('#modal').hidden = false;
}
$('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal' || e.target.dataset.act === 'close') $('#modal').hidden = true; });
$('#png').addEventListener('click', () => {
  renderer.render(scene, camera);
  const url = renderer.domElement.toDataURL('image/png');
  modal(`<h3>Snapshot</h3><p>Right-click or long-press the image to save or copy it.</p><img src="${url}" alt="Diagram snapshot"><button data-act="close">Close</button>`);
});
$('#copy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(editor.value); flash('YAML copied to clipboard'); }
  catch (_) { switchTab('model'); editor.focus(); editor.select(); flash('Select all and copy from the editor'); }
});
$('#import').addEventListener('click', () => $('#file').click());
$('#file').addEventListener('change', async (e) => {
  const f = e.target.files[0]; if (!f) return;
  const text = await f.text();
  editor.value = text;
  if (apply(text)) { view('iso'); flash(`Loaded ${f.name}`); }
  e.target.value = '';
});
$('#sample').addEventListener('change', (e) => {
  const text = EXAMPLES[e.target.value];
  if (text && isolate) { fview = null; isolate = false; model = fullModel; fullModel = null; editor.readOnly = false; document.body.classList.remove('isolated'); renderIsobar(); }
  e.target.value = '';
  if (!text) return;
  editor.value = text;
  selected = null; focusLayer = null; hiddenLayers.clear(); visibleFlows.clear(); hiddenConnTypes.clear(); hiddenConns.clear(); selectedConn = null; fview = null; opts.addMode = false; camHistory.length = 0; recording = null; setFlow(null);
  apply(text);
  view('iso');
});
function flash(t) {
  const el = $('#toast'); el.textContent = t; el.hidden = false;
  clearTimeout(flash.h); flash.h = setTimeout(() => { el.hidden = true; }, 2200);
}

// Tabs + mobile panel
function switchTab(name) {
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('on', t.dataset.tab === name));
  document.querySelectorAll('.pane').forEach((p) => { p.hidden = p.dataset.pane !== name; });
  document.body.classList.add('panel-open');
}
document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => {
  if (t.classList.contains('on') && window.innerWidth < 820) document.body.classList.toggle('panel-open');
  else switchTab(t.dataset.tab);
  setTimeout(resize, 0);
}));

let editTimer;
editor.addEventListener('input', () => {
  clearTimeout(editTimer);
  editTimer = setTimeout(() => apply(editor.value), 400);
});
editor.addEventListener('keydown', (e) => {
  if (e.key === 'Tab') { e.preventDefault(); editor.setRangeText('  ', editor.selectionStart, editor.selectionEnd, 'end'); }
});

window.addEventListener('keydown', (e) => {
  if (e.target === editor || e.target.tagName === 'INPUT') return;
  const mod = e.metaKey || e.ctrlKey;
  if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(e.shiftKey ? 1 : -1); }
  else if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); undo(1); }
  else if (activeFlow && activeFlow.id !== '__rec' && e.key === 'ArrowRight') { stopPlay(); goStep(activeFlow.step + 1); }
  else if (activeFlow && activeFlow.id !== '__rec' && e.key === 'ArrowLeft') { stopPlay(); goStep(activeFlow.step - 1); }
  else if (e.key === 'Escape' && activeFlow && activeFlow.id !== '__rec') setFlow(null);
  else if (e.key === 'Escape') {
    if (opts.addMode) { opts.addMode = false; renderProps(); }
    else if (isolate) exitIsolate();
    else if (fview || selectedConn) selectConn(null);
    else if (selected) select(null);
    else if (focusLayer) { focusLayer = null; applyVisuals(); renderLayers(); }
    else if (visibleFlows.size) { visibleFlows.clear(); applyVisuals(); renderFlowsPane(); }
  }
  else if (e.key === '\\') setSidebar(!document.body.classList.contains('side-hidden'));
  else if (e.key === '+' || e.key === '=') setLabelScale(opts.labelScale + 0.2);
  else if (e.key === '-') setLabelScale(opts.labelScale - 0.2);
  else if (e.key === 'g' || e.key === 'm') toggle('move');
  else if (e.key === 'f' && selected) flyTo(nodes.get(selected));
  else if (e.key === 'p' && selected && nodes.get(selected).parent) select(nodes.get(selected).parent.el.id);
});

// ---------- Loop ----------
const clock = new THREE.Clock();
function frame() {
  const dt = Math.min(clock.getDelta(), 0.1);
  if (opts.flow) wires.forEach((w) => { w.tex.offset.x -= dt * w.speed; });
  if (tween) {
    let t = (performance.now() - tween.start) / tween.ms;
    if (t >= 1) t = 1;
    const k = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    camera.position.lerpVectors(tween.p0, tween.p1, k);
    orbit.target.lerpVectors(tween.t0, tween.t1, k);
    if (t === 1) tween = null;
  }
  orbit.update();
  scaleLabels();
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

// ---------- Boot ----------
$('#ver').textContent = `v${APP_VERSION}`;
let initial = AWS_WEB;
try { const s = localStorage.getItem(STORE_KEY); if (s && !parseModel(s).errors.length) initial = s; } catch (_) { /* ignore */ }
// The saved diagram may be an older copy of a built-in example. Offer the latest version without overwriting.
const staleExample = (() => {
  const first = (t) => (t.split('\n')[0] || '').trim();
  return Object.keys(EXAMPLES).find((k) => initial !== EXAMPLES[k] && first(initial) === first(EXAMPLES[k])) || null;
})();
function renderUpdbar() {
  const bar = $('#updbar');
  let dismissed = null;
  try { dismissed = localStorage.getItem('sloyka.updDismissed'); } catch (_) { /* ignore */ }
  if (!staleExample || dismissed === `${staleExample}@${APP_VERSION}`) { bar.hidden = true; return; }
  bar.hidden = false;
  bar.innerHTML = `<span>You're viewing a saved copy of <b>${esc(EXAMPLE_NAMES[staleExample])}</b>. A newer version of this example is available.</span>
    <button data-act="load">Load latest</button><button data-act="keep" title="Keep your saved copy (it may include your edits)">Keep mine</button>`;
}
$('#updbar').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.act === 'load') {
    const text = EXAMPLES[staleExample];
    editor.value = text;
    selected = null; focusLayer = null; hiddenLayers.clear(); visibleFlows.clear(); fview = null; selectedConn = null;
    apply(text); view('iso');
    flash(`Loaded the latest ${EXAMPLE_NAMES[staleExample]}. Undo (↶) brings back your saved copy.`);
  }
  try { localStorage.setItem('sloyka.updDismissed', `${staleExample}@${APP_VERSION}`); } catch (_) { /* ignore */ }
  $('#updbar').hidden = true;
});
editor.value = initial;
resize();
apply(initial);
if (window.innerWidth >= 820) switchTab('model'); else { switchTab('layers'); document.body.classList.remove('panel-open'); }
frameBox(worldBox(), VIEWS.iso.clone());
tween && (tween.ms = 1);
renderUpdbar();
requestAnimationFrame(frame);
window.__sloyka = { focusFlow, get isolate() { return isolate; }, elemConnOff, elemHiddenTypes, get elemShowConns() { return elemShowConns; }, toggleInView, get fview() { return fview; }, camera, renderer, selectConn, get selectedConn() { return selectedConn; }, hiddenConnTypes, visibleFlows, applyVisuals, setFlow, goStep, get flows() { return model.flows; }, dragTest(id, p) { select(id); nodes.get(id).group.position.set(...p); onDragEnd(); }, nodes, select, view, get wires() { return wires; }, toggle, apply };

'use strict';

/* ==========================================================
   Trener radionawigacji – stacja VOR i samolot na mapie
   ----------------------------------------------------------
   Współrzędne "świata" są w milach morskich (NM):
   x rośnie na wschód, y na północ, stacja VOR leży w (0, 0).
   Dla uproszczenia północ mapy = północ magnetyczna
   (deklinacja 0°), więc radial = kierunek na mapie.
   ========================================================== */

// ---------- Konfiguracja ----------
const STATION = {
  type: 'VOR-DME',        // 'VOR' | 'VOR-DME' (zwykły VOR nie ma DME)
};

const START = { x: 14, y: -9, hdg: 330, obs: 300, range: 30 };
const ALT_FT = 5000;       // stała wysokość samolotu nad stacją [ft] – do odległości DME po skosie
const FT_PER_NM = 6076.12;
const RANGE_MIN = 8;      // najbliższy zoom: ±8 NM
const RANGE_MAX = 80;     // najdalszy zoom: ±80 NM
const EDGE_PX = 28;       // samolot zawsze co najmniej tyle px od krawędzi mapy
const ROSE_R = 105;       // promień róży VOR [px]

const CONE_NM = 0.8;      // "stożek ciszy" nad stacją – sygnał nieużyteczny
const AMBIGUITY_DEG = 3;  // ± tyle stopni od trawersu wskaźnik TO/FROM nie pokazuje nic

// ---------- Stan aplikacji ----------
const state = {
  plane: { x: START.x, y: START.y, hdg: START.hdg },
  obs: START.obs,         // kurs wybrany gałką OBS (CDI) = CRS (HSI), wspólny odbiornik NAV
  hdgBug: START.hdg,      // znacznik kursu na HSI
  rmiSources: ['VOR', 'VOR'],   // źródło igły RMI: [wąska, szeroka]
  range: START.range,     // wybrany zoom: NM od środka mapy do jej krótszej krawędzi
  flying: false,
  gs: 120,                // prędkość względem ziemi [kt]
  timeScale: 30,          // przyspieszenie czasu
  showRadial: true,
  showHdgLine: true,
  showObsLine: true,
};

const view = { w: 1, h: 1, range: START.range, ppn: 1 };   // range = faktyczny zakres, ppn = pikseli na NM

// ---------- Pomocnicze ----------
const $ = sel => document.querySelector(sel);
const SVG_NS = 'http://www.w3.org/2000/svg';

function el(tag, attrs = {}, parent = null) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (parent) parent.appendChild(node);
  return node;
}

const rad = d => d * Math.PI / 180;
const deg = r => r * 180 / Math.PI;
const norm360 = a => ((a % 360) + 360) % 360;
const norm180 = a => norm360(a + 180) - 180;          // zakres -180…+180
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const fmt3 = a => String(Math.round(norm360(a)) % 360).padStart(3, '0');
const fmtRadial = a => (fmt3(a) === '000' ? '360' : fmt3(a));   // radial północny to R360, nie R000

/** Kierunek z punktu A do B w stopniach (0 = północ, w prawo). */
function bearing(ax, ay, bx, by) {
  return norm360(deg(Math.atan2(bx - ax, by - ay)));
}

/**
 * Odległość DME [NM] – po skosie, w linii prostej od samolotu do stacji
 * (DME mierzy czas przelotu impulsu tam i z powrotem). Nad stacją pokazuje więc wysokość.
 */
function slantRange() {
  return Math.hypot(state.plane.x, state.plane.y, ALT_FT / FT_PER_NM);
}

// ---------- Elementy DOM ----------
const svg = $('#map');
const mapWrap = $('#mapWrap');
const radialLine = $('#radialLine');
const radialLabel = $('#radialLabel');
const radialLabelText = $('#radialLabelText');
const hdgInput = $('#hdgInput');
const hdgSlider = $('#hdgSlider');
const obsInput = $('#obsInput');
const bugInput = $('#bugInput');
const flyBtn = $('#flyBtn');

const cdi = createCDI($('#cdi'), delta => setObs(state.obs + delta));
const hsi = createHSI($('#hsi'), {
  onCourse: delta => setObs(state.obs + delta),
  onBug: delta => setBug(state.hdgBug + delta),
  onBugSync: () => setBug(state.plane.hdg),
});
const rmi = createRMI($('#rmi'), i => {
  state.rmiSources[i] = state.rmiSources[i] === 'VOR' ? 'ADF' : 'VOR';
  rmi.setSources(state.rmiSources);
  updateRmi();
});

// ==========================================================
//  Odbiornik VOR
// ==========================================================

/**
 * To, co "widzi" odbiornik VOR dla wybranego kursu (OBS):
 *  - FROM, gdy samolot jest po tej stronie stacji, w którą prowadzi kurs OBS,
 *    TO – gdy po przeciwnej (kurs prowadzi dopiero do stacji),
 *  - dev: o ile stopni radial samolotu różni się od linii kursu;
 *    + oznacza, że linia kursu jest po prawej (wskazówka w prawo).
 * Kurs samolotu (HDG) nie ma tu żadnego znaczenia – tak jak w prawdziwym VOR.
 */
function vorReceiver() {
  const { x, y } = state.plane;
  if (Math.hypot(x, y) < CONE_NM) return { valid: false, toFrom: null, dev: 0 };

  const d = norm180(bearing(0, 0, x, y) - state.obs);   // radial samolotu względem OBS
  const from = Math.abs(d) < 90;
  const nearAbeam = Math.abs(Math.abs(d) - 90) < AMBIGUITY_DEG;
  return {
    valid: true,
    toFrom: nearAbeam ? null : from ? 'FROM' : 'TO',
    dev: from ? -d : norm180(d - 180),
  };
}

/**
 * RMI: igła w trybie VOR wskazuje na karcie QDM (namiar NA stację), jej ogon – radial.
 * Oba odbiorniki NAV są nastawione na tę samą stację, więc obie igły VOR pokrywają się.
 * Na mapie nie ma jeszcze NDB, więc igła w trybie ADF nie ma sygnału i parkuje na godzinie 3.
 * DME pokazuje odległość tylko wtedy, gdy stacja ma DME (VOR-DME).
 */
function updateRmi() {
  const { x, y, hdg } = state.plane;
  const dist = Math.hypot(x, y);
  const qdm = dist < CONE_NM ? null : bearing(x, y, 0, 0);
  const dme = STATION.type === 'VOR' ? null : slantRange();
  rmi.update({
    hdg,
    bearings: state.rmiSources.map(src => (src === 'VOR' ? qdm : null)),
    dme: [dme, dme],
  });
}

/** CDI i HSI pokazują ten sam odbiornik NAV (ten sam kurs i odchylenie) – HSI dodatkowo kurs samolotu. */
function updateNavInstruments() {
  const signal = vorReceiver();
  cdi.setSignal(signal);
  hsi.update({ hdg: state.plane.hdg, course: state.obs, bug: state.hdgBug, signal });
}

// ==========================================================
//  Rysowanie
// ==========================================================

/** Stacja VOR: róża kompasowa, symbol i ramka z danymi – jak na mapie lotniczej. */
function drawStation() {
  const g = $('#stationLayer');
  g.innerHTML = '';

  // Róża: kreski co 5°, dłuższe co 10° i 30°
  el('circle', { r: ROSE_R, class: 'rose-ring' }, g);
  for (let a = 0; a < 360; a += 5) {
    if (a === 0) continue;                             // tam jest grot strzałki MN
    const len = a % 30 === 0 ? 14 : a % 10 === 0 ? 9 : 5;
    const sx = Math.sin(rad(a)), sy = -Math.cos(rad(a));
    el('line', {
      x1: sx * ROSE_R, y1: sy * ROSE_R,
      x2: sx * (ROSE_R - len), y2: sy * (ROSE_R - len),
      class: 'rose-tick',
    }, g);
  }
  for (let a = 30; a < 360; a += 30) {
    el('text', {
      class: 'rose-label',
      transform: `rotate(${a}) translate(0 ${-(ROSE_R - 24)})`,
    }, g).textContent = a;
  }

  // Strzałka na północ magnetyczną (MN): od środka stacji, grot dotyka okręgu od wewnątrz
  // (środek linii przykryje symbol stacji rysowany niżej)
  el('line', { x1: 0, y1: 0, x2: 0, y2: -(ROSE_R - 12), class: 'rose-tick' }, g);
  el('path', { d: `M0 ${-ROSE_R} L-5 ${-(ROSE_R - 14)} L5 ${-(ROSE_R - 14)} Z`, class: 'rose-arrow' }, g);

  drawNavaidSymbol(g, STATION.type);
}

/** Symbol pomocy nawigacyjnej: heksagon (VOR) albo heksagon w prostokącie (VOR-DME). */
function drawNavaidSymbol(g, type) {
  const r = 9;                              // promień heksagonu
  const ap = r * Math.cos(Math.PI / 6);     // odległość środka od boku
  const pts = [];
  for (let i = 0; i < 6; i++) {
    pts.push(`${(r * Math.cos(i * Math.PI / 3)).toFixed(2)},${(r * Math.sin(i * Math.PI / 3)).toFixed(2)}`);
  }

  if (type === 'VOR-DME') {
    el('rect', { x: -r - 3, y: -ap - 3, width: 2 * r + 6, height: 2 * ap + 6, class: 'nav-sym' }, g);
  }
  el('polygon', { points: pts.join(' '), class: 'nav-sym' }, g);
  el('circle', { r: 1.8, class: 'nav-fill' }, g);
}

/** Samolot "z kresek", nosem do góry; obracany atrybutem transform. */
function buildPlane() {
  const g = el('g', { id: 'plane' }, $('#planeLayer'));

  el('line', { x1: 0, y1: -24, x2: 0, y2: -6000, class: 'hdg-line', id: 'hdgLine' }, g);

  const body = el('g', { class: 'plane-body' }, g);
  el('title', {}, body).textContent = 'Drag to move the aircraft';
  el('circle', { r: 26, class: 'hit' }, body);
  el('rect', { x: -23, y: -11, width: 46, height: 6, rx: 2, class: 'plane-part' }, body);  // skrzydło
  el('rect', { x: -9, y: 13, width: 18, height: 4, rx: 1.5, class: 'plane-part' }, body);  // statecznik
  el('path', {                                                                           // kadłub
    d: 'M0 -21 C3.5 -21 4 -16 4 -10 L2.2 14 L0 20 L-2.2 14 L-4 -10 C-4 -16 -3.5 -21 0 -21 Z',
    class: 'plane-part',
  }, body);
  el('line', { x1: -6, y1: -23, x2: 6, y2: -23, class: 'plane-line' }, body);              // śmigło

  // uchwyt do obracania
  const handle = el('g', { class: 'handle', id: 'handle', transform: 'translate(0 -52)' }, g);
  el('title', {}, handle).textContent = 'Drag to change the heading';
  el('line', { x1: 0, y1: 5, x2: 0, y2: 26, class: 'plane-line' }, handle);
  el('circle', { r: 11, class: 'hit' }, handle);
  el('circle', { r: 5, class: 'knob' }, handle);

  return { g, body, handle };
}

/** Siatka co 5 NM (grubsza co 10 NM); przy dużym oddaleniu co 10/20 NM. */
function drawGrid() {
  const g = $('#gridLayer');
  g.innerHTML = '';
  const { w, h, ppn } = view;
  const step = ppn * 5 < 14 ? 10 : 5;
  const major = step * 2;
  const xMax = w / 2 / ppn, yMax = h / 2 / ppn;

  for (let x = Math.ceil(-xMax / step) * step; x <= xMax; x += step) {
    el('line', { x1: x * ppn, y1: -h / 2, x2: x * ppn, y2: h / 2,
      class: x % major === 0 ? 'grid-major' : 'grid-minor' }, g);
  }
  for (let y = Math.ceil(-yMax / step) * step; y <= yMax; y += step) {
    el('line', { x1: -w / 2, y1: -y * ppn, x2: w / 2, y2: -y * ppn,
      class: y % major === 0 ? 'grid-major' : 'grid-minor' }, g);
  }
}

/** Podziałka liniowa w lewym dolnym rogu. */
function drawScaleBar() {
  const g = $('#scaleBar');
  g.innerHTML = '';
  const nm = [1, 2, 5, 10, 20, 25, 50, 100].find(n => n * view.ppn >= 70) || 100;
  const len = nm * view.ppn;
  const x0 = -view.w / 2 + 22, y0 = view.h / 2 - 16;

  el('rect', { x: x0 - 10, y: y0 - 26, width: len + 20, height: 34, rx: 4, class: 'scale-bg' }, g);
  el('path', { d: `M${x0} ${y0 - 6} V${y0} H${x0 + len} V${y0 - 6} M${x0 + len / 2} ${y0} V${y0 - 4}`, class: 'scale-line' }, g);
  el('text', { x: x0 + len / 2, y: y0 - 11, class: 'scale-label' }, g).textContent = `${nm} NM`;
}

/** Ustawia samolot, linię radialu i odczyty zgodnie ze stanem. */
function drawPlane() {
  const { x, y, hdg } = state.plane;
  plane.g.setAttribute('transform', `translate(${(x * view.ppn).toFixed(1)} ${(-y * view.ppn).toFixed(1)}) rotate(${hdg})`);
  $('#hdgLine').style.display = state.showHdgLine ? '' : 'none';

  const dist = Math.hypot(x, y);
  const qdr = bearing(0, 0, x, y);
  const overStation = dist < 0.05;

  const showRadial = state.showRadial && !overStation;
  radialLine.style.display = radialLabel.style.display = showRadial ? '' : 'none';
  if (showRadial) {
    const ux = Math.sin(rad(qdr)), uy = -Math.cos(rad(qdr));
    radialLine.setAttribute('x2', ux * 6000);
    radialLine.setAttribute('y2', uy * 6000);
    const dpx = dist * view.ppn;
    const ld = dpx > ROSE_R + 70 ? (ROSE_R + dpx) / 2 : dpx + 50;
    radialLabel.setAttribute('transform', `translate(${(ux * ld).toFixed(1)} ${(uy * ld).toFixed(1)})`);
    radialLabelText.textContent = 'R' + fmtRadial(qdr);
  }

  $('#roHdg').textContent = fmt3(hdg) + '°';
  $('#roDme').textContent = slantRange().toFixed(1) + ' NM';
  $('#roQdr').textContent = overStation ? '---' : fmtRadial(qdr) + '°';
  $('#roQdm').textContent = overStation ? '---' : fmt3(qdr + 180) + '°';
  $('#roRb').textContent  = overStation ? '---' : fmt3(qdr + 180 - hdg) + '°';

  updateNavInstruments();
  updateRmi();
}

/** Linia wybranego kursu (OBS) przez stację, ze strzałkami w kierunku kursu. */
function drawObsLine() {
  const g = $('#obsLayer');
  g.innerHTML = '';
  g.style.display = state.showObsLine ? '' : 'none';

  const ux = Math.sin(rad(state.obs)), uy = -Math.cos(rad(state.obs));
  el('line', { x1: -ux * 6000, y1: -uy * 6000, x2: ux * 6000, y2: uy * 6000, class: 'obs-line' }, g);
  for (const d of [-(ROSE_R + 150), -(ROSE_R + 40), ROSE_R + 40, ROSE_R + 150]) {
    el('path', {
      d: 'M-6 4 L0 -3 L6 4',
      transform: `translate(${(ux * d).toFixed(1)} ${(uy * d).toFixed(1)}) rotate(${state.obs})`,
      class: 'obs-arrow',
    }, g);
  }
  const label = el('g', {
    class: 'obs-label',
    transform: `translate(${(ux * (ROSE_R + 95)).toFixed(1)} ${(uy * (ROSE_R + 95)).toFixed(1)})`,
  }, g);
  el('rect', { x: -30, y: -9, width: 60, height: 18, rx: 3 }, label);
  el('text', { x: 0, y: 0 }, label).textContent = 'OBS ' + fmt3(state.obs);
}

// ==========================================================
//  Widok, pozycja, kurs
// ==========================================================

/** Zakres mapy [NM] potrzebny, żeby punkt (x, y) był widoczny. */
function rangeToShow(x, y) {
  const half = Math.min(view.w, view.h) / 2;
  return Math.max(
    Math.abs(x) * half / Math.max(1, view.w / 2 - EDGE_PX),
    Math.abs(y) * half / Math.max(1, view.h / 2 - EDGE_PX),
  );
}

/** Ustawia skalę mapy i przerysowuje siatkę oraz podziałkę. */
function setScale(range) {
  view.range = range;
  view.ppn = Math.min(view.w, view.h) / 2 / range;
  drawGrid();
  drawScaleBar();
}

/**
 * Skala wynika z zoomu wybranego przez użytkownika (state.range),
 * ale mapa nie przybliży się tak, żeby samolot wypadł poza ekran.
 */
function updateScale() {
  setScale(clamp(state.range, rangeToShow(state.plane.x, state.plane.y), RANGE_MAX));
  drawPlane();
}

function zoomTo(range) {
  state.range = clamp(range, RANGE_MIN, RANGE_MAX);
  updateScale();
}

function onResize() {
  view.w = Math.max(1, mapWrap.clientWidth);
  view.h = Math.max(1, mapWrap.clientHeight);
  svg.setAttribute('viewBox', `${-view.w / 2} ${-view.h / 2} ${view.w} ${view.h}`);
  updateScale();
}

/**
 * Przesuwa samolot (zawsze w granicach widocznej mapy).
 * autoZoom – w locie mapa oddala się, gdy samolot dochodzi do krawędzi.
 */
function setPlanePos(x, y, autoZoom = false) {
  if (autoZoom) {
    const need = rangeToShow(x, y);
    if (need > view.range) {
      if (need > RANGE_MAX) stopFlight();          // dalej już się nie da oddalić
      state.range = Math.min(need, RANGE_MAX);
      setScale(state.range);
    }
  }
  const lx = Math.max(0, view.w / 2 - EDGE_PX) / view.ppn;
  const ly = Math.max(0, view.h / 2 - EDGE_PX) / view.ppn;
  state.plane.x = clamp(x, -lx, lx);
  state.plane.y = clamp(y, -ly, ly);
  drawPlane();
}

function setHeading(h) {
  state.plane.hdg = Math.round(norm360(h)) % 360;
  hdgSlider.value = state.plane.hdg;
  if (document.activeElement !== hdgInput) hdgInput.value = fmt3(state.plane.hdg);
  drawPlane();
}

function setObs(v) {
  state.obs = Math.round(norm360(v)) % 360;
  if (document.activeElement !== obsInput) obsInput.value = fmt3(state.obs);
  cdi.setObs(state.obs);
  updateNavInstruments();
  drawObsLine();
}

function setBug(v) {
  state.hdgBug = Math.round(norm360(v)) % 360;
  if (document.activeElement !== bugInput) bugInput.value = fmt3(state.hdgBug);
  updateNavInstruments();
}

// ==========================================================
//  Lot
// ==========================================================
let rafId = null;
let lastFrame = null;

// Pozycja sprzed startu lotu – do niej wraca przycisk Reset.
// Wznowienie lotu po pauzie (bez ruszania samolotu) jej nie nadpisuje.
let flightStart = null;
let pausedAt = null;

const planeSnapshot = () => ({ x: state.plane.x, y: state.plane.y, hdg: state.plane.hdg });
const samePlace = (a, b) => a && b && a.x === b.x && a.y === b.y && a.hdg === b.hdg;

function startFlight() {
  const resumed = flightStart && samePlace(pausedAt, planeSnapshot());
  if (!resumed) flightStart = { ...planeSnapshot(), range: state.range };
  pausedAt = null;
  state.flying = true;
  flyBtn.textContent = '⏸ Stop';
  flyBtn.classList.add('active');
  lastFrame = null;
  cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(flyStep);
}

function stopFlight() {
  if (state.flying) pausedAt = planeSnapshot();
  state.flying = false;
  flyBtn.textContent = '▶ Fly';
  flyBtn.classList.remove('active');
  cancelAnimationFrame(rafId);
}

function toggleFlight() {
  state.flying ? stopFlight() : startFlight();
}

function flyStep(t) {
  if (lastFrame !== null) {
    const dt = Math.min(0.25, (t - lastFrame) / 1000);       // [s]; limit chroni przed skokiem po powrocie na kartę
    const d = state.gs / 3600 * dt * state.timeScale;        // przebyta droga [NM]
    const h = rad(state.plane.hdg);
    setPlanePos(state.plane.x + d * Math.sin(h), state.plane.y + d * Math.cos(h), true);
  }
  lastFrame = t;
  if (state.flying) rafId = requestAnimationFrame(flyStep);
}

// ==========================================================
//  Obsługa myszy / dotyku
// ==========================================================
let drag = null;

function eventToWorld(e) {
  const r = svg.getBoundingClientRect();
  const px = e.clientX - r.left - r.width / 2;
  const py = e.clientY - r.top - r.height / 2;
  return [px / view.ppn, -py / view.ppn];
}

function startDrag(e, mode) {
  e.preventDefault();
  e.stopPropagation();
  const [wx, wy] = eventToWorld(e);
  drag = { mode, id: e.pointerId, dx: state.plane.x - wx, dy: state.plane.y - wy };
  svg.setPointerCapture(e.pointerId);
  plane.g.classList.add('dragging');
}

function endDrag(e) {
  if (!drag || e.pointerId !== drag.id) return;
  drag = null;
  plane.g.classList.remove('dragging');
}

const plane = buildPlane();

plane.body.addEventListener('pointerdown', e => startDrag(e, 'move'));
plane.handle.addEventListener('pointerdown', e => startDrag(e, 'rotate'));

svg.addEventListener('pointermove', e => {
  if (!drag || e.pointerId !== drag.id) return;
  const [wx, wy] = eventToWorld(e);
  if (drag.mode === 'move') {
    setPlanePos(wx + drag.dx, wy + drag.dy);
  } else {
    setHeading(bearing(state.plane.x, state.plane.y, wx, wy));
  }
});
svg.addEventListener('pointerup', endDrag);
svg.addEventListener('pointercancel', endDrag);

svg.addEventListener('dblclick', e => {
  const [wx, wy] = eventToWorld(e);
  setPlanePos(wx, wy);
});

let wheelAcc = 0;
svg.addEventListener('wheel', e => {
  e.preventDefault();
  const dy = e.deltaMode === 1 ? e.deltaY * 40 : e.deltaY;   // Firefox podaje czasem w liniach
  if (e.target.closest('.plane-body, .handle')) {
    // nad samolotem: kurs co 5° (do góry = w prawo)
    wheelAcc += dy;
    if (Math.abs(wheelAcc) >= 50) {
      setHeading(state.plane.hdg - Math.sign(wheelAcc) * 5);
      wheelAcc = 0;
    }
  } else {
    zoomTo(view.range * Math.exp(dy * 0.0015));
  }
}, { passive: false });

// ==========================================================
//  Panel sterowania
// ==========================================================
/** Pole z kątem (np. "045") wpisywanym z klawiatury; po wyjściu z pola wraca do formatu 3 cyfr. */
function bindDegreeInput(input, get, set) {
  input.addEventListener('input', () => {
    const v = parseInt(input.value, 10);
    if (!Number.isNaN(v)) set(v);
  });
  const reformat = () => { input.value = fmt3(get()); };
  input.addEventListener('change', reformat);
  input.addEventListener('blur', reformat);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') input.blur(); });
}

bindDegreeInput(hdgInput, () => state.plane.hdg, setHeading);
bindDegreeInput(obsInput, () => state.obs, setObs);
bindDegreeInput(bugInput, () => state.hdgBug, setBug);

document.querySelectorAll('[data-hdg]').forEach(btn => {
  btn.addEventListener('click', () => setHeading(state.plane.hdg + Number(btn.dataset.hdg)));
});
document.querySelectorAll('[data-bug]').forEach(btn => {
  btn.addEventListener('click', () => setBug(state.hdgBug + Number(btn.dataset.bug)));
});
document.querySelectorAll('[data-obs]').forEach(btn => {
  btn.addEventListener('click', () => setObs(state.obs + Number(btn.dataset.obs)));
});

hdgSlider.addEventListener('input', () => setHeading(Number(hdgSlider.value)));

$('#gsSlider').addEventListener('input', e => {
  state.gs = Number(e.target.value);
  $('#gsOut').textContent = `${state.gs} kt`;
});

$('#timeScale').addEventListener('change', e => { state.timeScale = Number(e.target.value); });

flyBtn.addEventListener('click', toggleFlight);

// Reset: samolot wraca tam, gdzie był przed naciśnięciem "Leć" (a przed pierwszym lotem – na start).
$('#resetBtn').addEventListener('click', () => {
  stopFlight();
  const s = flightStart || START;
  state.plane.x = s.x;
  state.plane.y = s.y;
  zoomTo(s.range);
  setHeading(s.hdg);
  pausedAt = null;
});

$('#showRadial').addEventListener('change', e => { state.showRadial = e.target.checked; drawPlane(); });
$('#showHdg').addEventListener('change', e => { state.showHdgLine = e.target.checked; drawPlane(); });
$('#showObs').addEventListener('change', e => { state.showObsLine = e.target.checked; drawObsLine(); });

$('#stationType').addEventListener('change', e => {
  STATION.type = e.target.value;
  drawStation();
  updateRmi();
});

// Klawiatura: ←/→ kurs, Spacja lot
document.addEventListener('keydown', e => {
  const t = e.target;
  if (t.matches('input[type="text"], select, textarea')) return;

  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    if (t.matches('input[type="range"]')) return;          // suwak obsługuje strzałki sam
    e.preventDefault();
    const step = e.shiftKey ? 10 : 1;
    setHeading(state.plane.hdg + (e.key === 'ArrowRight' ? step : -step));
  } else if (e.key === ' ') {
    if (t.matches('input[type="checkbox"]')) return;
    e.preventDefault();
    if (t.tagName === 'BUTTON') t.blur();                   // żeby spacja nie "kliknęła" przycisku
    toggleFlight();
  }
});

// ==========================================================
//  Start
// ==========================================================
drawStation();
new ResizeObserver(onResize).observe(mapWrap);
rmi.setSources(state.rmiSources);
onResize();
setHeading(state.plane.hdg);
setObs(state.obs);
setBug(state.hdgBug);

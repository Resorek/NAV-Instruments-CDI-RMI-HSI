'use strict';

/* ==========================================================
   HSI – wskaźnik sytuacji poziomej (wygląd na wzór schematu HSI)
   ----------------------------------------------------------
   createHSI(container, { onCourse, onBug, onBugSync }) rysuje przyrząd i zwraca:
     update({ hdg, course, bug, signal })
        hdg    – kurs samolotu (karta obraca się, kurs jest pod kreską u góry)
        course – kurs wybrany gałką CRS (strzałka kursu)
        bug    – znacznik kursu (pomarańczowy "bug" na krawędzi karty)
        signal – { valid, toFrom: 'TO' | 'FROM' | null, dev } jak dla CDI
   onCourse(n) / onBug(n) – kręcenie lewą / prawą gałką, onBugSync() – klik w prawą gałkę.
   Wymiary w jednostkach viewBox 760 × 728, środek karty (380, 376).
   ========================================================== */

function createHSI(container, { onCourse, onBug, onBugSync }) {
  const NS = 'http://www.w3.org/2000/svg';
  const CX = 380, CY = 376;
  const R = 250;            // promień karty kompasowej
  const INNER_R = 165;      // wewnętrzna tarcza ze wskazówką kursu
  const DOT = 21;           // odstęp kropek skali odchylenia (1 kropka = 2°)
  const DEG_PER_DOT = 2;
  const MAX_DEV = 11;
  const KNOB_R = 57;
  const ORANGE = '#f0903b';

  const mk = (tag, attrs = {}, parent = null) => {
    const n = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    if (parent) parent.appendChild(n);
    return n;
  };
  const norm180 = a => ((((a + 180) % 360) + 360) % 360) - 180;

  const svg = mk('svg', { viewBox: '0 0 760 728', class: 'hsi-svg' });
  container.appendChild(svg);

  mk('defs', {}, svg).innerHTML = `
    <linearGradient id="hsiCase" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#535353"/><stop offset="1" stop-color="#303030"/>
    </linearGradient>
    <radialGradient id="hsiInner" cx=".35" cy=".35" r=".8">
      <stop offset="0" stop-color="#555"/><stop offset="1" stop-color="#3f3f3f"/>
    </radialGradient>
    <linearGradient id="hsiStrip" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#7a7a7a" stop-opacity=".55"/><stop offset="1" stop-color="#111" stop-opacity=".8"/>
    </linearGradient>
    <radialGradient id="hsiKnob" cx=".4" cy=".35" r=".75">
      <stop offset="0" stop-color="#666"/><stop offset="1" stop-color="#3a3a3a"/>
    </radialGradient>
    <clipPath id="hsiInnerClip"><circle cx="${CX}" cy="${CY}" r="${INNER_R}"/></clipPath>
    <filter id="hsiShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="4" dy="5" stdDeviation="3" flood-color="#000" flood-opacity=".45"/>
    </filter>`;

  // ---------- Obudowa ----------
  mk('rect', { width: 760, height: 728, fill: 'url(#hsiCase)' }, svg);
  mk('rect', { x: 38, y: 40, width: 684, height: 652, rx: 120, fill: '#3b3b3b', stroke: '#8e8e8e', 'stroke-width': 7 }, svg);
  mk('rect', { x: 66, y: 150, width: 628, height: 480, rx: 60, fill: '#4f4f4f' }, svg);
  mk('circle', { cx: CX, cy: CY, r: R + 14, fill: '#2f2f2f' }, svg);

  // ---------- Skale ścieżki schodzenia (po bokach) ----------
  for (const s of [-1, 1]) {
    const x = CX + s * 268;
    for (const k of [-2, -1, 1, 2]) {
      mk('line', { x1: x - 12, y1: CY + k * 61, x2: x + 12, y2: CY + k * 61, class: 'hsi-mark' }, svg);
      mk('circle', { cx: x, cy: CY + k * 61, r: 5, fill: '#fff' }, svg);
    }
    mk('line', { x1: x - 7 * s, y1: CY, x2: x + 7 * s, y2: CY, class: 'hsi-mark' }, svg);
    // wskaźnik ścieżki (dla VOR nieaktywny – stoi na środku)
    const p = x - s * 16;
    mk('polygon', {
      points: `${p - s * 44},${CY - 21} ${p - s * 8},${CY - 14} ${p - s * 8},${CY - 5} ${p},${CY - 5} ${p},${CY + 5} ${p - s * 8},${CY + 5} ${p - s * 8},${CY + 14} ${p - s * 44},${CY + 21}`,
      fill: '#fff', filter: 'url(#hsiShadow)',
    }, svg);
    mk('text', { x: CX + s * 249, y: CY - 158, class: 'hsi-gs' }, svg).textContent = 'GS';
  }

  // ---------- Stałe znaczniki co 45° ----------
  for (const a of [45, 135, 180, 225, 315]) {
    mk('line', {
      x1: CX, y1: CY - R - 10, x2: CX, y2: CY - R - 32,
      transform: `rotate(${a} ${CX} ${CY})`, class: 'hsi-mark45',
    }, svg);
  }

  // ---------- Obrotowa karta kompasowa ----------
  const card = mk('g', {}, svg);
  mk('circle', { cx: CX, cy: CY, r: R, fill: '#3a3a3a' }, card);
  for (let a = 0; a < 360; a += 5) {
    const long = a % 10 === 0;
    mk('line', {
      x1: CX, y1: CY - R + 7, x2: CX, y2: CY - R + (long ? 34 : 20),
      transform: `rotate(${a} ${CX} ${CY})`,
      class: 'hsi-tick', 'stroke-width': long ? 5.5 : 4.5,
    }, card);
  }
  const LABELS = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' };
  for (let a = 0; a < 360; a += 30) {
    mk('text', { x: CX, y: CY - 192, transform: `rotate(${a} ${CX} ${CY})`, class: 'hsi-num' }, card)
      .textContent = LABELS[a] || a / 10;
  }
  const bug = mk('path', {                       // znacznik kursu (heading bug)
    d: `M${CX - 16} ${CY - R - 6} H${CX - 5} L${CX} ${CY - R + 4} L${CX + 5} ${CY - R - 6} H${CX + 16} V${CY - R + 20} L${CX + 9} ${CY - R + 28} H${CX - 9} L${CX - 16} ${CY - R + 20} Z`,
    class: 'hsi-bug',
  }, card);
  mk('circle', { cx: CX, cy: CY, r: INNER_R, fill: 'url(#hsiInner)', stroke: '#2b2b2b', 'stroke-width': 3 }, card);

  // ---------- Kreska kursu (lubber line) ----------
  mk('rect', { x: CX - 40, y: CY - 296, width: 38, height: 36, fill: '#5c5c5c' }, svg);
  mk('rect', { x: CX - 2, y: CY - 296, width: 38, height: 36, fill: '#8f8f8f' }, svg);
  mk('path', { d: `M${CX - 6} ${CY - 282} L${CX + 6} ${CY - 282} L${CX + 3} ${CY - 268} V${CY - 110} H${CX - 3} V${CY - 268} Z`, fill: '#fff' }, svg);

  // ---------- Wskazówka kursu, skala odchylenia, TO/FROM ----------
  const courseGrp = mk('g', { 'clip-path': 'url(#hsiInnerClip)' }, svg);
  const courseRot = mk('g', {}, courseGrp);
  mk('rect', { x: CX - 140, y: CY - 22, width: 280, height: 44, fill: 'url(#hsiStrip)' }, courseRot);
  for (let k = 1; k <= 5; k++) {
    for (const s of [-1, 1]) {
      const x = CX + s * k * DOT;
      mk('line', { x1: x, y1: CY - 10, x2: x, y2: CY + 10, class: 'hsi-mark' }, courseRot);
      mk('circle', { cx: x, cy: CY, r: 4.5, fill: '#fff' }, courseRot);
    }
  }
  const devBar = mk('rect', { x: CX - 4.5, y: CY - 104, width: 9, height: 208, rx: 3, class: 'hsi-dev', filter: 'url(#hsiShadow)' }, courseRot);
  // TO/FROM: wąski trójkąt po stronie grota (TO) albo ogona (FROM), skierowany wzdłuż kursu
  // (wąski, bo trójkąt równoboczny obrócony o 30° wygląda, jakby wskazywał w bok)
  const toTri = mk('polygon', { points: `${CX + 38},${CY - 104} ${CX + 51},${CY - 60} ${CX + 25},${CY - 60}`, class: 'hsi-tofrom' }, courseRot);
  const frTri = mk('polygon', { points: `${CX + 38},${CY + 104} ${CX + 51},${CY + 60} ${CX + 25},${CY + 60}`, class: 'hsi-tofrom' }, courseRot);

  const pointer = mk('g', { filter: 'url(#hsiShadow)' }, svg);   // grot i ogon wychodzą poza tarczę
  mk('path', {
    d: `M${CX} ${CY - 172} L${CX + 16} ${CY - 140} H${CX + 5} V${CY - 108} H${CX - 5} V${CY - 140} H${CX - 16} Z`,
    class: 'hsi-pointer',
  }, pointer);
  mk('path', { d: `M${CX - 5} ${CY + 108} H${CX + 5} V${CY + 166} L${CX} ${CY + 172} L${CX - 5} ${CY + 166} Z`, class: 'hsi-pointer' }, pointer);

  // ---------- Flaga NAV (pojawia się, gdy sygnał jest nieużyteczny) ----------
  const navFlag = mk('g', {}, svg);
  mk('rect', { x: CX - 180, y: CY - 238, width: 122, height: 54, rx: 12, fill: '#e23a44', filter: 'url(#hsiShadow)' }, navFlag);
  mk('text', { x: CX - 119, y: CY - 211, class: 'hsi-flag' }, navFlag).textContent = 'NAV';

  // ---------- Samolot (nieruchomy) ----------
  mk('path', {
    d: `M${CX} ${CY - 30} V${CY + 70} M${CX - 46} ${CY} H${CX + 46} M${CX - 16} ${CY + 60} H${CX + 16}`,
    class: 'hsi-aircraft', filter: 'url(#hsiShadow)',
  }, svg);

  // ---------- Gałki: CRS (lewa) i HDG (prawa) ----------
  function knob(x, title) {
    const g = mk('g', { class: 'hsi-knob', transform: `translate(${x} ${CY + 220})` }, svg);
    mk('title', {}, g).textContent = title;
    mk('circle', { cx: 6, cy: -6, r: KNOB_R, fill: '#444', filter: 'url(#hsiShadow)' }, g);
    mk('circle', { r: KNOB_R - 6, fill: 'url(#hsiKnob)' }, g);
    mk('circle', { r: 42, fill: '#575757', stroke: '#c4c4c4', 'stroke-width': 7 }, g);
    mk('circle', { r: 38.5, fill: 'none', stroke: '#222', 'stroke-width': 1.5 }, g);
    return g;
  }
  const crsKnob = knob(CX - 292, 'CRS – course: drag, or scroll the mouse wheel');
  mk('path', { d: 'M-3 22 L6 -2 L-4 -6 L12 -22 L16 0 L8 -2 L-1 25 Z', fill: '#f5e400', stroke: '#9c9100', 'stroke-width': 1 }, crsKnob);
  const hdgKnob = knob(CX + 292, 'HDG – heading bug: drag or scroll; click to set it to the current heading');
  mk('path', { d: 'M-14 -20 H2 L8 -8 L18 -2 V8 L6 6 L2 20 H-14 L-8 2 Z', fill: 'none', stroke: ORANGE, 'stroke-width': 4, 'stroke-linejoin': 'round' }, hdgKnob);

  /** Przeciąganie gałki: w prawo / w górę = zgodnie z zegarem; 4 px = 1°. Klik bez ruchu → onClick. */
  function bindKnob(el, onDelta, onClick) {
    let drag = null;
    el.addEventListener('pointerdown', e => {
      e.preventDefault();
      el.setPointerCapture(e.pointerId);
      drag = { x: e.clientX, y: e.clientY, acc: 0, moved: false };
    });
    el.addEventListener('pointermove', e => {
      if (!drag) return;
      drag.acc += (e.clientX - drag.x) - (e.clientY - drag.y);
      drag.x = e.clientX;
      drag.y = e.clientY;
      const steps = Math.trunc(drag.acc / 4);
      if (steps) { drag.acc -= steps * 4; drag.moved = true; onDelta(steps); }
    });
    el.addEventListener('pointerup', () => {
      if (drag && !drag.moved && onClick) onClick();
      drag = null;
    });
    el.addEventListener('pointercancel', () => { drag = null; });
  }
  bindKnob(crsKnob, onCourse);
  bindKnob(hdgKnob, onBug, onBugSync);

  let wheelAcc = 0;
  svg.addEventListener('wheel', e => {
    e.preventDefault();
    wheelAcc += (e.deltaMode === 1 ? 40 : 1) * (e.deltaY || e.deltaX);
    if (Math.abs(wheelAcc) >= 50) {
      const step = -Math.sign(wheelAcc) * (e.shiftKey ? 10 : 1);
      (e.target.closest('.hsi-knob') === hdgKnob ? onBug : onCourse)(step);
      wheelAcc = 0;
    }
  }, { passive: false });

  // ---------- Płynny ruch ----------
  const target = { hdg: 0, course: 0, bug: 0, dev: 0 };
  const shown = { hdg: 0, course: 0, bug: 0, dev: 0 };
  let raf = null, last = null;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  function apply() {
    card.setAttribute('transform', `rotate(${(-shown.hdg).toFixed(2)} ${CX} ${CY})`);
    bug.setAttribute('transform', `rotate(${shown.bug.toFixed(2)} ${CX} ${CY})`);
    const rel = (shown.course - shown.hdg).toFixed(2);
    courseRot.setAttribute('transform', `rotate(${rel} ${CX} ${CY})`);
    pointer.setAttribute('transform', `rotate(${rel} ${CX} ${CY})`);
    devBar.setAttribute('transform', `translate(${shown.dev.toFixed(2)} 0)`);
  }

  function animate(t) {
    const dt = last === null ? 1 / 60 : Math.min(0.1, (t - last) / 1000);
    last = t;
    const k = reduceMotion.matches ? 1 : 1 - Math.exp(-dt / 0.13);
    let moving = false;
    for (const key of ['hdg', 'course', 'bug']) {
      const d = norm180(target[key] - shown[key]);
      if (Math.abs(d) < 0.05) shown[key] = target[key];
      else { shown[key] += d * k; moving = true; }
    }
    const dd = target.dev - shown.dev;
    if (Math.abs(dd) < 0.05) shown.dev = target.dev;
    else { shown.dev += dd * k; moving = true; }
    apply();
    if (moving) raf = requestAnimationFrame(animate);
    else { raf = null; last = null; }
  }
  apply();

  return {
    update({ hdg, course, bug: bugHdg, signal }) {
      target.hdg = hdg;
      target.course = course;
      target.bug = bugHdg;
      target.dev = Math.max(-MAX_DEV, Math.min(MAX_DEV, signal.dev)) / DEG_PER_DOT * DOT;
      navFlag.style.display = signal.valid ? 'none' : '';
      toTri.style.display = signal.toFrom === 'TO' ? '' : 'none';
      frTri.style.display = signal.toFrom === 'FROM' ? '' : 'none';
      if (!raf) raf = requestAnimationFrame(animate);
    },
  };
}

'use strict';

/* ==========================================================
   CDI – wskaźnik odchylenia od kursu (wygląd na wzór MD200)
   ----------------------------------------------------------
   createCDI(container, onObsDelta) rysuje przyrząd i zwraca:
     setObs(deg)  – obraca kartę: wybrany kurs pod żółtym trójkątem
     setSignal(s) – s = { valid, toFrom: 'TO' | 'FROM' | null, dev }
                    dev = odchylenie w stopniach, + = wskazówka w prawo
   onObsDelta(n) jest wołane, gdy użytkownik kręci gałką OBS.
   Wymiary w jednostkach viewBox 0–300, środek tarczy w (150, 150).
   ========================================================== */

function createCDI(container, onObsDelta) {
  const NS = 'http://www.w3.org/2000/svg';
  const C = 150;            // środek tarczy
  const R = 122;            // promień obrotowej karty kompasowej
  const PLATE_R = 82;       // nieruchoma płytka ze wskazówkami
  const CH = 8.5;           // połowa szerokości rowków na wskazówki
  const DOT = 10;           // odstęp kropek skali; pierścień w środku = 1. kropka
  const DEG_PER_DOT = 2;    // VOR: 1 kropka = 2°, pełne wychylenie (5 kropek) = 10°
  const MAX_DEV = 11;       // wskazówka zatrzymuje się tuż za ostatnią kropką
  const KNOB = { x: 43, y: 254, r: 22 };

  const mk = (tag, attrs = {}, parent = null) => {
    const n = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    if (parent) parent.appendChild(n);
    return n;
  };

  const svg = mk('svg', { viewBox: '0 0 300 300', class: 'cdi-svg' });
  container.appendChild(svg);

  mk('defs', {}, svg).innerHTML = `
    <linearGradient id="cdiCase" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#2c2c2c"/><stop offset="1" stop-color="#121212"/>
    </linearGradient>
    <linearGradient id="cdiBezel" x1="0" y1="0" x2="0.4" y2="1">
      <stop offset="0" stop-color="#3b3b3b"/><stop offset=".45" stop-color="#161616"/><stop offset="1" stop-color="#040404"/>
    </linearGradient>
    <radialGradient id="cdiKnobFace" cx=".38" cy=".32" r=".75">
      <stop offset="0" stop-color="#5a5a5a"/><stop offset="1" stop-color="#262626"/>
    </radialGradient>
    <clipPath id="cdiPlateClip"><circle cx="${C}" cy="${C}" r="${PLATE_R - 1}"/></clipPath>`;

  // ---------- Obudowa ----------
  const a = 4, b = 296, c = 30;   // kwadrat ze ściętymi rogami
  mk('polygon', {
    points: `${a + c},${a} ${b - c},${a} ${b},${a + c} ${b},${b - c} ${b - c},${b} ${a + c},${b} ${a},${b - c} ${a},${a + c}`,
    fill: 'url(#cdiCase)', stroke: '#050505', 'stroke-width': 1.5, 'stroke-linejoin': 'round',
  }, svg);
  mk('polygon', {
    points: `${a + c + 2},${a + 4} ${b - c - 2},${a + 4} ${b - 4},${a + c + 2} ${b - 4},${b - c - 2} ${b - c - 2},${b - 4} ${a + c + 2},${b - 4} ${a + 4},${b - c - 2} ${a + 4},${a + c + 2}`,
    fill: 'none', stroke: 'rgba(255,255,255,.07)', 'stroke-linejoin': 'round',
  }, svg);

  function screw(x, y, r) {
    const g = mk('g', { transform: `translate(${x} ${y})` }, svg);
    mk('circle', { r, fill: '#1b1b1b', stroke: '#070707' }, g);
    mk('path', { d: `M${-r * .55} 0H${r * .55}M0 ${-r * .55}V${r * .55}`, stroke: '#050505', 'stroke-width': r * .3 }, g);
    mk('circle', { r: r - .7, fill: 'none', stroke: 'rgba(255,255,255,.09)', 'stroke-width': .7 }, g);
  }
  function hole(x, y, r) {
    mk('circle', { cx: x, cy: y, r, fill: '#050505', stroke: '#2e2e2e', 'stroke-width': .8 }, svg);
  }
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      screw(C + sx * 86, C + sy * 121, 5.5);
      hole(C + sx * 104, C + sy * 102, 5.5);
      hole(C + sx * 117, C + sy * 74, 2.2);
    }
  }

  // ---------- Pierścień tarczy ----------
  mk('circle', { cx: C, cy: C, r: 133, fill: 'url(#cdiBezel)', stroke: '#020202' }, svg);
  mk('circle', { cx: C, cy: C, r: 131, fill: 'none', stroke: 'rgba(255,255,255,.1)', 'stroke-width': .8 }, svg);
  mk('circle', { cx: C, cy: C, r: R + 3, fill: '#060606' }, svg);

  // ---------- Obrotowa karta kompasowa ----------
  const card = mk('g', {}, svg);
  mk('circle', { cx: C, cy: C, r: R, fill: '#121212' }, card);
  for (let ang = 0; ang < 360; ang += 5) {
    if (ang % 30 === 0) continue;                      // tam są cyfry
    const long = ang % 10 === 0;
    mk('line', {
      x1: C, y1: C - (PLATE_R + 2), x2: C, y2: C - (PLATE_R + (long ? 13 : 7)),
      transform: `rotate(${ang} ${C} ${C})`,
      class: 'cdi-tick', 'stroke-width': long ? 2 : 1.6,
    }, card);
  }
  const LABELS = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' };
  for (let ang = 0; ang < 360; ang += 30) {
    mk('text', {
      x: C, y: C - 103,
      transform: `rotate(${ang} ${C} ${C})`,
      class: 'cdi-num',
    }, card).textContent = LABELS[ang] || ang / 10;
  }

  // ---------- Nieruchoma płytka z rowkami ----------
  mk('circle', { cx: C, cy: C, r: PLATE_R, fill: '#070707', stroke: '#000', 'stroke-width': 1.5 }, svg);
  const quads = mk('g', { 'clip-path': 'url(#cdiPlateClip)' }, svg);
  for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    mk('rect', {
      x: sx < 0 ? C - PLATE_R : C + CH, y: sy < 0 ? C - PLATE_R : C + CH,
      width: PLATE_R - CH, height: PLATE_R - CH, rx: 5,
      fill: '#222', stroke: 'rgba(255,255,255,.06)',
    }, quads);
  }

  // żółte indeksy kursu: u góry wybrany kurs, u dołu kurs odwrotny
  mk('polygon', { points: `${C},${C - 81} ${C - 7},${C - 70} ${C + 7},${C - 70}`, class: 'cdi-index' }, svg);
  mk('polygon', { points: `${C},${C + 80} ${C - 5.5},${C + 71} ${C + 5.5},${C + 71}`, class: 'cdi-index' }, svg);

  // skale: pozioma (odchylenie od kursu) i pionowa (ścieżka schodzenia)
  for (let k = 2; k <= 5; k++) {
    for (const s of [-1, 1]) {
      const d = s * k * DOT;
      mk('line', { x1: C + d, y1: C - 5, x2: C + d, y2: C + 5, class: 'cdi-scale' }, svg);
      mk('circle', { cx: C + d, cy: C, r: 1.4, class: 'cdi-dot' }, svg);
      mk('line', { x1: C - 5, y1: C + d, x2: C + 5, y2: C + d, class: 'cdi-scale' }, svg);
      mk('circle', { cx: C, cy: C + d, r: 1.4, class: 'cdi-dot' }, svg);
    }
  }
  for (const s of [-1, 1]) {                         // małe śrubki na końcach rowka
    mk('circle', { cx: C + s * 77, cy: C, r: 2.6, fill: '#1c1c1c', stroke: '#3a3a3a', 'stroke-width': .6 }, svg);
  }

  // ---------- Napisy ----------
  const navText = mk('text', { x: C - 35, y: C - 37, class: 'cdi-ann cdi-nav' }, svg);
  navText.textContent = 'NAV';
  mk('text', { x: C - 35, y: C - 21, class: 'cdi-ann' }, svg).textContent = 'VLOC';
  mk('text', { x: C - 35, y: C + 21, class: 'cdi-ann' }, svg).textContent = 'GPS';

  const toGroup = mk('g', { transform: `translate(${C + 32} ${C - 37})` }, svg);
  mk('polygon', { points: '-14,3.6 -10,-3.6 -6,3.6', class: 'cdi-tri' }, toGroup);
  mk('text', { x: 4, y: 0, class: 'cdi-ann' }, toGroup).textContent = 'TO';
  const frGroup = mk('g', { transform: `translate(${C + 32} ${C - 37})` }, svg);
  mk('polygon', { points: '-14,-3.6 -10,3.6 -6,-3.6', class: 'cdi-tri' }, frGroup);
  mk('text', { x: 4, y: 0, class: 'cdi-ann' }, frGroup).textContent = 'FR';

  // ---------- Wskazówki ----------
  const needles = mk('g', { 'clip-path': 'url(#cdiPlateClip)' }, svg);
  mk('rect', { x: C - 63, y: C - 1.1, width: 126, height: 2.2, class: 'cdi-needle' }, needles);  // ścieżka (nieaktywna dla VOR)
  const cdiNeedle = mk('rect', { x: C - 1.1, y: C - 61, width: 2.2, height: 122, class: 'cdi-needle' }, needles);
  mk('circle', { cx: C, cy: C, r: DOT, fill: 'none', stroke: '#dde2e5', 'stroke-width': 2.2 }, svg);

  // ---------- Gałka OBS ----------
  const knob = mk('g', { class: 'cdi-knob', transform: `translate(${KNOB.x} ${KNOB.y})` }, svg);
  mk('title', {}, knob).textContent = 'OBS – drag, or scroll the mouse wheel over the instrument';
  mk('circle', { cx: 1.5, cy: 2.5, r: KNOB.r + 1.5, fill: 'rgba(0,0,0,.55)' }, knob);
  const knurl = mk('g', {}, knob);
  const teeth = [];
  for (let i = 0; i < 80; i++) {
    const rr = i % 2 ? KNOB.r - 1.3 : KNOB.r;
    const t = i / 80 * 2 * Math.PI;
    teeth.push(`${(rr * Math.cos(t)).toFixed(2)},${(rr * Math.sin(t)).toFixed(2)}`);
  }
  mk('polygon', { points: teeth.join(' '), fill: '#1d1d1d', stroke: '#454545', 'stroke-width': .6 }, knurl);
  mk('circle', { r: KNOB.r - 3, fill: 'url(#cdiKnobFace)', stroke: '#111' }, knob);
  mk('text', { class: 'cdi-knob-text' }, knob).textContent = 'OBS';

  // ---------- Animacja wskazówki (płynny ruch jak w prawdziwym przyrządzie) ----------
  let shown = 0, target = 0, raf = null, last = null;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  function animate(t) {
    const dt = last === null ? 1 / 60 : Math.min(0.1, (t - last) / 1000);
    last = t;
    shown += (target - shown) * (reduceMotion.matches ? 1 : 1 - Math.exp(-dt / 0.12));
    if (Math.abs(target - shown) < 0.02) shown = target;
    cdiNeedle.setAttribute('transform', `translate(${shown.toFixed(2)} 0)`);
    if (shown === target) { raf = null; last = null; } else raf = requestAnimationFrame(animate);
  }

  // ---------- Obsługa gałki ----------
  let drag = null;
  knob.addEventListener('pointerdown', e => {
    e.preventDefault();
    knob.setPointerCapture(e.pointerId);
    drag = { x: e.clientX, y: e.clientY, acc: 0 };
  });
  knob.addEventListener('pointermove', e => {
    if (!drag) return;
    drag.acc += (e.clientX - drag.x) - (e.clientY - drag.y);  // w prawo / w górę = zgodnie z zegarem
    drag.x = e.clientX;
    drag.y = e.clientY;
    const steps = Math.trunc(drag.acc / 4);                  // 4 px = 1°
    if (steps) { drag.acc -= steps * 4; onObsDelta(steps); }
  });
  const endDrag = () => { drag = null; };
  knob.addEventListener('pointerup', endDrag);
  knob.addEventListener('pointercancel', endDrag);

  let wheelAcc = 0;
  svg.addEventListener('wheel', e => {
    e.preventDefault();
    wheelAcc += (e.deltaMode === 1 ? 40 : 1) * (e.deltaY || e.deltaX);
    if (Math.abs(wheelAcc) >= 50) {
      onObsDelta(-Math.sign(wheelAcc) * (e.shiftKey ? 10 : 1));   // kółko do góry = kurs rośnie
      wheelAcc = 0;
    }
  }, { passive: false });

  return {
    setObs(obs) {
      card.setAttribute('transform', `rotate(${-obs} ${C} ${C})`);
      knurl.setAttribute('transform', `rotate(${obs * 4})`);
    },
    setSignal({ valid, toFrom, dev }) {
      navText.classList.toggle('flag', !valid);
      toGroup.style.display = toFrom === 'TO' ? '' : 'none';
      frGroup.style.display = toFrom === 'FROM' ? '' : 'none';
      target = Math.max(-MAX_DEV, Math.min(MAX_DEV, dev)) / DEG_PER_DOT * DOT;
      if (!raf) raf = requestAnimationFrame(animate);
    },
  };
}

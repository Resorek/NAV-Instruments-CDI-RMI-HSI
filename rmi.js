'use strict';

/* ==========================================================
   RMI – radiokompas z dwiema igłami (wygląd na wzór Boeinga)
   ----------------------------------------------------------
   createRMI(container, onKnob) rysuje przyrząd i zwraca:
     update({ hdg, bearings: [b1, b2], dme: [d1, d2] })
        hdg – kurs samolotu (karta obraca się tak, że kurs jest u góry)
        b1/b2 – namiar magnetyczny NA stację dla igły wąskiej / szerokiej;
                null = brak sygnału → igła "parkuje" na godzinie 3
        d1/d2 – odległość DME [NM]; null = kreski na wyświetlaczu
     setSources(['VOR' | 'ADF', 'VOR' | 'ADF']) – położenie gałek
   onKnob(i) jest wołane po kliknięciu gałki (0 = lewa, 1 = prawa).
   Wymiary w jednostkach viewBox 320 × 390, środek karty (160, 233).
   ========================================================== */

function createRMI(container, onKnob) {
  const NS = 'http://www.w3.org/2000/svg';
  const W = 320, H = 390;
  const CX = 160, CY = 233;   // środek karty
  const R = 104;              // promień karty
  const CREAM = '#d8cb9a';
  const KNOB_ANGLE = [{ VOR: -8, ADF: 72 }, { VOR: 8, ADF: -72 }];

  const mk = (tag, attrs = {}, parent = null) => {
    const n = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    if (parent) parent.appendChild(n);
    return n;
  };
  const norm180 = a => ((((a + 180) % 360) + 360) % 360) - 180;

  const svg = mk('svg', { viewBox: `0 0 ${W} ${H}`, class: 'rmi-svg' });
  container.appendChild(svg);

  mk('defs', {}, svg).innerHTML = `
    <linearGradient id="rmiPanel" x1="0" y1="0" x2="0.3" y2="1">
      <stop offset="0" stop-color="#717f8e"/><stop offset="1" stop-color="#4f5e6f"/>
    </linearGradient>
    <linearGradient id="rmiPlate" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#2d282f"/><stop offset="1" stop-color="#1f1c22"/>
    </linearGradient>
    <linearGradient id="rmiKnobRim" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#9fb8cc"/><stop offset=".55" stop-color="#6f8aa2"/><stop offset="1" stop-color="#3f5468"/>
    </linearGradient>`;

  // ---------- Panel i płyta czołowa ----------
  mk('rect', { width: W, height: H, rx: 8, fill: 'url(#rmiPanel)' }, svg);
  mk('polygon', {
    points: '46,7 274,7 313,46 313,348 276,385 44,385 7,348 7,46',
    fill: 'none', stroke: '#0f151f', 'stroke-width': 3, 'stroke-linejoin': 'round',
  }, svg);
  mk('polygon', {
    points: '36,43 284,43 292,51 292,326 258,360 62,360 28,326 28,51',
    fill: 'url(#rmiPlate)', stroke: '#121016', 'stroke-width': 1.5, 'stroke-linejoin': 'round',
  }, svg);

  // ---------- Wyświetlacze DME (7-segmentowe) ----------
  const SEGMENTS = {
    0: 'abcdef', 1: 'bc', 2: 'abdeg', 3: 'abcdg', 4: 'bcfg', 5: 'acdfg',
    6: 'acdefg', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg', '-': 'g',
  };

  /** Jedna cyfra 7-segmentowa w prostokącie w × h; zwraca mapę segmentów. */
  function digit(parent, x, y, w = 15, h = 30, t = 3.2) {
    const g = 0.7, l = t / 2, r = w - t / 2, top = t / 2, mid = h / 2, bot = h - t / 2;
    const hor = (yy, x0, x1) =>
      `${x0 + g},${yy} ${x0 + g + l},${yy - l} ${x1 - g - l},${yy - l} ${x1 - g},${yy} ${x1 - g - l},${yy + l} ${x0 + g + l},${yy + l}`;
    const ver = (xx, y0, y1) =>
      `${xx},${y0 + g} ${xx + l},${y0 + g + l} ${xx + l},${y1 - g - l} ${xx},${y1 - g} ${xx - l},${y1 - g - l} ${xx - l},${y0 + g + l}`;
    const shapes = {
      a: hor(top, l, r), g: hor(mid, l, r), d: hor(bot, l, r),
      f: ver(l, top, mid), b: ver(r, top, mid), e: ver(l, mid, bot), c: ver(r, mid, bot),
    };
    const grp = mk('g', { transform: `translate(${x} ${y})` }, parent);
    const segs = {};
    for (const [name, pts] of Object.entries(shapes)) {
      segs[name] = mk('polygon', { points: pts, class: 'seg' }, grp);
    }
    return segs;
  }

  /** Okno DME: 4 cyfry z kropką przed ostatnią ("012.3"). Zwraca funkcję ustawiającą wartość. */
  function dmeWindow(x) {
    const win = mk('g', {}, svg);
    mk('rect', { x, y: 60, width: 96, height: 46, rx: 2, fill: '#0d0f0e', stroke: '#4a4434' }, win);
    const digits = [0, 1, 2, 3].map(i => digit(win, x + 5 + i * 24, 69));
    const dp = mk('rect', { x: x + 71.5, y: 95.5, width: 3.2, height: 3.2, class: 'seg' }, win);
    return value => {
      const text = value == null ? '----' : Math.min(value, 999.9).toFixed(1).padStart(5, '0').replace('.', '');
      digits.forEach((segs, i) => {
        const on = SEGMENTS[text[i]];
        for (const [name, seg] of Object.entries(segs)) seg.classList.toggle('on', on.includes(name));
      });
      dp.classList.toggle('on', value != null);
    };
  }
  const setDme = [dmeWindow(52), dmeWindow(172)];
  mk('circle', { cx: CX, cy: 71, r: 1.6, fill: '#3a3a3a' }, svg);
  mk('circle', { cx: CX, cy: 97, r: 1.6, fill: '#3a3a3a' }, svg);

  const label = (x, y, text, anchor = 'middle') => {
    mk('text', { x, y, class: 'rmi-label', 'text-anchor': anchor }, svg).textContent = text;
  };
  label(48, 120, 'DME-L', 'start');
  label(272, 120, 'DME-R', 'end');

  // ---------- Obrotowa karta kompasowa ----------
  mk('circle', { cx: CX, cy: CY, r: R + 6, fill: '#141216' }, svg);
  const card = mk('g', {}, svg);
  mk('circle', { cx: CX, cy: CY, r: R, fill: '#232223' }, card);
  for (let a = 0; a < 360; a += 5) {
    const long = a % 10 === 0;
    mk('line', {
      x1: CX, y1: CY - R + 1, x2: CX, y2: CY - R + (long ? 15 : 8),
      transform: `rotate(${a} ${CX} ${CY})`,
      class: 'rmi-tick', 'stroke-width': long ? 3 : 2.4,
    }, card);
  }
  for (let a = 0; a < 360; a += 30) {
    mk('text', { x: CX, y: CY - 73, transform: `rotate(${a} ${CX} ${CY})`, class: 'rmi-num' }, card)
      .textContent = a / 10;
  }
  for (let a = 45; a < 360; a += 90) {
    const t = a * Math.PI / 180;
    mk('circle', { cx: CX + 47 * Math.sin(t), cy: CY - 47 * Math.cos(t), r: 4, fill: '#161515' }, card);
  }

  // ---------- Znaczniki stałe ----------
  mk('polygon', { points: `${CX - 7.5},113 ${CX + 7.5},113 ${CX},141`, fill: '#f4f4f2' }, svg);  // indeks kursu
  mk('polygon', { points: `${CX - 6},345 ${CX + 6},345 ${CX},325`, fill: '#f4f4f2' }, svg);
  for (const a of [45, 90, 135, 225, 270, 315]) {
    mk('polygon', {
      points: `${CX - 4.5},${CY - 117} ${CX + 4.5},${CY - 117} ${CX},${CY - 109}`,
      transform: `rotate(${a} ${CX} ${CY})`, fill: CREAM,
    }, svg);
  }
  for (const x of [45, 275]) {
    ['V', 'O', 'R'].forEach((ch, i) => label(x, 261 + i * 14, ch));
  }
  label(116, 348, 'ADF');
  label(204, 348, 'ADF');
  mk('path', { d: 'M133 344 l6 -3.5 v7 z', fill: CREAM }, svg);                  // ← (igła wąska)
  mk('line', { x1: 139, y1: 344, x2: 155, y2: 344, stroke: CREAM, 'stroke-width': 1.8, 'stroke-dasharray': '3.5 2' }, svg);
  mk('path', { d: 'M165 341.8 H180 M165 346.2 H180 M178 338.5 L186 344 L178 349.5', class: 'rmi-dbl-arrow' }, svg);  // ⇒ (igła szeroka)

  // ---------- Igły ----------
  const needles = mk('g', { transform: `translate(${CX} ${CY})` }, svg);

  const wide = mk('g', {}, needles);          // igła szeroka (podwójna) – prawa gałka
  mk('path', { d: 'M0 -86 L10 -48 L-10 -48 Z', class: 'rmi-needle' }, wide);
  for (const x of [-7, 4.5]) {
    mk('rect', { x, y: -49, width: 2.5, height: 36, class: 'rmi-needle' }, wide);
    mk('rect', { x, y: 13, width: 2.5, height: 46, class: 'rmi-needle' }, wide);
  }
  mk('path', { d: 'M-7 58 L-4.5 58 L0 67 L4.5 58 L7 58 L1.3 72 L1.3 90 L-1.3 90 L-1.3 72 Z', class: 'rmi-needle' }, wide);

  const narrow = mk('g', {}, needles);        // igła wąska (pojedyncza) – lewa gałka
  mk('line', { x1: 0, y1: -62, x2: 0, y2: 86, class: 'rmi-narrow-shaft' }, narrow);
  mk('path', { d: 'M0 -88 L5.5 -60 L0 -64 L-5.5 -60 Z', class: 'rmi-needle narrow' }, narrow);

  mk('circle', { r: 12, fill: '#1f1e1c', stroke: '#0a0a0a', 'stroke-width': 1.5 }, needles);
  mk('circle', { r: 3, fill: '#33302b' }, needles);

  // ---------- Gałki wyboru VOR / ADF ----------
  const knobs = [58, 262].map((x, i) => {
    const pos = mk('g', { transform: `translate(${x} 362)`, class: 'rmi-knob' }, svg);
    const rot = mk('g', { class: 'rmi-knob-rot' }, pos);
    const drop = s => `M0 ${-50 * s} C${10 * s} ${-38 * s} ${21 * s} ${-20 * s} ${21 * s} 0 A${21 * s} ${21 * s} 0 0 1 ${-21 * s} 0 C${-21 * s} ${-20 * s} ${-10 * s} ${-38 * s} 0 ${-50 * s} Z`;
    mk('path', { d: drop(1), fill: 'url(#rmiKnobRim)', stroke: '#26323d' }, rot);
    mk('path', { d: drop(0.8), transform: 'translate(0 3)', fill: '#1e1d1a' }, rot);
    if (i === 0) {
      mk('path', { d: 'M0 -27 L5 -16 L-5 -16 Z', fill: '#f2f2f2' }, rot);
      mk('line', { x1: 0, y1: -16, x2: 0, y2: 15, stroke: '#f2f2f2', 'stroke-width': 2.2, 'stroke-dasharray': '4 2.5' }, rot);
    } else {
      mk('path', { d: 'M0 -28 L7 -15 L3 -15 L3 15 L-3 15 L-3 -15 L-7 -15 Z', fill: 'none', stroke: '#f2f2f2', 'stroke-width': 1.6, 'stroke-linejoin': 'round' }, rot);
    }
    pos.addEventListener('click', () => onKnob(i));
    return rot;
  });

  // ---------- Płynny ruch karty i igieł ----------
  const target = { card: 0, n: [90, 90] };
  const shown = { card: 0, n: [90, 90] };
  let raf = null, last = null;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  function apply() {
    card.setAttribute('transform', `rotate(${shown.card.toFixed(2)} ${CX} ${CY})`);
    narrow.setAttribute('transform', `rotate(${shown.n[0].toFixed(2)})`);
    wide.setAttribute('transform', `rotate(${shown.n[1].toFixed(2)})`);
  }

  function animate(t) {
    const dt = last === null ? 1 / 60 : Math.min(0.1, (t - last) / 1000);
    last = t;
    const k = reduceMotion.matches ? 1 : 1 - Math.exp(-dt / 0.15);
    let moving = false;
    const step = (cur, tgt) => {
      const d = norm180(tgt - cur);
      if (Math.abs(d) < 0.05) return tgt;
      moving = true;
      return cur + d * k;
    };
    shown.card = step(shown.card, target.card);
    shown.n = shown.n.map((v, i) => step(v, target.n[i]));
    apply();
    if (moving) raf = requestAnimationFrame(animate);
    else { raf = null; last = null; }
  }
  apply();

  return {
    update({ hdg, bearings, dme }) {
      target.card = -hdg;
      target.n = bearings.map(b => (b == null ? 90 : b - hdg));
      dme.forEach((d, i) => setDme[i](d));
      if (!raf) raf = requestAnimationFrame(animate);
    },
    setSources(sources) {
      sources.forEach((s, i) => { knobs[i].style.transform = `rotate(${KNOB_ANGLE[i][s]}deg)`; });
    },
  };
}

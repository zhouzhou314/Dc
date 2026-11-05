/* =========================================================
   charts.js —— SVG 图表渲染与缓动动画
   包含：IS-LM / AD-AS / 菲利普斯 / GDP堆积图 / 雷达图 / KPI迷你趋势
   动画方式：对曲线端点/采样点做线性插值（requestAnimationFrame）
   ========================================================= */

const SVGNS = 'http://www.w3.org/2000/svg';
const CHART_FAST_MS = 120;   // 加速模式动画时长
const CHART_NORM_MS = 650;   // 正常模式动画时长

/* —— 小工具：创建 SVG 元素 —— */
function svgEl(tag, attrs, parent) {
  const el = document.createElementNS(SVGNS, tag);
  for (const k in attrs) el.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(el);
  return el;
}

/* —— 数值数组插值动画 —— */
function tweenArr(from, to, onUpdate, done) {
  const dur = (window.game && game.fastMode) ? CHART_FAST_MS : CHART_NORM_MS;
  if (!from || from.length !== to.length) { onUpdate(to); if (done) done(); return; }
  const t0 = performance.now();
  (function frame(t) {
    const p = Math.min(1, (t - t0) / dur);
    const e = 1 - Math.pow(1 - p, 3);            // easeOutCubic 缓动
    onUpdate(from.map((v, i) => v + (to[i] - v) * e));
    if (p < 1) requestAnimationFrame(frame);
    else if (done) done();
  })(t0);
}

/* —— 坐标映射器：数据域 → 视图像素 —— */
function makeMap(w, h, m, xDom, yDom) {
  return {
    X: x => m.l + (x - xDom[0]) / (xDom[1] - xDom[0]) * (w - m.l - m.r),
    Y: y => h - m.b - (y - yDom[0]) / (yDom[1] - yDom[0]) * (h - m.t - m.b),
  };
}

/* —— 通用：画坐标轴（带少量刻度） —— */
function drawAxes(svg, w, h, m, xDom, yDom, xLabel, yLabel, xTicks, yTicks, fmtX, fmtY) {
  const g = svgEl('g', {}, svg);
  svgEl('line', { x1: m.l, y1: h - m.b, x2: w - m.r, y2: h - m.b, stroke: '#3a4d78', 'stroke-width': 1.2 }, g);
  svgEl('line', { x1: m.l, y1: m.t, x2: m.l, y2: h - m.b, stroke: '#3a4d78', 'stroke-width': 1.2 }, g);
  xTicks.forEach(v => {
    svgEl('line', { x1: M2X(svg, w, m, xDom, v), y1: h - m.b, x2: M2X(svg, w, m, xDom, v), y2: h - m.b + 3, stroke: '#3a4d78' }, g);
    svgEl('text', { x: M2X(svg, w, m, xDom, v), y: h - m.b + 13, 'text-anchor': 'middle' }, g).textContent = fmtX ? fmtX(v) : v;
  });
  yTicks.forEach(v => {
    svgEl('text', { x: m.l - 5, y: M2Y(svg, w, h, m, yDom, v) + 3, 'text-anchor': 'end' }, g).textContent = fmtY ? fmtY(v) : v;
  });
  if (xLabel) svgEl('text', { x: w - m.r, y: h - m.b + 13, 'text-anchor': 'end', fill: '#4da3ff', 'font-style': 'italic' }, g).textContent = xLabel;
  if (yLabel) svgEl('text', { x: m.l - 5, y: m.t - 2, 'text-anchor': 'end', fill: '#4da3ff', 'font-style': 'italic' }, g).textContent = yLabel;
  return g;
}
/* 依赖映射的两个小函数（独立计算，避免闭包依赖） */
function M2X(svg, w, m, xDom, v) { return m.l + (v - xDom[0]) / (xDom[1] - xDom[0]) * (w - m.l - m.r); }
function M2Y(svg, w, h, m, yDom, v) { return h - m.b - (v - yDom[0]) / (yDom[1] - yDom[0]) * (h - m.t - m.b); }

const W = 320, H = 210, MG = { l: 34, r: 10, t: 14, b: 20 };

/* =========================================================
   ① IS-LM 图：x∈Y, y∈r
   IS: r = [a − βT + I0 + G + NX − (1−β)Y] / d
   LM: r = (k·Y − M/P) / h
   ========================================================= */
const ISLMChart = {
  init(svg) {
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    drawAxes(svg, W, H, MG, [85, 120], [-2, 10], 'Y', 'r%', [85, 95, 105, 115], [0, 5, 10]);
    this.isPath = svgEl('path', { stroke: '#4da3ff', fill: 'none', 'stroke-width': 2.2 }, svg);
    this.lmPath = svgEl('path', { stroke: '#ffb454', fill: 'none', 'stroke-width': 2.2 }, svg);
    this.isLbl = svgEl('text', { fill: '#4da3ff', 'font-style': 'italic' }, svg);
    this.lmLbl = svgEl('text', { fill: '#ffb454', 'font-style': 'italic' }, svg);
    this.dot = svgEl('circle', { r: 4.5, fill: '#3fd6c2', stroke: '#fff', 'stroke-width': 1 }, svg);
    this.cur = { is: [0, 0, 0, 0], lm: [0, 0, 0, 0], dot: [0, 0] };
  },
  /* ex: 外生参数包；P: 当前价格；eq: 均衡 */
  update(ex, P, eq) {
    const m = MODEL;
    const isr = Y => (ex.a - m.b * ex.T + ex.I0 + ex.G + ex.NX0 - (1 - m.b) * Y) / m.d;
    const lmr = Y => (m.k * Y - realBalance(ex.M, P)) / m.h;
    const to = {
      is: [95, isr(95), 118, isr(118)],
      lm: [90, lmr(90), 115, lmr(115)],
      dot: [eq.Y, eq.r],
    };
    tweenArr(this.cur.is, to.is, v => this._set(this.isPath, v, this.isLbl, 'IS', 0));
    tweenArr(this.cur.lm, to.lm, v => this._set(this.lmPath, v, this.lmLbl, 'LM', 1));
    tweenArr(this.cur.dot, to.dot, v => {
      this.cur.dot = v;
      this.dot.setAttribute('cx', MG.l + (v[0] - 85) / 35 * (W - MG.l - MG.r));
      this.dot.setAttribute('cy', H - MG.b - (v[1] + 2) / 12 * (H - MG.t - MG.b));
    });
  },
  _set(path, v, lbl, name, i) {
    this.cur[name.toLowerCase()] = v;
    const px = x => MG.l + (x - 85) / 35 * (W - MG.l - MG.r);
    const py = r => H - MG.b - (r + 2) / 12 * (H - MG.t - MG.b);
    path.setAttribute('d', `M${px(v[0])},${py(v[1])} L${px(v[2])},${py(v[3])}`);
    const li = i * 2;
    lbl.setAttribute('x', px(v[li]) + 4);
    lbl.setAttribute('y', py(v[li + 1]) - 4);
    lbl.textContent = name;
  },
};

/* =========================================================
   ② AD-AS 图：x∈Y, y∈P
   ========================================================= */
const ADASChart = {
  init(svg) {
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    drawAxes(svg, W, H, MG, [85, 120], [80, 140], 'Y', 'P', [85, 95, 105, 115], [90, 110, 130]);
    this.adPath = svgEl('path', { stroke: '#4da3ff', fill: 'none', 'stroke-width': 2.2 }, svg);
    this.srasPath = svgEl('path', { stroke: '#ffb454', fill: 'none', 'stroke-width': 2.2 }, svg);
    this.lrasPath = svgEl('path', { stroke: '#b58cff', fill: 'none', 'stroke-width': 1.6, 'stroke-dasharray': '4 3' }, svg);
    this.adLbl = svgEl('text', { fill: '#4da3ff', 'font-style': 'italic' }, svg);
    this.asLbl = svgEl('text', { fill: '#ffb454', 'font-style': 'italic' }, svg);
    this.dot = svgEl('circle', { r: 4.5, fill: '#3fd6c2', stroke: '#fff', 'stroke-width': 1 }, svg);
    this.cur = { ad: null, sras: null };
    /* LRAS：潜在产出处的竖线（Ystar 变化时重画） */
    this.yStar = 100;
  },
  update(ex, eq) {
    const N = 12;
    const adPts = [], asPts = [];
    for (let i = 0; i <= N; i++) {
      const P = 85 + i * (135 - 85) / N;
      adPts.push([adY(P, ex), P]);
      asPts.push([(P - ex.Pe) / ex.s + ex.Ystar, P]);
    }
    this._anim('ad', adPts, this.adPath, this.adLbl, 'AD');
    this._anim('sras', asPts, this.srasPath, this.asLbl, 'SRAS');
    if (ex.Ystar !== this.yStar) { this.yStar = ex.Ystar; this._lras(ex.Ystar); }
    const px = x => MG.l + (x - 85) / 35 * (W - MG.l - MG.r);
    const py = y => H - MG.b - (y - 80) / 60 * (H - MG.t - MG.b);
    this.dot.setAttribute('cx', px(eq.Y));
    this.dot.setAttribute('cy', py(eq.P));
  },
  _lras(ys) {
    const px = MG.l + (ys - 85) / 35 * (W - MG.l - MG.r);
    this.lrasPath.setAttribute('d', `M${px},${MG.t} L${px},${H - MG.b}`);
    this.lrasPath.setAttribute('id', 'lras');
    if (!this.lrasLbl) {
      this.lrasLbl = svgEl('text', { fill: '#b58cff', 'font-style': 'italic' }, this.lrasPath.parentNode);
    }
    this.lrasLbl.setAttribute('x', px + 3); this.lrasLbl.setAttribute('y', MG.t + 8);
    this.lrasLbl.textContent = 'LRAS';
  },
  _anim(key, pts, path, lbl, name) {
    const flatFrom = this.cur[key] ? this.cur[key].flat() : null;
    const flatTo = pts.flat();
    const px = x => MG.l + (x - 85) / 35 * (W - MG.l - MG.r);
    const py = y => H - MG.b - (y - 80) / 60 * (H - MG.t - MG.b);
    tweenArr(flatFrom, flatTo, flat => {
      const a = [];
      for (let i = 0; i < flat.length; i += 2) a.push([flat[i], flat[i + 1]]);
      this.cur[key] = a;
      path.setAttribute('d', a.map((p, i) => (i ? 'L' : 'M') + px(p[0]) + ',' + py(p[1])).join(' '));
      const lp = a[Math.floor(a.length * 0.7)];
      lbl.setAttribute('x', px(lp[0]) + 3);
      lbl.setAttribute('y', py(lp[1]) - 4);
      lbl.textContent = name;
    });
  },
};

/* =========================================================
   ③ 菲利普斯曲线：x∈u%, y∈π%
   短期线：π(u) = πe + κ·(uN−u)/λ + ν
   竖直虚线：长期菲利普斯曲线（自然率处）
   ========================================================= */
const PhillipsChart = {
  init(svg) {
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    drawAxes(svg, W, H, MG, [1, 9], [-4, 12], 'u%', 'π%', [2, 4, 6, 8], [0, 4, 8, 12]);
    this.pcPath = svgEl('path', { stroke: '#ffb454', fill: 'none', 'stroke-width': 2.2 }, svg);
    this.lbl = svgEl('text', { fill: '#ffb454', 'font-style': 'italic' }, svg);
    this.dot = svgEl('circle', { r: 4.5, fill: '#ff6b7a', stroke: '#fff', 'stroke-width': 1 }, svg);
    this.trail = svgEl('path', { stroke: '#ff6b7a55', fill: 'none', 'stroke-width': 1.2, 'stroke-dasharray': '3 3' }, svg);
    this.trailPts = [];
    this.cur = null;
  },
  update(st) {
    const m = MODEL;
    const piOf = u => st.piE + m.kappa * (st.uN - u) / m.lam + (st.nu || 0);
    const p1 = [1.5, piOf(1.5)], p2 = [8.5, piOf(8.5)];
    tweenArr(this.cur, [p1[0], p1[1], p2[0], p2[1]], v => {
      this.cur = v;
      const px = x => MG.l + (x - 1) / 8 * (W - MG.l - MG.r);
      const py = y => H - MG.b - (y + 4) / 16 * (H - MG.t - MG.b);
      this.pcPath.setAttribute('d', `M${px(v[0])},${py(v[1])} L${px(v[2])},${py(v[3])}`);
      this.lbl.setAttribute('x', px(v[2]) - 24);
      this.lbl.setAttribute('y', py(v[3]) - 4);
      this.lbl.textContent = 'PC';
    });
    /* 历史轨迹残影（最近 6 季的实际组合） */
    this.trailPts.push([st.u, st.pi]);
    if (this.trailPts.length > 6) this.trailPts.shift();
    const px = x => MG.l + (x - 1) / 8 * (W - MG.l - MG.r);
    const py = y => H - MG.b - (y + 4) / 16 * (H - MG.t - MG.b);
    this.trail.setAttribute('d', this.trailPts.map((p, i) => (i ? 'L' : 'M') + px(p[0]) + ',' + py(p[1])).join(' '));
    this.dot.setAttribute('cx', px(st.u));
    this.dot.setAttribute('cy', py(st.pi));
  },
};

/* =========================================================
   ④ GDP 构成堆积图（最近 8 季柱状堆积）
   ========================================================= */
const GDPChart = {
  colors: { C: '#4da3ff', I: '#3fd6c2', G: '#ffb454', NX: '#b58cff' },
  init(svg) {
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    this.g = svgEl('g', {}, svg);
    /* 图例 */
    let lx = 40;
    [['C 消费', this.colors.C], ['I 投资', this.colors.I], ['G 政府', this.colors.G], ['NX 净出口', this.colors.NX]].forEach(it => {
      svgEl('rect', { x: lx, y: 2, width: 9, height: 9, rx: 2, fill: it[1] }, svg);
      const t = svgEl('text', { x: lx + 12, y: 10, 'font-size': 9 }, svg); t.textContent = it[0];
      lx += 68;
    });
  },
  update(history) {
    const g = this.g; g.innerHTML = '';
    const data = history.slice(-8);
    if (!data.length) return;
    const maxTotal = Math.max(...data.map(d => d.Y)) * 1.15;
    const bw = (W - MG.l - MG.r) / data.length - 10;
    /* 纵轴刻度 */
    for (let v = 0; v <= 3; v++) {
      const val = maxTotal * v / 3;
      const y = H - MG.b - val / maxTotal * (H - MG.t - MG.b);
      svgEl('line', { x1: MG.l, y1: y, x2: W - MG.r, y2: y, stroke: '#22345c', 'stroke-dasharray': '2 4' }, g);
      svgEl('text', { x: MG.l - 4, y: y + 3, 'text-anchor': 'end', 'font-size': 9 }, g).textContent = (val * 1.25).toFixed(0);
    }
    data.forEach((d, i) => {
      let y0 = 0;
      [['C', d.dec.C], ['I', d.dec.I], ['G', d.dec.G], ['NX', d.dec.NX]].forEach(seg => {
        const hPx = seg[1] / maxTotal * (H - MG.t - MG.b);
        const x = MG.l + i * ((W - MG.l - MG.r) / data.length) + 5;
        const rect = svgEl('rect', {
          x: x, y: H - MG.b - (y0 + seg[1]) / maxTotal * (H - MG.t - MG.b),
          width: bw, height: Math.max(0, hPx - 0.5), fill: this.colors[seg[0]], rx: 1,
        }, g);
        rect.style.opacity = 0;
        requestAnimationFrame(() => { rect.style.transition = 'opacity .5s'; rect.style.opacity = 1; });
        y0 += seg[1];
      });
      const lx = MG.l + i * ((W - MG.l - MG.r) / data.length) + 5 + bw / 2;
      svgEl('text', { x: lx, y: H - MG.b + 12, 'text-anchor': 'middle', 'font-size': 8.5 }, g)
        .textContent = d.label.replace(' ', '');
    });
  },
};

/* =========================================================
   ⑤ 四维雷达图
   ========================================================= */
const RadarChart = {
  init(svg) {
    svg.setAttribute('viewBox', '0 0 200 170');
    this.g = svgEl('g', { transform: 'translate(100,92)' }, svg);
    this.axes = [
      { k: 'growth', n: '经济增长' }, { k: 'price', n: '物价稳定' },
      { k: 'job', n: '充分就业' }, { k: 'ext', n: '国际收支' },
    ];
    const R = 58;
    /* 网格环 */
    [0.25, 0.5, 0.75, 1].forEach(f => {
      const pts = this.axes.map((_, i) => {
        const a = -Math.PI / 2 + i * Math.PI / 2;
        return `${Math.cos(a) * R * f},${Math.sin(a) * R * f}`;
      }).join(' ');
      svgEl('polygon', { points: pts, fill: 'none', stroke: '#24365e', 'stroke-width': 1 }, this.g);
    });
    /* 轴线与标签 */
    this.axes.forEach((ax, i) => {
      const a = -Math.PI / 2 + i * Math.PI / 2;
      svgEl('line', { x1: 0, y1: 0, x2: Math.cos(a) * R, y2: Math.sin(a) * R, stroke: '#24365e' }, this.g);
      svgEl('text', {
        x: Math.cos(a) * (R + 14), y: Math.sin(a) * (R + 12) + 3,
        'text-anchor': 'middle', 'font-size': 10,
      }, this.g).textContent = ax.n;
    });
    this.poly = svgEl('polygon', { fill: 'rgba(63,214,194,.25)', stroke: '#3fd6c2', 'stroke-width': 2 }, this.g);
    this.circles = this.axes.map(() => svgEl('circle', { r: 3, fill: '#3fd6c2' }, this.g));
  },
  update(radar) {
    const R = 58;
    const pts = this.axes.map((ax, i) => {
      const a = -Math.PI / 2 + i * Math.PI / 2;
      return [Math.cos(a) * R * radar[ax.k] / 100, Math.sin(a) * R * radar[ax.k] / 100];
    });
    const flatFrom = this._last ? this._last.flat() : pts.flat();
    const flatTo = pts.flat();
    tweenArr(flatFrom, flatTo, flat => {
      const a = [];
      for (let i = 0; i < flat.length; i += 2) a.push([flat[i], flat[i + 1]]);
      this._last = a;
      this.poly.setAttribute('points', a.map(p => p[0] + ',' + p[1]).join(' '));
      a.forEach((p, i) => { this.circles[i].setAttribute('cx', p[0]); this.circles[i].setAttribute('cy', p[1]); });
    });
  },
};

/* —— KPI 迷你趋势线（values: 最近若干期数值数组） —— */
function drawSpark(svg, values, color) {
  svg.innerHTML = '';
  svg.setAttribute('viewBox', '0 0 100 22');
  if (values.length < 2) return;
  const lo = Math.min(...values), hi = Math.max(...values);
  const span = (hi - lo) || 1;
  const pts = values.map((v, i) => `${5 + i / (values.length - 1) * 90},${18 - (v - lo) / span * 14}`).join(' ');
  svgEl('polyline', { points: pts, fill: 'none', stroke: color, 'stroke-width': 1.6 }, svg);
}

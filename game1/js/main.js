/* =========================================================
   main.js —— UI 绑定 / 手绘城市地图 / 因素链条 / 初始化
   ========================================================= */

const UI = {

  /* ================= 初始化 ================= */
  initAll() {
    this.buildDrawers();
    this.buildKPI();
    this.buildTimeline();
    this.buildMap();
    this.buildChain('fiscal');

    ISLMChart.init(document.getElementById('chart-islm'));
    ADASChart.init(document.getElementById('chart-adas'));
    PhillipsChart.init(document.getElementById('chart-phillips'));
    GDPChart.init(document.getElementById('chart-gdp'));
    RadarChart.init(document.getElementById('radar-svg'));

    this.bindEvents();
  },

  bindEvents() {
    /* 双模式入口 */
    document.getElementById('btn-learn').onclick = () => this.startGame('learn');
    document.getElementById('btn-sandbox').onclick = () => this.startGame('sandbox');
    /* 结束本季度 */
    document.getElementById('btn-end-quarter').onclick = () => game.endQuarter();
    /* 动画速度切换 */
    document.getElementById('btn-anim-speed').onclick = function () {
      game.fastMode = !game.fastMode;
      this.textContent = game.fastMode ? '⚡ 加速' : '🐢 慢速';
    };
    /* 错题本 */
    document.getElementById('btn-wrongbook').onclick = () => this.showWrongBook();
    document.getElementById('wrongbook-close').onclick = () =>
      document.getElementById('wrongbook-modal').classList.add('hidden');
    /* 弹窗关闭 */
    document.getElementById('quiz-close').onclick = () => Quiz.close();
    document.getElementById('know-close').onclick = () =>
      document.getElementById('knowledge-modal').classList.add('hidden');
    document.getElementById('event-close').onclick = () => game.onEventClosed();
    document.getElementById('final-restart').onclick = () => location.reload();
    /* 传导演示控制 */
    document.getElementById('trans-skip').onclick = () => Transmission.finish();
    document.getElementById('trans-done').onclick = () => Transmission.confirm();
    /* 因素链条切换 */
    document.getElementById('chain-category').onchange = function () {
      UI.buildChain(this.value);
    };
  },

  /* 以指定模式开始游戏 */
  startGame(mode) {
    game.mode = mode;
    document.getElementById('start-screen').classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');
    game.reset();
  },

  /* ================= 左侧抽屉与政策卡 ================= */
  buildDrawers() {
    const box = document.getElementById('drawer-container');
    box.innerHTML = '';
    CATS.forEach(cat => {
      const cards = CARDS.filter(c => c.cat === cat.key);
      const drawer = document.createElement('div');
      drawer.className = 'drawer';
      drawer.innerHTML = `<div class="drawer-head"><span>${cat.icon} ${cat.name}</span><span class="cnt">${cards.length} 张</span></div><div class="drawer-body"></div>`;
      const body = drawer.querySelector('.drawer-body');
      cards.forEach(card => {
        const el = document.createElement('div');
        el.className = 'policy-card';
        el.innerHTML = `<span class="pc-icon">${card.icon}</span>${card.name}<span class="pc-badge">${card.effect.split('，')[0].split('（')[0]}</span><span class="pc-sub">⏱ ${card.lag} · ⚠ ${card.side}</span>`;
        el.title = `${card.desc}\n效果：${card.effect}\n时滞：${card.lag}\n副作用：${card.side}\n公式：${card.formula}（${card.chapter}）`;
        el.onclick = () => {
          if (!game.canPick(card)) return;
          /* 学习模式先做题；沙盘模式免做题直接全额生效 */
          if (game.mode === 'sandbox') game.registerPolicy(card, true);
          else Quiz.start(card, correct => game.registerPolicy(card, correct));
        };
        body.appendChild(el);
      });
      drawer.querySelector('.drawer-head').onclick = () => drawer.classList.toggle('open');
      box.appendChild(drawer);
    });
  },

  /* ================= 顶部 KPI ================= */
  buildKPI() {
    const box = document.getElementById('kpi-cards');
    box.innerHTML = '';
    KPI_DEFS.forEach(def => {
      const el = document.createElement('div');
      el.className = 'kpi-card';
      el.id = 'kpi-' + def.key;
      el.innerHTML = `<div class="k-name">${def.name}</div><div><span class="k-val">--</span><span class="k-delta"></span></div><svg height="20"></svg>`;
      box.appendChild(el);
    });
  },

  refreshKPI() {
    const st = game.state, prev = game.history.length >= 2 ? game.history[game.history.length - 2] : null;
    const vals = {
      gdp: st.Y, pi: st.pi, u: st.u,
      debt: st.debt / st.Y * 100, nx: st.NX0, trust: st.trust,
    };
    const sparks = {
      gdp: game.history.map(h => h.Y * 1.25),
      pi: game.history.map(h => h.pi),
      u: game.history.map(h => h.u),
      debt: game.history.map(h => h.debt / h.Y * 100),
      nx: game.history.map(h => h.NX0 * 1.25),
      trust: game.history.map(h => h.trust),
    };
    KPI_DEFS.forEach(def => {
      const el = document.getElementById('kpi-' + def.key);
      const v = vals[def.key];
      el.querySelector('.k-val').textContent = def.fmt(v);
      /* 环比箭头 */
      const delta = el.querySelector('.k-delta');
      if (prev) {
        const pv = { gdp: prev.Y, pi: prev.pi, u: prev.u, debt: prev.debt / prev.Y * 100, nx: prev.NX0, trust: prev.trust }[def.key];
        const diff = v - pv;
        if (Math.abs(diff) < 1e-9) { delta.className = 'k-delta flat'; delta.textContent = '–'; }
        else {
          const up = def.key === 'u' ? diff < 0 : diff > 0;   // 失业率下降显示为绿色
          delta.className = 'k-delta ' + (up ? 'up' : 'down');
          delta.textContent = (diff > 0 ? '▲' : '▼') + Math.abs(def.fmt(v) - def.fmt(pv)).toFixed(1);
        }
      }
      drawSpark(el.querySelector('svg'), sparks[def.key], '#3fd6c2');
    });
  },

  /* ================= 时间轴 ================= */
  buildTimeline() {
    const tl = document.getElementById('timeline');
    tl.innerHTML = '';
    for (let i = 0; i < TOTAL_QUARTERS; i++) {
      const slot = document.createElement('div');
      slot.className = 'tl-slot';
      slot.textContent = game.quarterLabel(i);
      slot.onclick = () => this.showQuarterSnap(i);
      tl.appendChild(slot);
    }
  },
  refreshTimeline() {
    document.querySelectorAll('.tl-slot').forEach((s, i) => {
      s.classList.toggle('done', i < game.history.length);
      s.classList.toggle('cur', i === game.quarter);
    });
    document.getElementById('quarter-label').textContent = game.quarterLabel(game.quarter);
  },
  /* 点击历史季度 → 知识卡展示该季快照 */
  showQuarterSnap(i) {
    const h = game.history[i];
    if (!h) { toast('⏳ 该季度尚未发生'); return; }
    showKnowledgeCard(`${h.label} · 经济快照`, '',
      `GDP ${ (h.Y * 1.25).toFixed(1) } 万亿 ｜ 通胀 ${h.pi.toFixed(1)}% ｜ 失业率 ${h.u.toFixed(1)}%<br>` +
      `利率 ${h.r.toFixed(2)}% ｜ 产出缺口 ${h.gap.toFixed(1)}% ｜ 通胀预期 πe ${h.piE.toFixed(1)}%<br>` +
      `债务率 ${(h.debt / h.Y * 100).toFixed(0)}% ｜ 信任度 ${h.trust.toFixed(0)} ｜ 净出口 ${(h.NX0 * 1.25).toFixed(1)} 万亿`,
      '点击链条节点查看公式推导');
  },

  /* ================= 右侧资讯反馈 ================= */
  refreshFeed() {
    /* 新闻 */
    const nl = document.getElementById('news-list');
    nl.innerHTML = '';
    game.news.slice(0, 7).forEach(n => {
      const li = document.createElement('li');
      li.innerHTML = `<span class="tag ${n.tag}">${n.icon} ${n.title}</span> ${n.desc}<span class="time">${n.time}</span>`;
      nl.appendChild(li);
    });
    /* 企业动态 */
    const fl = document.getElementById('firm-list');
    fl.innerHTML = '';
    game.firms.slice(0, 6).forEach(f => {
      const li = document.createElement('li');
      li.textContent = '• ' + f.txt;
      fl.appendChild(li);
    });
    /* 公众预期 */
    const st = game.state;
    const piELevel = Math.min(100, Math.max(0, (st.piE + 2) / 10 * 100));
    document.getElementById('expect-content').innerHTML =
      `<div>通胀预期 πe = <b style="font-family:var(--mono)">${st.piE.toFixed(1)}%</b></div>` +
      `<div class="exp-bar"><i style="width:${piELevel}%"></i></div>` +
      `<div class="exp-txt">${st.piE > 5 ? '⚠️ 预期已脱锚：扩张政策将主要转化为物价而非产出。' : st.piE > 3 ? '预期偏高，反复刺激将推高菲利普斯曲线。' : '预期锚定良好，政策空间充足。'}</div>`;
    /* 顾问便签 */
    document.getElementById('advisor-note').innerHTML = '✎ ' + this.advisorText(st);
  },

  advisorText(st) {
    if (st.piE > 5) return '通胀预期脱锚了！此时再刺激只会涨价不增产，先紧缩稳预期，重建信任是第一要务。';
    if (st.pi > 6) return '物价过热。回忆一下 AD-AS：紧缩性财政/货币会让曲线怎么移动？';
    if (st.u > 6.5) return '失业率明显高于自然率 ' + st.uN.toFixed(1) + '%。奥肯定律告诉我们产出缺口每扩大 1%，失业率约升 0.45pct。';
    if (st.r < 1) return '利率已近零下限，再降准降息的边际效果有限（流动性陷阱风险）——财政政策此刻更有效。';
    if (st.debt / st.Y * 100 > 75) return '债务率偏高，注意财政可持续性：赤字每季都在累积。';
    if (st.gap < -2) return '产出缺口为负，经济偏冷。乘数 k=1/(1−β) 记得吗？算一算再出手。';
    return '经济运行总体平稳。记住四大目标：增长、物价、就业、国际收支，别为了一个目标牺牲全部。';
  },

  /* ================= 底部教学区 ================= */
  buildChain(catKey) {
    const box = document.getElementById('chain-container');
    box.innerHTML = '';
    const nodes = CHAINS[catKey];
    nodes.forEach((n, i) => {
      if (i > 0) {
        const ar = document.createElement('span');
        ar.className = 'chain-arrow hand';
        ar.textContent = '↝';
        box.appendChild(ar);
      }
      const el = document.createElement('span');
      el.className = 'chain-node';
      el.textContent = n.t;
      el.onclick = () => {
        box.querySelectorAll('.chain-node').forEach(x => x.classList.remove('active'));
        el.classList.add('active');
        showKnowledgeCard('🔗 ' + n.t, n.know.f, n.know.x, '📚 ' + n.know.c);
      };
      box.appendChild(el);
    });
  },

  refreshTeach() {
    /* 学习建议 */
    const al = document.getElementById('advice-list');
    al.innerHTML = '';
    game.getAdvice().forEach(a => {
      const li = document.createElement('li');
      li.textContent = a;
      al.appendChild(li);
    });
    /* 成就 */
    const ach = document.getElementById('achv-list');
    ach.innerHTML = '';
    ACHIEVEMENTS.forEach(a => {
      const el = document.createElement('span');
      el.className = 'achv' + (game.unlocked[a.id] ? ' on' : '');
      el.textContent = `${a.icon} ${a.name}`;
      el.title = a.desc;
      ach.appendChild(el);
    });
    /* 雷达图 */
    RadarChart.update(game.state.radar);
  },

  refreshCharts() {
    const st = game.state;
    const ex = buildEx(st);
    ISLMChart.update(ex, st.P, { Y: st.Y, r: st.r });
    ADASChart.update(ex, { Y: st.Y, P: st.P });
    PhillipsChart.update(st);
    GDPChart.update(game.history);
    this.updateMap(st);
  },

  /* ================= 已执行政策（日志） ================= */
  refreshPending() {
    const list = document.getElementById('pending-list');
    list.innerHTML = '';
    game.pending.forEach(p => {
      const li = document.createElement('li');
      if (p.mult < 1) li.className = 'half';
      li.innerHTML = `<span>${p.card.icon} ${p.card.name}${p.mult < 1 ? '（×0.5）' : ''}</span>`;
      list.appendChild(li);
    });
    document.getElementById('pending-count').textContent = game.pending.length + ' / ' + game.maxPicks();
  },
  clearPending() { this.refreshPending(); },

  /* ================= 手绘城市地图 ================= */
  buildMap() {
    const host = document.getElementById('city-map');
    /* 手绘抖动滤镜：feTurbulence + 位移 */
    host.innerHTML = `
    <svg viewBox="0 0 760 218" preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#1a2c50"/><stop offset="1" stop-color="#0e1930"/>
        </linearGradient>
        <filter id="rough"><feTurbulence type="fractalNoise" baseFrequency="0.045" numOctaves="2" result="n"/>
          <feDisplacementMap in="SourceGraphic" in2="n" scale="3"/></filter>
        <linearGradient id="bldg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#2a3f6e"/><stop offset="1" stop-color="#1d2c50"/>
        </linearGradient>
      </defs>
      <rect width="760" height="218" fill="url(#sky)"/>
      <g filter="url(#rough)">
        <circle class="sun-halo" cx="100" cy="74" r="46" fill="#ffd77a22"/>
        <circle cx="100" cy="74" r="24" fill="#ffd77a" stroke="#c9a24a" stroke-width="2"/>
        <g class="cloud-drift" opacity=".8">
          <ellipse cx="560" cy="46" rx="46" ry="14" fill="#e8eefc22"/>
          <ellipse cx="596" cy="38" rx="30" ry="11" fill="#e8eefc1a"/>
        </g>
        <rect x="0" y="176" width="760" height="42" fill="#15223f"/>
        <path d="M0,176 Q190,168 380,176 T760,176" fill="none" stroke="#24365e" stroke-width="2"/>
        <!-- 楼群 -->
        <g id="city-win"></g>
        <g id="city-bldg"></g>
        <!-- 工厂 -->
        <g id="city-factory">
          <rect x="452" y="132" width="120" height="46" fill="url(#bldg)" stroke="#3a4d78" stroke-width="1.5"/>
          <path d="M452,132 L470,114 L488,132 M488,132 L506,114 L524,132" fill="none" stroke="#3a4d78" stroke-width="1.5"/>
          <rect x="468" y="96" width="10" height="36" fill="#22345c" stroke="#3a4d78"/>
          <rect x="496" y="88" width="10" height="44" fill="#22345c" stroke="#3a4d78"/>
          <g id="smoke-group"></g>
        </g>
        <!-- 塔吊：投资旺盛时摆动 -->
        <g stroke="#ffb454" stroke-width="3" fill="none" stroke-linecap="round">
          <line x1="620" y1="176" x2="620" y2="96"/>
          <g class="crane-arm" id="crane">
            <line x1="560" y1="96" x2="686" y2="96"/>
            <line x1="620" y1="80" x2="620" y2="96"/>
            <line x1="680" y1="96" x2="680" y2="118"/>
          </g>
        </g>
        <!-- 道路与车辆 -->
        <line x1="0" y1="196" x2="760" y2="196" stroke="#31456e" stroke-width="2" stroke-dasharray="14 10"/>
        <g class="car-move"><rect x="0" y="188" width="26" height="9" rx="3" fill="#3fd6c2"/><rect x="5" y="184" width="12" height="5" rx="2" fill="#3fd6c288"/></g>
        <!-- 树木 -->
        <g stroke="#2f8f6b" stroke-width="2" fill="none">
          <circle cx="380" cy="170" r="9"/><circle cx="404" cy="172" r="7"/><circle cx="640" cy="168" r="8"/>
        </g>
      </g>
    </svg>`;
    /* 楼群与窗户（JS 生成，便于按状态点亮） */
    const bldg = host.querySelector('#city-bldg');
    const winG = host.querySelector('#city-win');
    const spec = [[30, 96, 54, 82], [96, 116, 44, 62], [150, 84, 60, 94], [220, 128, 40, 50], [268, 104, 52, 74], [330, 136, 36, 42], [606, 122, 46, 56], [660, 140, 56, 38], [700, 112, 44, 66]];
    spec.forEach((b, bi) => {
      const r = document.createElementNS(SVGNS, 'rect');
      r.setAttribute('x', b[0]); r.setAttribute('y', b[1]);
      r.setAttribute('width', b[2]); r.setAttribute('height', b[3]);
      r.setAttribute('fill', 'url(#bldg)'); r.setAttribute('stroke', '#3a4d78'); r.setAttribute('stroke-width', '1.5');
      bldg.appendChild(r);
      /* 窗户：两列若干行 */
      for (let row = 0; row < Math.floor((b[3] - 14) / 16); row++) {
        for (let col = 0; col < 2; col++) {
          const w = document.createElementNS(SVGNS, 'rect');
          w.setAttribute('x', b[0] + 8 + col * (b[2] / 2));
          w.setAttribute('y', b[1] + 8 + row * 16);
          w.setAttribute('width', 9); w.setAttribute('height', 9);
          w.setAttribute('fill', '#ffd77a');
          w.setAttribute('class', 'blink-win');
          w.style.animationDelay = (bi * 7 + row * 3 + col) + 's';
          winG.appendChild(w);
        }
      }
    });
  },

  /* 地图随状态变化：烟囱数量=景气度，窗户亮度=消费，塔吊=投资 */
  updateMap(st) {
    /* 烟雾数量：产出缺口越高烟越浓 */
    const smokeG = document.getElementById('smoke-group');
    const n = Math.round(clamp(3 + st.gap / 2, 1, 6));
    smokeG.innerHTML = '';
    for (let i = 0; i < n; i++) {
      const c = document.createElementNS(SVGNS, 'circle');
      c.setAttribute('cx', 473 + (i % 2) * 28);
      c.setAttribute('cy', 92 - (i % 2) * 6);
      c.setAttribute('r', 5 + (i % 3));
      c.setAttribute('fill', '#9fb3d988');
      c.setAttribute('class', 'smoke');
      c.style.animationDelay = (i * 0.45) + 's';
      smokeG.appendChild(c);
    }
    /* 窗户亮度：消费景气（gap 越高越亮） */
    const bright = clamp(0.45 + st.gap / 6, 0.25, 1);
    document.querySelectorAll('#city-win rect').forEach(w => w.style.opacity = bright);
    /* 塔吊：投资 rising 时摆动 */
    const prev = game.history.length >= 2 ? game.history[game.history.length - 2].dec.I : null;
    const crane = document.getElementById('crane');
    crane.style.animationPlayState = (prev !== null && st.dec.I > prev) ? 'running' : 'paused';
  },

  /* ================= 事件弹窗 ================= */
  showEvent(ev, time) {
    document.getElementById('event-title').textContent = `${ev.icon} ${time} · ${ev.title}`;
    document.getElementById('event-desc').textContent = ev.desc;
    document.getElementById('event-effect').textContent =
      '冲击传导：' + this.fmtEffects(ev.effects);
    document.getElementById('event-modal').classList.remove('hidden');
  },
  fmtEffects(eff) {
    return Object.keys(eff).map(k => `${EFFECT_NAMES[k] || k} ${eff[k] > 0 ? '+' : ''}${eff[k]}`).join('，');
  },

  /* ================= 错题本 ================= */
  showWrongBook() {
    const box = document.getElementById('wrongbook-list');
    if (!game.wrongBook.length) {
      box.innerHTML = '<p style="padding:20px;text-align:center">还没有错题，保持手感！💪</p>';
    } else {
      box.innerHTML = game.wrongBook.map(w =>
        `<div class="wrong-item"><b>${w.card}</b> · ${w.chapter} <span class="cnt">错 ${w.cnt} 次</span><span class="fx">${w.formula}</span>${w.explain}</div>`
      ).join('');
    }
    document.getElementById('wrongbook-modal').classList.remove('hidden');
  },

  /* ================= 结算 ================= */
  showFinal() {
    const fs = game.finalScore();
    const rows = game.history.map(h =>
      `<tr><td>${h.label}</td><td>${(h.Y * 1.25).toFixed(1)}</td><td>${h.pi.toFixed(1)}%</td><td>${h.u.toFixed(1)}%</td><td>${h.r.toFixed(2)}%</td><td>${h.trust.toFixed(0)}</td></tr>`).join('');
    const ach = ACHIEVEMENTS.filter(a => game.unlocked[a.id]).map(a => `${a.icon} ${a.name}`).join('　') || '（无）';
    document.getElementById('final-summary').innerHTML =
      `<p><b>综合评分：<span style="font-size:22px;color:#c0392b">${fs.total.toFixed(1)}</span> / 100</b></p>
       <p>经济增长 ${fs.dims.growth.toFixed(0)} ｜ 物价稳定 ${fs.dims.price.toFixed(0)} ｜ 充分就业 ${fs.dims.job.toFixed(0)} ｜ 国际收支 ${fs.dims.ext.toFixed(0)}</p>
       <p>🏅 成就：${ach}</p>
       <p>✎ ${game.getAdvice().join('<br>✎ ')}</p>
       <table><tr><th>季度</th><th>GDP(万亿)</th><th>通胀</th><th>失业</th><th>利率</th><th>信任</th></tr>${rows}</table>`;
    document.getElementById('final-modal').classList.remove('hidden');
  },

  /* ================= 总刷新 ================= */
  refreshAll() {
    this.refreshKPI();
    this.refreshTimeline();
    this.refreshPending();
    this.refreshFeed();
    this.refreshTeach();
    this.refreshCharts();
  },
};

/* =========================================================
   Transmission —— 六步传导演示动画
   ①冲击注入 → ②曲线移动 → ③均衡重解 → ④物价 → ⑤就业 → ⑥部门反馈
   节点逐个点亮，数值实时滚动；学习模式显示公式，沙盘模式更快
   ========================================================= */
const Transmission = {
  timer: null, onDone: null, nodes: [], litCount: 0,

  play(title, steps, showFormula, onDone) {
    this.onDone = onDone;
    clearTimeout(this.timer);
    document.getElementById('trans-title').textContent = title;
    const chain = document.getElementById('trans-chain');
    chain.innerHTML = '';
    this.nodes = []; this.litCount = 0;

    steps.forEach((s, i) => {
      if (i > 0) {
        const ar = document.createElement('span');
        ar.className = 'trans-arrow';
        ar.textContent = '➜';
        chain.appendChild(ar);
      }
      const n = document.createElement('div');
      n.className = 'trans-node';
      let html = `<div class="tn-idx">${i + 1}</div><div class="tn-title">${s.t}</div>`;
      (s.rows || []).forEach(r => {
        const prefix = (r.from !== null && r.from !== undefined) ? `<s>${r.from}</s>→` : '';
        html += `<div class="tn-row"><span class="lbl">${r.label ? r.label + ' ' : ''}</span>` +
          `${prefix}<b class="${r.tone || 'flat'}" data-from="${r.from ?? ''}" data-to="${r.to ?? ''}" data-unit="${r.unit || ''}" data-dec="${r.dec === undefined ? 1 : r.dec}">${r.to}${r.unit || ''}</b></div>`;
      });
      if (s.note) html += `<div class="tn-note">${s.note}</div>`;
      if (showFormula && s.formula) html += `<div class="tn-formula">${s.formula}</div>`;
      n.innerHTML = html;
      chain.appendChild(n);
      this.nodes.push(n);
    });

    document.getElementById('trans-skip').classList.remove('hidden');
    document.getElementById('trans-done').classList.add('hidden');
    document.getElementById('transmission-modal').classList.remove('hidden');

    /* 逐节点点亮（沙盘 320ms / 学习 620ms） */
    const delay = game.mode === 'sandbox' ? 320 : 620;
    const lightNext = () => {
      if (this.litCount >= this.nodes.length) { this.finish(); return; }
      const n = this.nodes[this.litCount];
      n.classList.add('lit');
      n.querySelectorAll('b[data-to]').forEach(b => this.tweenRow(b));
      this.litCount++;
      this.timer = setTimeout(lightNext, delay);
    };
    lightNext();
  },

  /* 单个数值的滚动动画 */
  tweenRow(b) {
    const from = parseFloat(b.dataset.from), to = parseFloat(b.dataset.to);
    if (isNaN(from) || isNaN(to) || from === to) return;
    const unit = b.dataset.unit, dec = +b.dataset.dec;
    const t0 = performance.now(), dur = Math.min(480, game.fastMode ? 160 : 480);
    const frame = t => {
      const p = Math.min(1, (t - t0) / dur);
      const v = from + (to - from) * (1 - Math.pow(1 - p, 2));
      b.textContent = v.toFixed(dec) + unit;
      if (p < 1) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  },

  /* 跳过：立即点亮全部节点 */
  finish() {
    clearTimeout(this.timer);
    this.nodes.forEach(n => {
      if (!n.classList.contains('lit')) {
        n.classList.add('lit');
        n.querySelectorAll('b[data-to]').forEach(b => this.tweenRow(b));
      }
    });
    this.litCount = this.nodes.length;
    document.getElementById('trans-skip').classList.add('hidden');
    document.getElementById('trans-done').classList.remove('hidden');
  },

  /* 确认：关闭弹窗 → 主图表平滑移动到新均衡 */
  confirm() {
    document.getElementById('transmission-modal').classList.add('hidden');
    if (this.onDone) { const cb = this.onDone; this.onDone = null; cb(); }
  },
};

/* —— 知识卡弹窗（链条节点 / 历史快照共用） —— */
function showKnowledgeCard(title, formula, text, chapter) {
  document.getElementById('know-title').textContent = title;
  const fb = document.getElementById('know-formula');
  if (formula) { fb.style.display = ''; fb.textContent = formula; } else fb.style.display = 'none';
  document.getElementById('know-text').innerHTML = text;
  document.getElementById('know-chapter').textContent = chapter || '';
  document.getElementById('knowledge-modal').classList.remove('hidden');
}

/* —— 启动 —— */
window.addEventListener('DOMContentLoaded', () => UI.initAll());

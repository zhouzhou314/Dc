/* =========================================================
   engine.js —— 游戏状态管理与回合模拟（双模式版）
   （由原 game.js 移植，逻辑保持不变，仅改为 ES Module 并接入事件上报）
   回合流程：
     beginQuarter(n)：时间推进、触发事件（事件冲击也走传导演示）
     玩家操作：选卡 →（学习模式先做题）→ 政策立即生效
               → solveStatic 重解均衡 → 传导演示六步动画
     endQuarter()：临时政策续期 → 季度推进（货币适应/预期/债务）
               → 历史记录 → 成就判定 → 下一季
   模式差异：
     learn   学习模式：必做题；传导演示附公式推导；每季 3 张卡
     sandbox 沙盘模式：免做题全额生效；动画更快；每季 5 张卡
   【ES Module 移植】
     · 原版 UI / Transmission 是全局对象，现在由 main.js 注册到 ctx，
       通过 ui() / trans() 间接调用，避免 engine ←→ main 循环依赖；
     · 所有 DOM 查询限定在 root 内（$ 助手）；
     · 在政策执行 / 季度结算 / 错题本变更处调用 emit() 上报事件。
   ========================================================= */

import { SCRIPTED_EVENTS, RANDOM_EVENTS, ACHIEVEMENTS, FIRM_TPL, EFFECT_NAMES } from './data.js';
import { MODEL, solveStatic, computeRadar, advanceQuarter, clamp } from './models.js';
import { pick } from './quiz.js';
import { ctx, $, emit, setTimer } from './context.js';

export const TOTAL_QUARTERS = 14;   // 2023Q4 → 2027Q1

/* 教材情景单位 → 模型指数点 的换算系数
   （卡牌/事件数值按"教材例题量级"标注，入模统一折算） */
export const EFFECT_SCALE = { G: 0.5, T: 0.5, M: 0.5, a: 0.5, I0: 0.5, NX0: 0.5, nu: 0.5, Ystar: 1, s: 1, e: 1 };

/* UI / 传导演示由 main.js 在挂载时注册到 ctx（延迟取用，规避循环依赖） */
const ui = () => ctx.UI;
const trans = () => ctx.Transmission;

export const game = {
  /* —— 运行时开关 —— */
  mode: 'learn',         // 'learn' 学习模式 | 'sandbox' 沙盘模式
  fastMode: false,       // 图表动画加速
  quarter: 0,            // 当前季度序号（0 起）
  state: null,           // 经济状态
  history: [],           // 各季度历史（图表用）
  news: [],              // 新闻流
  firms: [],             // 企业动态流
  pending: [],           // 本季已执行政策（日志 [{card, mult}]）
  activeTemps: [],       // 跨季临时政策 [{changes, mult, left}]
  wrongBook: [],         // 错题本
  quizRight: 0,          // 累计答对题数
  unlocked: {},          // 已解锁成就
  piLowStreak: 0, uGoodStreak: 0, trapWin: false,
  pendingSettle: null,   // 事件弹窗关闭后待演示的冲击

  /* ================= 初始化 ================= */
  reset() {
    const m = MODEL.init;
    this.quarter = 0;
    this.state = {
      a: MODEL.a0, I0: MODEL.I00,
      G: m.G, T: m.T, M: m.M * (1 + m.piE / 100), NX0: m.NX0,
      Ystar: m.Ystar, P: m.P, s: m.s, e: m.e, nu: 0,
      piE: m.piE, uN: m.uN, debt: m.debt, trust: m.trust,
      /* 以下由首次均衡计算填充 */
      Y: 100, r: 3, pi: m.piE, u: m.uN, gap: 0,
      dec: { C: 76, I: 4, G: m.G, NX: m.NX0 },
      radar: { growth: 50, price: 80, job: 80, ext: 78 },
    };
    Object.assign(this.state, solveStatic(this.state));
    this.state.radar = computeRadar(this.state);

    this.history = []; this.news = []; this.firms = [];
    this.pending = []; this.activeTemps = [];
    this.wrongBook = []; this.quizRight = 0;
    this.unlocked = {}; this.piLowStreak = 0; this.uGoodStreak = 0; this.trapWin = false;
    this.pendingSettle = null;

    this.pushHistory();
    this.addNews('🛞', '你就任经济舵手', '新班子亮相，市场屏息等待你的第一份政策清单。', 'policy');
    this.beginQuarter(0);
  },

  /* 季度标签：2023 Q4 起步 */
  quarterLabel(n) {
    const q = ((n + 3) % 4) + 1;
    const y = 2023 + Math.floor((n + 3) / 4);
    return y + ' Q' + q;
  },

  pushHistory() {
    const st = this.state;
    this.history.push({
      label: this.quarterLabel(this.quarter),
      Y: st.Y, r: st.r, P: st.P, pi: st.pi, u: st.u, gap: st.gap,
      piE: st.piE, debt: st.debt, trust: st.trust, NX0: st.NX0,
      dec: Object.assign({}, st.dec),
      radar: Object.assign({}, st.radar),
    });
  },

  /* ================= 季度开始：事件触发 ================= */
  beginQuarter(n) {
    this.quarter = n;
    this.pending = [];

    /* 前 8 季脚本事件，之后从随机池抽取（60% 概率出事件） */
    let ev = null;
    if (n >= 1 && n <= 8) ev = SCRIPTED_EVENTS.find(e => e.q === n);
    else if (n > 8 && Math.random() < 0.6) ev = pick(RANDOM_EVENTS);

    if (ev) {
      (ev.firm || []).forEach(f => this.firms.unshift({ txt: f, time: this.quarterLabel(n) }));
      this.addNews(ev.icon, ev.title, ev.desc, ev.tag);
      ui().showEvent(ev, this.quarterLabel(n));
      /* 事件弹窗关闭后再播放传导演示 */
      this.pendingSettle = [{ icon: ev.icon, name: ev.title, changes: ev.effects, mult: 1 }];
    } else {
      ui().refreshAll();
    }
  },

  /* 事件弹窗"知道了" → 触发事件冲击的传导演示 */
  onEventClosed() {
    $('#event-modal').classList.add('hidden');
    if (this.pendingSettle) {
      const entries = this.pendingSettle;
      this.pendingSettle = null;
      this.settleNow(entries);
    } else {
      ui().refreshAll();
    }
  },

  /* ================= 政策执行（即时生效） ================= */
  maxPicks() { return this.mode === 'sandbox' ? 5 : 3; },

  canPick(card) {
    if (this.pending.length >= this.maxPicks()) { toast(`⚠️ 每季度最多执行 ${this.maxPicks()} 项政策`); return false; }
    if (this.pending.some(p => p.card.id === card.id)) { toast('⚠️ 该政策本季度已在执行中'); return false; }
    return true;
  },

  /* 做题完成后的政策登记：立即应用并演示传导
     correct → 全额生效；答错 → 效果减半
     临时政策（card.temp）当季同样走这条路径，因此上报点唯一 */
  registerPolicy(card, correct) {
    const mult = correct ? 1 : 0.5;
    this.pending.push({ card: card, mult: mult });

    /* 上报：执行一张政策卡（AI 数据采集）
       changes 为该卡声明的外生参数调整；原版无成本字段，故不传 cost */
    emit('game1.policy', {
      quarter: this.quarter,
      cardId: card.id,
      name: card.name,
      category: card.cat,
      effect: card.effect,
      changes: card.changes || {},
      mode: this.mode,
    });

    this.settleNow([{
      icon: card.icon, name: card.name,
      changes: card.changes, mult: mult,
      formula: card.formula, trust: card.trust,
    }]);
    if (!correct) toast('📉 预判失误：政策效果减半，已记入错题本', true);
  },

  /* ================= 结算一次外生变化并演示传导 =================
     entries: [{icon, name, changes, mult, formula?, trust?}]
     流程：快照 → 应用变化 → 重解均衡 → 六步传导演示 → 刷新 UI */
  settleNow(entries) {
    const st = this.state;
    const prev = {
      Y: st.Y, r: st.r, P: st.P, u: st.u, gap: st.gap,
      debtRatio: st.debt / st.Y * 100, trust: st.trust,
    };
    entries.forEach(e => {
      this.applyChanges(e.changes || {}, e.mult === undefined ? 1 : e.mult);
      if (e.trust) st.trust = clamp(st.trust + e.trust * (e.mult === undefined ? 1 : e.mult), 0, 100);
    });
    const res = solveStatic(st);
    const steps = buildTransmissionSteps(prev, res, entries, st);
    Object.assign(st, res);
    st.radar = computeRadar(st);
    this.genFirms();

    const names = entries.map(e => e.name).join(' ＋ ');
    trans().play('🔍 传导演示 · ' + names, steps, this.mode === 'learn', () => {
      ui().refreshAll();
      this.checkAchievements();
    });
  },

  /* 应用一组数值变化（政策卡 / 事件通用）
     mult：效果乘数（答错 0.5）；EFFECT_SCALE 折算入模强度 */
  applyChanges(changes, mult) {
    const st = this.state;
    for (const k in changes) {
      const v = changes[k] * mult * (EFFECT_SCALE[k] !== undefined ? EFFECT_SCALE[k] : 1);
      if (k === 'nu') st.nu += v;
      else if (k === 's') st.s = Math.max(0.3, st.s + v);
      else if (k === 'e') st.e = Math.max(5.5, Math.min(9, st.e + v));
      else st[k] += v;
    }
  },

  /* ================= 季度结算（时间推进） ================= */
  endQuarter() {
    if (this.pending.length === 0) {
      if (!confirm('本季度未执行任何政策，确定直接进入下一季度？')) return;
    }

    /* 1. 临时政策跨季续期（效应在季度推进的均衡中体现） */
    this.activeTemps.forEach(t => this.applyChanges(t.changes, t.mult));
    this.activeTemps = this.activeTemps.filter(t => --t.left > 0);

    /* 2. 季度推进：货币适应、预期锚定调整、债务核算、暂时冲击消退 */
    advanceQuarter(this.state);
    this.updateTrust();
    this.state.radar = computeRadar(this.state);

    /* 3. 记录历史 & 连续表现追踪 */
    this.pushHistory();
    const st = this.state;
    this.piLowStreak = st.pi <= 2.5 ? this.piLowStreak + 1 : 0;
    this.uGoodStreak = (st.u >= 4 && st.u <= 6) ? this.uGoodStreak + 1 : 0;
    if (st.r < 1 && st.gap > 0) this.trapWin = true;
    this.checkAchievements();

    /* 4. 上报本季结算（AI 数据采集） */
    emit('game1.quarter', {
      quarter: this.quarter,
      round: this.quarter + 1,
      kpi: kpiSnapshot(this.state),
      score: this.finalScore().total,
      mode: this.mode,
    });

    /* 5. 时间推进 */
    const next = this.quarter + 1;
    if (next >= TOTAL_QUARTERS) { ui().refreshAll(); ui().showFinal(); return; }
    this.beginQuarter(next);
  },

  /* 信任度：依据增长 / 物价 / 就业 / 债务综合评价 */
  updateTrust() {
    const st = this.state;
    let d = 0;
    if (st.gap > 1) d += 1; else if (st.gap < -2) d -= 2;
    const pd = Math.abs(st.pi - 2);
    if (pd > 3) d -= 3; else if (pd > 1.5) d -= 1; else d += 1;
    if (st.u > 7) d -= 2; else if (st.u < 4) d += 1;
    if (st.debt / st.Y * 100 > 75) d -= 2;
    st.trust = clamp(st.trust + d, 0, 100);
  },

  /* 企业动态：按当前经济状态选模板（政策落地即反应） */
  genFirms() {
    const st = this.state;
    const pool = [];
    if (st.gap > 1.5) pool.push(...FIRM_TPL.hot);
    if (st.gap < -1.5) pool.push(...FIRM_TPL.cold);
    if (st.r > 5) pool.push(...FIRM_TPL.hiRate);
    if (st.r < 2.5) pool.push(...FIRM_TPL.loRate);
    if (st.pi > 4.5) pool.push(...FIRM_TPL.hiInfl);
    if (st.pi < 0.5) pool.push(...FIRM_TPL.defl);
    if (st.NX0 > 2.5) pool.push(...FIRM_TPL.exportUp);
    if (st.NX0 < 0.5) pool.push(...FIRM_TPL.exportDn);
    const uniq = [...new Set(pool)];
    shuffle(uniq).slice(0, 2).forEach(txt => {
      this.firms.unshift({ txt: txt, time: this.quarterLabel(this.quarter) });
    });
    this.firms = this.firms.slice(0, 8);
  },

  addNews(icon, title, desc, tag) {
    this.news.unshift({ icon, title, desc, tag, time: this.quarterLabel(this.quarter) });
    this.news = this.news.slice(0, 10);
  },

  /* ================= 错题本 ================= */
  /* 错题入库：同章节题合并计数，并上报 game1.wrongbook(add) */
  addWrong(q, card) {
    const found = this.wrongBook.find(w => w.chapter === q.chapter);
    if (found) found.cnt++;
    else this.wrongBook.push({ text: q.text, formula: q.formula, explain: q.explain, chapter: q.chapter, card: card.name, cnt: 1 });
    emit('game1.wrongbook', {
      action: 'add',
      questionKey: card.quiz,
      correct: false,
      chapter: q.chapter,
    });
  },

  /* 错题移出：答对同章节新题后调用（对应错题本"答对同类新题可移出"的提示）
     返回是否真的移出了条目，并上报 game1.wrongbook(remove) */
  removeWrong(chapter, questionKey) {
    const i = this.wrongBook.findIndex(w => w.chapter === chapter);
    if (i < 0) return false;
    this.wrongBook.splice(i, 1);
    emit('game1.wrongbook', {
      action: 'remove',
      questionKey: questionKey,
      correct: true,
      chapter: chapter,
    });
    return true;
  },

  /* ================= 学习建议 ================= */
  getAdvice() {
    const st = this.state, out = [];
    const byCh = {};
    this.wrongBook.forEach(w => byCh[w.chapter] = (byCh[w.chapter] || 0) + w.cnt);
    Object.keys(byCh).sort((a, b) => byCh[b] - byCh[a]).slice(0, 2)
      .forEach(ch => out.push(`建议复习「${ch}」：错题 ${byCh[ch]} 道，掌握乘数与传导机制后再出手。`));
    if (st.piE > 5) out.push('通胀预期已明显脱锚：反复刺激只会推高 πe，建议先稳定物价重建信任（时间不一致性问题）。');
    else if (st.pi > 6) out.push('通胀偏高：复习 AD-AS 中紧缩性政策（IS/LM 左移）的短期代价。');
    if (st.u > 6.5) out.push('失业率高于自然率：可复习奥肯定律与扩张性政策的传导链条。');
    if (st.r < 1 && st.gap <= 0) out.push('利率接近零下限，类似"流动性陷阱"：货币政策失效，财政政策更有效。');
    if (st.debt / st.Y * 100 > 75) out.push('债务率偏高：复习财政可持续性与李嘉图等价的讨论。');
    if (!out.length) out.push('运行平稳！继续保持对四大目标的平衡：增长、物价、就业、国际收支。');
    return out.slice(0, 4);
  },

  /* ================= 成就判定 ================= */
  checkAchievements() {
    /* 注意：这里的 snap 是成就判定入参，不要与模块级 ctx 混淆 */
    const snap = {
      gap: this.state.gap,
      piLowStreak: this.piLowStreak,
      uGoodStreak: this.uGoodStreak,
      trapWin: this.trapWin,
      quizRight: this.quizRight,
      debtRatio: this.state.debt / this.state.Y * 100,
      radar: this.state.radar,
    };
    ACHIEVEMENTS.forEach(a => {
      if (!this.unlocked[a.id] && a.cond(snap)) {
        this.unlocked[a.id] = true;
        toast(`🏅 解锁成就：${a.icon} ${a.name}`);
      }
    });
  },

  /* 总评分（结算页用） */
  finalScore() {
    const avg = k => this.history.reduce((s, h) => s + h.radar[k], 0) / this.history.length;
    const dims = { growth: avg('growth'), price: avg('price'), job: avg('job'), ext: avg('ext') };
    const total = (dims.growth + dims.price + dims.job + dims.ext) / 4;
    return { dims, total };
  },
};

/* =========================================================
   六步传导演示的步骤构建
   ①冲击注入 → ②曲线移动 → ③均衡重解 → ④物价 → ⑤就业 → ⑥部门反馈
   ========================================================= */
export function buildTransmissionSteps(prev, res, entries, st) {
  /* 聚合本组变化的入模净效应（含折算系数） */
  const agg = {};
  entries.forEach(e => {
    for (const k in (e.changes || {})) {
      const v = e.changes[k] * (e.mult === undefined ? 1 : e.mult) * (EFFECT_SCALE[k] !== undefined ? EFFECT_SCALE[k] : 1);
      agg[k] = (agg[k] || 0) + v;
    }
  });
  const fmtC = v => (v > 0 ? '+' : '') + (Math.round(v * 100) / 100);

  /* ① 冲击注入行 */
  const shockRows = [];
  entries.forEach(e => {
    shockRows.push({ label: '', from: null, to: `${e.icon || '⚡'} ${e.name}${(e.mult === undefined ? 1 : e.mult) < 1 ? '（效果×0.5）' : ''}`, tone: 'flat' });
    const parts = Object.keys(e.changes || {}).map(k => `${EFFECT_NAMES[k] || k} ${fmtC(e.changes[k] * (e.mult === undefined ? 1 : e.mult))}`);
    if (parts.length) shockRows.push({ label: '', from: null, to: parts.join('，'), tone: 'flat' });
  });

  /* ② 曲线移动判定 */
  const shiftRows = [];
  const isDir = (agg.G || 0) + (agg.I0 || 0) + (agg.a || 0) + (agg.NX0 || 0) - (agg.T || 0);
  if (isDir > 0.01) shiftRows.push({ label: '', from: null, to: 'IS 曲线 → 右移（总需求↑）', tone: 'good' });
  else if (isDir < -0.01) shiftRows.push({ label: '', from: null, to: 'IS 曲线 ← 左移（总需求↓）', tone: 'bad' });
  if ((agg.M || 0) > 0.01) shiftRows.push({ label: '', from: null, to: 'LM 曲线 → 右移（流动性↑）', tone: 'good' });
  else if ((agg.M || 0) < -0.01) shiftRows.push({ label: '', from: null, to: 'LM 曲线 ← 左移（流动性↓）', tone: 'bad' });
  if ((agg.Ystar || 0) > 0.01) shiftRows.push({ label: '', from: null, to: 'LRAS → 右移（潜在产出↑）', tone: 'good' });
  if ((agg.s || 0) > 0.01 || (agg.nu || 0) > 0.01) shiftRows.push({ label: '', from: null, to: 'SRAS ← 上移（成本推动）', tone: 'bad' });
  else if ((agg.s || 0) < -0.01 || (agg.nu || 0) < -0.01) shiftRows.push({ label: '', from: null, to: 'SRAS → 下移（成本改善）', tone: 'good' });
  if (!shiftRows.length) shiftRows.push({ label: '', from: null, to: '外生参数微调', tone: 'flat' });

  const newDebtRatio = st.debt / res.Y * 100;
  return [
    { t: '① 冲击注入', rows: shockRows, formula: (entries[0] && entries[0].formula) || '外生冲击 ΔX',
      note: entries.length > 1 ? `共 ${entries.length} 项同时生效` : '' },
    { t: '② 曲线移动', rows: shiftRows, formula: 'IS：Y=C(Y−T)+I(r)+G+NX ｜ LM：M/P=kY−hr' },
    { t: '③ 均衡重解', rows: [
        { label: 'GDP', from: prev.Y * 1.25, to: res.Y * 1.25, unit: ' 万亿', dec: 1, tone: res.Y >= prev.Y ? 'good' : 'bad' },
        { label: '利率 r', from: prev.r, to: res.r, unit: '%', dec: 2, tone: res.r > prev.r + 1e-4 ? 'warn' : (res.r < prev.r - 1e-4 ? 'good' : 'flat') },
      ], formula: 'IS-LM 联立 → AD-AS 均衡（数值实时重解）' },
    { t: '④ 物价调整', rows: [
        { label: '价格 P', from: prev.P, to: res.P, unit: '', dec: 1, tone: 'flat' },
        { label: '通胀 π', from: null, to: res.pi.toFixed(2), unit: '%', dec: 2, tone: res.pi > 6 ? 'bad' : (res.pi < 0.5 ? 'warn' : 'good') },
      ], formula: 'SRAS：P = Pe + s(Y−Y*)' },
    { t: '⑤ 就业反馈', rows: [
        { label: '失业率', from: prev.u, to: res.u, unit: '%', dec: 1, tone: res.u < prev.u - 1e-4 ? 'good' : (res.u > prev.u + 1e-4 ? 'bad' : 'flat') },
        { label: '产出缺口', from: prev.gap, to: res.gap, unit: '%', dec: 1, tone: Math.abs(res.gap) < Math.abs(prev.gap) ? 'good' : 'warn' },
      ], formula: '奥肯定律：u = uN − λ·(Y−Y*)/Y*' },
    { t: '⑥ 部门反馈', rows: [
        { label: '债务率', from: prev.debtRatio, to: newDebtRatio, unit: '%', dec: 1, tone: newDebtRatio > 75 ? 'bad' : (newDebtRatio < prev.debtRatio - 1e-4 ? 'good' : 'flat') },
        { label: '信任度', from: prev.trust, to: st.trust, unit: '', dec: 0, tone: st.trust > prev.trust ? 'good' : (st.trust < prev.trust ? 'bad' : 'flat') },
      ], formula: 'πe ← 0.45πe + 0.4π + 0.3（季末调整）',
      note: '通胀预期于季度末按实际通胀适应性调整' },
  ];
}

/* =========================================================
   对外工具：KPI 快照 / 随机洗牌 / 轻提示
   ========================================================= */

/**
 * 提取 AI 分析用的核心指标快照（纯数值对象）
 * g 用产出缺口作为增长率代理；数值的两位小数由 emit 统一处理
 */
export function kpiSnapshot(st) {
  return {
    g: st.gap,       // 产出缺口（增长率代理 %）
    u: st.u,         // 失业率 %
    pi: st.pi,       // 通胀率 %
    r: st.r,         // 利率 %
    Y: st.Y,         // 产出（指数点，×1.25 为万亿元）
    debt: st.debt,   // 政府债务（指数点）
    trust: st.trust, // 公众信任度
  };
}

export function shuffle(arr) { return arr.sort(() => Math.random() - 0.5); }

/* 轻提示：追加一个 toast 元素，2.8s 后自动移除（定时器受 ctx 统一管理） */
export function toast(msg, warn) {
  const layer = $('#toast-layer');
  if (!layer) return;
  const el = document.createElement('div');
  el.className = 'toast' + (warn ? ' warn' : '');
  el.textContent = msg;
  layer.appendChild(el);
  setTimer(() => el.remove(), 2800);
}

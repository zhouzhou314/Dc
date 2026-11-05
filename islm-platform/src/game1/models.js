/* =========================================================
   models.js —— 宏观经济模型核心计算
   模型体系：IS-LM → AD-AS → 菲利普斯曲线/奥肯定律
   所有"产出"均为指数（潜在产出 Y* = 100），价格 P 为价格指数。
   【ES Module 移植】模型计算函数与常量全部 export，供 charts / engine / main import。
   ========================================================= */

export const MODEL = {
  /* —— 行为参数（教学简化，保持乘数关系与教材一致） ——
     校准目标：基线 Y≈100、r≈3%、π≈2%；IS-LM 支出乘数≈1.6（含挤出）；
     AD 斜率适中（实际余额效应显著），使经济在冲击后可自我收敛 */
  b: 0.8,      // β 边际消费倾向
  a0: 10,      // 自主消费基线
  I00: 11.75,  // 自主投资基线
  d: 3,        // 投资的利率敏感度
  k: 0.55,     // 货币需求的收入敏感度
  h: 4,        // 货币需求的利率敏感度
  lam: 0.45,   // 奥肯定律系数 λ
  kappa: 0.35, // 菲利普斯曲线产出缺口系数（与 SRAS 斜率 s 对应）
  piTarget: 2, // 通胀目标（预期锚）

  /* —— 初始外生状态 —— */
  init: {
    G: 18, T: 17,        // 政府购买 / 税收（指数点）
    M: 45,               // 货币供给（基期价格=100 下的名义货币）
    NX0: 2,              // 自主净出口
    Ystar: 100,          // 潜在产出
    P: 100,              // 价格指数
    s: 0.35,             // SRAS 斜率：P = Pe + s(Y−Y*)
    e: 7.1,              // 人民币汇率（展示用）
    nu: 0,               // 供给冲击（暂时项）
    piE: 2.0,            // 通胀预期 %
    uN: 5.0,             // 自然失业率 %
    debt: 60,            // 政府债务（指数点，展示×1.25=75万亿）
    trust: 60,           // 公众信任度
  },
};

/* 构建某一季度结算用的外生参数包 ex
   供给冲击 ν 体现为 SRAS 截距上移（成本推动，滞胀效应） */
export function buildEx(st) {
  return {
    a: st.a, T: st.T, G: st.G, M: st.M, NX0: st.NX0,
    I0: st.I0, Ystar: st.Ystar, s: st.s, e: st.e,
    Pe: st.P * (1 + st.piE / 100) + (st.nu || 0),   // 预期价格 + 供给冲击
  };
}

/* —— AD：给定价格 P，由 IS-LM 联立求均衡产出 ——
   实际余额 = M × P0 / P（P0 = 100 为基期价格，M 为基期价格下的名义货币）
   Y(P) = [a − βT + I0 + G + NX0 + (d/h)·(M·P0/P)] / [(1−β) + d·k/h] */
export const P0 = 100;
export function realBalance(M, P) { return M * P0 / P; }

export function adY(P, ex) {
  const m = MODEL;
  const num = ex.a - m.b * ex.T + ex.I0 + ex.G + ex.NX0 + (m.d / m.h) * realBalance(ex.M, P);
  return num / ((1 - m.b) + m.d * m.k / m.h);
}

/* —— 给定 P 求该价格下的 IS-LM 均衡（Y, r） —— */
export function eqISLM(P, ex) {
  const Y = adY(P, ex);
  const r = (MODEL.k * Y - realBalance(ex.M, P)) / MODEL.h;
  return { Y: Y, r: r };
}

/* —— SRAS 反函数：P = Pe + s(Y − Y*) ⇒ Y = (P − Pe)/s + Y* —— */
export function asY(P, ex) {
  return (P - ex.Pe) / ex.s + ex.Ystar;
}

/* —— AD-AS 均衡：解 adY(P) = asY(P)（二分法，AD 单调减、AS 单调增，解唯一） —— */
export function equilibrate(ex) {
  let lo = 40, hi = 300;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (adY(mid, ex) - asY(mid, ex) > 0) lo = mid; else hi = mid;
  }
  const P = (lo + hi) / 2;
  const Y = adY(P, ex);
  const r = (MODEL.k * Y - realBalance(ex.M, P)) / MODEL.h;
  return { P: P, Y: Y, r: r };
}

/* —— 菲利普斯曲线：π = πe + κ·(Y−Y*)/Y* + ν —— */
export function phillipsPi(gapPct, piE, nu) {
  return piE + MODEL.kappa * gapPct + nu;
}

/* —— 奥肯定律：u = uN − λ·(Y−Y*)/Y* —— */
export function okunU(gapPct, uN) {
  return uN - MODEL.lam * gapPct;
}

/* —— 支出法分解：C + I + G + NX = Y（利用 IS 恒等式与 LM 利率） —— */
export function decompose(Y, r, ex) {
  const m = MODEL;
  const C = ex.a + m.b * (Y - ex.T);
  const I = Math.max(0.1, ex.I0 - m.d * r);
  const NX = ex.NX0;
  /* G 吸收残差，保证恒等成立（教学展示用） */
  const G = Y - C - I - NX;
  return { C: C, I: I, G: G, NX: NX };
}

/* =========================================================
   即时静态求解：外生参数变化后立即重解均衡（不改动状态）
   政策落地 / 事件冲击时调用，用于传导演示与实时反馈
   ========================================================= */
export function solveStatic(st) {
  const ex = buildEx(st);
  const eq = equilibrate(ex);
  const gap = (eq.Y - ex.Ystar) / ex.Ystar * 100;
  const pi = 100 * (eq.P / st.P - 1);
  const u = Math.max(0.5, okunU(gap, st.uN));
  const dec = decompose(eq.Y, eq.r, ex);
  return { Y: eq.Y, r: eq.r, P: eq.P, pi: pi, u: u, gap: gap, dec: dec };
}

/* =========================================================
   季度推进：货币适应增长 → 重解基准均衡 → 预期调整 → 债务核算
   （暂时供给冲击 ν 在此消退，只影响其所在季度的均衡）
   ========================================================= */
export function advanceQuarter(st) {
  /* 0. 央行随通胀预期自动投放货币（匹配货币需求增长，
        否则实际余额侵蚀会让经济无政策时陷入衰退漂移） */
  st.M = st.M * (1 + st.piE / 100);

  /* 1. 新季度基准均衡 */
  const solved = solveStatic(st);

  /* 2. 通胀预期：适应性预期 + 向 2% 目标锚定
        （0.45 惯性 / 0.4 学习 / 0.15 央行信誉锚） */
  const piE = Math.max(-2, 0.45 * st.piE + 0.4 * solved.pi + 0.15 * MODEL.piTarget);

  /* 3. 政府债务：赤字累积（盈余时可部分偿还） */
  let debt = st.debt;
  if (st.G > st.T) debt += (st.G - st.T) * 0.5;
  else debt -= (st.T - st.G) * 0.25;

  Object.assign(st, solved, { piE: piE, debt: debt, nu: 0 });
  return solved;
}

/* —— 评分（雷达图 0-100，四维） —— */
export function computeRadar(st) {
  const growth = clamp(50 + 30 * (st.gap / 3), 5, 100);         // 产出缺口 ±3% 映射满/零
  const price  = clamp(100 - 16 * Math.abs(st.pi - 2), 5, 100); // 通胀偏离 2% 目标
  const job    = clamp(100 - 11 * Math.abs(st.u - st.uN), 5, 100); // 失业偏离自然率
  const ext    = clamp(50 + 14 * st.NX0, 5, 100);               // 净出口水平
  return { growth: growth, price: price, job: job, ext: ext };
}

export function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

/**
 * 多人博弈游戏 · 核心引擎（经济计算 + 通关判定 + 五维评分）
 * -------------------------------------------------
 * 对应需求文档：
 *  4.1 仿真引擎 —— 基于 IS-LM 模型的简化但自洽的数学模型
 *  模块二 阶段5 通关判定 —— GDP 区间 / 过热 / 力度不足 / 挤出效应
 *  模块二 综合评分雷达图 —— GDP恢复度、失业率控制、通胀控制、债务可持续性、政策协调度
 *
 * 经济映射口径（教学化简化，方向正确优先）：
 *  - 基线参数下均衡产出 = 潜在产出 Y_pot，对应潜在增速 6%（中国情境）
 *  - 产出缺口 gap = (Y - Y_pot) / Y_pot
 *  - GDP增速 g  = 6 + 50 × gap        （百分点）
 *  - 失业率  u  = 5 + 0.5 × (6 - g)   （奥肯定律，自然失业率 5%）
 *  - 通胀率  π  = 2 + 50 × gap        （总需求拉动，目标通胀 2%）
 *  - 利率    r* 由 IS-LM 求解器内生决定
 */
import { calcIslmCurves } from './islmSolver.js'

/* ==================== 一、基准参数与边界 ==================== */

/* 基线参数（万亿元）：该组合下均衡 Y* ≈ 320、r* ≈ 5%，
 * 作为"潜在产出"状态。初始事件冲击后 Y 降至约 300（GDP 增速约 2.9%） */
export const BASE_PARAMS = {
  C0: 50,    // 自发消费
  c: 0.75,   // 边际消费倾向 MPC
  I0: 40,    // 自发投资
  d: 500,    // 投资利率敏感度
  G: 45,     // 政府支出
  T: 40,     // 税收（总量）
  NX: 0,     // 净出口
  MP: 156,   // 实际货币供给
  k: 0.8,    // 货币需求收入敏感度
  h: 2000    // 货币投机需求系数
}

/* 潜在产出：基线参数的均衡值（启动时计算一次，避免硬编码不一致） */
const BASE_RESULT = calcIslmCurves(BASE_PARAMS)
export const Y_POT = BASE_RESULT.equilibrium.Y // ≈ 320

/* 每个角色决策变量的调整范围（防止学生输入极端值把模型打飞）
 * 角色体系（对应教材理论）：
 *  - government 政府（含央行）：财政政策（政府购买/税收/转移支付/公债发行）+ 货币政策 + 对外经济
 *  - bank 银行（商业银行）：准备金管理、信贷决策、流动性管理、负债管理
 *  - enterprise 企业：投资决策、生产决策、融资决策、定价决策
 *  - consumer 消费者（家庭）：消费决策、储蓄决策、金融资产配置、借贷决策
 */
export const DECISION_LIMITS = {
  government: {
    dG:     [-10, 15],    // 政府购买增量（公共工程/政府采购）
    dT:     [-8, 8],      // 税收增量（增税/减税）
    dTr:    [-5, 5],      // 转移支付增量（社保/补贴）
    dDebt:  [0, 10],      // 公债发行增量（国债/地方债，用于融资支出）
    dMP:    [-30, 40],    // 货币政策：货币供给增量（准备金率/再贴现率/公开市场操作综合）
    dNX:    [-5, 5]       // 对外经济：汇率/关税/贸易政策对净出口的影响
  },
  bank: {
    dReserve:   [-6, 6],   // 准备金管理：超额准备金变动（多留=紧，少留=松）
    dCredit:    [-12, 15], // 信贷决策：信贷投放规模变动（信用扩张创造存款货币）
    dLiquidity: [-8, 8],   // 流动性管理：向央行再贴现/公开市场买卖净额
    dDeposit:   [-3, 3]    // 负债管理：存款利率变动（影响居民储蓄与企业融资成本）
  },
  enterprise: {
    dI0:     [-12, 12],    // 投资决策：自发投资增量（厂房/设备/存货/研发技改）
    dLabor:  [-5, 5],      // 生产决策：劳动力雇佣变动（影响工资收入→消费）
    dFinance: [-6, 6],     // 融资决策：直接融资（股票/债券）净额，补充投资资金
    dPrice:  [-3, 3]       // 定价决策：提价（+）压销量转出口，降价（-）促销
  },
  consumer: {
    dC0:    [-6, 6],       // 消费决策：自发消费增量（衣食住行/耐用品/服务）
    dSave:  [-5, 5],       // 储蓄决策：储蓄变动（+多储蓄少消费，-少储蓄多消费）
    dAsset: [-5, 5],       // 金融资产配置：股票/基金/债券/保险配置变动（财富效应）
    dBorrow: [-5, 5]       // 借贷决策：房贷/车贷/消费贷净变动（跨期消费）
  }
}

/* 参数安全边界（累计调整后的最终落点范围） */
const PARAM_BOUNDS = {
  G: [20, 120], T: [20, 80], MP: [80, 300],
  I0: [10, 80], c: [0.5, 0.95], C0: [20, 90], NX: [-20, 10],
  d: [200, 900], k: [0.5, 1.1], h: [800, 4000]
}

/** 把数值夹在 [min, max] 区间内 */
function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v))
}

/** 对单个参数做边界保护 */
function clampParam(key, value) {
  const bound = PARAM_BOUNDS[key]
  if (!bound) return value
  return clamp(value, bound[0], bound[1])
}

/* ==================== 二、经济指标计算 ==================== */

/**
 * 给定 IS-LM 参数，计算游戏仪表盘指标
 * @returns {{Y, r, g, u, pi, gap, valid, reason?}} g/u/pi 均为百分点数值
 */
export function computeMetrics(params) {
  const result = calcIslmCurves(params)
  if (!result.valid) {
    return { valid: false, reason: result.reason, Y: 0, r: 0, g: 0, u: 0, pi: 0, gap: 0 }
  }
  const { Y, r } = result.equilibrium
  const gap = (Y - Y_POT) / Y_POT       // 产出缺口（相对潜在产出）
  const g = 6 + 50 * gap                // GDP增速（%）
  const u = 5 + 0.5 * (6 - g)           // 失业率（%，奥肯定律）
  const pi = 2 + 50 * gap              // 通胀率（%，需求拉动口径）
  return { valid: true, Y, r, g, u, pi, gap }
}

/**
 * 应用一次角色决策到参数上（含边界保护）
 * @param {Object} params   当前参数（返回新对象）
 * @param {string} role     government / bank / enterprise / consumer
 * @param {Object} changes  该角色的决策增量（键名见 DECISION_LIMITS）
 *
 * 教学化映射口径（方向正确优先）：
 *  - 政府：G/T 直接进入总需求；转移支付 dTr 影响居民可支配收入→自发消费 C0；
 *          公债发行 dDebt 融资政府购买（同时计入债务，终局算债务可持续性）；
 *          dMP 影响实际货币供给；dNX 为汇率/关税/贸易政策的净出口效果
 *  - 银行：信贷扩张 dCredit 与流动性投放 dLiquidity 通过信用创造放大货币（MP），
 *          并部分转化为企业可贷资金（I0）；超额准备金 dReserve 反向收紧信用；
 *          存款利率 dDeposit 上调吸引储蓄（c 降）并抬高企业融资成本（I0 降）
 *  - 企业：投资 dI0 与融资 dFinance 拉升自发投资；雇佣 dLabor 增加工资收入→消费 C0；
 *          定价 dPrice 提价压内销（C0）但改善出口竞争力（NX）
 *  - 消费者：dC0 直接改变自发消费；dSave 与 dC0 反向（多储蓄=少消费）影响 c；
 *          金融资产配置 dAsset 通过财富效应影响消费；借贷 dBorrow 支持跨期消费（C0）
 */
export function applyDecision(params, role, changes) {
  const p = { ...params }
  const L = DECISION_LIMITS[role] || {}
  const safe = {}
  for (const [key, [min, max]] of Object.entries(L)) {
    const v = Number(changes[key]) || 0
    safe[key] = clamp(v, min, max)
  }

  if (role === 'government') {
    p.G = clampParam('G', p.G + (safe.dG || 0) + (safe.dDebt || 0))   // 公债融资扩大政府购买
    p.T = clampParam('T', p.T + (safe.dT || 0))
    p.C0 = clampParam('C0', p.C0 + (safe.dTr || 0) * 0.8)             // 转移支付→居民收入→消费（MPC<1）
    p.MP = clampParam('MP', p.MP + (safe.dMP || 0))
    p.NX = clampParam('NX', p.NX + (safe.dNX || 0))
  } else if (role === 'bank') {
    /* 信用创造：信贷投放+流动性投放放大货币供给；超额准备金反向锁定流动性 */
    const creditExpansion = (safe.dCredit || 0) + (safe.dLiquidity || 0) - (safe.dReserve || 0)
    p.MP = clampParam('MP', p.MP + creditExpansion * 1.2)             // 货币乘数≈1.2（教学简化）
    p.I0 = clampParam('I0', p.I0 + creditExpansion * 0.4)             // 部分信贷转化为企业投资
    /* 存款利率上调：吸引储蓄（c 降）+ 抬高融资成本（I0 降） */
    p.c = clampParam('c', +(p.c - (safe.dDeposit || 0) * 0.01).toFixed(4))
    p.I0 = clampParam('I0', p.I0 - (safe.dDeposit || 0) * 1.5)
  } else if (role === 'enterprise') {
    p.I0 = clampParam('I0', p.I0 + (safe.dI0 || 0) + (safe.dFinance || 0))
    p.C0 = clampParam('C0', p.C0 + (safe.dLabor || 0) * 0.7)          // 工资收入→居民消费
    p.C0 = clampParam('C0', p.C0 - (safe.dPrice || 0) * 1.0)          // 提价抑制消费
    p.NX = clampParam('NX', p.NX + (safe.dPrice || 0) * 0.5)          // 提价削弱出口竞争力（负向）
  } else if (role === 'consumer') {
    p.C0 = clampParam('C0', p.C0 + (safe.dC0 || 0) + (safe.dAsset || 0) * 0.5 + (safe.dBorrow || 0) * 0.6)
    /* 储蓄决策：多储蓄=少消费，直接压低边际消费倾向 */
    p.c = clampParam('c', +(p.c - (safe.dSave || 0) * 0.008).toFixed(4))
  }
  return p
}

/** 应用事件冲击（就地修改副本，返回新对象） */
export function applyShock(params, shock) {
  const p = { ...params }
  for (const [key, delta] of Object.entries(shock || {})) {
    p[key] = clampParam(key, +(p[key] + delta).toFixed(4))
  }
  return p
}

/* ==================== 三、通关判定（阶段5） ==================== */

/**
 * 通关判定：对最后一回合指标给出结论
 * 口径与需求文档一致：
 *  - GDP增速回到 5.5% ~ 6.5%   → 通关
 *  - GDP 恢复但通胀超过 5%       → 过热，扣分
 *  - GDP 仍低于 4%              → 未通关："政策力度不足"
 *  - 利率飙升至 8% 以上          → 未通关："挤出效应严重"
 */
export function judgeVerdict(metrics, finalRound = true) {
  const { g, pi, r } = metrics
  if (r > 0.08) {
    return { passed: false, title: '未通关 · 挤出效应严重', detail: `利率已升至 ${(r * 100).toFixed(1)}%，私人投资被大幅挤出，财政扩张得不偿失。`, type: 'crowd' }
  }
  if (g >= 5.5 && g <= 6.5) {
    if (pi > 5) {
      return { passed: false, title: '过热 · 通胀超标', detail: `GDP 增速已恢复至 ${g.toFixed(1)}%，但通胀达 ${pi.toFixed(1)}%（>5%），经济过热，需要扣分。`, type: 'overheat' }
    }
    return { passed: true, title: '通关成功！', detail: `GDP 增速 ${g.toFixed(1)}% 回到目标区间（5.5%~6.5%），通胀 ${pi.toFixed(1)}%，经济重回良性轨道。`, type: 'pass' }
  }
  if (g > 6.5) {
    return { passed: false, title: '过热 · 增速超标', detail: `GDP 增速 ${g.toFixed(1)}% 超过潜在水平，需求拉动通胀压力增大（当前通胀 ${pi.toFixed(1)}%）。`, type: 'overheat' }
  }
  if (g < 4) {
    return { passed: finalRound ? false : null, title: finalRound ? '未通关 · 政策力度不足' : '经济仍然偏冷', detail: `GDP 增速仅 ${g.toFixed(1)}%，仍低于 4%，${finalRound ? '政策组合力度不足，总需求未有效恢复。' : '还需更大力度的扩张性政策组合。'}`, type: 'weak' }
  }
  return {
    passed: finalRound ? false : null,
    title: finalRound ? '未通关 · 接近目标' : '接近目标区间',
    detail: `GDP 增速 ${g.toFixed(1)}%，距 5.5%~6.5% 目标区间还有距离，${finalRound ? '差一步之遥。' : '继续保持适度扩张。'}`,
    type: 'near'
  }
}

/* ==================== 四、五维雷达评分（终局） ==================== */

/**
 * 计算综合评分雷达图五维得分（0~100）
 * @param {Array} roundHistory 每回合 { params, metrics, decisions }
 * @returns {{gdpRecovery, unemployment, inflation, debt, coordination, total}}
 */
export function computeRadar(roundHistory) {
  const last = roundHistory[roundHistory.length - 1]
  const m = last.metrics

  /* 1. GDP恢复度：终局产出缺口越小越好（|gap|=1% 扣 8 分） */
  const gdpRecovery = clamp(100 - Math.abs(m.gap) * 100 * 8, 0, 100)

  /* 2. 失业率控制：|u - 5%| 每高 1 个百分点扣 20 分 */
  const unemployment = clamp(100 - Math.abs(m.u - 5) * 20, 0, 100)

  /* 3. 通胀控制：|π - 2%| 每高 1 个百分点扣 15 分 */
  const inflation = clamp(100 - Math.abs(m.pi - 2) * 15, 0, 100)

  /* 4. 债务可持续性：累计新增国债 / 潜在产出，债务率每 1% 扣 1.5 分 */
  const debtRate = (last.debtTotal || 0) / Y_POT
  const debt = clamp(100 - debtRate * 100 * 1.5, 0, 100)

  /* 5. 政策协调度：每回合政府财政方向（dG+dDebt-dT）与货币政策方向（dMP）同号记 1 次协调；
   *    银行信贷方向（dCredit+dLiquidity-dReserve）与政府/央行政策方向一致也计入 */
  let coord = 0
  let pairs = 0
  for (const h of roundHistory) {
    const gov = h.decisions?.government || {}
    const bak = h.decisions?.bank || {}
    const fisDir = ((gov.dG || 0) + (gov.dDebt || 0) - (gov.dT || 0))
    const monDir = (gov.dMP || 0)
    const creditDir = ((bak.dCredit || 0) + (bak.dLiquidity || 0) - (bak.dReserve || 0))
    if (Math.abs(fisDir) < 1e-9 && Math.abs(monDir) < 1e-9 && Math.abs(creditDir) < 1e-9) continue
    pairs++
    /* 三方（财政/货币/信贷）方向一致或互不冲突（0 视为不冲突）记协调 */
    const dirs = [fisDir, monDir, creditDir].filter(d => Math.abs(d) >= 1e-9)
    const sameSign = dirs.every(d => d > 0) || dirs.every(d => d < 0)
    if (sameSign || dirs.length <= 1) coord++
  }
  const coordination = pairs ? Math.round((coord / pairs) * 100) : 80

  /* 总分：五维加权平均 */
  const total = Math.round((gdpRecovery + unemployment + inflation + debt + coordination) / 5)

  return {
    gdpRecovery: +gdpRecovery.toFixed(1),
    unemployment: +unemployment.toFixed(1),
    inflation: +inflation.toFixed(1),
    debt: +debt.toFixed(1),
    coordination,
    total,
    debtRate: +(debtRate * 100).toFixed(1) // 债务率（%），报告展示用
  }
}

/* ==================== 五、曲线数据（前端画图） ==================== */

/** 计算当前参数的 IS/LM 曲线点集 + 均衡点（前端 ECharts 直接可用） */
export function computeCurves(params) {
  const result = calcIslmCurves(params)
  if (!result.valid) return null
  return {
    isCurve: result.isCurve,
    lmCurve: result.lmCurve,
    equilibrium: result.equilibrium
  }
}

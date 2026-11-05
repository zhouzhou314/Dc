/**
 * IS-LM 服务端求解器（从前端 utils/islmCalc.js 移植核心数学部分）
 * -------------------------------------------------
 * 用途：
 *  1. REST 接口 /api/islm/simulate、/api/islm/compare 的计算后端
 *     （补齐前端 api/islm.js 注释里预留的"正式接口"）
 *  2. Function Calling 智能体的 islm_solve 工具（AI 助手算 IS-LM 用）
 */

/**
 * 根据一组 IS-LM 参数计算曲线数据点与均衡点
 * @param {Object} p - {C0, c, I0, d, G, T, NX, MP, k, h}，NX 为净出口（可选，默认 0，
 *                    多人博弈游戏用 NX 模拟"出口订单下降"等外部冲击）
 * @returns {Object} { valid, isCurve, lmCurve, equilibrium, alphaIS, betaIS, alphaLM, betaLM, reason }
 */
export function calcIslmCurves(p) {
  const { C0, c, I0, d, G, T, MP, k, h } = p
  const NX = Number.isFinite(p.NX) ? p.NX : 0

  /* 经济意义校验：关键系数必须为正，c < 1 */
  if (d <= 0) return { valid: false, reason: '投资利率敏感度 d 必须大于 0' }
  if (h <= 0) return { valid: false, reason: '投机需求系数 h 必须大于 0' }
  if (k <= 0) return { valid: false, reason: '交易需求系数 k 必须大于 0' }
  if (c >= 1) return { valid: false, reason: '边际消费倾向 c 必须小于 1' }

  /* IS 曲线：r = α_IS - β_IS·Y（产品市场均衡，含净出口 NX） */
  const alphaIS = (C0 + I0 + G + NX - c * T) / d
  const betaIS = (1 - c) / d

  /* LM 曲线：r = β_LM·Y - α_LM（货币市场均衡） */
  const betaLM = k / h
  const alphaLM = MP / h

  /* 联立求解：Y* = (α_IS + α_LM) / (β_IS + β_LM) */
  const denom = betaIS + betaLM
  if (denom <= 0) return { valid: false, reason: '参数组合导致分母为0，请检查' }
  const Ystar = (alphaIS + alphaLM) / denom
  const rstar = betaLM * Ystar - alphaLM

  /* 均衡有效性：产出为正、利率非负（负利率即流动性陷阱区域） */
  if (Ystar <= 0) return { valid: false, reason: '均衡产出 Y* 为负，参数无效', Ystar, rstar }
  if (rstar < 0) return { valid: false, reason: '均衡利率 r* 为负（流动性陷阱区域），请调整参数', Ystar, rstar }

  /* 生成曲线绘图点（以均衡点为中心向两侧扩展 120 步） */
  const yMin = Math.max(0, Ystar * 0.2)
  const yMax = Ystar * 2.0
  const steps = 120
  const step = (yMax - yMin) / steps
  const isCurve = []
  const lmCurve = []
  for (let i = 0; i <= steps; i++) {
    const Y = yMin + i * step
    isCurve.push([+Y.toFixed(2), +(alphaIS - betaIS * Y).toFixed(6)])
    lmCurve.push([+Y.toFixed(2), +(betaLM * Y - alphaLM).toFixed(6)])
  }

  return {
    valid: true,
    isCurve,
    lmCurve,
    equilibrium: { Y: +Ystar.toFixed(2), r: +rstar.toFixed(6) },
    alphaIS, betaIS, alphaLM, betaLM
  }
}

/**
 * 生成经济学解读文本（均衡结果 + 政策含义 + 可选对比分析）
 */
export function generateAnalysisNote(p, result, compareResult = null) {
  if (!result.valid) {
    return '⚠️ 参数无效：' + (result.reason || '请检查输入参数是否合理')
  }
  const { Y, r } = result.equilibrium
  let note = '【均衡结果】\n'
  note += `  均衡产出 Y* = ${Y.toFixed(2)}\n`
  note += `  均衡利率 r* = ${(r * 100).toFixed(2)}%\n\n`

  note += '【模型解读】\n'
  note += '  在当前参数下，产品市场（IS）与货币市场（LM）同时达到均衡。\n'
  note += `  IS 曲线斜率（绝对值）= ${result.betaIS.toFixed(6)}（投资对利率越敏感 d 越大，IS 越平缓）\n`
  note += `  LM 曲线斜率 = ${result.betaLM.toFixed(6)}（货币投机需求 h 越大，LM 越平缓）\n\n`

  const multiplier = 1 / (1 - p.c)
  note += '【财政政策提示】\n'
  note += `  简单政府支出乘数 = 1/(1-c) = ${multiplier.toFixed(2)}\n`
  note += '  增加政府支出 G 会推动 IS 曲线右移；在 LM 不变时，均衡产出与利率均上升（存在挤出效应）。\n\n'

  note += '【货币政策提示】\n'
  note += '  增加实际货币供给 M/P 会推动 LM 曲线右移，均衡产出上升、均衡利率下降。\n'

  if (compareResult && compareResult.valid) {
    const Y2 = compareResult.equilibrium.Y
    const r2 = compareResult.equilibrium.r
    const dY = Y2 - Y
    const dr = r2 - r
    note += '\n【对比分析（基准 → 冲击后）】\n'
    note += `  冲击后均衡产出 Y*' = ${Y2.toFixed(2)}（变化 ${dY >= 0 ? '+' : ''}${dY.toFixed(2)}）\n`
    note += `  冲击后均衡利率 r*' = ${(r2 * 100).toFixed(2)}%（变化 ${(dr * 100).toFixed(2)} 个百分点）\n`
    if (dY > 0 && dr < -0.001) note += '  → 产出增加、利率下降，典型的扩张性货币政策效果（LM 右移）。\n'
    else if (dY > 0 && dr > 0.001) note += '  → 产出增加、利率上升，典型的扩张性财政政策效果（IS 右移，存在挤出效应）。\n'
    else if (dY < 0 && dr > 0.001) note += '  → 产出减少、利率上升，典型的紧缩性政策效果。\n'
    else if (dY < 0 && dr < -0.001) note += '  → 产出减少、利率下降，IS 左移（财政收缩或信心下降）。\n'
  }

  return note
}

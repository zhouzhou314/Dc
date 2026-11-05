/**
 * IS-LM 模型计算工具（前端模拟计算）
 * -------------------------------------------------
 * ⚠️ 说明：正式生产环境下，数学计算逻辑应由后端接口完成，
 *   前端只负责：1) 发送参数；2) 接收曲线数据点与均衡点；3) ECharts 渲染。
 *   此处前端计算仅用于保证单项目可直接运行、即时看到图形效果。
 */

/**
 * 根据一组 IS-LM 参数计算曲线上的数据点和均衡点
 * @param {Object} p - 参数对象 {C0, c, I0, d, G, T, MP, k, h}
 * @returns {Object} { valid, isCurve, lmCurve, equilibrium, alphaIS, betaIS, alphaLM, betaLM, reason }
 */
export function calcIslmCurves(p) {
  const { C0, c, I0, d, G, T, MP, k, h } = p

  // 校验：关键分母不能为0或负
  if (d <= 0) return { valid: false, reason: '投资利率敏感度 d 必须大于 0' }
  if (h <= 0) return { valid: false, reason: '投机需求系数 h 必须大于 0' }
  if (k <= 0) return { valid: false, reason: '交易需求系数 k 必须大于 0' }
  if (c >= 1) return { valid: false, reason: '边际消费倾向 c 必须小于 1' }

  // IS 曲线：r = α_IS - β_IS · Y
  const alphaIS = (C0 + I0 + G - c * T) / d
  const betaIS = (1 - c) / d

  // LM 曲线：r = β_LM · Y - α_LM
  const betaLM = k / h
  const alphaLM = MP / h

  // 均衡产出 Y* 与均衡利率 r*
  const denom = betaIS + betaLM
  if (denom <= 0) return { valid: false, reason: '参数组合导致分母为0，请检查' }

  const Ystar = (alphaIS + alphaLM) / denom
  const rstar = betaLM * Ystar - alphaLM

  // 校验：均衡值须为正（利率、产出小于0视为无效）
  if (Ystar <= 0) {
    return { valid: false, reason: '均衡产出 Y* 为负，参数无效', Ystar, rstar }
  }
  if (rstar < 0) {
    return { valid: false, reason: '均衡利率 r* 为负（流动性陷阱区域），请调整参数', Ystar, rstar }
  }

  // 生成曲线绘图点（以均衡点为中心，向两侧扩展）
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
 * 根据参数和均衡结果生成经济学分析文本
 * （正式环境由后端返回 note 字段，此处仅为前端模拟演示）
 */
export function generateAnalysisNote(p, result, compareResult = null) {
  if (!result.valid) {
    return '⚠️ 参数无效：' + (result.reason || '请检查输入参数是否合理')
  }
  const { Y, r } = result.equilibrium
  let note = '【均衡结果】\n'
  note += '  均衡产出 Y* = ' + Y.toFixed(2) + '\n'
  note += '  均衡利率 r* = ' + (r * 100).toFixed(2) + '%\n\n'

  note += '【模型解读】\n'
  note += '  在当前参数下，产品市场（IS）与货币市场（LM）同时达到均衡。\n'
  note += '  IS 曲线斜率（绝对值）= ' + result.betaIS.toFixed(6) + '（投资对利率越敏感 d 越大，IS 越平缓）\n'
  note += '  LM 曲线斜率 = ' + result.betaLM.toFixed(6) + '（货币投机需求 h 越大，LM 越平缓）\n\n'

  const multiplier = 1 / (1 - p.c)
  note += '【财政政策提示】\n'
  note += '  简单政府支出乘数 = 1/(1-c) = ' + multiplier.toFixed(2) + '\n'
  note += '  增加政府支出 G 会推动 IS 曲线右移；在 LM 不变时，均衡产出与利率均上升（存在挤出效应）。\n'
  note += '  减税 T 下降同样推动 IS 右移，效果类似增加政府支出。\n\n'

  note += '【货币政策提示】\n'
  note += '  增加实际货币供给 M/P 会推动 LM 曲线右移，均衡产出上升、均衡利率下降。\n'
  note += '  LM 越平缓（h 越大），货币政策效果越弱；IS 越平缓（d 越大），货币政策效果越强。\n'

  if (compareResult && compareResult.valid) {
    const Y2 = compareResult.equilibrium.Y
    const r2 = compareResult.equilibrium.r
    const dY = Y2 - Y
    const dr = r2 - r
    note += '\n【对比分析（基准 → 冲击后）】\n'
    note += '  冲击后均衡产出 Y*\' = ' + Y2.toFixed(2) + '（变化 ' + (dY >= 0 ? '+' : '') + dY.toFixed(2) + '）\n'
    note += '  冲击后均衡利率 r*\' = ' + (r2 * 100).toFixed(2) + '%（变化 ' + (dr * 100).toFixed(2) + ' 个百分点）\n'
    if (dY > 0 && dr < -0.001) {
      note += '  → 产出显著增加、利率明显下降，典型的扩张性货币政策效果（LM 右移）。\n'
    } else if (dY > 0 && dr > 0.001) {
      note += '  → 产出增加、利率上升，典型的扩张性财政政策效果（IS 右移，存在挤出效应）。\n'
    } else if (dY > 0 && Math.abs(dr) <= 0.001) {
      note += '  → 产出增加而利率基本不变，接近"财政扩张配合适应性货币投放"的组合效果。\n'
    } else if (dY < 0 && dr > 0.001) {
      note += '  → 产出减少、利率上升，典型的紧缩性政策效果（IS 左移或 LM 左移）。\n'
    } else if (dY < 0 && dr < -0.001) {
      note += '  → 产出减少、利率下降，财政收缩或投资/消费信心下降导致 IS 左移。\n'
    } else {
      note += '  → 请结合参数变化方向观察曲线平移方向与均衡点移动。\n'
    }
  }

  return note
}

/**
 * 参数校验（非负校验 + 经济意义校验）
 * @param {Object} p 参数对象
 * @param {string} [label] 分组名称（用于提示前缀）
 * @returns {boolean}
 */
export function validateParams(p, label) {
  const prefix = label ? label + '：' : ''
  const fields = [
    { key: 'C0', name: 'C₀（自主消费）' },
    { key: 'c', name: 'c（边际消费倾向）' },
    { key: 'I0', name: 'I₀（自主投资）' },
    { key: 'd', name: 'd（投资利率敏感度）' },
    { key: 'G', name: 'G（政府支出）' },
    { key: 'T', name: 'T（税收）' },
    { key: 'MP', name: 'M/P（实际货币供给）' },
    { key: 'k', name: 'k（交易需求系数）' },
    { key: 'h', name: 'h（投机需求系数）' }
  ]
  for (const f of fields) {
    if (p[f.key] === null || p[f.key] === undefined || p[f.key] < 0) {
      return { valid: false, message: prefix + f.name + ' 不能为负数，请检查输入' }
    }
  }
  if (p.c >= 1) return { valid: false, message: prefix + '边际消费倾向 c 必须小于 1' }
  if (p.d <= 0) return { valid: false, message: prefix + '投资利率敏感度 d 必须大于 0' }
  if (p.h <= 0) return { valid: false, message: prefix + '投机需求系数 h 必须大于 0' }
  if (p.k <= 0) return { valid: false, message: prefix + '交易需求系数 k 必须大于 0' }
  return { valid: true }
}

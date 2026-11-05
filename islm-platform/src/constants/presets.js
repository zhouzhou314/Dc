/**
 * 预制案例参数常量
 * 线性 IS-LM 模型：
 *   IS 曲线：Y = C0 + c(Y-T) + I0 - d·r + G
 *          => r = (C0 + I0 + G - c·T)/d - (1-c)/d · Y
 *   LM 曲线：M/P = k·Y - h·r
 *          => r = (k·Y - M/P)/h
 * 均衡条件：IS = LM，解出 Y*、r*
 */

export const DEFAULT_PARAMS = {
  C0: 100, // 自主消费
  c: 0.8, // 边际消费倾向
  I0: 200, // 自主投资
  d: 2000, // 投资利率敏感度
  G: 100, // 政府支出
  T: 50, // 税收
  MP: 200, // 实际货币供给
  k: 0.2, // 交易需求系数
  h: 1000 // 投机需求系数
}

export const PRESET_CASES = {
  baseline: {
    label: '基准均衡情景',
    params: { ...DEFAULT_PARAMS }
  },
  fiscalExpand: {
    label: '财政扩张（G↑）',
    params: { ...DEFAULT_PARAMS, G: 150 }
  },
  fiscalContract: {
    label: '财政收缩（G↓）',
    params: { ...DEFAULT_PARAMS, G: 50 }
  },
  monetaryExpand: {
    label: '货币扩张（M/P↑）',
    params: { ...DEFAULT_PARAMS, MP: 300 }
  },
  mixedPolicy: {
    label: '混合政策（G↑+M/P↑）',
    params: { ...DEFAULT_PARAMS, G: 150, MP: 300 }
  }
}

export const presetOptions = Object.keys(PRESET_CASES).map(key => ({
  value: key,
  label: PRESET_CASES[key].label
}))

// 参数表单字段配置（用于循环渲染，减少模板重复）
export const PARAM_FIELDS = [
  { key: 'C0', label: 'C₀（自主消费）', step: 10, precision: 2, min: 0 },
  { key: 'c', label: 'c（边际消费倾向）', step: 0.05, precision: 4, min: 0, max: 0.9999 },
  { key: 'I0', label: 'I₀（自主投资）', step: 10, precision: 2, min: 0 },
  { key: 'd', label: 'd（投资利率敏感度）', step: 100, precision: 2, min: 0.01 },
  { key: 'G', label: 'G（政府支出）', step: 10, precision: 2, min: 0 },
  { key: 'T', label: 'T（税收）', step: 10, precision: 2, min: 0 },
  { key: 'MP', label: 'M/P（实际货币供给）', step: 50, precision: 2, min: 0 },
  { key: 'k', label: 'k（交易需求系数）', step: 0.05, precision: 4, min: 0.0001 },
  { key: 'h', label: 'h（投机需求系数）', step: 100, precision: 2, min: 0.01 }
]

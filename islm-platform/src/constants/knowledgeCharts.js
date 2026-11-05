/**
 * 知识点图示配置工厂（V4.1 辅助学习系统）
 * 为每个知识点提供静态经济学示意图（ECharts option）
 *
 * 图型索引：
 *   isInvestment     投资需求函数 i = e − dr
 *   isDerive45       45°线推导：利率↑ → 计划支出↓ → 收入↓
 *   isRegions        IS曲线及其两侧失衡区域
 *   isShift          IS曲线的移动（财政扩张 → 右移）
 *   moneyMarket      货币供求决定利率 + 流动性陷阱
 *   lmCurve          LM曲线的三个区域
 *   lmShift          LM曲线的移动（货币扩张 → 右移）
 *   islmEquilibrium  IS-LM共同均衡 + 四大失衡区域
 *   extremes         两个极端情形（凯恩斯极端 / 流动性陷阱）
 *   policyMix        财政+货币政策配合（双右移）
 */

/* ---------- 公共坐标轴配置 ---------- */
function baseOption({ xName, yName, yPercent = true, xMax, yMax, legend = null, top = '10%' }) {
  const opt = {
    animation: true,
    tooltip: { trigger: 'item' },
    grid: { left: '11%', right: '7%', bottom: '13%', top },
    xAxis: {
      type: 'value', name: xName, nameLocation: 'middle', nameGap: 30, min: 0, max: xMax,
      nameTextStyle: { fontSize: 13, fontWeight: 'bold', color: '#303133' },
      axisLabel: { fontSize: 11 }
    },
    yAxis: {
      type: 'value', name: yName, nameLocation: 'middle', nameGap: 52, min: 0, max: yMax,
      nameTextStyle: { fontSize: 13, fontWeight: 'bold', color: '#303133' },
      axisLabel: {
        fontSize: 11,
        formatter: yPercent ? v => (v * 100).toFixed(0) + '%' : '{value}'
      }
    }
  }
  if (legend) {
    opt.legend = { data: legend, top: 4, textStyle: { fontSize: 11 } }
    opt.grid.top = '20%'
  }
  return opt
}

/* 直线 series 快捷构造 */
function line(name, data, color, extra = {}) {
  return {
    name, type: 'line', data, symbol: 'none',
    lineStyle: { color, width: 2.5 }, itemStyle: { color }, ...extra
  }
}
/* 均衡点 series */
function point(name, xy, color, pos = 'top') {
  return {
    name, type: 'scatter', data: [xy], symbolSize: 13, z: 10,
    itemStyle: { color, borderColor: '#fff', borderWidth: 2 },
    label: { show: true, position: pos, formatter: name, color, fontWeight: 'bold', fontSize: 12 }
  }
}
/* 区域说明文本 */
function tag(name, xy, color = '#606266') {
  return {
    name, type: 'scatter', data: [xy], symbolSize: 1,
    itemStyle: { color: 'transparent' },
    label: { show: true, position: 'inside', formatter: name, color, fontSize: 12, fontWeight: 'bold' }
  }
}

/* ---------- 1. 投资需求函数 ---------- */
function makeIsInvestment() {
  return {
    ...baseOption({ xName: '投资 i', yName: '利率 r', xMax: 220, yMax: 0.12 }),
    series: [
      line('投资需求 i = e − dr', [[0, 0.1], [100, 0.05], [200, 0]], '#409EFF'),
      point('A(100, 5%)', [100, 0.05], '#F56C6C', 'right'),
      tag('利率↑ → 投资↓（反向变动）', [70, 0.085], '#3a4a8c')
    ]
  }
}

/* ---------- 2. 45°线推导图 ---------- */
function makeIsDerive45() {
  return {
    ...baseOption({ xName: '国民收入 y', yName: '计划支出 E', yPercent: false, xMax: 1300, yMax: 1300, legend: ['45°线', 'E₁（r=5%）', 'E₂（r=10%）'] }),
    series: [
      line('45°线', [[0, 0], [1250, 1250]], '#909399', { lineStyle: { type: 'dashed', width: 2 } }),
      line('E₁（r=5%）', [[0, 200], [1250, 1200]], '#409EFF'),
      line('E₂（r=10%）', [[0, 100], [1250, 1100]], '#1D6FCC', { lineStyle: { type: 'dashed' } }),
      point('E₁：y=1000', [1000, 1000], '#409EFF', 'right'),
      point('E₂：y=500', [500, 500], '#1D6FCC', 'right'),
      tag('r: 5%→10% 使投资 i: 100→0，支出线下移，均衡收入 1000→500', [180, 1150], '#3a4a8c')
    ]
  }
}

/* ---------- 3. IS曲线与失衡区域 ---------- */
function makeIsRegions() {
  return {
    ...baseOption({ xName: '国民收入 y', yName: '利率 r', xMax: 1900, yMax: 0.2 }),
    series: [
      line('IS曲线', [[0, 0.18], [1800, 0]], '#409EFF'),
      point('IS', [900, 0.09], '#F56C6C', 'left'),
      tag('IS右侧：i＜s（利率过高，投资<储蓄）', [1050, 0.135], '#c0392b'),
      tag('IS左侧：i＞s（利率过低，投资>储蓄）', [260, 0.028], '#27ae60')
    ]
  }
}

/* ---------- 4. IS曲线的移动 ---------- */
function makeIsShift() {
  return {
    ...baseOption({ xName: '国民收入 y', yName: '利率 r', xMax: 2400, yMax: 0.3, legend: ['IS（G=100）', "IS′（G=200）", 'LM（不变）'] }),
    series: [
      line('IS（G=100）', [[0, 0.18], [1800, 0]], '#A0CFFF', { lineStyle: { width: 2 } }),
      line("IS′（G=200）", [[0, 0.23], [2300, 0]], '#1D6FCC'),
      line('LM（不变）', [[1000, 0], [2400, 0.28]], '#E6A23C'),
      point('E₀', [1266.67, 0.0533], '#909399', 'left'),
      point('E₁', [1433.33, 0.0867], '#F56C6C', 'left'),
      tag('G↑ → IS右移：Y↑ 且 r↑（存在挤出效应）', [1450, 0.21], '#3a4a8c')
    ]
  }
}

/* ---------- 5. 货币供求决定利率 + 流动性陷阱 ---------- */
function makeMoneyMarket() {
  return {
    ...baseOption({ xName: '货币量 L / m', yName: '利率 r', xMax: 440, yMax: 0.11, legend: ['货币需求 L₂', '货币供给 m₁', '货币供给 m₂'] }),
    series: [
      line('货币需求 L₂', [[0, 0.1], [60, 0.08], [120, 0.06], [180, 0.04], [240, 0.02], [420, 0.02]], '#409EFF'),
      line('货币供给 m₁', [[180, 0], [180, 0.1]], '#E6A23C', { lineStyle: { width: 2.5 } }),
      line('货币供给 m₂', [[300, 0], [300, 0.1]], '#CF7A00', { lineStyle: { width: 2.5 } }),
      point('r₀=4%', [180, 0.04], '#F56C6C', 'left'),
      point('r₁=2%', [300, 0.02], '#F56C6C', 'top'),
      tag('流动性陷阱区：m₂继续扩大，r 不再下降', [330, 0.045], '#c0392b')
    ]
  }
}

/* ---------- 6. LM曲线三个区域 ---------- */
function makeLmCurve() {
  return {
    ...baseOption({ xName: '国民收入 y', yName: '利率 r', xMax: 2000, yMax: 0.32 }),
    series: [
      line('LM曲线', [[0, 0.02], [600, 0.02], [1600, 0.22], [1600, 0.3]], '#E6A23C'),
      point('LM', [1100, 0.12], '#F56C6C', 'left'),
      tag('凯恩斯区域（水平，h→∞）', [150, 0.045], '#c0392b'),
      tag('中间区域（斜率 k/h＞0）', [880, 0.09], '#3a4a8c'),
      tag('古典区域（垂直，h→0）', [1660, 0.255], '#27ae60')
    ]
  }
}

/* ---------- 7. LM曲线的移动 ---------- */
function makeLmShift() {
  return {
    ...baseOption({ xName: '国民收入 y', yName: '利率 r', xMax: 2400, yMax: 0.24, legend: ['IS（不变）', 'LM（M/P=200）', "LM′（M/P=300）"] }),
    series: [
      line('IS（不变）', [[0, 0.18], [1800, 0]], '#409EFF'),
      line('LM（M/P=200）', [[1000, 0], [2000, 0.2]], '#F5D090', { lineStyle: { width: 2 } }),
      line("LM′（M/P=300）", [[1500, 0], [2200, 0.14]], '#CF7A00'),
      point('E₀', [1266.67, 0.0533], '#909399', 'left'),
      point('E₁', [1600, 0.02], '#F56C6C', 'left'),
      tag('M/P↑ → LM右移：Y↑ 且 r↓', [1750, 0.19], '#3a4a8c')
    ]
  }
}

/* ---------- 8. IS-LM共同均衡 + 四大区域 ---------- */
function makeIslmEquilibrium() {
  return {
    ...baseOption({ xName: '国民收入 y', yName: '利率 r', xMax: 2100, yMax: 0.22, legend: ['IS曲线', 'LM曲线'] }),
    series: [
      line('IS曲线', [[0, 0.18], [1800, 0]], '#409EFF'),
      line('LM曲线', [[1000, 0], [2000, 0.2]], '#E6A23C'),
      point('均衡点 E', [1266.67, 0.0533], '#F56C6C', 'left'),
      tag('Ⅰ区：i＜s，L＜M', [560, 0.15], '#909399'),
      tag('Ⅱ区：i＜s，L＞M', [1520, 0.15], '#909399'),
      tag('Ⅲ区：i＞s，L＞M', [1520, 0.018], '#909399'),
      tag('Ⅳ区：i＞s，L＜M', [560, 0.018], '#909399')
    ]
  }
}

/* ---------- 9. 两个极端情形 ---------- */
function makeExtremes() {
  return {
    ...baseOption({ xName: '国民收入 y', yName: '利率 r', xMax: 1900, yMax: 0.18, legend: ['LM（水平）', 'IS（垂直）', "IS′（垂直）"] }),
    series: [
      line('LM（水平）', [[0, 0.03], [1800, 0.03]], '#E6A23C'),
      line('IS（垂直）', [[1200, 0], [1200, 0.15]], '#A0CFFF', { lineStyle: { width: 2 } }),
      line("IS′（垂直）", [[1600, 0], [1600, 0.15]], '#1D6FCC'),
      point('E', [1200, 0.03], '#909399', 'left'),
      point('E₁', [1600, 0.03], '#F56C6C', 'left'),
      tag('凯恩斯极端：IS垂直（d=0）+ LM水平（陷阱）', [170, 0.135], '#3a4a8c'),
      tag('G↑ → Y同幅增加、无挤出，财政十分有效', [330, 0.075], '#c0392b')
    ]
  }
}

/* ---------- 10. 财政+货币政策配合 ---------- */
function makePolicyMix() {
  return {
    ...baseOption({ xName: '国民收入 y', yName: '利率 r', xMax: 2400, yMax: 0.26, legend: ['IS', "IS′", 'LM', "LM′"] }),
    series: [
      line('IS', [[0, 0.18], [1800, 0]], '#A0CFFF', { lineStyle: { width: 2 } }),
      line("IS′", [[0, 0.23], [2300, 0]], '#1D6FCC'),
      line('LM', [[1000, 0], [2000, 0.2]], '#F5D090', { lineStyle: { width: 2 } }),
      line("LM′", [[1500, 0], [2400, 0.18]], '#CF7A00'),
      point('E₀', [1266.67, 0.0533], '#909399', 'left'),
      point('E₁', [1766.67, 0.0533], '#F56C6C', 'left'),
      tag('财政+货币双扩张：IS、LM同时右移 → Y大幅↑，r 基本不变', [1150, 0.225], '#3a4a8c')
    ]
  }
}

/* ---------- 图型注册表 ---------- */
const makers = {
  isInvestment: makeIsInvestment,
  isDerive45: makeIsDerive45,
  isRegions: makeIsRegions,
  isShift: makeIsShift,
  moneyMarket: makeMoneyMarket,
  lmCurve: makeLmCurve,
  lmShift: makeLmShift,
  islmEquilibrium: makeIslmEquilibrium,
  extremes: makeExtremes,
  policyMix: makePolicyMix
}

/**
 * 获取知识点图示的 ECharts 配置
 * @param {string} key 图型 key
 * @returns {Object} ECharts option
 */
export function getKnowledgeChartOption(key) {
  const maker = makers[key]
  return maker ? maker() : makers.islmEquilibrium()
}

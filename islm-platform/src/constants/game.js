/**
 * 多人博弈游戏 · 前端常量
 * -------------------------------------------------
 * 角色元信息（名称/图标/主题色）与决策变量定义，
 * 与后端 gameEngine.DECISION_LIMITS 保持一致（范围/步长）。
 */

/* 四个角色（顺序即轮流决策顺序：政府（含央行） → 银行 → 企业 → 消费者） */
export const ROLES = [
  {
    key: 'government', name: '政府（含央行）', icon: '🏛️', color: '#e6a23c',
    desc: '财政政策：政府购买、税收、转移支付、公债发行；货币政策：准备金率/再贴现/公开市场操作；对外经济：汇率、关税'
  },
  {
    key: 'bank', name: '银行', icon: '🏦', color: '#409eff',
    desc: '金融中介：准备金管理、信贷投放、流动性管理、负债（存款利率）管理'
  },
  {
    key: 'enterprise', name: '企业', icon: '🏭', color: '#67c23a',
    desc: '经营决策：投资（厂房/设备/研发）、生产（雇佣）、融资（股债/贷款）、定价'
  },
  {
    key: 'consumer', name: '消费者', icon: '🧑', color: '#f56c6c',
    desc: '家庭决策：消费支出、储蓄、金融资产配置、借贷（房贷/消费贷）'
  }
]

export const ROLE_MAP = Object.fromEntries(ROLES.map(r => [r.key, r]))

/* 每个角色的决策变量（前端表单用，范围与后端 DECISION_LIMITS 对齐）
 * group 用于面板分组显示（如政府面板分"财政政策/货币政策/对外经济"三组） */
export const DECISION_FIELDS = {
  government: [
    { key: 'dG',     label: '政府购买增量 G',   unit: '万亿元', min: -10, max: 15, step: 1,  group: '财政政策', hint: '公共工程、政府采购。增加=扩张性财政（增发国债用于基建等）' },
    { key: 'dT',     label: '税收增量 T',       unit: '万亿元', min: -8,  max: 8,  step: 1,  group: '财政政策', hint: '减税刺激消费投资，增税紧缩。对应总税收调整' },
    { key: 'dTr',    label: '转移支付增量 Tr',  unit: '万亿元', min: -5,  max: 5,  step: 1,  group: '财政政策', hint: '社保、补贴。增加→居民可支配收入→消费上升' },
    { key: 'dDebt',  label: '公债发行增量',     unit: '万亿元', min: 0,   max: 10, step: 1,  group: '财政政策', hint: '国债/地方债/特别国债，融资政府购买；终局计入债务可持续性' },
    { key: 'dMP',    label: '货币供给增量 M',   unit: '万亿元', min: -30, max: 40, step: 2,  group: '货币政策', hint: '央行工具：法定准备金率、再贴现率/政策利率、公开市场操作（买卖国债）的综合效果' },
    { key: 'dNX',    label: '净出口政策效果 NX', unit: '万亿元', min: -5,  max: 5,  step: 1,  group: '对外经济', hint: '汇率贬值/降关税/促出口 → 净出口增加；反之减少' }
  ],
  bank: [
    { key: 'dReserve',   label: '超额准备金变动', unit: '万亿元', min: -6,  max: 6,  step: 1, group: '准备金管理', hint: '多留准备金（+）=锁紧流动性更安全；少留（-）=扩大放贷能力' },
    { key: 'dCredit',    label: '信贷投放变动',   unit: '万亿元', min: -12, max: 15, step: 1, group: '信贷决策',   hint: '扩大信贷（+）通过贷款派生存款创造货币；压缩（-）信用收缩' },
    { key: 'dLiquidity', label: '流动性补充净额', unit: '万亿元', min: -8,  max: 8,  step: 1, group: '流动性管理', hint: '向央行再贴现/MLF、公开市场买入（+）；卖出证券回笼（-）' },
    { key: 'dDeposit',   label: '存款利率变动',   unit: '个百分点', min: -3, max: 3,  step: 1, group: '负债管理',   hint: '上调（+）吸储但抬高融资成本；下调（-）促消费降成本' }
  ],
  enterprise: [
    { key: 'dI0',     label: '投资预算增量 I₀', unit: '万亿元', min: -12, max: 12, step: 1, group: '投资决策', hint: '新建厂房、购置设备、增加存货、研发技改。投资与利率反向变动' },
    { key: 'dLabor',  label: '劳动力雇佣变动',  unit: '万人',   min: -5,  max: 5,  step: 1, group: '生产决策', hint: '依据生产函数调整要素投入；扩招（+）增加工资收入→消费' },
    { key: 'dFinance', label: '直接融资净额',   unit: '万亿元', min: -6,  max: 6,  step: 1, group: '融资决策', hint: '发行股票/债券（+）补充投资资金；偿还/回购（-）' },
    { key: 'dPrice',  label: '产品定价调整',    unit: '%',      min: -3,  max: 3,  step: 1, group: '定价决策', hint: '提价（+）压内销但影响出口竞争力；降价（-）促销。受价格粘性/菜单成本约束' }
  ],
  consumer: [
    { key: 'dC0',    label: '消费支出增量 C₀', unit: '万亿元', min: -6, max: 6, step: 1,    group: '消费决策',     hint: '衣食住行、耐用品、服务消费。依据预期收入与生命周期阶段调整' },
    { key: 'dSave',  label: '储蓄变动',        unit: '万亿元', min: -5, max: 5, step: 1,    group: '储蓄决策',     hint: '多储蓄（+）少消费；少储蓄（-）多消费。跨期消费安排' },
    { key: 'dAsset', label: '金融资产配置变动', unit: '万亿元', min: -5, max: 5, step: 1,   group: '金融资产配置', hint: '股票/基金/债券/保险（+）产生财富效应；转回存款（-）满足交易/预防/投机动机' },
    { key: 'dBorrow', label: '借贷净变动',     unit: '万亿元', min: -5, max: 5, step: 1,    group: '借贷决策',     hint: '房贷/车贷/消费贷（+）跨期消费；提前还贷（-）调整负债结构' }
  ]
}

/* 仪表盘指标定义（顺序与配色） */
export const METRIC_ITEMS = [
  { key: 'g', label: 'GDP 增速', unit: '%', color: '#409eff', good: [5.5, 6.5] },
  { key: 'u', label: '失业率', unit: '%', color: '#f56c6c', good: [4.5, 5.5] },
  { key: 'pi', label: '通胀率', unit: '%', color: '#e6a23c', good: [1, 3] },
  { key: 'r', label: '利率', unit: '%', color: '#67c23a', good: [0, 6] },
  { key: 'Y', label: '均衡产出 Y*', unit: '', color: '#909399', good: null }
]

/* 指标格式化：利率/增速等 *100 转百分点显示 */
export function fmtMetric(key, value) {
  if (value == null) return '—'
  if (key === 'r') return (value * 100).toFixed(2)
  if (key === 'g' || key === 'u' || key === 'pi') return value.toFixed(1)
  if (key === 'Y') return value.toFixed(1)
  return value
}

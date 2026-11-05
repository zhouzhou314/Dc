/**
 * 知识点知识图谱（Knowledge Graph）
 * ================================================================
 * 作用有三：
 *   1. 教学语义层：把第十一章拆成 25 个可独立诊断的知识节点，
 *      节点之间用"先修关系（prereq）"与"关联关系（related）"连成有向图；
 *   2. 诊断映射：题目 → 知识节点、节点 → 教材知识块（RAG chunk），
 *      使"做题记录"能落到具体节点上，进而计算节点级掌握度；
 *   3. 强化学习动作空间：智能体每步从图中选一个节点作为"下一步学什么"，
 *      动作编号即节点在 knowledgeNodes 数组中的下标，必须保持数组顺序稳定。
 *
 * 字段说明（节点）：
 *   id         节点唯一标识（英文，代码内引用；入库后不变）
 *   name       展示名
 *   section    所属小节（第一节~第四节）
 *   sectionKey 与 chapter11.js 的 section.key 对应，用于定位教材知识块
 *   topic      归并到题库的 5 个知识点之一（BKT 的主题口径）
 *   order      教学顺序（拓扑序的稳定排序依据）
 *   difficulty 1 基础 / 2 进阶 / 3 挑战（决定推荐难度阶梯）
 *   summary    一句话知识要点（前端弹窗与提示词都用）
 *   formula    核心公式（可为空）
 *   keywords   检索关键词（知识图谱搜索、RAG 补充查询）
 *   chunkIds   教材知识块 ID（对应 knowledge/chunks.js 的 chunkId）
 *   questionIds 覆盖的习题 ID（对应 src/data/questionBank.js）
 *   prereq     先修节点 ID 列表
 *
 * ⚠️ 数组顺序即强化学习动作下标，新增节点只允许追加到末尾。
 */

/** 节点定义（顺序即教学顺序，也是 RL 动作编号） */
export const knowledgeNodes = [
  /* ================= 第一节 产品市场的均衡：IS 曲线 ================= */
  {
    id: 'is_premise',
    name: '产品市场均衡的前提条件',
    section: '第一节 产品市场的均衡：IS曲线',
    sectionKey: 's1',
    topic: 'IS曲线',
    order: 1,
    difficulty: 1,
    summary: 'IS 曲线的前提是产品市场均衡（投资 = 储蓄），且利率通过投资影响均衡收入。',
    formula: 'i = s',
    keywords: ['产品市场', '均衡条件', '投资等于储蓄', 'i=s'],
    chunkIds: ['s1-u1'],
    questionIds: [13],
    prereq: []
  },
  {
    id: 'is_meaning',
    name: 'IS 曲线的含义与推导',
    section: '第一节 产品市场的均衡：IS曲线',
    sectionKey: 's1',
    topic: 'IS曲线',
    order: 2,
    difficulty: 2,
    summary: '利率下降→投资增加→均衡收入增加，把 (Y, r) 组合连成一条向右下方倾斜的曲线。',
    formula: 'r = (C₀ + I₀ + G − cT)/d − (1−c)/d · Y',
    keywords: ['IS曲线含义', '推导', '向右下方倾斜', '45度线'],
    chunkIds: ['s1-u2'],
    questionIds: [9, 14],
    prereq: ['is_premise']
  },
  {
    id: 'is_regions',
    name: 'IS 曲线两侧的失衡区域',
    section: '第一节 产品市场的均衡：IS曲线',
    sectionKey: 's1',
    topic: 'IS曲线',
    order: 3,
    difficulty: 2,
    summary: '右上方 i＜s（超额产品供给），左下方 i＞s（超额产品需求），失衡会推动收入回归曲线。',
    formula: '右上：i＜s；左下：i＞s',
    keywords: ['失衡区域', '右上方', '左下方', '超额产品供给'],
    chunkIds: ['s1-u2'],
    questionIds: [1],
    prereq: ['is_meaning']
  },
  {
    id: 'is_slope',
    name: 'IS 曲线的斜率（β 与 d）',
    section: '第一节 产品市场的均衡：IS曲线',
    sectionKey: 's1',
    topic: 'IS曲线',
    order: 4,
    difficulty: 3,
    summary: '斜率 −(1−β)/d：β 越大越平缓，投资对利率越敏感（d 越大）也越平缓。',
    formula: 'k = −(1 − β)/d',
    keywords: ['IS斜率', '边际消费倾向', '投资利率敏感度', '平缓', '陡峭'],
    chunkIds: ['s1-u3'],
    questionIds: [10, 11],
    prereq: ['is_meaning']
  },
  {
    id: 'is_shift',
    name: 'IS 曲线的移动',
    section: '第一节 产品市场的均衡：IS曲线',
    sectionKey: 's1',
    topic: 'IS曲线',
    order: 5,
    difficulty: 2,
    summary: 'G↑、T↓、自主投资或消费增加使 IS 右移；储蓄意愿增强、紧缩性财政使 IS 左移。',
    formula: 'ΔY = k_G · ΔG（k_G = 1/(1−β)）',
    keywords: ['IS移动', '财政扩张', '政府购买', '税收', '自主消费'],
    chunkIds: ['s1-u4'],
    questionIds: [12],
    prereq: ['is_meaning']
  },

  /* ================= 第二节 货币市场的均衡：LM 曲线 ================= */
  {
    id: 'lm_demand',
    name: '货币需求的三大动机',
    section: '第二节 货币市场的均衡：LM曲线',
    sectionKey: 's2',
    topic: 'LM曲线',
    order: 6,
    difficulty: 1,
    summary: '交易动机、预防动机与收入正相关（L₁=ky）；投机动机与利率负相关（L₂）。',
    formula: 'L = ky − hr',
    keywords: ['货币需求', '交易动机', '预防动机', '投机动机', '流动性偏好'],
    chunkIds: ['s2-u1'],
    questionIds: [15],
    prereq: []
  },
  {
    id: 'lm_bond',
    name: '债券价格与利率的反向关系',
    section: '第二节 货币市场的均衡：LM曲线',
    sectionKey: 's2',
    topic: 'LM曲线',
    order: 7,
    difficulty: 2,
    summary: '债券价格越高，市场利率越低；这一反向关系是投机性货币需求存在的前提。',
    formula: 'r ≈ (本息 − 市价) / 市价',
    keywords: ['债券价格', '利率', '反向关系', '投机需求'],
    chunkIds: ['s2-u1'],
    questionIds: [2],
    prereq: ['lm_demand']
  },
  {
    id: 'lm_trap',
    name: '流动性陷阱（凯恩斯陷阱）',
    section: '第二节 货币市场的均衡：LM曲线',
    sectionKey: 's2',
    topic: 'LM曲线',
    order: 8,
    difficulty: 2,
    summary: '利率极低时投机性货币需求无限大，增发货币被全部吸纳，货币政策失效。',
    formula: 'h → ∞ ⇒ LM 水平',
    keywords: ['流动性陷阱', '凯恩斯陷阱', '货币政策无效'],
    chunkIds: ['s2-u2'],
    questionIds: [4],
    prereq: ['lm_demand', 'lm_bond']
  },
  {
    id: 'lm_supply',
    name: '货币供给与实际货币量',
    section: '第二节 货币市场的均衡：LM曲线',
    sectionKey: 's2',
    topic: 'LM曲线',
    order: 9,
    difficulty: 1,
    summary: '货币供给由央行控制、属外生变量；实际货币供给 m = M/P，在图中是垂直线。',
    formula: 'm = M / P',
    keywords: ['货币供给', '实际货币量', '外生变量', 'M/P'],
    chunkIds: ['s2-u3'],
    questionIds: [16, 19],
    prereq: []
  },
  {
    id: 'lm_equil',
    name: '利率的决定：货币供求均衡',
    section: '第二节 货币市场的均衡：LM曲线',
    sectionKey: 's2',
    topic: 'LM曲线',
    order: 10,
    difficulty: 2,
    summary: '货币需求等于货币供给时决定均衡利率；供给增加使利率下降。',
    formula: 'm = ky − hr',
    keywords: ['利率决定', '货币供求均衡', '均衡利率'],
    chunkIds: ['s2-u4'],
    questionIds: [],
    prereq: ['lm_demand', 'lm_supply', 'lm_bond']
  },
  {
    id: 'lm_derive',
    name: 'LM 曲线的含义与推导',
    section: '第二节 货币市场的均衡：LM曲线',
    sectionKey: 's2',
    topic: 'LM曲线',
    order: 11,
    difficulty: 2,
    summary: '给定实际货币供给，收入越高所需交易货币越多、利率必须越高，故 LM 向右上方倾斜。',
    formula: 'r = (k/h)·Y − m/h',
    keywords: ['LM曲线含义', '推导', '向右上方倾斜'],
    chunkIds: ['s2-u5'],
    questionIds: [20],
    prereq: ['lm_equil']
  },
  {
    id: 'lm_slope',
    name: 'LM 曲线的斜率（k/h）',
    section: '第二节 货币市场的均衡：LM曲线',
    sectionKey: 's2',
    topic: 'LM曲线',
    order: 12,
    difficulty: 3,
    summary: '斜率 k/h：h 越大 LM 越平缓（接近流动性陷阱），h→0 时 LM 垂直（古典区域）。',
    formula: 'k(LM) = k/h',
    keywords: ['LM斜率', 'k/h', '投机需求系数', '平缓', '陡峭'],
    chunkIds: ['s2-u6'],
    questionIds: [3],
    prereq: ['lm_derive']
  },
  {
    id: 'lm_regions',
    name: 'LM 曲线的三个区域',
    section: '第二节 货币市场的均衡：LM曲线',
    sectionKey: 's2',
    topic: 'LM曲线',
    order: 13,
    difficulty: 3,
    summary: '凯恩斯区域（水平，货币无效）、中间区域（正常）、古典区域（垂直，财政无效）。',
    formula: 'h→∞ 水平；h→0 垂直',
    keywords: ['LM三区域', '凯恩斯区域', '古典区域', '中间区域'],
    chunkIds: ['s2-u6'],
    questionIds: [17],
    prereq: ['lm_slope', 'lm_trap']
  },
  {
    id: 'lm_shift',
    name: 'LM 曲线的移动',
    section: '第二节 货币市场的均衡：LM曲线',
    sectionKey: 's2',
    topic: 'LM曲线',
    order: 14,
    difficulty: 2,
    summary: '名义货币供给增加或价格水平下降（m 增大）使 LM 右移；反之左移。',
    formula: 'm↑ ⇒ LM 右移',
    keywords: ['LM移动', '货币扩张', '价格水平', '实际货币供给'],
    chunkIds: ['s2-u6'],
    questionIds: [18],
    prereq: ['lm_derive']
  },

  /* ================= 第三节 两个市场的共同均衡 ================= */
  {
    id: 'eq_meaning',
    name: '两个市场共同均衡的含义',
    section: '第三节 产品市场和货币市场的共同均衡',
    sectionKey: 's3',
    topic: 'IS-LM均衡',
    order: 15,
    difficulty: 1,
    summary: 'IS 与 LM 的交点同时满足产品市场与货币市场均衡，决定唯一的 (Y*, r*)。',
    formula: 'IS ∩ LM ⇒ (Y*, r*)',
    keywords: ['共同均衡', '交点', '均衡产出', '均衡利率'],
    chunkIds: ['s3-u1'],
    questionIds: [21],
    prereq: ['is_meaning', 'lm_derive']
  },
  {
    id: 'eq_solve',
    name: '联立求解均衡产出与利率',
    section: '第三节 产品市场和货币市场的共同均衡',
    sectionKey: 's3',
    topic: 'IS-LM均衡',
    order: 16,
    difficulty: 2,
    summary: '把 IS、LM 都写成 r 关于 Y 的方程后相等，解出 Y* 再回代求 r*。',
    formula: 'IS = LM ⇒ Y* ⇒ r*',
    keywords: ['联立求解', '方程组', '均衡值', '回代'],
    chunkIds: ['s3-u1', 'ex-6'],
    questionIds: [6, 23],
    prereq: ['is_meaning', 'lm_derive']
  },
  {
    id: 'eq_adjust',
    name: '失衡区域与自动调整',
    section: '第三节 产品市场和货币市场的共同均衡',
    sectionKey: 's3',
    topic: 'IS-LM均衡',
    order: 17,
    difficulty: 2,
    summary: '四个失衡区域分别对应产品市场与货币市场的超额供给/需求，收入与利率共同调整回均衡点。',
    formula: 'IS 两侧 × LM 两侧 = 四个区域',
    keywords: ['四大区域', '失衡调整', '超额供给', '超额需求'],
    chunkIds: ['s3-u2'],
    questionIds: [22],
    prereq: ['is_regions', 'lm_regions', 'eq_meaning']
  },
  {
    id: 'pol_extreme',
    name: '凯恩斯极端与古典极端',
    section: '第三节 产品市场和货币市场的共同均衡',
    sectionKey: 's3',
    topic: '政策运用',
    order: 18,
    difficulty: 3,
    summary: 'IS 垂直＋LM 水平：财政十分有效、货币完全无效；IS 水平＋LM 垂直则相反。',
    formula: 'd=0 且 h→∞ ⇒ 凯恩斯极端',
    keywords: ['凯恩斯极端', '古典极端', '政策无效', '垂直', '水平'],
    chunkIds: ['s3-u3'],
    questionIds: [5],
    prereq: ['eq_solve', 'is_slope', 'lm_regions']
  },
  {
    id: 'pol_fiscal',
    name: '财政政策效果与挤出效应',
    section: '第三节 产品市场和货币市场的共同均衡',
    sectionKey: 's3',
    topic: '政策运用',
    order: 19,
    difficulty: 3,
    summary: 'G↑ 使 IS 右移、Y↑ 且 r↑；利率上升抑制私人投资即挤出效应，产出增幅小于简单乘数。',
    formula: '挤出量 = k_G·ΔG − 实际 ΔY',
    keywords: ['财政政策', '挤出效应', '政府购买', '乘数'],
    chunkIds: ['s3-u4', 'ex-7'],
    questionIds: [7, 26, 27],
    prereq: ['eq_solve', 'is_slope']
  },
  {
    id: 'pol_monetary',
    name: '货币政策效果与传导机制',
    section: '第三节 产品市场和货币市场的共同均衡',
    sectionKey: 's3',
    topic: '政策运用',
    order: 20,
    difficulty: 2,
    summary: 'm↑ → r↓ → I↑ → 乘数放大 → Y↑；效果取决于 IS、LM 斜率。',
    formula: 'm↑ ⇒ r↓ ⇒ I↑ ⇒ Y↑',
    keywords: ['货币政策', '传导机制', '货币供给', '投资'],
    chunkIds: ['s3-u4', 'ex-8'],
    questionIds: [8],
    prereq: ['eq_solve', 'lm_shift', 'lm_slope']
  },
  {
    id: 'pol_lm_slope',
    name: '曲线斜率与政策有效性',
    section: '第三节 产品市场和货币市场的共同均衡',
    sectionKey: 's3',
    topic: '政策运用',
    order: 21,
    difficulty: 3,
    summary: 'LM 越平缓财政越有效、货币越无效；IS 越平缓（d 大）挤出越大、财政越无效。',
    formula: 'LM 平缓 ⇒ 财政强 / 货币弱',
    keywords: ['政策有效性', '曲线斜率', '财政强', '货币弱'],
    chunkIds: ['s3-u4'],
    questionIds: [25],
    prereq: ['pol_fiscal', 'pol_monetary']
  },
  {
    id: 'pol_mix',
    name: '财政与货币政策的配合',
    section: '第三节 产品市场和货币市场的共同均衡',
    sectionKey: 's3',
    topic: '政策运用',
    order: 22,
    difficulty: 3,
    summary: '双扩张可在提高产出的同时抑制利率上升，实现"高产出、低利率"的政策搭配。',
    formula: 'IS 右移 + LM 右移 ⇒ Y↑、r 稳定',
    keywords: ['政策配合', '双扩张', '政策组合', '利率稳定'],
    chunkIds: ['s3-u4'],
    questionIds: [],
    prereq: ['pol_fiscal', 'pol_monetary']
  },
  {
    id: 'pol_target',
    name: '政策目标与通胀缺口',
    section: '第三节 产品市场和货币市场的共同均衡',
    sectionKey: 's3',
    topic: '政策运用',
    order: 23,
    difficulty: 3,
    summary: '存在通胀缺口时应收紧使 IS/LM 左移；存在紧缩缺口时扩张；也可由目标值反推政策参数。',
    formula: '目标 Y* ⇒ 反推 G 或 M/P',
    keywords: ['通胀缺口', '紧缩缺口', '政策目标', '反推参数'],
    chunkIds: ['s3-u4'],
    questionIds: [24],
    prereq: ['pol_fiscal', 'pol_monetary']
  },

  /* ================= 第四节 本章评析 ================= */
  {
    id: 'crit_model',
    name: 'IS-LM 模型的定位与局限',
    section: '第四节 本章评析',
    sectionKey: 's4',
    topic: '模型评析',
    order: 24,
    difficulty: 2,
    summary: 'IS-LM 是产品与货币市场的一般均衡框架；局限在价格刚性、静态分析与预期缺失。',
    formula: '',
    keywords: ['模型定位', '一般均衡', '局限性', '价格刚性', '静态分析'],
    chunkIds: ['s4-u1'],
    questionIds: [28, 30],
    prereq: ['eq_solve']
  },
  {
    id: 'crit_money',
    name: '货币需求理论的评析（循环论证）',
    section: '第四节 本章评析',
    sectionKey: 's4',
    topic: '模型评析',
    order: 25,
    difficulty: 3,
    summary: '利率由货币供求决定、而投机需求又取决于利率，构成循环论证；此外利率并非"放弃流动性的报酬"。',
    formula: '',
    keywords: ['循环论证', '货币需求理论', '流动性偏好', '利息本质'],
    chunkIds: ['s4-u2'],
    questionIds: [29],
    prereq: ['lm_demand', 'lm_bond']
  }
]

/** 节点下标表：RL 动作用下标，其它地方用 id */
export const nodeIndex = new Map(knowledgeNodes.map((n, i) => [n.id, i]))

/** id → 节点 */
export const nodeMap = new Map(knowledgeNodes.map((n) => [n.id, n]))

/** 取节点（找不到返回 null，调用方需判空） */
export function getNode(id) {
  return nodeMap.get(id) || null
}

/**
 * 生成边集合
 * - prereq 边：由节点自己的 prereq 列表展开（A prereq=[B] ⇒ B → A）
 * - related 边：少量跨节关联，用于图上"横向影响"的展示
 */
export const knowledgeEdges = (() => {
  const edges = []
  for (const node of knowledgeNodes) {
    for (const p of node.prereq) {
      if (!nodeMap.has(p)) continue
      edges.push({ source: p, target: node.id, type: 'prereq' })
    }
  }
  /* 跨节关联边（双向语义，图上画成虚线） */
  const related = [
    ['is_regions', 'eq_adjust'],
    ['lm_trap', 'pol_extreme'],
    ['is_slope', 'pol_fiscal'],
    ['lm_slope', 'pol_monetary'],
    ['pol_mix', 'pol_target'],
    ['crit_model', 'eq_meaning']
  ]
  for (const [a, b] of related) edges.push({ source: a, target: b, type: 'related' })
  return edges
})()

/** 题目 ID → 节点 ID（一题只挂一个主节点，保证 BKT 口径唯一） */
export const questionNodeMap = (() => {
  const map = new Map()
  for (const node of knowledgeNodes) {
    for (const qid of node.questionIds) {
      if (!map.has(qid)) map.set(qid, node.id)
    }
  }
  return map
})()

/** 反查：题目属于哪个知识节点（无映射返回 null） */
export function nodeOfQuestion(questionId) {
  return questionNodeMap.get(Number(questionId)) || null
}

/** 知识点（题库 5 个 topic）→ 节点 ID 列表 */
export const TOPIC_TO_NODES = (() => {
  const map = new Map()
  for (const node of knowledgeNodes) {
    if (!map.has(node.topic)) map.set(node.topic, [])
    map.get(node.topic).push(node.id)
  }
  return map
})()

/**
 * 拓扑排序（Kahn）：只按先修关系，同层内按 order 稳定排序
 * 图设计为无环，若数据被改坏出现环，则把剩余节点按 order 追加，保证不丢节点
 */
export function topoOrder() {
  const indeg = new Map(knowledgeNodes.map((n) => [n.id, 0]))
  const children = new Map(knowledgeNodes.map((n) => [n.id, []]))
  for (const e of knowledgeEdges) {
    if (e.type !== 'prereq') continue
    indeg.set(e.target, (indeg.get(e.target) || 0) + 1)
    children.get(e.source).push(e.target)
  }
  const ready = knowledgeNodes.filter((n) => indeg.get(n.id) === 0).map((n) => n.id)
  const out = []
  while (ready.length > 0) {
    ready.sort((a, b) => nodeMap.get(a).order - nodeMap.get(b).order)
    const id = ready.shift()
    out.push(id)
    for (const c of children.get(id)) {
      indeg.set(c, indeg.get(c) - 1)
      if (indeg.get(c) === 0) ready.push(c)
    }
  }
  if (out.length < knowledgeNodes.length) {
    const rest = knowledgeNodes.filter((n) => !out.includes(n.id)).sort((a, b) => a.order - b.order)
    out.push(...rest.map((n) => n.id))
  }
  return out
}

/**
 * 学习前沿（frontier）：先修节点均已达标（掌握度 ≥ threshold）的节点中，
 * 自身掌握度最低的一批 —— 这就是"最近发展区"，可直接作为推荐候选
 * @param {Map<string, number>} nodeMastery 节点 ID → 掌握概率 0~1
 * @param {number} threshold 先修达标阈值（默认 0.6）
 * @param {number} limit 返回数量
 */
export function frontierNodes(nodeMastery, threshold = 0.6, limit = 8) {
  const masteryOf = (id) => {
    const v = nodeMastery.get(id)
    return v === undefined ? 0.15 : v // 未作答按 BKT 先验
  }
  const ready = knowledgeNodes.filter((n) => n.prereq.every((p) => masteryOf(p) >= threshold))
  return ready
    .filter((n) => masteryOf(n.id) < 0.95)
    .sort((a, b) => masteryOf(a.id) - masteryOf(b.id) || a.order - b.order)
    .slice(0, limit)
    .map((n) => n.id)
}

/**
 * 给前端的知识图谱数据（含节点先修数、子节点，便于 ECharts graph 布局）
 * @param {Map<string, number>} nodeMastery 可选：学生节点掌握度
 */
export function graphForClient(nodeMastery = new Map()) {
  const masteryOf = (id) => {
    const v = nodeMastery.get(id)
    return v === undefined ? null : Math.round(v * 1000) / 1000
  }
  const nodes = knowledgeNodes.map((n) => ({
    id: n.id,
    name: n.name,
    section: n.section,
    sectionKey: n.sectionKey,
    topic: n.topic,
    order: n.order,
    difficulty: n.difficulty,
    summary: n.summary,
    formula: n.formula,
    keywords: n.keywords,
    questionIds: n.questionIds,
    mastery: masteryOf(n.id)
  }))
  return { nodes, edges: knowledgeEdges, topics: [...TOPIC_TO_NODES.keys()] }
}

/** 图谱概览指标（教师端/知识图谱页头部展示） */
export function graphStats() {
  const byTopic = {}
  for (const n of knowledgeNodes) byTopic[n.topic] = (byTopic[n.topic] || 0) + 1
  return {
    nodeCount: knowledgeNodes.length,
    edgeCount: knowledgeEdges.length,
    prereqEdgeCount: knowledgeEdges.filter((e) => e.type === 'prereq').length,
    relatedEdgeCount: knowledgeEdges.filter((e) => e.type === 'related').length,
    byTopic,
    depth: maxDepth()
  }
}

/** 图的最长先修链长度（教学梯度） */
function maxDepth() {
  const memo = new Map()
  const depthOf = (id) => {
    if (memo.has(id)) return memo.get(id)
    const node = nodeMap.get(id)
    if (!node || node.prereq.length === 0) {
      memo.set(id, 1)
      return 1
    }
    const d = 1 + Math.max(...node.prereq.map(depthOf))
    memo.set(id, d)
    return d
  }
  return Math.max(...knowledgeNodes.map((n) => depthOf(n.id)))
}

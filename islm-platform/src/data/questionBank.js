/**
 * 题库数据
 * -------------------------------------------------
 * 1) 收录第十一章课后习题 8 题（id: 1~8，与 chapter11.js 保持一致）
 * 2) 扩充至 30 题，覆盖 5 大知识点 × 3 种难度 × 选择/计算两类题型
 *
 * 字段说明：
 *   id            题目唯一编号
 *   course        所属课程
 *   topic         知识点（IS曲线 | LM曲线 | IS-LM均衡 | 政策运用 | 模型评析）
 *   type          choice 单选题 / calc 计算题
 *   difficulty    easy 简单 / medium 中等 / hard 困难
 *   question      题干（支持内联HTML）
 *   options       选项（单选题）
 *   correct       正确选项下标（单选题）
 *   answer        参考答案 {Y, r}（计算题，r 用小数如 0.0533 表示 5.33%）
 *   steps         解题步骤数组（[{f: 公式, note: 说明}]）
 *   examPoint     考点说明
 *   relatedSection 关联课本章节
 *   lab           仿真器预填配置（可仿真验证的计算题）
 *   analysis      文字解析
 */
// 注意：使用相对路径（而非 '@/...' 别名），以便后端 server/ 也能直接以 Node ESM 复用本数据文件
import { DEFAULT_PARAMS } from '../constants/presets.js'

export const COURSE_NAME = '宏观经济学'

/** 知识点清单（供筛选器使用） */
export const TOPICS = ['IS曲线', 'LM曲线', 'IS-LM均衡', '政策运用', '模型评析']

/** 难度配置 */
export const DIFFICULTIES = {
  easy: { label: '简单', type: 'success' },
  medium: { label: '中等', type: 'warning' },
  hard: { label: '困难', type: 'danger' }
}

export const questionBank = [
  /* ============ 纳入：第十一章课后习题（1~8） ============ */
  {
    id: 1, course: COURSE_NAME, topic: 'IS曲线', type: 'choice', difficulty: 'easy',
    question: '位于IS曲线<b>右上方</b>的点，表示产品市场的状态是（　）。',
    options: ['i＞s，投资大于储蓄', 'i＜s，投资小于储蓄', 'i＝s，产品市场均衡', 'L＞M，货币需求大于货币供给'],
    correct: 1,
    examPoint: 'IS曲线两侧的失衡区域含义',
    relatedSection: '第一节 IS曲线',
    analysis: 'IS曲线右上方（右边）意味着在相同收入水平下利率偏高，导致投资规模小于储蓄规模，即 i＜s，存在超额产品供给；此时收入将趋于下降。'
  },
  {
    id: 2, course: COURSE_NAME, topic: 'LM曲线', type: 'choice', difficulty: 'easy',
    question: '债券价格与市场利率之间的关系是（　）。',
    options: ['正相关', '负相关（反向变化）', '没有关系', '恒等变化'],
    correct: 1,
    examPoint: '利率决定的货币市场机制 / 投机动机',
    relatedSection: '第二节 LM曲线',
    analysis: '债券价格与市场利率呈<b>反方向</b>关系：面值100元、票面利率10%的一年期债券到期本息110元，市价105元时市场利率≈4.76%，市价95元时≈15.8%。价格从105元跌到95元，利率从4.76%升到15.8%。这一反向关系存在于一切金融市场，是理解投机性货币需求的关键。'
  },
  {
    id: 3, course: COURSE_NAME, topic: 'LM曲线', type: 'choice', difficulty: 'medium',
    question: 'LM曲线的斜率为（　），当投机需求系数 h 增大时，LM曲线变得更加（　）。',
    options: ['k/h；平缓', 'h/k；陡峭', '(1−β)/d；平缓', '−(1−β)/d；陡峭'],
    correct: 0,
    examPoint: 'LM曲线斜率的决定因素',
    relatedSection: '第二节 LM曲线',
    analysis: '由LM方程 r = k/h·y − m/h 可知斜率为 <b>k/h</b>。k不变时，h与斜率成反比：h越大（货币投机需求对利率越敏感），LM越平缓；h→∞时LM呈水平状（凯恩斯区域/流动性陷阱），h→0时LM垂直（古典区域）。'
  },
  {
    id: 4, course: COURSE_NAME, topic: '政策运用', type: 'choice', difficulty: 'medium',
    question: '在"流动性陷阱"（凯恩斯陷阱）中，货币政策的效果是（　）。',
    options: ['十分有效', '完全无效', '部分有效', '取决于财政政策'],
    correct: 1,
    examPoint: '流动性陷阱与政策有效性',
    relatedSection: '第二节 LM曲线',
    analysis: '利率极低时，投机性货币需求无限扩张（LM呈水平状），增发的货币将被"流动性陷阱"全部吸纳，市场利率无法进一步降低，投资和收入都不会增加，因此<b>货币政策完全无效</b>。此时财政政策（移动IS）反而十分有效。'
  },
  {
    id: 5, course: COURSE_NAME, topic: '政策运用', type: 'choice', difficulty: 'medium',
    question: '凯恩斯主义极端情形（IS曲线为垂直线）下，下列说法正确的是（　）。',
    options: ['财政政策十分有效，货币政策完全无效', '财政政策完全无效，货币政策十分有效', '两种政策都十分有效', '两种政策都完全无效'],
    correct: 0,
    examPoint: '凯恩斯主义极端 / 古典主义极端',
    relatedSection: '第三节 均衡与政策',
    analysis: '大萧条时投资对利率完全不敏感（d＝0），IS为垂线：财政扩张使IS右移，收入增加不会被利率上升挤出（<b>无挤出效应</b>，财政十分有效）；移动LM只会使利率下降、投机性货币需求增加，收入不变（货币完全无效）。古典主义极端（IS水平）则恰好相反。'
  },
  {
    id: 6, course: COURSE_NAME, topic: 'IS-LM均衡', type: 'calc', difficulty: 'medium',
    question: '设消费函数 C = 100 + 0.8(Y − T)，投资函数 I = 200 − 2000r，政府支出 G = 100，税收 T = 50，货币需求 L = 0.2Y − 1000r，实际货币供给 M/P = 200。求产品市场和货币市场同时均衡时的<b>均衡产出 Y*</b> 与<b>均衡利率 r*</b>。',
    options: [], correct: -1,
    answer: { Y: 1266.67, r: 0.0533 },
    steps: [
      { f: 'IS：r = (C0+I0+G−c·T)/d − (1−c)/d·Y', note: '代入参数：r = (100+200+100−0.8×50)/2000 − (1−0.8)/2000·Y = 0.18 − 0.0001Y' },
      { f: 'LM：r = (k·Y − M/P)/h', note: '代入参数：r = 0.2/1000·Y − 200/1000 = 0.0002Y − 0.2' },
      { f: 'IS = LM：0.18 − 0.0001Y = 0.0002Y − 0.2', note: '两市场同时均衡，联立求解' },
      { f: 'Y* = (0.18 + 0.2) / (0.0001 + 0.0002) ≈ 1266.67', note: '解出均衡产出' },
      { f: 'r* = 0.0002×1266.67 − 0.2 ≈ 0.0533', note: '代回LM（或IS）得均衡利率 ≈ 5.33%' }
    ],
    examPoint: 'IS-LM联立求解均衡产出与均衡利率',
    relatedSection: '第三节 IS-LM均衡',
    lab: { compare: false, params: { ...DEFAULT_PARAMS } },
    analysis: 'IS方程：r = 0.18 − 0.0001Y；LM方程：r = 0.0002Y − 0.2；联立求解得 Y* ≈ <b>1266.67</b>，r* ≈ <b>5.33%</b>。可点击"仿真验证"自动复现。'
  },
  {
    id: 7, course: COURSE_NAME, topic: '政策运用', type: 'calc', difficulty: 'hard',
    question: '接上题，其他条件不变，<b>政府支出 G 由 100 增加到 200</b>。求新的均衡产出与均衡利率，并结合"挤出效应"说明：为什么产出增加量远小于简单乘数理论的预测值？',
    options: [], correct: -1,
    answer: { Y: 1433.33, r: 0.0867 },
    steps: [
      { f: '新IS：r = (100+200+200−40)/2000 − 0.0001Y = 0.23 − 0.0001Y', note: 'G↑ 使 IS 截距增大，曲线右移' },
      { f: 'LM不变：r = 0.0002Y − 0.2', note: '货币市场参数未变' },
      { f: 'Y* = (0.23 + 0.2) / (0.0001 + 0.0002) ≈ 1433.33', note: '联立求解新均衡产出' },
      { f: 'r* = 0.0002×1433.33 − 0.2 ≈ 0.0867', note: '新均衡利率 ≈ 8.67%' },
      { f: '挤出量 = 简单乘数预测 − 实际增加 = 500 − 166.67 = 333.33', note: '利率上升 5.33%→8.67% 抑制私人投资，产生挤出效应' }
    ],
    examPoint: '财政政策的挤出效应',
    relatedSection: '第三节 IS-LM均衡',
    lab: { compare: true, base: { ...DEFAULT_PARAMS }, shock: { ...DEFAULT_PARAMS, G: 200 } },
    analysis: 'Y* ≈ <b>1433.33</b>，r* ≈ <b>8.67%</b>。简单乘数 = 1/(1−0.8) = 5，ΔG=100 理论上应使产出增加 500；但政府支出推高利率（5.33%→8.67%），挤出了私人投资，实际产出只增加 166.67——这正是 IS-LM 框架下的挤出效应。'
  },
  {
    id: 8, course: COURSE_NAME, topic: '政策运用', type: 'calc', difficulty: 'medium',
    question: '接第6题，其他条件不变，<b>实际货币供给 M/P 由 200 增加到 300</b>。求新的均衡产出与均衡利率，并说明货币政策传导机制。',
    options: [], correct: -1,
    answer: { Y: 1600, r: 0.02 },
    steps: [
      { f: 'IS不变：r = 0.18 − 0.0001Y', note: '产品市场参数未变' },
      { f: '新LM：r = 0.0002Y − 0.3', note: 'M/P↑ 使 LM 截距下降，曲线右移' },
      { f: 'Y* = (0.18 + 0.3) / (0.0001 + 0.0002) = 1600', note: '联立求解新均衡产出' },
      { f: 'r* = 0.0002×1600 − 0.3 = 0.02', note: '新均衡利率 = 2.00%' },
      { f: '传导：M/P↑ → r↓ → I↑ → 乘数放大 → Y↑', note: '投资增加 d·Δr = 2000×0.0333 ≈ 66.67，经乘数放大使产出增加 333.33' }
    ],
    examPoint: '货币政策传导机制',
    relatedSection: '第三节 IS-LM均衡',
    lab: { compare: true, base: { ...DEFAULT_PARAMS }, shock: { ...DEFAULT_PARAMS, MP: 300 } },
    analysis: 'Y* = <b>1600</b>，r* = <b>2.00%</b>。传导机制：货币供给增加 → 超额货币供给 → 利率下降 → 投资增加 → 乘数放大 → 产出增加。'
  },

  /* ============ 扩充题：IS曲线（9~14） ============ */
  {
    id: 9, course: COURSE_NAME, topic: 'IS曲线', type: 'choice', difficulty: 'easy',
    question: 'IS曲线描述的是（　）市场达到均衡时，收入与利率的组合。',
    options: ['货币', '产品', '劳动', '外汇'],
    correct: 1,
    examPoint: 'IS曲线的定义',
    relatedSection: '第一节 IS曲线',
    analysis: 'IS曲线是<b>产品市场</b>均衡（i = s）时均衡收入与均衡利率组合点的集合；LM曲线对应货币市场。'
  },
  {
    id: 10, course: COURSE_NAME, topic: 'IS曲线', type: 'choice', difficulty: 'easy',
    question: '两部门经济中，边际消费倾向 β 越大，IS曲线的斜率（绝对值）（　）。',
    options: ['越大，IS越陡峭', '越小，IS越平缓', '不变', '无法确定'],
    correct: 1,
    examPoint: 'IS斜率与边际消费倾向的关系',
    relatedSection: '第一节 IS曲线',
    analysis: 'IS斜率 = −(1−β)/d。β 越大，(1−β) 越小，斜率绝对值越小，IS越<b>平缓</b>——此时乘数也越大，利率变动引起的收入变动更明显。'
  },
  {
    id: 11, course: COURSE_NAME, topic: 'IS曲线', type: 'choice', difficulty: 'medium',
    question: '在其他条件不变时，投资对利率的敏感度 d 变小，将使IS曲线（　）。',
    options: ['变得平缓', '变得陡峭', '平行右移', '平行左移'],
    correct: 1,
    examPoint: 'IS斜率与投资利率敏感度 d',
    relatedSection: '第一节 IS曲线',
    analysis: '斜率 = −(1−β)/d，d 变小 → 分母变小 → 斜率绝对值变大 → IS变<b>陡峭</b>。注意 d 只影响斜率，不改变截距，因此不是平移。'
  },
  {
    id: 12, course: COURSE_NAME, topic: 'IS曲线', type: 'choice', difficulty: 'medium',
    question: '下列哪种情况会使IS曲线向<b>左</b>移动？（　）',
    options: ['政府购买支出增加', '减税', '自主投资增加', '储蓄意愿增强（自主消费下降）'],
    correct: 3,
    examPoint: 'IS曲线移动的因素',
    relatedSection: '第一节 IS曲线',
    analysis: '储蓄意愿增强意味着自主消费 α 下降，总需求减少，IS左移。其余三项（G↑、T↓、e↑）都是扩张性变动，使IS右移。'
  },
  {
    id: 13, course: COURSE_NAME, topic: 'IS曲线', type: 'choice', difficulty: 'medium',
    question: 'IS曲线上的每一点都表示（　）。',
    options: ['货币需求等于货币供给', '投资等于储蓄', '总供给等于总需求且货币市场均衡', '政府预算平衡'],
    correct: 1,
    examPoint: 'IS曲线的均衡条件',
    relatedSection: '第一节 IS曲线',
    analysis: 'IS 曲线上每一点都满足 <b>i = s</b>（产品市场均衡）；"两个市场同时均衡"是 IS 与 LM 的交点。'
  },
  {
    id: 14, course: COURSE_NAME, topic: 'IS曲线', type: 'calc', difficulty: 'hard',
    question: '两部门经济：消费 C = 100 + 0.8Y，投资 I = 150 − 6r（r 为百分数数值，如 r=5 表示 5%）。求 IS 方程，并计算当 r = 5 时的均衡收入。',
    options: [], correct: -1,
    answer: { Y: 1100, r: null },
    steps: [
      { f: 'i = s：150 − 6r = −100 + 0.2Y', note: '由 s = y − c = −α + (1−β)y = −100 + 0.2Y' },
      { f: 'Y = 1250 − 30r', note: '整理得 IS 方程（斜率 −1/30）' },
      { f: 'r = 5 时：Y = 1250 − 30×5 = 1100', note: '代入得均衡收入 1100' }
    ],
    examPoint: '两部门 IS 方程推导与代入求值',
    relatedSection: '第一节 IS曲线',
    lab: null,
    analysis: '由均衡条件 150 − 6r = −100 + 0.2Y 得 IS 方程 Y = 1250 − 30r；r=5 时 Y = <b>1100</b>。本题验证"利率越高、均衡收入越低"。'
  },

  /* ============ 扩充题：LM曲线（15~20） ============ */
  {
    id: 15, course: COURSE_NAME, topic: 'LM曲线', type: 'choice', difficulty: 'easy',
    question: '凯恩斯认为人们持有货币的动机不包括（　）。',
    options: ['交易动机', '预防动机', '投机动机', '投资生产动机'],
    correct: 3,
    examPoint: '货币需求三大动机',
    relatedSection: '第二节 LM曲线',
    analysis: '三大动机是<b>交易、预防、投机</b>。前两者与收入正相关（L₁ = ky），投机动机与利率负相关（L₂ 与 r 反向）。'
  },
  {
    id: 16, course: COURSE_NAME, topic: 'LM曲线', type: 'choice', difficulty: 'easy',
    question: '实际货币供给 m 等于（　）。',
    options: ['名义货币供给 M', 'M × P', 'M / P', 'P / M'],
    correct: 2,
    examPoint: '实际货币供给的概念',
    relatedSection: '第二节 LM曲线',
    analysis: 'm = <b>M/P</b>，即名义货币量除以价格水平。短期分析中 P 固定，货币供给是外生变量，在图中表现为一条垂直线。'
  },
  {
    id: 17, course: COURSE_NAME, topic: 'LM曲线', type: 'choice', difficulty: 'medium',
    question: '在LM曲线的古典区域（垂直段），（　）。',
    options: ['货币需求利率弹性无穷大', '投机性货币需求为零，货币全部用于交易', '财政政策十分有效', '收入水平极低'],
    correct: 1,
    examPoint: 'LM曲线的三个区域',
    relatedSection: '第二节 LM曲线',
    analysis: '古典区域 LM 垂直（h→0）：利率高到投机性货币需求为 0，货币全部用于交易需求，此时<b>财政政策完全无效</b>（完全挤出），货币政策十分有效。凯恩斯区域（水平段）则相反。'
  },
  {
    id: 18, course: COURSE_NAME, topic: 'LM曲线', type: 'choice', difficulty: 'medium',
    question: '价格水平 P 下降（名义货币供给 M 不变），会使LM曲线（　）。',
    options: ['右移', '左移', '不动', '旋转'],
    correct: 0,
    examPoint: 'LM曲线移动的因素',
    relatedSection: '第二节 LM曲线',
    analysis: 'm = M/P，P 下降则实际货币供给 m 增大，LM 右移——这也是"凯恩斯效应"（价格下降刺激总需求）的基础。'
  },
  {
    id: 19, course: COURSE_NAME, topic: 'LM曲线', type: 'choice', difficulty: 'easy',
    question: '货币供给属于（　），货币需求属于（　）。',
    options: ['内生变量；外生变量', '外生变量；内生变量', '都是外生变量', '都是内生变量'],
    correct: 1,
    examPoint: '货币供给与需求的性质',
    relatedSection: '第二节 LM曲线',
    analysis: '货币供给由中央银行控制，是<b>外生变量</b>；货币需求取决于收入与利率，是<b>内生变量</b>。'
  },
  {
    id: 20, course: COURSE_NAME, topic: 'LM曲线', type: 'calc', difficulty: 'medium',
    question: '设货币需求 L = 0.2Y − 5r（r 为百分数数值），实际货币供给 m = 90。求 LM 方程，并求 Y = 500 时的均衡利率。',
    options: [], correct: -1,
    answer: { Y: 500, r: 0.02 },
    steps: [
      { f: 'm = L：90 = 0.2Y − 5r', note: '货币市场均衡条件' },
      { f: 'r = 0.04Y − 18', note: '解出 LM 方程（斜率 0.04）' },
      { f: 'Y = 500 时：r = 0.04×500 − 18 = 2', note: '代入得均衡利率 2%' }
    ],
    examPoint: 'LM方程推导与代入求值',
    relatedSection: '第二节 LM曲线',
    lab: null,
    analysis: 'LM 方程 r = 0.04Y − 18；Y=500 时 r* = <b>2%</b>。注意本题 r 以百分数数值计。'
  },

  /* ============ 扩充题：IS-LM均衡（21~24） ============ */
  {
    id: 21, course: COURSE_NAME, topic: 'IS-LM均衡', type: 'choice', difficulty: 'easy',
    question: '产品市场和货币市场同时均衡发生在（　）。',
    options: ['IS曲线上任意一点', 'LM曲线上任意一点', 'IS与LM的交点', '原点'],
    correct: 2,
    examPoint: 'IS-LM均衡的含义',
    relatedSection: '第三节 IS-LM均衡',
    analysis: 'IS 上任意点只保证产品市场均衡，LM 上任意点只保证货币市场均衡，只有<b>交点</b>才能同时满足两个市场均衡，决定唯一均衡产出与利率。'
  },
  {
    id: 22, course: COURSE_NAME, topic: 'IS-LM均衡', type: 'choice', difficulty: 'medium',
    question: '位于IS曲线<b>右侧</b>且位于LM曲线<b>左侧</b>的非均衡点，其自动调整方向是（　）。',
    options: ['收入增加，利率上升', '收入减少，利率下降', '收入减少，利率上升', '收入增加，利率下降'],
    correct: 1,
    examPoint: '两个市场的失衡与自动调整',
    relatedSection: '第三节 IS-LM均衡',
    analysis: 'IS 右侧：相同收入下利率偏高 → i＜s，超额产品供给 → 产出收缩，收入<b>减少</b>；LM 左侧：相同收入下利率偏高 → L＜m，货币需求小于供给 → 人们用多余货币购买证券，证券价格上升 → 利率<b>下降</b>。两个市场的失衡共同推动经济点向左下方回归均衡交点。'
  },
  {
    id: 23, course: COURSE_NAME, topic: 'IS-LM均衡', type: 'calc', difficulty: 'medium',
    question: '已知 IS：Y = 1000 − 25r，LM：Y = 500 + 25r（r 为百分数数值）。求均衡产出与均衡利率。',
    options: [], correct: -1,
    answer: { Y: 750, r: 0.1 },
    steps: [
      { f: '1000 − 25r = 500 + 25r', note: '联立 IS 与 LM' },
      { f: '50r = 500 ⇒ r = 10', note: '解出均衡利率 10%' },
      { f: 'Y = 500 + 25×10 = 750', note: '代回得均衡产出 750' }
    ],
    examPoint: '已知 IS/LM 方程求均衡',
    relatedSection: '第三节 IS-LM均衡',
    lab: null,
    analysis: '联立求解：r* = <b>10%</b>，Y* = <b>750</b>。'
  },
  {
    id: 24, course: COURSE_NAME, topic: 'IS-LM均衡', type: 'choice', difficulty: 'hard',
    question: '若经济已处于充分就业产出水平，但存在通货膨胀缺口，政府应当采取（　）。',
    options: ['扩张性财政政策', '紧缩性财政或货币政策', '增加货币供给', '提高自主消费'],
    correct: 1,
    examPoint: '均衡产出与充分就业的关系 / 政策取向',
    relatedSection: '第三节 IS-LM均衡',
    analysis: '存在通胀缺口说明总需求超过充分就业产出，应采取<b>紧缩性</b>财政/货币政策使 IS 或 LM 左移，压低均衡产出至充分就业水平。'
  },

  /* ============ 扩充题：政策运用（25~27） ============ */
  {
    id: 25, course: COURSE_NAME, topic: '政策运用', type: 'choice', difficulty: 'medium',
    question: 'LM曲线越平缓（h 越大），实施财政政策的效果（　），实施货币政策的效果（　）。',
    options: ['越好；越差', '越差；越好', '越好；越好', '越差；越差'],
    correct: 0,
    examPoint: '政策效果与 LM 斜率的关系',
    relatedSection: '第三节 IS-LM均衡',
    analysis: 'LM 平缓（h 大，接近流动性陷阱）：财政扩张引起的利率上升小、挤出效应弱，<b>财政效果好</b>；而货币扩张大部分被投机需求吸收、利率降幅小，<b>货币效果差</b>。'
  },
  {
    id: 26, course: COURSE_NAME, topic: '政策运用', type: 'choice', difficulty: 'medium',
    question: '"挤出效应"越大，说明（　）。',
    options: ['IS越平缓，LM越陡峭', 'IS越陡峭，LM越平缓', '投资对利率越不敏感', '货币需求对利率越敏感'],
    correct: 0,
    examPoint: '挤出效应大小的决定因素',
    relatedSection: '第三节 IS-LM均衡',
    analysis: 'IS 平缓（d 大，投资对利率敏感）+ LM 陡峭（h 小）：财政扩张使利率大幅上升且投资对利率变化敏感，被挤出的投资多，<b>挤出效应大</b>。'
  },
  {
    id: 27, course: COURSE_NAME, topic: '政策运用', type: 'calc', difficulty: 'hard',
    question: '第6题的参数不变，若政府希望均衡产出达到 1500，且采用<b>增加政府支出</b>的办法（货币供给不变）。求所需的 G 值与此时利率 r*。',
    options: [], correct: -1,
    answer: { Y: 1500, r: 0.1 },
    steps: [
      { f: '目标：Y* = 1500，LM 不变：r = 0.0002Y − 0.2', note: '先由 LM 算出 Y=1500 时的利率' },
      { f: 'r* = 0.0002×1500 − 0.2 = 0.1', note: '均衡利率 10%' },
      { f: 'IS 过点：(100+200+G−40)/2000 − 0.0001×1500 = 0.1', note: '把 (Y*, r*) 代入 IS 方程' },
      { f: '(260 + G)/2000 = 0.25 ⇒ G = 240', note: '解出政府支出应为 240（原 100，需增加 140）' }
    ],
    examPoint: '政策目标反推参数（LM约束下的财政扩张）',
    relatedSection: '第三节 IS-LM均衡',
    lab: { compare: true, base: { ...DEFAULT_PARAMS }, shock: { ...DEFAULT_PARAMS, G: 240 } },
    analysis: '所需 G = <b>240</b>（增加140），此时 r* = <b>10%</b>。利率上升 4.67 个百分点，再次印证财政扩张存在挤出效应。'
  },

  /* ============ 扩充题：模型评析（28~30） ============ */
  {
    id: 28, course: COURSE_NAME, topic: '模型评析', type: 'choice', difficulty: 'easy',
    question: 'IS-LM模型属于（　）分析框架。',
    options: ['微观局部均衡', '宏观一般均衡（产品+货币市场）', '动态最优化', '博弈论'],
    correct: 1,
    examPoint: 'IS-LM模型的定位',
    relatedSection: '第四节 本章评析',
    analysis: 'IS-LM 把产品市场与货币市场结合起来，是宏观层面的<b>一般均衡</b>分析框架，长期作为凯恩斯有效需求理论的典型代表。'
  },
  {
    id: 29, course: COURSE_NAME, topic: '模型评析', type: 'choice', difficulty: 'hard',
    question: '对凯恩斯货币需求理论的批评之一是"循环论证"，具体指（　）。',
    options: [
      '利率决定投资，投资决定收入',
      '一方面说利率决定投机性货币需求，另一方面又说货币需求与供给共同决定均衡利率',
      '储蓄和投资由利率自动调节到均衡',
      '价格水平固定不变假设'
    ],
    correct: 1,
    examPoint: '模型评析：循环论证问题',
    relatedSection: '第四节 本章评析',
    analysis: '批评者指出：如果说利率由货币供求决定，而货币需求中投机部分又取决于利率，这构成<b>循环决定</b>。此外马克思指出"利率是利润的一部分"，并非"放弃流动性的报酬"。'
  },
  {
    id: 30, course: COURSE_NAME, topic: '模型评析', type: 'choice', difficulty: 'medium',
    question: 'IS-LM模型的主要局限不包括（　）。',
    options: ['价格水平被假定固定不变', '忽视预期与不确定性对投资的影响', '只是静态分析，缺乏动态调整过程', '没有考虑产品市场均衡'],
    correct: 3,
    examPoint: 'IS-LM模型的局限性',
    relatedSection: '第四节 本章评析',
    analysis: 'IS-LM 的前提恰恰<b>包含</b>产品市场均衡（IS 曲线），这不是它的局限；真正的局限在于价格刚性假定、静态框架、对心理与预期因素处理不足等。'
  }
]

/**
 * 学习建议服务（Personalized Advice）
 * ================================================================
 * 输入：学生画像（profileService）+ 强化学习策略动作（rlService）
 * 输出：3~5 条**可执行**的学习建议，落库到 learning_advice。
 *
 * 为什么"规则 + 大模型"两段式：
 *   规则负责"选什么、为什么选"（可复核、可解释、绝不出错）；
 *   大模型只负责"把理由讲得自然、把动作写具体"，不参与选题决策。
 *   这样即使没有 API Key，建议质量也不塌方。
 */
import { query, safeQuery } from '../db.js'
import { config } from '../config.js'
import { buildProfile } from './profileService.js'
import { recommend as rlRecommend } from './rlService.js'
import { chatText, loadPrompt, parseJsonLoose } from './llm.js'

/** 题库/游戏入口文案（前端按 action 字段跳转） */
const ENTRY = {
  chapter: '章节学习',
  exercise: '题库练习',
  game1: '游戏一·政策模拟',
  game2: '游戏二·多人博弈',
  wrongbook: '错题本'
}

/** 各入口的特征词，用于校验大模型改写后的动作是否指向了错误入口 */
const ENTRY_KEYWORDS = {
  chapter: ['章节', '知识点学习', '教材'],
  exercise: ['题库', '练习', '做题', '刷题'],
  game1: ['游戏一', '政策模拟', '经济舵手'],
  game2: ['游戏二', '多人博弈', '博弈房间'],
  wrongbook: ['错题', '复习']
}

/**
 * 入口一致性校验
 * 大模型改写"具体动作"时可能把"去章节学"写成"去游戏一练"，
 * 而按钮跳转仍按规则生成的 entry 走，造成文案与跳转不一致。
 * 规则：改写文本若提到了别的入口、却没提自己的入口，则拒绝采用。
 */
function entryConsistent(actionText, entry) {
  if (!entry) return true
  const own = ENTRY_KEYWORDS[entry] || []
  const others = Object.entries(ENTRY_KEYWORDS)
    .filter(([k]) => k !== entry)
    .flatMap(([, list]) => list)
  const hitsOwn = own.some((k) => actionText.includes(k))
  const hitsOther = others.some((k) => actionText.includes(k))
  return !hitsOther || hitsOwn
}

/**
 * 规则版建议生成（确定性，作为兜底与提示词输入）
 * @param {object} profile 学生画像
 * @param {object} policy RL 推荐结果
 * @returns {Array<object>} 建议条目
 */
export function ruleAdvice(profile, policy) {
  const items = []
  const d = profile.dimensions || {}
  const habits = d.habits || {}
  const hint = d.hint || {}
  const game1 = (d.game && d.game.game1) || {}
  const game2 = (d.game && d.game.game2) || {}
  const knowledge = (profile.radar || []).find((r) => r.key === 'knowledge')
  const weakTopic = (d.knowledge || [])
    .filter((k) => k.attempts > 0)
    .sort((a, b) => a.pKnown - b.pKnown)[0]

  /* 1. 首条永远是策略推荐的节点：这是强化学习给出的"下一步" */
  if (policy && policy.node) {
    items.push({
      priority: 1,
      title: `攻下「${policy.node.name}」`,
      action: `进入${ENTRY.chapter}，定位到「${policy.node.section}」，看完推导后做该节点对应的题（${policy.node.questionIds.length || 0} 道）`,
      reason: policy.reason,
      minutes: 25,
      entry: 'chapter',
      target_node: policy.node.id,
      target_topic: policy.node.topic
    })
  }

  /* 2. 最薄弱知识点专项刷题 */
  if (weakTopic && weakTopic.pKnown < 0.6) {
    items.push({
      priority: 2,
      title: `专项突破「${weakTopic.topic}」`,
      action: `进入${ENTRY.exercise}，知识点选「${weakTopic.topic}」、难度选${weakTopic.pKnown < 0.35 ? '简单' : '中等'}，连做 5 题`,
      reason: `该知识点掌握概率仅 ${Math.round(weakTopic.pKnown * 100)}%，是当前最大短板`,
      minutes: 20,
      entry: 'exercise',
      target_topic: weakTopic.topic
    })
  }

  /* 3. 提示依赖：直取解析次数多 → 训练"先自己想" */
  if ((hint.directL4 || 0) >= 2) {
    items.push({
      priority: 2,
      title: '把"直接看解析"换成"逐级提示"',
      action: `做题卡住时先点【获取提示】用完 L1→L3，仍不会再点【查看完整解析】，本类题连做 3 道`,
      reason: `已直接查看完整解析 ${hint.directL4} 次，思考过程被跳过`,
      minutes: 15,
      entry: 'exercise'
    })
  } else if ((hint.total || 0) === 0 && (habits.answers || 0) >= 5) {
    items.push({
      priority: 4,
      title: '卡住时用阶梯提示，而不是死磕',
      action: `下次做题卡住超过 2 分钟，点【获取提示】拿 L1 方向`,
      reason: '尚未使用过阶梯导学，可能把时间浪费在同一个卡点上',
      minutes: 10,
      entry: 'exercise'
    })
  }

  /* 4. 游戏迁移练习：把抽象模型变成"手感" */
  if (game1.sessions === 0) {
    items.push({
      priority: 3,
      title: '用游戏一建立曲线直觉',
      action: `进入${ENTRY.game1}，沙盘模式先执行一次「扩大政府购买」，观察 IS 右移与利率上升`,
      reason: '还没有政策模拟记录，曲线移动只停留在纸面',
      minutes: 20,
      entry: 'game1'
    })
  } else if (weakTopic && weakTopic.topic === '政策运用') {
    items.push({
      priority: 3,
      title: '在游戏一里复现"挤出效应"',
      action: `进入${ENTRY.game1}，对比 G+6 与 M+8 两组政策下的产出与利率，记录挤出量`,
      reason: '政策运用薄弱，但已有游戏基础，适合用仿真强化',
      minutes: 20,
      entry: 'game1'
    })
  }
  if (game2.decisions === 0) {
    items.push({
      priority: 4,
      title: '到游戏二体验四方博弈',
      action: `进入${ENTRY.game2}，创建房间并让 AI 补位，至少完整打完 1 局`,
      reason: '缺少多人博弈决策数据，画像的"决策风格"维度还是空白',
      minutes: 30,
      entry: 'game2'
    })
  }

  /* 5. 错题复习（SM-2 队列） */
  if ((habits.wrongBook || 0) >= 3) {
    items.push({
      priority: 3,
      title: '清掉到期错题',
      action: `进入${ENTRY.wrongbook}，点【复习模式】按"记得/模糊/忘了"给到期错题评分`,
      reason: `错题本已积累 ${habits.wrongBook} 题，按 SM-2 排期复习记忆留存更高`,
      minutes: 15,
      entry: 'wrongbook'
    })
  }

  /* 6. 学有余力：挑战提升 */
  if (knowledge && knowledge.value >= 75) {
    items.push({
      priority: 5,
      title: '挑战高难度综合题',
      action: `进入${ENTRY.exercise}，难度选"困难"，做 3 道计算题并尝试用仿真器验证`,
      reason: `知识掌握度已达 ${knowledge.value}，需要拉开难度上限`,
      minutes: 30,
      entry: 'exercise'
    })
  }

  /* 按优先级排序，同优先级保持插入顺序，最多 5 条 */
  return items
    .sort((a, b) => a.priority - b.priority)
    .slice(0, 5)
}

/**
 * 生成学习建议（画像 + RL 策略 + 大模型润色）
 * @param {string} userId
 * @param {{force?:boolean, useLLM?:boolean}} options
 */
export async function generateAdvice(userId, { force = false, useLLM = true } = {}) {
  /* 画像可复用缓存；建议本身每次重新生成（因为 RL 策略会随训练变化） */
  const profile = await buildProfile(userId, { force, useLLM })
  const policy = await rlRecommend(userId, { record: true })

  const items = ruleAdvice(profile, policy)
  let headline = policy.node ? `下一步：${policy.node.name}` : '先补齐基础，再谈提升'
  let narrative = `结合你当前的画像，策略网络把「${policy.node.name}」排在了第一位：${policy.reason}`

  if (useLLM) {
    try {
      const ai = await llmAdvice(profile, policy, items)
      if (ai) {
        if (ai.headline) headline = String(ai.headline).slice(0, 40)
        if (ai.narrative) narrative = String(ai.narrative).slice(0, 600)
        /* 模型给出的条目仅用于"改写文案"，选题仍以规则条目为准：
         * 用 target_node / priority 对齐，避免模型凭空造出系统不存在的入口 */
        if (Array.isArray(ai.items)) {
          for (const aiItem of ai.items) {
            const target = items.find((it) =>
              (aiItem.target_node && it.target_node === aiItem.target_node) ||
              (aiItem.title && it.title === aiItem.title)
            )
            if (!target) continue
            /* 动作文案只有在"入口一致"时才采用，避免按钮跳转与文字不符 */
            if (aiItem.action && entryConsistent(String(aiItem.action), target.entry)) {
              target.action = String(aiItem.action).slice(0, 80)
            }
            if (aiItem.reason) target.reason = String(aiItem.reason).slice(0, 60)
            if (aiItem.minutes) {
              target.minutes = Math.max(5, Math.min(60, Number(aiItem.minutes) || target.minutes))
            }
          }
        }
      }
    } catch (e) {
      console.warn('[advice] 大模型建议生成失败，保留规则版本：', e.message)
    }
  }

  const record = {
    userId,
    items,
    narrative,
    headline,
    source: useLLM ? 'llm' : 'rule',
    policyNode: policy.node.id,
    modelName: config.llm.mock || !config.llm.apiKey ? 'mock' : `${config.llm.provider}/${config.llm.model}`,
    generatedAt: new Date().toISOString()
  }
  await saveAdvice(record)

  return { ...record, profile, policy }
}

/** 组装提示词（只喂压缩后的画像 + 策略，不喂原始明细） */
async function llmAdvice(profile, policy, items) {
  const system = loadPrompt('advice.txt')
  const input = {
    profile: {
      summary: profile.summary,
      radar: profile.radar,
      weakNodes: profile.weakNodes,
      knowledge: (profile.dimensions || {}).knowledge,
      habits: (profile.dimensions || {}).habits,
      hint: (profile.dimensions || {}).hint,
      game: (profile.dimensions || {}).game
    },
    policy: {
      node_id: policy.node.id,
      name: policy.node.name,
      topic: policy.node.topic,
      difficulty: policy.node.difficulty,
      summary: policy.node.summary,
      reason: policy.reason,
      q: policy.q,
      source: policy.source
    },
    candidates: policy.top,
    rule_items: items.map((i) => ({ title: i.title, action: i.action, target_node: i.target_node || null }))
  }
  const { content } = await chatText({
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: '输入数据：\n' + JSON.stringify(input) }
    ],
    mockFallback: () => JSON.stringify({
      headline: policy.node ? `下一步：${policy.node.name}` : '先补齐基础',
      narrative: `结合你的画像，策略网络把「${policy.node.name}」排在第一位。${policy.reason}`,
      items: items.map((i) => ({ title: i.title, action: i.action, reason: i.reason, minutes: i.minutes, target_node: i.target_node || null }))
    }),
    temperature: 0.6
  })
  return parseJsonLoose(content)
}

/** 建议落库（保留历史，教师端可看"建议是否被执行"） */
async function saveAdvice(a) {
  await query(
    `INSERT INTO learning_advice (user_id, items, narrative, source, policy_node, model_name, generated_at)
     VALUES (?, ?, ?, ?, ?, ?, NOW())`,
    [
      a.userId,
      JSON.stringify(a.items),
      `${a.headline}\n${a.narrative}`,
      a.source,
      a.policyNode,
      a.modelName
    ]
  )
}

/**
 * 读取最近一次建议
 * @param {string} userId
 */
export async function getLatestAdvice(userId) {
  const rows = await safeQuery(
    'SELECT * FROM learning_advice WHERE user_id = ? ORDER BY id DESC LIMIT 1',
    [userId]
  )
  if (rows.length === 0) return null
  const r = rows[0]
  let items = []
  try {
    items = typeof r.items === 'string' ? JSON.parse(r.items) : r.items
  } catch {
    items = []
  }
  return {
    userId: r.user_id,
    items,
    narrative: r.narrative || '',
    source: r.source,
    policyNode: r.policy_node,
    generatedAt: r.generated_at
  }
}

/**
 * 阶梯导学核心编排服务
 * -------------------------------------------------
 * 职责（对业务流程 ②~⑥ 步的实现）：
 *  - 会话读写：每题每生一条 hint_session，层级单调递增
 *  - RAG：首次检索固化为 rag_snapshot，L2/L3 复用；带困惑文本时重检
 *  - 提示词：渲染 system/user 模板；L1~L3 不下发标准答案（official_solution='（按规则隐藏）'）
 *  - LLM：生成 → 泄露校验 → 追加提醒重试 1 次 → 仍不合格降级直出知识块
 *  - 落库：每次输出写一条 hint_log（前端刷新恢复的数据源）
 */
import { pool, query } from '../db.js'
import { questionMap, stripHtml } from './leakGuard.js'
import { retrieveHybrid, buildRagContext } from './retriever.js'
import { chatLLM, promptTemplates, renderTemplate } from './llm.js'
import { checkOutput } from './leakGuard.js'
import { chapterScope } from '../knowledge/chunks.js'
import { questionBank } from '../../src/data/questionBank.js'

/** 业务异常：routes 捕获后按 code/status 返回 */
export class HintError extends Error {
  constructor(code, status, message, data = null) {
    super(message)
    this.code = code
    this.status = status
    this.data = data
  }
}

const bankMap = new Map(questionBank.map(q => [q.id, q]))

/* ============================================================
 * 数据库小工具
 * ============================================================ */

/** 读取（或首次创建）某生某题的导学会话 */
async function getOrCreateSession(userId, questionId) {
  let rows = await query(
    'SELECT * FROM hint_session WHERE user_id = ? AND question_id = ?',
    [userId, questionId]
  )
  if (rows.length === 0) {
    await query(
      'INSERT INTO hint_session (user_id, question_id) VALUES (?, ?)',
      [userId, questionId]
    )
    rows = await query(
      'SELECT * FROM hint_session WHERE user_id = ? AND question_id = ?',
      [userId, questionId]
    )
  }
  return rows[0]
}

/** 写一条提示日志，返回插入 id */
async function insertLog({ sessionId, userId, questionId, level, triggerType, content, chunkIds, model, usage, degraded }) {
  const result = await pool.query(
    `INSERT INTO hint_log
       (session_id, user_id, question_id, level, trigger_type, content, rag_chunk_ids, model_name, prompt_tokens, completion_tokens, degraded)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      sessionId, userId, questionId, level, triggerType,
      JSON.stringify(content), JSON.stringify(chunkIds),
      model, usage?.prompt_tokens ?? null, usage?.completion_tokens ?? null,
      degraded ? 1 : 0
    ]
  )
  return result[0].insertId
}

/* ============================================================
 * 内部工具
 * ============================================================ */

/** 计算题作答文本（前端 r 为百分数口径） */
function formatStudentAnswer(question, studentAnswer) {
  if (!studentAnswer) return '（未作答）'
  if (question.type === 'choice') {
    return studentAnswer.choice != null
      ? '选择了选项 ' + 'ABCD'[studentAnswer.choice]
      : '（未作答）'
  }
  const parts = []
  if (studentAnswer.y != null) parts.push('Y*=' + studentAnswer.y)
  if (studentAnswer.r != null) parts.push('r*=' + studentAnswer.r + '%')
  return parts.length ? parts.join('，') : '（未作答）'
}

/** 组装 L4 用的官方解析文本（仅 L4 下发给模型） */
function buildOfficialSolution(question) {
  const bank = bankMap.get(question.id)
  if (question.type === 'choice') {
    return `正确答案：${'ABCD'[question.correct]}\n官方解析：${stripHtml(question.analysis)}`
  }
  let stepsText = ''
  if (bank?.steps?.length) {
    stepsText = '\n解题步骤：\n' + bank.steps.map((s, i) => `${i + 1}) ${s.f}（${stripHtml(s.note)}）`).join('\n')
  }
  return `参考答案：Y* = ${question.answer.Y}，r* ≈ ${(question.answer.r * 100).toFixed(2)}%\n官方解析：${stripHtml(question.analysis)}${stepsText}`
}

/** 渲染 user 提示词（targetLevel=4 时下发官方解析，L1~L3 恒为隐藏） */
function renderUserPrompt({ question, session, targetLevel, triggerType, confusionText, studentAnswer, judgeResult, ragContext }) {
  const { userTpl } = promptTemplates()

  const vars = {
    target_level: targetLevel,
    trigger_type: triggerType,
    student_confusion: confusionText || '（未填写）',
    question_id: question.id,
    chapter_name: chapterScope,
    question_type: question.type === 'choice' ? '单选题' : '计算题',
    question_stem: stripHtml(question.question),
    question_options: question.type === 'choice'
      ? question.options.map((o, i) => `${'ABCD'[i]}. ${stripHtml(o)}`).join('　')
      : '（无）',
    /* 防泄露关键：仅 L4 下发真实答案，L1~L3 一律隐藏（答案根本不进模型上下文） */
    official_solution: targetLevel === 4 ? buildOfficialSolution(question) : '（按规则隐藏）',
    attempt_count: session.attempt_count,
    student_answer: formatStudentAnswer(question, studentAnswer),
    judge_result: judgeResult === 'correct' ? '正确' : judgeResult === 'wrong' ? '错误' : '未作答',
    unlocked_levels: session.current_level > 0
      ? Array.from({ length: session.current_level }, (_, i) => i + 1).join(',')
      : '无',
    rag_context: ragContext
  }
  return renderTemplate(userTpl, vars)
}

/** LLM 生成（网络级失败自动重试 1 次，仍失败抛 LLM_ERROR） */
async function generate(messages, targetLevel, question) {
  let lastErr
  for (let i = 0; i < 2; i++) {
    try {
      return await chatLLM({ messages, targetLevel, question })
    } catch (e) {
      lastErr = e
      console.warn('[hint] LLM调用失败（第' + (i + 1) + '次）：', e.message)
    }
  }
  throw new HintError('LLM_ERROR', 502, '导学服务暂时不可用，请稍后再试')
}

/** 生成 + 泄露校验 + 追加提醒重试；返回 { content(规范化对象), degraded, usage, model, chunkIds } */
async function generateValidated({ question, targetLevel, systemText, userText, snapshotResults }) {
  const baseMessages = [
    { role: 'system', content: systemText },
    { role: 'user', content: userText }
  ]

  let res = await generate(baseMessages, targetLevel, question)
  let check = checkOutput(targetLevel, res.content, question)

  if (!check.ok) {
    /* 第1次不合格：把模型的错误输出与严厉提醒追加进上下文重试 */
    console.warn('[hint] 输出校验未通过，追加提醒重试：', check.reason)
    const retryMessages = [
      ...baseMessages,
      { role: 'assistant', content: res.content.slice(0, 800) },
      { role: 'user', content: '你上一轮输出违反了层级铁律：' + check.reason + '。请严格重新输出 target_level=' + targetLevel + ' 对应内容：L1~L3 严禁出现最终答案数值/选项字母，L4 的答案必须与官方解析一致；只输出合法JSON。' }
    ]
    res = await generate(retryMessages, targetLevel, question)
    check = checkOutput(targetLevel, res.content, question)
  }

  if (check.ok) {
    const p = check.parsed
    return {
      content: {
        level: p.level,
        title: p.title || (targetLevel === 4 ? '完整解析' : '提示'),
        hint_body: p.hint_body || '',
        guiding_question: p.guiding_question || '',
        knowledge_refs: Array.isArray(p.knowledge_refs) ? p.knowledge_refs : [],
        steps: Array.isArray(p.steps) ? p.steps : [],
        solution: p.solution || null
      },
      degraded: false,
      usage: res.usage,
      model: res.model
    }
  }

  /* 重试后仍不合格 → 降级：直出知识块原文（L1~L3）或官方解析（L4），绝不静默放弃 */
  console.warn('[hint] 重试后仍不合格，降级直出：', check.reason)
  return { content: buildDegradedContent(targetLevel, question, snapshotResults), degraded: true, usage: res.usage, model: res.model }
}

/** 降级内容：L1~L3 直出快照前2块知识原文；L4 直出题库官方解析（安全） */
function buildDegradedContent(targetLevel, question, snapshotResults) {
  if (targetLevel <= 3) {
    const cards = (snapshotResults || []).slice(0, 2)
      .map(r => `【知识卡】${r.title}\n${r.content.slice(0, 300)}`)
      .join('\n\n')
    return {
      level: targetLevel,
      title: '知识卡提示',
      hint_body: (cards || '（本次检索未命中足够相关知识块）') + '\n\n<i>本次提示由知识库直出，请先自行归纳解题思路。</i>',
      guiding_question: '对照知识卡，想一想第一步该做什么？',
      knowledge_refs: (snapshotResults || []).slice(0, 2).map(r => r.title),
      steps: targetLevel === 3
        ? ['① 对照知识卡梳理已知条件与所求；', '❓请你自己完成：写出关键方程或判断依据。']
        : [],
      solution: null
    }
  }
  /* L4 降级给官方解析原文是安全的（本来就是标准答案通道） */
  return {
    level: 4,
    title: '完整解析',
    hint_body: '',
    guiding_question: '',
    knowledge_refs: [],
    steps: [],
    solution: {
      answer: question.type === 'calc'
        ? `Y* = ${question.answer.Y}，r* ≈ ${(question.answer.r * 100).toFixed(2)}%`
        : 'ABCD'[question.correct],
      process: stripHtml(question.analysis),
      meaning: '见官方解析中的经济学含义说明。',
      pitfalls: []
    }
  }
}

/* ============================================================
 * 对外业务：L1~L3 逐级提示
 * ============================================================ */
export async function getHint({ userId, questionId, confusionText, studentAnswer, judgeResult }) {
  const question = questionMap.get(Number(questionId))
  if (!question) throw new HintError('QUESTION_NOT_FOUND', 400, '题目不存在（questionId 须为 1~8）')

  const session = await getOrCreateSession(userId, questionId)

  /* 带作答信息的请求视为一次"卡壳作答"，计入统计口径 */
  if (studentAnswer) {
    await query('UPDATE hint_session SET attempt_count = attempt_count + 1 WHERE id = ?', [session.id])
    session.attempt_count += 1
  }

  const triggerType = confusionText ? 'CONFUSION_RETRY' : 'HINT_STEP'

  /* 层级推进：逐级请求要求 current<3；困惑重试按当前层级重生成（current=0 时视同首次） */
  let targetLevel
  if (triggerType === 'CONFUSION_RETRY') {
    targetLevel = Math.max(session.current_level, 1)
  } else {
    if (session.current_level >= 3) {
      throw new HintError('LEVEL_LOCKED', 200, '渐进提示已到顶，可查看完整解析', { currentLevel: 3 })
    }
    targetLevel = session.current_level + 1
  }

  /* RAG：困惑重试→重新检索并覆盖快照；已有快照→复用；否则首次检索并固化
   * （混合检索：TF-IDF 粗召回 + 向量余弦重排，无向量时自动退化，接口兼容） */
  let results
  if (confusionText) {
    results = await retrieveHybrid({ question, studentAnswerText: formatStudentAnswer(question, studentAnswer), confusionText, allowSolution: false })
    await query('UPDATE hint_session SET rag_snapshot = ?, confusion_text = ? WHERE id = ?',
      [JSON.stringify(results), String(confusionText).slice(0, 500), session.id])
    session.rag_snapshot = results
  } else if (Array.isArray(session.rag_snapshot) && session.rag_snapshot.length) {
    results = session.rag_snapshot
  } else {
    results = await retrieveHybrid({ question, studentAnswerText: formatStudentAnswer(question, studentAnswer), allowSolution: false })
    await query('UPDATE hint_session SET rag_snapshot = ? WHERE id = ?', [JSON.stringify(results), session.id])
    session.rag_snapshot = results
  }

  /* 渲染提示词并生成（L1~L3：official_solution 恒为隐藏） */
  const { systemTpl } = promptTemplates()
  const systemText = renderTemplate(systemTpl, { chapter_scope: chapterScope })
  const userText = renderUserPrompt({ question, session, targetLevel, triggerType, confusionText, studentAnswer, judgeResult, ragContext: buildRagContext(results) })

  const gen = await generateValidated({ question, targetLevel, systemText, userText, snapshotResults: results })

  /* 层级单调推进并落库（困惑重试不回退、不越级） */
  const newLevel = Math.max(session.current_level, targetLevel)
  await query('UPDATE hint_session SET current_level = ? WHERE id = ?', [newLevel, session.id])
  const logId = await insertLog({
    sessionId: session.id, userId, questionId: question.id,
    level: targetLevel, triggerType,
    content: gen.content, chunkIds: results.map(r => r.chunkId),
    model: gen.model, usage: gen.usage, degraded: gen.degraded
  })

  return {
    level: targetLevel,
    title: gen.content.title,
    hintBody: gen.content.hint_body,
    guidingQuestion: gen.content.guiding_question,
    steps: gen.content.steps,
    knowledgeRefs: gen.content.knowledge_refs,
    degraded: gen.degraded,
    currentLevel: newLevel,
    solutionUnlocked: !!session.solution_unlocked,
    hintLogId: logId,
    isNew: true
  }
}

/* ============================================================
 * 对外业务：L4 完整解析
 * ============================================================ */
export async function getSolution({ userId, questionId, confirm }) {
  if (confirm !== true) throw new HintError('PARAM_ERROR', 400, '缺少 confirm:true（需用户在弹窗中主动确认）')

  const question = questionMap.get(Number(questionId))
  if (!question) throw new HintError('QUESTION_NOT_FOUND', 400, '题目不存在（questionId 须为 1~8）')

  const session = await getOrCreateSession(userId, questionId)

  /* 幂等：已解锁直接回放已存的 L4 日志，不再重复调模型 */
  if (session.solution_unlocked) {
    const rows = await query(
      'SELECT id, content FROM hint_log WHERE session_id = ? AND level = 4 ORDER BY id DESC LIMIT 1',
      [session.id]
    )
    if (rows.length) {
      const saved = JSON.parse(rows[0].content)
      return {
        level: 4,
        title: saved.title || '完整解析',
        solution: saved.solution,
        knowledgeRefs: saved.knowledge_refs || [],
        degraded: false,
        currentLevel: session.current_level,
        solutionUnlocked: true,
        hintLogId: rows[0].id,
        isNew: false
      }
    }
  }

  /* L4 检索：全量放开（含"习题解析"块与全部数值），不覆盖 L1~L3 的快照 */
  const results = await retrieveHybrid({ question, allowSolution: true })

  const { systemTpl } = promptTemplates()
  const systemText = renderTemplate(systemTpl, { chapter_scope: chapterScope })
  const userText = renderUserPrompt({
    question, session, targetLevel: 4, triggerType: 'SOLUTION_DIRECT',
    confusionText: '', studentAnswer: null, judgeResult: 'unsolved',
    ragContext: buildRagContext(results)
  })

  const gen = await generateValidated({ question, targetLevel: 4, systemText, userText, snapshotResults: results })

  await query('UPDATE hint_session SET solution_unlocked = 1 WHERE id = ?', [session.id])
  const logId = await insertLog({
    sessionId: session.id, userId, questionId: question.id,
    level: 4, triggerType: 'SOLUTION_DIRECT',
    content: gen.content, chunkIds: results.map(r => r.chunkId),
    model: gen.model, usage: gen.usage, degraded: gen.degraded
  })

  return {
    level: 4,
    title: gen.content.title,
    solution: gen.content.solution,
    knowledgeRefs: gen.content.knowledge_refs,
    degraded: gen.degraded,
    currentLevel: session.current_level,
    solutionUnlocked: true,
    hintLogId: logId,
    isNew: true
  }
}

/* ============================================================
 * 对外业务：状态恢复 / 提示反馈
 * ============================================================ */

/** 一次拉取该用户全部题目的导学状态（前端刷新恢复的唯一数据源） */
export async function getState(userId) {
  const sessions = await query('SELECT * FROM hint_session WHERE user_id = ?', [userId])
  const logs = await query('SELECT * FROM hint_log WHERE user_id = ? ORDER BY id ASC', [userId])

  const logsByQuestion = new Map()
  for (const row of logs) {
    if (!logsByQuestion.has(row.question_id)) logsByQuestion.set(row.question_id, [])
    let content = null
    try { content = JSON.parse(row.content) } catch { content = null }
    logsByQuestion.get(row.question_id).push({
      id: row.id,
      level: row.level,
      degraded: !!row.degraded,
      createdAt: row.created_at,
      content
    })
  }

  const out = {}
  for (const s of sessions) {
    out[String(s.question_id)] = {
      currentLevel: s.current_level,
      solutionUnlocked: !!s.solution_unlocked,
      attemptCount: s.attempt_count,
      logs: logsByQuestion.get(s.question_id) || []
    }
  }
  return { sessions: out }
}

/** 学生对某条提示的评价（up/down） */
export async function sendFeedback({ userId, questionId, hintLogId, feedback }) {
  if (!['up', 'down'].includes(feedback)) throw new HintError('PARAM_ERROR', 400, 'feedback 须为 up 或 down')
  const result = await pool.query(
    'UPDATE hint_log SET feedback = ? WHERE id = ? AND user_id = ? AND question_id = ?',
    [feedback, hintLogId, userId, questionId]
  )
  if (result[0].affectedRows === 0) {
    throw new HintError('PARAM_ERROR', 400, '提示记录不存在')
  }
  return { updated: true }
}

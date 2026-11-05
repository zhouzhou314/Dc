/**
 * 演示数据初始化脚本（可选，不参与生产启动流程）
 * ================================================================
 * 用途：给教师端 / 学生画像 / 强化学习推荐准备一批"看起来真实"的数据，
 *       便于本地验收与软著材料的界面截图。
 *
 * 运行：node server/sql/seed-demo.js
 * 幂等：脚本会先删除同名演示账号及其全部业务数据，再重新生成
 *
 * 生成的账号（密码统一 demo123456）：
 *   teacher_demo   教师  2024级经济学1班
 *   student_a      学生  成绩较好、坚持逐级提示、两游戏都玩
 *   student_b      学生  中等水平、政策运用薄弱、只玩单机游戏
 *   student_c      学生  基础薄弱、提示依赖高、行为数据少
 *
 * 说明：数据由服务层真实写入（走 BKT / 节点掌握 / 事件流 / 游戏快照），
 *       不是直接 INSERT 假数据，因此与线上口径完全一致。
 */
import mysql from 'mysql2/promise'
import bcrypt from 'bcryptjs'
import { config } from '../config.js'
import { recordAnswer } from '../services/bktService.js'
import { recordNodeAnswer } from '../services/nodeMasteryService.js'
import { collectSignals } from '../services/profileService.js'
import { encodeState } from '../ml/encoder.js'
import { nodeOfQuestion, nodeIndex } from '../knowledge/graph.js'
import { computeReward, trainFromHistory, modelStatus } from '../services/rlService.js'
import { questionBank } from '../../src/data/questionBank.js'

/* 演示账号定义：accuracy 为每个学生的目标正确率，用于生成作答序列 */
const DEMO_USERS = [
  { username: 'teacher_demo', name: '王老师', role: 'teacher', class: '2024级经济学1班' },
  { username: 'student_a', name: '林晓', role: 'student', class: '2024级经济学1班', accuracy: 0.85 },
  { username: 'student_b', name: '陈默', role: 'student', class: '2024级经济学1班', accuracy: 0.6 },
  { username: 'student_c', name: '周然', role: 'student', class: '2024级经济学1班', accuracy: 0.3 }
]

/** 确定性随机（保证每次生成的数据一致，便于截图复现） */
let seed = 20260101
function rand() {
  seed = (seed * 1664525 + 1013904223) % 4294967296
  return seed / 4294967296
}

/** 直连数据库（脚本独立运行，不启动 Express） */
async function connect() {
  return mysql.createConnection({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: config.db.database,
    charset: 'utf8mb4'
  })
}

/** 删除同名演示账号及其业务数据 */
async function cleanup(conn, usernames) {
  const [rows] = await conn.query(
    `SELECT id FROM users WHERE username IN (${usernames.map(() => '?').join(',')})`,
    usernames
  )
  const ids = rows.map((r) => `u_${r.id}`)
  if (ids.length > 0) {
    const ph = ids.map(() => '?').join(',')
    for (const table of [
      'answer_record', 'mastery_state', 'node_mastery', 'hint_log', 'hint_session',
      'wrong_book', 'learning_event', 'game1_session', 'student_profile',
      'learning_advice', 'rl_transition', 'game_decision', 'game_chat'
    ]) {
      try {
        await conn.query(`DELETE FROM ${table} WHERE user_id IN (${ph})`, ids)
      } catch {
        /* 表不存在时跳过（例如尚未启用某模块） */
      }
    }
    await conn.query(`DELETE FROM game_room WHERE host_user_id IN (${ph})`, ids)
    await conn.query(`DELETE FROM users WHERE id IN (${ids.map((v) => v.slice(2)).join(',')})`)
  }
  console.log(`[seed] 已清理 ${ids.length} 个旧演示账号`)
}

/** 创建账号，返回 { id, bizId } */
async function createUser(conn, u) {
  const hash = await bcrypt.hash('demo123456', 10)
  const [res] = await conn.query(
    'INSERT INTO users (username, password_hash, display_name, role, class_name) VALUES (?, ?, ?, ?, ?)',
    [u.username, hash, u.name, u.role, u.class]
  )
  return { id: res.insertId, bizId: `u_${res.insertId}` }
}

/**
 * 为一名学生生成作答序列
 * 策略：按知识点轮转，accuracy 决定对错；每个知识点做 4~6 题，
 * 让掌握度曲线有上升过程（先错后对），画像更有层次。
 */
async function seedAnswers(conn, student) {
  const { bizId, accuracy } = student
  /* 按知识点分组题库，便于轮转 */
  const byTopic = new Map()
  for (const q of questionBank) {
    if (!byTopic.has(q.topic)) byTopic.set(q.topic, [])
    byTopic.get(q.topic).push(q)
  }
  const topics = [...byTopic.keys()]
  let total = 0
  let correct = 0

  for (let round = 0; round < 5; round++) {
    for (const topic of topics) {
      const pool = byTopic.get(topic)
      if (round >= pool.length) continue
      const q = pool[round]
      /* 前两轮更容易答错（模拟"学习中"），后面趋于目标正确率 */
      const bias = round < 2 ? -0.2 : 0.1
      const isCorrect = rand() < Math.max(0.05, Math.min(0.95, accuracy + bias))
      total += 1
      if (isCorrect) correct += 1

      /* 强化学习样本需要"作答前状态"，因此先编码一次（演示规模下可接受） */
      const stateBefore = encodeState(await collectSignals(bizId))

      await recordAnswer({
        userId: bizId,
        questionId: q.id,
        topic: q.topic,
        qType: q.type,
        difficulty: q.difficulty,
        isCorrect,
        studentAnswer: q.type === 'choice' ? { choice: isCorrect ? q.correct : (q.correct + 1) % 4 } : { y: 1200, r: 5.2 },
        durationMs: 12000 + Math.floor(rand() * 40000)
      })

      const nodeId = nodeOfQuestion(q.id)
      if (nodeId) {
        const nodeRes = await recordNodeAnswer({ userId: bizId, nodeId, topic: q.topic, isCorrect })
        /* 写一条完整转移 (s, a, r, s')，供离线训练使用 */
        const stateAfter = encodeState(await collectSignals(bizId))
        const reward = computeReward({
          prevPKnown: nodeRes.prevPKnown,
          pKnown: nodeRes.pKnown,
          isCorrect,
          difficulty: q.difficulty
        })
        await conn.query(
          `INSERT INTO rl_transition (user_id, state, action, node_id, reward, next_state, filled_at)
           VALUES (?, ?, ?, ?, ?, ?, NOW())`,
          [
            bizId,
            JSON.stringify(stateBefore.map((v) => Math.round(v * 10000) / 10000)),
            nodeIndex.get(nodeId) ?? 0,
            nodeId,
            reward,
            JSON.stringify(stateAfter.map((v) => Math.round(v * 10000) / 10000))
          ]
        )
      }

      /* 事件流：作答明细（教师端"最近行为"能看到） */
      await conn.query(
        `INSERT INTO learning_event (user_id, source, event_type, payload, duration_ms)
         VALUES (?, 'learning', 'learning.answer', ?, ?)`,
        [bizId, JSON.stringify({ questionId: q.id, topic: q.topic, isCorrect, nodeId }), 15000]
      )
    }
  }
  return { total, correct }
}

/** 生成游戏一对局快照 + 政策执行事件 */
async function seedGame1(conn, student, sessions = 2) {
  const { bizId, name } = student
  const cats = ['财政政策', '货币政策', '产业政策', '贸易政策']
  for (let s = 0; s < sessions; s++) {
    const score = 55 + Math.floor(rand() * 40)
    const kpiSeries = []
    for (let q = 0; q < 14; q++) {
      kpiSeries.push({
        quarter: q,
        label: `202${3 + Math.floor(q / 4)} Q${(q % 4) + 1}`,
        kpi: {
          g: 3 + rand() * 3,
          u: 4.5 + rand() * 2,
          pi: 1.5 + rand() * 2,
          r: 2 + rand() * 3,
          Y: 100 + rand() * 12,
          debt: 60 + q * 0.6,
          trust: 60 + rand() * 10
        }
      })
    }
    await conn.query(
      `INSERT INTO game1_session
         (user_id, nickname, mode, quarters, total_score, radar, kpi_series, achievements,
          policy_count, quiz_correct, quiz_total, started_at, finished_at)
       VALUES (?, ?, ?, 14, ?, ?, ?, ?, ?, ?, ?, DATE_SUB(NOW(), INTERVAL 2 HOUR), DATE_SUB(NOW(), INTERVAL 1 HOUR))`,
      [
        bizId, name, s === 0 ? 'learn' : 'sandbox', score,
        JSON.stringify({ growth: score, price: 60 + rand() * 30, job: 55 + rand() * 35, ext: 50 + rand() * 40 }),
        JSON.stringify(kpiSeries),
        JSON.stringify(['政策新手', s === 0 ? '增长奇迹' : '稳健舵手']),
        6 + s * 3, 3 + s, 5 + s
      ]
    )
  }

  /* 政策执行事件（画像里"偏好政策"与教师端行为流的数据来源） */
  for (let i = 0; i < 8; i++) {
    const cat = cats[i % cats.length]
    await conn.query(
      `INSERT INTO learning_event (user_id, source, event_type, payload)
       VALUES (?, 'game1', 'game1.policy', ?)`,
      [bizId, JSON.stringify({ quarter: i % 14, cardId: `card${i}`, name: `${cat}工具`, category: cat, effect: '演示数据' })]
    )
  }
  /* 季度结算事件 */
  for (let q = 0; q < 14; q += 3) {
    await conn.query(
      `INSERT INTO learning_event (user_id, source, event_type, payload)
       VALUES (?, 'game1', 'game1.quarter', ?)`,
      [bizId, JSON.stringify({ quarter: q, round: q + 1, kpi: { g: 4.2, u: 5.1, pi: 2.2, r: 3.4, Y: 104 } })]
    )
  }
}

/** 生成游戏二决策记录（多人博弈） */
async function seedGame2(conn, student, rounds = 6) {
  const { bizId, name } = student
  const roles = ['government', 'bank', 'enterprise', 'consumer']
  /* 造一个已结束的房间，作为这些决策的宿主 */
  const code = String(1000 + Math.floor(rand() * 8999))
  const [room] = await conn.query(
    `INSERT INTO game_room (room_code, host_user_id, status, total_rounds, final_metrics, report)
     VALUES (?, ?, 'finished', 3, ?, NULL)`,
    [code, bizId, JSON.stringify({ g: 4.5, u: 5.0, pi: 2.1, r: 0.032, Y: 310 })]
  )
  const roomId = room.insertId

  for (let i = 0; i < rounds; i++) {
    const role = roles[i % roles.length]
    await conn.query(
      `INSERT INTO game_decision (room_id, round_no, role, user_id, nickname, decision, metrics_after)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        roomId, Math.floor(i / 4) + 1, role, bizId, name,
        JSON.stringify(role === 'government' ? { dG: 6, dT: -2 } : role === 'bank' ? { dCredit: 4 } : role === 'enterprise' ? { dI0: 3 } : { dC0: 2 }),
        JSON.stringify({ g: 4.2 + i * 0.1, u: 5.1 - i * 0.05, pi: 2 + i * 0.05 })
      ]
    )
    await conn.query(
      `INSERT INTO learning_event (user_id, source, event_type, payload)
       VALUES (?, 'game2', 'game2.decision', ?)`,
      [bizId, JSON.stringify({ role, round: Math.floor(i / 4) + 1, changes: { dG: 6 } })]
    )
  }
}

/** 生成阶梯导学使用记录（不同学生提示依赖度不同） */
async function seedHints(conn, student, times) {
  const { bizId } = student
  for (let i = 0; i < times; i++) {
    const level = (i % 3) + 1
    await conn.query(
      `INSERT INTO hint_log (session_id, user_id, question_id, level, trigger_type, content, model_name, degraded)
       VALUES (?, ?, ?, ?, 'HINT_STEP', ?, 'mock', 0)`,
      [i + 1, bizId, (i % 8) + 1, level, JSON.stringify({ level, title: `演示提示 L${level}`, hint_body: '演示数据' })]
    )
  }
}

async function main() {
  const conn = await connect()
  try {
    await cleanup(conn, DEMO_USERS.map((u) => u.username))
    const created = []
    for (const u of DEMO_USERS) {
      const { id, bizId } = await createUser(conn, u)
      created.push({ ...u, id, bizId })
      console.log(`[seed] 创建账号 ${u.username}（${u.name}，${u.role}）id=${id}`)
    }

    for (const student of created.filter((u) => u.role === 'student')) {
      const stat = await seedAnswers(conn, student)
      await seedHints(conn, student, student.username === 'student_c' ? 9 : student.username === 'student_b' ? 4 : 1)
      const sessions = student.username === 'student_c' ? 1 : 2
      await seedGame1(conn, student, sessions)
      if (student.username !== 'student_b') await seedGame2(conn, student, student.username === 'student_a' ? 8 : 4)
      console.log(`[seed] ${student.name}：作答 ${stat.total} 题（正确 ${stat.correct}）`)
    }

    console.log('[seed] 完成。演示账号密码均为 demo123456')
    console.log('[seed] 教师账号 teacher_demo，学生账号 student_a / student_b / student_c')

    /* 用刚生成的转移样本预训练 DQN，让演示时已经是"已训练"状态 */
    console.log('[seed] 正在用演示样本预训练 DQN…')
    const train = await trainFromHistory(600)
    console.log('[seed] 训练完成：', JSON.stringify(train))
    const status = await modelStatus()
    console.log('[seed] 模型状态：', JSON.stringify(status))
  } finally {
    await conn.end()
  }
  /* 服务层的连接池（db.js）仍在，显式退出避免脚本挂起 */
  process.exit(0)
}

main().catch((e) => {
  console.error('[seed] 失败：', e)
  process.exit(1)
})

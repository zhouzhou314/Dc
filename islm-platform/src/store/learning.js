/**
 * 学习数据中心（全局单例 store）
 * -------------------------------------------------
 * 使用 Vue3 reactive 实现"迷你 Vuex"：整个应用共享一份响应式状态，
 * 并通过 watch 自动持久化到 localStorage，无需后端。
 *
 * 状态总览：
 *   studyLog   学习日志：按天记录刷题时长(秒)、做题数、错题数
 *   wrongBook  错题本：错题快照 + 错误原因 + 错误次数
 *   mastery    知识点掌握：每个知识点的答题正确/总数
 *   todos      待办任务清单
 *   courses    课程表（周循环）
 *   exams      作业/考试倒计时
 *   resources  学习资源库
 *   qaPosts    问答社区帖子
 */
import { reactive, watch } from 'vue'
import { loadLocal, saveLocal, todayStr, genId } from '@/utils/storage'
import { mockResources, mockQaPosts } from '@/data/mockData'
import { authStore } from '@/store/auth'
import { getWrongCloud, addWrongCloud, removeWrongCloud, setWrongReasonCloud } from '@/api/review'

/* 首次使用时：若 localStorage 中从未存过资源/社区数据，则写入示例数据 */
if (localStorage.getItem('islm_resources') === null) saveLocal('resources', mockResources)
if (localStorage.getItem('islm_qaPosts') === null) saveLocal('qaPosts', mockQaPosts)

/* ============================================
 * 初始状态：优先从 localStorage 恢复
 * ============================================ */
const state = reactive({
  // 学习日志：{ 'YYYY-MM-DD': { seconds: 累计秒数, done: 做题数, wrong: 错题数 } }
  studyLog: loadLocal('studyLog', {}),

  // 错题本：每条 = 题目完整快照（防题库改动）+ 个人作答信息
  wrongBook: loadLocal('wrongBook', []),

  // 知识点掌握：{ 知识点名: { correct: 正确次数, total: 总次数 } }
  mastery: loadLocal('mastery', {}),

  // 待办任务
  todos: loadLocal('todos', []),

  // 课程表：{ day: 0~6(周一~周日), start: '08:00', end: '09:40', name, room, teacher }
  courses: loadLocal('courses', []),

  // 作业/考试倒计时：{ id, title, type: 'exam'|'homework', date: 'YYYY-MM-DD', done }
  exams: loadLocal('exams', []),

  // 学习资源库：{ id, title, category, size, uploader, date, downloads, desc }
  resources: loadLocal('resources', []),

  // 问答社区：{ id, title, body, course, author, date, likes, answers: [{author, body, date, likes}] }
  qaPosts: loadLocal('qaPosts', [])
})

/* ============================================
 * 持久化：任何字段变化自动写回 localStorage
 * ============================================ */
for (const key of Object.keys(state)) {
  watch(
    () => state[key],
    (val) => saveLocal(key, val),
    { deep: true }
  )
}

/* ============================================
 * 学习日志相关方法
 * ============================================ */

/**
 * 累计今日学习记录（刷题结束时调用）
 * @param {{seconds:number, done:number, wrong:number}} delta 本次增量
 */
function addStudyLog(delta) {
  const t = todayStr()
  if (!state.studyLog[t]) state.studyLog[t] = { seconds: 0, done: 0, wrong: 0 }
  state.studyLog[t].seconds += delta.seconds || 0
  state.studyLog[t].done += delta.done || 0
  state.studyLog[t].wrong += delta.wrong || 0
}

/* ============================================
 * 知识点掌握相关方法
 * ============================================ */

/**
 * 记录一次知识点作答结果
 * @param {string} topic 知识点名称
 * @param {boolean} ok 是否答对
 */
function recordMastery(topic, ok) {
  if (!state.mastery[topic]) state.mastery[topic] = { correct: 0, total: 0 }
  state.mastery[topic].total += 1
  if (ok) state.mastery[topic].correct += 1
}

/**
 * 计算知识点掌握率（0~100）
 */
function masteryRate(topic) {
  const m = state.mastery[topic]
  if (!m || m.total === 0) return null
  return Math.round((m.correct / m.total) * 100)
}

/* ============================================
 * 错题本相关方法
 * ============================================ */

/**
 * 将错题收入错题本（已存在则错误次数+1并更新作答）
 * @param {Object} question 题库题目对象（完整快照存入）
 * @param {*} myAnswer 我的作答
 * @param {string} [reason] 错误原因
 */
function addWrong(question, myAnswer, reason = '') {
  const exist = state.wrongBook.find((w) => w.qid === question.id)
  if (exist) {
    exist.times += 1
    exist.myAnswer = myAnswer
    exist.reason = reason || exist.reason
    exist.time = Date.now()
  } else {
    state.wrongBook.unshift({
      qid: question.id,
      snap: { ...question }, // 题目快照（含题干/选项/答案/解析/考点等）
      myAnswer,
      reason,
      times: 1,
      time: Date.now()
    })
  }
  /* 登录用户同步云端（UPSERT，后端自动 times+1 并重置复习计划） */
  syncWrong(() => addWrongCloud({ questionId: question.id, snapshot: { ...question }, myAnswer, reason }))
}

/** 从错题本移除（掌握后手动移除） */
function removeWrong(qid) {
  const idx = state.wrongBook.findIndex((w) => w.qid === qid)
  if (idx > -1) state.wrongBook.splice(idx, 1)
  syncWrong(() => removeWrongCloud(qid)) // 云端同步（fire-and-forget）
}

/** 标注错误原因 */
function setWrongReason(qid, reason) {
  const w = state.wrongBook.find((x) => x.qid === qid)
  if (w) w.reason = reason
  syncWrong(() => setWrongReasonCloud(qid, reason))
}

/* ============================================
 * 云端同步（JWT 登录用户多端一致，大创"数据双模式"能力）
 * -------------------------------------------------
 * 设计原则：
 *  - fire-and-forget：所有云请求失败都静默吞掉，绝不阻塞本地体验
 *    （后端没启动 / 断网时行为与旧版完全一致）
 *  - 只有登录用户才同步，匿名用户保持纯 localStorage
 * ============================================ */

/** 已登录时执行一次云调用（返回 Promise，忽略一切错误） */
function syncWrong(fn) {
  if (!authStore.isLoggedIn()) return
  fn().catch(() => {}) // 静默：不弹错、不阻塞
}

/**
 * 登录后全量同步：本地 ↔ 云端错题本双向合并
 * 合并策略：同一题"云端 times 更大者胜"；本地独有 → 上传；云端独有 → 下载
 * 由 App.vue 在页面加载与登录成功后调用
 */
async function syncOnLogin() {
  if (!authStore.isLoggedIn()) return
  try {
    const res = await getWrongCloud()
    const cloudList = (res.data && res.data.data && res.data.data.list) || []
    const localMap = new Map(state.wrongBook.map((w) => [w.qid, w]))

    /* 1. 云端独有 / 云端更新 → 并入本地 */
    for (const c of cloudList) {
      const local = localMap.get(c.questionId)
      if (!local) {
        state.wrongBook.push({
          qid: c.questionId,
          snap: c.snapshot,
          myAnswer: c.myAnswer,
          reason: c.reason,
          times: c.times,
          time: c.lastReviewAt ? new Date(c.lastReviewAt).getTime() : Date.now()
        })
      } else if (c.times > local.times) {
        local.times = c.times
        local.myAnswer = c.myAnswer
        local.reason = c.reason
      }
    }

    /* 2. 本地独有 → 上传云端 */
    const cloudIds = new Set(cloudList.map((c) => c.questionId))
    for (const w of state.wrongBook) {
      if (!cloudIds.has(w.qid)) {
        addWrongCloud({ questionId: w.qid, snapshot: w.snap, myAnswer: w.myAnswer, reason: w.reason })
          .catch(() => {})
      }
    }
  } catch {
    /* 后端不可用：保持本地模式，静默即可 */
  }
}

/* ============================================
 * 待办任务
 * ============================================ */
function addTodo(text, plan = '') {
  state.todos.unshift({ id: genId(), text, plan, done: false, time: Date.now() })
}
function toggleTodo(id) {
  const t = state.todos.find((x) => x.id === id)
  if (t) t.done = !t.done
}
function removeTodo(id) {
  const idx = state.todos.findIndex((x) => x.id === id)
  if (idx > -1) state.todos.splice(idx, 1)
}

/* ============================================
 * 课程表 & 倒计时
 * ============================================ */
function addCourse(course) {
  state.courses.push({ ...course })
  // 按星期 + 开始时间排序，方便渲染
  state.courses.sort((a, b) => a.day - b.day || a.start.localeCompare(b.start))
}
function removeCourse(idx) {
  state.courses.splice(idx, 1)
}
function addExam(exam) {
  state.exams.unshift({ id: genId(), done: false, ...exam })
}
function removeExam(id) {
  const idx = state.exams.findIndex((x) => x.id === id)
  if (idx > -1) state.exams.splice(idx, 1)
}

/* ============================================
 * 资源库 & 问答社区
 * ============================================ */
function addResource(res) {
  state.resources.unshift({ id: genId(), date: todayStr(), downloads: 0, ...res })
}
function downloadResource(id) {
  const r = state.resources.find((x) => x.id === id)
  if (r) r.downloads += 1
}
function removeResource(id) {
  const idx = state.resources.findIndex((x) => x.id === id)
  if (idx > -1) state.resources.splice(idx, 1)
}

function addQaPost(post) {
  state.qaPosts.unshift({
    id: genId(),
    likes: 0,
    answers: [],
    date: todayStr(),
    author: '我',
    ...post
  })
}
function addQaAnswer(postId, body) {
  const p = state.qaPosts.find((x) => x.id === postId)
  if (p) p.answers.push({ id: genId(), author: '我', body, date: todayStr(), likes: 0 })
}
function likeQaPost(postId) {
  const p = state.qaPosts.find((x) => x.id === postId)
  if (p) p.likes += 1
}
function likeQaAnswer(postId, ansId) {
  const p = state.qaPosts.find((x) => x.id === postId)
  const a = p && p.answers.find((x) => x.id === ansId)
  if (a) a.likes += 1
}

/* ============================================
 * 导出全局单例（所有视图共用同一份状态）
 * ============================================ */
export const store = state

/** App.vue 启动时调用：登录状态下拉取云端错题本与本地合并（具名导出便于直接 import） */
export { syncOnLogin }

export const learningStore = {
  state,
  addStudyLog,
  recordMastery,
  masteryRate,
  addWrong,
  removeWrong,
  setWrongReason,
  syncOnLogin,
  addTodo,
  toggleTodo,
  removeTodo,
  addCourse,
  removeCourse,
  addExam,
  removeExam,
  addResource,
  downloadResource,
  removeResource,
  addQaPost,
  addQaAnswer,
  likeQaPost,
  likeQaAnswer
}

<template>
  <div class="hint-panel">
    <!-- 通道说明 -->
    <div class="hp-note">
      💡 提示由 AI 分层生成（层级越高越接近答案）；提交作答后可查看官方解析。
    </div>

    <!-- 历史提示卡片（数据源：hint_log，刷新后自动恢复） -->
    <div
      v-for="log in logs"
      :key="log.id"
      class="hp-card"
      :class="{ 'hp-card-l4': log.level === 4 }"
    >
      <div class="hp-card-head">
        <el-tag :type="levelTag[log.level]?.type || 'info'" size="small" effect="dark">
          {{ levelTag[log.level]?.label || ('层级' + log.level) }}
        </el-tag>
        <el-tag v-if="log.degraded" type="info" size="small" effect="plain">知识卡（离线直出）</el-tag>
        <span class="hp-card-time">{{ formatTime(log.createdAt) }}</span>
      </div>

      <!-- L1~L3：提示正文 + 思路步骤 -->
      <template v-if="log.level <= 3">
        <div class="hp-body" v-html="log.content?.hintBody"></div>
        <ol v-if="log.content?.steps?.length" class="hp-steps">
          <li
            v-for="(s, si) in log.content.steps"
            :key="si"
            :class="{ 'hp-blank': s.includes('❓') }"
          >{{ s }}</li>
        </ol>
      </template>

      <!-- L4：完整解析 -->
      <template v-else>
        <div v-if="log.content?.solution" class="hp-solution">
          <div class="hp-sol-answer">✔ 答案：{{ log.content.solution.answer }}</div>
          <pre class="hp-sol-process">{{ log.content.solution.process }}</pre>
          <div v-if="log.content.solution.meaning" class="hp-sol-meaning">
            📖 经济学含义：{{ log.content.solution.meaning }}
          </div>
          <div v-if="log.content.solution.pitfalls?.length" class="hp-sol-pitfalls">
            ⚠ 易错点：
            <ul><li v-for="(p, pi) in log.content.solution.pitfalls" :key="pi">{{ p }}</li></ul>
          </div>
        </div>
      </template>

      <!-- 引导问题 + 反馈 -->
      <div v-if="log.content?.guidingQuestion" class="hp-guide">
        🤔 {{ log.content.guidingQuestion }}
      </div>
      <div v-if="log.level <= 3" class="hp-feedback">
        <el-button text size="small" :type="log.content?._fb === 'up' ? 'primary' : 'default'" @click="onFeedback(log, 'up')">👍 有帮助</el-button>
        <el-button text size="small" @click="onFeedback(log, 'down')">👎 没帮助</el-button>
      </div>
    </div>

    <!-- 流式生成中的卡片（打字机效果；完成后 emit refresh 用持久化卡片替换） -->
    <div v-if="streaming" class="hp-card" :class="{ 'hp-card-l4': streaming.level === 4 }">
      <div class="hp-card-head">
        <el-tag :type="levelTag[streaming.level]?.type || 'info'" size="small" effect="dark">
          {{ levelTag[streaming.level]?.label || '正在生成' }}
        </el-tag>
        <el-tag v-if="streaming.degraded" type="info" size="small" effect="plain">知识卡（离线直出）</el-tag>
        <span class="hp-card-time">正在生成…</span>
      </div>
      <div class="hp-body streaming" v-html="streaming.body"></div>
      <ol v-if="streaming.steps?.length" class="hp-steps">
        <li
          v-for="(s, si) in streaming.steps"
          :key="si"
          :class="{ 'hp-blank': s.includes('❓') }"
        >{{ s }}</li>
      </ol>
      <div v-if="streaming.guidingQuestion" class="hp-guide">🤔 {{ streaming.guidingQuestion }}</div>
    </div>

    <!-- 困惑输入（已解锁至少一层且未看完整解析时提供） -->
    <div v-if="currentLevel >= 1 && currentLevel <= 3" class="hp-confusion">
      <el-input
        v-model="confusionText"
        type="textarea"
        :rows="2"
        maxlength="200"
        placeholder="我卡在哪里……（可选：描述你的困惑，AI 会结合它重新检索知识库给出提示）"
      />
      <el-button
        size="small"
        plain
        type="primary"
        :loading="loading"
        :disabled="!confusionText.trim()"
        class="hp-confusion-btn"
        @click="onConfusionRetry"
      >
        按我的困惑重新提示
      </el-button>
    </div>

    <!-- 按钮区（状态机） -->
    <div class="hp-actions">
      <el-button
        v-if="currentLevel < 3 && !hideGetHint"
        type="primary"
        size="small"
        :loading="loading"
        @click="onGetHint"
      >
        {{ getHintText }}
      </el-button>
      <el-button
        v-if="currentLevel >= 3 && !solutionUnlocked"
        size="small"
        disabled
      >
        渐进提示已到顶，可查看完整解析
      </el-button>
      <el-button
        size="small"
        type="warning"
        :disabled="solutionUnlocked"
        @click="onGetSolution"
      >
        {{ solutionUnlocked ? '已查看完整解析' : '查看完整解析' }}
      </el-button>
      <span v-if="loading" class="hp-loading">正在生成提示…</span>
    </div>
  </div>
</template>

<script setup>
/**
 * 阶梯导学面板（每道习题一个实例）
 * -------------------------------------------------
 * - 数据流：自身不存状态，全部由 props(session) 驱动；
 *   任何写操作成功后 emit('refresh')，由父组件重新拉取全量状态
 * - 按钮状态机：
 *     currentLevel 0~2 且未答对 → 【获取提示】可点（逐级 +1）
 *     currentLevel 3 → 【获取提示】消失，换成置灰说明
 *     【查看完整解析】始终可见，需确认弹窗，解锁后置灰
 */
import { ref, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { getHint, getSolution, sendFeedback, streamHint } from '@/api/hint'

const props = defineProps({
  question: { type: Object, required: true },   // chapter11.exercises 中的一题
  session: { type: Object, default: null },     // 该题导学会话（含 currentLevel/logs）
  studentAnswer: { type: Object, default: null }, // 作答快照 {choice} 或 {y, r}
  judgeResult: { type: String, default: 'unsolved' }, // correct / wrong / unsolved
  hideGetHint: { type: Boolean, default: false } // 提交答对后隐藏"获取提示"
})
const emit = defineEmits(['refresh'])

/* ---------- 状态 ---------- */
const loading = ref(false)
const confusionText = ref('')
const streaming = ref(null) // 流式生成中的卡片 { level, body, steps, guidingQuestion, degraded }

const currentLevel = computed(() => props.session?.currentLevel ?? 0)
const solutionUnlocked = computed(() => props.session?.solutionUnlocked ?? false)
const logs = computed(() => props.session?.logs ?? [])

/* ---------- 样式映射 ---------- */
const levelTag = {
  1: { label: '提示一 · 方向', type: 'primary' },
  2: { label: '提示二 · 关键条件与知识点', type: 'success' },
  3: { label: '提示三 · 思路框架（含留白）', type: 'warning' },
  4: { label: '完整解析', type: 'danger' }
}
const getHintText = computed(() =>
  currentLevel.value === 0 ? '获取提示' : currentLevel.value === 1 ? '再给我一点提示' : '继续提示（关键步骤）'
)

/* ---------- 行为 ---------- */

/**
 * 流式获取提示（打字机效果）：POST /api/hint/stream
 * 事件流 meta（结构化载荷）→ delta*（hint_body 分段）→ done / error
 * 安全链路（泄露校验/重试/降级）在后端对完整文本执行后才回放，前端只负责呈现。
 * @param {string} text 困惑文本（空 = 逐级提示）
 * @returns {Promise<boolean>} true=流式走完（含 LEVEL_LOCKED 等业务性终止）；false=需回落旧接口
 */
function streamHintFlow(text = '') {
  return new Promise(resolve => {
    let settled = false
    const finish = ok => { if (!settled) { settled = true; resolve(ok) } }
    streaming.value = { level: null, body: '', steps: [], guidingQuestion: '', degraded: false }
    streamHint(
      {
        userId: sessionUserId(),
        questionId: props.question.id,
        confusionText: text,
        studentAnswer: props.studentAnswer,
        judgeResult: props.judgeResult
      },
      (event, payload) => {
        if (event === 'meta') {
          /* meta 先到：卡片框架（层级标签/步骤/引导问题）立即就位 */
          Object.assign(streaming.value, {
            level: payload.level,
            degraded: payload.degraded,
            steps: payload.steps || [],
            guidingQuestion: payload.guidingQuestion || ''
          })
        } else if (event === 'delta') {
          streaming.value.body += payload.text || ''
        } else if (event === 'done') {
          streaming.value = null
          emit('refresh') // 拉取持久化后的完整卡片（含反馈按钮）
          finish(true)
        } else if (event === 'error') {
          streaming.value = null
          if (payload.code === 'LEVEL_LOCKED') {
            ElMessage.info(payload.message || '渐进提示已到顶，可查看完整解析')
            emit('refresh')
            finish(true) // 业务性终止，无需回落
          } else {
            finish(false) // 服务异常 → 回落旧接口
          }
        }
      }
    ).catch(() => {
      /* fetch 层失败（后端关闭/断网）：清掉半截卡片，走旧接口兜底 */
      streaming.value = null
      finish(false)
    })
  })
}

/** 逐级获取提示：优先流式打字机，失败回落旧接口（后端关闭时体验零破坏） */
async function onGetHint() {
  loading.value = true
  try {
    const ok = await streamHintFlow('')
    if (!ok) {
      const res = await getHint(sessionUserId(), props.question.id, '', props.studentAnswer, props.judgeResult)
      if (!res.data?.success) throw res.data
      emit('refresh')
    }
  } catch (e) {
    showApiError(e)
  } finally {
    loading.value = false
  }
}

/** 困惑重试：后端用困惑文本重跑检索并按当前层级重新生成（层级不递增，同样走流式） */
async function onConfusionRetry() {
  const text = confusionText.value.trim()
  loading.value = true
  try {
    const ok = await streamHintFlow(text)
    if (!ok) {
      const res = await getHint(sessionUserId(), props.question.id, text, props.studentAnswer, props.judgeResult)
      if (!res.data?.success) throw res.data
      emit('refresh')
    }
    confusionText.value = ''
    ElMessage.success('已按你的困惑重新生成提示')
  } catch (e) {
    showApiError(e)
  } finally {
    loading.value = false
  }
}

/** 查看完整解析：二次确认 → 请求 L4（confirm:true 后端兜底校验） */
async function onGetSolution() {
  try {
    await ElMessageBox.confirm(
      '确认查看完整解析吗？系统将记录你查看了本题答案，建议先用完 3 层提示。',
      '查看完整解析',
      { confirmButtonText: '确认查看', cancelButtonText: '再想想', type: 'warning' }
    )
  } catch {
    return // 用户取消
  }
  loading.value = true
  try {
    const res = await getSolution(props.sessionUserId(), props.question.id)
    if (!res.data?.success) throw res.data
    emit('refresh')
  } catch (e) {
    showApiError(e)
  } finally {
    loading.value = false
  }
}

/** 提示反馈（有帮助/没帮助），反馈结果落库用于学习行为分析 */
async function onFeedback(log, val) {
  try {
    const res = await sendFeedback(props.sessionUserId(), props.question.id, log.id, val)
    if (!res.data?.success) throw res.data
    log.content._fb = val // 仅本地高亮，不做复杂状态
    ElMessage.success('感谢反馈')
  } catch (e) {
    showApiError(e)
  }
}

/** 从注入读取 userId（由 Chapter11View provide） */
function sessionUserId() {
  return userIdKey.value
}
const userIdKey = injectUserId()

import { inject } from 'vue'
function injectUserId() {
  return inject('hintUserId', ref(''))
}

/** 统一错误提示：绝不把任何答案内容当作错误信息展示 */
function showApiError(e) {
  const code = e?.code || e?.response?.data?.code
  const msg = e?.message || e?.response?.data?.message
  if (code === 'LEVEL_LOCKED') {
    ElMessage.info(msg || '渐进提示已到顶，可查看完整解析')
  } else if (code === 'LLM_ERROR' || code === 'DB_ERROR') {
    ElMessage.error('导学服务暂时不可用，请稍后再试')
  } else {
    ElMessage.error(msg || '请求失败，请稍后再试')
  }
}

/** 时间显示（ hint_log.created_at ） */
function formatTime(t) {
  if (!t) return ''
  return String(t).slice(5, 16).replace('T', ' ')
}
</script>

<style scoped>
.hint-panel {
  margin-top: 12px;
  padding: 12px 14px;
  background: #fafbff;
  border: 1px dashed #c9d6f2;
  border-radius: 8px;
}
.hp-note {
  font-size: 12.5px;
  color: #8a94b8;
  margin-bottom: 10px;
}
.hp-card {
  padding: 10px 12px;
  margin-bottom: 10px;
  background: #fff;
  border: 1px solid #e4e9f5;
  border-left: 4px solid #409eff;
  border-radius: 8px;
}
.hp-card-l4 {
  border-left-color: #e6a23c;
  background: #fffaf3;
}
.hp-card-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.hp-card-time {
  font-size: 12px;
  color: #a0a6bb;
  margin-left: auto;
}
.hp-body {
  font-size: 13.5px;
  color: #303133;
  line-height: 1.8;
}
.hp-steps {
  margin: 8px 0 0 20px;
  font-size: 13.5px;
  color: #303133;
  line-height: 1.9;
}
.hp-blank {
  background: #fdf6ec;
  border-radius: 4px;
  padding: 2px 6px;
  color: #7a5a1e;
}
.hp-sol-answer {
  font-size: 14px;
  font-weight: 700;
  color: #b7721b;
  margin-bottom: 6px;
}
.hp-sol-process {
  margin: 6px 0;
  padding: 10px 12px;
  background: #f8f6f0;
  border-radius: 6px;
  font-family: inherit;
  font-size: 13px;
  line-height: 1.8;
  color: #4a4a4a;
  white-space: pre-wrap;
}
.hp-sol-meaning {
  font-size: 13px;
  color: #4a5a7a;
  line-height: 1.7;
}
.hp-sol-pitfalls {
  margin-top: 6px;
  font-size: 13px;
  color: #a15a2a;
}
.hp-sol-pitfalls ul { margin: 4px 0 0 20px; }
.hp-guide {
  margin-top: 8px;
  padding: 8px 12px;
  background: #fdf6ec;
  border-left: 4px solid #e6a23c;
  border-radius: 6px;
  font-size: 13px;
  color: #7a5a1e;
  line-height: 1.7;
}
.hp-feedback {
  margin-top: 6px;
  display: flex;
  gap: 4px;
}
.hp-confusion {
  margin: 10px 0;
}
.hp-confusion-btn {
  margin-top: 8px;
}
.hp-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 6px;
}
.hp-loading {
  font-size: 12.5px;
  color: #909399;
}
/* 流式打字机光标（生成中卡片末尾闪烁竖块） */
.hp-body.streaming::after {
  content: '▍';
  color: #409eff;
  animation: hp-cursor-blink 0.9s infinite;
}
@keyframes hp-cursor-blink {
  50% { opacity: 0.15; }
}
</style>

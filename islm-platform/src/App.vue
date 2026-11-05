<!--
  ================================================================
  辅助学习系统 · 根组件（V6.0）
  ----------------------------------------------------------------
  系统由三大板块组成：
    ① 游戏：游戏一（单机政策模拟 Game1View）+ 游戏二（多人博弈）
    ② 知识学习：章节学习 / 题库 / 错题本 / 知识图谱 …
    ③ AI：学生画像与学习建议（StudentProfileView）+ AI 助手 + 教师端

  视图切换方式：状态机（不引入 vue-router），每个视图一个字符串 key。
  ----------------------------------------------------------------
  责任边界：
    · App 只做"视图编排 + 全局事件汇聚"，不承载业务逻辑；
    · 游戏一的内核事件由 Game1View emit 上来，这里统一转成
      两条数据：learning_event（过程，走 reportEvent）
                game1_session（结果，走 saveGame1Session）；
    · 页面卸载/隐藏时统一 flush 事件队列，避免丢最后一批操作。
================================================================ -->
<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import HomeView from './views/HomeView.vue'
import Chapter11View from './views/learning/Chapter11View.vue'
import ExerciseView from './views/learning/ExerciseView.vue'
import WrongBookView from './views/learning/WrongBookView.vue'
import ScheduleView from './views/learning/ScheduleView.vue'
import StatsView from './views/learning/StatsView.vue'
import ResourceView from './views/learning/ResourceView.vue'
import CommunityView from './views/learning/CommunityView.vue'
import KnowledgeGraphView from './views/learning/KnowledgeGraphView.vue'
import AiAssistantView from './views/ai/AiAssistantView.vue'
import StudentProfileView from './views/ai/StudentProfileView.vue'
import LoginView from './views/common/LoginView.vue'
import Game1View from './views/game/Game1View.vue'
import Game2LobbyView from './views/game/Game2LobbyView.vue'
import Game2RoomView from './views/game/Game2RoomView.vue'
import TeacherView from './views/teacher/TeacherView.vue'
import { authStore } from '@/store/auth'
import { syncOnLogin } from '@/store/learning'
import { reportEvent, installEventFlusher, flushEvents } from '@/api/event'
import { saveGame1Session } from '@/api/game1'
import { createGame1Recorder, withNickname } from '@/utils/game1Recorder'

/** 当前视图标识 */
const currentView = ref('home')
/** 当前打开的章节 id */
const currentChapter = ref(null)
/** 当前多人博弈房间码 */
const currentGameCode = ref(null)

/** 游戏一记录器（跨事件累计本局统计） */
const game1Recorder = createGame1Recorder()

/* ================= 页面导航 ================= */

/** 打开章节学习页 */
function openChapter(chapterId) {
  currentChapter.value = chapterId || 'ch11'
  currentView.value = 'chapter'
  window.scrollTo(0, 0)
}

/** 打开功能页面（首页宫格与各页"去完成"入口都走这里） */
function openPage(page) {
  /* 章节学习依赖 chapterId，这里补一个默认值，避免从宫格进入时白屏 */
  if (page === 'chapter') return openChapter(currentChapter.value || 'ch11')
  currentView.value = page
  window.scrollTo(0, 0)
}

/** 进入多人博弈房间（大厅 → 主界面） */
function enterGame(code) {
  currentGameCode.value = code
  currentView.value = 'game-room'
  window.scrollTo(0, 0)
}

/** 统一返回首页 */
function backHome() {
  /* 返回前把未上报的事件发出去（游戏中途退出也不丢数据） */
  flushEvents(true)
  currentView.value = 'home'
  currentChapter.value = null
  currentGameCode.value = null
  window.scrollTo(0, 0)
}

/* ================= 游戏一数据上报 ================= */

/** 学生昵称（匿名时给空串，由组件显示"匿名学生"） */
function currentNickname() {
  return (authStore.state.user && (authStore.state.user.displayName || authStore.state.user.username)) || ''
}

/**
 * 接收 Game1View 抛上来的内核事件
 * @param {{type:string, payload:object}} evt
 */
function onGame1Event(evt) {
  if (!evt || !evt.type) return
  /* ① 过程：写事件流（AI 画像读取"游戏中的操作"就靠这里） */
  reportEvent('game1', evt.type, evt.payload)
  /* ② 结果：结算时把整局快照写 game1_session */
  const session = game1Recorder.handle(evt.type, evt.payload)
  if (session) {
    saveGame1Session(withNickname(session, currentNickname())).catch(() => {
      /* 后端不可用时静默失败：不影响学生继续游戏 */
    })
  }
}

/* ================= 生命周期 ================= */

onMounted(async () => {
  await authStore.checkToken()
  syncOnLogin()
  installEventFlusher()
})

onBeforeUnmount(() => {
  flushEvents(true)
})
</script>

<template>
  <!-- 首页 -->
  <HomeView v-if="currentView === 'home'" @open-chapter="openChapter" @open-page="openPage" />

  <!-- ① 游戏板块 -->
  <Game1View
    v-else-if="currentView === 'game1'"
    @back="backHome"
    @event="onGame1Event"
  />
  <Game2LobbyView
    v-else-if="currentView === 'game2'"
    @back="backHome"
    @enter="enterGame"
  />
  <Game2RoomView
    v-else-if="currentView === 'game-room'"
    :code="currentGameCode"
    @back="backHome"
    @again="() => currentView = 'game2'"
  />

  <!-- ② 知识学习板块 -->
  <Chapter11View v-else-if="currentView === 'chapter'" @back="backHome" />
  <ExerciseView v-else-if="currentView === 'exercise'" @back="backHome" />
  <KnowledgeGraphView
    v-else-if="currentView === 'knowledge'"
    @back="backHome"
    @open-page="openPage"
    @open-chapter="openChapter"
  />
  <WrongBookView v-else-if="currentView === 'wrongbook'" @back="backHome" />
  <ScheduleView v-else-if="currentView === 'schedule'" @back="backHome" />
  <StatsView v-else-if="currentView === 'stats'" @back="backHome" />
  <ResourceView v-else-if="currentView === 'resource'" @back="backHome" />
  <CommunityView v-else-if="currentView === 'community'" @back="backHome" />

  <!-- ③ AI 板块 -->
  <StudentProfileView
    v-else-if="currentView === 'profile'"
    @back="backHome"
    @open-page="openPage"
    @open-chapter="openChapter"
  />
  <AiAssistantView v-else-if="currentView === 'ai'" @back="backHome" />
  <TeacherView v-else-if="currentView === 'teacher'" @back="backHome" @open-page="openPage" />

  <!-- 账号 -->
  <LoginView v-else-if="currentView === 'login'" @back="backHome" />
</template>

<!--
  多人博弈游戏 · 大厅
  功能：创建房间（可选 AI 补位）/ 输入房间码加入 / 简单玩法说明
  进入后跳转到 GameRoomView 游戏主界面
-->
<template>
  <div class="lobby-container">
    <div class="lobby-header">
      <el-button round @click="$emit('back')">← 返回首页</el-button>
      <h1 class="lobby-title">🏛️ 多人博弈 · 宏观决策沙盘</h1>
      <p class="lobby-sub">4 人分饰政府（含央行）、银行、企业、消费者，亲手推动 IS-LM 曲线，体验政策传导与权衡取舍</p>
    </div>

    <div class="lobby-body">
      <!-- 左侧：创建 / 加入 -->
      <div class="lobby-panel">
        <el-card shadow="hover" class="panel-card">
          <template #header><span class="panel-title">🎮 进入对局</span></template>

          <!-- 昵称 -->
          <el-form label-position="top">
            <el-form-item label="你的昵称">
              <el-input v-model="nickname" placeholder="例如：张三" maxlength="20" />
            </el-form-item>

            <!-- 创建房间 -->
            <el-divider content-position="left">创建新房间</el-divider>
            <div class="create-row">
              <div class="round-select">
                <span class="opt-label">回合数</span>
                <el-radio-group v-model="rounds" size="small">
                  <el-radio-button :value="2">2 回合</el-radio-button>
                  <el-radio-button :value="3">3 回合</el-radio-button>
                  <el-radio-button :value="4">4 回合</el-radio-button>
                </el-radio-group>
              </div>
              <el-checkbox v-model="aiFill">🤖 空缺角色由 AI 补位（推荐单人体验）</el-checkbox>
              <el-button type="primary" size="large" class="lobby-btn" :disabled="!nickname.trim()" @click="createRoom">
                🚀 创建房间
              </el-button>
            </div>

            <!-- 加入房间 -->
            <el-divider content-position="left">加入已有房间</el-divider>
            <div class="join-row">
              <el-input v-model="joinCode" placeholder="输入 4 位房间码" maxlength="4" class="join-input"
                @keyup.enter="joinRoom" />
              <el-button type="success" size="large" :disabled="!nickname.trim() || joinCode.length !== 4" @click="joinRoom">
                👋 加入房间
              </el-button>
            </div>
          </el-form>
        </el-card>
      </div>

      <!-- 右侧：玩法说明 -->
      <div class="lobby-side">
        <el-card shadow="hover" class="side-card">
          <template #header><span class="panel-title">📖 玩法说明</span></template>
          <div class="howto">
            <div class="howto-step">
              <div class="step-no">1</div>
              <div><b>分角色</b>：4 人各扮政府（含央行）/ 银行 / 企业 / 消费者，各自看到不同的决策面板</div>
            </div>
            <div class="howto-step">
              <div class="step-no">2</div>
              <div><b>看事件</b>：系统发布新闻事件（如"出口订单大幅下降"），经济指标与曲线同步变化</div>
            </div>
            <div class="howto-step">
              <div class="step-no">3</div>
              <div><b>协商与决策</b>：公共聊天协商策略，按"政府→银行→企业→消费者"轮流提交决策</div>
            </div>
            <div class="howto-step">
              <div class="step-no">4</div>
              <div><b>看反馈</b>：系统计算新均衡，展示三层理论反馈（结论→传导链→理论出处）</div>
            </div>
            <div class="howto-step">
              <div class="step-no">5</div>
              <div><b>通关判定</b>：GDP 增速回到 5.5%~6.5% 区间即通关，生成五维雷达评分</div>
            </div>
          </div>
        </el-card>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { ElMessage } from 'element-plus'
import { authStore } from '@/store/auth'
import { connect, onState, onError, onNotice, rememberRoom, gameActions } from '@/api/gameSocket'

const emit = defineEmits(['back', 'enter'])

const nickname = ref(authStore.state.user?.displayName || authStore.state.user?.username || '')
const rounds = ref(3)
const aiFill = ref(true)
const joinCode = ref('')

/* 进入对局后监听 state，检测到自己已入房则跳转 */
let offState = null
let offError = null
let offNotice = null

function createRoom() {
  gameActions.create(nickname.value.trim(), rounds.value, aiFill.value)
}

function joinRoom() {
  gameActions.join(joinCode.value.toUpperCase().trim(), nickname.value.trim())
}

onMounted(() => {
  connect()
  offError = onError((msg) => ElMessage.error(msg))
  offNotice = onNotice((n) => {
    if (n.kind === 'created' || n.kind === 'joined') {
      rememberRoom(n.code, nickname.value.trim())
    }
  })
  /* 进入对局后监听 state，检测到自己已入房（waiting/running）则跳转游戏界面（一次性守卫） */
  let entered = false
  offState = onState((view) => {
    if (entered) return
    if (view.code && (view.status === 'waiting' || view.status === 'running')) {
      entered = true
      emit('enter', view.code)
    }
  })
})

onBeforeUnmount(() => {
  offState && offState()
  offError && offError()
  offNotice && offNotice()
})
</script>

<style scoped>
.lobby-container {
  max-width: 1100px;
  margin: 0 auto;
  padding: 24px 20px;
  min-height: 100vh;
  background: linear-gradient(135deg, #f5f7fa 0%, #e4e8f0 100%);
  font-family: 'Microsoft YaHei', 'PingFang SC', sans-serif;
}
.lobby-header { text-align: center; margin-bottom: 24px; position: relative; }
.lobby-header .el-button { position: absolute; left: 0; top: 0; }
.lobby-title { font-size: 30px; margin: 0 0 8px; color: #303133; }
.lobby-sub { color: #909399; margin: 0; }
.lobby-body { display: flex; gap: 20px; flex-wrap: wrap; }
.lobby-panel { flex: 1 1 480px; }
.lobby-side { flex: 1 1 320px; }
.panel-title { font-weight: bold; color: #303133; }
.create-row { display: flex; flex-direction: column; gap: 14px; }
.opt-label { margin-right: 10px; color: #606266; font-size: 14px; }
.round-select { display: flex; align-items: center; }
.lobby-btn { width: 100%; margin-top: 4px; }
.join-row { display: flex; gap: 10px; }
.join-input { flex: 1; text-transform: uppercase; letter-spacing: 4px; font-weight: bold; }
.howto { display: flex; flex-direction: column; gap: 16px; }
.howto-step { display: flex; gap: 12px; align-items: flex-start; }
.step-no {
  flex: 0 0 28px; height: 28px; border-radius: 50%;
  background: linear-gradient(135deg, #667eea, #764ba2); color: #fff;
  display: flex; align-items: center; justify-content: center; font-weight: bold;
}
.howto-step b { color: #303133; }
.howto-step div:last-child { color: #606266; font-size: 14px; line-height: 1.6; }
</style>

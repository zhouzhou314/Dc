<!--
  游戏一 · 经济舵手 Macro Pilot
  ---------------------------------------------------------
  来源：D:\HZYJ\game1（纯 HTML/CSS/JS 单机教学 Demo）
  移植要点：
    1. template 内逐字保留原 index.html <body> 的全部 DOM 结构与 id / class / 文案，
       最外层套 .game1-view（供 mountGame1 做 root 作用域查询），
       内层 .game1-stage 承载原深色游戏舞台（外层仍是站点的浅色底）；
    2. 不用 scoped：原 DOM 大量由 JS 动态生成，scoped 属性选择器命中不到，
       样式隔离改由 src/game1/style.css 的 .game1-view 前缀完成；
    3. 事件双向：mountGame1 的 onEvent 既通过 emit('event') 抛给父组件，
       也在 game1.finish 时额外走 emit('finish')，便于父组件做结算处理。
-->
<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { mountGame1 } from '../../game1/index.js'
/* 原 style.css 已整体加 .game1-view 前缀，这里直接引入（非 scoped，保证动态 DOM 也能命中） */
import '../../game1/style.css'

const emit = defineEmits(['back', 'event', 'finish'])

/* 游戏容器（mountGame1 的 root，所有 DOM 查询的作用域根） */
const rootEl = ref(null)
/* 右上角显示的学生昵称 */
const studentName = ref('匿名学生')

/* mountGame1 返回的实例（保存以便卸载时 destroy） */
let instance = null

/**
 * 读取当前学生档案
 * islm-auth 结构：{ token, user: { id, username, displayName } }
 * 解析失败 / 未登录 → 匿名学生
 */
function readProfile() {
  try {
    const raw = localStorage.getItem('islm_auth')
    if (!raw) return { displayName: '匿名学生' }
    const auth = JSON.parse(raw)
    const displayName = auth && auth.user && auth.user.displayName
    return { displayName: displayName || '匿名学生' }
  } catch (e) {
    return { displayName: '匿名学生' }
  }
}

/**
 * 事件转发：游戏内核上报 → 组件 emit
 * @param {string} type    game1.start / game1.policy / game1.quiz / game1.quarter / game1.wrongbook / game1.finish
 * @param {object} payload 纯 JSON 载荷
 */
function handleEvent(type, payload) {
  emit('event', { type, payload })
  if (type === 'game1.finish') emit('finish', payload)
}

onMounted(() => {
  const profile = readProfile()
  studentName.value = profile.displayName
  instance = mountGame1({
    root: rootEl.value,
    onEvent: handleEvent,
    profile,
  })
})

/* 卸载：彻底清理监听 / 定时器 / 动画，保证再次进入不重复绑定 */
onBeforeUnmount(() => {
  if (instance) {
    instance.destroy()
    instance = null
  }
})

/* 父组件如需读取当前局面（只读快照），可直接调用 */
defineExpose({
  getState: () => (instance ? instance.getState() : null),
})
</script>

<template>
  <div class="game1-view" ref="rootEl">

    <!-- 顶部返回栏（开始界面同样可见） -->
    <header class="g1-return-bar">
      <button class="g1-back" type="button" @click="$emit('back')">← 返回首页</button>
      <div class="g1-titles">
        <h1 class="g1-title">🎮 游戏一 · 经济舵手 Macro Pilot</h1>
        <p class="g1-sub">宏观经济政策模拟 · 14 个季度 · 44 张政策卡</p>
      </div>
      <div class="g1-user">👤 {{ studentName }}</div>
    </header>

    <!-- 深色游戏舞台：原 index.html <body> 的全部结构 -->
    <div class="game1-stage">

      <!-- ===================== 开始界面 ===================== -->
      <div id="start-screen">
        <div class="start-box paper-note">
          <h1>🛞 经济舵手 <span class="en">Macro Pilot</span></h1>
          <p class="subtitle">—— 宏观经济政策模拟 · 经济学本科生教学 Demo ——</p>
          <ul class="feature-list">
            <li>🎓 两种模式：学习模式（先做题再出手） / 沙盘模式（免做题自由试验）</li>
            <li>📉 连续时间线：2023 Q4 → 2027 Q1，共 14 个季度，完整经历一轮经济周期</li>
            <li>🃏 44 张政策卡牌：财政 / 货币 / 产业（中国特供）/ 贸易四大工具箱</li>
            <li>🔍 传导演示：政策落地即播放六步链条动画——冲击注入→曲线移动→均衡重解→物价→就业→部门反馈，数值实时滚动</li>
            <li>📊 动态模型：IS-LM、AD-AS、菲利普斯曲线实时动画推演</li>
            <li>🧠 因素链条：点击传导链节点，弹出公式推导与教材出处</li>
          </ul>
          <div class="mode-row">
            <button class="mode-btn" id="btn-learn">
              <span class="mb-icon">🎓</span>
              <b>学习模式</b>
              <span class="mb-desc">每张政策先做题，答对全额生效、答错减半；传导演示附公式推导</span>
            </button>
            <button class="mode-btn" id="btn-sandbox">
              <span class="mb-icon">🧪</span>
              <b>沙盘模式</b>
              <span class="mb-desc">免做题、政策即时全额生效，每季可执行 5 项，自由试验模型</span>
            </button>
          </div>
          <p class="tip">建议使用 Chrome / Edge 浏览器，窗口宽度 ≥ 1440px</p>
        </div>
      </div>

      <!-- ===================== 主界面 ===================== -->
      <div id="app" class="hidden">

        <!-- ① 顶部：全局导航与核心指标盘 -->
        <header id="topbar">
          <div class="logo">🛞 <b>经济舵手</b><span class="en">Macro Pilot</span></div>
          <div id="kpi-cards"><!-- KPI 卡片由 JS 生成 --></div>
          <div class="time-controls">
            <div id="quarter-label">2023 Q4</div>
            <button id="btn-anim-speed" title="切换动画速度">🐢 慢速</button>
            <button id="btn-wrongbook" title="错题本">📒 错题本</button>
            <button id="btn-end-quarter">结束本季度 ▶</button>
          </div>
        </header>

        <div id="main-grid">

          <!-- ② 左侧：政策工具箱 -->
          <aside id="toolbox">
            <h2>🧰 政策工具箱</h2>
            <div id="drawer-container"><!-- 四个抽屉由 JS 生成 --></div>
            <div id="pending-box">
              <h3>本季度已执行政策 <span id="pending-count">0 / 3</span></h3>
              <ul id="pending-list"></ul>
            </div>
          </aside>

          <!-- ③ 中央：动态经济全景与图表区 -->
          <section id="center">
            <div id="city-map" class="panel"><!-- 手绘城市地图由 JS 生成 --></div>
            <div id="timeline" class="panel"><!-- 时间轴由 JS 生成 --></div>
            <div id="chart-row">
              <div class="chart-box"><h3>GDP 构成堆积（万亿）</h3><svg id="chart-gdp"></svg></div>
              <div class="chart-box"><h3>IS-LM 模型</h3><svg id="chart-islm"></svg></div>
              <div class="chart-box"><h3>AD-AS 模型</h3><svg id="chart-adas"></svg></div>
              <div class="chart-box"><h3>菲利普斯曲线</h3><svg id="chart-phillips"></svg></div>
            </div>
          </section>

          <!-- ④ 右侧：资讯与反馈区 -->
          <aside id="feed">
            <div class="panel" id="news-panel"><h3>📰 新闻与事件</h3><ul id="news-list"></ul></div>
            <div class="panel" id="firm-panel"><h3>🏭 企业动态</h3><ul id="firm-list"></ul></div>
            <div class="panel" id="expect-panel">
              <h3>🔮 公众预期</h3>
              <div id="expect-content"></div>
            </div>
            <div class="panel" id="advisor-panel">
              <h3>🧑‍🏫 经济顾问</h3>
              <div id="advisor-note" class="paper-note small"></div>
            </div>
          </aside>

          <!-- ⑤ 底部：教学闭环与结算区 -->
          <footer id="bottom">
            <div class="panel" id="chain-panel">
              <h3>🔗 因素链条（点击节点看公式推导）
                <select id="chain-category">
                  <option value="fiscal">财政政策传导</option>
                  <option value="monetary">货币政策传导</option>
                  <option value="trade">贸易政策传导</option>
                </select>
              </h3>
              <div id="chain-container"></div>
            </div>
            <div class="panel" id="advice-panel"><h3>📌 学习建议</h3><ul id="advice-list"></ul></div>
            <div class="panel" id="radar-panel"><h3>🎯 本局评分</h3><svg id="radar-svg"></svg></div>
            <div class="panel" id="achv-panel"><h3>🏅 成就徽章</h3><ul id="achv-list"></ul></div>
          </footer>
        </div>
      </div>

      <!-- ===================== ⑥ 弹窗层 ===================== -->

      <!-- 做题弹窗（手绘便签纸风格） -->
      <div id="quiz-modal" class="modal-layer hidden">
        <div class="paper-note quiz-paper">
          <div class="quiz-head"><span id="quiz-card-name"></span><span id="quiz-stamp"></span></div>
          <div id="quiz-question"></div>
          <div id="quiz-options"></div>
          <div id="quiz-explain" class="hidden"></div>
          <div class="quiz-foot">
            <span id="quiz-chapter"></span>
            <button id="quiz-close" class="hidden">关闭</button>
          </div>
        </div>
      </div>

      <!-- 知识卡弹窗（因素链条节点） -->
      <div id="knowledge-modal" class="modal-layer hidden">
        <div class="paper-note quiz-paper">
          <h3 id="know-title"></h3>
          <div id="know-formula" class="formula-box"></div>
          <div id="know-text"></div>
          <div class="quiz-foot"><span id="know-chapter"></span><button id="know-close">关闭</button></div>
        </div>
      </div>

      <!-- 事件新闻卡弹窗 -->
      <div id="event-modal" class="modal-layer hidden">
        <div class="paper-note newspaper">
          <h3 id="event-title"></h3>
          <p id="event-desc"></p>
          <p id="event-effect"></p>
          <button id="event-close">知道了</button>
        </div>
      </div>

      <!-- 错题本弹窗 -->
      <div id="wrongbook-modal" class="modal-layer hidden">
        <div class="paper-note quiz-paper">
          <h3>📒 错题本</h3>
          <div id="wrongbook-list"></div>
          <div class="quiz-foot"><span>答对同类新题可移出</span><button id="wrongbook-close">关闭</button></div>
        </div>
      </div>

      <!-- 结算弹窗 -->
      <div id="final-modal" class="modal-layer hidden">
        <div class="paper-note quiz-paper final-paper">
          <h3>🏁 14 个季度执舵结束！</h3>
          <div id="final-summary"></div>
          <div class="quiz-foot"><button id="final-restart">再来一局 🔄</button></div>
        </div>
      </div>

      <!-- 传导演示弹窗（六步链条动画） -->
      <div id="transmission-modal" class="modal-layer hidden">
        <div class="paper-note trans-paper">
          <h3 id="trans-title">🔍 传导演示</h3>
          <div id="trans-chain"></div>
          <div class="trans-foot">
            <span class="trans-hint">每个节点即时重解均衡，数值实时滚动</span>
            <div>
              <button id="trans-skip">跳过动画 ⏩</button>
              <button id="trans-done" class="hidden">确认效果 ▶</button>
            </div>
          </div>
        </div>
      </div>

      <!-- 轻提示层 -->
      <div id="toast-layer"></div>
    </div>
  </div>
</template>

<style>
/* =========================================================
   页面外壳：浅色底 + 最大宽度 1600px 居中，嵌入现有站点
   （游戏本身的深色舞台在 .game1-stage 内，样式见 src/game1/style.css）
   ========================================================= */
.game1-view {
  max-width: 1600px;
  margin: 0 auto;
  padding: 0 16px 18px;
  background: #ffffff;
  box-sizing: border-box;
}

/* ---------- 顶部返回栏 ---------- */
.g1-return-bar {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px 4px;
  margin-bottom: 8px;
  border-bottom: 1px solid #e6eaf2;
  color: #1f2937;
  font-family: "Microsoft YaHei", "PingFang SC", sans-serif;
}
.g1-back {
  flex: 0 0 auto;
  padding: 7px 14px;
  font-size: 14px;
  color: #2b6cb0;
  background: #f1f6fd;
  border: 1px solid #cfe0f5;
  border-radius: 8px;
  cursor: pointer;
  transition: all .15s;
}
.g1-back:hover {
  background: #e3eefb;
  border-color: #9fc3ea;
}
.g1-titles { flex: 1; min-width: 0; }
.g1-title {
  font-size: 20px;
  font-weight: 700;
  color: #16233f;
  margin: 0;
  line-height: 1.3;
}
.g1-sub {
  margin: 2px 0 0;
  font-size: 12.5px;
  color: #6b7a90;
}
.g1-user {
  flex: 0 0 auto;
  font-size: 13px;
  color: #334155;
  background: #f5f7fa;
  border: 1px solid #e2e8f0;
  border-radius: 999px;
  padding: 5px 14px;
  white-space: nowrap;
}

/* ---------- 游戏舞台容器 ----------
   给出固定高度并裁掉圆角外的深色底；
   原 #app / #start-screen 的 100vh 已在 style.css 内改为 100%，
   这里的高度即它们的实际高度。 */
.game1-stage {
  position: relative;
  height: calc(100vh - 132px);
  min-height: 620px;
  overflow: hidden;
  border-radius: 14px;
  box-shadow: 0 6px 24px rgba(16, 32, 64, .18);
}

/* ---------- 小屏兜底 ---------- */
@media (max-width: 1200px) {
  .game1-view { padding: 0 10px 14px; }
  .game1-stage { height: auto; min-height: 0; }
  .g1-title { font-size: 17px; }
  .g1-sub { display: none; }
}
</style>

<!--
  辅助学习系统 - 首页
  V5.0：章节选择 + 八大功能模块导航
-->
<template>
  <div class="home-container">

    <!-- 顶部标题 -->
    <div class="hero">
      <!-- 右上角登录区：未登录显示入口，已登录显示昵称与退出 -->
      <div class="auth-zone">
        <template v-if="authStore.isLoggedIn()">
          <span class="auth-user">👋 {{ authStore.state.user.displayName || authStore.state.user.username }}</span>
          <el-button size="small" round @click="authStore.logout()">退出</el-button>
        </template>
        <el-button v-else type="warning" size="small" round @click="$emit('open-page', 'login')">
          登录 / 注册
        </el-button>
      </div>

      <h1 class="hero-title">宏观经济学智能学习系统</h1>
      <p class="hero-sub">
        🎮 双游戏仿真 × 📖 知识图谱学习 × 🤖 AI 学习画像与个性化建议 × 👩‍🏫 教师端学情看板<br/>
        系统读取你在两游戏中的操作与学习行为，用强化学习神经网络为你规划下一步。
      </p>
    </div>

    <!-- 功能导航宫格 -->
    <div class="feature-grid">
      <div
        v-for="f in features"
        :key="f.page"
        class="feature-card"
        :style="{ '--c1': f.c1, '--c2': f.c2 }"
        @click="$emit('open-page', f.page)"
      >
        <div class="f-icon">{{ f.icon }}</div>
        <div class="f-name">{{ f.name }}</div>
        <div class="f-desc">{{ f.desc }}</div>
        <span v-if="f.hot" class="f-hot">🔥 {{ f.hot }}</span>
      </div>
    </div>

    <!-- 章节列表 -->
    <h3 class="sec-title">📚 章节学习</h3>
    <div class="chapter-grid">

      <!-- 第十一章（已开放） -->
      <el-card class="chapter-card open" shadow="hover">
        <div class="ch-no">第十一章</div>
        <div class="ch-title">国民收入的决定：IS-LM模型</div>
        <div class="ch-desc">
          IS曲线（产品市场均衡）、LM曲线（货币市场均衡）、IS-LM共同均衡与政策运用、本章评析。
        </div>
        <div class="ch-tags">
          <el-tag size="small" type="primary">4个小节</el-tag>
          <el-tag size="small" type="success">3个交互实验</el-tag>
          <el-tag size="small" type="warning">8道习题</el-tag>
          <el-tag size="small" type="danger">仿真验证</el-tag>
        </div>
        <el-button type="primary" size="large" class="ch-btn" @click="$emit('open-chapter', 'ch11')">
          📖 开始学习
        </el-button>
      </el-card>

      <!-- 占位章节（建设中） -->
      <el-card v-for="n in 3" :key="n" class="chapter-card locked" shadow="never">
        <div class="ch-no">第{{ ['十二', '十三', '十四'][n - 1] }}章</div>
        <div class="ch-title locked-text">敬请期待</div>
        <div class="ch-desc">该章节正在建设中……</div>
        <el-button size="large" class="ch-btn" disabled>🔒 未开放</el-button>
      </el-card>

    </div>
  </div>
</template>

<script setup>
import { authStore } from '@/store/auth'

defineEmits(['open-chapter', 'open-page'])

/* 功能模块配置
 * 三大板块顺序：① 双游戏仿真 ② 知识学习 ③ AI 能力，教师端置尾
 * hot 字段用于角标：'核心玩法' / 'AI 驱动' 等 */
const features = [
  { page: 'game1',     icon: '🕹️', name: '游戏一 · 经济舵手', desc: '14 个季度、44 张政策卡，亲手操作财政/货币/产业/贸易工具推动四条曲线', c1: '#ff9a44', c2: '#fc6076', hot: '政策模拟' },
  { page: 'game2',     icon: '🎮', name: '游戏二 · 多人博弈', desc: '4 人分饰政府（含央行）/银行/企业/消费者，实时博弈推动 IS-LM', c1: '#ff512f', c2: '#dd2476', hot: '小组对抗' },
  { page: 'chapter',   icon: '📖', name: '章节学习',   desc: '知识点讲解 + 图示推导 + 交互仿真实验', c1: '#667eea', c2: '#764ba2' },
  { page: 'knowledge', icon: '🕸️', name: '知识图谱',   desc: '25 个知识节点 + 先修关系，按你的掌握度着色，AI 规划学习前沿', c1: '#43e97b', c2: '#38f9d7' },
  { page: 'exercise',  icon: '✏️', name: '题库练习',   desc: '专项刷题 / 模拟测试 / 限时自测，自动批改', c1: '#f093fb', c2: '#f5576c' },
  { page: 'profile',   icon: '🧬', name: '我的学习画像', desc: 'AI 读取两游戏操作与学习行为，生成六维画像与针对性建议', c1: '#00c6ff', c2: '#0072ff', hot: 'AI 驱动' },
  { page: 'ai',        icon: '🤖', name: 'AI 学习助手', desc: '引导式答疑（不直接给答案）+ 自动生成复习资料', c1: '#43e97b', c2: '#38f9d7' },
  { page: 'wrongbook', icon: '📕', name: '智能错题本', desc: '错题自动收纳、标注原因、按知识点重做', c1: '#fa709a', c2: '#fee140' },
  { page: 'stats',     icon: '📊', name: '学习数据统计', desc: '刷题时长、掌握度图表、学习周报、薄弱板块', c1: '#a8edea', c2: '#536976' },
  { page: 'schedule',  icon: '🗓️', name: '课程与日程', desc: '课程表、学习日历、作业考试倒计时、待办计划', c1: '#30cfd0', c2: '#330867' },
  { page: 'resource',  icon: '📂', name: '学习资源库', desc: '课件 / 笔记 / 试卷 / 提纲，上传下载与搜索', c1: '#ff9a9e', c2: '#a18cd1' },
  { page: 'community', icon: '💬', name: '问答社区',   desc: '课程疑问互助答疑，热门问题沉淀高频知识库', c1: '#4facfe', c2: '#00f2fe' },
  { page: 'teacher',   icon: '👩‍🏫', name: '教师端 · 学情看板', desc: '班级掌握度、风险分级、学生画像与 AI 教学建议（需教师账号）', c1: '#606c88', c2: '#3f4c6b' }
]
</script>

<style scoped>
.home-container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 30px 20px;
  min-height: 100vh;
  background: linear-gradient(135deg, #f5f7fa 0%, #e4e8f0 100%);
  font-family: 'Microsoft YaHei', 'PingFang SC', sans-serif;
}

.hero {
  position: relative;
  text-align: center;
  padding: 40px 20px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: #fff;
  border-radius: 14px;
  margin-bottom: 26px;
  box-shadow: 0 6px 20px rgba(102, 126, 234, 0.35);
}
/* 右上角登录区 */
.auth-zone {
  position: absolute;
  top: 14px;
  right: 16px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.auth-user { font-size: 13px; opacity: 0.95; }
.hero-title {
  margin: 0 0 12px;
  font-size: 32px;
  letter-spacing: 2px;
}
.hero-sub {
  margin: 0;
  font-size: 14px;
  opacity: 0.92;
  line-height: 1.9;
}

/* 功能宫格 */
.feature-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 16px;
  margin-bottom: 30px;
}
.feature-card {
  background: #fff;
  border-radius: 12px;
  padding: 18px;
  cursor: pointer;
  border: 1px solid #ebeef5;
  transition: transform 0.22s, box-shadow 0.22s;
  position: relative;
  overflow: hidden;
}
.feature-card::before {
  content: '';
  position: absolute;
  left: 0; top: 0; bottom: 0;
  width: 4px;
  background: linear-gradient(180deg, var(--c1), var(--c2));
}
.feature-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.1);
}
.f-icon { font-size: 30px; margin-bottom: 8px; }
.f-name { font-size: 16px; font-weight: 700; color: #303133; margin-bottom: 6px; }
.f-desc { font-size: 12.5px; color: #909399; line-height: 1.6; }
.f-hot {
  position: absolute; top: 12px; right: 12px;
  font-size: 11px; color: #fff; background: linear-gradient(135deg, #ff512f, #dd2476);
  padding: 2px 8px; border-radius: 10px;
}

/* 章节列表 */
.sec-title {
  color: #303133;
  margin: 0 0 14px;
}
.chapter-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 20px;
  margin-bottom: 30px;
}
.chapter-card {
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  transition: transform 0.25s;
}
.chapter-card.open {
  border: 2px solid #667eea;
}
.chapter-card.open:hover {
  transform: translateY(-4px);
}
.chapter-card.locked {
  opacity: 0.65;
  border: 2px dashed #dcdfe6;
}
.ch-no {
  font-size: 13px;
  color: #909399;
  letter-spacing: 3px;
  margin-bottom: 6px;
}
.ch-title {
  font-size: 19px;
  font-weight: 700;
  color: #303133;
  margin-bottom: 10px;
}
.ch-title.locked-text {
  color: #c0c4cc;
}
.ch-desc {
  font-size: 13px;
  color: #606266;
  line-height: 1.7;
  min-height: 66px;
  margin-bottom: 12px;
}
.ch-tags {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-bottom: 16px;
}
.ch-btn {
  width: 100%;
  margin-top: auto;
}
</style>

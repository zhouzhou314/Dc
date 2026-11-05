# 宏观经济学智能学习系统（IS-LM · 双游戏 · AI 学习画像）

> 面向《宏观经济学》课程的教学软件。系统由 **游戏、知识学习、AI 分析** 三大板块构成：
> 学生在两套游戏中亲手操作宏观政策，在知识图谱与题库中学习答题；
> AI 读取两游戏操作与学习行为，为每名学生生成专属画像与针对性建议，并把学情汇总给教师端。

---

## 一、三大板块与功能清单

### ① 游戏板块

| 模块 | 说明 | 入口 |
|---|---|---|
| **游戏一 · 经济舵手** | 单机宏观政策模拟：14 个季度（2023Q4→2027Q1）、44 张政策卡（财政/货币/产业/贸易）、六步传导演示动画、IS-LM / AD-AS / 菲利普斯 / GDP 四图联动、学习模式（先答题再出手）与沙盘模式 | 首页 → 游戏一 |
| **游戏二 · 多人博弈** | 4 人分饰政府（含央行）/银行/企业/消费者，房间码加入、AI 补位、2~4 回合、事件冲击、协商聊天、五维雷达结算 | 首页 → 游戏二 |

两游戏产生的**每一次关键操作**都会写入统一事件流 `learning_event`
（`game1.policy` / `game1.quiz` / `game1.quarter` / `game1.finish` / `game2.decision` / `game2.round_result` …），
结算快照另存 `game1_session` / `game_room` / `game_decision`。这是 AI 画像的原始数据。

### ② 知识学习板块

| 模块 | 说明 |
|---|---|
| 章节学习 | 第十一章 IS-LM：4 小节、公式分步推导、符号表、11 张 ECharts 知识图示 |
| 交互仿真器 | 9 参数 IS-LM 仿真、政策冲击对比、历史记录、PNG 导出、自动生成经济学解读 |
| 题库练习 | 30 题（23 单选 + 7 计算），5 知识点 × 3 难度；专项 / 模拟 / 限时三种模式，自动批改 |
| 知识图谱 | **25 个知识节点 + 45 条边**（39 条先修 + 6 条关联）；按学生掌握度着色，展示学习前沿与推荐路径 |
| 知识库 | 教材知识块 26 个（RAG 检索源，支持关键词检索节点与原文查看） |
| 错题本 / 日程 / 统计 / 资源库 / 社区 | 错题收纳与 SM-2 复习、课程表与倒计时、学习统计与周报、资源归档、问答互助 |

### ③ AI 板块

| 模块 | 说明 |
|---|---|
| **学生画像** | 六维能力雷达（知识掌握/正确率/活跃度/学习自主性/游戏决策力/学习韧性）+ 明细维度 + 标签 + AI 文字画像 |
| **学习建议** | 强化学习策略先选"下一知识节点"，再由规则 + 大模型生成 3~5 条可执行建议（含入口、时长、依据） |
| **强化学习推荐** | 自研 MLP + DQN（16 维状态 → 64 → 64 → 25 个动作），每次作答回收奖励并在线训练 |
| **阶梯导学** | L1→L4 逐级提示，RAG 限定知识库、防泄露校验、重试降级；SSE 打字机输出 |
| **AI 助手** | Function Calling 智能体（IS-LM 求解 / 知识检索 / 题库查询），工具调用步骤可视化 |
| **教师端** | 班级概览、风险分级、知识点热力、活跃趋势、班级 AI 简报、学生画像与建议、行为流、CSV 导出 |

---

## 二、技术栈

- **前端**：Vue 3.5（Composition API）、Vite 5、Element Plus、ECharts 5、原生 fetch/ReadableStream
- **后端**：Node.js 20、Express 5、MySQL 8（mysql2）、jsonwebtoken、bcryptjs、ws（WebSocket）
- **AI**：大模型（OpenAI 兼容协议，可切换 DeepSeek / 火山方舟豆包 / 任意网关）、RAG（TF-IDF × 向量余弦混合检索）、Function Calling、SSE
- **算法（自研纯 JS 实现）**：BKT 贝叶斯知识追踪、SM-2 间隔重复、MLP + DQN 强化学习
- **部署**：Docker 多阶段构建 + docker-compose（healthcheck / 启动重试 / 数据卷）

---

## 三、目录结构

```
islm-platform/
├── src/                         前端
│   ├── App.vue                  根组件：视图编排 + 游戏事件汇聚
│   ├── main.js                  应用入口
│   ├── views/
│   │   ├── HomeView.vue         首页（功能宫格 + 章节列表）
│   │   ├── game/                ① 游戏
│   │   │   ├── Game1View.vue        游戏一容器（mount/destroy）
│   │   │   ├── Game2LobbyView.vue   游戏二大厅
│   │   │   └── Game2RoomView.vue    游戏二对局
│   │   ├── learning/            ② 知识学习
│   │   │   ├── Chapter11View.vue    章节学习
│   │   │   ├── KnowledgeGraphView.vue 知识图谱
│   │   │   ├── ExerciseView.vue     题库练习
│   │   │   ├── WrongBookView.vue    错题本
│   │   │   ├── StatsView.vue        学习统计
│   │   │   ├── ScheduleView.vue     课程日程
│   │   │   ├── ResourceView.vue     资源库
│   │   │   └── CommunityView.vue    问答社区
│   │   ├── ai/                  ③ AI
│   │   │   ├── StudentProfileView.vue 学生画像
│   │   │   └── AiAssistantView.vue    AI 助手
│   │   ├── teacher/TeacherView.vue    教师端学情看板
│   │   └── common/LoginView.vue       登录注册
│   ├── game1/                   游戏一内核（ES Module）
│   │   ├── data.js  政策卡/事件/链条/成就
│   │   ├── models.js IS-LM→AD-AS→菲利普斯 计算
│   │   ├── charts.js SVG 图表与缓动
│   │   ├── quiz.js   政策配套题生成与判分
│   │   ├── engine.js 季度结算状态机
│   │   ├── main.js   mountGame1（UI 与事件绑定）
│   │   ├── context.js 运行期上下文/定时器/事件上报
│   │   └── style.css 样式（.game1-view 命名空间）
│   ├── components/              HintPanel / ISLMSimulator / 博弈面板等
│   ├── api/                     接口层（auth/record/hint/ai/teacher/knowledge/game1/event…）
│   ├── store/                   auth / learning
│   ├── utils/                   storage / identity / islmCalc / game1Recorder
│   ├── constants/               presets / game / knowledgeCharts
│   └── data/                    chapter11 / questionBank / mockData
├── server/                      后端
│   ├── app.js                   服务入口（REST + WebSocket）
│   ├── config.js  db.js         配置与连接池（含幂等迁移）
│   ├── routes/                  auth / record / analytics / hint / wrongbook / review /
│   │                            islm / agent / game / game1 / event / knowledge / ai / teacher
│   ├── services/                业务服务
│   │   ├── profileService.js        学生画像
│   │   ├── adviceService.js         学习建议
│   │   ├── teacherService.js        教师端学情
│   │   ├── rlService.js             强化学习推荐与训练
│   │   ├── nodeMasteryService.js    节点级 BKT
│   │   ├── bktService.js / recommendService.js / reviewService.js
│   │   ├── hintService.js / leakGuard.js / retriever.js / embeddingService.js / llm.js
│   │   └── gameEngine.js / gameStore.js / gameEvents.js / gameAi.js / gameGateway(ws)
│   ├── ml/                      自研机器学习
│   │   ├── neuralNet.js             MLP（前向/反向/Adam/序列化）
│   │   ├── dqn.js                   DQN（回放/目标网络/ε-贪心）
│   │   ├── encoder.js               16 维状态编码
│   │   └── selftest.js              算法自检脚本
│   ├── knowledge/               chunks（知识库）/ graph（知识图谱）/ dictionary
│   ├── prompts/                 提示词模板（导学/画像/建议/班级/智能体）
│   ├── middleware/              auth / teacher(角色校验)
│   ├── ws/                      gameGateway
│   ├── sql/                     init.sql（18 张表）/ seed-demo.js（演示数据）
├── docs/design/                 设计与汇报文档
├── figures/                     论文/文档插图与绘制脚本
├── Dockerfile / docker-compose.yml
└── package.json
```

---

## 四、快速启动

### 1. 准备 MySQL

```bash
# 方式一：本机已装 MySQL 8，直接启动并确保 root 密码与 .env 一致
# 方式二：项目自带数据目录（Windows）
.\start-mysql.ps1
```

首次启动后端会自动执行 `server/sql/init.sql`（幂等建库建表）并做列级迁移，无需手工建表。

### 2. 配置环境变量

```bash
cp .env.example .env
# 至少确认 DB_USER / DB_PASSWORD；不填 LLM_API_KEY 时自动走本地模拟
```

关键开关：

| 变量 | 作用 | 默认 |
|---|---|---|
| `LLM_MOCK` | `true` 时不调用外部大模型，全流程可离线演示 | `true` |
| `LLM_PROVIDER` | `ark` / `deepseek` / `openai` | `ark` |
| `LLM_BASE_URL` / `LLM_API_KEY` / `LLM_MODEL` | 大模型接入（OpenAI 兼容） | 空 |
| `EMBEDDING_REMOTE` | 是否调用远端向量接口（仅方舟支持） | 随 provider |
| `TEACHER_INVITE_CODE` | 注册教师账号所需邀请码 | `HZYJ-TEACHER` |
| `PROFILE_USE_LLM` | 画像/建议是否用大模型润色 | `true` |

### 3. 启动

```bash
npm install
npm run server     # 后端 3001（同时挂载 /ws）
npm run dev        # 前端 5173（/api 与 /ws 代理到 3001）
```

生产模式：`npm run build` 后仅启动 `npm run server`，Express 会托管 `dist/`。
容器部署：`docker compose up --build`。

### 4. 演示账号（执行 `node server/sql/seed-demo.js` 后生成）

| 账号 | 密码 | 角色 |
|---|---|---|
| `teacher_demo` | `demo123456` | 教师（2024级经济学1班） |
| `student_a` | `demo123456` | 学生（基础扎实、两游戏都玩） |
| `student_b` | `demo123456` | 学生（中等、政策运用薄弱） |
| `student_c` | `demo123456` | 学生（薄弱、提示依赖高） |

---

## 五、AI 数据链路（核心设计）

```
两游戏操作 ─┐
题库作答  ─┼→ learning_event（统一事件流）
阶梯提示  ─┘        │
                    ▼
        profileService.collectSignals()
                    │
        ┌───────────┴────────────┐
        ▼                        ▼
  BKT 掌握度（topic/node）   encodeState → 16 维状态向量
        │                        │
        │                        ▼
        │                 DQN 策略网络（25 个知识节点动作）
        │                        │
        ▼                        ▼
   学生画像（六维雷达/标签/文字）  下一知识节点 + Q 值
        │                        │
        └──────────┬─────────────┘
                   ▼
        学习建议（规则选题 + 大模型润色）
                   ▼
        教师端学情看板（班级概览 / 风险分级 / AI 简报）
```

**强化学习闭环**：推荐节点（action）→ 学生作答 → BKT 更新出 ΔpKnown → 按
`reward = 3Δp + 对错奖惩 + 难度加成` 回收 → 写入 `rl_transition` → 回放训练 → 权重存 `rl_model`。

**冷启动**：训练步数 < 30 时用"知识图谱学习前沿 + 掌握度最低"的启发式推荐，
但照常记录转移样本，边用边学。

---

## 六、主要接口

| 分组 | 接口 | 说明 |
|---|---|---|
| 账号 | `POST /api/auth/register`、`/login`、`GET /me` | JWT（教师需邀请码） |
| 学习 | `POST /api/record/answer`、`GET /api/analytics/mastery`、`/recommend` | 作答上报 + BKT + RL 奖励回收 |
| 导学 | `POST /api/hint`、`/hint/stream`、`/hint/solution`、`GET /hint/state` | L1~L4 阶梯提示 |
| 知识 | `GET /api/knowledge/graph`、`/nodes/:id`、`/path`、`/search`、`/stats` | 知识图谱与知识库 |
| AI | `GET /api/ai/profile`、`/advice`、`/recommend`、`/model`、`POST /ai/train` | 画像/建议/推荐/训练 |
| 游戏一 | `POST /api/game1/session`、`GET /game1/sessions`、`/stats` | 终局快照 |
| 游戏二 | `GET /api/game`（报告）、`/ws`（实时对局） | 多人博弈 |
| 事件 | `POST /api/event/batch`、`/one` | 行为事件采集 |
| 教师 | `GET /api/teacher/overview`、`/students`、`/student/:id`、`/activity`、`POST /insight`、`GET /export` | 学情看板（教师角色） |

统一响应信封：`{ success, code, message, data }`。

---

## 七、数据表（18 张）

| 类别 | 表 |
|---|---|
| 导学 | `hint_session`、`hint_log` |
| 账号 | `users`（含 role / class_name） |
| 学习分析 | `answer_record`、`mastery_state`、`node_mastery`、`wrong_book`、`knowledge_embedding`、`agent_log` |
| 游戏二 | `game_room`、`game_decision`、`game_chat` |
| 游戏一 | `game1_session` |
| AI 画像 | `student_profile`、`learning_advice` |
| 事件流 | `learning_event` |
| 强化学习 | `rl_transition`、`rl_model` |

---

## 八、算法自检

```bash
node server/ml/selftest.js
# 【MLP】首轮损失 0.2472 ｜40 轮后 0.0356 ✅
# 【DQN】Q(动作0)=1.000 ｜Q(动作1)=-1.000 ✅
```

自检项：MLP 能否拟合非线性映射（验证前向/反向/Adam），DQN 能否在双动作老虎机上收敛正确动作。

---

## 九、降级设计（无网/无 Key 也能完整演示）

1. **大模型**：`LLM_MOCK=true` 或调用失败 → 提示走本地模板，画像/建议走规则文案；
2. **向量检索**：无 Embedding 服务 → 自动退化为纯 TF-IDF；
3. **后端**：接口失败时前端保留本地功能（匿名 localStorage 模式）；
4. **强化学习**：模型缺失/训练不足 → 启发式推荐，不阻塞任何页面。

> `LLM_MOCK=true` 时控制台会提示"大模型模式：MOCK"，属正常现象。

---

## 十、与软件著作权登记相关的源码规模

| 项 | 数值 |
|---|---|
| 源程序文件 | 117 个（`.js` / `.vue` / `.css` / `.sql` / `.txt`） |
| 源程序行数 | 约 21,800 行（不含 `node_modules`、`dist`） |
| 前端视图 | 16 个页面组件 + 6 个功能组件 |
| 后端接口 | 13 组 REST + 1 组 WebSocket |
| 数据库表 | 18 张 |

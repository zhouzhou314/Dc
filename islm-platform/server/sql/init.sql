-- ============================================================
-- 阶梯导学功能 · MySQL 初始化脚本
-- 使用方式：mysql -u root -p < server/sql/init.sql
-- 幂等：重复执行不会破坏已有数据（IF NOT EXISTS）
-- ============================================================

-- 建库（utf8mb4 支持全部中文与特殊符号）
CREATE DATABASE IF NOT EXISTS islm_platform
  DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE islm_platform;

-- ------------------------------------------------------------
-- 表1：导学会话（每名学生 × 每道题 仅一条记录）
-- 保存该题的提示解锁进度与检索快照，是"每题独立保存提示层级"的载体
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS hint_session (
  id                BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id           VARCHAR(64)  NOT NULL COMMENT '学生标识（前端localStorage生成）',
  question_id       INT          NOT NULL COMMENT '题目编号 1~8',
  current_level     TINYINT      NOT NULL DEFAULT 0 COMMENT '已解锁层级 0未解锁/1/2/3，单调递增不回退',
  solution_unlocked TINYINT(1)   NOT NULL DEFAULT 0 COMMENT '是否已查看L4完整解析',
  rag_snapshot      JSON         NULL COMMENT '首次RAG检索固化的知识块集合，L1~L3复用保证口径一致',
  attempt_count     INT          NOT NULL DEFAULT 0 COMMENT '带作答信息的提示请求次数（卡壳次数口径）',
  confusion_text    VARCHAR(500) NULL COMMENT '学生最近一次填写的困惑描述',
  created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_user_question (user_id, question_id)
) ENGINE=InnoDB COMMENT='阶梯导学会话表';

-- ------------------------------------------------------------
-- 表2：提示日志（每次模型输出一条）
-- 同时作为前端刷新后恢复历史提示卡片的数据源
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS hint_log (
  id                BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  session_id        BIGINT UNSIGNED NOT NULL COMMENT '关联 hint_session.id',
  user_id           VARCHAR(64)  NOT NULL,
  question_id       INT          NOT NULL,
  level             TINYINT      NOT NULL COMMENT '本次输出层级 1~4',
  trigger_type      VARCHAR(20)  NOT NULL DEFAULT 'HINT_STEP' COMMENT 'HINT_STEP逐级/SOLUTION_DIRECT直取L4/CONFUSION_RETRY困惑重试',
  content           MEDIUMTEXT   NOT NULL COMMENT '模型返回并通过校验后的JSON字符串',
  rag_chunk_ids     JSON         NULL COMMENT '本次引用的知识块ID数组',
  model_name        VARCHAR(100) NULL COMMENT '模型名（mock模式记 mock）',
  prompt_tokens     INT          NULL,
  completion_tokens INT          NULL,
  degraded          TINYINT(1)   NOT NULL DEFAULT 0 COMMENT '是否为降级直出知识块原文',
  feedback          VARCHAR(8)   NULL COMMENT '学生对本条提示的评价 up/down',
  created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_session (session_id),
  KEY idx_user_question (user_id, question_id)
) ENGINE=InnoDB COMMENT='阶梯导学提示日志表';

-- ------------------------------------------------------------
-- 表3：注册用户（JWT 登录体系的账号表）
-- 登录后错题本／学习记录可云端同步，未登录仍走浏览器本地存储
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  username      VARCHAR(50)  NOT NULL COMMENT '登录用户名 3~20 字符',
  password_hash VARCHAR(100) NOT NULL COMMENT 'bcrypt 哈希（60字符，留余量）',
  display_name  VARCHAR(50)  NULL COMMENT '昵称（默认同用户名）',
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_username (username)
) ENGINE=InnoDB COMMENT='注册用户表';

-- ------------------------------------------------------------
-- 表4：作答记录（每次提交答案一条，BKT 知识追踪的数据来源）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS answer_record (
  id             BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id        VARCHAR(64)  NOT NULL COMMENT '登录用户 u_数字 或匿名 hintUserId',
  question_id    INT          NOT NULL COMMENT '题目编号',
  topic          VARCHAR(50)  NOT NULL COMMENT '知识点（BKT 按此维度追踪）',
  q_type         VARCHAR(10)  NOT NULL COMMENT '题型 choice/blank/judge 等',
  difficulty     VARCHAR(10)  NOT NULL COMMENT '难度 easy/medium/hard',
  is_correct     TINYINT(1)   NOT NULL COMMENT '是否答对 1对 0错',
  student_answer JSON         NULL COMMENT '学生作答内容',
  duration_ms    INT          NULL COMMENT '本题作答耗时（毫秒）',
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_user_topic (user_id, topic),
  KEY idx_user_time (user_id, created_at)
) ENGINE=InnoDB COMMENT='作答记录表';

-- ------------------------------------------------------------
-- 表5：知识点掌握状态（BKT 模型输出，每用户 × 每知识点一条）
-- p_known 为贝叶斯知识追踪估计的"当前已掌握概率"
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mastery_state (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id       VARCHAR(64)  NOT NULL,
  topic         VARCHAR(50)  NOT NULL,
  p_known       DECIMAL(5,4) NOT NULL DEFAULT 0.1500 COMMENT '掌握概率先验 0.15',
  attempts      INT          NOT NULL DEFAULT 0 COMMENT '累计作答次数',
  correct_count INT          NOT NULL DEFAULT 0 COMMENT '累计答对次数',
  updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_user_topic (user_id, topic)
) ENGINE=InnoDB COMMENT='知识点掌握状态表（BKT）';

-- ------------------------------------------------------------
-- 表6：云端错题本（登录用户多端同步，含 SM-2 间隔重复调度字段）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS wrong_book (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id       VARCHAR(64)  NOT NULL,
  question_id   INT          NOT NULL COMMENT '题目编号',
  snapshot      JSON         NOT NULL COMMENT '题目完整快照（防题库改动）',
  my_answer     JSON         NULL COMMENT '最近一次错误作答',
  reason        VARCHAR(100) NULL COMMENT '错误原因标注',
  times         INT          NOT NULL DEFAULT 1 COMMENT '累计做错次数',
  ease_factor   DECIMAL(4,2) NOT NULL DEFAULT 2.50 COMMENT 'SM-2 难度因子 EF',
  interval_days INT          NOT NULL DEFAULT 0 COMMENT 'SM-2 当前复习间隔（天）',
  repetitions   INT          NOT NULL DEFAULT 0 COMMENT 'SM-2 连续通过次数',
  due_date      DATE         NOT NULL COMMENT '下次复习到期日',
  last_review_at DATETIME    NULL COMMENT '最近一次复习评分时间',
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_user_question (user_id, question_id),
  KEY idx_user_due (user_id, due_date)
) ENGINE=InnoDB COMMENT='云端错题本（SM-2 调度）';

-- ------------------------------------------------------------
-- 表7：知识块向量表（RAG 语义检索用，启动时为空会自动构建）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS knowledge_embedding (
  chunk_id VARCHAR(64)  PRIMARY KEY COMMENT '知识块ID，对应 chunks.js 的 id',
  model    VARCHAR(100) NOT NULL COMMENT '向量模型名或 pseudo（本地伪向量）',
  dim      INT          NOT NULL COMMENT '向量维度',
  vector   JSON         NOT NULL COMMENT '浮点数组（JSON 存储）',
  created_at DATETIME   NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB COMMENT='知识块向量表';

-- ------------------------------------------------------------
-- 表8：智能体对话日志（答辩演示可回放完整对话与工具调用过程）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS agent_log (
  id         BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id    VARCHAR(64)  NOT NULL,
  role       VARCHAR(16)  NOT NULL COMMENT 'user/assistant/tool',
  content    MEDIUMTEXT   NULL COMMENT '消息文本',
  tool_calls JSON         NULL COMMENT '工具调用明细数组',
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_user_time (user_id, created_at)
) ENGINE=InnoDB COMMENT='智能体对话日志表';

-- ------------------------------------------------------------
-- 表9：多人博弈对局主表（终局写入，含完整博弈报告 JSON）
-- 供"个性化画像"的游戏表现维度与教师复盘读取
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS game_room (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  room_code     VARCHAR(8)   NOT NULL COMMENT '4位房间码',
  host_user_id  VARCHAR(64)  NULL COMMENT '房主用户标识（政府位）',
  status        VARCHAR(20)  NOT NULL DEFAULT 'finished' COMMENT 'finished（只存终局）',
  total_rounds  INT          NOT NULL DEFAULT 3 COMMENT '总回合数',
  final_metrics JSON         NULL COMMENT '终局指标 {g,u,pi,r,Y,gap}',
  report        JSON         NULL COMMENT '完整博弈报告（事件/决策序列/雷达图/判定）',
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_code (room_code),
  KEY idx_host (host_user_id)
) ENGINE=InnoDB COMMENT='多人博弈对局表';

-- ------------------------------------------------------------
-- 表10：博弈决策序列（每回合 × 每角色一条，决策风格分析数据源）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS game_decision (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  room_id       BIGINT UNSIGNED NOT NULL COMMENT '关联 game_room.id',
  round_no      INT          NOT NULL COMMENT '回合 1~4',
  role          VARCHAR(20)  NOT NULL COMMENT 'government/bank/enterprise/consumer',
  user_id       VARCHAR(64)  NULL COMMENT '真人玩家标识（AI决策为NULL）',
  nickname      VARCHAR(50)  NOT NULL,
  decision      JSON         NOT NULL COMMENT '决策增量 如 {"dG":6,"dT":0}',
  metrics_after JSON         NULL COMMENT '该回合结算后指标',
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_room_round (room_id, round_no),
  KEY idx_user (user_id)
) ENGINE=InnoDB COMMENT='博弈决策序列表';

-- ------------------------------------------------------------
-- 表11：博弈协商聊天记录（小组博弈报告的对话内容）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS game_chat (
  id         BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  room_id    BIGINT UNSIGNED NOT NULL COMMENT '关联 game_room.id',
  user_id    VARCHAR(64)  NULL COMMENT '真人玩家标识',
  nickname   VARCHAR(50)  NOT NULL,
  role       VARCHAR(20)  NOT NULL,
  text       VARCHAR(300) NOT NULL COMMENT '聊天内容（上限300字）',
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_room (room_id)
) ENGINE=InnoDB COMMENT='博弈聊天记录表';

-- ============================================================
-- 以下为「知识图谱 + 学生画像 + 教师端 + 强化学习」扩展表
-- 设计原则：与既有表解耦，全部 CREATE TABLE IF NOT EXISTS，可重复执行
-- ============================================================

-- ------------------------------------------------------------
-- 表12：知识节点掌握度（BKT 的节点级口径，图谱着色与 RL 状态来源）
-- 与 mastery_state 的区别：mastery_state 按 5 个知识点统计，本表按 25 个知识节点统计
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS node_mastery (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id       VARCHAR(64)  NOT NULL,
  node_id       VARCHAR(40)  NOT NULL COMMENT '知识节点ID，对应 knowledge/graph.js',
  topic         VARCHAR(50)  NOT NULL COMMENT '所属知识点，便于按主题聚合',
  p_known       DECIMAL(5,4) NOT NULL DEFAULT 0.1500 COMMENT '节点掌握概率',
  attempts      INT          NOT NULL DEFAULT 0,
  correct_count INT          NOT NULL DEFAULT 0,
  updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_user_node (user_id, node_id),
  KEY idx_user_topic (user_id, topic)
) ENGINE=InnoDB COMMENT='知识节点掌握度表（BKT节点级）';

-- ------------------------------------------------------------
-- 表13：学习行为事件流（统一采集两游戏操作与学习行为，AI 画像的数据底座）
-- source 区分来源：game1 单机政策模拟 / game2 多人博弈 / learning 学习行为 / ai AI交互
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS learning_event (
  id         BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id    VARCHAR(64)  NOT NULL,
  source     VARCHAR(16)  NOT NULL COMMENT 'game1/game2/learning/ai',
  event_type VARCHAR(40)  NOT NULL COMMENT '如 game1.policy、learning.answer',
  payload    JSON         NULL COMMENT '事件负载（已裁剪为轻量字段）',
  duration_ms INT         NULL COMMENT '本次行为耗时',
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_user_time (user_id, created_at),
  KEY idx_user_source (user_id, source),
  KEY idx_type (event_type)
) ENGINE=InnoDB COMMENT='学习行为事件流表';

-- ------------------------------------------------------------
-- 表14：游戏一对局记录（单机政策模拟的终局快照）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS game1_session (
  id           BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id      VARCHAR(64)  NOT NULL,
  nickname     VARCHAR(50)  NULL,
  mode         VARCHAR(16)  NOT NULL DEFAULT 'learn' COMMENT 'learn 学习模式 / sandbox 沙盘模式',
  quarters     INT          NOT NULL DEFAULT 14 COMMENT '完成季度数',
  total_score  DECIMAL(6,2) NULL COMMENT '综合评分',
  radar        JSON         NULL COMMENT '五维评分雷达',
  kpi_series   JSON         NULL COMMENT '逐季度指标序列',
  achievements JSON         NULL COMMENT '获得成就',
  policy_count INT          NOT NULL DEFAULT 0 COMMENT '执行政策数',
  quiz_correct INT          NOT NULL DEFAULT 0 COMMENT '学习模式答题正确数',
  quiz_total   INT          NOT NULL DEFAULT 0 COMMENT '学习模式答题总数',
  started_at   DATETIME     NULL,
  finished_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_user_time (user_id, finished_at)
) ENGINE=InnoDB COMMENT='游戏一对局记录表';

-- ------------------------------------------------------------
-- 表15：学生画像（AI 生成的结构化画像，按用户唯一，重复生成覆盖）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS student_profile (
  id           BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id      VARCHAR(64)  NOT NULL,
  radar        JSON         NULL COMMENT '六维能力雷达',
  dimensions   JSON         NULL COMMENT '细分维度（知识点/习惯/游戏/AI使用）',
  tags         JSON         NULL COMMENT '画像标签',
  weak_nodes   JSON         NULL COMMENT '薄弱知识节点',
  narrative    TEXT         NULL COMMENT 'AI 生成的文字画像',
  summary      VARCHAR(200) NULL COMMENT '一句话画像摘要',
  source       VARCHAR(16)  NOT NULL DEFAULT 'rule' COMMENT 'rule 规则 / llm 大模型',
  model_name   VARCHAR(100) NULL,
  generated_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_user (user_id),
  KEY idx_generated (generated_at)
) ENGINE=InnoDB COMMENT='学生画像表';

-- ------------------------------------------------------------
-- 表16：学习建议（针对画像生成的可执行建议清单）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS learning_advice (
  id           BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id      VARCHAR(64)  NOT NULL,
  items        JSON         NOT NULL COMMENT '建议条目数组（含优先级/依据/动作）',
  narrative    TEXT         NULL COMMENT 'AI 生成的整体说明',
  source       VARCHAR(16)  NOT NULL DEFAULT 'rule' COMMENT 'rule / llm / rl',
  policy_node  VARCHAR(40)  NULL COMMENT 'RL 策略推荐的下一知识节点',
  model_name   VARCHAR(100) NULL,
  generated_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_user_time (user_id, generated_at)
) ENGINE=InnoDB COMMENT='学习建议表';

-- ------------------------------------------------------------
-- 表17：强化学习经验（DQN 的 (s,a,r,s') 转移，未作答时 reward 为空表示待回收）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rl_transition (
  id         BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id    VARCHAR(64)  NOT NULL,
  state      JSON         NOT NULL COMMENT '推荐时编码的学生状态（16维）',
  action     INT          NOT NULL COMMENT '动作下标（知识图谱节点序号）',
  node_id    VARCHAR(40)  NOT NULL COMMENT '被推荐的知识节点ID',
  reward     DECIMAL(7,4) NULL COMMENT '事后回收的奖励，NULL=尚未观测',
  next_state JSON         NULL COMMENT '作答后重新编码的状态',
  done       TINYINT(1)   NOT NULL DEFAULT 0,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  filled_at  DATETIME     NULL,
  KEY idx_user_time (user_id, created_at),
  KEY idx_pending (user_id, reward)
) ENGINE=InnoDB COMMENT='强化学习经验转移表';

-- ------------------------------------------------------------
-- 表18：强化学习模型存档（DQN 权重 + 回放缓冲区，单行覆盖式保存）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rl_model (
  model_name   VARCHAR(40)  PRIMARY KEY COMMENT '模型名，如 islm-dqn-v1',
  state_dim    INT          NOT NULL,
  action_dim   INT          NOT NULL,
  weights      LONGTEXT     NOT NULL COMMENT 'DQN 序列化 JSON',
  train_steps  INT          NOT NULL DEFAULT 0,
  avg_reward   DECIMAL(7,4) NULL COMMENT '近期平均奖励（监控用）',
  meta         JSON         NULL COMMENT '版本、隐层结构、训练时间等',
  updated_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB COMMENT='强化学习模型存档表';

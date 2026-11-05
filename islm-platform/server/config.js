/**
 * 服务端统一配置（唯一出口）
 * -------------------------------------------------
 * 所有配置集中从项目根目录的 .env 读取（dotenv），
 * 数据库 / 大模型配置相互独立，改动只碰 .env 不碰代码。
 */
import 'dotenv/config'

/** 读取 .env 变量，未设置时使用默认值 */
function env(key, defaultValue) {
  const v = process.env[key]
  return v === undefined || v === '' ? defaultValue : v
}

export const config = {
  /* HTTP 服务端口（Vite 开发代理指向这里） */
  port: Number(env('PORT', 3001)),

  /* MySQL 连接配置（阶梯导学会话存储） */
  db: {
    host: env('DB_HOST', '127.0.0.1'),
    port: Number(env('DB_PORT', 3306)),
    user: env('DB_USER', 'root'),
    password: env('DB_PASSWORD', ''),
    database: env('DB_NAME', 'islm_platform')
  },

  /* JWT 认证配置（登录签发令牌用） */
  jwt: {
    /* 生产环境务必在 .env 里设置随机密钥，默认值仅供本地开发 */
    secret: env('JWT_SECRET', 'islm-platform-dev-secret'),
    /* 令牌有效期：7 天（秒） */
    expiresInSeconds: 7 * 24 * 3600
  },

  /* 大模型配置（OpenAI 兼容协议，可切换供应商）
   * ------------------------------------------------------------
   * LLM_PROVIDER 决定厂商差异开关：
   *   ark      火山方舟（豆包），支持 thinking 参数与 /embeddings
   *   deepseek DeepSeek 开放平台，不支持 thinking 参数、无 embeddings 接口
   *   openai   任意 OpenAI 兼容网关
   * 变量优先读通用名 LLM_*，未设置时回退到历史变量 ARK_*，保证旧配置仍可用。
   */
  llm: {
    provider: env('LLM_PROVIDER', 'ark').toLowerCase(),
    baseUrl: env('LLM_BASE_URL', env('ARK_BASE_URL', 'https://ark.cn-beijing.volces.com/api/v3')),
    apiKey: env('LLM_API_KEY', env('ARK_API_KEY', '')),
    model: env('LLM_MODEL', env('ARK_MODEL', 'doubao-1-5-pro-32k-250115')),
    timeoutMs: 25000, // 单次调用超时，需小于前端 axios 的 30s
    /* 推理模型的思考开关：disabled=关闭深度思考（快、省token，适合教学场景）；
     * enabled=开启思考（更深度但慢，可能超出超时限制）；仅 provider=ark 生效 */
    thinking: env('LLM_THINKING', env('ARK_THINKING', 'disabled')),
    /* LLM_MOCK=true 时完全不调外部接口，返回固定假提示（无密钥也能跑通全流程） */
    mock: env('LLM_MOCK', 'true') === 'true',
    /* MOCK_LEAK=true 时 mock 第一次输出故意带答案数值，用于验证"泄露重试/降级"链路 */
    mockLeak: env('MOCK_LEAK', 'false') === 'true'
  },

  /* 向量检索（RAG 语义召回）
   * ------------------------------------------------------------
   * 只有火山方舟提供 /embeddings 接口；DeepSeek 等厂商没有，
   * 因此 EMBEDDING_REMOTE 默认仅在 provider=ark 时开启，
   * 关闭时使用本地确定性伪向量（256 维，零依赖、结果可复现）。
   */
  embedding: {
    model: env('EMBEDDING_MODEL', env('ARK_EMBEDDING_MODEL', 'doubao-embedding-large-text-250515')),
    pseudoDim: 256, // 本地伪向量维度
    remote: env(
      'EMBEDDING_REMOTE',
      env('LLM_PROVIDER', 'ark').toLowerCase() === 'ark' ? 'true' : 'false'
    ) === 'true'
  },

  /* 教师账号注册邀请码：注册时 role=teacher 必须携带正确邀请码，
   * 避免学生误注册成教师账号（生产环境请在 .env 覆盖默认值） */
  teacher: {
    inviteCode: env('TEACHER_INVITE_CODE', 'HZYJ-TEACHER')
  },

  /* 学生画像与学习建议的生成开关（关掉可完全走确定性规则，零模型成本） */
  profile: {
    useLLM: env('PROFILE_USE_LLM', 'true') === 'true'
  }
}

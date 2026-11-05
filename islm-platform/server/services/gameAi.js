/**
 * 多人博弈游戏 · AI 托管决策
 * -------------------------------------------------
 * 两个用途（需求文档 4.2 掉线保护 + 快速演示）：
 *  1. 房主创建房间时勾选"AI 补位"——空缺角色由 AI 自动决策
 *  2. 轮到真人决策超时（60s）——系统自动托管，防止卡局
 *
 * 决策原则：方向正确的保守逆周期调节（需求 4.1：不追求精确，保证方向正确）：
 *  - 经济偏冷（gap < 0）→ 政府/银行/企业/居民合力适度扩张
 *  - 经济过热（gap > 0）→ 反向操作
 */

/**
 * 生成某个角色的一步 AI 决策
 * @param {string} role      government / bank / enterprise / consumer
 * @param {Object} params    当前 IS-LM 参数
 * @param {Object} metrics   当前指标 { g, u, pi, r, gap }
 * @returns {Object}         该角色的决策增量（与 DECISION_LIMITS 键名一致）
 */
export function aiDecide(role, params, metrics) {
  const { gap, r, u, pi } = metrics

  /* 政府AI（含央行）：财政三件套 + 货币 + 对外，逆周期调节 */
  if (role === 'government') {
    if (gap < -0.03) {
      // 明显偏冷：加大基建 + 减税 + 增加转移支付 + 发债融资 + 货币宽松
      return { dG: 5, dT: -2, dTr: 2, dDebt: 5, dMP: 10, dNX: 0 }
    }
    if (gap < -0.01) {
      // 轻度偏冷：温和扩张
      return { dG: 3, dT: -1, dTr: 1, dDebt: 3, dMP: 5, dNX: 0 }
    }
    if (gap > 0.02) {
      // 过热：压支出、增税、紧货币
      return { dG: -3, dT: 2, dTr: -1, dDebt: 0, dMP: -8, dNX: 0 }
    }
    return { dG: 0, dT: 0, dTr: 0, dDebt: 0, dMP: 0, dNX: 0 }  // 目标区间：维持
  }

  /* 银行AI：跟随货币政策方向，看利率与缺口决定信贷投放 */
  if (role === 'bank') {
    if (r > 0.07) {
      // 利率过高：释放准备金 + 扩信贷 + 向央行申请流动性 + 不加息
      return { dReserve: -3, dCredit: 8, dLiquidity: 4, dDeposit: 0 }
    }
    if (gap < -0.03) {
      // 偏冷：适度宽信用
      return { dReserve: -2, dCredit: 6, dLiquidity: 3, dDeposit: -1 }
    }
    if (gap < -0.01) {
      return { dReserve: -1, dCredit: 3, dLiquidity: 1, dDeposit: 0 }
    }
    if (gap > 0.02 || pi > 4) {
      // 过热/通胀高：收紧信贷、多留准备金
      return { dReserve: 2, dCredit: -4, dLiquidity: -2, dDeposit: 1 }
    }
    return { dReserve: 0, dCredit: 0, dLiquidity: 0, dDeposit: 0 }
  }

  /* 企业AI：融资成本下降就扩投资扩产，成本高就收缩 */
  if (role === 'enterprise') {
    if (r < 0.035 && gap > -0.04) {
      // 低利率且未深度衰退：扩投资 + 扩招 + 发股债融资
      return { dI0: 4, dLabor: 2, dFinance: 3, dPrice: 0 }
    }
    if (r < 0.055 && gap > -0.02) {
      // 温和环境下顺势扩张
      return { dI0: 2, dLabor: 1, dFinance: 1, dPrice: 0 }
    }
    if (r > 0.075 || gap < -0.04) {
      // 高利率或深度衰退：收缩投资、裁员、降价促销
      return { dI0: -3, dLabor: -2, dFinance: -2, dPrice: -1 }
    }
    return { dI0: 0, dLabor: 0, dFinance: 0, dPrice: 0 }
  }

  /* 消费者AI：就业好就敢花钱敢借贷，失业率高就预防性储蓄 */
  if (role === 'consumer') {
    if (u > 6.2) {
      // 失业率高：多储蓄少消费、少借贷、金融资产转保守
      return { dC0: -2, dSave: 3, dAsset: -1, dBorrow: -2 }
    }
    if (u < 5.3 && gap > -0.01) {
      // 就业充分：提升消费、适度借贷、配置收益资产
      return { dC0: 2, dSave: -2, dAsset: 1, dBorrow: 1 }
    }
    return { dC0: 0, dSave: 0, dAsset: 0, dBorrow: 0 }
  }

  return {}
}

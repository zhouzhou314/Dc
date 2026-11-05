/**
 * SM-2 间隔重复算法服务（SuperMemo-2）
 * -------------------------------------------------
 * 错题复习调度：根据复习质量 q（0~5）决定下次复习间隔。
 * 教学场景把 q 映射为三档按钮：
 *   忘了 → q=1   模糊 → q=3   记得 → q=5
 *
 * SM-2 规则：
 *   q < 3（没记住）  → repetitions 清零，间隔重置为 1 天（明天再来）
 *   q >= 3（记住了） → repetitions+1，间隔依次 1 → 6 → round(interval * EF)
 *   EF 更新：EF' = EF + (0.1 - (5-q) * (0.08 + (5-q) * 0.02))，下限 1.3
 */

/** 质量分档 → SM-2 的 q 值 */
export const GRADE_MAP = { forgot: 1, fuzzy: 3, remember: 5 }

/**
 * 纯函数：给定旧调度状态与本次 q，计算新调度状态
 * @param {{easeFactor:number, intervalDays:number, repetitions:number}} prev
 * @param {number} q 复习质量 0~5
 * @returns {{easeFactor:number, intervalDays:number, repetitions:number, dueDate:string}}
 */
export function sm2Schedule(prev, q) {
  let { easeFactor: ef, intervalDays: interval, repetitions: rep } = prev

  if (q < 3) {
    /* 没记住：一切重来，明天复习 */
    rep = 0
    interval = 0
    /* EF 仍按公式微调（SM-2 原版行为） */
    ef = Math.max(1.3, ef + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)))
  } else {
    /* 记住了：间隔按 1 → 6 → interval*EF 递进 */
    rep += 1
    interval = rep === 1 ? 1 : rep === 2 ? 6 : Math.round(interval * ef)
    ef = Math.max(1.3, ef + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)))
  }

  /* 计算下次到期日期（YYYY-MM-DD） */
  const due = new Date()
  due.setDate(due.getDate() + Math.max(interval, 1)) // 间隔 0 视为明天
  const dueDate = due.toISOString().slice(0, 10)

  return {
    easeFactor: Number(ef.toFixed(2)),
    intervalDays: interval,
    repetitions: rep,
    dueDate
  }
}

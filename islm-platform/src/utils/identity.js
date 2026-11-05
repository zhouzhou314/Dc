/**
 * 匿名身份工具
 * -------------------------------------------------
 * 未登录学生也要能产生可归属的学习数据：首次访问时生成一个稳定 id
 * 存进 localStorage（key: islm_hintUserId），此后所有上报都带上它，
 * 后端 resolveUserId 会用它作为 user_id。登录后后端优先使用 JWT 身份，
 * 匿名阶段的数据仍保留在原 id 下（不做迁移，避免串号）。
 */
import { loadLocal, saveLocal, genId } from '@/utils/storage'

/** 取（或首次创建）匿名用户标识 */
export function getAnonUserId() {
  let id = loadLocal('hintUserId')
  if (!id) {
    id = genId()
    saveLocal('hintUserId', id)
  }
  return id
}

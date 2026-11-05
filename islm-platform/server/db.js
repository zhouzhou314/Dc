/**
 * MySQL 连接池封装
 * -------------------------------------------------
 * - 导出 pool（mysql2/promise 连接池）与 query 快捷函数
 * - 启动时自动执行 server/sql/init.sql 完成幂等建表，
 *   学生只需保证 MySQL 已启动且 .env 密码正确即可，无需手动建表
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import mysql from 'mysql2/promise'
import { config } from './config.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/* 创建连接池（JSON 列会自动与 JS 对象互转） */
export const pool = mysql.createPool({
  ...config.db,
  waitForConnections: true,
  connectionLimit: 8,
  charset: 'utf8mb4_unicode_ci'
})

/** 快捷查询：返回 rows */
export async function query(sql, params = []) {
  const [rows] = await pool.query(sql, params)
  return rows
}

/**
 * 容错查询：表不存在 / 字段缺省等可降级场景返回兜底值
 * 画像与教师端聚合会读取较多历史表，单表缺失不应让整个接口 500
 */
export async function safeQuery(sql, params = [], fallback = []) {
  try {
    return await query(sql, params)
  } catch (e) {
    console.warn('[db] 查询降级：', e.code || e.message)
    return fallback
  }
}

/**
 * 幂等新增列：先查 information_schema，不存在才 ALTER
 * MySQL 8 的 ADD COLUMN 不支持 IF NOT EXISTS，因此必须自己判重，
 * 否则容器重启重复执行 init 会因"列已存在"直接失败
 */
async function ensureColumn(conn, table, column, ddl) {
  const [rows] = await conn.query(
    `SELECT 1 FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1`,
    [config.db.database, table, column]
  )
  if (rows.length === 0) {
    await conn.query(`ALTER TABLE \`${table}\` ADD COLUMN ${ddl}`)
    console.log(`[db] 已新增列 ${table}.${column}`)
  }
}

/**
 * 执行 init.sql 完成建库建表（幂等）
 * 注意：脚本里含 CREATE DATABASE / USE 语句，必须不指定 database 直连后逐条执行
 * 容器部署时 MySQL 可能比应用晚就绪：内置 5 次重试、每次间隔 3s
 */
export async function initDatabase(retries = 5, delayMs = 3000) {
  const sqlText = fs.readFileSync(path.join(__dirname, 'sql', 'init.sql'), 'utf-8')

  /* 按 ; 切分语句（脚本内容可控，无存储过程/触发器，简单切分即可） */
  const statements = sqlText
    .split(';')
    .map(s => s.replace(/--[^\n]*/g, '').trim()) // 去掉注释再判断空语句
    .filter(Boolean)

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      /* 用一个不带 database 的临时连接执行（CREATE DATABASE 阶段还没有库可连） */
      const conn = await mysql.createConnection({
        host: config.db.host,
        port: config.db.port,
        user: config.db.user,
        password: config.db.password
      })
      for (const stmt of statements) {
        await conn.query(stmt)
      }
      /* 列级增量迁移：users 表新增"角色/班级"，用于教师端权限与学生分班 */
      await ensureColumn(conn, 'users', 'role',
        "role VARCHAR(16) NOT NULL DEFAULT 'student' COMMENT 'student 学生 / teacher 教师'")
      await ensureColumn(conn, 'users', 'class_name',
        "class_name VARCHAR(50) DEFAULT '默认班级' COMMENT '所属班级，教师端按班查看学情'")
      await conn.end()
      console.log('[db] 数据库与数据表已就绪（islm_platform）')
      return
    } catch (e) {
      if (attempt === retries) throw e
      console.warn(`[db] MySQL 未就绪（第 ${attempt}/${retries} 次尝试），${delayMs / 1000}s 后重试：`, e.code || e.message)
      await new Promise(r => setTimeout(r, delayMs))
    }
  }
}

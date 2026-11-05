/**
 * 知识库切块模块（RAG 检索源）
 * -------------------------------------------------
 * 直接复用前端数据文件 src/data/chapter11.js（已改为相对路径 import，
 * Node ESM 可加载），在模块加载时一次性切成检索 chunk 并缓存。
 *
 * 切块规则：
 *  - 每个 h4 小标题单元 = 1 个 chunk（小节内按 h4 边界切分）
 *  - exercises 每题 = 1 个 chunk（type='习题解析'，仅 L4 检索放开）
 *  - 另备 2 个"通用框架"兜底 chunk（检索不足时回补，不含任何答案数值）
 *
 * chunk 字段：{ chunkId, sectionKey, title, type, content, text }
 *  - content：给模型看的知识正文（检索后截断 600 字）
 *  - text：标题+正文全文，用于"数值泄露闸"匹配
 */
import { chapterMeta, sections, exercises } from '../../src/data/chapter11.js'
import { questionBank } from '../../src/data/questionBank.js'
import { stripHtml } from '../services/leakGuard.js'

/** 各块类型 → 纯文本（去 HTML，拼接为可检索正文） */
function blockToText(block) {
  switch (block.type) {
    case 'h4':
      return block.text
    case 'p':
      return stripHtml(block.text)
    case 'ul':
      return block.items.map(it => stripHtml(it)).join('；')
    case 'keypoint':
      return '【核心考点】' + stripHtml(block.text)
    case 'formula':
      return '【公式】' + block.text
    case 'derive':
      return '【推导：' + stripHtml(block.title) + '】' +
        block.steps.map((s, i) => `(${i + 1}) ${s.formula}（${stripHtml(s.note)}）`).join(' ')
    case 'symbols':
      return '【符号说明】' +
        block.items.map(it => `${it.sym}（${it.name}）：${stripHtml(it.desc)}`).join('；')
    case 'table':
      return '【表格】' + block.head.join(' | ') + ' ' +
        block.rows.map(r => r.join(' | ')).join(' ； ')
    case 'chart':
      return '【图示】' + stripHtml(block.title) + ' ' + stripHtml(block.desc || '')
    case 'lab':
      return '【交互实验】' + stripHtml(block.desc || '')
    default:
      return ''
  }
}

/** 根据 chunk 内包含的块类型判定 chunk 类型（检索过滤与展示用） */
function decideChunkType(blocks) {
  const types = blocks.map(b => b.type)
  if (types.includes('derive')) return '公式推导'
  if (types.includes('symbols')) return '符号说明'
  if (types.includes('formula')) return '公式讲解'
  return '知识点讲解'
}

/** 组装一个 chunk 的正文与全文（text = 标题 + 正文，供泄露闸匹配） */
function makeChunk(chunkId, sectionKey, title, blocks) {
  const parts = blocks.map(blockToText).filter(Boolean)
  const content = parts.join('\n')
  const type = decideChunkType(blocks)
  return {
    chunkId,
    sectionKey,
    title: stripHtml(title),
    type,
    content,
    text: (title + '\n' + content).toLowerCase()
  }
}

function buildChunks() {
  const list = []

  /* 1) 知识讲解：每个 h4 单元一个 chunk */
  for (const section of sections) {
    let current = null // { title, blocks }
    let index = 0
    const flush = () => {
      if (!current) return
      index += 1
      list.push(makeChunk(
        `${section.key}-u${index}`,
        section.key,
        current.title,
        current.blocks
      ))
    }
    for (const block of section.blocks) {
      if (block.type === 'h4') {
        flush()
        current = { title: block.text, blocks: [block] }
      } else if (current) {
        current.blocks.push(block)
      }
    }
    flush()
  }

  /* 2) 习题解析：每题一个 chunk（L1~L3 的检索池会排除这一类） */
  const bankMap = new Map(questionBank.map(q => [q.id, q]))
  for (const ex of exercises) {
    const bank = bankMap.get(ex.id)
    const pieces = ['【课后习题 ' + ex.id + '】' + stripHtml(ex.question)]
    if (ex.type === 'choice') {
      pieces.push('选项：' + ex.options.map((o, i) => `${'ABCD'[i]}. ${stripHtml(o)}`).join(' '))
    }
    if (ex.analysis) pieces.push('解析：' + stripHtml(ex.analysis))
    /* questionBank 副本多出 steps 字段（逐步解题），补充进解析正文供 L4 使用 */
    if (bank?.steps?.length) {
      pieces.push('解题步骤：' + bank.steps.map((s, i) => `(${i + 1}) ${s.f}（${stripHtml(s.note)}）`).join(' '))
    }
    const content = pieces.join('\n')
    list.push({
      chunkId: 'ex-' + ex.id,
      sectionKey: 'exercises',
      title: `课后习题${ex.id}解析`,
      type: '习题解析',
      content,
      text: content.toLowerCase()
    })
  }

  /* 3) 通用框架兜底 chunk：不含任何具体答案数值，检索不足时回补 */
  list.push({
    chunkId: 'fb-framework',
    sectionKey: 'fallback',
    title: 'IS-LM解题通用框架',
    type: '通用框架',
    content:
      '【核心考点】IS-LM解题通用四步框架：\n' +
      '（1）读题列已知：从消费函数、投资函数、货币需求、货币供给中抄下参数与字母含义；\n' +
      '（2）写IS方程：由产品市场均衡（投资=储蓄，或 Y=C+I+G）整理成 r 关于 y 的函数；\n' +
      '（3）写LM方程：由货币市场均衡（m = ky − hr）整理成 r 关于 y 的函数；\n' +
      '（4）联立求解：两式相等解出均衡产出，再回代任一方程得均衡利率。\n' +
      '单选题则回到"曲线定义与两侧失衡含义"判断：IS曲线关注 i 与 s 的关系，LM曲线关注 L 与 m 的关系。',
    text: 'is-lm 解题通用框架 联立 均衡 方程 is方程 lm方程 读题 已知'
  })
  list.push({
    chunkId: 'fb-reading',
    sectionKey: 'fallback',
    title: '读题找条件的方法',
    type: '通用框架',
    content:
      '【核心考点】读题方法：把题干每个条件"翻译"成模型语言——\n' +
      '消费函数 C = C₀ + c·Yd 给出自主消费与边际消费倾向；\n' +
      '投资函数 I = e − dr 给出自主投资与投资利率敏感度；\n' +
      '政府支出 G、税收 T 决定三部门IS的截距；\n' +
      '货币需求 L = ky − hr 与实际货币供给 m = M/P 共同决定LM方程；\n' +
      '参数变动（G、M/P等）意味着曲线移动而非点的移动。',
    text: '读题 条件 消费函数 投资函数 货币需求 货币供给 参数 曲线移动'
  })

  return list
}

/** 检索 chunk 全集（模块级缓存，进程内只构建一次，约 40 条） */
export const allChunks = buildChunks()

/** 兜底 chunk 引用（retriever 回补用） */
export const fallbackChunks = allChunks.filter(c => c.type === '通用框架')

/** 章节名（提示词变量 {{chapter_scope}} / {{chapter_name}} 用） */
export const chapterScope = `${chapterMeta.no} ${chapterMeta.title}`

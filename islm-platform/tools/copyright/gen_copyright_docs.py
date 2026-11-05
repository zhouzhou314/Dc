#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
软件著作权申请材料生成脚本
============================================================
输入：项目源码 + 元信息（软件名称/版本/著作权人/完成日期）
输出（默认写到 docs/copyright/）：
  01_软件著作权登记申请表_信息表.docx
  02_源程序_前30页+后30页.docx      每页 50 行，共 60 页
  03_软件说明书.docx                功能/环境/部署/算法/接口

用法：
  python tools/copyright/gen_copyright_docs.py \
      --owner "张三" --date 2026-06-30

不传 --owner / --date 时使用占位符，便于先出草稿后补填。
"""
import argparse
import os
import re
from datetime import date
from pathlib import Path

from docx import Document
from docx.enum.section import WD_SECTION
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_BREAK
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor

ROOT = Path(__file__).resolve().parents[2]
OUT_DIR = ROOT / "docs" / "copyright"

SOFT_NAME = "宏观经济学智能学习系统"
SOFT_VERSION = "V1.0"
SOFT_FULL = f"{SOFT_NAME} {SOFT_VERSION}"

# ------------------------------------------------------------
# 源程序收录顺序：按"入口 → 游戏 → 学习 → AI → 后端 → 算法 → 数据"排列
# ------------------------------------------------------------
SOURCE_FILES = [
    "src/main.js",
    "src/App.vue",
    "src/views/HomeView.vue",
    "src/views/game/Game1View.vue",
    "src/game1/context.js",
    "src/game1/data.js",
    "src/game1/models.js",
    "src/game1/charts.js",
    "src/game1/quiz.js",
    "src/game1/engine.js",
    "src/game1/main.js",
    "src/views/game/Game2LobbyView.vue",
    "src/views/game/Game2RoomView.vue",
    "src/components/game/RolePanel.vue",
    "src/components/game/GameChart.vue",
    "src/components/game/ResultDialog.vue",
    "src/views/learning/Chapter11View.vue",
    "src/views/learning/KnowledgeGraphView.vue",
    "src/views/learning/ExerciseView.vue",
    "src/views/learning/WrongBookView.vue",
    "src/views/learning/StatsView.vue",
    "src/views/learning/ScheduleView.vue",
    "src/views/learning/ResourceView.vue",
    "src/views/learning/CommunityView.vue",
    "src/components/ISLMSimulator.vue",
    "src/components/HintPanel.vue",
    "src/components/KnowledgeChart.vue",
    "src/views/ai/StudentProfileView.vue",
    "src/views/ai/AiAssistantView.vue",
    "src/views/teacher/TeacherView.vue",
    "src/views/common/LoginView.vue",
    "src/api/request.js",
    "src/api/event.js",
    "src/api/ai.js",
    "src/api/teacher.js",
    "src/api/knowledge.js",
    "src/api/game1.js",
    "src/api/hint.js",
    "src/api/record.js",
    "src/api/review.js",
    "src/api/islm.js",
    "src/api/agent.js",
    "src/api/sse.js",
    "src/api/gameSocket.js",
    "src/store/auth.js",
    "src/store/learning.js",
    "src/utils/storage.js",
    "src/utils/identity.js",
    "src/utils/game1Recorder.js",
    "src/utils/islmCalc.js",
    "src/constants/presets.js",
    "src/constants/game.js",
    "src/data/questionBank.js",
    "src/data/chapter11.js",
    "server/app.js",
    "server/config.js",
    "server/db.js",
    "server/knowledge/graph.js",
    "server/knowledge/chunks.js",
    "server/ml/neuralNet.js",
    "server/ml/dqn.js",
    "server/ml/encoder.js",
    "server/services/profileService.js",
    "server/services/adviceService.js",
    "server/services/rlService.js",
    "server/services/nodeMasteryService.js",
    "server/services/teacherService.js",
    "server/services/bktService.js",
    "server/services/recommendService.js",
    "server/services/reviewService.js",
    "server/services/hintService.js",
    "server/services/leakGuard.js",
    "server/services/retriever.js",
    "server/services/llm.js",
    "server/services/embeddingService.js",
    "server/services/agentService.js",
    "server/services/gameEngine.js",
    "server/services/gameStore.js",
    "server/services/gameEvents.js",
    "server/services/gameAi.js",
    "server/services/islmSolver.js",
    "server/ws/gameGateway.js",
    "server/middleware/auth.js",
    "server/middleware/teacher.js",
    "server/routes/auth.js",
    "server/routes/record.js",
    "server/routes/analytics.js",
    "server/routes/hint.js",
    "server/routes/wrongbook.js",
    "server/routes/review.js",
    "server/routes/islm.js",
    "server/routes/agent.js",
    "server/routes/game.js",
    "server/routes/game1.js",
    "server/routes/event.js",
    "server/routes/knowledge.js",
    "server/routes/ai.js",
    "server/routes/teacher.js",
    "server/prompts/profile.txt",
    "server/prompts/advice.txt",
    "server/prompts/teacher.txt",
    "server/sql/init.sql",
]

LINES_PER_PAGE = 50
PAGES_PER_SIDE = 30


# ------------------------------------------------------------
# 基础排版工具
# ------------------------------------------------------------
def set_cn_font(run, name="宋体", size=None, bold=None, color=None):
    """同时设置西文与中文（eastAsia）字体，否则中文会回退到默认字体"""
    run.font.name = name
    rpr = run._element.get_or_add_rPr()
    rfonts = rpr.find(qn("w:rFonts"))
    if rfonts is None:
        rfonts = OxmlElement("w:rFonts")
        rpr.append(rfonts)
    rfonts.set(qn("w:eastAsia"), name)
    rfonts.set(qn("w:ascii"), name)
    rfonts.set(qn("w:hAnsi"), name)
    if size is not None:
        run.font.size = Pt(size)
    if bold is not None:
        run.font.bold = bold
    if color is not None:
        run.font.color.rgb = color


def add_page_number_footer(section, prefix="第 "):
    """页脚插入 PAGE / NUMPAGES 域"""
    footer_p = section.footer.paragraphs[0]
    footer_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = footer_p.add_run(prefix)
    set_cn_font(run, "宋体", 9)

    def add_field(paragraph, instr):
        r = paragraph.add_run()
        fld_begin = OxmlElement("w:fldChar")
        fld_begin.set(qn("w:fldCharType"), "begin")
        instr_el = OxmlElement("w:instrText")
        instr_el.set(qn("xml:space"), "preserve")
        instr_el.text = f" {instr} "
        fld_end = OxmlElement("w:fldChar")
        fld_end.set(qn("w:fldCharType"), "end")
        r._r.append(fld_begin)
        r._r.append(instr_el)
        r._r.append(fld_end)
        set_cn_font(r, "宋体", 9)

    add_field(footer_p, "PAGE")
    r2 = footer_p.add_run(" 页 / 共 ")
    set_cn_font(r2, "宋体", 9)
    add_field(footer_p, "NUMPAGES")
    r3 = footer_p.add_run(" 页")
    set_cn_font(r3, "宋体", 9)


def add_header_text(section, text):
    """页眉：软件名称与版本号 + 文档类型"""
    header_p = section.header.paragraphs[0]
    header_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = header_p.add_run(text)
    set_cn_font(run, "宋体", 9, color=RGBColor(0x33, 0x33, 0x33))


def setup_a4(section, top=2.0, bottom=2.0, left=2.0, right=2.0):
    section.page_width = Cm(21)
    section.page_height = Cm(29.7)
    section.top_margin = Cm(top)
    section.bottom_margin = Cm(bottom)
    section.left_margin = Cm(left)
    section.right_margin = Cm(right)


def tight_paragraph(doc, text, size=8.5, spacing=13.6):
    """源码行：固定行距、零段间距、无首行缩进"""
    p = doc.add_paragraph()
    pf = p.paragraph_format
    pf.space_before = Pt(0)
    pf.space_after = Pt(0)
    pf.line_spacing = Pt(spacing)
    pf.first_line_indent = Pt(0)
    run = p.add_run(text if text else " ")
    set_cn_font(run, "Consolas", size)
    return p


def text_width_units(s):
    """按显示宽度计：中文/全角算 2，其它算 1"""
    n = 0
    for ch in s:
        n += 2 if ord(ch) > 0x2E7F else 1
    return n


def wrap_source_line(line, max_units=96):
    """
    手工折行：超宽行按显示宽度切成多行（续行前加缩进标记），
    保证每页固定 50 行时不会因自动换行而溢出，页数可控。
    """
    if text_width_units(line) <= max_units:
        return [line]
    out = []
    cur = ""
    cur_units = 0
    for ch in line:
        u = 2 if ord(ch) > 0x2E7F else 1
        if cur_units + u > max_units:
            out.append(cur)
            cur = "    " + ch
            cur_units = 4 + u
        else:
            cur += ch
            cur_units += u
    if cur:
        out.append(cur)
    return out


def build_source_lines():
    """拼装全部源码行（含文件分隔注释），返回 list[str]"""
    lines = []
    for rel in SOURCE_FILES:
        path = ROOT / rel
        if not path.exists():
            continue
        lines.append(f"/* ==================== 文件：{rel} ==================== */")
        try:
            raw = path.read_text(encoding="utf-8", errors="replace").splitlines()
        except Exception as exc:  # noqa: BLE001
            lines.append(f"/* 读取失败：{exc} */")
            continue
        for ln in raw:
            lines.extend(wrap_source_line(ln.replace("\t", "    ")))
    return lines


# ------------------------------------------------------------
# 文档一：申请表信息表
# ------------------------------------------------------------
def make_application_form(owner, finish_date, out_path):
    doc = Document()
    setup_a4(doc.sections[0], top=2.2, bottom=2.2, left=2.2, right=2.2)
    add_header_text(doc.sections[0], f"{SOFT_FULL} · 软件著作权登记申请表信息")
    add_page_number_footer(doc.sections[0])

    title = doc.add_paragraph()
    title.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = title.add_run("计算机软件著作权登记申请表（信息汇总）")
    set_cn_font(r, "黑体", 18, bold=True)
    sub = doc.add_paragraph()
    sub.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = sub.add_run(f"{SOFT_FULL}")
    set_cn_font(r, "宋体", 12)

    rows = [
        ("软件全称", SOFT_NAME),
        ("软件简称", "无"),
        ("版本号", SOFT_VERSION),
        ("开发完成日期", finish_date),
        ("首次发表日期", "未发表（本次登记不主张发表信息）"),
        ("开发方式", "独立开发"),
        ("权利取得方式", "原始取得"),
        ("权利范围", "全部权利"),
        ("软件分类", "应用软件 / 教育行业软件（教学辅助）"),
        ("著作权人", owner),
        ("开发者", owner),
        (
            "开发的硬件环境",
            "x86_64 个人计算机；CPU 四核 2.4GHz 及以上；内存 8GB 及以上；"
            "硬盘可用空间 10GB 及以上；显示器 1920×1080。",
        ),
        (
            "运行的硬件环境",
            "服务器：x86_64，CPU 四核 2.0GHz 及以上，内存 4GB 及以上，硬盘 20GB 及以上；"
            "客户端：x86_64 个人计算机或同等性能终端，内存 4GB 及以上，显示器 1366×768 及以上。",
        ),
        (
            "开发该软件的操作系统",
            "Windows 10 / Windows 11（64 位）",
        ),
        (
            "软件开发环境 / 开发工具",
            "Node.js 20 LTS、npm 10、Vite 5、Visual Studio Code；"
            "数据库 MySQL 8.0（客户端 mysql2）；版本管理 Git；"
            "接口调试 Apifox / 浏览器开发者工具；文档 Python 3.12 + python-docx。",
        ),
        (
            "该软件的运行平台 / 操作系统",
            "服务端：Windows Server 2019/2022 或 Linux（Docker 容器，镜像基于 node:20-alpine）；"
            "客户端：Chrome 100+ / Edge 100+ / Firefox 100+ 等现代浏览器。",
        ),
        (
            "运行支撑环境",
            "Node.js 20 运行时、MySQL 8.0 数据库；可选 Docker Engine 24 + Docker Compose v2；"
            "客户端无需安装插件，浏览器直接访问。",
        ),
        (
            "编程语言",
            "JavaScript（ES2022，前端 Vue 3 单文件组件 / 后端 Node.js ESM）、"
            "SQL、HTML5、CSS3；提示词模板为纯文本。",
        ),
        (
            "源程序量",
            "源程序文件 117 个，合计 21,880 行（不含第三方依赖 node_modules 与构建产物 dist）。",
        ),
        (
            "开发目的",
            "解决宏观经济学 IS-LM 模型教学中“模型抽象难理解、做题卡壳无人引导、"
            "学情反馈滞后”三个问题：用两套可操作的游戏把曲线移动变成可见的因果链，"
            "用知识图谱与题库支撑结构化学习，用 AI 读取学习行为生成学生画像与个性化建议，"
            "并把班级学情汇总给教师，形成“玩—学—练—诊—教”闭环。",
        ),
        (
            "面向行业",
            "教育行业（高等院校经济学课程教学、学生学习辅助、教师学情分析）。",
        ),
        (
            "主要功能",
            "1. 游戏一（单机宏观政策模拟）：14 个季度、44 张政策卡、六步传导动画、"
            "IS-LM/AD-AS/菲利普斯/GDP 四图联动、学习与沙盘两种模式；\n"
            "2. 游戏二（多人博弈）：4 角色（政府/银行/企业/消费者）实时 WebSocket 对局、"
            "事件冲击、协商聊天、五维雷达结算；\n"
            "3. 知识学习：章节讲解、IS-LM 交互仿真器、30 题题库三种练习模式、"
            "25 节点知识图谱、错题本与 SM-2 复习、课程日程、学习统计、资源库、问答社区；\n"
            "4. AI 分析：统一采集两游戏操作与学习行为，BKT 知识追踪 + 自研 MLP/DQN 强化学习"
            "推荐下一知识节点，生成六维学生画像、标签与 AI 文字画像，输出针对性学习建议；\n"
            "5. AI 导学：L1~L4 阶梯提示、RAG 知识库检索、防答案泄露校验与降级、SSE 流式输出、"
            "Function Calling 教学智能体；\n"
            "6. 教师端：班级概览、风险分级、知识点热力、活跃趋势、班级 AI 学情简报、"
            "学生画像与建议查看、行为流、CSV 导出；\n"
            "7. 平台能力：JWT 认证与角色权限、匿名/登录双模式、Docker 一键部署、"
            "大模型无密钥自动降级。",
        ),
        (
            "技术特点",
            "1. 双游戏同源数据：两套游戏的操作统一写入学习行为事件流，"
            "与题库作答、阶梯提示共同构成 AI 的数据底座；\n"
            "2. 自研纯 JavaScript 神经网络与强化学习：16 维状态编码 → 64×64 隐层 → 25 个知识节点动作的 DQN，"
            "含经验回放、目标网络、ε-贪心、Huber 损失与 TD 目标裁剪，权重入库可持久化；\n"
            "3. 知识图谱驱动：25 个知识节点、45 条边（39 条先修 + 6 条关联），"
            "节点级 BKT 掌握度着色，学习前沿按先修关系自动计算；\n"
            "4. 防泄露导学：L1~L3 提示词不下发标准答案，输出端数值/选项校验，"
            "不合格重试一次后降级直出知识卡；\n"
            "5. 可解释画像：先由规则计算确定性量化画像，再由大模型只负责“把数字讲成人话”，"
            "避免模型编造数据；\n"
            "6. 全链路降级：无大模型 Key、无向量服务、后端不可用时均有本地兜底，功能不中断；\n"
            "7. 多模型供应商可切换：同一套 OpenAI 兼容协议适配 DeepSeek、火山方舟（豆包）或任意兼容网关，"
            "供应商差异（thinking 参数、embedding 接口）由配置开关隔离，切换供应商无需改代码。",
        ),
        ("软件著作权人联系人", "【待填写】"),
        ("联系电话", "【待填写】"),
        ("电子邮箱", "【待填写】"),
        ("通信地址", "【待填写】"),
    ]

    table = doc.add_table(rows=0, cols=2)
    table.style = "Table Grid"
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    for key, val in rows:
        cells = table.add_row().cells
        cells[0].width = Cm(4.2)
        cells[1].width = Cm(12.4)
        p0 = cells[0].paragraphs[0]
        r0 = p0.add_run(key)
        set_cn_font(r0, "宋体", 10.5, bold=True)
        p1 = cells[1].paragraphs[0]
        for i, seg in enumerate(str(val).split("\n")):
            if i > 0:
                p1 = cells[1].add_paragraph()
            r1 = p1.add_run(seg)
            set_cn_font(r1, "宋体", 10.5)

    note = doc.add_paragraph()
    note.paragraph_format.space_before = Pt(8)
    r = note.add_run(
        "说明：表中标注【待填写】的字段为申请人联系信息；若著作权人为单位，"
        "请将“开发方式/权利取得方式”按实际情况调整，并附营业执照复印件。"
    )
    set_cn_font(r, "宋体", 9, color=RGBColor(0x88, 0x88, 0x88))

    doc.save(out_path)
    return out_path


# ------------------------------------------------------------
# 文档二：源程序（前 30 页 + 后 30 页）
# ------------------------------------------------------------
def make_source_doc(out_path):
    all_lines = build_source_lines()
    total = len(all_lines)
    half = LINES_PER_PAGE * PAGES_PER_SIDE  # 1500
    if total <= half * 2:
        selected = all_lines
        note = f"（源程序共 {total} 行，不足 3000 行，按实际行数提交）"
    else:
        selected = all_lines[:half] + all_lines[-half:]
        note = ""

    doc = Document()
    section = doc.sections[0]
    setup_a4(section, top=2.0, bottom=1.8, left=2.0, right=2.0)
    add_header_text(section, f"{SOFT_FULL}　源程序")
    add_page_number_footer(section)

    # 首页即源码（不加封面页）：软著要求提交 60 页源程序，封面会额外多出一页
    # 正文：每 50 行一页
    for idx, line in enumerate(selected):
        tight_paragraph(doc, line)
        if (idx + 1) % LINES_PER_PAGE == 0 and idx + 1 < len(selected):
            # 换页符挂在当前段末，避免多出一个空行
            last = doc.paragraphs[-1]
            last.add_run().add_break(WD_BREAK.PAGE)

    doc.save(out_path)
    return out_path, total, len(selected)


# ------------------------------------------------------------
# 文档三：软件说明书
# ------------------------------------------------------------
def h1(doc, text):
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(14)
    p.paragraph_format.space_after = Pt(6)
    r = p.add_run(text)
    set_cn_font(r, "黑体", 16, bold=True)


def h2(doc, text):
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(10)
    p.paragraph_format.space_after = Pt(4)
    r = p.add_run(text)
    set_cn_font(r, "黑体", 13, bold=True)


def h3(doc, text):
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(8)
    p.paragraph_format.space_after = Pt(3)
    r = p.add_run(text)
    set_cn_font(r, "宋体", 11.5, bold=True)


def body(doc, text, size=10.5, indent=True, align=WD_ALIGN_PARAGRAPH.JUSTIFY):
    p = doc.add_paragraph()
    p.alignment = align
    pf = p.paragraph_format
    pf.space_before = Pt(2)
    pf.space_after = Pt(2)
    pf.line_spacing = Pt(18)
    if indent:
        pf.first_line_indent = Cm(0.74)
    r = p.add_run(text)
    set_cn_font(r, "宋体", size)
    return p


def bullet(doc, text, size=10.5):
    p = doc.add_paragraph()
    pf = p.paragraph_format
    pf.left_indent = Cm(0.74)
    pf.first_line_indent = Cm(-0.37)
    pf.space_before = Pt(1)
    pf.space_after = Pt(1)
    pf.line_spacing = Pt(17)
    r = p.add_run("· " + text)
    set_cn_font(r, "宋体", size)


def figure_slot(doc, caption, hint=""):
    """截图占位框：虚线边框 + 说明，便于申请人替换为真实截图"""
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    pf = p.paragraph_format
    pf.space_before = Pt(6)
    pf.space_after = Pt(2)
    r = p.add_run(f"［此处插入截图：{hint or caption}］")
    set_cn_font(r, "宋体", 9.5, color=RGBColor(0x99, 0x99, 0x99))
    pPr = p._p.get_or_add_pPr()
    borders = OxmlElement("w:pBdr")
    for edge in ("top", "left", "bottom", "right"):
        el = OxmlElement(f"w:{edge}")
        el.set(qn("w:val"), "dashed")
        el.set(qn("w:sz"), "6")
        el.set(qn("w:space"), "6")
        el.set(qn("w:color"), "BFBFBF")
        borders.append(el)
    pPr.append(borders)

    cap = doc.add_paragraph()
    cap.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = cap.add_run(caption)
    set_cn_font(r, "宋体", 9)


def table(doc, header, rows, widths=None):
    t = doc.add_table(rows=1, cols=len(header))
    t.style = "Table Grid"
    t.alignment = WD_TABLE_ALIGNMENT.CENTER
    for i, h in enumerate(header):
        cell = t.rows[0].cells[i]
        p = cell.paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        r = p.add_run(h)
        set_cn_font(r, "宋体", 9.5, bold=True)
    for row in rows:
        cells = t.add_row().cells
        for i, v in enumerate(row):
            p = cells[i].paragraphs[0]
            r = p.add_run(str(v))
            set_cn_font(r, "宋体", 9)
    if widths:
        for row in t.rows:
            for i, w in enumerate(widths):
                row.cells[i].width = Cm(w)
    doc.add_paragraph().paragraph_format.space_after = Pt(0)
    return t


def make_manual(owner, finish_date, out_path):
    doc = Document()
    section = doc.sections[0]
    setup_a4(section, top=2.2, bottom=2.0, left=2.2, right=2.2)
    add_header_text(section, f"{SOFT_FULL}　软件说明书")
    add_page_number_footer(section)

    # ---------------- 封面 ----------------
    for _ in range(5):
        doc.add_paragraph()
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = p.add_run(SOFT_FULL)
    set_cn_font(r, "黑体", 26, bold=True)
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = p.add_run("软 件 说 明 书")
    set_cn_font(r, "黑体", 22, bold=True)
    for _ in range(6):
        doc.add_paragraph()
    for text in [
        f"著作权人：{owner}",
        f"开发完成日期：{finish_date}",
        "文档版本：V1.0",
        "编制日期：" + date.today().strftime("%Y 年 %m 月 %d 日"),
    ]:
        p = doc.add_paragraph()
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        r = p.add_run(text)
        set_cn_font(r, "宋体", 12)
    doc.add_paragraph().add_run().add_break(WD_BREAK.PAGE)

    # ---------------- 1 概述 ----------------
    h1(doc, "一、软件概述")
    h2(doc, "1.1 软件简介")
    body(doc, f"{SOFT_FULL}（以下简称“本系统”）是一套面向高等院校《宏观经济学》课程的教学辅助软件。"
              "系统以 IS-LM 模型为核心，由游戏、知识学习、AI 分析三大板块组成：学生在两套游戏中亲手操作"
              "财政政策、货币政策、产业政策与贸易政策，直观看到 IS 曲线、LM 曲线的移动与均衡点的迁移；"
              "在章节讲解、交互仿真器、题库与知识图谱中完成结构化学习；AI 板块则持续读取学生在游戏中的"
              "操作与学习行为，用贝叶斯知识追踪与自研强化学习神经网络为每名学生生成专属画像和针对性建议，"
              "并把班级学情汇总到教师端。")
    body(doc, "系统的设计目标是解决三个教学痛点：一是 IS-LM 模型高度抽象，公式与曲线联动难以凭空想象；"
              "二是学生做题卡壳时只能直接看解析，思考过程被跳过；三是教师批改作业反馈滞后，难以掌握"
              "每个学生到底卡在哪个知识点。本系统用“可操作的游戏 + 可诊断的学习行为 + 可解释的 AI 画像”"
              "把这三个问题串成闭环：玩—学—练—诊—教。")

    h2(doc, "1.2 主要特征")
    for t in [
        "双游戏仿真：游戏一为单机宏观政策模拟（14 个季度、44 张政策卡、六步传导演示），"
        "游戏二为 4 人实时博弈（政府、银行、企业、消费者），两者均把操作写入统一事件流。",
        "知识图谱：把第十一章拆成 25 个知识节点、45 条先修/关联边，节点级 BKT 掌握度着色，"
        "自动计算“学习前沿”，避免在未学前置知识时被推荐超纲内容。",
        "自研神经网络与强化学习：纯 JavaScript 实现多层感知机与 DQN（经验回放、目标网络、ε-贪心、"
        "Huber 损失、TD 目标裁剪），以 25 个知识节点为动作空间，为每名学生规划下一步。",
        "可解释画像：六维能力雷达（知识掌握、正确率、活跃度、学习自主性、游戏决策力、学习韧性）+ "
        "细分维度 + 规则标签 + AI 文字画像；量化部分由规则计算，大模型只负责表达。",
        "防泄露阶梯导学：L1 方向 → L2 条件与知识点 → L3 思路框架（含留白）→ L4 完整解析，"
        "前三级不下发标准答案，输出端再做数值与选项校验，失败重试一次后降级直出知识卡。",
        "教师端学情看板：班级概览、风险分级、知识点热力、活跃趋势、AI 班级简报、学生画像与建议、"
        "行为流与 CSV 导出。",
        "多模型供应商可切换：同一套 OpenAI 兼容协议适配 DeepSeek、火山方舟（豆包）或任意兼容网关，"
        "供应商差异由配置开关隔离。",
        "全链路降级：无大模型密钥、无向量服务、后端不可用时均有本地兜底，功能不中断。",
    ]:
        bullet(doc, t)

    h2(doc, "1.3 软件组成")
    body(doc, "本系统采用前后端分离架构。前端为单页应用（Vue 3 + Vite），按视图组织为游戏、知识学习、"
              "AI、教师端四类页面；后端为 REST 接口与 WebSocket 网关（Node.js + Express 5），"
              "按路由层、服务层、算法层、知识层分层；数据层为 MySQL 8，共 18 张业务表。"
              "前端构建产物由后端在生产模式下直接托管，可通过 Docker Compose 一键部署。")

    # ---------------- 2 运行环境 ----------------
    h1(doc, "二、运行环境")
    h2(doc, "2.1 硬件环境")
    table(doc, ["项目", "开发环境", "运行环境"], [
        ["CPU", "四核 2.4GHz 及以上", "服务器四核 2.0GHz 及以上；客户端双核及以上"],
        ["内存", "8GB 及以上", "服务器 4GB 及以上；客户端 4GB 及以上"],
        ["硬盘", "可用空间 10GB 及以上", "服务器 20GB 及以上"],
        ["显示器", "1920×1080", "1366×768 及以上"],
        ["网络", "可访问互联网（调用大模型时）", "局域网即可，未配置大模型时为纯离线可用"],
    ], widths=[3, 6, 8])

    h2(doc, "2.2 软件环境")
    table(doc, ["类别", "软件及版本"], [
        ["操作系统（服务端）", "Windows Server 2019/2022 或 Linux；亦可用 Docker 容器（node:20-alpine）"],
        ["操作系统（客户端）", "Windows 10/11、macOS 12+、主流 Linux 桌面"],
        ["运行时", "Node.js 20 LTS（后端）、现代浏览器内置 JavaScript 引擎（前端）"],
        ["数据库", "MySQL 8.0 及以上（字符集 utf8mb4）"],
        ["浏览器", "Chrome 100+、Edge 100+、Firefox 100+、Safari 15+（需支持 ES2022 与 WebSocket）"],
        ["容器（可选）", "Docker Engine 24+、Docker Compose v2"],
        ["大模型服务（可选）", "DeepSeek 开放平台（deepseek-chat）或火山方舟 Ark（doubao 系列），"
                               "均为 OpenAI 兼容接口；不配置时运行在本地模拟模式"],
        ["开发工具", "Visual Studio Code、Vite 5、Git、Apifox"],
    ], widths=[4, 13])

    h2(doc, "2.3 网络与端口")
    body(doc, "开发模式下前端 Vite 服务监听 5173 端口，后端监听 3001 端口，前端通过代理把 /api 与 /ws "
              "转发到后端；生产模式下仅需开放 3001 端口，由后端同时提供静态页面、REST 接口与 WebSocket。")

    # ---------------- 3 安装部署 ----------------
    h1(doc, "三、安装与部署")
    h2(doc, "3.1 本地部署")
    for t in [
        "安装 Node.js 20 LTS 与 MySQL 8.0，启动 MySQL 并记录 root 密码。",
        "进入项目根目录，执行 npm install 安装依赖（仅 axios、element-plus、echarts、express、mysql2、"
        "jsonwebtoken、bcryptjs、ws、vue、vite 等）。",
        "复制 .env.example 为 .env，填写 DB_HOST、DB_PORT、DB_USER、DB_PASSWORD、DB_NAME；"
        "如需接入大模型，按供应商填写 LLM_PROVIDER（deepseek / ark / openai）、LLM_BASE_URL、"
        "LLM_API_KEY 与 LLM_MODEL，并将 LLM_MOCK 置为 false；DeepSeek 无 embedding 接口，"
        "EMBEDDING_REMOTE 保持 false 即可（自动使用本地伪向量）。",
        "执行 npm run server 启动后端（默认 3001），首次启动会自动执行建库建表脚本并完成列级迁移。",
        "另开终端执行 npm run dev 启动前端（默认 5173），浏览器访问即可。",
        "可选：执行 node server/sql/seed-demo.js 生成教师与三名学生的演示数据。",
    ]:
        bullet(doc, t)

    h2(doc, "3.2 生产部署")
    body(doc, "执行 npm run build 生成 dist 目录，再执行 npm run server。后端检测到 dist 存在时会自动"
              "托管静态资源，并对非 /api 的 GET 请求回退到 index.html，适配单页应用刷新。")

    h2(doc, "3.3 容器化部署")
    body(doc, "项目自带 Dockerfile（多阶段构建：构建阶段安装依赖并执行 vite build，运行阶段仅保留 "
              "node:20-alpine 与产物）与 docker-compose.yml（MySQL 8 + 应用，含健康检查、应用启动重试与"
              "命名数据卷）。执行 docker compose up --build 即可在 http://localhost:3001 访问，"
              "执行 down 后再 up，数据卷中的业务数据不会丢失。")

    # ---------------- 4 账号与权限 ----------------
    h1(doc, "四、账号与权限")
    body(doc, "系统支持匿名与登录两种使用模式。匿名用户无需注册即可使用游戏、章节学习、题库练习等全部"
              "学习功能，数据保存在浏览器本地；登录用户的数据（错题本、作答记录、游戏记录、画像）"
              "会同步到云端，实现多端一致。")
    table(doc, ["角色", "获取方式", "权限说明"], [
        ["匿名用户", "直接访问", "可使用学习与游戏功能，数据仅本地保存，不进入教师端统计"],
        ["学生", "注册（用户名 3~20 位，密码 6~32 位）", "全部学习、游戏、AI 画像与建议功能"],
        ["教师", "注册时填写教师邀请码（TEACHER_INVITE_CODE）", "在学生学习权限基础上，可使用教师端学情看板"],
    ], widths=[3, 6, 8])
    body(doc, "登录采用 JWT（有效期 7 天），密码使用 bcrypt 哈希存储；角色存放于数据库并在每次请求时"
              "实时校验，撤销教师权限可立即生效，无需等待令牌过期。")

    # ---------------- 5 功能操作 ----------------
    h1(doc, "五、功能操作说明")
    body(doc, "系统首页提供功能宫格与章节入口，宫格按“游戏—知识学习—AI—教师端”排列。以下按模块说明"
              "操作流程。")

    h2(doc, "5.1 游戏一：经济舵手（单机政策模拟）")
    h3(doc, "5.1.1 界面布局")
    body(doc, "页面顶部为返回栏与游戏标题；游戏舞台内自上而下分为四个区域：顶部指标盘（GDP 增速、失业率、"
              "通胀率、利率与季度进度）、左侧政策工具箱（财政/货币/产业/贸易四个抽屉，共 44 张政策卡）、"
              "中部经济全景（城市地图、时间轴、GDP 构成、IS-LM、AD-AS、菲利普斯曲线四张动态图）、"
              "右侧资讯区（新闻事件、企业动态、公众预期、经济顾问）与底部教学区（因素链条、学习建议、"
              "本局评分雷达、成就徽章）。")
    figure_slot(doc, "图 5-1 游戏一主界面", "游戏一开始界面与主界面")

    h3(doc, "5.1.2 开始游戏")
    body(doc, "在开始界面选择“学习模式”或“沙盘模式”。学习模式下，每执行一张政策卡前需要先回答一道与该"
              "政策配套的单选题，答对政策全额生效、答错效果减半；沙盘模式免答题、政策即时全额生效，"
              "每季度可执行 5 项政策。两种模式的差别会在结算评分中体现。")

    h3(doc, "5.1.3 执行政策与传导演示")
    body(doc, "点击左侧工具箱中的政策卡即可执行。执行后系统播放“六步传导演示”动画：冲击注入 → 曲线移动 → "
              "均衡重解 → 物价变化 → 就业变化 → 部门反馈，每一步的数值实时滚动；动画可跳过，也可逐节点查看。"
              "每次执行都会记录政策类别、效果与执行季度，并通过事件接口上报到后端。")
    figure_slot(doc, "图 5-2 六步传导演示", "政策执行后的传导链动画")

    h3(doc, "5.1.4 季度结算与复盘")
    body(doc, "点击“结束本季度”进入结算：系统按 IS-LM→AD-AS→菲利普斯曲线重新求解均衡，更新产出、利率、"
              "通胀、失业、债务与公众信任等指标，并给出本季度评分。连续执行 14 个季度后弹出终局结算，"
              "展示四维评分雷达、成就徽章、逐季指标序列与政策清单。终局快照会写入游戏记录表，画像的"
              "“游戏决策力”维度即来源于此。")
    figure_slot(doc, "图 5-3 终局结算", "14 季度结束后的结算弹窗")

    h3(doc, "5.1.5 因素链条与知识卡")
    body(doc, "底部“因素链条”把财政、货币、贸易三条传导路径画成节点链。点击任一节点弹出知识卡，"
              "给出公式推导与教材出处，便于学生把游戏中的操作与课本理论对应起来。")

    h2(doc, "5.2 游戏二：多人博弈")
    h3(doc, "5.2.1 创建与加入房间")
    body(doc, "在游戏二大厅输入昵称，选择回合数（2~4 回合），可勾选“空缺角色由 AI 补位”，点击创建房间获得"
              "4 位房间码；其他同学输入房间码即可加入。所有人入座后由房主开始对局。")
    figure_slot(doc, "图 5-4 游戏二大厅", "创建/加入房间界面")

    h3(doc, "5.2.2 对局阶段与决策")
    body(doc, "对局按“等待入座 → 事件发布 → 协商 → 轮流决策 → 结算”推进。事件阶段公布外生冲击（如外需骤冷、"
              "油价上涨、房企违约）及其涉及的知识点；协商阶段玩家可在聊天区沟通；决策阶段按政府（含央行）→ "
              "银行 → 企业 → 消费者的顺序提交决策，共 18 个决策变量（如政府购买增量、税收增量、准备金变动、"
              "信贷投放、投资预算、消费支出等），系统即时重解均衡并在曲线图上移动均衡点。")

    h3(doc, "5.2.3 结算与报告")
    body(doc, "全部回合结束后给出五维评分（GDP 恢复度、失业率控制、通胀控制、债务可持续性、政策协调度）"
              "与通关判定（过热、力度不足、挤出效应），并生成对局报告。决策序列与聊天记录写入数据库，"
              "同时进入学习行为事件流，供画像与教师端使用。")

    h2(doc, "5.3 知识学习模块")
    h3(doc, "5.3.1 章节学习")
    body(doc, "进入第十一章后可切换四个小节，阅读知识点讲解、公式推导与符号说明表；每个知识点配有 ECharts "
              "绘制的图示（如 IS 曲线推导、LM 三种区域、政策配合等），点击“交互实验”可从知识点直接唤起"
              "仿真器，并用该知识点的参数预填。")

    h3(doc, "5.3.2 IS-LM 交互仿真器")
    body(doc, "仿真器提供 9 个参数滑块（自发消费、边际消费倾向、自发投资、投资利率敏感度、政府支出、税收、"
              "实际货币供给、货币需求收入敏感度、投机需求系数），点击“运行仿真”后实时绘制 IS、LM 曲线与"
              "均衡点，并给出均衡产出、利率、挤出量等指标卡与自动生成的经济学解读。支持政策冲击对比"
              "（基准组与冲击组双曲线同图）、历史记录回填、参数重置与图表 PNG 导出。")
    figure_slot(doc, "图 5-5 IS-LM 交互仿真器", "仿真器界面与政策对比")

    h3(doc, "5.3.3 题库练习")
    body(doc, "题库共 30 题（23 道单选、7 道计算），可按知识点、题型、难度筛选，支持三种模式：专项刷题"
              "（顺序完成筛选结果）、模拟测试（随机抽题组卷）、限时自测（倒计时结束自动交卷）。提交后"
              "自动批改，展示参考答案、解题步骤、考点与关联章节；计算题可一键跳转仿真器复现验证。"
              "答错自动收入错题本。")

    h3(doc, "5.3.4 知识图谱")
    body(doc, "知识图谱把本章拆成 25 个知识节点，用箭头表示先修关系、虚线表示跨节关联。节点颜色表示本人"
              "掌握度：灰色未学、红色薄弱、黄色进阶、绿色扎实。右侧列出“学习前沿”，即先修节点已具备且"
              "自身掌握度最低的若干个节点；点击任一节点打开抽屉，可查看该节点的知识要点、核心公式、教材"
              "原文块、关联习题以及先修/后继节点，并可直接跳转练习。顶部搜索框支持按知识点或关键词检索。")
    figure_slot(doc, "图 5-6 知识图谱", "知识图谱页面（含掌握度着色与学习前沿）")

    h3(doc, "5.3.5 错题本、日程、统计、资源库与社区")
    for t in [
        "错题本：自动收纳错题，可标注错误原因、按知识点筛选重做，答对后可“掌握移除”；"
        "复习模式按 SM-2 间隔重复算法排出到期队列，用“记得/模糊/忘了”三键评分。",
        "课程与日程：录入周课程表并以网格展示，月历自动标记考试、作业与计划日期，提供倒计时提醒与待办清单。",
        "学习数据统计：近 7 天学习时长、做题数、错题数折线图，知识点掌握条形图与雷达图，错题分布柱状图，"
        "薄弱板块 Top3 与自动生成的学习周报。",
        "学习资源库：按课件、笔记、往年试卷、复习提纲分类归档，支持关键词搜索与下载计数。",
        "问答社区：发布课程疑问、同学互相答疑与点赞，点赞数或回答数达到阈值的问题自动沉淀为高频知识库。",
    ]:
        bullet(doc, t)

    h2(doc, "5.4 AI 学生画像与学习建议")
    body(doc, "点击首页“我的学习画像”进入。页面顶部为画像摘要与标签，中部为六维能力雷达与五个知识点的"
              "BKT 掌握度进度条，下方依次为学习行为统计、阶梯导学使用情况、两游戏表现、AI 文字画像、"
              "针对性学习建议，以及强化学习策略卡片与 AI 引擎状态卡片。")
    body(doc, "画像由系统的真实行为数据汇总而成：作答记录（对错、耗时、知识点）、知识点与知识节点的 BKT "
              "掌握度、阶梯提示使用层级与反馈、两游戏的操作事件与对局结果、错题本数量与纠错情况。"
              "点击“重新生成”会强制重算画像与建议；“学习建议”区列出 3~5 条带优先级的可执行动作，"
              "每条注明入口、时长与数据依据，点击“去完成”可直接跳转到对应模块。")
    figure_slot(doc, "图 5-7 学生画像", "画像页：六维雷达 + 知识点掌握 + AI 文字画像")
    figure_slot(doc, "图 5-8 学习建议与强化学习策略", "建议列表与 DQN 动作卡片")

    h2(doc, "5.5 AI 助手与阶梯导学")
    body(doc, "AI 助手支持“AI 答疑解析”与“复习资料生成”两个页签。答疑采用引导式策略：先给方向提示，"
              "再给关键公式，最后给思路框架，学生可在做完后查看完整解析；复习资料可生成背诵提纲、"
              "考前速记与模拟卷，内容优先取自错题本与薄弱知识点。")
    body(doc, "在章节学习与题库练习中，每道计算题下方内嵌阶梯导学面板：点击“获取提示”依次解锁 L1~L3，"
              "L3 的最后一步以“❓请你自己完成”留白；填写“我卡在哪里”后可让系统按当前层级重新生成提示。"
              "点击“查看完整解析”需二次确认，L4 才会展示答案、推导过程、经济学含义与易错点。"
              "全过程记录到导学会话与提示日志，刷新页面后自动恢复。")

    h2(doc, "5.6 教师端学情看板")
    body(doc, "使用教师账号登录后，从首页“教师端·学情看板”进入。页面自上而下为：班级筛选与导出、"
              "四项概览指标（注册学生、有作答记录、平均掌握度、平均正确率）、学生状态分布条、"
              "知识点平均掌握度柱状图与近 7 天活跃折线图、AI 班级学情简报、学生列表与最近行为流。")
    body(doc, "点击任一学生的“查看”打开详情抽屉：左侧为六维雷达，右侧为 AI 文字画像；下方依次为该生的"
              "学习建议（教师可点“重新生成学习建议”）、薄弱知识节点、近期作答明细、游戏一对局记录、"
              "游戏二决策记录与最近 20 条行为事件。教师可据此判断学生卡在哪个节点、是否依赖提示、"
              "是否只玩不学。")
    figure_slot(doc, "图 5-9 教师端班级概览", "教师端首页：指标卡 + 图表 + AI 简报")
    figure_slot(doc, "图 5-10 学生详情抽屉", "学生画像、建议与游戏记录")

    h2(doc, "5.7 通用操作")
    for t in [
        "返回：各页面左上角均有“返回首页”按钮；游戏中返回时会先上报未提交的行为事件，避免数据丢失。",
        "登录/退出：首页右上角显示登录入口；已登录显示昵称与退出按钮。",
        "异常提示：接口异常时页面给出中文提示，不影响已加载内容的浏览；AI 能力不可用时会自动降级为规则结果。",
    ]:
        bullet(doc, t)

    # ---------------- 6 数据结构与接口 ----------------
    h1(doc, "六、数据结构与接口")
    h2(doc, "6.1 数据表")
    table(doc, ["类别", "数据表", "说明"], [
        ["导学", "hint_session / hint_log", "每题每生的导学会话与每次提示日志"],
        ["账号", "users", "用户名、密码哈希、昵称、角色、班级"],
        ["学习分析", "answer_record / mastery_state / node_mastery / wrong_book / knowledge_embedding / agent_log",
         "作答明细、知识点与节点掌握度、错题本、知识块向量、智能体日志"],
        ["游戏二", "game_room / game_decision / game_chat", "对局主表、决策序列、协商聊天"],
        ["游戏一", "game1_session", "单机对局终局快照（评分、雷达、逐季指标）"],
        ["AI 画像", "student_profile / learning_advice", "学生画像与学习建议"],
        ["事件流", "learning_event", "两游戏与学习行为的统一事件流"],
        ["强化学习", "rl_transition / rl_model", "DQN 经验转移与模型存档"],
    ], widths=[2.4, 7.6, 7])

    h2(doc, "6.2 接口分组")
    table(doc, ["分组", "接口", "说明"], [
        ["账号", "POST /api/auth/register、/login；GET /api/auth/me", "JWT 认证，教师需邀请码"],
        ["作答", "POST /api/record/answer；GET /api/analytics/mastery、/recommend", "作答上报、BKT、RL 奖励回收"],
        ["导学", "POST /api/hint、/hint/stream、/hint/solution；GET /hint/state", "L1~L4 阶梯提示与状态恢复"],
        ["知识", "GET /api/knowledge/graph、/nodes/:id、/path、/search、/stats", "知识图谱与知识库"],
        ["AI", "GET /api/ai/profile、/advice、/recommend、/model；POST /ai/train", "画像、建议、推荐与训练"],
        ["游戏一", "POST /api/game1/session；GET /game1/sessions、/stats", "终局快照与历史"],
        ["游戏二", "GET /api/game；WebSocket /ws", "对局报告与实时对局"],
        ["事件", "POST /api/event/batch、/one", "行为事件采集"],
        ["教师", "GET /api/teacher/overview、/students、/student/:id、/activity、/export；POST /insight",
         "学情看板（教师角色）"],
    ], widths=[2.2, 8.6, 6.2])
    body(doc, "所有接口统一返回 { success, code, message, data } 信封；业务错误与系统错误分离，"
              "错误信息不包含堆栈与答案内容。")

    h2(doc, "6.3 关键数据表字段")
    table(doc, ["数据表", "主要字段", "用途"], [
        ["users", "id、username、password_hash、display_name、role、class_name、created_at",
         "账号与角色；role 区分学生/教师，class_name 用于分班统计"],
        ["answer_record", "user_id、question_id、topic、q_type、difficulty、is_correct、student_answer、"
                          "duration_ms、created_at", "作答明细，BKT 与统计的原始数据"],
        ["mastery_state", "user_id、topic、p_known、attempts、correct_count", "五个知识点的掌握概率"],
        ["node_mastery", "user_id、node_id、topic、p_known、attempts、correct_count", "二十五个知识节点的掌握概率"],
        ["learning_event", "user_id、source、event_type、payload、duration_ms、created_at",
         "两游戏与学习行为的统一事件流"],
        ["game1_session", "user_id、mode、quarters、total_score、radar、kpi_series、policy_count、finished_at",
         "游戏一终局快照"],
        ["game_room / game_decision", "room_code、players、round_no、role、decision、metrics_after",
         "游戏二对局与决策序列"],
        ["student_profile", "user_id、radar、dimensions、tags、weak_nodes、narrative、summary、generated_at",
         "学生画像（按用户唯一，覆盖式更新）"],
        ["learning_advice", "user_id、items、narrative、policy_node、source、generated_at", "学习建议历史"],
        ["rl_transition", "user_id、state、action、node_id、reward、next_state、filled_at", "DQN 经验转移"],
        ["rl_model", "model_name、state_dim、action_dim、weights、train_steps、meta", "DQN 权重存档"],
    ], widths=[3.2, 8.4, 5])

    h2(doc, "6.4 接口调用示例")
    body(doc, "以作答上报为例：前端提交题目编号、知识点、题型、难度与对错，后端依次完成作答落库、"
              "知识点级 BKT、节点级 BKT、强化学习奖励回收与事件流写入，返回更新后的掌握度与奖励值。")
    sample = (
        "POST /api/record/answer\n"
        "{\n"
        '  "questionId": 6, "topic": "IS-LM均衡", "qType": "calc",\n'
        '  "difficulty": "medium", "isCorrect": true,\n'
        '  "studentAnswer": { "y": 1266.67, "r": 5.33 }, "durationMs": 42000\n'
        "}\n"
        "→ { success: true, code: \"OK\",\n"
        "    data: { mastery: { pKnown: 0.44, attempts: 2 },\n"
        "            nodeMastery: { nodeId: \"eq_solve\", pKnown: 0.44 },\n"
        "            reward: 1.56 } }"
    )
    p = doc.add_paragraph()
    p.paragraph_format.left_indent = Cm(0.6)
    p.paragraph_format.line_spacing = Pt(13)
    r = p.add_run(sample)
    set_cn_font(r, "Consolas", 9)
    body(doc, "取画像时返回六维雷达、明细维度、标签、薄弱节点与文字画像；取建议时额外返回强化学习选出的"
              "下一知识节点、Q 值、候选动作估值与建议条目数组（含优先级、动作、依据、时长与入口）。")

    # ---------------- 7 算法 ----------------
    h1(doc, "七、核心算法说明")
    h2(doc, "7.1 贝叶斯知识追踪（BKT）")
    body(doc, "对每个知识点（以及每个知识节点）维护一个“已掌握概率” P(L)，每次作答后用贝叶斯公式更新。"
              "模型参数为：先验 P(L0)=0.15、学习转移率 T=0.10、猜测率 G=0.20、失误率 S=0.10。"
              "答对时 P(L) 按“排除猜对”的后验更新，答错时按“保留会但失误”的后验更新，再叠加学习转移。"
              "答对一次不等于掌握，答错一次也不等于不会——这是 BKT 相比正确率统计的优势。")

    h2(doc, "7.2 神经网络（MLP）")
    body(doc, "自研多层感知机采用全连接结构，隐层激活函数为 ReLU，输出层为线性；参数使用 He 初始化，"
              "训练采用反向传播 + Adam 优化器，并对梯度做全局范数裁剪。网络结构与权重可序列化为 JSON "
              "存入数据库。单页应用和后端均不依赖任何原生机器学习库，便于在只装了 Node.js 的教学服务器"
              "上部署。")

    h2(doc, "7.3 强化学习（DQN）")
    body(doc, "把“下一步学哪个知识节点”建模为强化学习问题：状态为 16 维学习状态向量（平均掌握度、最弱掌握度、"
              "掌握度离散度、五个知识点掌握度、正确率、提示依赖度、活跃度、做题强度、游戏决策表现、"
              "行为多样性、近期趋势、节点覆盖率）；动作为 25 个知识节点之一；奖励由掌握度增量、答题对错与"
              "题目难度共同构成，并裁剪到 [-2,3]。")
    body(doc, "训练使用经验回放（容量 3000，随机抽样 32 条）、目标网络（每 50 步同步）、ε-贪心探索"
              "（ε 从 0.2 衰减到 0.05）、Huber 损失与 TD 目标裁剪；每次作答后回放训练 2 步并周期性保存权重，"
              "管理端也可用历史经验批量训练。训练步数不足 30 时采用“知识图谱学习前沿 + 掌握度最低”的"
              "启发式推荐，但照常记录转移样本，实现边用边学。")

    h2(doc, "7.4 间隔重复（SM-2）")
    body(doc, "错题复习采用 SuperMemo-2 算法：根据“记得/模糊/忘了”三档评分更新难度因子 EF，"
              "并按 1 天 → 6 天 → EF×上次间隔 的规则安排下次复习日期，到期错题进入今日复习队列。")

    h2(doc, "7.5 检索增强生成（RAG）")
    body(doc, "教材内容按小节标题切成 26 个知识块，检索时对查询做关键词 TF-IDF 与向量余弦的混合打分"
              "（权重各 0.5），无向量服务时自动退化为纯关键词检索。导学 L1~L3 检索时排除含答案的习题解析块，"
              "L4 才放开全部知识块；检索结果在首次导学时固化为快照，保证同一道题各层级口径一致。")

    h2(doc, "7.6 多模型接入与降级")
    body(doc, "大模型调用统一走 OpenAI 兼容的 chat/completions 协议，通过 LLM_PROVIDER 区分供应商："
              "火山方舟（ark）支持 thinking 深度思考参数与 embedding 接口，DeepSeek 不支持这两项，"
              "因此代码按供应商条件化拼装请求体，并在无 embedding 能力时自动改用本地伪向量，"
              "保证切换供应商不需要改业务代码。")
    body(doc, "失败处理分三层：单次调用超时（25 秒）后由调用方重试；供应商返回错误（如账户欠费、"
              "密钥失效）时抛出异常，由画像、建议、班级简报各自捕获并保留规则版本；"
              "未配置密钥或显式开启 LLM_MOCK 时直接使用本地模板，全流程离线可演示。")

    # ---------------- 8 异常处理 ----------------
    h1(doc, "八、异常处理与降级策略")
    table(doc, ["异常场景", "系统行为"], [
        ["未配置大模型密钥 / 供应商账户不可用 / 接口超时", "自动切换到本地模拟：阶梯提示返回结构化模板，"
                                                          "画像与建议使用规则文案，页面提示服务处于模拟模式，功能不中断"],
        ["供应商不支持向量接口（如 DeepSeek）", "自动改用本地确定性伪向量，混合检索仍可用"],
        ["向量服务不可用", "检索自动退化为纯关键词 TF-IDF，结果仍可解释"],
        ["后端服务不可用", "前端保留本地功能（匿名模式下错题本、学习记录等存 localStorage），"
                           "接口失败静默降级，不弹错误阻塞学习"],
        ["强化学习模型缺失或训练不足", "使用知识图谱启发式推荐，并继续积累样本"],
        ["数据库未就绪", "启动阶段自动重试（5 次，间隔 3 秒），失败时输出明确的中文错误信息"],
        ["非法参数 / 越权访问", "返回统一的 400/401/403 响应，不泄露堆栈与答案内容"],
    ], widths=[5, 12])

    h2(doc, "8.1 错误码约定")
    table(doc, ["错误码", "含义", "前端处理"], [
        ["PARAM_ERROR", "请求参数缺失或格式不合法", "高亮出错字段并提示重新填写"],
        ["AUTH_ERROR", "未登录或令牌失效", "清除本地登录态并跳转登录页"],
        ["FORBIDDEN", "角色权限不足（如学生访问教师端）", "提示“当前账号无教师权限”"],
        ["USER_EXISTS", "注册时用户名已存在", "提示更换用户名"],
        ["INVITE_INVALID", "教师邀请码不正确", "提示联系管理员获取邀请码"],
        ["NOT_FOUND", "资源不存在（如知识节点）", "提示节点不存在并返回列表"],
        ["LEVEL_LOCKED", "阶梯提示已到顶层，需查看完整解析", "置灰“获取提示”按钮"],
        ["DB_ERROR", "服务端未捕获异常", "提示稍后重试，不展示堆栈"],
    ], widths=[3.4, 7.2, 6])

    h1(doc, "九、测试与验收")
    body(doc, "软件在开发与交付阶段执行了算法自检、接口冒烟与端到端功能验证。算法自检脚本 "
              "server/ml/selftest.js 验证多层感知机能拟合非线性映射（损失由 0.2472 降至 0.0356）、"
              "DQN 能在双动作环境中收敛到正确动作（Q 值 1.000 与 −1.000）。以下为功能测试用例摘要。")
    table(doc, ["编号", "测试项", "操作步骤", "预期结果", "结果"], [
        ["T01", "学生注册登录", "输入用户名与密码注册，退出后重新登录", "注册成功并自动登录；重新登录获得令牌", "通过"],
        ["T02", "教师注册鉴权", "选择教师角色但不填邀请码；填写正确邀请码", "第一次提示邀请码错误；第二次注册成功", "通过"],
        ["T03", "作答上报", "在题库完成一道单选题提交", "返回掌握度与奖励值；作答记录入库", "通过"],
        ["T04", "知识点 BKT", "同一知识点连续答对三题", "掌握度按贝叶斯规则逐次上升", "通过"],
        ["T05", "知识图谱着色", "进入知识图谱页", "已作答节点按掌握度着色，未学节点为灰色", "通过"],
        ["T06", "学习前沿计算", "查看“你的学习前沿”列表", "只出现先修节点已达标且掌握度低的节点", "通过"],
        ["T07", "强化学习推荐", "调用推荐接口或查看画像页策略卡片", "返回动作节点、Q 值与推荐理由；样本不足时标注冷启动", "通过"],
        ["T08", "奖励回收", "接受推荐后完成对应题目", "生成一条已回收的 rl_transition，训练步数增加", "通过"],
        ["T09", "模型训练与保存", "调用 /api/ai/train 训练 300 步", "损失收敛、权重写入 rl_model、状态显示已训练", "通过"],
        ["T10", "学生画像", "进入“我的学习画像”页", "展示六维雷达、知识点掌握、标签、文字画像与建议", "通过"],
        ["T11", "游戏一事件采集", "在游戏一执行政策并结束季度", "事件流新增 policy/quarter 记录；终局写入 game1_session", "通过"],
        ["T12", "游戏二对局", "创建房间、AI 补位、完成对局", "阶段推进正常；决策与结算写入数据库", "通过"],
        ["T13", "教师端概览", "教师账号进入教师端", "显示班级人数、平均掌握度、风险分布、图表与 AI 简报", "通过"],
        ["T14", "学生详情", "在教师端点开某学生", "展示画像雷达、建议、薄弱节点、作答与游戏记录", "通过"],
        ["T15", "学情导出", "点击“导出 CSV”", "下载 UTF-8 的 CSV，Excel 打开中文正常", "通过"],
        ["T16", "阶梯导学", "对计算题逐级获取 L1~L3 并查看 L4", "层级单调递增；L4 需二次确认；刷新后卡片恢复", "通过"],
        ["T17", "防泄露降级", "开启 MOCK_LEAK 后请求提示", "输出被拦截、重试一次后降级为知识卡，正文无答案数值", "通过"],
        ["T18", "无密钥降级", "移除 LLM_API_KEY 或将 LLM_MOCK 置为 true 后重启", "自动切换本地模拟，画像与建议仍有内容", "通过"],
        ["T19", "生产构建", "执行 npm run build 并仅启动后端", "静态资源由后端托管，刷新子页面不 404", "通过"],
        ["T20", "容器部署", "docker compose up --build 后重启", "服务可用；数据卷保留，业务数据不丢", "通过"],
    ], widths=[1.2, 3.2, 6.2, 4.6, 1.4])

    h1(doc, "十、常见问题")
    for q, a in [
        ("系统必须联网才能使用吗？",
         "不是。未配置大模型密钥时系统运行在本地模拟模式，游戏、学习、题库、知识图谱、画像与教师端均可离线使用；"
         "配置密钥后 AI 问答与文字画像质量更高。"),
        ("演示数据会影响真实数据吗？",
         "不会。演示脚本只会删除并重建同名演示账号（teacher_demo、student_a/b/c）及其数据，"
         "不影响其他账号。"),
        ("教师账号如何注册？",
         "在注册页选择“教师”并填写 .env 中配置的教师邀请码（默认 HZYJ-TEACHER）；"
         "也可以在数据库中直接修改 users.role 字段。"),
        ("为什么画像里的掌握度和正确率不一样？",
         "正确率是答对题数除以总题数；掌握度是 BKT 模型估计的“真实掌握概率”，会区分猜对与失误，"
         "并按学习转移率随作答次数增长，因此两者通常不等。"),
        ("知识图谱的颜色代表什么？",
         "代表该知识节点的掌握概率：灰色为未学，红色低于 35%，黄色 35%~60%，绿色高于 60%。"),
    ]:
        h3(doc, "Q：" + q)
        body(doc, "A：" + a)

    # ---------------- 11 版本 ----------------
    h1(doc, "十一、版本与著作权信息")
    table(doc, ["项目", "内容"], [
        ["软件全称", SOFT_NAME],
        ["版本号", SOFT_VERSION],
        ["著作权人", owner],
        ["开发完成日期", finish_date],
        ["发表状态", "未发表"],
        ["源程序规模", "117 个源文件，21,880 行"],
        ["大模型接入", "OpenAI 兼容协议，支持 DeepSeek / 火山方舟（豆包）/ 任意兼容网关，可配置切换"],
        ["开发语言", "JavaScript（Vue 3 / Node.js）、SQL、HTML、CSS"],
    ], widths=[4, 13])
    body(doc, "本说明书所述功能与界面均以本版本实际实现为准。文档中的截图位置以虚线框标注，"
              "申请人可在实际运行环境中截取对应界面后替换。")

    doc.save(out_path)
    return out_path


# ------------------------------------------------------------
def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--owner", default="【著作权人姓名】", help="著作权人姓名或单位全称")
    parser.add_argument("--date", default="【开发完成日期】", help="开发完成日期，如 2026-06-30")
    parser.add_argument("--outdir", default=str(OUT_DIR))
    args = parser.parse_args()

    out_dir = Path(args.outdir)
    out_dir.mkdir(parents=True, exist_ok=True)

    p1 = make_application_form(args.owner, args.date, out_dir / "01_软件著作权登记申请表_信息表.docx")
    print("[ok] 申请表：", p1)

    p2, total, picked = make_source_doc(out_dir / "02_源程序_前30页+后30页.docx")
    print(f"[ok] 源程序：{p2}（总 {total} 行，收录 {picked} 行，60 页）")

    p3 = make_manual(args.owner, args.date, out_dir / "03_软件说明书.docx")
    print("[ok] 说明书：", p3)


if __name__ == "__main__":
    main()

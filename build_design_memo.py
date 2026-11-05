# -*- coding: utf-8 -*-
"""生成《宏观经济学教学游戏系统 · 设计讨论纪要》DOCX。"""

from docx import Document
from docx.enum.section import WD_SECTION
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_LINE_SPACING
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor

BODY_FONT = "宋体"
HEAD_FONT = "黑体"
ACCENT = RGBColor(0x1F, 0x3A, 0x5F)
GREY = RGBColor(0x59, 0x59, 0x59)

doc = Document()

# ---------- 页面 ----------
sec = doc.sections[0]
sec.page_width = Cm(21.0)
sec.page_height = Cm(29.7)
sec.left_margin = Cm(2.2)
sec.right_margin = Cm(2.2)
sec.top_margin = Cm(2.4)
sec.bottom_margin = Cm(2.2)

# ---------- 样式 ----------
def set_cn(style, font_name, size=None, bold=None, color=None):
    style.font.name = font_name
    if size is not None:
        style.font.size = Pt(size)
    if bold is not None:
        style.font.bold = bold
    if color is not None:
        style.font.color.rgb = color
    rpr = style.element.get_or_add_rPr()
    rfonts = rpr.find(qn("w:rFonts"))
    if rfonts is None:
        rfonts = OxmlElement("w:rFonts")
        rpr.append(rfonts)
    rfonts.set(qn("w:eastAsia"), font_name)

normal = doc.styles["Normal"]
set_cn(normal, BODY_FONT, 10.5)
normal.paragraph_format.line_spacing_rule = WD_LINE_SPACING.MULTIPLE
normal.paragraph_format.line_spacing = 1.45
normal.paragraph_format.space_before = Pt(0)
normal.paragraph_format.space_after = Pt(5)

for name, size in (("Heading 1", 15), ("Heading 2", 12), ("Heading 3", 11)):
    st = doc.styles[name]
    set_cn(st, HEAD_FONT, size, bold=True, color=ACCENT)
    st.paragraph_format.space_before = Pt(14 if name == "Heading 1" else 10)
    st.paragraph_format.space_after = Pt(6)
    st.paragraph_format.line_spacing = 1.2

def h1(text):
    p = doc.add_heading(text, level=1)
    return p

def h2(text):
    return doc.add_heading(text, level=2)

def para(text, bold=False, italic=False, size=None, color=None, space_after=None, align=None):
    p = doc.add_paragraph()
    r = p.add_run(text)
    r.bold = bold
    r.italic = italic
    if size:
        r.font.size = Pt(size)
    if color:
        r.font.color.rgb = color
    if space_after is not None:
        p.paragraph_format.space_after = Pt(space_after)
    if align is not None:
        p.alignment = align
    return p

def bullet(text, level=0):
    p = doc.add_paragraph(style="List Bullet" if level == 0 else "List Bullet 2")
    p.add_run(text)
    p.paragraph_format.space_after = Pt(3)
    return p

def lead(label, text):
    """加粗小标题 + 正文，同一段。"""
    p = doc.add_paragraph()
    r = p.add_run(label)
    r.bold = True
    p.add_run(text)
    return p

def quote(text):
    p = doc.add_paragraph()
    p.paragraph_format.left_indent = Cm(0.8)
    p.paragraph_format.right_indent = Cm(0.5)
    p.paragraph_format.space_before = Pt(4)
    p.paragraph_format.space_after = Pt(8)
    r = p.add_run(text)
    r.font.size = Pt(10)
    r.font.color.rgb = GREY
    # 左侧竖线
    pPr = p._p.get_or_add_pPr()
    pBdr = OxmlElement("w:pBdr")
    left = OxmlElement("w:left")
    left.set(qn("w:val"), "single")
    left.set(qn("w:sz"), "12")
    left.set(qn("w:space"), "8")
    left.set(qn("w:color"), "8EA9C1")
    pBdr.append(left)
    pPr.append(pBdr)
    return p

def shade(cell, hex_color):
    tcPr = cell._tc.get_or_add_tcPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:val"), "clear")
    shd.set(qn("w:color"), "auto")
    shd.set(qn("w:fill"), hex_color)
    tcPr.append(shd)

def fixed_layout(t, widths_cm):
    """固定列宽：写 tblW、tblGrid，并同步每个单元格宽度。

    注意：不要把 w:tblLayout 再手工追加一次——Table.autofit = False
    已经写入该元素，重复追加会破坏 tblPr 的元素顺序（Word 可能提示修复）。
    """
    tbl = t._tbl
    tblPr = tbl.tblPr
    tblW = tblPr.find(qn("w:tblW"))
    if tblW is None:
        tblW = OxmlElement("w:tblW")
        tblPr.insert_element_before(
            tblW,
            "w:jc",
            "w:tblCellSpacing",
            "w:tblInd",
            "w:tblBorders",
            "w:shd",
            "w:tblLayout",
            "w:tblCellMar",
            "w:tblLook",
        )
    tblW.set(qn("w:type"), "dxa")
    tblW.set(qn("w:w"), str(int(sum(widths_cm) * 567)))
    old = tbl.find(qn("w:tblGrid"))
    if old is not None:
        tbl.remove(old)
    grid = OxmlElement("w:tblGrid")
    for w in widths_cm:
        gc = OxmlElement("w:gridCol")
        gc.set(qn("w:w"), str(int(w * 567)))
        grid.append(gc)
    tblPr.addnext(grid)
    for row in t.rows:
        for i, w in enumerate(widths_cm):
            row.cells[i].width = Cm(w)
        trPr = row._tr.get_or_add_trPr()
        cant = OxmlElement("w:cantSplit")
        trPr.append(cant)


def repeat_header(row):
    trPr = row._tr.get_or_add_trPr()
    th = OxmlElement("w:tblHeader")
    th.set(qn("w:val"), "true")
    trPr.append(th)


_last_table = None


def table(headers, rows, widths, font_size=9.5):
    global _last_table
    t = doc.add_table(rows=1, cols=len(headers))
    t.style = "Table Grid"
    t.alignment = WD_TABLE_ALIGNMENT.CENTER
    t.autofit = False
    hdr = t.rows[0].cells
    for i, text in enumerate(headers):
        hdr[i].text = ""
        p = hdr[i].paragraphs[0]
        p.paragraph_format.space_after = Pt(1)
        p.paragraph_format.line_spacing = 1.15
        r = p.add_run(text)
        r.bold = True
        r.font.size = Pt(font_size)
        shade(hdr[i], "DCE6F0")
    for row in rows:
        cells = t.add_row().cells
        for i, text in enumerate(row):
            cells[i].text = ""
            p = cells[i].paragraphs[0]
            p.paragraph_format.space_after = Pt(1)
            p.paragraph_format.line_spacing = 1.15
            r = p.add_run(str(text))
            r.font.size = Pt(font_size)
    fixed_layout(t, widths)
    repeat_header(t.rows[0])
    _last_table = t
    spacer = doc.add_paragraph()
    spacer.paragraph_format.space_after = Pt(2)
    spacer.paragraph_format.line_spacing = 1.0
    if spacer.runs:
        spacer.runs[0].font.size = Pt(4)
    return t

def caption(text):
    """表题置于表格上方（中文排版惯例），并与表格保持同页。"""
    p = doc.add_paragraph()
    r = p.add_run(text)
    r.font.size = Pt(9)
    r.font.color.rgb = GREY
    r.bold = True
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.space_before = Pt(6)
    p.paragraph_format.space_after = Pt(3)
    p.paragraph_format.keep_with_next = True
    if _last_table is not None:
        _last_table._tbl.addprevious(p._p)

def add_page_number_footer():
    footer = doc.sections[0].footer
    p = footer.paragraphs[0]
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = p.add_run("— ")
    r.font.size = Pt(9)
    r.font.color.rgb = GREY
    run = p.add_run()
    run.font.size = Pt(9)
    run.font.color.rgb = GREY
    f1 = OxmlElement("w:fldChar"); f1.set(qn("w:fldCharType"), "begin")
    it = OxmlElement("w:instrText"); it.set(qn("xml:space"), "preserve"); it.text = "PAGE"
    f2 = OxmlElement("w:fldChar"); f2.set(qn("w:fldCharType"), "end")
    run._r.append(f1); run._r.append(it); run._r.append(f2)
    r2 = p.add_run(" —")
    r2.font.size = Pt(9)
    r2.font.color.rgb = GREY

# ---------- 封面 ----------
title = doc.add_paragraph()
title.alignment = WD_ALIGN_PARAGRAPH.CENTER
title.paragraph_format.space_before = Pt(90)
tr = title.add_run("宏观经济学教学游戏系统")
tr.font.size = Pt(26)
tr.font.bold = True
tr.font.color.rgb = ACCENT
tr.font.name = HEAD_FONT
tr._element.rPr.rFonts.set(qn("w:eastAsia"), HEAD_FONT)

sub = doc.add_paragraph()
sub.alignment = WD_ALIGN_PARAGRAPH.CENTER
sub.paragraph_format.space_before = Pt(10)
sr = sub.add_run("设计讨论纪要")
sr.font.size = Pt(20)
sr.font.bold = True
sr.font.color.rgb = ACCENT
sr.font.name = HEAD_FONT
sr._element.rPr.rFonts.set(qn("w:eastAsia"), HEAD_FONT)

line = doc.add_paragraph()
line.alignment = WD_ALIGN_PARAGRAPH.CENTER
line.paragraph_format.space_before = Pt(6)
lr = line.add_run("从「双游戏实现审查」到「误概念级复盘工具」的设计收敛")
lr.font.size = Pt(11)
lr.font.color.rgb = GREY

doc.add_paragraph().paragraph_format.space_after = Pt(30)

meta = doc.add_table(rows=4, cols=2)
meta.alignment = WD_TABLE_ALIGNMENT.CENTER
meta.style = "Table Grid"
meta.autofit = False
meta_rows = [
    ("文档性质", "阶段设计讨论记录（非需求文档、非最终方案）"),
    ("讨论周期", "2026-10-28 — 2026-11-04，共六轮"),
    ("当前阶段", "概念设计收敛中，未进入实现"),
    ("评审与讨论对象", "工作区现有实现 islm-platform（两套游戏 + 知识学习 + AI 画像）"),
]
for i, (k, v) in enumerate(meta_rows):
    c0, c1 = meta.rows[i].cells
    c0.text = ""; c1.text = ""
    p0 = c0.paragraphs[0]; r0 = p0.add_run(k); r0.bold = True; r0.font.size = Pt(9.5)
    p1 = c1.paragraphs[0]; r1 = p1.add_run(v); r1.font.size = Pt(9.5)
    shade(c0, "F2F5F9")
fixed_layout(meta, [4.2, 12.0])

doc.add_page_break()

# ---------- 摘要 ----------
h1("摘要")
para(
    "本文档整理六轮设计讨论的结论。讨论的起点是对工作区现有实现的严格审查，"
    "终点是把「用模拟覆盖全书知识点」这一宽泛构想，收敛为一件具体的东西："
    "一个面向「学完之后」的复盘工具，以机制关与辨异关为体裁，以误概念级诊断为中枢，"
    "以「下节课重讲三点」为教师侧出口，并以论文所需的对照证据为约束条件。"
)
para(
    "文档同时记录：已确认的决策、仍未确定的问题、主要风险，以及尚未执行的下一步。"
    "凡涉及具体数值的地方均标注了来源或估算性质。"
)

# ---------- 1 背景 ----------
h1("1 背景与初始构想")
para("项目发起时，提出的目标可以归纳为五条：")
bullet("基于《宏观经济学》教材的全部知识点，用模拟让学生理解公式与政策如何运转，而不是停留在抽象公式与曲线；")
bullet("整个学习系统与 AI 结合，体现「智慧教育」；")
bullet("核心板块是个性化，要与学习通、智慧树一类产品区分开；")
bullet("教师能清楚了解学生学习情况，学生也能清楚自己哪里薄弱；")
bullet("最终给出每个人的个性化建议，并由 AI 把学习情况与游戏表现综合评估，而不是各模块孤立运转。")

para("工作区已有一套实现，包含两个游戏（单机政策模拟、四人房间博弈）、章节学习与题库、"
     "BKT 掌握度与知识图谱、AI 画像与建议、教师端学情看板，以及统一的行为事件流。"
     "第一轮讨论以这套实现为对象做了严格审查。")

# ---------- 2 审查 ----------
h1("2 第一轮审查：核心结论")
para(
    "审查的结论不是「做得不够多」，而是「机制与它声称的教学目标对不上」。"
    "游戏二声称考多目标权衡与政策协调，实际只有一个自由度（产出缺口）；"
    "游戏一声称考政策传导，却把知识测量（做题）直接接到政策效力上，"
    "并用一个不进入任何方程的「信任度」冒充第五个宏观目标。"
)
para(
    "更关键的是评分函数：什么都不做可得 82 分（满分 100），而任何扩张的边际收益都低于其通胀代价。"
    "也就是说，它在制度上奖励不作为。"
)
para("以下为审查中最严重的若干条，按主题归并。完整清单见讨论记录。")

table(
    ["编号", "问题（含位置）", "严重程度"],
    [
        ["1", "游戏二把「产出缺口」直接换算成「GDP 增速」（g = 6 + 50 × gap），混淆水平偏离与增长率", "高"],
        ["2", "游戏二五维雷达中 GDP／失业／通胀三维同源于 gap，菲利普斯曲线的取舍在数学上不存在", "高"],
        ["3", "游戏二「过热 · 通胀超标」判定分支永不可达：通关区间内 π 恒在 1.5%–2.5%", "高"],
        ["4", "游戏二把供给冲击（油价上涨）实现为 IS 左移，标签却写「成本推动」", "高"],
        ["5", "游戏一「π」是季度环比涨幅，却与 2% 年度目标比较并进入预期方程", "高"],
        ["6", "游戏一「公众信任度」被展示为宏观目标，但不进入任何方程，是死指标", "高"],
        ["7", "游戏一「答错→政策效果减半」把知识测量与政策效力焊死，评分无法归因", "高"],
        ["8", "同一张卡：题目教乘数 5，模型实际乘数约 1.63，卡面数值还要再乘 0.5", "高"],
        ["9", "游戏一四张标「持续 2 季」的临时政策从未实现续期，dur 是死字段", "高"],
        ["10", "游戏一每季自动按通胀预期增发货币，界面无任何提示", "高"],
        ["11", "游戏二债务只累计政府购买与发债，减税与转移支付免费，存在刷分套利", "高"],
        ["12", "游戏二决策反馈由「方向」生成而非由「结果」生成，可能与屏幕数据相反", "高"],
        ["13", "游戏一「什么都不做」得 82 分，接近理论上限；徽章可白拿", "高"],
        ["14", "两个游戏使用两套互不相干的 IS-LM（单位、口径、时间粒度全不同）", "高"],
    ],
    widths=[1.4, 13.2, 2.0],
)
caption("表 1  第一轮审查的主要问题（节选）")

quote(
    "一句话教训：广度早已足够（44 张卡、14 个季度、四图联动），缺的是机制深度与可诊断性。"
    "继续增加卡牌与章节，不会提升学习效果，只会提高演示时的信息量。"
)

# ---------- 3 设计对话 ----------
h1("3 设计对话的推进与结论")

h2("3.1 三个岔路口")
para("讨论中识别出三个必须先做的取舍，它们决定了后面所有形态。")
table(
    ["岔路口", "两条路", "当前结论"],
    [
        ["模拟器，还是决策题", "学生调参数看结果；或学生先判断、再验证", "以后者为主：核心循环是「判断→验证→归因」，预测与实际的偏差才是学习发生处"],
        ["一次性课堂活动，还是练习系统", "课堂内闭环；或课后可反复的关卡", "混合：课堂为教师演示与投票，课后为每周一次的个人作业"],
        ["一个模型，还是一本教材", "一个 14 季度大沙盘；或按机制拆成关卡族", "按「机制／辨异对」拆分，共享一套证据模型与界面语言"],
    ],
    widths=[4.2, 5.4, 7.0],
)
caption("表 2  三个岔路口与当前判断")

h2("3.2 教学目标的验收标准：「出口句」")
para(
    "「学生通关后能说出的那一句话」不是口号，是验收标准。它把游戏从「体验」变成「可判定的学习」，"
    "并且在写出来的同时，就决定了判定、反馈与画像。"
)
para("一句合格的出口句需通过四个测试：")
bullet("可被说错。若学生不可能说错，它就不是学习目标（「理解 IS-LM 模型」不可能说错）。")
bullet("含代价。经济学的句子必须带取舍，否则只是「多花钱能增长」的常识。")
bullet("可迁移。换一个情境还能用，而不只是记住某题选 B。")
bullet("可观测。能用三种方式之一测出来：判断方向、排链条顺序、给一段解释。")

para("合格的出口句有固定的槽位结构：")
quote("【触发条件】→【用什么工具】→【第一步机制】→【第二步机制】→【代价】→【边界条件】")

para("以选定的第一句（挤出效应）为例：")
quote(
    "总需求不足时，增加政府购买会先抬高产出，再通过货币需求推高利率、挤出部分私人投资，"
    "所以净效果小于简单乘数；LM 越陡、投资对利率越敏感，挤出越大。"
)

table(
    ["槽位", "产生的证据", "对应的游戏动作", "能识别的误概念"],
    [
        ["第一步：产出↑", "预测方向", "先押注再揭晓", "认为政府花钱挤占资源、产出不变"],
        ["第二步：利率↑", "预测方向", "押注", "认为 G↑ 会导致 r↓（混淆 IS 与 LM）"],
        ["挤出：投资↓", "链条排序", "把打乱的环节排回因果序", "把「挤出」理解成政府支出减少总需求"],
        ["净效果＜乘数", "幅度区间判断", "选「等于／小于／大于 k·ΔG」", "认为乘数就是 1/(1−β)"],
        ["LM 越陡越挤", "反事实对比", "同一冲击跑两版（陡 LM／平 LM）", "认为挤出与 LM 斜率无关"],
    ],
    widths=[3.2, 3.6, 5.0, 4.8],
)
caption("表 3  出口句的槽位如何同时决定证据、动作与误概念")

para(
    "这张表是「误概念级个性化」的全部来源：不是 AI 事后猜学生哪里不会，"
    "而是关卡在设计时就埋好了「说错会以什么方式说错」。"
)

h2("3.3 关卡骨架：A 关的五拍")
para(
    "把 A 句落到手机端，是五次点击，每拍一个槽位、3–4 个按钮，选项本身就是误概念。"
    "「选项即误概念」是整个设计的关键，否则采不到诊断信息。"
)
table(
    ["拍", "测什么", "学生动作", "选错时暴露的误概念"],
    [
        ["1 押注 · 方向", "产出的利率效应", "G+10 后 Y、r 怎么变？", "选「r↓」＝把 IS 右移当成 LM 右移；选「r 不变」＝认为货币供给被动适应"],
        ["2 押注 · 幅度", "净效果 vs 简单乘数", "ΔY 与 k·ΔG 比，大／小／相等", "选「相等」＝只会用 1/(1−β)；选「大于」＝把挤出方向搞反"],
        ["3 链条排序", "因果次序", "把 5 张打乱的卡排成序", "把「r↑」排在「Y↑」之前＝认为利率先动"],
        ["4 反事实", "斜率与挤出", "LM 更陡时，挤出变大／变小／不变", "选「不变」＝认为挤出只由投资敏感度决定"],
        ["5 迁移", "政策配合", "央行同时降准时，结论怎么变", "只能背本题、不能迁移"],
    ],
    widths=[3.0, 3.2, 3.8, 6.6],
)
caption("表 4  A 关的五拍结构（手机版）")

para("移动端约束（这些约束要在设计阶段定，不能留到「响应式适配」）：")
bullet("一屏一个判断、题干不超过 15 字、3–4 个大按钮、不滚动；")
bullet("不打字。60 人用手机输入中文既慢又无法自动判定，因此「解释」类证据也必须做成选项；")
bullet("五拍含揭晓约 6–7 分钟，加 2 分钟讲评，一关约 10 分钟。")

h2("3.4 教师端「三点」如何生成")
para(
    "不是让 AI 读完 60 份记录写感想，而是按槽位聚合正确率，取最差的三个槽位。"
    "每一个「点」都挂得住证据。"
)
para("示例（假设一个 60 人班）：")
bullet("若第 3 拍正确率 28% → 第一点：传导顺序（先产出还是先利率）；证据：「37/60 人把利率排在产出之前」。")
bullet("若第 4 拍正确率 31% → 第二点：LM 斜率与挤出大小的方向；证据：「33/60 人认为挤出与斜率无关」。")
bullet("若第 2 拍正确率 44% → 第三点：净效果为什么小于乘数；证据：「26/60 人选择了「相等」」。")
para(
    "教师在课堂上可以当场把这道题投出来，让选错的人解释——这是手机端最值钱的用法，"
    "也是市面产品做不到的：它把班级的集体误解变成了教学素材。"
)
para(
    "由此得出一个硬约束：班级级诊断要求「同步」。全班必须同一时刻做同一拍，聚合才有意义。"
    "因此课堂里不是各按速度闯关，而是教师控场；自由节奏只放在课后作业。"
)

h2("3.5 教学闭环")
para("讨论中确认的目标形态是一条每周闭环：")
quote(
    "课后作业（学生各自闯关）→ 系统按槽位聚合班级误概念分布 → 教师课前看到「三点」"
    "→ 课堂用演示模式当场重现这三点、并用「收答案」收集同题作答"
    "→ 下一次作业验证是否讲通。"
)
para(
    "这条闭环里，演示内容不是固定脚本，而是被班级诊断参数化的：哪三点错得多，就打开哪三关。"
    "个性化因此不只发生在学生侧，也发生在教师的讲授顺序上。"
)

h2("3.6 课堂形态的三次调整")
table(
    ["阶段", "课堂形态", "结果"],
    [
        ["最初设想", "60 人每人一台手机，同步玩完整游戏", "与 20 分钟课时、教室网络、公平性三方面同时冲突"],
        ["第一次调整", "课堂改为教师演示，学生课后作业", "一次性消掉并发、作弊、课时三个最大风险；但课堂失去学生侧数据"],
        ["第二次调整", "演示之外增加「收答案」投票", "课堂重新产生班级级即时数据，且成本很低"],
    ],
    widths=[3.2, 6.8, 6.6],
)
caption("表 5  课堂形态的演进")

h2("3.7 演示模式的三条硬要求")
para(
    "如果教师只是点「播放」，看动画滚过去，那它和一段录屏没有区别。演示模式若要成立，必须做到："
)
bullet("能停在结果之前。先让全班猜，再揭晓。这是演示唯一强于视频的地方，没有这个按钮，课堂形态就白改了。")
bullet("能退回上一拍。学生问「为什么利率会变」，教师要能退回「Y↑ → 货币需求↑」重放，而不是从头再来。")
bullet("投得清楚。一屏一个判断、大字、少量选项；现有实现的 1440px 四栏布局在投影仪上不可读。")

h2("3.8 定位：复盘即辨异")
para(
    "学生是「学完之后」来玩，所以他不需要再听一遍知识，他需要发现自己脑中的模型和书里的模型差在哪里。"
    "而误概念的本质几乎总是「把 A 当成 B」。因此复盘工具最有效的动作不是讲解，是辨异："
    "把两个长得很像、结论相反的情境摆在一起，让他判断「一样吗、哪里不一样」。"
)
para("这一判断直接给出了关卡体裁，也顺带解决了范围问题——按「辨异对」而不是「章节」来组织：")
table(
    ["辨异对", "正确结论", "学生常犯的错"],
    [
        ["财政扩张：封闭经济 vs 浮动汇率开放经济", "浮动汇率下财政效果被净出口抵消", "认为开放经济里财政更强"],
        ["货币政策：固定汇率 vs 浮动汇率", "固定汇率下货币政策失效（三难困境）", "认为降息总能刺激"],
        ["短期 vs 长期", "短期影响产出，长期只影响物价（货币中性）", "认为长期也能靠印钱增长"],
        ["储蓄率上升（Solow）", "稳态「水平」提高，长期「增长率」不变", "认为高储蓄带来永久高增长"],
        ["需求冲击 vs 供给冲击", "同样是产出下降，政策方向相反", "见衰退就扩张"],
        ["挤出 vs 挤入", "公共投资可能挤入私人投资", "认为政府支出必然挤出"],
    ],
    widths=[6.0, 6.0, 4.6],
)
caption("表 6  七组辨异对（节选六组），覆盖 13–19 章主干")
para(
    "由此关卡只有两种体裁：机制关（一条传导链，如 A）与辨异关（一对情境，判断同不同）。"
    "12 关 = 6 机制 + 6 辨异，即可撑起一本书的主干与一篇论文。"
)

h2("3.9 范围：T 型结构与 12 关")
para("讨论中给出的成本判断是：这类内容真正的成本不在引擎，在「出口句 + 槽位 + 误概念 + 选项 + 揭晓文本」的编写。")
table(
    ["范围", "关卡数", "编写成本（粗估，非精确数）"],
    [
        ["深做 3 章（财政／货币／IS-LM／AD-AS）", "约 12 关", "20–35 人日"],
        ["全书", "约 40 关", "60–120 人日"],
    ],
    widths=[8.4, 2.6, 5.6],
)
caption("表 7  范围与成本量级")
para(
    "结论是 T 型：一竖到底（深做 3 章、12 关、两种模式、误概念诊断、教师端三点），"
    "一横到边（其余章节用知识图谱、题库、AI 问答、概念动画覆盖）。"
    "申报材料可以写「覆盖全书知识点」，答辩演示的是「深度诊断」。"
)
para(
    "增长是唯一的例外：开放经济是 IS-LM 的扩展，同一引擎可跑；增长（Solow）是收敛路径，"
    "没有曲线移动，视觉与交互都是另一个东西。因此需要对增长单独三选一："
)
bullet("A. 动态路径：多一个渲染器（时间轴 + 收敛曲线），约等于再造三分之一个引擎，能看到「增长率先高后低」。")
bullet("B. 稳态对比：两张图（20% vs 30% 储蓄率的稳态），成本约 1/5，但看不到过渡期，而过渡期才是该知识点的要害。")
bullet("C. 概念关：不进模拟，只做辨异题与文字揭晓，最便宜，也最不像「模拟」。")

h2("3.10 论文路径")
para("讨论中给出的判断是：这套东西能支撑的最强 claim 只有一个——")
quote(
    "在「学完之后」的复盘场景里，误概念级诊断比章节级掌握度更能预测学生的迁移表现；"
    "且把诊断结果交给教师做「重讲三点」，能显著降低该误概念的复发率。"
)
para("最小证据设计（一个班 60 人、一学期 8–12 次作业即可）：")
bullet("前测：12 个误概念各 1 题，学期初做一次；")
bullet("作业：每周 1 关，押注记录带槽位标签；")
bullet("课堂投票：同一道题在「讲之前／讲之后」各投一次，是最便宜的前后测，不需要 60 人跑完整游戏；")
bullet("后测：期末同一批题 + 换情境的迁移题；")
bullet("主图：误概念转移矩阵（「以为 r↓ 的人，8 周后有多少改成了 r↑」）。")
para(
    "若要再强一档，加一个班内准实验：12 个知识点里随机挑 6 个在下节课重讲、另 6 个延迟一周再讲，"
    "比较两组提升差。不需要第二个班，代价是要向学生说明「有些点会晚一点讲」。"
    "提醒：AI 全程参与本身不是创新点，每条建议都能回指到一条押注记录（可审计的个性化）才是。"
)

h2("3.11 模型分层与「自动标签」的风险")
para("「训练一个既懂教材知识点、又能分析学生不足的模型」，实际是三个不同的东西，混在一起会做不出来：")
table(
    ["层", "是否可训练", "说明"],
    [
        ["知识表示", "否", "出口句 → 槽位 → 误概念 → 证据。必须人工写，是核心资产"],
        ["学生状态推断", "是", "输入每次点击（槽位、选项、用时、是否改选），输出误概念后验概率；BKT／IRT／朴素贝叶斯即可"],
        ["语言生成", "是", "把结构化诊断翻成「重讲三点」与「你该练什么」；这一层才真正需要教材与语料"],
    ],
    widths=[3.4, 2.6, 10.6],
)
caption("表 8  三层职责划分")
para("关于「标签先自动生成」，讨论中区分了两种含义，二者风险完全不同：")
bullet(
    "若指「选项→误概念」的映射表：这不是自动生成，是规则，可靠，可直接使用。",
)
bullet(
    "若指「让模型读作答记录自动打标」：会形成自证循环——模型学到的是打标模型的先验，而不是学生的真实误解；"
    "教师一旦发现建议与班级事实不符，信任就会崩塌。",
)
para(
    "最小校验成本不是人工标注全量，而是每班抽 10 人、教师花 10 分钟复核，得到 150–200 条种子，"
    "用来量自动标签的一致率。这件事不做，画像在教师眼里就只是「看起来懂你」。"
)
para("另外两个由约束直接带来的硬风险：")
bullet("60 台设备 + 教室网络 + 短课时，是「一断网整节课就废」的组合，终局不应依赖实时长连接。")
bullet("手机屏幕决定信息密度，四图联动 + KPI 盘 + 动态流在手机与投影上均不可读，必须在设计阶段取舍。")

# ---------- 4 决策 ----------
h1("4 已确认的决策")
table(
    ["决策项", "结论", "依据／备注"],
    [
        ["游戏核心动作", "判断 → 验证 → 归因，而非调参观察", "只有先有信念，偏差才会产生学习"],
        ["第一关", "挤出效应（A 句）", "槽位最多、误概念最典型"],
        ["课堂形态", "教师演示 + 「收答案」投票", "一次性消掉并发、公平、课时三风险"],
        ["学生使用", "课后每周一次作业，个人手机，独立完成", "与课堂演示共用同一关卡"],
        ["学生分组", "不分组，个人独立", "诊断需按人归因"],
        ["工具定位", "学完之后的复盘与巩固", "核心动作是辨异，不是重讲"],
        ["诊断精度", "误概念级", "教师端「三点」的原料"],
        ["教师端首页", "下节课重讲哪三点", "每周一次闭环"],
        ["AI 定位", "全程参与、建议性、必须可回指证据", "教师可否决，AI 不是定论"],
        ["范围", "含开放经济与增长；T 型结构（深 3 章 + 浅覆盖）", "比赛与论文都需要覆盖面"],
        ["产出目标", "比赛 + 论文", "因此需要对照证据，而非仅系统介绍"],
    ],
    widths=[3.4, 7.6, 5.6],
)
caption("表 9  已确认的决策清单")

# ---------- 5 待定 ----------
h1("5 待定问题")
table(
    ["编号", "问题", "影响"],
    [
        ["P1", "教材具体书目与章节边界（尚未提供）", "决定机制清单与辨异对清单的边界"],
        ["P2", "增长按 A（动态路径）／B（稳态对比）／C（概念关）处理", "决定 12 关里能否装下增长，以及工期"],
        ["P3", "论文投递方向：比赛、期刊还是会议", "决定证据门槛（系统介绍 vs 对照实验）"],
        ["P4", "是否做「延迟重讲」的班内准实验", "决定论文能否从描述升级为因果证据"],
        ["P5", "是否只有一个教学班，能否增加对照班", "决定「效果」一节的说服力"],
        ["P6", "作业计分、重做与覆盖规则", "影响学生动机与标签噪声"],
        ["P7", "是否已有「章—节—知识点」清单", "决定全书覆盖是 12 关还是 40 关"],
        ["P8", "「自动生成标签」的具体形式：规则映射还是 LLM 打标", "决定是否存在自证循环风险"],
        ["P9", "课堂投票是否作为正式研究工具（课前／课后各一次）", "决定能否拿到最便宜的前后测"],
        ["P10", "课堂是否需要教师统一控场、全班同一拍", "决定班级级诊断能否聚合"],
    ],
    widths=[1.4, 9.4, 5.8],
)
caption("表 10  待定问题清单")

# ---------- 6 风险 ----------
h1("6 主要风险")
table(
    ["风险", "触发条件", "后果"],
    [
        ["范围失控", "同时追求「全书覆盖」与「误概念深度」", "每关都浅，诊断价值归零"],
        ["内容成本被低估", "把工作量算在引擎上", "工期超支，关卡质量下降"],
        ["课堂设备与网络", "投影可读性不足、投票并发失败", "一节课报废，教师弃用"],
        ["自动标签自证循环", "直接让模型读记录打标", "画像与真实误解脱节"],
        ["AI 建议不可信", "结论无法回指证据", "教师一次失望后不再使用"],
        ["论文缺对照", "只有前后测、无对照", "退化为系统介绍，竞争力下降"],
        ["数据合规", "行为与作答记录未告知", "学生与教师的合规风险"],
        ["团队与周期", "12 关 + 两模式 + 后台同期推进", "交付不完整，答辩只能演示半成品"],
    ],
    widths=[3.6, 6.8, 6.2],
)
caption("表 11  主要风险")

# ---------- 7 下一步 ----------
h1("7 下一步（讨论中提出、尚未执行）")
bullet("拿到教材后，先把目录拆成「机制清单」与「辨异对清单」，验证 8 组以上辨异对是否凑得出来。")
bullet("为 A 关写完整的五拍：每拍的题干、选项、每个选项对应的误概念、揭晓文本与反事实。")
bullet("确定增长的处理方式（A／B／C），并据此重算 12 关的构成。")
bullet("设计课堂投票的最小闭环：一题、两次（讲前／讲后）、班级分布即时可见。")
bullet("确定论文的证据设计：是否加入延迟重讲对照、是否有第二个班。")

# ---------- 附录 ----------
h1("附录 A　术语表")
table(
    ["术语", "含义"],
    [
        ["出口句", "学生通关后应能说出的一句因果陈述，是教学目标与验收标准的载体"],
        ["槽位", "出口句中可被单独判定的一环（如「利率↑」），对应一条证据"],
        ["误概念", "学生用来替代正确模型的错误模型，通常表现为「把 A 当成 B」"],
        ["机制关", "以一条完整传导链为内容的关卡（如 A 关）"],
        ["辨异关", "把两个近似情境并列、要求判断同不同的关卡"],
        ["三点", "教师端每周输出的「下节课重讲哪三点」，由最差槽位聚合而来"],
    ],
    widths=[2.8, 13.6],
)
caption("表 12  术语表")

add_page_number_footer()

out = r"D:\HZYJ\宏观经济学教学游戏系统_设计讨论纪要.docx"
doc.save(out)
print("saved:", out)

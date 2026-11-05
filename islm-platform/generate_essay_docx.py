# -*- coding: utf-8 -*-
"""生成智慧教与学大赛学生组征文 Word 文档（按大赛排版要求）。

排版规范：标题三号黑体居中；摘要四号宋体；正文四号宋体/黑体；
一级标题四号黑体；二级标题四号宋体加粗；表格五号；表注在表上、图注在图下
（均 10.5pt 黑体居中）；参考文献五号宋体。
插图：figures/ 目录下 fig1~fig3（600 dpi PNG，嵌入宽度 14.5/14.5/12.5 cm）。
字数要求：正文+摘要总字符 ≤4000（脚本末尾自检打印）。
"""
import re

from docx import Document
from docx.shared import Pt, Cm
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_LINE_SPACING
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml.ns import qn

OUT = r"d:\HZYJ\islm-platform\智慧教与学大赛学生组征文_AI赋能研究性学习_v2.docx"
FIG_DIR = r"d:\HZYJ\islm-platform\figures"

TITLE = "AI 赋能研究性学习的探索与实践"
SUBTITLE = "——基于阶梯导学与知识追踪的宏观经济学智能学习平台"
AUTHOR_LINE = "【作者姓名】"
AFFIL_LINE = "（【所在学院】，学号：【学号】　　指导教师：【指导教师姓名】）"

ABSTRACT = (
    "通用大模型进入学习场景后，“一问就给答案”正侵蚀研究性学习最宝贵的思考过程；而 IS-LM 模型高度抽象，"
    "传统教学难以呈现曲线移动与均衡迁移的动态过程。针对这两个痛点，本文以“开发者+使用者”"
    "双重身份开展项目式研究性学习，自主实现集“AI 阶梯导学、知识追踪、交互仿真、政策博弈”于一体的"
    "宏观经济学智能学习平台：将提示拆解为 L1~L4 四级，构建“源头过滤—输出校验—降级兜底”三级防泄露链路；"
    "引入贝叶斯知识追踪（BKT）与 SM-2 间隔重复，实现“哪里不会练哪里”；配合九参数 IS-LM 仿真器与"
    "多人政策博弈游戏，支撑“提出问题—仿真实验—数据分析—得出结论”的完整研究流程。"
    "端到端测试与“挤出效应”探究案例表明，平台防泄露可靠、导学完整，方法论可迁移推广。"
)

KEYWORDS = "AI 赋能；研究性学习；阶梯导学；贝叶斯知识追踪；交互仿真"

BODY = [
    ("h1", "一、引言"),
    ("p", "随着《教育信息化2.0行动计划》推进与生成式人工智能普及，AI 工具正深刻改变大学生的学习方式"
          "[1]。以 ChatGPT 为代表的大语言模型带来个性化辅导等新机遇，也带来过度依赖与学术诚信等新挑战"
          "[2]；实证研究提示，对 AI 依赖越深、认知卸载越明显，批判性思维越弱[3]。"
          "不少同学遇到难题的第一反应已是“直接问 AI”，思考过程被整体跳过，"
          "与研究性学习“自主提问、亲历探究”背道而驰。"),
    ("p", "就宏观经济学而言，IS-LM 模型是本科教学的重点与难点：产品与货币市场经利率相互勾连，"
          "九个参数中任一变动都会同时引起两条曲线移动与均衡点迁移；黑板只能呈现静态图示，"
          "学生“看得见结论，看不见过程”。"
          "我们团队依托大学生创新创业训练计划，以“开发者+使用者”双重身份开展研究性学习："
          "自主研发智能学习平台，把教学法写进工程约束，再用平台完成 IS-LM 专题探究、亲历完整研究流程。"),

    ("h1", "二、理论基础与设计理念"),
    ("h2", "（一）研究性学习与支架式教学"),
    ("p", "研究性学习理论认为，知识是学习者在真实问题情境中主动建构的，教师的职责是创设情境、提供支架而非告知"
          "结论[4]。维果茨基的“最近发展区”理论指出，教学应作用于独立发展水平与潜在发展水平之间的区域[5]；"
          "伍德等人的“支架式教学”主张支持应随能力提升逐步撤除[6]；"
          "智能辅导系统围绕“如何给提示”的探索为工程实现提供了参照[7]。据此，平台把“是否给答案”视为最重要的"
          "产品决策：四级阶梯提示单调递增、不可回退，困惑重试按当前层级重新生成、不越级。"),
    ("h2", "（二）掌握学习、知识追踪与间隔重复"),
    ("p", "布卢姆的掌握学习理论主张，给予足够时间与适当帮助，绝大多数学生都能掌握学习内容[8]；"
          "知识追踪是落实这一理念的关键技术，模型谱系已在智能教育系统中系统应用[9]。"
          "平台采用贝叶斯知识追踪（BKT）[10]，以先验掌握、学习转移、猜测、失误四参数从作答序列在线反推"
          "真实掌握概率——答对不等于掌握，答错不等于没学会。艾宾浩斯遗忘曲线表明遗忘先快后慢[11]，"
          "错题本内置 SM-2 算法[12]，按“记得/模糊/忘了”评分自动排期复习。综上，设计理念可概括为："
          "用工程手段强制 AI 遵守“先引导、后揭示”的教学法铁律。"),

    ("h1", "三、平台设计与关键技术"),
    ("h2", "（一）总体架构"),
    ("p", "平台采用前后端分离架构：前端 Vue 3 与 ECharts 实现交互仿真与可视化，后端 Node.js（Express）"
          "与 MySQL 承载业务与数据，大模型接入豆包（火山方舟）；系统分为交互层、AI 增强层、学习分析层与"
          "平台工程层四层（图 1）。"),
    ("image", FIG_DIR + r"\fig1_architecture.png", 14.5, "图 1　平台总体架构（四层）"),
    ("h2", "（二）AI 阶梯导学与三级防泄露"),
    ("p", "这是平台的核心创新。每道题的提示拆解为四级：L1 给宏观方向，L2 给关键条件并附检索命中的知识卡，"
          "L3 列出思路框架且最后一步留白，L4 才给出完整解析（需二次确认并记录行为日志）。"
          "以均衡收入计算题为例，L1 仅提示“回忆产品市场均衡条件”，L2 给出消费与投资函数，"
          "L3 列出“代入—求解—验证”框架并留白，L4 才呈现完整推导。"),
    ("p", "教育大模型的落地还伴随学术诚信与数据隐私等伦理挑战[13]，最直接的风险便是答案泄露。"
          "为此构建“源头过滤—输出校验—降级兜底”三级防泄露链路（图 2）：L1~L3 提示词中官方答案恒为"
          "“（按规则隐藏）”，答案根本不进模型上下文；每次输出经数值与选项字母正则扫描，疑似泄露即提醒重试"
          "一次；仍不合格则降级直出知识卡，绝不静默失败。针对“流式输出无法中途审查”的矛盾，"
          "采用完整生成+校验后再以 SSE 分段回放的架构。"),
    ("image", FIG_DIR + r"\fig2_leakguard.png", 14.5, "图 2　L1~L4 阶梯导学与三级防泄露链路"),
    ("h2", "（三）教学智能体与混合检索"),
    ("p", "AI 助手基于 Function Calling 构建，会“动手”：可自主调用 IS-LM 求解器（缺参自动补默认值）、"
          "知识库检索、题库查询（只回题干摘要、绝不含答案）三个工具，循环上限四轮，调用过程以步骤条实时"
          "可视化。检索采用 RAG[14]混合方案：TF-IDF 关键词召回与向量语义召回按 0.5/0.5 融合，"
          "无向量时退化为纯关键词。RAG 已发展出查询重写等更多路线[15]，本平台取适合轻量部署者；"
          "这正是基于大模型的自主智能体[16]在教育场景中的具体实例。"),
    ("h2", "（四）知识追踪与自适应推荐"),
    ("p", "学生每次作答实时上报，后端以 BKT 更新各知识点掌握概率，按“最薄弱优先×难度爬升×做得少优先”"
          "三因子推荐练习；错题本按 SM-2 以 1 天→6 天→EF×前值滚动排期复习。"),
    ("h2", "（五）交互仿真与工程保障"),
    ("p", "仿真器支持九参数实时联动、政策冲击与对比模式，可从知识点页与习题页一键唤起。工程上实现三重降级："
          "大模型不可用切换本地模拟，向量检索不可用退化 TF-IDF，云端不可用前端本地求解。"),
    ("h2", "（六）多人政策博弈模拟"),
    ("p", "平台还内嵌多人政策博弈游戏：4 名学生分别扮演政府（含央行）、银行、企业、消费者，"
          "按固定顺序轮流做出财政、货币、金融、投资、消费等多维决策，所有决策实时汇入后端同一 IS-LM 求解器"
          "计算新均衡，GDP 增速、失业率、通胀率、利率等仪表盘随之刷新；终局按 GDP 恢复度、失业率控制、"
          "通胀控制、债务可持续性、政策协调度五维生成雷达图评分。博弈的价值在于“牵一发而动全身”："
          "政府扩张会推高利率、挤出企业投资，银行收缩信贷会抵消财政刺激，任何一方都无法独善其身，"
          "学生必须协商协调才能兼顾增长、物价、就业与国际收支四大目标。"),

    ("h1", "四、研究性学习实践案例：“挤出效应有多大”"),
    ("p", "为检验平台支撑研究性学习的实际能力，我们以“政府购买增加究竟会挤出多少私人投资”为研究问题开展探究。"),
    ("pstep", "第一步，提出问题与假设：",
     "政府购买扩大既直接推高产出，又经利率上升抑制私人投资，净效应多大需用数据回答；据模型推理提出"
     "假设——挤出大小取决于 LM 斜率，货币需求的利率敏感系数 h 越小，LM 越陡峭，挤出越严重。"),
    ("pstep", "第二步，设计实验：",
     "固定其余参数（自发消费 100、边际消费倾向 0.8、自发投资 150、投资利率敏感系数 10、政府购买 50、"
     "货币需求收入系数 0.5、货币供给 550），令政府购买由 50 增至 100，仅改变 h 做三组对比。"),
    ("pstep", "第三步，采集数据：",
     "借助对比模式记录均衡产出与利率的变化，并令 AI 智能体调用 IS-LM 求解器复核手算结果，三组结果一致"
     "（见表 1 与图 3）。挤出比例按 1−ΔY/250 计算，250 为不考虑货币市场约束时的简单乘数效应（50×5）。"),
    ("caption", "表 1　不同 LM 斜率下的挤出效应对比（ΔG=50）"),
    ("table",
     ["组别", "利率敏感系数 h", "产出增量 ΔY", "利率增量 Δr", "投资增量 ΔI", "挤出比例"],
     [["①", "10", "+14.3", "+0.71", "−7.1", "94.3%"],
      ["②", "25", "+125.0", "+2.50", "−25.0", "50.0%"],
      ["③", "50", "+166.7", "+1.67", "−16.7", "33.3%"]]),
    ("image", FIG_DIR + r"\fig3_crowding_out.png", 12.5, "图 3　不同 LM 斜率下的挤出效应（数据与表 1 对应）"),
    ("pstep", "第四步，阶梯导学辅助解题：",
     "在配套计算题“求三部门均衡收入与利率”中先做错，随后按 L1→L3 逐级解锁提示，在 L3 框架的留白步"
     "自主完成代入求解，再以 L4 解析对照核对，并用仿真器复现验证。"),
    ("pstep", "第五步，结论与反思：",
     "h 由 25 增至 50 时产出增量由 125.0 升至 166.7，h 降至 10 时骤降至 14.3，九成以上乘数效应被利率"
     "上升抵消——财政政策效果取决于货币市场利率弹性，LM 越陡挤出越大，与教材一致，但这次是"
     "“自己算出来的”——仿真把“背结论”变成了“做研究”。"),

    ("h1", "五、效果验证与应用价值"),
    ("h2", "（一）可复现的工程验证"),
    ("p", "平台完成 8 项端到端测试并全部通过：层级逐级递增；越级请求被拦截；困惑重试不改层级；"
          "L4 需二次确认且幂等回放；刷新后状态恢复；L1~L3 无答案痕迹；泄露→重试→降级链路真实触发并正确"
          "兜底；前端生产构建通过。测试均可脚本复现。"),
    ("h2", "（二）防泄露实战案例"),
    ("p", "开发期间曾真实触发一次泄露：模型在某次 L2 提示中输出答案数值 1266.67，校验立即拦截→提醒重试→"
          "仍不合格→自动降级直出知识卡，全程无答案外泄且降级被完整记录（表 2）。"),
    ("caption", "表 2　答案泄露拦截与降级运行记录"),
    ("table",
     ["阶段", "系统动作", "结果"],
     [["第1轮 生成·校验", "模型输出内含答案数值 1266.67，泄露扫描命中变体", "拦截（1266.67）"],
      ["第2轮 提醒重试", "错误输出与严厉提醒回填上下文，再生成并复检", "仍不合格"],
      ["自动降级", "直出知识库快照前 2 块知识卡原文，solution = null", "无答案外泄"],
      ["完整记录", "hint_log 落库：模型、token 用量、内容、degraded = 1", "可回溯审计"]]),
    ("h2", "（三）鲁棒性与可用性"),
    ("p", "三重降级保障“拔线不崩”：现场停掉后端后，仿真、练习与本地功能照常可用；匿名免注册降低使用门槛；"
          "登录用户错题本云同步采用“云端复习次数大者胜”合并策略，云端写入异步静默；Docker Compose 一键部署。"),
    ("h2", "（四）推广潜力与延伸实践"),
    ("p", "其一，章节内容数据驱动，扩展新章节只需新增配置；其二，“阶梯导学+防泄露+BKT”方法论与学科无关，"
          "可迁移至 AD-AS、化学平衡、物理电路等可仿真学科。沿同一思路，我们还将“仿真+传导”延伸为单机政策"
          "模拟游戏“经济舵手”：玩家扮演宏观决策者，在 2023 年四季度起的 14 个季度中，"
          "从财政、货币、产业、贸易 44 张政策卡中抉择，政策落地即播放“冲击注入→曲线移动→均衡重解→物价→"
          "就业→部门反馈”六步传导动画，IS-LM、AD-AS、菲利普斯曲线实时联动；学习模式下每张政策卡须先答对"
          "相关题目方可全额生效、答错减半。表 3 给出平台与同类工具的能力对比。"),
    ("caption", "表 3　平台与同类工具能力对比"),
    ("table",
     ["能力", "智能题库类应用", "通用对话 AI", "MOOC 平台", "本平台"],
     [["交互式参数仿真", "无", "无", "无", "九参数实时联动"],
      ["阶梯式防泄露导学", "无", "无", "无", "L1~L4+三级防泄露链路"],
      ["知识追踪与自适应推荐", "固定周期复习", "无", "无", "BKT+SM-2"],
      ["断网/无密钥可用", "否", "否", "否", "三重降级"]]),

    ("h1", "六、结论与展望"),
    ("p", "本文报告了以“开发者+使用者”双重身份开展 AI 赋能研究性学习的完整实践：面向“AI 直接给答案”与"
          "“模型抽象不可见”两大痛点，自主研发集阶梯导学、知识追踪、交互仿真与政策博弈于一体的智能学习平台，"
          "用三级防泄露链路把“先引导、后揭示”写进工程约束，并以“挤出效应”案例验证了平台支撑完整研究流程的"
          "能力。后续将基于反馈数据迭代提示质量、建设教师端学情看板、推广至更多章节与学科。"
          "当 AI 被严格约束为“脚手架”而非“答案机”时，技术才能真正服务于思考的发生。"),
]

REFS = [
    "[1] 中华人民共和国教育部. 教育信息化2.0行动计划[EB/OL]. (2018-04-18)[2026-09-28]. "
    "http://www.moe.gov.cn/srcsite/A16/s3342/201804/t20180425_334188.html.",
    "[2] KASNECI E, SESSLER K, KUCHEMANN S, et al. ChatGPT for good? On opportunities and challenges "
    "of large language models for education[J]. Learning and Individual Differences, 2023, 103: 102274.",
    "[3] GERLICH M. AI tools in society: Impacts on cognitive offloading and the future of critical "
    "thinking[J]. Societies, 2025, 15(1): 6.",
    "[4] 何克抗. 建构主义——革新传统教学的理论基础(上)[J]. 电化教育研究, 1997(3): 3-9.",
    "[5] VYGOTSKY L S. Mind in Society: The Development of Higher Psychological Processes[M]. "
    "Cambridge: Harvard University Press, 1978.",
    "[6] WOOD D, BRUNER J S, ROSS G. The role of tutoring in problem solving[J]. "
    "Journal of Child Psychology and Psychiatry, 1976, 17(2): 89-100.",
    "[7] LIN C C, HUANG A Y Q, LU O H T. Artificial intelligence in intelligent tutoring systems toward "
    "sustainable education: A systematic review[J]. Smart Learning Environments, 2023, 10(1): 41.",
    "[8] BLOOM B S. Learning for mastery[J]. Evaluation Comment, 1968, 1(2): 1-12.",
    "[9] ABDELRAHMAN G, WANG Q, NUNES B. Knowledge tracing: A survey[J]. ACM Computing Surveys, "
    "2023, 55(11): 1-37.",
    "[10] CORBETT A T, ANDERSON J R. Knowledge tracing: Modeling the acquisition of procedural "
    "knowledge[J]. User Modeling and User-Adapted Interaction, 1995, 4(4): 253-278.",
    "[11] EBBINGHAUS H. Memory: A Contribution to Experimental Psychology[M]. "
    "New York: Teachers College, Columbia University, 1913.",
    "[12] WOZNIAK P A. Optimization of Repetition Spacing in the Practice of Learning[D]. "
    "Poznan: Poznan University of Technology, 1990.",
    "[13] YAN L, SHA L, ZHAO L, et al. Practical and ethical challenges of large language models in "
    "education: A systematic scoping review[J]. British Journal of Educational Technology, 2024, "
    "55(1): 90-112.",
    "[14] LEWIS P, PEREZ E, PIKTUS A, et al. Retrieval-augmented generation for knowledge-intensive "
    "NLP tasks[C]//Proceedings of the 34th International Conference on Neural Information Processing "
    "Systems. Vancouver: Curran Associates Inc., 2020: 9459-9474.",
    "[15] GAO Y, XIONG Y, GAO X, et al. Retrieval-augmented generation for large language models: "
    "A survey[J]. arXiv preprint arXiv:2312.10997, 2023.",
    "[16] WANG L, MA C, FENG X, et al. A survey on large language model based autonomous agents[J]. "
    "Frontiers of Computer Science, 2024, 18(6): 186345.",
]


def set_run(run, size, ea_font="宋体", ascii_font="Times New Roman", bold=False):
    run.font.name = ascii_font
    run.font.size = Pt(size)
    run.font.bold = bold
    rpr = run._element.get_or_add_rPr()
    rfonts = rpr.find(qn("w:rFonts"))
    if rfonts is None:
        rfonts = rpr.makeelement(qn("w:rFonts"), {})
        rpr.append(rfonts)
    rfonts.set(qn("w:eastAsia"), ea_font)


def add_para(doc, align=None, before=0, after=0, line=1.5, indent=None):
    p = doc.add_paragraph()
    pf = p.paragraph_format
    if align is not None:
        pf.alignment = align
    pf.space_before = Pt(before)
    pf.space_after = Pt(after)
    if line:
        pf.line_spacing = line
    if indent:
        pf.first_line_indent = Pt(indent)
    return p


def main():
    doc = Document()

    # 页面设置：A4，标准页边距
    sec = doc.sections[0]
    sec.page_width, sec.page_height = Cm(21), Cm(29.7)
    sec.top_margin = sec.bottom_margin = Cm(2.54)
    sec.left_margin = sec.right_margin = Cm(3.17)

    # Normal 样式默认宋体四号
    normal = doc.styles["Normal"]
    normal.font.name = "Times New Roman"
    normal.font.size = Pt(14)
    normal._element.rPr.rFonts.set(qn("w:eastAsia"), "宋体")

    # 标题：三号黑体居中
    p = add_para(doc, WD_ALIGN_PARAGRAPH.CENTER, before=6, after=0)
    set_run(p.add_run(TITLE), 16, "黑体", "黑体")
    p = add_para(doc, WD_ALIGN_PARAGRAPH.CENTER, before=0, after=10)
    set_run(p.add_run(SUBTITLE), 16, "黑体", "黑体")

    # 作者信息：四号宋体居中（占位符）
    p = add_para(doc, WD_ALIGN_PARAGRAPH.CENTER, before=0, after=0, line=1.15)
    set_run(p.add_run(AUTHOR_LINE), 14)
    p = add_para(doc, WD_ALIGN_PARAGRAPH.CENTER, before=0, after=12, line=1.15)
    set_run(p.add_run(AFFIL_LINE), 14)

    # 摘要：四号宋体（标签黑体）
    p = add_para(doc, WD_ALIGN_PARAGRAPH.JUSTIFY, after=4, line=1.25)
    set_run(p.add_run("摘　要："), 14, "黑体")
    set_run(p.add_run(ABSTRACT), 14)
    p = add_para(doc, WD_ALIGN_PARAGRAPH.JUSTIFY, after=10, line=1.25)
    set_run(p.add_run("关键词："), 14, "黑体")
    set_run(p.add_run(KEYWORDS), 14)

    # 正文
    for item in BODY:
        kind = item[0]
        if kind == "h1":
            p = add_para(doc, before=13, after=7, line=1.3)
            set_run(p.add_run(item[1]), 14, "黑体", "黑体")
        elif kind == "h2":
            p = add_para(doc, before=7, after=4, line=1.3)
            set_run(p.add_run(item[1]), 14, "宋体", "Times New Roman", bold=True)
        elif kind == "p":
            p = add_para(doc, WD_ALIGN_PARAGRAPH.JUSTIFY, indent=28)
            set_run(p.add_run(item[1]), 14)
        elif kind == "pstep":
            p = add_para(doc, WD_ALIGN_PARAGRAPH.JUSTIFY, indent=28)
            set_run(p.add_run(item[1]), 14, bold=True)
            set_run(p.add_run(item[2]), 14)
        elif kind == "image":
            _, img_path, w_cm, cap = item
            p = add_para(doc, WD_ALIGN_PARAGRAPH.CENTER, before=6, after=3, line=1.0)
            p.add_run().add_picture(img_path, width=Cm(w_cm))
            p = add_para(doc, WD_ALIGN_PARAGRAPH.CENTER, before=0, after=8, line=1.15)
            set_run(p.add_run(cap), 10.5, "黑体", "黑体")
        elif kind == "caption":
            p = add_para(doc, WD_ALIGN_PARAGRAPH.CENTER, before=6, after=3, line=1.15)
            set_run(p.add_run(item[1]), 10.5, "黑体", "黑体")
        elif kind == "table":
            headers, rows = item[1], item[2]
            tbl = doc.add_table(rows=1 + len(rows), cols=len(headers))
            tbl.style = "Table Grid"
            tbl.alignment = WD_TABLE_ALIGNMENT.CENTER
            for j, h in enumerate(headers):
                cell = tbl.rows[0].cells[j]
                cp = cell.paragraphs[0]
                cp.alignment = WD_ALIGN_PARAGRAPH.CENTER
                set_run(cp.add_run(h), 10.5, "黑体", "黑体")
            for i, row in enumerate(rows, start=1):
                for j, val in enumerate(row):
                    cell = tbl.rows[i].cells[j]
                    cp = cell.paragraphs[0]
                    cp.alignment = WD_ALIGN_PARAGRAPH.CENTER
                    set_run(cp.add_run(val), 10.5)
            add_para(doc, after=4, line=1.0)  # 表后间距
        else:
            raise ValueError(kind)

    # 参考文献
    p = add_para(doc, before=14, after=6, line=1.3)
    set_run(p.add_run("参考文献"), 14, "黑体", "黑体")
    for ref in REFS:
        p = add_para(doc, WD_ALIGN_PARAGRAPH.LEFT, after=2, line=1.15)
        set_run(p.add_run(ref), 10.5)

    doc.save(OUT)

    # 引用连续性自检：正文引用编号应按首现顺序恰为 1..N
    seq = []
    for it in BODY:
        if it[0] in ("p", "pstep"):
            seq.extend(int(m) for m in re.findall(r"\[(\d+)\]", "".join(it[1:])))
    print("正文引用首现顺序:", seq)
    if seq != list(range(1, len(REFS) + 1)):
        raise SystemExit("错误：引用编号未按首现顺序连续排列")
    print(f"插图数: {len(doc.inline_shapes)}")

    # 字数统计（正文+摘要，不含参考文献与表格）
    texts = [ABSTRACT, KEYWORDS]
    for it in BODY:
        if it[0] in ("h1", "h2", "p", "caption"):
            texts.append(it[1])
        elif it[0] == "pstep":
            texts.extend(it[1:])
    all_text = "".join(texts)
    cjk = sum(1 for ch in all_text if "\u4e00" <= ch <= "\u9fff")
    print(f"已生成: {OUT}")
    print(f"总字符数(含标点英文): {len(all_text.replace(' ', ''))}")
    print(f"中文字符数: {cjk}")


if __name__ == "__main__":
    main()

"""
Build PPS_ROLE_USER_MANUAL.docx — user-facing role manuals for PPS.

Companion Mermaid sources:
  backend/mermaids/user-manual/*.mmd

Run with system Python that has python-docx + Pillow:
  py -3.12 docs/build_pps_role_user_manual_docx.py
"""

from __future__ import annotations

from io import BytesIO
from pathlib import Path

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
MMD_DIR = ROOT / "mermaids" / "user-manual"
OUT = Path(__file__).resolve().parent / "PPS_ROLE_USER_MANUAL.docx"

W = 1200
PAD = 28
NAVY = (15, 23, 42)
MUTED = (100, 116, 139)
LINE = (203, 213, 225)
WHITE = (255, 255, 255)
PAGE = (248, 250, 252)
MC = (29, 78, 216)
SV = (180, 83, 9)
OP = (109, 40, 217)
SYS = (51, 65, 85)


def font(size: int, bold: bool = False):
    name = "segoeuib.ttf" if bold else "segoeui.ttf"
    return ImageFont.truetype(f"C:/Windows/Fonts/{name}", size)


def wrap(draw, text, fnt, width):
    lines = []
    for paragraph in str(text).split("\n"):
        words = paragraph.split()
        if not words:
            lines.append("")
            continue
        current = words[0]
        for word in words[1:]:
            trial = f"{current} {word}"
            if draw.textlength(trial, font=fnt) <= width:
                current = trial
            else:
                lines.append(current)
                current = word
        lines.append(current)
    return lines


def draw_steps(title: str, subtitle: str, steps: list[tuple[tuple[int, int, int], str, str]]) -> bytes:
    body = font(17)
    small = font(14)
    title_f = font(24, True)
    head_f = font(17, True)
    role_f = font(13, True)
    probe = ImageDraw.Draw(Image.new("RGB", (10, 10)))
    box_w = W - PAD * 2
    role_w = 168
    inner = box_w - role_w - 40

    heights = []
    for _color, heading, detail in steps:
        h_lines = wrap(probe, heading, head_f, inner)
        d_lines = wrap(probe, detail, body, inner)
        heights.append(22 + len(h_lines) * 22 + 6 + len(d_lines) * 22 + 16)

    height = 96 + sum(heights) + 14 * (len(steps) - 1) + 28
    image = Image.new("RGB", (W, height), PAGE)
    draw = ImageDraw.Draw(image)
    draw.text((PAD, 20), title, font=title_f, fill=NAVY)
    for i, line in enumerate(wrap(draw, subtitle, small, W - PAD * 2)):
        draw.text((PAD, 54 + i * 18), line, font=small, fill=MUTED)

    y = 96
    centres = []
    for (color, heading, detail), h in zip(steps, heights):
        x0, y0 = PAD, y
        x1, y1 = PAD + box_w, y + h
        draw.rounded_rectangle([x0, y0, x1, y1], radius=10, fill=WHITE, outline=LINE, width=1)
        draw.rounded_rectangle([x0, y0, x0 + role_w, y1], radius=10, fill=color)
        # cover right side of role pill so only left is colored
        draw.rectangle([x0 + role_w - 12, y0 + 1, x0 + role_w, y1 - 1], fill=color)

        role_label = {
            MC: "Coordinator\n/ Admin",
            SV: "Supervisor",
            OP: "Operator",
            SYS: "System",
        }.get(color, "Role")
        ry = y0 + 12
        for rl in role_label.split("\n"):
            draw.text((x0 + 12, ry), rl, font=role_f, fill=WHITE)
            ry += 18

        tx = x0 + role_w + 16
        ty = y0 + 10
        for line in wrap(draw, heading, head_f, inner):
            draw.text((tx, ty), line, font=head_f, fill=NAVY)
            ty += 22
        ty += 4
        for line in wrap(draw, detail, body, inner):
            draw.text((tx, ty), line, font=body, fill=MUTED)
            ty += 22

        centres.append((x0 + box_w // 2, y1))
        y = y1 + 14

    for i in range(len(centres) - 1):
        cx, cy = centres[i]
        nx, ny = centres[i + 1][0], centres[i + 1][1] - heights[i + 1]
        # arrow between boxes — centres[i] is bottom of box i; next top is y of next
        top_next = cy + 0  # already at bottom; gap is 14
        # redraw simple chevron in the gap
        mid = cy + 7
        draw.line([(cx, cy - 2), (cx, mid + 4)], fill=LINE, width=2)

    buf = BytesIO()
    image.save(buf, format="PNG")
    return buf.getvalue()


GLOSSARY = [
    ("Sale order / Project", "The customer order (for example GSP2405105). Manufacturing coordinators only see orders assigned to them."),
    ("Part", "One item on the sale order, with a quantity (how many units to make)."),
    ("Unit", "One piece of that part. Unit-wise planning schedules each piece; batch planning schedules the whole quantity together."),
    ("Activate part", "Release an in-house part so it can be scheduled. Needs process plan and readiness checks. This comes first."),
    ("Priority", "Run order of active parts. Assigned when the part is activated (earlier activation gets the next number). 1 runs before 2. Priority 0 means completed and stays out of new plans. Coordinators can later swap priorities if needed."),
    ("Shop floor plan", "Factory-wide switch: Batch or Unit-wise. Only admin or manufacturing coordinator can change it. Switching does not build a schedule by itself."),
    ("Batch", "Live job cards come from the live (actual) schedule. Use Planned Update for the baseline and Actual Update for live cards."),
    ("Unit-wise", "Live job cards come from the unit schedule. Use Unit Scheduling Update after the shop plan is Unit-wise."),
    ("Planned schedule", "Baseline Gantt for batch planning. Completed parts are not put back here."),
    ("Actual / live schedule", "What operators use on batch. Refreshes after reviews (background) or when someone presses Update Actual Schedule."),
    ("Unit schedule", "What operators use on unit-wise. Built only when Unit Scheduling Update runs while the shop plan is Unit-wise."),
    ("Job card", "The operator’s work ticket on a machine. You see either batch cards or unit-wise cards — never both at once."),
    ("Activate job card", "Start work on that card. Opens a production log. Blocked for the same job if a log still waits for review, if quantity is not released yet, if the machine is down, or if the operator is on leave."),
    ("Production log", "What the operator submitted (produced / rework). A supervisor or manufacturing coordinator must review it."),
    ("Review", "Approve, rework, or reject the log. The save confirmation toast is for the review only — not for the background reschedule."),
    ("Released quantity", "Approved quantity from the previous operation that unlocks the next operation."),
    ("Shift hours", "Working windows for a day (GENERAL, and NEXT for overtime)."),
    ("Machine–operator assignment", "On overtime days, pin which operator covers which machine. That operator is notified."),
]


def set_run_font(run, size=11, bold=False, color=None):
    run.font.size = Pt(size)
    run.font.bold = bold
    run.font.name = "Calibri"
    run._element.rPr.rFonts.set(qn("w:eastAsia"), "Calibri")
    if color:
        run.font.color.rgb = RGBColor(*color)


def add_heading(doc, text, level=1):
    p = doc.add_heading(text, level=level)
    return p


def add_para(doc, text, *, bold=False, size=11):
    p = doc.add_paragraph()
    run = p.add_run(text)
    set_run_font(run, size=size, bold=bold)
    p.paragraph_format.space_after = Pt(8)
    return p


def add_bullets(doc, items):
    for item in items:
        p = doc.add_paragraph(item, style="List Bullet")
        for run in p.runs:
            set_run_font(run, size=11)


def add_image_bytes(doc, png: bytes, width=6.3):
    stream = BytesIO(png)
    doc.add_picture(stream, width=Inches(width))
    last = doc.paragraphs[-1]
    last.alignment = WD_ALIGN_PARAGRAPH.CENTER


def build():
    doc = Document()

    title = doc.add_paragraph()
    title.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = title.add_run("CMF Production Planning & Scheduling")
    set_run_font(r, size=22, bold=True, color=(15, 23, 42))

    sub = doc.add_paragraph()
    sub.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = sub.add_run("Role-based user manual\nOperator · Manufacturing coordinator · Supervisor")
    set_run_font(r, size=12, color=(100, 116, 139))

    add_para(
        doc,
        "This guide walks you through the application in plain English. "
        "Use the matching Mermaid diagrams in backend/mermaids/user-manual/ "
        "when you want an interactive flowchart (open the .mmd in Mermaid Live or view-role-user-manuals.html).",
    )

    add_heading(doc, "1. Words you will see", level=1)
    add_para(doc, "Read this once. The diagrams use the same words.")
    for term, meaning in GLOSSARY:
        p = doc.add_paragraph()
        rt = p.add_run(f"{term}. ")
        set_run_font(rt, bold=True, size=11)
        rm = p.add_run(meaning)
        set_run_font(rm, size=11)
        p.paragraph_format.space_after = Pt(4)

    add_heading(doc, "2. Big picture — from active part to completed part", level=1)
    add_para(
        doc,
        "Everyone should understand this loop. Details for each role come in the next sections. "
        "Mermaid file: 01-consolidated-pps-workflow.mmd",
    )
    add_image_bytes(
        doc,
        draw_steps(
            "Consolidated PPS flow",
            "Activate parts → priority from activation time → choose shop plan → publish schedule → run job cards → review → close part",
            [
                (MC, "1. Activate parts", "Activate in-house parts that are ready. Priority is assigned from activation time."),
                (MC, "2. Choose shop plan", "Batch or Unit-wise for the whole factory. Switching alone does not schedule."),
                (SV, "3. Prepare the plant", "Shifts, machine available/breakdown, leave, OT assignments."),
                (MC, "4. Publish the live schedule", "Batch: Planned then Actual. Unit-wise: Unit Scheduling Update."),
                (OP, "5. Select and activate the job card", "Only the live plan’s cards appear. Activate when allowed."),
                (OP, "6. Submit the production log", "Enter produced and rework quantities."),
                (SV, "7. Review the log", "Supervisor or coordinator approves, reworks, or rejects."),
                (SYS, "8. Refresh and close", "Live schedule refreshes in the background. Fully approved parts close (priority 0)."),
            ],
        ),
    )
    add_bullets(
        doc,
        [
            "Operators never see batch and unit-wise cards together.",
            "If the Gantt looks stale after a review, the coordinator presses Update Actual Schedule.",
            "A completed part (priority 0) does not return on the next planned update.",
        ],
    )

    add_heading(doc, "3. Manufacturing coordinator — fill your shoes", level=1)
    add_para(doc, "Mermaid file: 02-manufacturing-coordinator-workflow.mmd")
    add_para(
        doc,
        "You own release and the live shop plan for the factory. You only manage your assigned sale orders "
        "(for example Bharath does not see Vignesh’s orders on Unit Scheduling).",
        bold=False,
    )
    add_image_bytes(
        doc,
        draw_steps(
            "Manufacturing coordinator",
            "Priority → activate → shop plan → schedule update → review when needed",
            [
                (MC, "Open my PPS / OMS", "Only my assigned orders and parts."),
                (MC, "Activate parts, then priority follows", "Activation assigns priority from activation time. Earlier activation runs first. Skip completed parts."),
                (MC, "Set shop floor plan", "Batch or Unit-wise. Confirm Yes. Schedules are not rewritten yet."),
                (MC, "If Batch: Update Planned, then Actual", "Planned = baseline. Actual = live job cards."),
                (MC, "If Unit-wise: Unit Scheduling Update", "Update stays locked while the plan is still Batch."),
                (MC, "After floor work", "Review logs if needed. Background reschedule usually runs. Press Actual Update only if bars stay wrong."),
            ],
        ),
    )
    add_heading(doc, "Success checklist", level=2)
    add_bullets(
        doc,
        [
            "Parts I want on the floor are activated; priority follows activation time (swap later only if needed).",
            "Shop plan matches how I want operators to work today.",
            "I pressed the matching Update after switching the plan.",
            "Operators report seeing cards for that plan only.",
            "If Actual Gantt is wrong after reviews, I press Update Actual Schedule once — I do not delete rows by hand.",
        ],
    )
    add_heading(doc, "Common confusion", level=2)
    add_bullets(
        doc,
        [
            "Switching to Unit-wise without Unit Update → empty or old unit cards.",
            "Saving assignment modes while still on Batch → rejected; switch plan first.",
            "Two coordinators can both change the shop plan; last successful save wins for the whole factory.",
        ],
    )

    add_heading(doc, "4. Supervisor — fill your shoes", level=1)
    add_para(doc, "Mermaid file: 03-supervisor-workflow.mmd")
    add_para(
        doc,
        "You keep the plant runnable and you review what operators submitted. "
        "You do not switch the shop plan and you do not run Planned / Unit schedule Update.",
    )
    add_image_bytes(
        doc,
        draw_steps(
            "Supervisor",
            "Prepare plant → wait for submissions → review → let the system refresh",
            [
                (SV, "Set shifts and working days", "Add overtime (NEXT) when the day needs it."),
                (SV, "Machines and leave", "Available or breakdown with return time. Record acknowledged leave."),
                (SV, "OT assignment", "Assign operators to machines for that day. They get a notification."),
                (OP, "Operators run cards", "You wait for submitted logs."),
                (SV, "Review each log", "Approve, rework, or reject. Trust the save toast — that is the review."),
                (SYS, "Automatic follow-up", "Live schedule refreshes in the background. Fully approved parts close."),
                (MC, "If Gantt is still stale", "Ask the coordinator to press Update Actual Schedule."),
            ],
        ),
    )
    add_heading(doc, "Success checklist", level=2)
    add_bullets(
        doc,
        [
            "Today’s calendar and shift hours are saved before the shift starts.",
            "Broken machines are marked with a return window.",
            "OT operators were assigned and notified.",
            "Every submitted log is reviewed promptly so the next job can unlock.",
        ],
    )

    add_heading(doc, "5. Operator — fill your shoes", level=1)
    add_para(doc, "Mermaid file: 04-operator-workflow.mmd")
    add_para(
        doc,
        "You pick your machine, open the job cards for the live shop plan, activate when allowed, "
        "do the work, and submit the log. You do not choose Batch vs Unit-wise — the shop plan decides that.",
    )
    add_image_bytes(
        doc,
        draw_steps(
            "Operator",
            "Machine → Select Job → activate → submit → wait for review",
            [
                (OP, "Select my machine", "Also check notifications for OT / assignment."),
                (OP, "Open Select Job", "I see either batch cards or unit-wise cards — not both."),
                (OP, "Choose a card", "Activate only when the card is allowed."),
                (OP, "If blocked", "Same job still unreviewed, no released quantity, machine down, or I am on leave."),
                (OP, "Activate and run", "Do setup / machining for that card."),
                (OP, "Submit the log", "Produced quantity and rework if any. Then wait for review."),
                (SYS, "After review", "Approved quantity unlocks the next work. Same pending job stays blocked until reviewed."),
            ],
        ),
    )
    add_heading(doc, "Success checklist", level=2)
    add_bullets(
        doc,
        [
            "Correct machine selected before Select Job.",
            "I am working the card that matches today’s shop plan.",
            "I activate only when the card is green / allowed.",
            "I submit honest quantities and wait for review before re-activating the same job.",
            "A different job on the same machine is not stuck behind another job’s pending review.",
        ],
    )

    add_heading(doc, "6. When the plan switches", level=1)
    add_bullets(
        doc,
        [
            "All work still pending, Batch → Unit-wise + Unit Update → operators get unit-wise cards only. Batch cards lock.",
            "Unit-wise → Batch + Actual/planned path → operators get batch cards only. Unit cards lock.",
            "Open in-progress work can block switching until that engine’s open card is cleared.",
            "Old rows may still exist in the database; operators only see the live engine’s list.",
        ],
    )

    add_heading(doc, "7. Where the diagram files live", level=1)
    add_para(doc, str(MMD_DIR))
    add_bullets(
        doc,
        [
            "01-consolidated-pps-workflow.mmd",
            "02-manufacturing-coordinator-workflow.mmd",
            "03-supervisor-workflow.mmd",
            "04-operator-workflow.mmd",
            "README.md — how to open and read the diagrams",
            "view-role-user-manuals.html — browser preview",
        ],
    )

    add_heading(doc, "8. One-page “who does what”", level=1)
    table = doc.add_table(rows=5, cols=2)
    table.style = "Table Grid"
    rows = [
        ("Role", "Main actions in PPS"),
        ("Manufacturing coordinator / Admin", "Priority, activate parts, shop plan, Planned / Actual / Unit Update, optional log review"),
        ("Supervisor", "Shifts, machines, leave, OT assignment, production-log review"),
        ("Operator", "Select machine, select job card, activate, submit log"),
        ("System", "Background live reschedule after review; auto-close fully approved parts"),
    ]
    for i, (a, b) in enumerate(rows):
        table.rows[i].cells[0].text = a
        table.rows[i].cells[1].text = b

    doc.save(OUT)
    print(f"Wrote {OUT}")
    print(f"Mermaid sources: {MMD_DIR}")


if __name__ == "__main__":
    build()

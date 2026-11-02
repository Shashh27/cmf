"""Generate PROJECT_WORKFLOW.docx — illustrated CMF project workflow."""

from io import BytesIO
from pathlib import Path

from docx import Document
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.shared import Inches, Pt, RGBColor
from PIL import Image, ImageDraw, ImageFont

W = 1400
PAD = 36
BOX_W = W - PAD * 2
ROLE_W = 250
GAP = 18

NAVY = (15, 23, 42)
SLATE = (51, 65, 85)
MUTED = (100, 116, 139)
LINE = (203, 213, 225)
WHITE = (255, 255, 255)
PAGE = (248, 250, 252)

ROLES = {
    "Project coordinator": (15, 118, 110),
    "Admin or manufacturing coordinator": (29, 78, 216),
    "Supervisor": (180, 83, 9),
    "Operator": (109, 40, 217),
    "System": (51, 65, 85),
}


def font(size: int, bold: bool = False):
    name = "segoeuib.ttf" if bold else "segoeui.ttf"
    return ImageFont.truetype(f"C:/Windows/Fonts/{name}", size)


def wrap(draw, text, fnt, width):
    lines = []
    for paragraph in text.split("\n"):
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


def draw_flow():
    body = font(20)
    small = font(16)
    title_f = font(28, True)
    role_f = font(16, True)
    probe = ImageDraw.Draw(Image.new("RGB", (10, 10)))

    steps = [
        ("Project coordinator", "1  Open the project", "Create the project and its process plan: operations, work centres, and machines."),
        ("Admin or manufacturing coordinator", "2  Release parts", "Set part priority, then activate the in-house parts that are ready to run."),
        ("Admin or manufacturing coordinator", "3  Choose the shop plan", "Batch plans whole operations. Unit-wise plans each unit. This choice decides the next update."),
        ("Admin or manufacturing coordinator", "4  Update the planned schedule", "Builds the baseline. A part already completed, priority 0, is not scheduled."),
        ("Admin or manufacturing coordinator", "5  Unit schedule, only if unit-wise", "Skip this step when the shop plan is batch."),
        ("Supervisor", "6  Prepare the floor", "Machines on or off, shift hours, and acknowledged operator leave."),
        ("Operator", "7  Select the job card", "The card is the live operation on that machine."),
        ("Operator", "8  Start only if the card is open", "Blocked when this same job is still unreviewed, no quantity is released, the machine is down, or the operator is on leave. A different job on the same machine is not blocked by that review."),
        ("Operator", "9  Activate and submit", "Activation opens the log. Submit sends produced and rework quantities to the reviewer."),
        ("Supervisor", "10  Review the log", "A supervisor or a manufacturing coordinator approves, sends rework, or rejects. The toast is for this save, not for the reschedule."),
        ("System", "11  Close the part when every operation is approved", "Priority becomes 0 and the part schedule status becomes completed. The next planned update leaves this part out."),
        ("System", "12  Live reschedule runs in the background", "The review starts a thread that rewrites rescheduling items. There is no toast when that thread finishes."),
        ("Admin or manufacturing coordinator", "13  Update Actual Schedule only if the bars are stale", "Same live reschedule, started by hand. Use it when the background thread did not finish. It does show Schedule updated."),
    ]

    heights = []
    inner = BOX_W - ROLE_W - 48
    for _role, heading, detail in steps:
        h_lines = wrap(probe, heading, font(20, True), inner)
        d_lines = wrap(probe, detail, body, inner)
        heights.append(28 + len(h_lines) * 26 + 8 + len(d_lines) * 26 + 20)

    height = 110 + sum(heights) + GAP * (len(steps) - 1) + 40
    image = Image.new("RGB", (W, height), PAGE)
    draw = ImageDraw.Draw(image)
    draw.text((PAD, 28), "CMF project workflow", font=title_f, fill=NAVY)
    draw.text(
        (PAD, 68),
        "From an open project to a completed part. Colour is the person who acts.",
        font=small,
        fill=MUTED,
    )

    y = 110
    centres = []
    for (role, heading, detail), box_h in zip(steps, heights):
        colour = ROLES[role]
        x = PAD
        draw.rounded_rectangle((x, y, x + BOX_W, y + box_h), radius=10, fill=WHITE, outline=LINE, width=2)
        draw.rounded_rectangle((x, y, x + ROLE_W, y + box_h), radius=10, fill=colour)
        draw.rectangle((x + ROLE_W - 12, y, x + ROLE_W, y + box_h), fill=colour)
        role_lines = wrap(probe, role, role_f, ROLE_W - 28)
        role_h = len(role_lines) * 22
        ry = y + (box_h - role_h) / 2
        for line in role_lines:
            draw.text((x + 16, ry), line, font=role_f, fill=WHITE)
            ry += 22
        tx = x + ROLE_W + 20
        hy = y + 14
        for line in wrap(probe, heading, font(20, True), inner):
            draw.text((tx, hy), line, font=font(20, True), fill=NAVY)
            hy += 26
        hy += 4
        for line in wrap(probe, detail, body, inner):
            draw.text((tx, hy), line, font=body, fill=SLATE)
            hy += 26
        centres.append(y + box_h)
        y += box_h + GAP

    for top in centres[:-1]:
        cx = PAD + 18
        y1 = top
        y2 = top + GAP
        draw.line((cx, y1, cx, y2 - 6), fill=SLATE, width=2)
        draw.polygon([(cx - 5, y2 - 8), (cx + 5, y2 - 8), (cx, y2)], fill=SLATE)

    stream = BytesIO()
    image.save(stream, format="PNG")
    stream.seek(0)
    return stream


def shade(cell, hex_colour: str):
    from docx.oxml import OxmlElement
    from docx.oxml.ns import qn

    tc = cell._tePr if hasattr(cell, "_tePr") else cell._tc
    tc_pr = tc.get_or_add_tcPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:fill"), hex_colour)
    shd.set(qn("w:val"), "clear")
    tc_pr.append(shd)


def main() -> None:
    doc = Document()
    normal = doc.styles["Normal"]
    normal.font.name = "Calibri"
    normal.font.size = Pt(11)

    title = doc.add_paragraph()
    run = title.add_run("CMF project workflow")
    run.bold = True
    run.font.size = Pt(22)
    run.font.color.rgb = RGBColor(15, 23, 42)

    intro = doc.add_paragraph(
        "How one project moves from process plan to a completed part. "
        "Admin and the manufacturing coordinator plan the work. "
        "The project coordinator owns the project and the process plan. "
        "The supervisor prepares the floor and reviews logs. "
        "The operator runs the job card."
    )
    intro.paragraph_format.space_after = Pt(8)

    picture = doc.add_paragraph()
    picture.alignment = WD_ALIGN_PARAGRAPH.CENTER
    picture.add_run().add_picture(draw_flow(), width=Inches(6.9))
    caption = doc.add_paragraph("Figure 1. Project workflow by role.")
    caption.alignment = WD_ALIGN_PARAGRAPH.CENTER
    for r in caption.runs:
        r.italic = True
        r.font.size = Pt(10)
        r.font.color.rgb = RGBColor(100, 116, 139)

    doc.add_heading("Who does what", level=1)
    rows = [
        ("Project coordinator", "Opens the project and maintains the process plan. Does not run schedule updates."),
        ("Admin or manufacturing coordinator", "Sets priority, activates parts, chooses batch or unit-wise, and updates the planned schedule. Updates the actual schedule only when the live bars are stale."),
        ("Supervisor", "Sets machine availability, shifts, and leave. Reviews production logs. A manufacturing coordinator can review logs too."),
        ("Operator", "Selects the job card, activates it when the checks pass, and submits the log."),
        ("System", "Closes a fully approved part and starts the live reschedule after a review. That thread does not show a toast."),
    ]
    table = doc.add_table(rows=1 + len(rows), cols=2)
    table.style = "Table Grid"
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    headers = ("Role", "In this workflow")
    for i, header in enumerate(headers):
        cell = table.rows[0].cells[i]
        cell.text = header
        shade(cell, "0F172A")
        for p in cell.paragraphs:
            for run in p.runs:
                run.bold = True
                run.font.color.rgb = RGBColor(255, 255, 255)
                run.font.size = Pt(11)
    for index, (role, duty) in enumerate(rows):
        table.rows[index + 1].cells[0].text = role
        table.rows[index + 1].cells[1].text = duty

    doc.add_heading("How a review updates the live plan", level=1)
    for text in (
        "Saving a review as completed, in progress, rework, or rejected returns at once. The toast is Quantities updated successfully, or Review saved — part order is complete when nothing is left to approve.",
        "That same save starts a background thread. The thread rewrites rescheduling items. It does not toast when it finishes.",
        "Press Update Actual Schedule only when those live bars are still the old ones. That button runs the same reschedule and toasts Schedule updated when the request finishes.",
        "Update on the planned schedule is a different run. It builds a new baseline. A part with priority 0 and status completed is not put back on that baseline.",
    ):
        doc.add_paragraph(text, style="List Bullet")

    doc.add_heading("When a job card can start", level=1)
    for text in (
        "This same job still has a log in progress, or a submitted log the reviewer has not updated.",
        "The previous schedulable operation has not released at least one approved unit.",
        "The machine is down.",
        "The operator has acknowledged leave today.",
        "The operation is already fully approved.",
    ):
        doc.add_paragraph(text, style="List Bullet")
    note = doc.add_paragraph(
        "An unreviewed log blocks only that job. Another operation on the same machine can still be activated."
    )
    note.runs[0].italic = True

    out = Path(__file__).resolve().parent / "PROJECT_WORKFLOW.docx"
    doc.save(out)
    print(out)


if __name__ == "__main__":
    main()

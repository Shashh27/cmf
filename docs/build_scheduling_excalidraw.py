#!/usr/bin/env python3
"""Generate a clean, grid-aligned Excalidraw scheduling architecture diagram."""

import json
import random
import string
from pathlib import Path

OUT = Path(__file__).resolve().parent / "scheduling-architecture-roles.excalidraw"


def uid() -> str:
    return "".join(random.choices(string.ascii_lowercase + string.digits, k=12))


class B:
    def __init__(self):
        self.elements: list[dict] = []
        self._seed = 1000

    def _s(self) -> int:
        self._seed += 1
        return self._seed

    def frame(self, x, y, w, h, name: str) -> str:
        fid = uid()
        self.elements.append(
            {
                "id": fid,
                "type": "frame",
                "x": x,
                "y": y,
                "width": w,
                "height": h,
                "angle": 0,
                "strokeColor": "#94a3b8",
                "backgroundColor": "transparent",
                "fillStyle": "solid",
                "strokeWidth": 1,
                "strokeStyle": "solid",
                "roughness": 0,
                "opacity": 100,
                "groupIds": [],
                "frameId": None,
                "roundness": None,
                "seed": self._s(),
                "version": 1,
                "versionNonce": self._s(),
                "isDeleted": False,
                "boundElements": [],
                "updated": 1,
                "link": None,
                "locked": False,
                "name": name,
                "children": [],
            }
        )
        return fid

    def rect(
        self,
        x,
        y,
        w,
        h,
        bg: str,
        label: str,
        *,
        fs: int = 15,
        stroke: str = "#334155",
        align: str = "center",
    ) -> str:
        rid, tid = uid(), uid()
        self.elements.append(
            {
                "id": rid,
                "type": "rectangle",
                "x": x,
                "y": y,
                "width": w,
                "height": h,
                "angle": 0,
                "strokeColor": stroke,
                "backgroundColor": bg,
                "fillStyle": "solid",
                "strokeWidth": 2,
                "strokeStyle": "solid",
                "roughness": 0,
                "opacity": 100,
                "groupIds": [],
                "frameId": None,
                "roundness": {"type": 3},
                "seed": self._s(),
                "version": 1,
                "versionNonce": self._s(),
                "isDeleted": False,
                "boundElements": [{"type": "text", "id": tid}],
                "updated": 1,
                "link": None,
                "locked": False,
            }
        )
        lines = label.count("\n") + 1
        ty = y + (h - lines * fs * 1.3) / 2
        self.elements.append(
            {
                "id": tid,
                "type": "text",
                "x": x + 12,
                "y": ty,
                "width": w - 24,
                "height": h,
                "angle": 0,
                "strokeColor": "#0f172a",
                "backgroundColor": "transparent",
                "fillStyle": "solid",
                "strokeWidth": 1,
                "strokeStyle": "solid",
                "roughness": 0,
                "opacity": 100,
                "groupIds": [],
                "frameId": None,
                "roundness": None,
                "seed": self._s(),
                "version": 1,
                "versionNonce": self._s(),
                "isDeleted": False,
                "boundElements": [],
                "updated": 1,
                "link": None,
                "locked": False,
                "text": label,
                "fontSize": fs,
                "fontFamily": 2,
                "textAlign": align,
                "verticalAlign": "middle",
                "containerId": rid,
                "originalText": label,
                "lineHeight": 1.3,
            }
        )
        return rid

    def label(self, x, y, text: str, *, fs: int = 14, color: str = "#475569", w: int = 400) -> None:
        tid = uid()
        self.elements.append(
            {
                "id": tid,
                "type": "text",
                "x": x,
                "y": y,
                "width": w,
                "height": fs * 2,
                "angle": 0,
                "strokeColor": color,
                "backgroundColor": "transparent",
                "fillStyle": "solid",
                "strokeWidth": 1,
                "strokeStyle": "solid",
                "roughness": 0,
                "opacity": 100,
                "groupIds": [],
                "frameId": None,
                "roundness": None,
                "seed": self._s(),
                "version": 1,
                "versionNonce": self._s(),
                "isDeleted": False,
                "boundElements": [],
                "updated": 1,
                "link": None,
                "locked": False,
                "text": text,
                "fontSize": fs,
                "fontFamily": 2,
                "textAlign": "left",
                "verticalAlign": "top",
                "containerId": None,
                "originalText": text,
                "lineHeight": 1.25,
            }
        )

    def arrow_h(self, x1, y1, x2, y2, start=None, end=None) -> None:
        w, h = x2 - x1, y2 - y1
        el = {
            "id": uid(),
            "type": "arrow",
            "x": x1,
            "y": y1,
            "width": w,
            "height": h,
            "angle": 0,
            "strokeColor": "#64748b",
            "backgroundColor": "transparent",
            "fillStyle": "solid",
            "strokeWidth": 2,
            "strokeStyle": "solid",
            "roughness": 0,
            "opacity": 100,
            "groupIds": [],
            "frameId": None,
            "roundness": {"type": 2},
            "seed": self._s(),
            "version": 1,
            "versionNonce": self._s(),
            "isDeleted": False,
            "boundElements": [],
            "updated": 1,
            "link": None,
            "locked": False,
            "points": [[0, 0], [w, h]],
            "lastCommittedPoint": None,
            "startArrowhead": None,
            "endArrowhead": "arrow",
        }
        if start:
            el["startBinding"] = {"elementId": start, "focus": 0, "gap": 6}
        if end:
            el["endBinding"] = {"elementId": end, "focus": 0, "gap": 6}
        self.elements.append(el)


def build() -> dict:
    b = B()
    M = 60
    W = 2200
    GAP = 28

    # ── Title ─────────────────────────────────────────────────────────
    b.label(
        M,
        24,
        "CMF Production Scheduling — End-to-End Architecture",
        fs=26,
        color="#1e3a8a",
        w=900,
    )
    b.label(
        M,
        58,
        "Roles · process phases · schedule layers · replan triggers · business guards",
        fs=14,
        color="#64748b",
        w=800,
    )

    # ── 1. USER ROLES (4 equal columns) ───────────────────────────────
    fy = 100
    fh = 340
    b.frame(M, fy, W, fh, "1 — User roles")

    col_w = (W - 3 * GAP) // 4
    roles = [
        (
            "#dbeafe",
            "#1d4ed8",
            "Administrator",
            "Shifts & calendar\nMachine ON / OFF\nOperator assignments\nActivate order & part\nGenerate baseline schedule\nAdmin exceptions",
        ),
        (
            "#ffedd5",
            "#c2410c",
            "Manufacturing Coordinator",
            "Part priority queue\nSimulate priority swap\nCommit swap (audited)\nApprove logs (OR supervisor)\nOne MC per sale order\nLive Gantt & capacity",
        ),
        (
            "#fef9c3",
            "#a16207",
            "Supervisor",
            "Approve logs (OR coordinator)\nApprove / rework / reject\nFirst reviewer wins\nShop-floor oversight\nBreakdown response",
        ),
        (
            "#dcfce7",
            "#15803d",
            "Operator",
            "View job card (live plan)\nStart job (if allowed)\nSubmit produced qty\nSubmit rework qty\nWait for review\nThen start next run",
        ),
    ]
    for i, (bg, stroke, title, body) in enumerate(roles):
        x = M + 20 + i * (col_w + GAP)
        b.rect(x, fy + 36, col_w, 48, bg, title, fs=17, stroke=stroke)
        b.rect(x, fy + 96, col_w, fh - 116, "#ffffff", body, fs=13, stroke="#cbd5e1", align="left")

    # ── 2. PROCESS PIPELINE ───────────────────────────────────────────
    py = fy + fh + 40
    ph = 130
    b.frame(M, py, W, ph + 50, "2 — End-to-end flow (inactive part → completed part)")

    n = 6
    pw = (W - 40 - (n - 1) * GAP) // n
    phases = [
        ("#f1f5f9", "#475569", "0", "Plant setup", "Shifts · machines · assignments"),
        ("#dbeafe", "#2563eb", "A", "Order ready", "Material · drawing · activate · priority"),
        ("#e0f2fe", "#0284c7", "B", "Create plan", "Baseline schedule · seed live plan"),
        ("#ffedd5", "#ea580c", "C", "Shop floor", "Job card · start · submit · review"),
        ("#dcfce7", "#16a34a", "D", "Live replan", "Recalculate times · update Gantt"),
        ("#f3e8ff", "#9333ea", "E", "Part done", "All ops approved · priority cleared"),
    ]
    pids = []
    for i, (bg, stroke, num, title, sub) in enumerate(phases):
        x = M + 20 + i * (pw + GAP)
        y = py + 40
        label = f"{num}  {title}\n\n{sub}"
        pids.append(b.rect(x, y, pw, ph, bg, label, fs=14, stroke=stroke))

    for i in range(n - 1):
        x1 = M + 20 + i * (pw + GAP) + pw
        x2 = M + 20 + (i + 1) * (pw + GAP)
        mid_y = py + 40 + ph // 2
        b.arrow_h(x1, mid_y, x2, mid_y, start=pids[i], end=pids[i + 1])

    # C ⇄ D feedback (clean loop below pipeline)
    loop_y = py + ph + 52
    b.label(M + 20 + 3 * (pw + GAP), loop_y, "↺ After review / replan → operator sees updated job card", fs=12, color="#16a34a", w=pw * 2)

    # ── 3. SCHEDULE LAYERS ────────────────────────────────────────────
    ly = py + ph + 90
    lh = 150
    b.frame(M, ly, W, lh + 44, "3 — Two schedule layers")

    half = (W - 40 - GAP) // 2
    b.rect(
        M + 20,
        ly + 40,
        half,
        lh,
        "#eff6ff",
        "Baseline plan\n(formal snapshot)\n\n• Last generated schedule\n• History & capacity reports\n• Used by: Admin, management\n• Changes only on full regenerate",
        fs=14,
        stroke="#3b82f6",
        align="left",
    )
    b.rect(
        M + 20 + half + GAP,
        ly + 40,
        half,
        lh,
        "#f0fdf4",
        "Live plan\n(shop-floor truth)\n\n• Job cards & dynamic Gantt\n• Used by: Operator, supervisor, MC\n• Updates on approval, breakdown,\n  priority swap, manual refresh",
        fs=14,
        stroke="#16a34a",
        align="left",
    )
    mid_x = M + 20 + half + GAP // 2
    b.arrow_h(mid_x - 30, ly + 40 + lh // 2, mid_x + half + GAP + 30, ly + 40 + lh // 2)
    b.label(mid_x - 20, ly + 40 + lh // 2 - 28, "copy at generate", fs=11, color="#64748b", w=120)

    # ── 4. TRIGGERS ───────────────────────────────────────────────────
    ty = ly + lh + 70
    th = 100
    b.frame(M, ty, W, th + 44, "4 — What triggers live replan")

    tw = (W - 40 - 3 * GAP) // 4
    triggers = [
        ("Production reviewed", "Approve · rework · reject"),
        ("Machine status", "OFF (breakdown) · back ON"),
        ("Priority swap", "Simulate → commit"),
        ("Manual refresh", "Planning screen action"),
    ]
    for i, (t, s) in enumerate(triggers):
        x = M + 20 + i * (tw + GAP)
        b.rect(x, ty + 40, tw, th, "#fffbeb", f"{t}\n\n{s}", fs=14, stroke="#d97706")

    # ── 5. GUARDS (3 cards) ───────────────────────────────────────────
    gy = ty + th + 70
    gh = 130
    b.frame(M, gy, W, gh + 44, "5 — Key guards & rules")

    gw = (W - 40 - 2 * GAP) // 3
    guards = [
        (
            "Job card start blocked",
            "Prior op not done\nLog awaiting reviewer\nMachine in breakdown\nBefore scheduled start\nOperator on leave\nOperation fully approved",
        ),
        (
            "Production log rules",
            "Submit → pending review\nSupervisor OR coordinator\n(one approves, not both)\nRework vs new manufacture\nseparate quantities\nAcknowledge optional",
        ),
        (
            "Part lifecycle guards",
            "MC sees own orders only\nDeactivate blocked if active\nCompleted part → priority 0\nRework: cycle only\nRemake: setup + cycle\nPartial work survives breakdown",
        ),
    ]
    for i, (title, body) in enumerate(guards):
        x = M + 20 + i * (gw + GAP)
        b.rect(x, gy + 40, gw, 36, "#f8fafc", title, fs=14, stroke="#64748b")
        b.rect(x, gy + 84, gw, gh - 44, "#ffffff", body, fs=12, stroke="#e2e8f0", align="left")

    # ── 6. ROLE → PHASE matrix ────────────────────────────────────────
    my = gy + gh + 70
    b.frame(M, my, W, 120, "6 — Who touches which phase")

    phase_cols = ["0", "A", "B", "C", "D", "E"]
    matrix_w = W - 200
    cell_w = matrix_w // 6
    role_names = ["Administrator", "Mfg Coordinator", "Supervisor", "Operator"]
    ownership = [
        ["●", "●", "●", "", "", ""],
        ["", "●", "", "●", "●", ""],
        ["", "", "", "●", "", ""],
        ["", "", "", "●", "", ""],
    ]
    b.label(M + 20, my + 36, "Role", fs=12, color="#64748b", w=160)
    for j, p in enumerate(phase_cols):
        b.label(M + 180 + j * cell_w, my + 36, p, fs=12, color="#64748b", w=cell_w)
    for i, rname in enumerate(role_names):
        ry = my + 56 + i * 16
        b.label(M + 20, ry, rname, fs=12, color="#0f172a", w=160)
        for j, mark in enumerate(ownership[i]):
            if mark:
                b.label(M + 180 + j * cell_w + 20, ry, "●", fs=12, color="#2563eb", w=30)

    # Legend bar
    b.rect(
        M,
        my + 140,
        W,
        44,
        "#f8fafc",
        "● = primary involvement   |   Docs: SCHEDULING_WORKFLOW_MANUFACTURING_GUIDE.md · scheduling-workflow-manufacturing.mmd",
        fs=12,
        stroke="#e2e8f0",
    )

    return {
        "type": "excalidraw",
        "version": 2,
        "source": "https://excalidraw.com",
        "elements": b.elements,
        "appState": {
            "gridSize": 20,
            "viewBackgroundColor": "#ffffff",
            "currentItemFontFamily": 2,
            "zoom": {"value": 0.55},
            "scrollX": -20,
            "scrollY": -10,
        },
        "files": {},
    }


if __name__ == "__main__":
    doc = build()
    OUT.write_text(json.dumps(doc, indent=2), encoding="utf-8")
    print(f"Wrote {OUT} ({len(doc['elements'])} elements)")

# CMF PPS — Eraser.io Block Diagram

Professional end-to-end **Production Planning & Scheduling** block diagram with user roles and PPS part completion.

## File

| File | Description |
|------|-------------|
| [`pps-scheduling-end-to-end.eraserdiagram`](./pps-scheduling-end-to-end.eraserdiagram) | Eraser BPMN swimlane diagram (diagram-as-code) |

## How to open in Eraser.io

### Option 1 — Eraser website (fastest)

1. Go to [https://app.eraser.io](https://app.eraser.io) and sign in (free account works).
2. Create a **New file** → add a **Diagram** element.
3. Choose **BPMN / Swimlane** (or paste DSL — Eraser detects type).
4. Open `pps-scheduling-end-to-end.eraserdiagram` in a text editor, **copy all content after the first line** (`bpmn-diagram`), or copy the **entire file**.
5. In Eraser, switch to **code / diagram-as-code** view and paste.
6. Export: **File → Export → PNG / PDF / SVG**.

### Option 2 — VS Code / Cursor extension

1. Install **Eraser Diagrams** extension (`EraserLabs.eraserlabs`).
2. Open `pps-scheduling-end-to-end.eraserdiagram`.
3. Preview renders automatically; click **Edit** to change DSL.

### Option 3 — Import file into Eraser

1. In Eraser: **Import** or drag the `.eraserdiagram` file into a workspace.
2. If import is not available, paste the DSL from the file into a new BPMN diagram.

## What the diagram shows

| Swimlane | Responsibility |
|----------|----------------|
| **Administrator** | Shifts, machines, breakdowns, order/part activation, baseline schedule |
| **Manufacturing Coordinator** | Part priority, swap, approve logs, **own orders only** |
| **PPS Scheduling Engine** | Live plan, guards, dynamic reschedule, **part completed status** |
| **Operator** | Job card, start/submit, wait for review |
| **Supervisor** | Approve / rework / reject (exclusive with coordinator) |

### End-to-end phases covered

1. **Plant config** — shifts, machines, operator assignments  
2. **Order ready** — activate order & parts, material + drawing check, priority  
3. **Baseline + live plan** — generate schedule, seed job cards  
4. **Shop floor** — activate → produce → submit → review  
5. **Dynamic replan** — rework/remake split, breakdown, priority swap  
6. **Part completed in PPS** — all ops approved → status completed → priority cleared  

## Edit the diagram

Change the `.eraserdiagram` file and refresh preview. Syntax: [Eraser BPMN docs](https://docs.eraser.io/docs/syntax-4.md).

## Related docs

- [README.md](./README.md) — doc index
- [SCHEDULING_WORKFLOW_MANUFACTURING_GUIDE.md](./SCHEDULING_WORKFLOW_MANUFACTURING_GUIDE.md)
- [scheduling-architecture-roles.excalidraw](./scheduling-architecture-roles.excalidraw)

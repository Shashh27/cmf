"""End-to-end smoke test for machine assignment notifications."""
import json
import sys
import urllib.error
import urllib.request
from datetime import date, timedelta

BASE = "http://127.0.0.1:8989/api/v1"


def request(method, path, body=None):
    url = f"{BASE}{path}"
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(
        url,
        data=data,
        method=method,
        headers={"Content-Type": "application/json"} if body is not None else {},
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            raw = resp.read().decode()
            return resp.status, json.loads(raw) if raw else None
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        try:
            payload = json.loads(raw)
        except Exception:
            payload = raw
        return e.code, payload


def show(label, method, path, status, body):
    print(f"\n--- {label} ---")
    print(f"  {method} {BASE}{path}")
    print(f"  Status: {status}")
    print(f"  Body: {json.dumps(body, indent=2, default=str)[:1200]}")


def main():
    status, operators = request("GET", "/shift-hours/operators")
    show("1. Operators", "GET", "/shift-hours/operators", status, operators)
    if status != 200 or not operators:
        print("Server not ready or no operators.")
        sys.exit(1)

    operator_id = operators[0]["id"]
    print(f"  Using operator: {operators[0].get('user_name')} (id={operator_id})")

    status, machines = request("GET", "/machines/")
    show("2. Machines", "GET", "/machines/", status, machines)
    if status != 200 or not machines:
        sys.exit(1)
    machine_id = machines[0]["id"]

    year = date.today().year
    status, configs = request("GET", f"/shift-hours/?year={year}")
    show("3. Shift configs", "GET", f"/shift-hours/?year={year}", status, configs)

    shift_config = None
    cutoff = str(date.today() + timedelta(days=7))
    for c in configs or []:
        if c.get("working_day") and str(c.get("date", "")) >= cutoff:
            shift_config = c
            break
    if not shift_config and configs:
        shift_config = configs[-1]
    if not shift_config:
        d = (date.today() + timedelta(days=14)).isoformat()
        status, shift_config = request(
            "POST",
            "/shift-hours/",
            {"date": d, "working_day": True, "selected_shifts": ["GENERAL"]},
        )
        show("3b. Create shift config", "POST", "/shift-hours/", status, shift_config)
        if status != 200:
            sys.exit(1)

    shift_config_id = shift_config["id"]
    print(f"  shift_config_id={shift_config_id} date={shift_config['date']}")

    status, before = request("GET", f"/notifications/operator/{operator_id}/unread-count")
    show("4. Unread count (before)", "GET", f"/notifications/operator/{operator_id}/unread-count", status, before)

    status, existing = request("GET", f"/shift-hours/assignments/{shift_config_id}")
    assignment = next(
        (a for a in (existing or []) if a["operator_id"] == operator_id and a["machine_id"] == machine_id),
        None,
    )

    created = False
    if assignment:
        assignment_id = assignment["id"]
        print(f"\n  Existing assignment id={assignment_id} — skipping create")
    else:
        status, body = request(
            "POST",
            f"/shift-hours/machine/{machine_id}/operator/{operator_id}/shifts",
            {
                "machine_id": machine_id,
                "operator_id": operator_id,
                "shift_config_id": shift_config_id,
                "assigned_by_id": 16,
            },
        )
        show("5. Create assignment", "POST", f"/shift-hours/machine/{machine_id}/operator/{operator_id}/shifts", status, body)
        if status != 200:
            sys.exit(1)
        assignment_id = body["id"]
        created = True

    status, notifs = request("GET", f"/notifications/operator/{operator_id}")
    show("6. Notifications", "GET", f"/notifications/operator/{operator_id}", status, notifs)

    status, after = request("GET", f"/notifications/operator/{operator_id}/unread-count")
    show("7. Unread count (after)", "GET", f"/notifications/operator/{operator_id}/unread-count", status, after)

    if created:
        if notifs and notifs[0].get("action") == "assigned":
            print("\nPASS: assigned notification created")
        else:
            print("\nFAIL: expected assigned notification")

    if len(machines) > 1:
        alt_id = machines[1]["id"]
        if alt_id != machine_id:
            status, upd = request(
                "PUT",
                f"/shift-hours/machine/{machine_id}/operator/{operator_id}/shifts/{assignment_id}",
                {"machine_id": alt_id, "assigned_by_id": 16},
            )
            show("8. Update machine", "PUT", f"/shift-hours/.../shifts/{assignment_id}", status, upd)
            status, notifs2 = request("GET", f"/notifications/operator/{operator_id}")
            show("9. Notifications after update", "GET", f"/notifications/operator/{operator_id}", status, notifs2)
            if notifs2 and notifs2[0].get("action") == "updated":
                print("\nPASS: updated notification created")
            machine_id = alt_id

    if notifs:
        nid = notifs[0]["id"]
        status, read = request("PATCH", f"/notifications/{nid}/read", {"is_read": True})
        show("10. Mark read", "PATCH", f"/notifications/{nid}/read", status, read)

    print("\n=== API flow test complete ===")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""
Introspect the live PostgreSQL database and print/cache schema info for the chatbot.

Usage (from backend/):
    python scripts/build_chatbot_schema.py
    python scripts/build_chatbot_schema.py --write-cache
"""

import argparse
import json
import sys
from pathlib import Path

# Allow running from backend/
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from DB.schemas.chatbot import SchemaService  # noqa: E402
from chatbot.schema_knowledge import RELEVANT_SCHEMAS, STATIC_SCHEMA_CONTEXT  # noqa: E402


def main():
    parser = argparse.ArgumentParser(description="Build chatbot schema snapshot from live DB")
    parser.add_argument(
        "--write-cache",
        action="store_true",
        help="Write JSON snapshot to backend/chatbot/schema_snapshot.json",
    )
    args = parser.parse_args()

    SchemaService.refresh_cache()
    schema = SchemaService.load_schema()

    print("CMF Chatbot Schema Snapshot")
    print("=" * 60)
    print(f"Total schemas: {len(schema)}")

    for schema_name in RELEVANT_SCHEMAS:
        tables = schema.get(schema_name, {})
        print(f"\n[{schema_name}] — {len(tables)} tables")
        for table, cols in sorted(tables.items())[:25]:
            print(f"  {table}: {', '.join(cols[:12])}{'...' if len(cols) > 12 else ''}")
        if len(tables) > 25:
            print(f"  ... and {len(tables) - 25} more tables")

    scheduling = schema.get("scheduling", {})
    print(f"\n[scheduling] full table list ({len(scheduling)} tables):")
    for t in sorted(scheduling):
        print(f"  - scheduling.{t}")

    if args.write_cache:
        out = Path(__file__).resolve().parent.parent / "chatbot" / "schema_snapshot.json"
        payload = {
            "schemas": {k: schema.get(k, {}) for k in RELEVANT_SCHEMAS if k in schema},
            "scheduling_tables": list(scheduling.keys()),
            "static_context_chars": len(STATIC_SCHEMA_CONTEXT),
        }
        out.write_text(json.dumps(payload, indent=2), encoding="utf-8")
        print(f"\nWrote cache: {out}")


if __name__ == "__main__":
    main()

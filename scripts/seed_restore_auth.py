#!/usr/bin/env python3
"""Create temporary auth.users rows from the exported Auth metadata.

Only stable user identifiers and non-secret metadata are seeded. No password
hashes or tokens are present in the backup or generated SQL.
"""
import json
import sys
from pathlib import Path


def sql_text(value):
    if value is None:
        return "NULL"
    return "'" + str(value).replace("'", "''") + "'"


def sql_json(value):
    if value is None:
        return "'{}'::jsonb"
    return sql_text(json.dumps(value, separators=(",", ":"))) + "::jsonb"


def build_sql(metadata):
    users = metadata.get("users")
    if not isinstance(users, list) or metadata.get("user_count") != len(users):
        raise ValueError("Auth metadata is malformed.")
    statements = []
    for user in users:
        uid = user.get("id")
        if not isinstance(uid, str) or len(uid) != 36:
            raise ValueError("Auth metadata contains an invalid user ID.")
        values = [
            sql_text(uid),
            sql_text(user.get("aud")),
            sql_text(user.get("role")),
            sql_text(user.get("email")),
            sql_text(user.get("phone")),
            sql_text(user.get("created_at")),
            sql_text(user.get("updated_at")),
            sql_json(user.get("app_metadata") or {}),
            sql_json(user.get("user_metadata") or {}),
            "TRUE" if user.get("is_anonymous") is True else "FALSE",
        ]
        statements.append(
            "INSERT INTO auth.users "
            "(id,aud,role,email,phone,created_at,updated_at,raw_app_meta_data,raw_user_meta_data,is_anonymous) "
            "VALUES (" + ",".join(values) + ");"
        )
    return "\n".join(statements) + "\n"


def main():
    if len(sys.argv) != 3:
        raise SystemExit("Usage: seed_restore_auth.py AUTH_USERS_JSON OUTPUT_SQL")
    source, destination = map(Path, sys.argv[1:])
    metadata = json.loads(source.read_text(encoding="utf-8"))
    sql = build_sql(metadata)
    destination.write_text(sql, encoding="utf-8")
    print("Prepared " + str(metadata["user_count"]) + " temporary Auth identity rows.")


if __name__ == "__main__":
    main()

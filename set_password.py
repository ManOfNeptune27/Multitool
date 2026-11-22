#!/usr/bin/env python3
"""Replace the password hash in script.js. The password is not saved."""

import getpass
import hashlib
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent
SCRIPT = ROOT / "script.js"
PATTERN = re.compile(r'const PASSWORD_HASH = "[0-9a-f]{64}";')


def main():
    if not sys.stdin.isatty():
        print("Run this in a terminal so the password stays off the screen.", file=sys.stderr)
        return 1
    first = getpass.getpass("New password: ")
    second = getpass.getpass("Confirm password: ")
    if first != second:
        print("The two entries did not match.", file=sys.stderr)
        return 1
    if len(first) < 8:
        print("Use at least 8 characters.", file=sys.stderr)
        return 1
    digest = hashlib.sha256(first.encode("utf-8")).hexdigest()
    text = SCRIPT.read_text(encoding="utf-8")
    updated, count = PATTERN.subn('const PASSWORD_HASH = "%s";' % digest, text, count=1)
    if count != 1:
        print("Could not find the password hash in script.js.", file=sys.stderr)
        return 1
    SCRIPT.write_text(updated, encoding="utf-8", newline="\n")
    print("Password updated in script.js.")
    print("Commit that file and push it so GitHub Pages uses the new password.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

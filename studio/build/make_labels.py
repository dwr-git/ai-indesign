#!/usr/bin/env python3
"""Russian names for the assistant's command search.

Reads the Russian interface catalog AI Вёрстка is built with (crates/ui-egui/src/i18n/ru.rs: rows
`("English", "Русский"),`, on one line or as rustfmt's block form) and writes studio/ru-labels.json:

    {"text": {"Place…": "Поместить…", ...}}

The assistant panel uses it to show and search commands (their labels and menu-path segments) in
Russian. Run by studio/build/package.sh.
"""

import json
import re
import sys
from pathlib import Path

STR = r'"((?:[^"\\]|\\.)*)"'
ROW = re.compile(r'\(\s*' + STR + r'\s*,\s*' + STR + r'\s*,?\s*\)', re.S)


def unescape(s: str) -> str:
    return s.encode("utf-8").decode("unicode_escape").encode("latin-1").decode("utf-8") if "\\" in s else s


def main() -> int:
    root = Path(__file__).resolve().parents[2]
    src = root / "crates" / "ui-egui" / "src" / "i18n" / "ru.rs"
    dst = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("ru-labels.json")
    text: dict[str, str] = {}
    if not src.is_file():
        print(f"warning: {src} not found; command names stay English", file=sys.stderr)
    else:
        body = src.read_text(encoding="utf-8")
        # Only the main table: CONTEXT rows have three strings and a scope.
        end = body.find("pub(super) const CONTEXT")
        for m in ROW.finditer(body[: end if end > 0 else len(body)]):
            try:
                en, ru = unescape(m.group(1)), unescape(m.group(2))
            except UnicodeError:
                continue
            if ru.strip():
                text[en] = ru
    dst.parent.mkdir(parents=True, exist_ok=True)
    dst.write_text(json.dumps({"text": text}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"{dst}: {len(text)} labels")
    return 0


if __name__ == "__main__":
    sys.exit(main())

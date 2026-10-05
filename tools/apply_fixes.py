# -*- coding: utf-8 -*-
"""把 tools/fixes.json 裡的人工校正套用到 lexicon.json。

fixes.json 格式：
{
  "<條目 id>": {
     "word":  "要改成的英文單字",
     "zh":    "要改成的中文釋義",
     "ex_en": "要改成的英文例句",
     "ex_zh": "要改成的例句中文翻譯",
     "_note": "為什麼這樣改（會寫進修正報告）"
  }
}
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LEX = ROOT / "tools" / "lexicon.json"
FIX = ROOT / "tools" / "fixes.json"

FIELDS = ("word", "zh", "ex_en", "ex_zh")


def main():
    lex = json.loads(LEX.read_text(encoding="utf-8"))
    fixes = json.loads(FIX.read_text(encoding="utf-8")) if FIX.exists() else {}

    applied, unknown = [], []
    by_id = {e["id"]: e for e in lex["entries"]}
    for eid, patch in fixes.items():
        e = by_id.get(eid)
        if not e:
            unknown.append(eid)
            continue
        for f in FIELDS:
            if f in patch:
                e[f] = patch[f]
        applied.append((eid, patch))

    LEX.write_text(json.dumps(lex, ensure_ascii=False, indent=1), encoding="utf-8")

    report = [f"applied={len(applied)}  unknown_ids={len(unknown)}"]
    if unknown:
        report.append("unknown: " + ", ".join(unknown))
    report.append("")
    for eid, patch in sorted(applied):
        note = patch.get("_note", "")
        report.append(f"[{eid}] {by_id[eid]['word']}")
        for f in FIELDS:
            if f in patch:
                report.append(f"    {f:6s} {by_id[eid][f]!r}")
        if note:
            report.append(f"    note   {note}")
    (ROOT / "tools" / "fixes_report.txt").write_text("\n".join(report), encoding="utf-8")
    print(f"applied={len(applied)} unknown={len(unknown)}")


if __name__ == "__main__":
    main()
# -*- coding: utf-8 -*-
"""把「還缺詞組步驟」的單元連同它們的例句一起倒出來，方便人工挑搭配。

挑搭配的原則：優先挑「真的出現在那一句例句裡」的固定用法，
這樣 build_bank.py 的 in_sent 分支一定配得到，而且學到的是可用的語塊。
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BANKS = ROOT / "data" / "banks.js"
OUT = ROOT / "tools" / "gap_units.json"

raw = BANKS.read_text(encoding="utf-8")
data = json.loads(raw[raw.index("{"): raw.rindex("}") + 1])

TOKEN_RE = re.compile(r"[a-z]+(?:'[a-z]+)?")


def sent_of(unit):
    for s in unit["steps"]:
        if s["kind"] == "sentence":
            return s["en"], s.get("zh", "")
    return "", ""


gaps = []
for bank in data["scenarios"]:
    for unit in bank["units"]:
        if any(s["kind"] == "phrase" for s in unit["steps"]):
            continue
        en, zh = sent_of(unit)
        gaps.append({
            "sid": bank["id"],
            "title": bank["title"],
            "id": unit["id"],
            "target": unit["target"],
            "gloss": unit["gloss"],
            "ex_en": en,
            "ex_zh": zh,
            "level": unit["level"],
        })

OUT.write_text(json.dumps(gaps, ensure_ascii=False, indent=1), encoding="utf-8")

by_sid = {}
for g in gaps:
    by_sid.setdefault(g["sid"], []).append(g)

lines = [f"gap units: {len(gaps)}", ""]
for sid, items in by_sid.items():
    lines.append(f"===== {sid} ({len(items)}) =====")
    for g in items:
        lines.append(f"[{g['id']}] {g['target']}  {g['gloss']}")
        lines.append(f"    EN: {g['ex_en']}")
        lines.append(f"    ZH: {g['ex_zh']}")
    lines.append("")
(ROOT / "tools" / "gap_units.txt").write_text("\n".join(lines), encoding="utf-8")
print(f"gaps={len(gaps)} scenarios={len(by_sid)}")

# -*- coding: utf-8 -*-
"""檢查所有含縮寫或所有格 's 的步驟，音標是否合理。

重點抓兩種毛病：
  * 所有格被還原成錯誤的元音（nobody's 不該變成 noʊ,bɑː diːz）
  * 音標裡出現不該有的逗號（多半是斷音節時插入的）
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))
import build_bank as B   # noqa: E402

raw = (ROOT / "data" / "banks.js").read_text(encoding="utf-8")
banks = json.loads(raw[raw.index("{"): raw.rindex("}") + 1])

contraction = re.compile(r"[a-z]'s\b|[a-z]'(t|ll|ve|re|d|m)\b", re.I)

rows = []
seen = set()
for sc in banks["scenarios"]:
    for u in sc["units"]:
        for st in u["steps"]:
            en = st["en"]
            if not contraction.search(en):
                continue
            key = (sc["id"], u["id"], st["kind"])
            if key in seen:
                continue
            seen.add(key)
            rows.append((sc["id"], u["id"], st["kind"], en, st.get("ipa", "")))

comma = [r for r in rows if "," in r[4]]
lines = [f"steps with a contraction: {len(rows)}   of which IPA has a comma: {len(comma)}", ""]
for sid, uid, kind, en, ipa in sorted(rows):
    flag = "  <== COMMA" if "," in ipa else ""
    lines.append(f"{sid:9s} {uid:7s} {kind:9s} {en:34s} /{ipa}/{flag}")
(ROOT / "tools" / "contraction_ipa.txt").write_text("\n".join(lines), encoding="utf-8")
print(lines[0])

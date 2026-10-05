# -*- coding: utf-8 -*-
"""找出 CMUdict「首選讀音」明顯不是常用讀音的字。

已知模式：首選條目在非重音音節用了完整母音（AA2 / IY2 / AA1…），
變體條目卻是 AH0（schwa）。nobody 就是這樣：
    nobody      N OW1 B AA2 D IY2     -> /ˈnoʊˌbɑːdiːz/   （不常用）
    nobody(2)   N OW1 B AH0 D IY0     -> /ˈnoʊbədi/        （實際唸的）

只掃題庫的 889 個目標字，範圍可控。
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))

raw = (ROOT / "data" / "banks.js").read_text(encoding="utf-8")
banks = json.loads(raw[raw.index("{"): raw.rindex("}") + 1])
targets = {u["target"].lower() for s in banks["scenarios"] for u in s["units"]}

# 題目裡會用到的一般名詞也一起掃（例句音標同樣會用到）
common = set("""
person people water hour hours idea ideas problem problems question questions
mother father brother sister family families country countries city cities
number numbers letter letters paper papers colour color colors colours
doctor doctors student students teacher teachers friend friends
""".split())
want = {w for w in (targets | common) if w.isalpha() and " " not in w}

prim, var = {}, {}
for line in (ROOT / "tools" / "cache" / "cmudict.dict").read_text(
        encoding="utf-8", errors="replace").splitlines():
    parts = line.split()
    if len(parts) < 2:
        continue
    w = parts[0]
    if "(" in w:
        w = w[:w.index("(")]
        var.setdefault(w.lower(), parts[1:])
    else:
        prim.setdefault(w.lower(), parts[1:])

FULL_VOWEL = {"AA", "AO", "IY", "UW", "ER", "IH", "EH", "AE", "OW"}


def vowel_stress(phones):
    out = []
    for p in phones:
        m = re.match(r"^([A-Z]+)([0-2])?$", p)
        if not m:
            continue
        base, d = m.group(1), m.group(2)
        if base in ("AA", "AE", "AO", "AW", "AY", "EH", "ER", "EY",
                    "IH", "IY", "OW", "OY", "UH", "UW") or base == "AH":
            out.append((base, d or "0"))
    return out


rows = []
for w in sorted(want):
    p, v = prim.get(w), var.get(w)
    if not p or not v:
        continue
    pv, vv = vowel_stress(p), vowel_stress(v)
    if not pv or not vv or len(pv) != len(vv):
        continue
    # 變體把某個音節標成 AH0，首選卻用了完整母音 → 首選可疑
    bad = any(b[0] == "AH" and b[1] == "0" and a[0] in FULL_VOWEL
              for a, b in zip(pv, vv))
    if bad:
        rows.append((w, " ".join(p), " ".join(v)))

lines = [f"suspicious CMUdict primaries among {len(want)} words: {len(rows)}", ""]
for w, p, v in rows:
    lines.append(f"  {w:16s} {p:28s} -> prefer {v}")
(ROOT / "tools" / "ipa_primary_report.txt").write_text("\n".join(lines), encoding="utf-8")
print(lines[0])

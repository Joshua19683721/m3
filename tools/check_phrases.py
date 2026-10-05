# -*- coding: utf-8 -*-
"""驗證詞組步驟：

  1. 889 個單元每一個都必須有「詞組」關。
  2. tools/phrase_expected.json 裡人工挑定的那 110 個單元，
     必須拿到完全相同���詞組與中文（防止重建時被其他片語蓋掉）。
  3. 每個詞組步驟都要有音標。

任何一項不過就 exit 1，讓 npm run build 直接失敗。
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BANKS = ROOT / "data" / "banks.js"
EXPECTED = ROOT / "tools" / "phrase_expected.json"

raw = BANKS.read_text(encoding="utf-8")
banks = json.loads(raw[raw.index("{"): raw.rindex("}") + 1])
expected = json.loads(EXPECTED.read_text(encoding="utf-8"))

problems = []
units = 0
phrase_steps = 0
from_sentence = 0

for bank in banks["scenarios"]:
    sid = bank["id"]
    for unit in bank["units"]:
        units += 1
        uid = unit["id"]
        steps = unit["steps"]
        phs = [s for s in steps if s["kind"] == "phrase"]

        if not phs:
            problems.append(f"{sid} [{uid}] {unit['target']} 沒有詞組步驟")
            continue
        if len(phs) > 1:
            problems.append(f"{sid} [{uid}] {unit['target']} 有 {len(phs)} 個詞組步驟")
            continue

        got = phs[0]
        phrase_steps += 1
        if not got.get("ipa"):
            problems.append(f"{sid} [{uid}] 詞組 {got['en']!r} 沒有音標")
        if got.get("src") != "table":
            problems.append(f"{sid} [{uid}] 詞組 {got['en']!r} 來源不是對照表（src={got.get('src')!r}）")
        want = expected.get(sid, {}).get(uid)
        if want and (got["en"] != want[0] or got["zh"] != want[1]):
            problems.append(
                f"{sid} [{uid}] 詞組與人工挑定的不符：得到 {got['en']!r}/{got['zh']!r}，"
                f"預期 {want[0]!r}/{want[1]!r}")
        elif want:
            # 這 110 筆是照著例句一個字一個字挑的，所以必須逐字出自例句。
            # 其餘 779 筆走「以目標字結尾」的分支，本來就不要求出自例句。
            sent = next((s for s in steps if s["kind"] == "sentence"), None)
            if sent:
                flat = lambda t: re.sub(r"\s+", " ",
                                        re.sub(r"[^a-z0-9 ]+", " ", t.lower())).strip()
                if (" " + flat(got["en"]) + " ") not in (" " + flat(sent["en"]) + " "):
                    problems.append(
                        f"{sid} [{uid}] 詞組 {got['en']!r} 不在例句 {sent['en']!r} 裡")
            from_sentence += 1

n_expected = sum(len(v) for k, v in expected.items() if not k.startswith("_"))
pinned_sids = {k for k in expected if not k.startswith("_")}
for sid in pinned_sids:
    have = {u["id"] for b in banks["scenarios"] if b["id"] == sid for u in b["units"]}
    for uid in expected[sid]:
        if uid not in have:
            problems.append(f"{sid} [{uid}] 預期有這個單元，但題庫裡找不到")

lines = [
    f"units={units}  phrase_steps={phrase_steps}  "
    f"pinned={n_expected}  pinned_from_sentence={from_sentence}  "
    f"problems={len(problems)}",
]
lines += ["  PROBLEM " + p for p in problems]
(ROOT / "tools" / "phrase_report.txt").write_text("\n".join(lines), encoding="utf-8")
print(lines[0])
if problems:
    sys.exit(1)

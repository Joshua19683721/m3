# -*- coding: utf-8 -*-
"""檢查每個步驟的音標是否「整句都查得到」。

問題出在 ipa_of_sentence：查不到的 token 會被安靜地略過，畫面上的音標
看起來還是「有」，但實際上少了一截。早期 PDF 例句用 U+2019 撇號時，
can't / don't / It's / Something's 這些字就整個漏掉了。

這支腳本把「查不到音標的 token」全部列出來，讓人可以逐筆判斷：
  * 是人名（Gloria、Ryan、Ms. Chen…）→ 合理，放進 NAMES 白名單
  * 是常見字 → 真正的 bug，必須修
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

# 題庫裡出現的人名／地名／縮寫，查不到音標是正常的（CMUdict 沒有收）
NAMES = set("""
gloria ryan ted nick dennis richard stacy lisa jack jane john mary tom peter
paul mike mary kevin frank chris jessica tom larry sara joe ann tom
chen wang lin li huang zhang liu wu liu ko
penghu taitung changhua keelung rowling
mrt nt ktv pe
""".split())

NAMES |= {"jessie's"}

missing = {}
empty_steps = []
n_steps = 0

for sc in banks["scenarios"]:
    for u in sc["units"]:
        for st in u["steps"]:
            n_steps += 1
            if not st.get("ipa"):
                empty_steps.append(f"{sc['id']}/{u['id']} {st['kind']} {st['en']!r}")
                continue
            if st["kind"] != "sentence":
                continue
            for tok in st["en"].split():
                core = re.match(r"^[A-Za-z'’\-]+", tok)
                if not core:
                    continue
                if B.ipa_of(core.group(0)):
                    continue
                w = core.group(0).lower().strip("'’-")
                if w in NAMES:
                    continue
                missing.setdefault(w, []).append(f"{sc['id']}/{u['id']}")

lines = [
    f"steps={n_steps}  steps_without_ipa={len(empty_steps)}  "
    f"unresolved_tokens={len(missing)}",
    "",
]
if empty_steps:
    lines.append("--- 步驟完全沒有音標 ---")
    lines += ["  " + e for e in empty_steps[:40]]
    lines.append("")
lines.append("--- 例句裡查不到音標的 token（人名已排除）---")
for w, where in sorted(missing.items(), key=lambda kv: -len(kv[1])):
    lines.append(f"  {w:22s} x{len(where):<4d} {where[:4]}")
(ROOT / "tools" / "ipa_report.txt").write_text("\n".join(lines), encoding="utf-8")
print(lines[0])
# 人名白名單是人工維護的，任何漏網的 token 都要有人決定要不要加進去，
# 所以這裡直接擋下來，不讓「查不到就靜靜略過」的行為回到題庫裡。
if empty_steps or missing:
    sys.exit(1)

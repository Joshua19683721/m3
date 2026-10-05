# -*- coding: utf-8 -*-
"""印出指定單元在該場景裡的索引，方便組成 #場景/單元/步驟 的深層連結。"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
raw = (ROOT / "data" / "banks.js").read_text(encoding="utf-8")
banks = json.loads(raw[raw.index("{"): raw.rindex("}") + 1])

want = set(sys.argv[1:])
for sc in banks["scenarios"]:
    for i, u in enumerate(sc["units"]):
        if u["id"] in want or u["target"].lower() in want:
            steps = " | ".join(f"{j}:{s['kind']}={s['en']}" for j, s in enumerate(u["steps"]))
            print(f"#{sc['id']}/{i}")
            print(f"  {u['id']} {u['target']} {u['gloss']}")
            print(f"  {steps}")

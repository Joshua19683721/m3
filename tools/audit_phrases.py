# -*- coding: utf-8 -*-
"""找出 PHRASES 裡所有「含有縮寫或非 ASCII 字元」的片語，並列出它們的 IPA 狀況。

用來清理像 can't 這種退化條目：它搶先命中 in_sent，卻沒有音標也沒東西可學。
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))

import build_bank as B   # noqa: E402  匯入即完成所有 PHRASES 補丁


def flat(s):
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9 ]+", " ", s.lower())).strip()


rows = []
for ph, entries in B.PHRASES.items():
    bad_char = any(ord(c) > 127 for c in ph)
    ipa = B.ipa_of_sentence(ph)
    if bad_char or not ipa:
        rows.append((ph, entries, ipa, bad_char))

lines = [f"degenerate phrase entries: {len(rows)}", ""]
for ph, entries, ipa, bad_char in sorted(rows):
    sids = ",".join(sorted({s for _z, s in entries}))
    lines.append(f"{ph!r:34s} ipa={ipa or '(none)':28s} badchar={bad_char} sid={sids}")
(ROOT / "tools" / "bad_phrases.txt").write_text("\n".join(lines), encoding="utf-8")
print(lines[0])

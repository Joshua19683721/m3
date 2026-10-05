# -*- coding: utf-8 -*-
"""對最終 lexicon.json 做結構檢查（parse + fixes 之後的狀態）。"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LEX = ROOT / "tools" / "lexicon.json"


def is_cjk(ch):
    return "\u4e00" <= ch <= "\u9fff" or "\u3400" <= ch <= "\u4dbf"


def main():
    lex = json.loads(LEX.read_text(encoding="utf-8"))["entries"]
    problems = []
    seen_words = {}
    for e in lex:
        i, w = e["id"], e["word"]
        if not w:
            problems.append(("empty-word", i, w, e["zh"]))
        if any(is_cjk(c) for c in w):
            problems.append(("word-has-cjk", i, w, e["zh"]))
        if not e["zh"]:
            problems.append(("no-gloss", i, w, e["ex_en"]))
        if not e["ex_en"]:
            problems.append(("no-example", i, w, e["zh"]))
        else:
            # 句末可帶收尾引號，例如：The sign says “No smoking.”
            if not re.search(r"[.!?][\"'’”」』]?$", e["ex_en"]):
                problems.append(("example-no-end", i, w, e["ex_en"]))
            if len(e["ex_en"].split()) < 2:
                problems.append(("example-too-short", i, w, e["ex_en"]))
            if any(is_cjk(c) for c in e["ex_en"]):
                problems.append(("example-has-cjk", i, w, e["ex_en"]))
            if not re.match(r"^[A-Za-z\"“]", e["ex_en"]):
                problems.append(("example-bad-start", i, w, e["ex_en"]))
        if not e["ex_zh"]:
            problems.append(("no-example-zh", i, w, e["ex_en"]))
        else:
            cjk_n = sum(1 for c in e["ex_zh"] if is_cjk(c))
            asc_n = sum(1 for c in e["ex_zh"] if c.isascii() and c.isalpha())
            if cjk_n == 0 or asc_n > 3 * cjk_n:
                problems.append(("example-zh-ascii", i, w, e["ex_zh"]))
        if e["zh"] and re.search(r"[（(][^）)]*$", e["zh"]):
            problems.append(("gloss-unbalanced", i, w, e["zh"]))
        key = w.lower()
        seen_words.setdefault(key, []).append(i)

    dups = {k: v for k, v in seen_words.items() if len(v) > 1}

    out = [f"entries={len(lex)}  problems={len(problems)}  duplicate-headwords={len(dups)}"]
    out += ["  " + repr(p) for p in problems]
    for k, v in sorted(dups.items()):
        out.append(f"  DUP {k}: {', '.join(v)}")
    (ROOT / "tools" / "check_report.txt").write_text("\n".join(out), encoding="utf-8")
    print(out[0])


if __name__ == "__main__":
    main()
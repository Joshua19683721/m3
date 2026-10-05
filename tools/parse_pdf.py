# -*- coding: utf-8 -*-
"""
解析《英語單字口袋書（1-6級）》PDF，輸出 tools/lexicon.json

PDF 每條格式：
  <級>-<序號>  英文單字  中文釋義  英文例句  例句中文翻譯
例：1-001  a (an)  一(個、隻、件、條…)  I'm a student.  我是一個學生。

條目形如  單字 / 釋義 / 例句 / 譯文  四段，其中：
  * 例句可能以專有名詞開頭（Lucy…、Robert…），譯文也可能以專有名詞開頭（Lucy愈來愈胖）
  * 譯文結尾可能是半形 ! ? 或全形 ！ ？
  * 有些條目的例句在 PDF 裡沒有句號
  * 條目編號常含軟連字符（1-<U+00AD><U+2010>001）
以上都在此逐一處理；仍然切不乾淨的少數條目列進 tools/parse_report.txt 供人工處理。
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PDF = ROOT / "source.pdf"
OUT = ROOT / "tools" / "lexicon.json"

CJK = "\u4e00-\u9fff\u3400-\u4dbf"

# 條目編號：1-001 ~ 6-278
ID_RE = re.compile(r"(\d)-\s*(\d{3})")
ASCII_LETTER = re.compile(r"[A-Za-z]")
SENT_END = re.compile(r"[.!?]")
# 例句誤切風險：句尾是「單一字母 + 點」的縮寫殘段，例如 "... a popular writer. J.k"
ABBREV_TAIL = re.compile(r"[A-Za-z]\s*\.\s*[A-Za-z]$")


def clean(text: str) -> str:
    text = re.sub(r"[\u00ad\u2010\u2011\u2012\ufeff]", "", text)
    text = text.replace("\u00a0", " ").replace("\r", "\n")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r" *\n *", " ", text)
    return text


def is_cjk(ch: str) -> bool:
    return "\u4e00" <= ch <= "\u9fff" or "\u3400" <= ch <= "\u4dbf"


def tidy_en(s: str) -> str:
    return re.sub(r"\s+", " ", s.strip()).strip(" :：")


def tidy_zh(s: str) -> str:
    s = s.strip().strip("。．.！!？? 　")
    return re.sub(r"\s+", "", s)


def split_example(tail: str):
    """在 tail（=「釋義 + 例句 + 譯文」）中找出例句與譯文的界線。

    回傳 (gloss_end, ex_en, ex_zh)；無法切出例句時回傳 None。
    釋義一定不含 ASCII 字母，所以例句的起點就是第一個 ASCII 字母。
    """
    start_m = ASCII_LETTER.search(tail)
    if not start_m:
        return None
    start = start_m.start()

    body = tail[start:]
    # 由右往左找句末標點：其後必須還有中文，其前必須還是純英文
    ends = [m.start() for m in SENT_END.finditer(body)]
    for p in reversed(ends):
        head, rest = body[: p + 1], body[p + 1:]
        if not any(is_cjk(c) for c in rest):
            continue
        if not ASCII_LETTER.search(head):
            continue
        if any(is_cjk(c) for c in head):
            continue  # 說明這顆標點是被中文借用的，不是句號
        if ABBREV_TAIL.search(head):
            continue  # "... writer. J.k" — 這是譯文裡的專有名詞，不是真的句號
        return (start, tidy_en(head), tidy_zh(rest))

    # 沒有任何句末標點（PDF 少數條目會漏句號）：以最後一個英文字母切
    for i in range(len(body) - 1, -1, -1):
        ch = body[i]
        if ch.isascii() and ch.isalnum():
            rest, head = body[i + 1:], body[: i + 1]
            if not any(is_cjk(c) for c in rest):
                continue
            if any(is_cjk(c) for c in head):
                continue
            ex = tidy_en(head)
            if not ex:
                continue
            if not SENT_END.search(ex[-1:]):
                ex += "."
            return (start, ex, tidy_zh(rest))
    return None


def parse(raw: str):
    text = clean(raw)
    marks = [(m.start(), m.end(), int(m.group(1)), m.group(2)) for m in ID_RE.finditer(text)]
    entries = []
    for i, (start, end, level, seq) in enumerate(marks):
        stop = marks[i + 1][0] if i + 1 < len(marks) else len(text)
        body = text[end:stop].strip()
        if not body:
            continue

        first_cjk = next((j for j, ch in enumerate(body) if is_cjk(ch)), None)
        if first_cjk is None:
            word, gloss, ex_en, ex_zh = tidy_en(body), "", "", ""
        else:
            # "the (定冠詞) The boy is playing…" 單字欄位只剩 "the ("，
            # 括號屬於釋義；括號裡的釋義本來就在 tail 的開頭，不必另外搬
            word = tidy_en(body[:first_cjk])
            tail = body[first_cjk:]
            found = split_example(tail)
            if found:
                g_end, ex_en, ex_zh = found
                gloss = tidy_zh(tail[:g_end])
            else:
                gloss = tidy_zh(tail)
            # 只有括號真的 unbalanced 時才剝掉外層括號
            # （"the (定冠詞)" 切出來的 "定冠詞)" 要剝；"一(個、隻、件、條…)" 不能剝）
            if (gloss.count("(") != gloss.count(")")
                    or gloss.count("（") != gloss.count("）")):
                gloss = gloss.strip("()（） ")

        word = re.sub(r"^[-–—]\s*", "", word)
        word = re.sub(r"[（(]\s*$", "", word)
        word = word.rstrip("…").strip()
        if not word:
            continue
        entries.append({
            "id": f"{level}-{seq}",
            "level": level,
            "seq": int(seq),
            "word": word,
            "zh": gloss,
            "ex_en": ex_en,
            "ex_zh": ex_zh,
        })
    return entries


def main():
    from PyPDF2 import PdfReader

    reader = PdfReader(str(PDF))
    pages = [(p.extract_text() or "") for p in reader.pages]
    entries = parse("\n".join(pages))
    by_level = {}
    for e in entries:
        by_level.setdefault(e["level"], []).append(e)

    report = [f"pages={len(pages)}  entries={len(entries)}"]
    for lv in sorted(by_level):
        report.append(f"  level {lv}: {len(by_level[lv])}")

    problems = []
    for e in entries:
        if not e["word"]:
            problems.append(("bad-word", e["id"], repr(e["word"]), e["zh"]))
        if any(is_cjk(c) for c in e["word"]):
            problems.append(("word-has-cjk", e["id"], e["word"], e["zh"]))
        if not e["zh"]:
            problems.append(("no-gloss", e["id"], e["word"], e["ex_en"]))
        if not e["ex_en"]:
            problems.append(("no-example", e["id"], e["word"], e["zh"]))
        elif not re.search(r"[.!?]$", e["ex_en"]):
            problems.append(("bad-example-end", e["id"], e["word"], e["ex_en"]))
        if any(is_cjk(c) for c in e["ex_en"]):
            problems.append(("example-has-cjk", e["id"], e["word"], e["ex_en"]))
        if not e["ex_zh"]:
            problems.append(("no-example-zh", e["id"], e["word"], e["ex_en"]))
        # 釋義被截斷的徵象：括號沒閉合
        if e["zh"] and re.search(r"[（(][^）)]*$", e["zh"]):
            problems.append(("gloss-truncated", e["id"], e["word"], e["zh"]))
        # 引號未閉合（例句被截斷的徵象）
        if e["ex_en"] and e["ex_en"].count('"') % 2:
            problems.append(("quote-unbalanced", e["id"], e["word"], e["ex_en"]))
        # 例句太短：真正被切壞時常只剩一個字
        if e["ex_en"] and len(e["ex_en"].split()) < 2:
            problems.append(("example-too-short", e["id"], e["word"], e["ex_en"]))
        # 譯文裡出現成串英文，代表邊界切錯、英文漏沒切出來。
        # 譯文裡出現專有名詞（Lucy、Annie、Bigfoot…）是正常的，所以改用
        # 「英文字母數 ≫ 中文字數」當作英文整句漏進譯文的判準。
        if e["ex_zh"]:
            cjk_n = sum(1 for c in e["ex_zh"] if is_cjk(c))
            ascii_n = sum(1 for c in e["ex_zh"] if c.isascii() and c.isalpha())
            if cjk_n == 0 or ascii_n > 3 * cjk_n:
                problems.append(("example-zh-ascii", e["id"], e["word"], e["ex_zh"]))
        elif e["ex_en"]:
            problems.append(("example-zh-missing", e["id"], e["word"], e["ex_en"]))

    report.append(f"\nproblems={len(problems)}")
    report += ["  " + repr(p) for p in problems]

    sample = [e for lv in (1, 3, 5, 6) for e in by_level[lv][40:44]]
    report.append("\n--- sample ---")
    report += [f"{e['id']} | {e['word']} | {e['zh']} | {e['ex_en']} | {e['ex_zh']}"
               for e in sample]

    (ROOT / "tools" / "parse_report.txt").write_text("\n".join(report), encoding="utf-8")
    OUT.write_text(json.dumps({"entries": entries}, ensure_ascii=False, indent=1),
                   encoding="utf-8")
    print("done ->", OUT)


if __name__ == "__main__":
    main()
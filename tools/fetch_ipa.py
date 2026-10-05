# -*- coding: utf-8 -*-
"""產生 tools/ipa.json：CMUdict（ARPAbet）→ IPA。

PDF 本身沒有音標，但練習時要能看音標。本機連不到 dictionaryapi.dev，
不過 GitHub raw 連得到，所以改用 CMUdict 離線換算：

  lunch  L AH1 N CH   ->   /ˈlʌntʃ/

換算規則（美式音位，符合台灣國中教科書習慣）：
  * 主要重音 1 → ˈ，次要重音 2 → ˌ，完全不標 0
  * AH0 → ə（中央元音 schwa）、ER0 → ɚ
  * 長元音補上 ː（iː uː ɜː ɑː ɔː），短元音不加
  * 雙元音直接寫成 aɪ / aʊ / eɪ / oʊ / ɔɪ

下載檔快取在 tools/cache/，重跑不會重新下載。
"""
import json
import re
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "tools" / "cache"
CMU = CACHE / "cmudict.dict"
URL = "https://raw.githubusercontent.com/cmusphinx/cmudict/master/cmudict.dict"
OUT = ROOT / "tools" / "ipa.json"

# ARPAbet → IPA
PHONES = {
    "AA": "ɑ", "AE": "æ", "AH0": "ə", "AH1": "ʌ", "AH2": "ʌ",
    "AO": "ɔ", "AW": "aʊ", "AY": "aɪ", "B": "b", "CH": "tʃ",
    "D": "d", "DH": "ð", "EH": "ɛ", "ER0": "ɚ", "ER1": "ɝ", "ER2": "ɝ",
    "EY": "eɪ", "F": "f", "G": "ɡ", "HH": "h", "IH": "ɪ",
    "IY": "i", "JH": "dʒ", "K": "k", "L": "l", "M": "m", "N": "n",
    "NG": "ŋ", "OW": "oʊ", "OY": "ɔɪ", "P": "p", "R": "ɹ",
    "S": "s", "SH": "ʃ", "T": "t", "TH": "θ", "UH": "ʊ",
    "UW": "u", "V": "v", "W": "w", "Y": "j", "Z": "z", "ZH": "ʒ",
}
# 需要標長音的母音（後面沒有 r 時）
LONG = {"IY": "iː", "UW": "uː", "AA": "ɑː", "AO": "ɔː", "ER": "ɜː"}
VOWELS = {"AA", "AE", "AH0", "AH1", "AH2", "AO", "AW", "AY", "EH",
          "ER0", "ER1", "ER2", "EY", "IH", "IY", "OW", "OY", "UH", "UW"}


def download():
    CACHE.mkdir(exist_ok=True)
    if CMU.exists() and CMU.stat().st_size > 1_000_000:
        return
    print("downloading cmudict …")
    req = urllib.request.Request(URL, headers={"User-Agent": "ipa-builder"})
    with urllib.request.urlopen(req, timeout=120) as r:
        CMU.write_bytes(r.read())
    print("saved", CMU, CMU.stat().st_size, "bytes")


def parse_line(line):
    parts = line.split()
    if len(parts) < 2:
        return None
    word, phones = parts[0], parts[1:]
    if "(" in word or ")" in word:      # 跳過變體標記，例如 BOOK(2)
        return None
    out = []          # 已輸出的音
    onset = []        # 自上一個母音以來還沒輸出的輔音（＝目前這個音節的起始）
    i = 0
    while i < len(phones):
        p = phones[i]
        m = re.match(r"^([A-Z]+)([0-2])?$", p)
        if not m:
            i += 1
            continue
        base, digit = m.group(1), m.group(2)
        # 沒有數字的是輔音；只有母音才帶重音數字。
        # 千萬不能把「沒有數字」當成 1，否則每個音都會被加上 ˈ。
        stress = digit or "0"
        if base not in PHONES and (base + stress) not in PHONES:
            i += 1
            continue
        sym = (PHONES.get(p)
               or PHONES.get(base + stress)
               or PHONES.get(base))
        nxt = phones[i + 1] if i + 1 < len(phones) else ""
        # 長母音：AA/AO 一律用長音 ɑː，後面接 R 時自然組成 ɑːɹ（不要重複標捲舌）
        # ARPAbet 的 AA = /ɑ/（hot, watch, want），AO = /ɔ/（all, dog, ball）。
        # 兩者不要混，否則 all / dog 會被念成 /ɑː/。
        if base == "AA":
            sym = "ɑː"
        elif base == "AO":
            sym = "ɔː"
        elif base == "IY":
            sym = "iː"
        elif base == "UW":
            sym = "uː"
        elif base in ("ER1", "ER2"):
            sym = "ɝ" if nxt == "R" else "ɜː"

        if base in VOWELS:
            pre = "".join(onset)
            onset = []
            if stress == "1":
                out.append("ˈ" + pre + sym)   # 重音標記放在「音節開頭」
            elif stress == "2":
                out.append("ˌ" + pre + sym)
            else:
                out.append(pre + sym)
        else:
            onset.append(sym)
        i += 1
    out.append("".join(onset))
    if not "".join(out).strip():
        return None
    return word.lower(), "".join(out)


def main():
    download()
    table = {}
    for line in CMU.read_text(encoding="utf-8", errors="ignore").splitlines():
        if line.startswith(";;;") or not line.strip():
            continue
        r = parse_line(line)
        if r:
            table.setdefault(r[0], r[1])
    OUT.write_text(json.dumps(table, ensure_ascii=False, indent=0), encoding="utf-8")
    print(f"words={len(table)} -> {OUT}")
    for w in ("lunch", "school", "dragon", "the", "walk", "happy"):
        print(f"  {w:8s} /{table.get(w, '—')}/")


if __name__ == "__main__":
    main()

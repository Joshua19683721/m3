# -*- coding: utf-8 -*-
"""掃描並修正專案裡的「真正的簡體字」。

重點：**不能用 OpenCC 的 s2t 直接整句轉換**。
s2t 還包含「異體字／地區用詞」規則，會把這些**本來就正確的繁體字**改掉：

    台灣 → 臺灣        吃東西 → 喫東西
    游泳 → 遊泳        皇后 → 皇后後
    床   → 牀          秘 → 祕

這些在台灣的繁體用法裡都是對的，轉了反而變成非台灣用語（甚至語意相反）。

所以這裡只認 OpenCC 的 `STCharacters.txt`（純「簡→繁」單字對照），
不含任何異體字規則，只動真正打不出的簡體字。

用法：
  python tools/audit_simplified.py          # 只報告
  python tools/audit_simplified.py --fix    # 報告並就地修正（會先備份 .bak）
"""
import sys
from pathlib import Path

import opencc
from opencc import OpenCC

ROOT = Path(__file__).resolve().parent.parent
DICT_DIR = Path(opencc.__file__).resolve().parent / "dictionary"
ST_CHARS = DICT_DIR / "STCharacters.txt"
# 只轉換這個規則，避免動到異體字
CC = OpenCC("t2s")          # placeholder，下面改用自訂轉換

# 額外保險：這些字在繁體中文裡是合法的，即使 STCharacters 有收也不能動。
NEVER_TOUCH = set("台吃伙后唇岩床游秘群乾並幹發髮後裡麽")


def load_s2t():
    """回傳 {簡體單字: 繁體單字}，只取單字對照。"""
    table = {}
    with ST_CHARS.open(encoding="utf-8") as fh:
        for line in fh:
            line = line.rstrip("\n")
            if not line or line.startswith("#"):
                continue
            parts = line.split("\t")
            if len(parts) == 2 and len(parts[0]) == 1 and len(parts[1]) == 1:
                table[parts[0]] = parts[1]
    return table


S2T = load_s2t()

# 歧義字：OpenCC 的 STCharacters 刻意不收，因為它本身在繁體裡也合法。
# 這裡只「報告」不自動改，交由人工看上下文判斷。
# （刻意不放「面/只/里/后/制/板」這類常見字——它們在繁體中文裡完全正常，
#   放了只會產生幾百筆誤報，例如「這裡面」「只有」「皇后」。）
#
# 用「碼位」寫，不要直接打中文字，否則很容易不小心把繁體字放進來。
# （之前就踩過這個坑：把繁體的「園」U+5712 當成簡體放進集合，
#   結果把正確的「公園」全數標成可疑。）
AMBIGUOUS = set(chr(c) for c in (
    0x51E0,  # 0x51E0 -> 幾   (繁體也合法：茶几那種用法)
    0x535C,  # 0x535C -> 卜   (占卜)
    0x8C37,  # 0x8C37 -> 谷   (稻谷)
    0x51B2,  # 0x51B2 -> 衝
    0x51C6,  # 0x51C6 -> 準
    0x5212,  # 0x5212 -> 劃
    0x4EF7,  # 0x4EF7 -> 價
    0x8303,  # 0x8303 -> 範
    0x56E2,  # 0x56E2 -> 團
    0x56ED,  # 0x56ED -> 園   注意別用 U+5712（那個是正確的繁體）
    0x56FE,  # 0x56FE -> 圖   注意別用 U+5716（那個是正確的繁體）
    0x90C1,  # 0x90C1 -> 鬱
    0x613F,  # 0x613F -> 願
    0x820D,  # 0x820D -> 捨
    0x590D,  # 0x590D -> 復／複
    0x836F,  # 0x836F -> 藥
    0x82CF,  # 0x82CF -> 蘇
    0x82F9,  # 0x82F9 -> 蘋
))


def is_simplified(ch):
    return ch in S2T and ch not in NEVER_TOUCH


def convert(text):
    return "".join(S2T[ch] if is_simplified(ch) else ch for ch in text)


# 要掃的檔案：走訪整個 repo，不再列白名單。
# 之前是手寫 TARGETS，結果新增 tools/phrase_expected.json 時忘了加進去，
# 那份檔案裡有 110 筆中文卻完全沒被掃到。改成自動走訪，以後不會再漏。
TEXT_SUFFIX = {".py", ".js", ".json", ".html", ".css", ".md", ".bat",
               ".txt", ".yml", ".yaml", ".toml", ".cfg", ".ini"}
SKIP_DIRS = {".git", "node_modules", "cache", "__pycache__", ".idea", ".vscode"}
# 只排除「本來就必須含簡體字」的檔案。
# data/banks.js 雖然是產物，但它是使用者實際看到的中文，照樣要掃。
SKIP_NAMES = {
    # 這份就是「簡體字清單」本身，必須含簡體字（tools/test_app.js 載入）
    "simplified_chars.js",
}


def collect_targets():
    out = []
    for p in sorted(ROOT.rglob("*")):
        if not p.is_file():
            continue
        if any(part in SKIP_DIRS for part in p.relative_to(ROOT).parts):
            continue
        if p.suffix.lower() not in TEXT_SUFFIX:
            continue
        if p.name in SKIP_NAMES:
            continue
        # 報告檔本身會含「簡體」這三個字（因為是用來描述問題的），跳過
        if p.name in ("simplified_report.txt", "gap_units.txt", "bank_report.txt",
                      "phrase_report.txt", "ipa_report.txt", "bad_phrases.txt",
                      "contraction_ipa.txt", "ipa_primary_report.txt"):
            continue
        out.append(p.relative_to(ROOT).as_posix())
    return out


TARGETS = collect_targets()


def main():
    fix = "--fix" in sys.argv
    report = [f"STCharacters 收錄的單字對照：{len(S2T)} 組", ""]
    total = 0
    ambiguous_hits = []
    for rel in TARGETS:
        f = ROOT / rel
        if not f.exists():
            continue
        text = f.read_text(encoding="utf-8")

        # 歧義字：列出上下文，讓人工判斷（跳過本檔本身，否則全是原始碼裡的字元）
        if f.name != Path(__file__).name:
            for i, ch in enumerate(text):
                if ch in AMBIGUOUS:
                    ambiguous_hits.append(
                        f"{rel}: …{text[max(0,i-18):i+18]!r}…")

        bad = {ch for ch in text if is_simplified(ch)}
        if not bad:
            continue
        counts = {ch: text.count(ch) for ch in sorted(bad)}
        n = sum(counts.values())
        total += n
        report.append(f"=== {rel} : {n} 處 / {len(counts)} 種 ===")
        report.append("  " + "  ".join(f"{ch}→{S2T[ch]}({v})" for ch, v in counts.items()))
        for ch in sorted(bad):
            i = text.find(ch)
            report.append(f"    例：…{text[max(0,i-24):i+24]!r}…")
        if fix:
            bak = f.with_suffix(f.suffix + ".bak")
            bak.write_text(text, encoding="utf-8")
            f.write_text(convert(text), encoding="utf-8")
            report.append(f"  已修正（備份 {bak.name}）")

    header = f"真正的簡體字：{total} 處"
    print(header)
    print(f"歧義字（需人工判斷）：{len(ambiguous_hits)} 處")
    report.append("")
    report.append(f"=== 歧義字 {len(ambiguous_hits)} 處 ===")
    report += ["  " + h for h in ambiguous_hits]
    (ROOT / "tools" / "simplified_report.txt").write_text(
        header + "\n" + "\n".join(report), encoding="utf-8")
    # 當成建置的一部分時，发現簡體字要讓 build 直接失敗
    if total and not fix:
        sys.exit(1)


if __name__ == "__main__":
    main()

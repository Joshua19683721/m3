# -*- coding: utf-8 -*-
"""把 889 條目切成小批次檔，供逐批人工/LLM 校對使用。"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LEX = ROOT / "tools" / "lexicon.json"
OUT = ROOT / "tools" / "batches"
BATCH = 40


def main():
    entries = json.loads(LEX.read_text(encoding="utf-8"))["entries"]
    OUT.mkdir(exist_ok=True)
    for f in OUT.glob("batch_*.json"):
        f.unlink()
    n = 0
    for i in range(0, len(entries), BATCH):
        chunk = entries[i: i + BATCH]
        n += 1
        name = f"batch_{n:02d}.json"
        (OUT / name).write_text(
            json.dumps(chunk, ensure_ascii=False, indent=1), encoding="utf-8")
        # 另存一份純文字，方便直接貼進 prompt
        lines = []
        for e in chunk:
            lines.append(f'{e["id"]}\t{e["word"]}\t{e["zh"]}\t{e["ex_en"]}\t{e["ex_zh"]}')
        (OUT / name.replace(".json", ".txt")).write_text("\n".join(lines), encoding="utf-8")
    print(f"batches={n} entries={len(entries)} per_batch={BATCH}")


if __name__ == "__main__":
    main()
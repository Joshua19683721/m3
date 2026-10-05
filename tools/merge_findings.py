# -*- coding: utf-8 -*-
"""把 tools/findings/batch_*.json 的校對結果合併進 tools/fixes.json。

同一個欄位若被兩批重複提出，以 severity=error 優先；仍相同則保留先到的。
合併前會印出一份人工覆核報告到 tools/findings_report.txt。
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FIND = ROOT / "tools" / "findings"
FIX = ROOT / "tools" / "fixes.json"
REPORT = ROOT / "tools" / "findings_report.txt"

FIELDS = ("word", "zh", "ex_en", "ex_zh")
RANK = {"error": 0, "minor": 1}


def load_findings():
    out = []
    for f in sorted(FIND.glob("batch_*.json")):
        try:
            data = json.loads(f.read_text(encoding="utf-8"))
        except Exception as exc:  # 壞掉的批次檔要能看到
            out.append((f.name, None, str(exc)))
            continue
        for iss in data.get("issues", []):
            out.append((data.get("batch"), iss, None))
    return out


def main():
    fixes = json.loads(FIX.read_text(encoding="utf-8")) if FIX.exists() else {}
    lex = json.loads((ROOT / "tools" / "lexicon.json").read_text(encoding="utf-8"))
    by_id = {e["id"]: e for e in lex["entries"]}

    merged, conflicts, skipped = {}, [], []
    report = []
    total_issues = 0

    for batch, iss, err in load_findings():
        if err:
            report.append(f"[batch {batch}] 讀取失敗：{err}")
            continue
        if not iss:
            continue
        total_issues += 1
        eid = iss.get("id", "")
        field = iss.get("field", "")
        if eid not in by_id or field not in FIELDS:
            skipped.append((batch, eid, field))
            continue
        sev = iss.get("severity", "minor")
        entry = merged.setdefault(eid, {})
        prev = entry.get(field)
        if prev is None:
            entry[field] = {
                "proposed": iss["proposed"],
                "severity": sev,
                "reason": iss.get("reason", ""),
                "batch": batch,
            }
        else:
            if prev["proposed"] == iss["proposed"]:
                if RANK[sev] < RANK[prev["severity"]]:
                    prev["severity"] = sev
                continue
            # 兩批建議不同：嚴重程度高的勝出，否則記為衝突待人工判斷
            if RANK[sev] < RANK[prev["severity"]]:
                conflicts.append((eid, field, prev, iss))
                entry[field] = {
                    "proposed": iss["proposed"],
                    "severity": sev,
                    "reason": iss.get("reason", ""),
                    "batch": batch,
                }
            else:
                conflicts.append((eid, field, prev, iss))

    # 合併進既有 fixes.json（人工修正優先，不被自動結果覆蓋）
    added = 0
    for eid, fields in merged.items():
        target = fixes.setdefault(eid, {})
        for field, info in fields.items():
            if field in target:
                continue
            target[field] = info["proposed"]
            target["_note"] = (
                f"[校對] {info['severity']}（第 {info['batch']} 批）：{info['reason']}"
            )
            added += 1

    FIX.write_text(json.dumps(fixes, ensure_ascii=False, indent=1), encoding="utf-8")

    report.insert(0, f"findings={total_issues}  applied={added}  "
                     f"conflicts={len(conflicts)}  skipped={len(skipped)}  "
                     f"total_entries={len(by_id)}\n")

    report.append("\n=== 已套用 ===")
    for eid in sorted(merged):
        e = by_id[eid]
        for field, info in sorted(merged[eid].items()):
            report.append(f"[{eid}] {e['word']} / {field}")
            report.append(f"    old  {e[field]!r}")
            report.append(f"    new  {info['proposed']!r}   ({info['severity']}, batch {info['batch']})")
            report.append(f"    why  {info['reason']}")

    if conflicts:
        report.append("\n=== 建議衝突（已採用嚴重程度較高者，請覆核）===")
        for eid, field, prev, iss in conflicts:
            report.append(f"[{eid}] {field}")
            report.append(f"    A(batch {prev['batch']},{prev['severity']}): {prev['proposed']!r}")
            report.append(f"    B(batch {iss.get('_batch','?')}): {iss['proposed']!r}")

    if skipped:
        report.append("\n=== 略過（找不到條目或欄位名稱不合法）===")
        report += [f"    {s}" for s in skipped]

    REPORT.write_text("\n".join(report), encoding="utf-8")
    print(f"findings={total_issues} applied={added} conflicts={len(conflicts)} skipped={len(skipped)}")


if __name__ == "__main__":
    main()
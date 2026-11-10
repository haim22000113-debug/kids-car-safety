#!/usr/bin/env python3
"""
בדיקת "עברית בלבד" בסוף כל תשובה של Claude לבעלים.

הבעלים ביקש שוב ושוב שכל ההודעות אליו יהיו בעברית, וההוראה ב-CLAUDE.md
לא הספיקה: בעבודה ארוכה הודעות ביניים קצרות יצאו באנגלית. הבדיקה הזו
רצה כש-Claude מסיים תור (Stop hook), קוראת את כל הטקסט שהוא כתב מאז
ההודעה האחרונה של הבעלים, ואם יש בו משפט באנגלית - חוסמת את הסיום ומבקשת
לכתוב שוב בעברית.

"משפט באנגלית" = חמש מילים לטיניות ברצף או יותר, אחרי שמסירים קוד, נתיבי
קבצים וקישורים. שמות כמו Little Shield או קודים כמו TRIP_STOPPED לא נחשבים.

עדכון (בקשת הבעלים, 10.11): מותר לכתוב באנגלית **ומיד אחריה בעברית**, כדי
שהבעלים ילמד אנגלית. לכן נחסמת רק הודעה שיש בה אנגלית ואין בה כמעט עברית -
כלומר הודעה באנגלית בלי תרגום. בהודעה דו-לשונית יש בערך כמות דומה של
אותיות עבריות, וזה מה שנבדק.
"""
import json
import re
import sys

MIN_WORDS = 5

# עברית קצרה יותר מאנגלית באותיות (בלי ניקוד), אז הודעה דו-לשונית מלאה
# מגיעה בערך ל-0.6-0.8. מתחת ל-0.35 - חסר תרגום.
MIN_HEBREW_RATIO = 0.35


def text_blocks(content):
    if isinstance(content, str):
        return [content]
    if isinstance(content, list):
        return [b.get("text", "") for b in content if isinstance(b, dict) and b.get("type") == "text"]
    return []


def is_owner_prompt(entry):
    if entry.get("type") != "user" or entry.get("isMeta"):
        return False
    content = (entry.get("message") or {}).get("content")
    if isinstance(content, str):
        return True
    return isinstance(content, list) and any(
        isinstance(b, dict) and b.get("type") == "text" for b in content
    ) and not any(isinstance(b, dict) and b.get("type") == "tool_result" for b in content)


def strip_technical(text):
    text = re.sub(r"```.*?```", " ", text, flags=re.S)
    text = re.sub(r"`[^`]*`", " ", text)
    text = re.sub(r"https?://\S+", " ", text)
    text = re.sub(r"\S*[/\\]\S*", " ", text)
    return text


ENGLISH_RUN = re.compile(r"(?:\b[A-Za-z][A-Za-z']*\b[\s,;:\-]+){%d,}\b[A-Za-z][A-Za-z']*\b" % (MIN_WORDS - 1))


def main():
    try:
        payload = json.load(sys.stdin)
    except Exception:
        return 0
    # כבר חסמנו פעם אחת בתור הזה - לא נכנסים ללולאה אינסופית.
    if payload.get("stop_hook_active"):
        return 0
    path = payload.get("transcript_path")
    if not path:
        return 0
    try:
        with open(path, encoding="utf-8") as f:
            entries = [json.loads(line) for line in f if line.strip()]
    except Exception:
        return 0

    last_prompt = max((i for i, e in enumerate(entries) if is_owner_prompt(e)), default=-1)
    written = []
    for e in entries[last_prompt + 1 :]:
        if e.get("type") == "assistant":
            written.extend(text_blocks((e.get("message") or {}).get("content")))

    for text in written:
        clean = strip_technical(text)
        match = ENGLISH_RUN.search(clean)
        latin = len(re.findall(r"[A-Za-z]", clean))
        hebrew = len(re.findall(r"[\u0590-\u05FF]", clean))
        if match and hebrew < MIN_HEBREW_RATIO * latin:
            print(json.dumps({
                "decision": "block",
                "reason": (
                    "כתבת לבעלים באנגלית בלי תרגום: \"" + match.group(0)[:120] + "\". "
                    "הכלל של הבעלים: כל הודעה אליו באנגלית ומיד אחריה אותו דבר בעברית, "
                    "גם הודעות ביניים. כתוב עכשיו הודעה שמסכמת את מה שנכתב בתור הזה - "
                    "באנגלית ומיד אחריה בעברית."
                ),
            }, ensure_ascii=False))
            return 0
    return 0


if __name__ == "__main__":
    sys.exit(main())

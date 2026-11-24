"""
מייצר את assets/warning_alarm.wav - צליל האזעקה של האפליקציה.

הצליל מיוצר בקוד ולא מוקלט, כדי שאפשר יהיה לכייל אותו (CLAUDE.md).

גרסה 2 (24.11.2026, בקשת הבעלים: "בקושי שומעים"): הקובץ הקודם הגיע רק ל-48%
מהעוצמה האפשרית, בטון של 1,300 הרץ. רמקול של טלפון משמיע הכי חזק בתחום
2,000-4,000 הרץ, ושם גם האוזן הכי רגישה. עכשיו: שני טונים מתחלפים (סירנה)
של 2,900 ו-2,200 הרץ, כמעט במלוא העוצמה, עם "רוויה" עדינה שמוסיפה הרמוניות
ונשמעת חזקה יותר מסינוס נקי. אורך 12 שניות, כמו קודם.

הרצה: python3 scripts/generate-alarm.py
"""
import math
import struct
import wave

RATE = 22050
SECONDS = 12.0
TONES = (2900.0, 2200.0)   # הרץ
BEEP = 0.22                # שניות לכל טון
GAP = 0.03                 # שקט קצר בין טונים - נשמע דחוף יותר מצליל רציף
FADE = 0.004               # כניסה ויציאה רכות, בלי "קליקים"
DRIVE = 2.5                # רוויה: מוסיף הרמוניות ועוצמה נשמעת
PEAK = 0.97                # שוליים קטנים מתחת למקסימום, בלי עיוות דיגיטלי

out = []
t = 0.0
i = 0
norm = math.tanh(DRIVE)
while t < SECONDS:
    freq = TONES[i % 2]
    n = int(BEEP * RATE)
    for k in range(n):
        if t + k / RATE >= SECONDS:
            break
        x = math.sin(2 * math.pi * freq * k / RATE)
        x = math.tanh(DRIVE * x) / norm
        env = min(1.0, k / (FADE * RATE), (n - k) / (FADE * RATE))
        out.append(x * env * PEAK)
    t += BEEP
    gap = int(GAP * RATE)
    out.extend([0.0] * gap)
    t += GAP
    i += 1

out = out[: int(SECONDS * RATE)]
with wave.open('assets/warning_alarm.wav', 'wb') as w:
    w.setnchannels(1)
    w.setsampwidth(2)
    w.setframerate(RATE)
    w.writeframes(b''.join(struct.pack('<h', int(max(-1, min(1, s)) * 32767)) for s in out))
print('wrote assets/warning_alarm.wav', len(out) / RATE, 'sec')

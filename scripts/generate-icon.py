"""
מייצר את אייקון האפליקציה: מגן לבן עם וי כחול, על רקע כחול המותג.

אותו סמל כמו במסך הפתיחה (shield-checkmark), כדי שהאייקון בטלפון והאפליקציה
עצמה ייראו כמו מוצר אחד. מצויר בקוד ולא בתוכנת עיצוב - כדי שכל שינוי צבע
יהיה שורה אחת כאן.

הרצה:  python3 scripts/generate-icon.py
יוצר: assets/icon.png (1024, רקע מלא), assets/adaptive-icon.png (חזית שקופה
לאנדרואיד - הרקע נקבע ב-app.json, adaptiveIcon.backgroundColor), ו-
assets/notification-icon.png (צללית לבנה לשורת ההתראות; אנדרואיד צובע אותה).
"""
from PIL import Image, ImageDraw

PRIMARY_TOP = (59, 106, 245)   # #3B6AF5
PRIMARY_BOTTOM = (31, 67, 196)  # #1F43C4
PRIMARY = (47, 91, 234)        # #2F5BEA
SS = 4                         # supersampling להחלקת קצוות
SIZE = 1024


def quad(p0, p1, p2, n=40):
    return [
        (
            (1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0],
            (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1],
        )
        for t in (i / n for i in range(n + 1))
    ]


def shield(cx, top, w, h):
    l, r = cx - w / 2, cx + w / 2
    shoulder = top + h * 0.14
    side_end = top + h * 0.52
    pts = []
    pts += quad((l, shoulder), (cx, top - h * 0.04), (r, shoulder))
    pts += [(r, side_end)]
    pts += quad((r, side_end), (r - w * 0.02, top + h * 0.86), (cx, top + h))
    pts += quad((cx, top + h), (l + w * 0.02, top + h * 0.86), (l, side_end))
    return pts


def draw_mark(img, scale, offset_y=0):
    """המגן והוי, ממורכזים. scale = חלק מרוחב התמונה שהמגן תופס."""
    d = ImageDraw.Draw(img)
    W = img.width
    w = W * scale
    h = w * 1.18
    cx = W / 2
    top = (W - h) / 2 + offset_y * W
    d.polygon(shield(cx, top, w, h), fill=(255, 255, 255, 255))
    # וי
    stroke = w * 0.115
    a = (cx - w * 0.22, top + h * 0.50)
    b = (cx - w * 0.05, top + h * 0.66)
    c = (cx + w * 0.25, top + h * 0.34)
    d.line([a, b, c], fill=PRIMARY + (255,), width=int(stroke), joint='curve')
    for p in (a, c):
        rr = stroke / 2
        d.ellipse([p[0] - rr, p[1] - rr, p[0] + rr, p[1] + rr], fill=PRIMARY + (255,))


def gradient(size):
    g = Image.new('RGBA', (size, size))
    px = g.load()
    for y in range(size):
        t = y / (size - 1)
        col = tuple(int(PRIMARY_TOP[i] + (PRIMARY_BOTTOM[i] - PRIMARY_TOP[i]) * t) for i in range(3)) + (255,)
        for x in range(size):
            px[x, y] = col
    return g


def main():
    big = SIZE * SS
    icon = gradient(big)
    draw_mark(icon, 0.50, offset_y=0.01)
    icon.resize((SIZE, SIZE), Image.LANCZOS).save('assets/icon.png')

    # אנדרואיד חותך את החזית לעיגול/צורה בתוך 66% האמצעיים - לכן קטן יותר.
    fg = Image.new('RGBA', (big, big), (0, 0, 0, 0))
    draw_mark(fg, 0.40, offset_y=0.008)
    fg.resize((SIZE, SIZE), Image.LANCZOS).save('assets/adaptive-icon.png')

    # אייקון התראה: מגן לבן עם וי שקוף (אנדרואיד משתמש רק בשקיפות).
    n = 256 * SS
    note = Image.new('RGBA', (n, n), (0, 0, 0, 0))
    draw_mark(note, 0.66)
    px = note.load()
    for y in range(n):
        for x in range(n):
            r, g, b, a = px[x, y]
            if a and (r, g, b) != (255, 255, 255):
                px[x, y] = (0, 0, 0, 0)
    note.resize((256, 256), Image.LANCZOS).save('assets/notification-icon.png')


if __name__ == '__main__':
    main()

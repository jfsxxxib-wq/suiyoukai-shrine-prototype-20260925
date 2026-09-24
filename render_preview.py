"""Draw static review images for the shrine screen without opening a browser."""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parent
SCALE = 2
WIDTH, HEIGHT = 450, 900
FONT = r"C:\Windows\Fonts\YuGothM.ttc"
BOLD = r"C:\Windows\Fonts\YuGothB.ttc"

BG = "#f6f8f6"
WHITE = "#ffffff"
INK = "#213036"
GREEN = "#285b48"
MUTED = "#64766d"
BORDER = "#dce7df"
PALE = "#f0f7f1"


def font(size, bold=False):
    return ImageFont.truetype(BOLD if bold else FONT, size * SCALE)


def xy(value):
    return tuple(round(part * SCALE) for part in value)


def box(draw, bounds, fill=WHITE, outline=BORDER, radius=14, width=1):
    draw.rounded_rectangle(
        xy(bounds), radius=radius * SCALE, fill=fill, outline=outline, width=width * SCALE
    )


def line(draw, bounds, color=BORDER, width=1):
    draw.line(xy(bounds), fill=color, width=width * SCALE)


def text(draw, x, y, value, size=16, fill=INK, bold=False):
    draw.text(xy((x, y)), value, font=font(size, bold), fill=fill)


def base(height=HEIGHT):
    image = Image.new("RGB", (WIDTH * SCALE, height * SCALE), BG)
    draw = ImageDraw.Draw(image)
    draw.rectangle(xy((0, 0, WIDTH, 58)), fill=WHITE)
    line(draw, (0, 58, WIDTH, 58))
    text(draw, 20, 16, "水曜会ポータル", 18, GREEN, True)
    box(draw, (336, 13, 429, 44), "#fff2d4", "#fff2d4", 16)
    text(draw, 349, 19, "画面見本", 13, "#73551c", True)
    return image, draw


def field(draw, bounds, label, value, small=False):
    x1, y1, x2, y2 = bounds
    text(draw, x1, y1, label, 14, INK, True)
    box(draw, (x1, y1 + 25, x2, y2), WHITE, "#b8cbc0", 9)
    text(draw, x1 + 11, y1 + 34, value, 15 if small else 17)


def button(draw, bounds, label, primary=False):
    fill = GREEN if primary else WHITE
    outline = GREEN if primary else "#aac9b8"
    color = WHITE if primary else GREEN
    box(draw, bounds, fill, outline, 9)
    x1, y1, _, _ = bounds
    text(draw, x1 + 14, y1 + 8, label, 15, color, True)


def draw_participants():
    image, draw = base(970)
    text(draw, 20, 82, "組み合わせ神社", 30, GREEN, True)
    text(draw, 20, 127, "参加者を入れて組み合わせを作ります", 15, MUTED)
    button(draw, (20, 171, 210, 216), "大会対戦", True)
    button(draw, (220, 171, 430, 216), "ペア・団体")

    box(draw, (20, 234, 430, 765))
    text(draw, 39, 256, "参加者", 22, INK, True)
    button(draw, (241, 248, 411, 289), "保存した名簿を開く")
    text(draw, 39, 314, "名前または組番号を1行に1つ", 14, INK, True)
    box(draw, (39, 344, 411, 454), WHITE, "#b8cbc0", 9)
    text(draw, 52, 356, "参加者A", 16)
    text(draw, 52, 382, "参加者B", 16)
    text(draw, 52, 408, "参加者C", 16)
    line(draw, (39, 479, 411, 479))
    text(draw, 39, 492, "1人ずつ追加", 18, INK, True)
    field(draw, (39, 529, 230, 592), "名前", "例：佐藤さん", True)
    field(draw, (244, 529, 411, 592), "性別", "未設定  ▼")
    field(draw, (39, 607, 230, 670), "棋力の種類", "級・段・点数  ▼", True)
    field(draw, (244, 607, 411, 670), "数値", "例：-10、100", True)
    button(draw, (39, 684, 411, 726), "参加者へ追加", True)
    text(draw, 39, 734, "点数はマイナスも使えます", 13, MUTED)

    box(draw, (20, 785, 430, 950))
    text(draw, 39, 806, "大会対戦", 21, INK, True)
    field(draw, (39, 848, 411, 909), "対戦方式", "トーナメント  ▼")
    image.save(ROOT / "preview-participants.png")


def draw_results():
    image, draw = base()
    text(draw, 20, 82, "組み合わせ神社", 30, GREEN, True)
    text(draw, 20, 127, "結果の確認と別端末への転送", 15, MUTED)

    box(draw, (20, 168, 430, 349))
    text(draw, 39, 190, "今回の結果", 22, INK, True)
    box(draw, (39, 233, 411, 287), PALE, "#c8ddcf", 9)
    text(draw, 53, 247, "ここに対戦や組番号を表示します", 15)
    button(draw, (39, 300, 196, 336), "結果をコピー")
    button(draw, (207, 300, 411, 336), "この結果を保存")

    box(draw, (20, 367, 430, 589))
    text(draw, 39, 389, "結果", 22, INK, True)
    text(draw, 321, 395, "最新5回まで", 13, MUTED)
    line(draw, (39, 436, 411, 436))
    text(draw, 39, 449, "トーナメント", 16, INK, True)
    text(draw, 39, 480, "9月24日　参加者8人", 14, MUTED)
    line(draw, (39, 519, 411, 519))
    text(draw, 39, 532, "ペア・団体", 16, INK, True)
    text(draw, 39, 563, "9月17日　4人組を2組", 14, MUTED)

    box(draw, (20, 607, 430, 870))
    text(draw, 39, 629, "別の端末へ転送", 21, INK, True)
    text(draw, 39, 668, "名簿と保存した結果をコピーして", 15)
    text(draw, 39, 695, "別の端末で貼り付けて取り込めます", 15)
    box(draw, (39, 735, 411, 779), PALE, "#c8ddcf", 9)
    text(draw, 51, 745, "取り込み前に内容を確認します", 14)
    button(draw, (39, 797, 196, 839), "転送用にコピー")
    button(draw, (207, 797, 411, 839), "貼り付けて取り込む")
    image.save(ROOT / "preview-results.png")


if __name__ == "__main__":
    draw_participants()
    draw_results()

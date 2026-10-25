"""Build A6 press files (3 mm bleed, embedded fonts, vector QR). No network/DB."""
from pathlib import Path
from reportlab.pdfgen import canvas
from reportlab.lib.units import mm
from reportlab.lib.colors import HexColor
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.graphics.barcode.qr import QrCodeWidget
from reportlab.graphics.shapes import Drawing
from reportlab.graphics import renderPDF
import pymupdf as fitz

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public/marketing/comics/fokusniki'
FONTS = Path('C:/Windows/Fonts')
for name, file in [('Sans', 'arial.ttf'), ('Bold', 'arialbd.ttf'), ('Serif', 'georgiab.ttf')]:
    pdfmetrics.registerFont(TTFont(name, str(FONTS / file)))
W, H, B = 105 * mm, 148 * mm, 3 * mm
PAGE = (W + 2 * B, H + 2 * B)
BLACK, GOLD, WHITE = map(HexColor, ['#080b0d', '#e8bd7b', '#f7f0e4'])

def text(c, x, y, value, size=10, font='Sans', color=WHITE, center=False):
    c.setFillColor(color)
    c.setFont(font, size)
    (c.drawCentredString if center else c.drawString)(x * mm, y * mm, value)

def base(c):
    c.setFillColor(BLACK)
    c.rect(0, 0, *PAGE, fill=1, stroke=0)
    c.setTrimBox((B, B, W + B, H + B))
    c.setBleedBox((0, 0, *PAGE))
    c.saveState()
    c.translate(B, B)

def back(c):
    base(c)
    c.drawImage(str(ROOT / 'public/icons/vedelo-v1/android/android-launchericon-512-512.png'),
                5 * mm, 132 * mm, 10 * mm, 10 * mm, mask='auto')
    text(c, 19, 134, 'Ведело', 23, 'Bold', GOLD)
    text(c, 5, 126, 'ДЛЯ ФОКУСНИКОВ И ИЛЛЮЗИОНИСТОВ', 8, 'Bold', GOLD)
    text(c, 5, 114, 'Начните бесплатно.', 23, 'Serif')
    text(c, 5, 106, 'Заявки, клиенты, расписание и учёт оплат.', 9)
    text(c, 5, 100.5, 'До 8 новых заявок и заказов в месяц — за 0 ₽.', 8.5)
    c.setStrokeColor(GOLD)
    c.setLineWidth(0.5)
    c.line(5 * mm, 96 * mm, 100 * mm, 96 * mm)
    text(c, 5, 88.5, 'По FOCUS — все функции «БИЗНЕС»', 12.5, 'Bold')
    text(c, 5, 81.5, 'ПОЖИЗНЕННАЯ СКИДКА 50%', 13, 'Bold', GOLD)
    text(c, 5, 69, '400', 32, 'Bold', GOLD)
    text(c, 30, 70, '₽ / месяц', 12, 'Bold', GOLD)
    text(c, 70, 74, '800 ₽', 12, 'Sans')
    c.setStrokeColor(WHITE)
    c.line(69.5 * mm, 75.3 * mm, 83 * mm, 75.3 * mm)
    text(c, 70, 69, 'Тариф BRO', 8.5, 'Bold', GOLD)
    features = [
        'Без лимита заявок и заказов',
        'Договоры, акты и документы',
        'Коммерческие предложения и отзывы',
        'ИИ: 300 ₽ включено в месяц*',
        'Avito, VK и Telegram Business',
        'IP-телефония*',
    ]
    for i, line in enumerate(features):
        text(c, 5, 62 - i * 5, '• ' + line, 7.7)
    # Actual URL, vector modules and a full four-module quiet zone on white.
    qr = QrCodeWidget('https://vedelo.ru', barLevel='M', barBorder=4)
    x0, y0, x1, y1 = qr.getBounds()
    size = 30 * mm
    drawing = Drawing(size, size, transform=[size / (x1-x0), 0, 0, size / (y1-y0), 0, 0])
    drawing.add(qr)
    c.setFillColor(HexColor('#ffffff'))
    c.rect(70 * mm, 36 * mm, size, size, fill=1, stroke=0)
    renderPDF.draw(drawing, c, 70 * mm, 36 * mm)
    text(c, 85, 31.5, 'vedelo.ru', 10, 'Bold', GOLD, True)
    text(c, 5, 28, '*Номер и звонки — отдельно. ИИ сверх лимита — с баланса.', 6.4)
    c.setFillColor(GOLD)
    c.roundRect(5 * mm, 14 * mm, 95 * mm, 11 * mm, 1.5 * mm, fill=1, stroke=0)
    text(c, 9, 18, 'ПРОМОКОД', 9, 'Bold', BLACK)
    text(c, 53, 17, 'FOCUS', 23, 'Bold', BLACK)
    text(c, 52.5, 9, 'Регистрация → Настройки → Промокод → Выберите BRO', 7.5, center=True)
    text(c, 52.5, 4.5, 'Активируйте до 31.10.2026 включительно. Скидка — навсегда.', 7.2, 'Bold', GOLD, True)
    c.restoreState()
    c.showPage()

def front(c):
    base(c)
    # Preserve the complete existing comic, including its footer.
    # Match the reverse's 5 mm frame on every side. The small aspect-ratio
    # adjustment keeps the complete comic and avoids cropping any text.
    margin = 5 * mm
    c.drawImage(str(OUT / 'poster.png'), margin, margin,
                width=W - 2 * margin, height=H - 2 * margin)
    c.restoreState()
    c.showPage()

for filename, duplex in [('flyer-back-a6.pdf', False), ('flyer-duplex-a6.pdf', True)]:
    c = canvas.Canvas(str(OUT / filename), pagesize=PAGE, pageCompression=1)
    c.setTitle('Ведело — FOCUS — флаер A6')
    c.setAuthor('Ведело')
    if duplex:
        front(c)
    back(c)
    c.save()

doc = fitz.open(OUT / 'flyer-back-a6.pdf')
doc[0].get_pixmap(matrix=fitz.Matrix(3, 3)).save(OUT / 'flyer-back-a6.png')
duplex = fitz.open(OUT / 'flyer-duplex-a6.pdf')
duplex[0].get_pixmap(matrix=fitz.Matrix(3, 3)).save(OUT / 'flyer-front-a6.png')
print('Created A6 PDFs: 105 x 148 mm trim; 3 mm bleed; vector QR https://vedelo.ru')

from pathlib import Path
import math, shutil, zipfile
import fitz
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.colors import HexColor
from PIL import Image

ROOT = Path('D:/Programming/Projects/vedelo')
OUT = ROOT / 'output/merch/vedelo-print'
OUT.mkdir(parents=True, exist_ok=True)
MM = 72 / 25.4
pdfmetrics.registerFont(TTFont('ArialBold', 'C:/Windows/Fonts/arialbd.ttf'))
GOLD = '#A76B18'
BROWN = '#3B210E'

def logo(c, x, y, w):
    # Original brand vector; y is top edge, coordinates on canvas point down.
    c.saveState()
    c.translate(x, y)
    s = w / 292
    c.scale(s, s)
    c.translate(-112, -80)
    # Rounded check stroke converted to a polygon, used as a transparent cutout.
    a, b, d = (151,260), (210,318), (315,202)
    r=23
    u1=math.atan2(b[1]-a[1], b[0]-a[0])
    u2=math.atan2(d[1]-b[1], d[0]-b[0])
    def arc(p,start,end,n=32):
        return [(p[0]+r*math.cos(start+(end-start)*i/n),p[1]+r*math.sin(start+(end-start)*i/n)) for i in range(n+1)]
    # Outer join follows right side of the downward-left coordinate frame.
    points=arc(a,u1+math.pi/2,u1+3*math.pi/2)
    n1=(math.sin(u1)*r,-math.cos(u1)*r)
    n2=(math.sin(u2)*r,-math.cos(u2)*r)
    # Inner offset line intersection.
    v1=(math.cos(u1),math.sin(u1)); v2=(math.cos(u2),math.sin(u2))
    p1=(b[0]+n1[0],b[1]+n1[1]); p2=(b[0]+n2[0],b[1]+n2[1])
    cross=lambda p,q:p[0]*q[1]-p[1]*q[0]
    t=cross((p2[0]-p1[0],p2[1]-p1[1]),v2)/cross(v1,v2)
    points.append((p1[0]+t*v1[0],p1[1]+t*v1[1]))
    points += arc(d,u2-math.pi/2,u2+math.pi/2)
    points += arc(b,u2+math.pi/2,u1+math.pi/2)
    clip=c.beginPath(); clip.rect(0,0,512,512)
    clip.moveTo(*points[0])
    for p in points[1:]: clip.lineTo(*p)
    clip.close()
    c.clipPath(clip,stroke=0,fill=0,fillMode=0)
    p=c.beginPath()
    p.moveTo(112,80); p.lineTo(270,80)
    p.curveTo(344,80,388,114,388,172)
    p.curveTo(388,202,373,225,342,240)
    p.lineTo(242,322); p.lineTo(112,207); p.close()
    p.moveTo(112,202); p.lineTo(245,315); p.lineTo(299,263)
    p.curveTo(363,272,404,310,404,358)
    p.curveTo(404,408,352,432,264,432)
    p.lineTo(112,432); p.close()
    c.setFillColor(HexColor(GOLD)); c.drawPath(p,fill=1,stroke=0,fillMode=1)
    c.restoreState()

def lettering(c,text,x,top,width,height,color):
    size=height/0.716
    natural=pdfmetrics.stringWidth(text,'ArialBold',size)
    c.saveState(); c.translate(x,top+height); c.scale(width/natural,-1)
    c.setFillColor(HexColor(color)); c.setFont('ArialBold',size)
    c.drawString(0,0,text); c.restoreState()

def create(name,w,h,draw):
    pdf=OUT/(name+'.pdf')
    c=canvas.Canvas(str(pdf),pagesize=(w*MM,h*MM))
    c.setTitle('Ведело — '+name+' — 1:1')
    c.translate(0,h*MM); c.scale(MM,-MM)
    draw(c); c.showPage(); c.save()
    doc=fitz.open(pdf); page=doc[0]
    (OUT/(name+'.svg')).write_text(page.get_svg_image(text_as_path=True),encoding='utf-8')
    pix=page.get_pixmap(dpi=300,alpha=True)
    pix.save(OUT/(name+'.png'))
    im=Image.open(OUT/(name+'.png'))
    im.save(OUT/(name+'.png'),dpi=(300,300))
    # Review on the shirt's cream background; not a print deliverable.
    bg=Image.new('RGBA',im.size,'#FAF4E8'); bg.alpha_composite(im)
    bg.thumbnail((1000,1000)); bg.convert('RGB').save(ROOT/('tmp/merch/'+name+'-review.jpg'))
    print(name, 'page_mm',tuple(round(v/MM,2) for v in page.rect[2:]), 'pixels',im.size,'alpha',im.getchannel('A').getextrema(),'fonts',len(page.get_fonts()))

def front(c):
    logo(c,0,0,23)
    lettering(c,'Ведело',27,7,73,16,BROWN)

def back(c):
    logo(c,109,0,62)
    lettering(c,'Веди дело',0,97,280,42,BROWN)
    lettering(c,'вместе с',57,157,166,25,BROWN)
    lettering(c,'Ведело',12.5,188,255,52,GOLD)

create('01-front-100mm',100,28,front)
create('02-back-280mm',280,255,back)
shutil.copy2('C:/Users/Escal/.codex/generated_images/01a17bd6-753f-7b53-b124-c5310022ddbe/exec-3908b30a-5b83-40f4-a481-7834a9978b0d.png',OUT/'03-placement-reference-NOT-FOR-PRINT.png')
(OUT/'README-ПЕЧАТЬ.txt').write_text('''ВЕДЕЛО — ФАЙЛЫ ДЛЯ ПЕЧАТИ НА ФУТБОЛКЕ

01-front-100mm: грудь, ширина 100 мм, холст 100 × 28 мм.
02-back-280mm: спина, ширина 280 мм, холст 280 × 255 мм.
Размеры предложены для взрослой футболки; перед нанесением согласовать их с владельцем на выбранном размере изделия.

PDF — вектор, натуральный размер 1:1, Arial Bold встроен.
SVG — вектор, весь текст переведён в контуры; шрифты не требуются.
PNG — прозрачный фон, 300 dpi, тот же физический размер.
Использовать один подходящий формат для каждой стороны. Не печатать все форматы!
Печатать без подгонки под лист и без добавления фона. Не зеркалить исходники; зеркалирование при необходимости выполняет оператор оборудования.
Светлые участки внутри логотипа — прозрачные вырезы, через которые видна ткань.

РАЗМЕЩЕНИЕ
Перед: на левой груди владельца, ориентир — приложенный визуал.
Спина: по центральной оси, верх логотипа ориентировочно 12–14 см ниже шва воротника. Логотип и текст переносятся одним блоком с сохранением расстояний. Точное положение согласовать на самой футболке до нанесения.
03-placement-reference-NOT-FOR-PRINT.png — только визуал размещения, НЕ исходник принта.

ЦВЕТА
Однотонная охра RGB #A76B18; тёмно-коричневый RGB #3B210E.
Предполагается молочная/светлая ткань. Фон ткани не включён в принт.
Цвета заданы в RGB; перевод под оборудование и профиль выполняет типография. Pantone/CMYK не назначены. Проверить цветопробу на выбранной ткани.

Принты воссозданы в векторе по утверждённому визуалу с исходным знаком бренда. Шрифт Arial Bold; небольшие отличия от сгенерированного изображения возможны. Использована однотонная заливка без имитации теней и складок ткани.
''',encoding='utf-8-sig')
archive=OUT.parent/'vedelo-print-package.zip'
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED) as z:
    for p in OUT.iterdir(): z.write(p,p.name)
print(archive)


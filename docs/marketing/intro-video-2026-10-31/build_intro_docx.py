from pathlib import Path
import re
from docx import Document
from docx.shared import Mm, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn

base = Path(__file__).resolve().parent
source = (base.parent / 'VEDELO_VIDEO_SCRIPTS.md').read_text(encoding='utf-8')
intro = source.split('## 00 Что такое Ведело и кто его создаёт', 1)[1].split('## 01 Регистрация и первая настройка', 1)[0]
voice = re.findall(r'^> (.+)$', intro, flags=re.M)
assert len(voice) == 7

doc = Document()
for border in doc.styles.element.xpath('.//w:pBdr'):
    border.getparent().remove(border)
for border in doc.element.xpath('.//w:pBdr'):
    border.getparent().remove(border)
sec = doc.sections[0]
sec.page_width, sec.page_height = Mm(210), Mm(297)
sec.top_margin, sec.bottom_margin = Mm(17), Mm(17)
sec.left_margin, sec.right_margin = Mm(20), Mm(20)
sec.header_distance, sec.footer_distance = Mm(8), Mm(8)
for name in ['Normal', 'Title', 'Subtitle', 'Heading 1', 'Heading 2']:
    style = doc.styles[name]
    style.font.name = 'Arial'
    style.font.color.rgb = RGBColor(0, 0, 0)
    style.element.get_or_add_rPr().append(OxmlElement('w:lang'))
    style.element.rPr.find(qn('w:lang')).set(qn('w:val'), 'ru-RU')
doc.styles['Normal'].font.size = Pt(12)
doc.styles['Normal'].paragraph_format.line_spacing = 1.12
doc.styles['Normal'].paragraph_format.space_after = Pt(7)
doc.styles['Title'].font.size = Pt(23)
doc.styles['Title'].paragraph_format.space_after = Pt(8)
doc.styles['Heading 1'].font.size = Pt(16)
doc.styles['Heading 1'].paragraph_format.space_after = Pt(8)
doc.styles['Heading 2'].font.size = Pt(11)
doc.styles['Heading 2'].font.bold = True
doc.styles['Heading 2'].paragraph_format.space_before = Pt(9)
doc.styles['Heading 2'].paragraph_format.space_after = Pt(3)

header = sec.header.paragraphs[0]
header.text = 'ВЕДЕЛО   /   СЪЁМКА ВСТУПЛЕНИЯ   /   31 ОКТЯБРЯ 2026'
header.runs[0].font.size = Pt(8)
footer = sec.footer.paragraphs[0]
footer.alignment = WD_ALIGN_PARAGRAPH.RIGHT
footer.add_run('Сценарий 00   •   ')
field = OxmlElement('w:fldSimple'); field.set(qn('w:instr'), 'PAGE')
footer._p.append(field)
for run in footer.runs:
    run.font.size = Pt(9)

doc.add_paragraph('Вступление для главной страницы Ведело', style='Title')
doc.add_paragraph('Текст для записи в камеру', style='Subtitle')
doc.add_paragraph('Версия 3. Примерно 100–120 секунд. Вы слева, вставки справа. Замените [имя] своим именем. Указания над абзацами вслух не произносятся.')
labels = [
    '1  Знакомство и опыт   Только ведущий',
    '2  Личная история   Только ведущий',
    '3  От своей практики к разным специальностям   Только ведущий',
    '4  Договорённости   Справа 01-order.mp4',
    '5  Следующий шаг   Справа 02-next-contact.mp4',
    '6  Оплаты   Справа 03-payments.mp4',
    '7  Бесплатные возможности   Только ведущий',
]
for label, text in zip(labels, voice):
    doc.add_paragraph(label, style='Heading 2')
    p = doc.add_paragraph(text)
    p.paragraph_format.keep_together = True

doc.add_page_break()
doc.add_paragraph('Памятка для съёмки и монтажа', style='Title')
doc.add_paragraph('Сначала запишите спокойное обращение. Затем поставьте три готовых сюжета под соответствующие фразы. Полный ролик должен оставаться понятным и без вставок.')
doc.add_paragraph('Перед записью', style='Heading 1')
for text in [
    'Телефон горизонтально на стойке, камера примерно на уровне глаз. Ориентир для записи — 1080p и 30 кадров в секунду.',
    'Вы занимаете левые 55% кадра. Лицо, логотип на майке и жесты остаются в этой области. Справа оставьте свободное место.',
    'Свет направлен на лицо, фон спокойный. Посмотрите в объектив, а не на своё изображение на экране.',
    'Подключите DJI-петличку и проверьте короткую запись именно в приложении камеры. Микрофон не должен тереться об одежду.',
    'Сделайте два или три дубля. Можно записывать семь блоков отдельно. Оставляйте две секунды тишины до и после каждого блока.',
]:
    doc.add_paragraph(text, style='List Bullet')

doc.add_paragraph('Куда поставить вставки', style='Heading 1')
for label, text in [
    ('01-order.mp4', 'Запустите на словах «Здесь можно собрать всё рядом с заказом». Показаны клиент, услуга, дата и стоимость.'),
    ('02-next-contact.mp4', 'Запустите на словах «Следующий шаг тоже можно записать сразу». Показана задача связаться с Анной.'),
    ('03-payments.mp4', 'Запустите на словах «По заказу можно учитывать уже полученные деньги». Получено 1 000 ₽, осталось 2 000 ₽.'),
]:
    p = doc.add_paragraph()
    p.add_run(label + '  ').bold = True
    p.add_run(text)

doc.add_paragraph('Каждый файл длится 7 секунд и не содержит звука. Говорите в своём темпе. Если нужно удержать изображение дольше, заморозьте читаемый кадр из середины фрагмента. У первых двух файлов последние 0,3 секунды — плавный выход.')
doc.add_paragraph('Положение панели', style='Heading 1')
doc.add_paragraph('Итоговый кадр: 1920 × 1080. Вставка: 864 × 1080, без обрезки, на всю высоту у правого края. Левый верхний угол вставки: x = 1056, y = 0. В начале и конце обращения оставьте только ведущего.')
doc.add_paragraph('В финале можно добавить титр «Базовые возможности — бесплатно» и ниже «Условия и лимиты — в тарифах». Бесплатный тариф подтверждён на vedelo.ru 31 октября 2026 года. Конкретные цены и лимиты в речь не включены, чтобы видео не устарело.')
doc.add_paragraph('Учебные карточки уже подготовлены. Аккаунт и заказ для этого вступления создавать не требуется. Версия 3 заменяет предыдущий сценарий 00; остальные учебные ролики остаются без изменений.')

doc.core_properties.title = 'Вступление для главной страницы Ведело'
doc.core_properties.subject = 'Сценарий 00 и памятка для съёмки'
doc.core_properties.language = 'ru-RU'
out = base / '00-intro-script-v3.docx'
doc.save(out)
print(out)
print('Voice words:', sum(len(text.split()) for text in voice))

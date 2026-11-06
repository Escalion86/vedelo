from pathlib import Path
import sys

BASE = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE / 'qa/qr-libs'))
import qrcode
import zxingcpp

URL = 'https://vedelo.ru'
qr = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_Q, box_size=8, border=4)
qr.add_data(URL)
qr.make(fit=True)
image = qr.make_image(fill_color='#171717', back_color='#ffffff').convert('RGB')
(BASE / 'assets').mkdir(exist_ok=True)
target = BASE / 'assets/vedelo-qr.png'
image.save(target)
codes = zxingcpp.read_barcodes(image)
assert any(code.text == URL for code in codes), 'QR verification failed'
print(f'QR verified: {URL}; {image.width} x {image.height}')

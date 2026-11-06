from pathlib import Path
import argparse
import importlib.util

BASE = Path(__file__).resolve().parent
module_spec = importlib.util.spec_from_file_location('previous_edit', BASE.parent / 'v2/build_video.py')
edit = importlib.util.module_from_spec(module_spec)
module_spec.loader.exec_module(edit)
edit.BASE = BASE
edit.CTA_FILE = BASE / 'assets/cta.png'
edit.CREDIT_FILE = BASE / 'assets/credit.png'
edit.CREDIT_POSITION = (28, 26)
edit.OUTPUT_STEM = 'vedelo-home-v3'

parser = argparse.ArgumentParser()
parser.add_argument('action', choices=['preview', 'render', 'export'])
parser.add_argument('--time', type=float, default=105)
args = parser.parse_args()
if args.action == 'preview': edit.compose(args.time)
elif args.action == 'render': edit.compose()
else: edit.export()

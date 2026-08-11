import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

import backend.ocr as ocr
import backend.matcher as matcher
import backend.spreadsheet as spreadsheet

s = spreadsheet.load_sheet(str(ROOT / 'sample-member-sheet.csv'))
print('members', len(s['members']))
print('name_col', s['name_column'])
print('month_cols', s['month_columns'])
print('match', matcher.match_name('M.I. MUHAMMADH', s['members']))
print('month', matcher.find_month_column('Aug'))

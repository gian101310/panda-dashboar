"""Verified US PPI actuals when the calendar feed supplies forecasts only.

Install the optional PDF reader with: py -3.11 -m pip install -r requirements-news.txt
Unsupported events remain unresolved; a forecast is never substituted for actual.
"""
import io
import json
import os
import re
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import requests


MARK_FILE = Path(__file__).with_name('news_result_marks.json')
PPI_CACHE = {}
PPI_TITLES = {'PPI m/m', 'Core PPI m/m', 'PPI y/y', 'Core PPI y/y'}


def parse_ppi_release(text, release_date):
    """Require this release's embargo date and exact aggregate table series."""
    flat = re.sub(r'\s+', ' ', text)
    date_label = f'{release_date.strftime("%B")} {release_date.day}, {release_date.year}'
    if not re.search(r'embargoed until.{0,100}' + re.escape(date_label), flat, re.I):
        return {}
    heading = re.search(r'PRODUCER PRICE INDEXES\s*[^A-Za-z]*([A-Za-z]+)\s+(\d{4})', flat)
    table = re.search(r'Table 1\. Producer price index percentage changes.*?\[([A-Za-z]+)\s+(\d{4})\]', flat)
    if not heading or not table or heading.group(1).lower() != table.group(1).lower() or heading.group(2) != table.group(2):
        return {}
    values = {}
    number = r'(-?\d+\.\d+)'
    # Relative importance, annual change, then five monthly changes. Do not
    # confuse FD 49104 (core total) with FD 413 (core goods) or FD 49116.
    for code, prefix in [('4', ''), ('49104', 'Core ')]:
        row = re.search(r'\bFD\s+' + code + r'\s+' + r'\s+'.join([number] * 7) + r'(?![\d.])', flat[table.end():])
        if row:
            values[prefix + 'PPI m/m'] = row.group(7) + '%'
            values[prefix + 'PPI y/y'] = row.group(2) + '%'
    return values


def ppi_source_url(release_date):
    return f'https://www.dol.gov/newsroom/economicdata/ppi_{release_date:%m%d%Y}.pdf'


def fetch_ppi_results(release_date):
    """Cache successful reads; retry unavailable/new releases every five minutes."""
    key = release_date.isoformat()
    now = time.time()
    cached = PPI_CACHE.get(key)
    if cached and now - cached['at'] < (86400 if cached['data'] else 300):
        return cached['data']
    results = {}
    try:
        from pypdf import PdfReader
        response = requests.get(ppi_source_url(release_date), timeout=12)
        response.raise_for_status()
        reader = PdfReader(io.BytesIO(response.content))
        # Embargo date is on page 1. Find Table 1 rather than relying on its
        # page number (the report length changes between releases).
        first = reader.pages[0].extract_text() or ''
        for page in reader.pages:
            text = page.extract_text() or ''
            if 'Table 1. Producer price index percentage changes' in text:
                results = parse_ppi_release(first + '\n' + text, release_date)
                break
        if not results:
            print(f'[NEWS RESULT] PPI release {key}: date/table validation failed; will retry')
    except Exception as exc:
        # Exception text can include request URLs; only log the type.
        print(f'[NEWS RESULT] PPI source unavailable ({type(exc).__name__}); will retry')
    PPI_CACHE[key] = {'at': now, 'data': results}
    return results


def resolve_news_actual(event, event_dt):
    result = dict(event)
    if str(event.get('actual') or '').strip():
        return result
    title = (event.get('title') or '').strip()
    if (event.get('country') or '').upper() != 'USD' or title not in PPI_TITLES:
        return result
    # The calendar date may carry a Dubai/ET offset; the official filename
    # uses the release's US calendar date.
    release_date = event_dt.astimezone(timezone(timedelta(hours=-5))).date()
    actual = fetch_ppi_results(release_date).get(title)
    if actual:
        result.update(actual=actual, actual_source=ppi_source_url(release_date))
    return result


def load_sent_results(path=MARK_FILE):
    try:
        data = json.loads(Path(path).read_text(encoding='utf-8'))
        if not isinstance(data, dict):
            return {}
        cutoff = time.time() - 14 * 86400
        return {key: value for key, value in data.items()
                if isinstance(value, dict) and isinstance(value.get('sent_at'), (int, float)) and value['sent_at'] >= cutoff}
    except FileNotFoundError:
        return {}
    except Exception as exc:
        print(f'[NEWS RESULT] Cannot load delivery marks ({type(exc).__name__})')
        return {}


def mark_result_sent(key, message_id, path=MARK_FILE):
    marks = load_sent_results(path)
    marks[key] = {'sent_at': time.time(), 'message_id': message_id}
    path = Path(path)
    temp = path.with_suffix('.tmp')
    temp.write_text(json.dumps(marks), encoding='utf-8')
    os.replace(temp, path)

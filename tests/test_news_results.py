import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch
from contextlib import ExitStack
from types import SimpleNamespace

import news_results


RELEASE = '''Transmission of material in this release is embargoed until
8:30 a.m. (ET) Thursday, October 15, 2026
PRODUCER PRICE INDEXES - SEPTEMBER 2026
Table 1. Producer price index percentage changes and weights for Final Demand-Intermediate Demand
groupings, seasonally adjusted
[September 2026]
Final demand. . . . FD 4 100.000 6.3 0.5 -0.1 0.2 0.5 1.3
Final demand goods less foods and energy. . . FD 413 18.515 5.1 0.7 0.2 0.2 0.4 0.3
Final demand less foods and energy 5. . . FD 49104 89.487 5.0 0.0 0.4 0.3 0.2 0.7
'''


class NewsResultTests(unittest.TestCase):
    def test_official_table_maps_headline_and_core_without_using_core_goods(self):
        results = news_results.parse_ppi_release(RELEASE, datetime(2026, 10, 15).date())
        self.assertEqual(results['PPI m/m'], '1.3%')
        self.assertEqual(results['Core PPI m/m'], '0.7%')
        self.assertEqual(results['PPI y/y'], '6.3%')
        self.assertEqual(results['Core PPI y/y'], '5.0%')

    def test_wrong_release_date_and_missing_table_are_rejected(self):
        self.assertEqual(news_results.parse_ppi_release(RELEASE, datetime(2026, 11, 13).date()), {})
        self.assertEqual(news_results.parse_ppi_release(RELEASE.split('Table 1.')[0], datetime(2026, 10, 15).date()), {})

    def test_negative_and_unchanged_table_values(self):
        release = RELEASE.replace('0.5 1.3', '0.5 -0.2').replace('0.2 0.7', '0.2 0.0')
        results = news_results.parse_ppi_release(release, datetime(2026, 10, 15).date())
        self.assertEqual(results['PPI m/m'], '-0.2%')
        self.assertEqual(results['Core PPI m/m'], '0.0%')

    def test_missing_actual_uses_official_result_without_mutating_calendar(self):
        event = {'country': 'USD', 'title': 'Core PPI m/m', 'forecast': '0.3%'}
        with patch.object(news_results, 'fetch_ppi_results', return_value={'Core PPI m/m': '0.7%'}):
            result = news_results.resolve_news_actual(event, datetime(2026, 10, 15, 12, 30, tzinfo=timezone.utc))
        self.assertEqual(result['actual'], '0.7%')
        self.assertIn('dol.gov', result['actual_source'])
        self.assertNotIn('actual', event)

    def test_existing_actual_and_unrelated_events_do_not_fetch_ppi(self):
        event_dt = datetime(2026, 10, 15, 12, 30, tzinfo=timezone.utc)
        with patch.object(news_results, 'fetch_ppi_results', side_effect=AssertionError('unexpected fetch')):
            self.assertEqual(news_results.resolve_news_actual({'country': 'USD', 'title': 'PPI m/m', 'actual': '0.8%'}, event_dt)['actual'], '0.8%')
            self.assertNotIn('actual', news_results.resolve_news_actual({'country': 'JPY', 'title': 'PPI y/y'}, event_dt))

    def test_successful_delivery_survives_restart(self):
        with tempfile.TemporaryDirectory() as tmp:
            mark_file = Path(tmp) / 'marks.json'
            news_results.mark_result_sent('event_RESULT', 123, mark_file)
            marks = news_results.load_sent_results(mark_file)
            self.assertEqual(marks['event_RESULT']['message_id'], 123)
            self.assertEqual(news_results.load_sent_results(Path(tmp) / 'missing.json'), {})


class NewsResultDeliveryTests(unittest.TestCase):
    def run_checks(self, statuses, existing_marks=None):
        from test_snapshot_layout import _load_app
        app = _load_app()
        event = {'country': 'USD', 'title': 'PPI m/m', 'impact': 'High',
                 'date': '2026-10-15T16:30:00+04:00', 'forecast': '0.6%', 'previous': '0.4%'}
        sent = []
        persisted = {}

        class FixedDatetime(datetime):
            @classmethod
            def now(cls, tz=None):
                return cls(2026, 10, 15, 17, 30, tzinfo=timezone.utc)

        def post(*args, **kwargs):
            sent.append(kwargs['data']['text'])
            status = statuses[len(sent) - 1]
            if isinstance(status, Exception):
                raise status
            return SimpleNamespace(status_code=status, json=lambda: {'ok': status == 200, 'result': {'message_id': 88}})

        with ExitStack() as stack:
            for name, value in {
                'datetime': FixedDatetime, 'is_market_closed': lambda: False,
                'fetch_news_feed': lambda: [event],
                'build_news_panda_alignment': lambda *args: 'Panda alignment: unavailable right now.',
                'load_sent_results': lambda: existing_marks or {},
                'mark_result_sent': lambda key, mid: persisted.update({key: mid}),
            }.items():
                stack.enter_context(patch.object(app, name, value, create=True))
            stack.enter_context(patch.object(app.requests, 'post', post))
            stack.enter_context(patch.object(news_results, 'fetch_ppi_results', return_value={'PPI m/m': '1.3%'}))
            app.telegram_circuit.allow = lambda: True
            for _ in statuses:
                app.check_news_alerts()
        return sent, persisted

    def test_live_calendar_without_actual_sends_catchup_once(self):
        sent, persisted = self.run_checks([200, 200])
        self.assertEqual(len(sent), 1)
        self.assertIn('Actual: <b>1.3%</b>', sent[0])
        self.assertIn('dol.gov', sent[0])
        self.assertEqual(list(persisted.values()), [88])

    def test_telegram_failure_is_retried(self):
        sent, persisted = self.run_checks([503, 200])
        self.assertEqual(len(sent), 2)
        self.assertEqual(list(persisted.values()), [88])

    def test_telegram_timeout_is_retried(self):
        sent, persisted = self.run_checks([TimeoutError(), 200])
        self.assertEqual(len(sent), 2)
        self.assertEqual(list(persisted.values()), [88])

    def test_restart_does_not_repeat_delivered_result(self):
        key = 'USD_2026-10-15T16:30:00+04:00__PPI m/m_RESULT'
        sent, persisted = self.run_checks([200], {key: {'message_id': 88}})
        self.assertEqual(sent, [])
        self.assertEqual(persisted, {})


if __name__ == '__main__':
    unittest.main()

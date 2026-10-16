import json
import unittest
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import patch
from contextlib import ExitStack

import news_speeches


WHEN = datetime(2026, 10, 16, 3, 30, tzinfo=timezone.utc)
NOW = WHEN + timedelta(hours=3)
EVENT = {'title': 'Fed Chairman Warsh Speaks', 'country': 'USD', 'impact': 'High'}
URL = 'https://apnews.com/article/example'


def response(status='ready', url=URL, published=None, event_time=None):
    document = {'status': status, 'event_utc': event_time or WHEN.isoformat(),
                'bullets': ['The chair did not commit to a rate decision for the next meeting.'],
                'sources': [{'url': url, 'published_at': published or (WHEN + timedelta(hours=1)).isoformat()}]}
    return {'status': 'completed', 'output': [
        {'type': 'web_search_call', 'status': 'completed', 'action': {'sources': [{'url': URL}]}},
        {'type': 'message', 'content': [{'type': 'output_text', 'text': json.dumps(document)}]}]}


class SpeechSummaryTests(unittest.TestCase):
    def setUp(self):
        news_speeches.CACHE.clear()

    def test_only_us_fed_chair_speeches_are_supported(self):
        self.assertTrue(news_speeches.is_fed_chair_speech(EVENT))
        self.assertTrue(news_speeches.is_fed_chair_speech(dict(EVENT, title='Fed Chair Powell Speaks')))
        for fields in [{'title': 'FOMC Member Waller Speaks'}, {'title': 'PPI m/m'}, {'country': 'GBP'}]:
            self.assertFalse(news_speeches.is_fed_chair_speech(dict(EVENT, **fields)))

    def test_real_search_citation_and_matching_event_are_required(self):
        result = news_speeches.validate_response(response(), WHEN, NOW)
        self.assertEqual(result['status'], 'ready')
        self.assertEqual(result['sources'], [URL])
        for payload in [response(url='https://apnews.com.evil.test/article'),
                        response(event_time=(WHEN-timedelta(days=1)).isoformat()),
                        response(published=(WHEN-timedelta(days=1)).isoformat()),
                        response(published=(NOW+timedelta(hours=1)).isoformat())]:
            self.assertEqual(news_speeches.validate_response(payload, WHEN, NOW)['status'], 'pending')
        uncited = response(); uncited['output'] = uncited['output'][1:]
        self.assertEqual(news_speeches.validate_response(uncited, WHEN, NOW)['status'], 'pending')

    def test_empty_and_unfinished_responses_remain_pending(self):
        for payload in [{}, {'status': 'incomplete'}, response('pending')]:
            self.assertEqual(news_speeches.validate_response(payload, WHEN, NOW)['status'], 'pending')

    def test_missing_key_and_pre_event_do_not_call_api(self):
        with patch.object(news_speeches.requests, 'post', side_effect=AssertionError('unexpected API request')):
            self.assertEqual(news_speeches.resolve_speech_summary(EVENT, WHEN, '', NOW)['status'], 'pending')
            self.assertEqual(news_speeches.resolve_speech_summary(EVENT, WHEN, 'test', WHEN-timedelta(minutes=1))['status'], 'pending')

    def test_search_failure_is_cached_and_retryable(self):
        with patch.object(news_speeches.requests, 'post', side_effect=TimeoutError()) as post:
            self.assertEqual(news_speeches.resolve_speech_summary(EVENT, WHEN, 'test', NOW)['status'], 'pending')
            news_speeches.resolve_speech_summary(EVENT, WHEN, 'test', NOW+timedelta(minutes=1))
            self.assertEqual(post.call_count, 1)
            news_speeches.resolve_speech_summary(EVENT, WHEN, 'test', NOW+timedelta(minutes=31))
            self.assertEqual(post.call_count, 2)

    def test_verified_summary_is_cached_for_delivery_retry(self):
        with patch.object(news_speeches.requests, 'post', return_value=SimpleNamespace(
                raise_for_status=lambda: None, json=lambda: response())) as post:
            result = news_speeches.resolve_speech_summary(EVENT, WHEN, 'test', NOW)
            self.assertEqual(result['status'], 'ready')
            self.assertEqual(news_speeches.resolve_speech_summary(EVENT, WHEN, 'test', NOW+timedelta(minutes=2)), result)
            self.assertEqual(post.call_count, 1)

    def test_tracking_parameters_do_not_discard_real_citations(self):
        payload = response()
        payload['output'][0]['action']['sources'][0]['url'] = URL+'?utm_source=openai'
        self.assertEqual(news_speeches.validate_response(payload, WHEN, NOW)['status'], 'ready')

    def test_date_only_reports_and_stale_reports(self):
        payload = response()
        doc = json.loads(payload['output'][1]['content'][0]['text'])
        doc['sources'][0] = {'url': URL, 'published_date': '2026-10-16'}
        payload['output'][1]['content'][0]['text'] = json.dumps(doc)
        self.assertEqual(news_speeches.validate_response(payload, WHEN, NOW)['status'], 'ready')
        doc['sources'][0]['published_date'] = '2026-10-14'
        payload['output'][1]['content'][0]['text'] = json.dumps(doc)
        self.assertEqual(news_speeches.validate_response(payload, WHEN, NOW)['status'], 'pending')

    def test_prose_search_is_structured_without_losing_citation_checks(self):
        prose = {'status': 'completed', 'output': [
            {'type': 'web_search_call', 'status': 'completed', 'action': {'sources': [{'url': URL}]}},
            {'type': 'message', 'content': [{'type': 'output_text', 'text': 'Actual chair remarks on October 16, 2026.'}]}]}
        document = response()['output'][1]['content'][0]['text']
        replies = [SimpleNamespace(raise_for_status=lambda: None, json=lambda: prose),
                   SimpleNamespace(raise_for_status=lambda: None, json=lambda: {'choices': [{'message': {'content': document}}]})]
        with patch.object(news_speeches.requests, 'post', side_effect=replies) as post:
            self.assertEqual(news_speeches.resolve_speech_summary(EVENT, WHEN, 'test', NOW)['status'], 'ready')
            self.assertEqual(post.call_count, 2)


class SpeechDeliveryTests(unittest.TestCase):
    def run_delivery(self, reports, statuses=None, existing=None):
        from test_snapshot_layout import _load_app
        app = _load_app()
        event = dict(EVENT, date=WHEN.isoformat())
        sent, marks = [], dict(existing or {})

        class FixedDatetime(datetime):
            @classmethod
            def now(cls, tz=None):
                return NOW

        def post(*args, **kwargs):
            sent.append(kwargs['data']['text'])
            status = (statuses or [200]*len(reports))[len(sent)-1]
            if isinstance(status, Exception):
                raise status
            return SimpleNamespace(status_code=status, json=lambda: {'ok': status == 200, 'result': {'message_id': 99}})

        with ExitStack() as stack:
            for name, value in {
                'datetime': FixedDatetime, 'is_market_closed': lambda: False,
                'fetch_news_feed': lambda: [event], 'load_sent_results': lambda: marks,
                'mark_result_sent': lambda key, mid: marks.update({key: {'message_id': mid}}),
                'speech_api_key': lambda *args: 'test',
            }.items():
                stack.enter_context(patch.object(app, name, value))
            stack.enter_context(patch.object(app.requests, 'post', post))
            stack.enter_context(patch.object(app, 'resolve_speech_summary', side_effect=reports))
            stack.enter_context(patch.object(app, 'resolve_news_actual', side_effect=AssertionError('speech is not numeric')))
            app.telegram_circuit.allow = lambda: True
            for _ in reports:
                app.check_news_alerts()
        return sent, marks

    def test_non_numeric_speech_delivers_once(self):
        ready = {'status': 'ready', 'bullets': ['Reported remark <not HTML>.'], 'sources': [URL]}
        sent, marks = self.run_delivery([ready, ready])
        self.assertEqual(len(sent), 1)
        self.assertIn('POST-EVENT SUMMARY', sent[0])
        self.assertIn('&lt;not HTML&gt;', sent[0])
        self.assertIn(URL, sent[0])
        self.assertTrue(any(key.endswith('_SPEECH') for key in marks))

    def test_pending_notice_does_not_suppress_later_summary(self):
        pending = {'status': 'pending', 'bullets': [], 'sources': []}
        ready = {'status': 'ready', 'bullets': ['Reported actual remarks.'], 'sources': [URL]}
        sent, marks = self.run_delivery([pending, pending, ready, ready])
        self.assertEqual(len(sent), 2)
        self.assertIn('SUMMARY PENDING', sent[0])
        self.assertIn('POST-EVENT SUMMARY', sent[1])
        self.assertEqual(len(marks), 2)

    def test_telegram_failure_retries_same_summary(self):
        ready = {'status': 'ready', 'bullets': ['Reported actual remarks.'], 'sources': [URL]}
        sent, marks = self.run_delivery([ready, ready], [503, 200])
        self.assertEqual(len(sent), 2)
        self.assertEqual(len(marks), 1)

    def test_delivered_summary_survives_restart(self):
        key = f"USD_{WHEN.isoformat()}__{EVENT['title']}_SPEECH"
        sent, marks = self.run_delivery([{'status': 'pending'}], existing={key: {'message_id': 98}})
        self.assertEqual(sent, [])


if __name__ == '__main__':
    unittest.main()

import unittest
from unittest.mock import Mock, patch

from lib.signal_alert_outbox import DeliveryResult, delivery_update, dispatch_pending, send_signal_message


class SignalAlertOutboxTests(unittest.TestCase):
    def test_confirmed_message_requires_ok_and_message_id(self):
        post = Mock(return_value=Mock(status_code=200, json=lambda: {"ok": True, "result": {"message_id": 42}}))
        result = send_signal_message("token", "chat", "hello", post=post)
        self.assertEqual(result.state, "sent")
        self.assertEqual(result.message_id, 42)
        no_id = Mock(return_value=Mock(status_code=200, json=lambda: {"ok": True, "result": {}}))
        self.assertEqual(send_signal_message("token", "chat", "hello", post=no_id).state, "uncertain")

    def test_telegram_rejection_and_flood_wait(self):
        reject = Mock(return_value=Mock(status_code=400, json=lambda: {"ok": False, "description": "Bad Request"}))
        self.assertEqual(send_signal_message("token", "chat", "hello", post=reject).state, "failed")
        flood = Mock(return_value=Mock(status_code=429, json=lambda: {
            "ok": False, "description": "Too Many Requests", "parameters": {"retry_after": 61}}))
        result = send_signal_message("token", "chat", "hello", post=flood)
        self.assertEqual(result.state, "retry")
        self.assertEqual(result.retry_after, 61)

    def test_timeout_is_uncertain_not_blindly_retried(self):
        post = Mock(side_effect=TimeoutError("read timed out"))
        self.assertEqual(send_signal_message("token", "chat", "hello", post=post).state, "uncertain")

    def test_retry_updates_attempts_and_expiry(self):
        row = {"attempt_count": 0, "expires_at": "2026-10-20T17:00:00+00:00"}
        result = Mock(state="retry", error="rate limited", retry_after=61, message_id=None)
        update = delivery_update(row, result, now_iso="2026-10-20T16:00:00+00:00")
        self.assertEqual(update["status"], "pending")
        self.assertEqual(update["attempt_count"], 1)
        self.assertIn("16:01:01", update["next_attempt_at"])
        row["attempt_count"] = 3
        self.assertEqual(delivery_update(row, result, now_iso="2026-10-20T16:00:00+00:00")["status"], "failed")

    def test_related_pairs_share_one_telegram_post(self):
        rows = [
            {"id": "one", "alert_type": "structure", "attempt_count": 0,
             "expires_at": "2099-01-01T00:00:00+00:00",
             "payload": {"symbol": "EURUSD", "alert_type": "structure", "detail": "BOS", "evidence": []}},
            {"id": "two", "alert_type": "gap_zone", "attempt_count": 0,
             "expires_at": "2099-01-01T00:00:00+00:00",
             "payload": {"symbol": "GBPUSD", "alert_type": "gap_zone", "detail": "confirmed", "evidence": []}},
        ]
        client = Mock()
        with patch("lib.signal_alert_outbox.claim_pending_alerts", return_value=rows), \
             patch("lib.signal_alert_outbox.send_signal_message", return_value=DeliveryResult("sent", message_id=42)) as send:
            results = dispatch_pending(client, "token", "chat")
        self.assertEqual(len(results), 1)
        self.assertEqual(send.call_count, 1)
        self.assertIn("EURUSD", send.call_args.args[2])
        self.assertIn("GBPUSD", send.call_args.args[2])
        self.assertEqual(client.table.call_count, 2)

    def test_stale_or_closed_alert_is_never_sent(self):
        row = {"id": "one", "alert_type": "structure", "attempt_count": 1,
               "expires_at": "2099-01-01T00:00:00+00:00",
               "payload": {"symbol": "EURUSD", "alert_type": "structure", "detail": "BOS"}}
        client = Mock()
        with patch("lib.signal_alert_outbox.claim_pending_alerts", return_value=[row]), \
             patch("lib.signal_alert_outbox.send_signal_message") as send:
            self.assertEqual(dispatch_pending(client, "token", "chat", relevant=lambda _: False), [])
            self.assertEqual(dispatch_pending(client, "token", "chat", market_open=lambda: False), [])
        send.assert_not_called()
        self.assertEqual(client.table.call_count, 2)


if __name__ == "__main__":
    unittest.main()

"""Durable, service-role-only delivery state for the Signal Telegram group."""

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

import requests

from lib.signal_alerts import build_idempotency_key, render_immediate_message


TABLE = "signal_alert_outbox"
MAX_ATTEMPTS = 4
RETRY_DELAYS = (30, 120, 300)


def _utc(iso=None):
    if iso is None:
        return datetime.now(timezone.utc)
    value = datetime.fromisoformat(str(iso).replace("Z", "+00:00"))
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


@dataclass(frozen=True)
class DeliveryResult:
    state: str
    error: str = ""
    message_id: int | None = None
    retry_after: int | None = None


def send_signal_message(token, chat_id, text, post=requests.post):
    if not token or not chat_id:
        return DeliveryResult("failed", "Signal bot or chat is not configured")
    try:
        response = post(
            f"https://api.telegram.org/bot{token}/sendMessage",
            data={"chat_id": chat_id, "text": text, "parse_mode": "HTML"},
            timeout=15,
        )
    except Exception as exc:
        return DeliveryResult("uncertain", f"No Telegram response: {type(exc).__name__}: {exc}"[:300])
    try:
        body = response.json()
    except Exception:
        return DeliveryResult("uncertain", f"Unreadable Telegram response (HTTP {response.status_code})")
    if response.status_code == 200 and body.get("ok") is True:
        message_id = (body.get("result") or {}).get("message_id")
        if isinstance(message_id, int):
            return DeliveryResult("sent", message_id=message_id)
        return DeliveryResult("uncertain", "Telegram accepted request without a message ID")
    error = str(body.get("description") or f"HTTP {response.status_code}")[:300]
    code = body.get("error_code") or response.status_code
    if code == 429 or code >= 500:
        params = body.get("parameters") or {}
        retry_after = params.get("retry_after")
        return DeliveryResult("retry", error, retry_after=int(retry_after) if retry_after else None)
    return DeliveryResult("failed", error)


def delivery_update(row, result, now_iso=None):
    now = _utc(now_iso)
    attempt_count = int(row.get("attempt_count") or 0) + 1
    common = {"attempt_count": attempt_count, "lease_expires_at": None}
    if result.state == "sent":
        return {**common, "status": "sent", "telegram_message_id": result.message_id,
                "sent_at": now.isoformat(), "last_error": None}
    if result.state == "retry" and attempt_count < MAX_ATTEMPTS:
        delay = max(RETRY_DELAYS[min(attempt_count - 1, len(RETRY_DELAYS) - 1)],
                    int(result.retry_after or 0))
        next_at = now + timedelta(seconds=delay)
        if next_at < _utc(row["expires_at"]):
            return {**common, "status": "pending", "next_attempt_at": next_at.isoformat(),
                    "last_error": result.error[:300]}
        return {**common, "status": "expired", "last_error": "Alert expired before retry"}
    status = "failed" if result.state in ("retry", "failed") else "uncertain"
    return {**common, "status": status, "last_error": result.error[:300]}


def enqueue_alert(client, candidate, cooldown_seconds=0, ttl_seconds=240, now_iso=None):
    now = _utc(now_iso)
    key = build_idempotency_key(candidate)
    existing = client.table(TABLE).select("*").eq("idempotency_key", key).limit(1).execute().data or []
    if existing:
        return existing[0]
    if cooldown_seconds:
        since = (now - timedelta(seconds=cooldown_seconds)).isoformat()
        recent = (client.table(TABLE).select("id").eq("symbol", candidate["symbol"])
                  .eq("alert_type", candidate["alert_type"])
                  .eq("bias", candidate.get("bias"))
                  .in_("status", ["pending", "sending", "sent", "uncertain"])
                  .gte("created_at", since).limit(1).execute().data or [])
        if recent:
            return None
    row = {
        "idempotency_key": key, "symbol": candidate["symbol"],
        "alert_type": candidate["alert_type"], "bias": candidate.get("bias"),
        "cycle_at": candidate["cycle_at"],
        "payload": candidate, "status": "pending", "next_attempt_at": now.isoformat(),
        "expires_at": (now + timedelta(seconds=ttl_seconds)).isoformat(),
    }
    try:
        created = client.table(TABLE).insert(row).execute().data or []
        return created[0] if created else None
    except Exception:
        # A second scheduler path may have inserted the same unique key first.
        existing = client.table(TABLE).select("*").eq("idempotency_key", key).limit(1).execute().data or []
        if existing:
            return existing[0]
        raise


def claim_pending_alerts(client, limit=30, now_iso=None):
    now = _utc(now_iso)
    stamp = now.isoformat()
    # A worker may have died before or after Telegram accepted its request.
    stale = (client.table(TABLE).select("id").eq("status", "sending")
             .lte("lease_expires_at", stamp).limit(limit).execute().data or [])
    for row in stale:
        client.table(TABLE).update({"status": "uncertain", "last_error": "Claim expired; delivery unknown"}) \
            .eq("id", row["id"]).eq("status", "sending").execute()
    expired = (client.table(TABLE).select("id").eq("status", "pending")
               .lte("expires_at", stamp).limit(limit).execute().data or [])
    for row in expired:
        client.table(TABLE).update({"status": "expired", "last_error": "Alert expired before delivery"}) \
            .eq("id", row["id"]).eq("status", "pending").execute()
    due = (client.table(TABLE).select("*").eq("status", "pending")
           .lte("next_attempt_at", stamp).gt("expires_at", stamp)
           .order("cycle_at").limit(limit).execute().data or [])
    claimed = []
    lease = (now + timedelta(seconds=90)).isoformat()
    for row in due:
        changed = (client.table(TABLE).update({"status": "sending", "lease_expires_at": lease})
                   .eq("id", row["id"]).eq("status", "pending")
                   .lte("next_attempt_at", stamp).execute().data or [])
        if changed:
            claimed.append(changed[0])
    return claimed


def dispatch_pending(client, token, chat_id, limit=30, relevant=None, market_open=None):
    rows = claim_pending_alerts(client, limit=limit)
    if not rows:
        return []
    sendable = []
    for row in rows:
        if market_open is not None and not market_open():
            update = {"status": "expired", "lease_expires_at": None,
                      "last_error": "Market closed before delivery"}
        else:
            try:
                fresh = True if relevant is None else relevant(row)
            except Exception as exc:
                fresh = None
                print(f"[SIGNAL OUTBOX] Relevance check unavailable: {exc}")
            if fresh is False:
                update = {"status": "expired", "lease_expires_at": None,
                          "last_error": "Alert no longer matches current data"}
            elif fresh is None:
                update = delivery_update(row, DeliveryResult("retry", "Current data unavailable"))
            else:
                sendable.append(row)
                continue
        client.table(TABLE).update(update).eq("id", row["id"]).eq("status", "sending").execute()
    rows = sendable
    if not rows:
        return []
    digest_rows = [row for row in rows if row["alert_type"] == "digest"]
    rows = [row for row in rows if row["alert_type"] != "digest"]
    # Most cycles fit in one post. Split only to preserve every row under the limit.
    batches = []
    for row in rows:
        payload = row["payload"]
        if not batches or len(render_immediate_message([r["payload"] for r in batches[-1]] + [payload])) > 3900:
            batches.append([])
        batches[-1].append(row)
    results = []
    for batch in batches:
        if market_open is not None and not market_open():
            for row in batch:
                client.table(TABLE).update({"status": "expired", "lease_expires_at": None,
                                             "last_error": "Market closed before delivery"}) \
                    .eq("id", row["id"]).eq("status", "sending").execute()
            continue
        text = render_immediate_message([r["payload"] for r in batch])
        result = send_signal_message(token, chat_id, text)
        for row in batch:
            update = delivery_update(row, result)
            client.table(TABLE).update(update).eq("id", row["id"]).eq("status", "sending").execute()
        results.append(result)
    for row in digest_rows:
        if market_open is not None and not market_open():
            client.table(TABLE).update({"status": "expired", "lease_expires_at": None,
                                         "last_error": "Market closed before delivery"}) \
                .eq("id", row["id"]).eq("status", "sending").execute()
            continue
        result = send_signal_message(token, chat_id, row["payload"]["text"])
        client.table(TABLE).update(delivery_update(row, result)) \
            .eq("id", row["id"]).eq("status", "sending").execute()
        results.append(result)
    return results

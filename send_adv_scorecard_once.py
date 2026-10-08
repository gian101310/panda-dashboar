from datetime import datetime

import app


def main():
    res = app.supabase.table("dashboard").select("*").execute()
    data = res.data or []
    path = app.generate_adv_scorecard(data)
    ok, response = app._send_telegram_photo(
        path,
        f"PANDA ADV SCORECARD\n{datetime.now().strftime('%Y-%m-%d %H:%M')}\nRaw + ADV D1/H4/H1",
        component="ADV scorecard scheduled",
    )
    app.supabase_retry(
        lambda: app.supabase.table("engine_logs").insert({
            "timestamp": datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S"),
            "component": "telegram_adv_scorecard_ok" if ok else "telegram_adv_scorecard_fail",
            "duration": 0,
            "error": None if ok else (response.text[:500] if response else "no response"),
        }).execute(),
        label="telegram_adv_scorecard_scheduled",
    )


if __name__ == "__main__":
    main()

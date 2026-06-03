# ================= IMPORTS =================
from fastapi import FastAPI, Request, Form
from fastapi.responses import HTMLResponse, RedirectResponse
from supabase import create_client

# ================= APP =================
app = FastAPI()

# ================= CONFIG =================
SUPABASE_URL = "https://jxkelchxitwuilpbrwxk.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp4a2VsY2h4aXR3dWlscGJyd3hrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mzg1MTI2NSwiZXhwIjoyMDg5NDI3MjY1fQ.OgNCKlZPy010de01wW02qH--Lb6zVYqPBxTEFpGrD5M"  # USE YOUR FULL REAL KEY

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# ================= USERS =================
USERS = {
    "admin": "1234",
    "user1": "pass1"
}

SESSIONS = {}

# ================= LOGIN PAGE =================
@app.get("/", response_class=HTMLResponse)
def login_page():
    return """
    <html>
    <body style="background:#0f1220;color:white;text-align:center;font-family:Arial;">
        <h2>🔥 PANDA LOGIN</h2>
        <form method="post" action="/login">
            <input name="username" placeholder="Username"/><br><br>
            <input name="password" type="password" placeholder="Password"/><br><br>
            <button type="submit">Login</button>
        </form>
    </body>
    </html>
    """

# ================= LOGIN =================
@app.post("/login")
def login(username: str = Form(...), password: str = Form(...)):

    if username in USERS and USERS[username] == password:
        session_id = username + "_session"
        SESSIONS[session_id] = username

        response = RedirectResponse("/dashboard", status_code=302)
        response.set_cookie(key="session_id", value=session_id)
        return response

    return {"error": "Invalid login"}

# ================= DATA API (FIXED HARD) =================
@app.get("/data")
def get_data():
    try:
        response = supabase.table("dashboard").select("symbol, gap, state, strength").execute()

        # ===== FORCE SAFE EXTRACTION =====
        data = []

        if hasattr(response, "data") and response.data:
            data = response.data
        elif isinstance(response, dict) and "data" in response:
            data = response["data"]
        else:
            print("[WARNING] EMPTY RESPONSE FROM SUPABASE")
            return []

        print("[DATA LOADED]", len(data))

        # ===== SAFE SORT =====
        def safe_strength(x):
            try:
                return float(x.get("strength") or 0)
            except:
                return 0

        return sorted(data, key=safe_strength, reverse=True)

    except Exception as e:
        print("[DATA ERROR]", e)
        return []

# ================= DASHBOARD =================
@app.get("/dashboard", response_class=HTMLResponse)
def dashboard(request: Request):

    session_id = request.cookies.get("session_id")

    if session_id not in SESSIONS:
        return RedirectResponse("/")

    return """
    <html>
    <head>
    <script>
    async function loadData() {
        try {
            const res = await fetch('/data');
            const data = await res.json();

            console.log("DATA:", data);

            let rows = "";

            data.forEach(r => {

                let gap = parseFloat(r.gap || 0);
                let strength = parseFloat(r.strength || 0);
                let state = r.state || "";

                // ===== BIAS =====
                let bias = "";
                if (gap >= 5) bias = "BUY";
                else if (gap <= -5) bias = "SELL";

                // ===== COLOR =====
                let color = "#aaa";
                if (strength >= 2) color = "#00ff9f";
                else if (strength >= 1) color = "#ffd166";

                // ===== STATE COLOR =====
                let stateColor = state.includes("EXPAND") ? "#ff4d6d" : "#ffffff";

                rows += `
                <tr style="color:${color};">
                    <td>${r.symbol}</td>
                    <td>${gap}</td>
                    <td>${bias}</td>
                    <td style="color:${stateColor};">${state}</td>
                    <td>${strength}</td>
                </tr>`;
            });

            document.getElementById("table-body").innerHTML = rows;

        } catch(err) {
            console.log("UI ERROR", err);
        }
    }

    setInterval(loadData, 3000);
    window.onload = loadData;
    </script>
    </head>

    <body style="background:#0f1220;color:white;font-family:Arial;">

        <h2 style="text-align:center;">🔥 PANDA LIVE DASHBOARD</h2>

        <table border="1" style="width:100%;text-align:center;border-collapse:collapse;">
            <tr style="background:#1c2138;">
                <th>Symbol</th>
                <th>Gap</th>
                <th>Bias</th>
                <th>State</th>
                <th>Strength</th>
            </tr>
            <tbody id="table-body"></tbody>
        </table>

    </body>
    </html>
    """

# ================= RUN =================
# python -m uvicorn dashboard_app:app --reload --port 8002
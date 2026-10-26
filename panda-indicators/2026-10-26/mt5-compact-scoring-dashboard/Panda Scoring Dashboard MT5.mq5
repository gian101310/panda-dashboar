// Panda Engine compact scoring display. Read only; never calculates trade signals.
// Requires PandaDashboardFeedMT5-Licensed on one chart and the separate
// Panda MT5 Dashboard Overlay account license in Panda Engine Admin.
#property copyright "Panda Engine"
#property version "1.01"
#property indicator_chart_window
#property indicator_plots 0

enum PANDA_SCORE_VIEW
{
   SHOW_VALID_PAIRS = 0,
   SHOW_CHART_PAIR = 1,
   SHOW_HEADER_ONLY = 2
};

input PANDA_SCORE_VIEW InitialView = SHOW_VALID_PAIRS;
input int PanelX = 12;
input int PanelY = 36;

struct PandaScoreRow
{
   string symbol;
   double gap;
   bool has_gap;
   string bias;
   bool hard_invalid;
   string pl_zone;
   string box_h4;
   string box_h1;
   bool pl_g1_valid;
   datetime updated_at;
};

PandaScoreRow g_rows[32];
int g_row_count = 0;
int g_view = SHOW_VALID_PAIRS;
int g_max_age = 600;
datetime g_server_time = 0;
string g_prefix, g_cache_file, g_received_key, g_view_key;
string g_last_cache = "", g_status = "ATTACH FEED EA", g_feed_error = "";
color g_bg = C'9,15,25';
color g_border = C'30,48,72';
color g_blue = C'0,180,255';
color g_buy = C'0,255,159';
color g_sell = C'255,77,109';
color g_muted = C'141,158,178';

string Trim(string value)
{
   StringTrimLeft(value);
   StringTrimRight(value);
   return value;
}

string Digest(const string value)
{
   uint hash = 2166136261;
   for(int i = 0; i < StringLen(value); i++)
   {
      hash ^= (uint)StringGetCharacter(value, i);
      hash *= 16777619;
   }
   return IntegerToString((int)hash);
}

string JsonString(const string json, const string key)
{
   int pos = StringFind(json, "\"" + key + "\"");
   if(pos < 0) return "";
   int colon = StringFind(json, ":", pos + StringLen(key) + 2);
   if(colon < 0) return "";
   int quote = StringFind(json, "\"", colon + 1);
   if(quote < 0) return "";
   int end = StringFind(json, "\"", quote + 1);
   if(end < 0) return "";
   return StringSubstr(json, quote + 1, end - quote - 1);
}

string JsonScalar(const string json, const string key)
{
   int pos = StringFind(json, "\"" + key + "\"");
   if(pos < 0) return "";
   int colon = StringFind(json, ":", pos + StringLen(key) + 2);
   if(colon < 0) return "";
   int begin = colon + 1;
   while(begin < StringLen(json) && StringFind(" \t\r\n", StringSubstr(json, begin, 1)) >= 0) begin++;
   int end = begin;
   while(end < StringLen(json))
   {
      string ch = StringSubstr(json, end, 1);
      if(ch == "," || ch == "}" || ch == "]") break;
      end++;
   }
   return Trim(StringSubstr(json, begin, end - begin));
}

datetime ParseUtcStamp(const string value)
{
   // The feed's server_time is ISO 8601, while Supabase updated_at uses a space.
   if(StringLen(value) < 19) return 0;
   string separator = StringSubstr(value, 10, 1);
   if(separator != "T" && separator != " ") return 0;
   string stamp = StringSubstr(value, 0, 19);
   StringReplace(stamp, "-", ".");
   StringReplace(stamp, "T", " ");
   return StringToTime(stamp);
}

bool ParseSnapshot(const string json)
{
   if(JsonScalar(json, "schema_version") != "1") return false;
   int array_start = StringFind(json, "\"pairs\"");
   if(array_start < 0) return false;
   array_start = StringFind(json, "[", array_start);
   if(array_start < 0) return false;
   int array_end = StringFind(json, "]", array_start);
   if(array_end < 0) return false;

   g_server_time = ParseUtcStamp(JsonString(json, "server_time"));
   g_row_count = 0;
   int cursor = array_start + 1;
   while(cursor < array_end && g_row_count < ArraySize(g_rows))
   {
      int start = StringFind(json, "{", cursor);
      if(start < 0 || start >= array_end) break;
      int end = StringFind(json, "}", start + 1);
      if(end < 0 || end > array_end) return false;
      string item = StringSubstr(json, start, end - start + 1);
      string symbol = JsonString(item, "symbol");
      if(StringLen(symbol) == 6)
      {
         int n = g_row_count++;
         g_rows[n].symbol = symbol;
         string raw_gap = JsonScalar(item, "gap");
         g_rows[n].has_gap = raw_gap != "" && raw_gap != "null";
         g_rows[n].gap = g_rows[n].has_gap ? StringToDouble(raw_gap) : 0.0;
         g_rows[n].bias = JsonString(item, "bias");
         g_rows[n].hard_invalid = JsonScalar(item, "hard_invalid") == "true";
         g_rows[n].pl_zone = JsonString(item, "pl_zone");
         g_rows[n].box_h4 = JsonString(item, "box_h4_trend");
         g_rows[n].box_h1 = JsonString(item, "box_h1_trend");
         g_rows[n].pl_g1_valid = JsonScalar(item, "pl_g1_valid") == "true";
         g_rows[n].updated_at = ParseUtcStamp(JsonString(item, "updated_at"));
      }
      cursor = end + 1;
   }
   g_max_age = (int)StringToInteger(JsonScalar(json, "max_age_seconds"));
   if(g_max_age <= 0) g_max_age = 600;
   return true;
}

bool IsFresh(const PandaScoreRow &row)
{
   if(g_server_time <= 0 || row.updated_at <= 0) return false;
   long age = (long)(g_server_time - row.updated_at);
   return age >= 0 && age <= g_max_age;
}

bool ReadCache(string &json)
{
   int handle = FileOpen(g_cache_file, FILE_READ | FILE_TXT | FILE_ANSI | FILE_COMMON | FILE_SHARE_READ | FILE_SHARE_WRITE);
   if(handle == INVALID_HANDLE) return false;
   json = "";
   while(!FileIsEnding(handle)) json += FileReadString(handle);
   FileClose(handle);
   return json != "";
}

bool IsValid(const PandaScoreRow &row)
{
   return IsFresh(row) && !row.hard_invalid && row.has_gap &&
          ((row.bias == "BUY" && row.gap >= 5.0) ||
           (row.bias == "SELL" && row.gap <= -5.0));
}

color BiasColor(const string bias)
{
   if(bias == "BUY") return g_buy;
   if(bias == "SELL") return g_sell;
   return g_muted;
}

string GapText(const PandaScoreRow &row)
{
   if(!row.has_gap) return "--";
   string number = DoubleToString(row.gap, 0);
   return row.gap > 0 ? "+" + number : number;
}

string ChartPair()
{
   string chart = Symbol();
   StringToUpper(chart);
   string match = "";
   for(int i = 0; i < g_row_count; i++)
   {
      if(StringFind(chart, g_rows[i].symbol) < 0) continue;
      if(match != "") return "";
      match = g_rows[i].symbol;
   }
   return match;
}

void ClearObjects()
{
   ObjectsDeleteAll(0, g_prefix);
}

void Rect(const string suffix, const int x, const int y, const int width, const int height, const color fill, const color border)
{
   string name = g_prefix + suffix;
   if(ObjectFind(0, name) < 0) ObjectCreate(0, name, OBJ_RECTANGLE_LABEL, 0, 0, 0);
   ObjectSetInteger(0, name, OBJPROP_CORNER, CORNER_LEFT_UPPER);
   ObjectSetInteger(0, name, OBJPROP_XDISTANCE, x);
   ObjectSetInteger(0, name, OBJPROP_YDISTANCE, y);
   ObjectSetInteger(0, name, OBJPROP_XSIZE, width);
   ObjectSetInteger(0, name, OBJPROP_YSIZE, height);
   ObjectSetInteger(0, name, OBJPROP_BGCOLOR, fill);
   ObjectSetInteger(0, name, OBJPROP_COLOR, border);
   ObjectSetInteger(0, name, OBJPROP_BORDER_TYPE, BORDER_FLAT);
   ObjectSetInteger(0, name, OBJPROP_SELECTABLE, false);
   ObjectSetInteger(0, name, OBJPROP_HIDDEN, true);
}

void Label(const string suffix, const string value, const int x, const int y, const color ink, const int size)
{
   string name = g_prefix + suffix;
   if(ObjectFind(0, name) < 0) ObjectCreate(0, name, OBJ_LABEL, 0, 0, 0);
   ObjectSetInteger(0, name, OBJPROP_CORNER, CORNER_LEFT_UPPER);
   ObjectSetInteger(0, name, OBJPROP_ANCHOR, ANCHOR_LEFT_UPPER);
   ObjectSetInteger(0, name, OBJPROP_XDISTANCE, x);
   ObjectSetInteger(0, name, OBJPROP_YDISTANCE, y);
   ObjectSetInteger(0, name, OBJPROP_COLOR, ink);
   ObjectSetInteger(0, name, OBJPROP_FONTSIZE, size);
   ObjectSetString(0, name, OBJPROP_FONT, "Consolas");
   ObjectSetString(0, name, OBJPROP_TEXT, value);
   ObjectSetInteger(0, name, OBJPROP_HIDDEN, true);
}

void Button(const string suffix, const string title, const int x, const int y, const int width, const bool selected)
{
   Rect(suffix + ".bg", x, y, width, 19, selected ? C'16,61,75' : C'20,30,45', selected ? g_blue : g_border);
   Label(suffix, title, x + 7, y + 3, selected ? clrWhite : g_muted, 8);
   ObjectSetInteger(0, g_prefix + suffix, OBJPROP_SELECTABLE, true);
}

void Render()
{
   ClearObjects();
   int valid[32];
   int count = 0;
   if(g_status == "LIVE")
      for(int i = 0; i < g_row_count; i++)
         if(IsValid(g_rows[i])) valid[count++] = i;
   for(int i = 0; i < count; i++)
      for(int j = i + 1; j < count; j++)
         if(MathAbs(g_rows[valid[j]].gap) > MathAbs(g_rows[valid[i]].gap))
         {
            int swap = valid[i]; valid[i] = valid[j]; valid[j] = swap;
         }

   int columns = count > 10 ? 2 : 1;
   int rows_per_column = columns == 2 ? (count + 1) / 2 : count;
   int width = g_view == SHOW_VALID_PAIRS ? (columns == 2 ? 396 : 264) : 264;
   int height = 35;
   if(g_view == SHOW_VALID_PAIRS) height = 63 + MathMax(1, rows_per_column) * 18;
   if(g_view == SHOW_CHART_PAIR) height = 131;
   int x = MathMax(0, PanelX), y = MathMax(0, PanelY);
   Rect("panel", x, y, width, height, g_bg, g_border);
   Rect("header", x + 3, y + 3, width - 6, 27, C'15,25,40', g_border);
   Label("title", "PANDA SCORES", x + 10, y + 10, clrWhite, 9);
   int button_x = x + width - 142;
   Button("all", "ALL", button_x, y + 6, 40, g_view == SHOW_VALID_PAIRS);
   Button("pair", "PAIR", button_x + 45, y + 6, 45, g_view == SHOW_CHART_PAIR);
   Button("hide", g_view == SHOW_HEADER_ONLY ? "+" : "-", button_x + 95, y + 6, 30, g_view == SHOW_HEADER_ONLY);
   if(g_view == SHOW_HEADER_ONLY) { ChartRedraw(0); return; }

   color status_color = g_status == "LIVE" ? g_buy : g_status == "STALE" ? C'255,209,102' : g_sell;
   if(g_view == SHOW_VALID_PAIRS)
   {
      Label("caption", "VALID  " + IntegerToString(count) + " / " + IntegerToString(g_row_count), x + 11, y + 38, g_muted, 8);
      Label("status", g_status, x + width - 116, y + 38, status_color, 8);
      if(count == 0) Label("empty", g_status == "LIVE" ? "No valid bias now" : "Waiting for licensed feed", x + 12, y + 58, g_muted, 9);
      for(int i = 0; i < count; i++)
      {
         int col = i / MathMax(1, rows_per_column);
         int row = i % MathMax(1, rows_per_column);
         int left = x + 11 + col * 192;
         int top = y + 60 + row * 18;
         PandaScoreRow data = g_rows[valid[i]];
         Label("s" + IntegerToString(i), data.symbol, left, top, clrWhite, 9);
         Label("g" + IntegerToString(i), GapText(data), left + 77, top, BiasColor(data.bias), 9);
         Label("b" + IntegerToString(i), data.bias, left + 120, top, BiasColor(data.bias), 9);
      }
   }
   else
   {
      string pair = ChartPair();
      int found = -1;
      if(g_status == "LIVE")
         for(int i = 0; i < g_row_count; i++) if(g_rows[i].symbol == pair) { found = i; break; }
      Label("status", g_status, x + 12, y + 39, status_color, 8);
      if(found < 0)
      {
         Label("noPair", pair == "" ? "Chart pair unavailable" : "Pair data unavailable", x + 12, y + 69, g_muted, 9);
      }
      else
      {
         PandaScoreRow data = g_rows[found];
         if(!IsFresh(data)) Label("pairStale", "Pair score is stale", x + 12, y + 69, g_muted, 9);
         else
         {
            Label("pairName", data.symbol, x + 12, y + 60, clrWhite, 13);
            Label("pairGap", GapText(data), x + 104, y + 59, BiasColor(data.bias), 16);
            Label("pairBias", data.bias, x + 175, y + 64, BiasColor(data.bias), 10);
            string pl = data.pl_zone == "" ? "UNKNOWN" : data.pl_zone;
            Label("pl", "PL " + pl + (data.pl_g1_valid ? "  G1" : ""), x + 12, y + 88, g_muted, 8);
            Label("box", "H4 " + data.box_h4 + "  H1 " + data.box_h1, x + 12, y + 106, g_muted, 8);
         }
      }
   }
   ChartRedraw(0);
}

void Refresh()
{
   string json = "";
   if(!ReadCache(json))
   {
      if(g_status != "ATTACH FEED EA") { g_row_count = 0; g_last_cache = ""; g_status = "ATTACH FEED EA"; Render(); }
      return;
   }
   string next_status = "";
   bool changed = json != g_last_cache;
   if(changed)
   {
      g_last_cache = json;
      if(!ParseSnapshot(json))
      {
         g_row_count = 0;
         g_feed_error = JsonString(json, "status");
         if(g_feed_error == "") g_feed_error = "FEED ERROR";
      }
      else g_feed_error = "";
   }
   next_status = g_feed_error;
   if(next_status == "")
   {
      double received = GlobalVariableCheck(g_received_key) ? GlobalVariableGet(g_received_key) : 0.0;
      next_status = received > 0.0 && TimeLocal() - received <= g_max_age ? "LIVE" : "STALE";
   }
   if(next_status != g_status || changed)
   {
      g_status = next_status;
      Render();
   }
}

int OnInit()
{
   long account = AccountInfoInteger(ACCOUNT_LOGIN);
   g_prefix = "PandaScoreCompact." + IntegerToString((long)ChartID()) + ".";
   string key = Digest("MT5|x-panda-account-number|" + IntegerToString(account));
   g_cache_file = "PandaOverlay\\MT5-" + key + ".json";
   g_received_key = "Panda.MT5.Rx." + key;
   g_view_key = "PandaScoreCompact.View." + IntegerToString((long)ChartID());
   g_view = (int)InitialView;
   if(GlobalVariableCheck(g_view_key)) g_view = (int)GlobalVariableGet(g_view_key);
   if(g_view < 0 || g_view > 2) g_view = SHOW_VALID_PAIRS;
   Render();
   EventSetTimer(3);
   Refresh();
   return INIT_SUCCEEDED;
}

void OnDeinit(const int reason)
{
   EventKillTimer();
   ClearObjects();
}

void OnTimer() { Refresh(); }

void OnChartEvent(const int id, const long &lparam, const double &dparam, const string &sparam)
{
   if(id != CHARTEVENT_OBJECT_CLICK) return;
   if(sparam == g_prefix + "all") g_view = SHOW_VALID_PAIRS;
   else if(sparam == g_prefix + "pair") g_view = SHOW_CHART_PAIR;
   else if(sparam == g_prefix + "hide") g_view = g_view == SHOW_HEADER_ONLY ? SHOW_VALID_PAIRS : SHOW_HEADER_ONLY;
   else return;
   GlobalVariableSet(g_view_key, g_view);
   Render();
}

int OnCalculate(const int rates_total, const int prev_calculated, const datetime &time[],
                const double &open[], const double &high[], const double &low[], const double &close[],
                const long &tick_volume[], const long &volume[], const int &spread[])
{
   return rates_total;
}

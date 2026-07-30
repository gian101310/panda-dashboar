#ifndef PANDA_DASHBOARD_OVERLAY_MT5_CORE
#define PANDA_DASHBOARD_OVERLAY_MT5_CORE

const string PANDA_MT5_ENDPOINT = "https://pandaengine.app/api/mt5-overlay";
const int PANDA_REFRESH_SECONDS = 60;
const int PANDA_LOCK_TIMEOUT_SECONDS = 15;
const ENUM_BASE_CORNER PANDA_DEFAULT_CORNER = CORNER_LEFT_UPPER;
const int PANDA_PANEL_WIDTH = 280;
const int PANDA_PANEL_HEIGHT = 216;
const int PANDA_PANEL_HEIGHT_MIN = 32;
const int PANDA_PANEL_MARGIN = 12;

enum PANDA_PANEL_CORNER
{
   PANEL_TOP_LEFT = 0,     // Top left
   PANEL_TOP_RIGHT = 1,    // Top right
   PANEL_BOTTOM_LEFT = 2,  // Bottom left
   PANEL_BOTTOM_RIGHT = 3  // Bottom right
};

class PandaOverlayMT5
{
private:
   string m_edition;
   string m_header_name;
   string m_credential;
   string m_device_id;
   string m_device_token;
   string m_device_file;
   string m_symbol;
   string m_prefix;
   string m_cache_key;
   string m_cache_file;
   string m_lock_key;
   string m_attempt_key;
   string m_received_key;
   string m_position_key;
   string m_status;
   string m_score;
   string m_bias;
   string m_box_h4;
   string m_box_h1;
   string m_panda_lines;
   string m_xtf;
   string m_base_xtf;
   string m_quote_xtf;
   string m_updated_at;
   int m_max_age;
   int m_x;
   int m_y;
   bool m_minimized;
   bool m_has_data;
   bool m_can_http;
   int m_corner;
   bool m_custom;

   string Trim(string value)
   {
      StringTrimLeft(value);
      StringTrimRight(value);
      return value;
   }

   string CanonicalSymbol(const string value)
   {
      string upper = value;
      StringToUpper(upper);
      string pairs[] = {
         "AUDJPY","AUDCAD","AUDNZD","AUDUSD","CADJPY","EURAUD","EURCAD",
         "EURGBP","EURJPY","EURNZD","EURUSD","GBPAUD","GBPCAD","GBPJPY",
         "GBPNZD","GBPUSD","NZDCAD","NZDJPY","NZDUSD","USDCAD","USDJPY"
      };
      string found = "";
      int matches = 0;
      for(int i = 0; i < ArraySize(pairs); i++)
      {
         if(StringFind(upper, pairs[i]) >= 0)
         {
            found = pairs[i];
            matches++;
         }
      }
      return matches == 1 ? found : "";
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

   string JsonString(const string json, const string key, const int from = 0)
   {
      int key_pos = StringFind(json, "\"" + key + "\"", from);
      if(key_pos < 0) return "";
      int colon = StringFind(json, ":", key_pos + StringLen(key) + 2);
      if(colon < 0) return "";
      int quote = StringFind(json, "\"", colon + 1);
      if(quote < 0) return "";
      string result = "";
      bool escaped = false;
      for(int i = quote + 1; i < StringLen(json); i++)
      {
         ushort ch = StringGetCharacter(json, i);
         if(escaped)
         {
            if(ch == 'n') result += "\n";
            else if(ch == 'r') result += "\r";
            else if(ch == 't') result += "\t";
            else result += CharToString((uchar)ch);
            escaped = false;
         }
         else if(ch == '\\') escaped = true;
         else if(ch == '"') return result;
         else result += CharToString((uchar)ch);
      }
      return "";
   }

   string JsonScalar(const string json, const string key)
   {
      int key_pos = StringFind(json, "\"" + key + "\"");
      if(key_pos < 0) return "";
      int colon = StringFind(json, ":", key_pos + StringLen(key) + 2);
      if(colon < 0) return "";
      int start = colon + 1;
      while(start < StringLen(json) && StringFind(" \t\r\n", StringSubstr(json, start, 1)) >= 0) start++;
      int finish = start;
      while(finish < StringLen(json))
      {
         string ch = StringSubstr(json, finish, 1);
         if(ch == "," || ch == "}") break;
         finish++;
      }
      return Trim(StringSubstr(json, start, finish - start));
   }

   string JsonObject(const string json, const string key)
   {
      int key_pos = StringFind(json, "\"" + key + "\"");
      if(key_pos < 0) return "";
      int colon = StringFind(json, ":", key_pos + StringLen(key) + 2);
      if(colon < 0) return "";
      int begin = StringFind(json, "{", colon + 1);
      if(begin < 0) return "";

      int depth = 0;
      bool in_string = false;
      bool escaped = false;
      int length = StringLen(json);
      for(int i = begin; i < length; i++)
      {
         ushort ch = StringGetCharacter(json, i);
         if(in_string)
         {
            if(escaped) escaped = false;
            else if(ch == '\\') escaped = true;
            else if(ch == '"') in_string = false;
            continue;
         }
         if(ch == '"')
         {
            in_string = true;
            continue;
         }
         if(ch == '{') depth++;
         else if(ch == '}')
         {
            depth--;
            if(depth == 0) return StringSubstr(json, begin, i - begin + 1);
         }
      }
      return "";
   }

   string PairObject(const string json)
   {
      string needle = "\"symbol\":\"" + m_symbol + "\"";
      int symbol_pos = StringFind(json, needle);
      if(symbol_pos < 0) return "";
      int begin = symbol_pos;
      while(begin >= 0 && StringSubstr(json, begin, 1) != "{") begin--;
      int finish = StringFind(json, "}", symbol_pos);
      if(begin < 0 || finish < 0) return "";
      return StringSubstr(json, begin, finish - begin + 1);
   }

   string SignedScore(const string raw)
   {
      if(raw == "" || raw == "null") return "—";
      double value = StringToDouble(raw);
      if(value > 0.0) return "+" + DoubleToString(value, 1);
      return DoubleToString(value, 1);
   }

   // Display-only port of the TradingView BASE XTF / QUOTE XTF rows.
   // Formats the dashboard's base_score_tf / quote_score_tf extreme lists
   // (tokens like "D1+4 H4+5", |score| >= 4 only, D1→H4→H1 order preserved)
   // into "GBP: H4 +5 · H1 +4" or "GBP: NONE". Never feeds back into scoring.
   string FormatCurrencyExtremes(const string currency, const string tokens)
   {
      string label = currency == "" ? "—" : currency;
      string cleaned = Trim(tokens);
      if(cleaned == "" || cleaned == "null") return label + ": NONE";
      string parts[];
      int count = StringSplit(cleaned, ' ', parts);
      string values = "";
      for(int i = 0; i < count; i++)
      {
         string token = Trim(parts[i]);
         if(StringLen(token) < 3) continue;
         string tf = StringSubstr(token, 0, 2);
         string score = StringSubstr(token, 2);
         if(StringSubstr(score, 0, 1) == ":") score = StringSubstr(score, 1);
         if(score == "") continue;
         string spaced = tf + " " + score;
         values = values == "" ? spaced : values + " · " + spaced;
      }
      return values == "" ? label + ": NONE" : label + ": " + values;
   }

   bool ParseSnapshot(const string json)
   {
      if(JsonScalar(json, "schema_version") != "1") return false;
      string pair = PairObject(json);
      if(pair == "") return false;

      m_score = SignedScore(JsonScalar(pair, "gap"));
      m_bias = JsonString(pair, "bias");
      m_box_h4 = JsonString(pair, "box_h4_trend");
      m_box_h1 = JsonString(pair, "box_h1_trend");
      string zone = JsonString(pair, "pl_zone");
      m_panda_lines = JsonScalar(pair, "pl_g1_valid") == "true" ? "CONFIRMED" : zone;
      string base_currency = JsonString(pair, "base_currency");
      string base_tf = JsonString(pair, "base_score_tf");
      string quote_currency = JsonString(pair, "quote_currency");
      string quote_tf = JsonString(pair, "quote_score_tf");
      m_xtf = (base_tf == "" ? "NONE" : base_currency + " " + base_tf)
              + " | " + (quote_tf == "" ? "NONE" : quote_currency + " " + quote_tf);
      m_base_xtf = FormatCurrencyExtremes(base_currency, base_tf);
      m_quote_xtf = FormatCurrencyExtremes(quote_currency, quote_tf);
      m_updated_at = JsonString(pair, "updated_at");
      m_max_age = (int)StringToInteger(JsonScalar(json, "max_age_seconds"));
      if(m_max_age <= 0) m_max_age = 600;
      if(m_bias == "") m_bias = "INVALID";
      if(m_box_h4 == "") m_box_h4 = "—";
      if(m_box_h1 == "") m_box_h1 = "—";
      if(m_panda_lines == "") m_panda_lines = "—";
      m_has_data = true;
      return true;
   }

   bool ReadCache(string &json)
   {
      int handle = FileOpen(m_cache_file, FILE_READ|FILE_TXT|FILE_ANSI|FILE_COMMON);
      if(handle == INVALID_HANDLE) return false;
      json = "";
      while(!FileIsEnding(handle)) json += FileReadString(handle);
      FileClose(handle);
      return json != "";
   }

   bool WriteCache(const string json)
   {
      int handle = FileOpen(m_cache_file, FILE_WRITE|FILE_TXT|FILE_ANSI|FILE_COMMON);
      if(handle == INVALID_HANDLE) return false;
      FileWriteString(handle, json);
      FileFlush(handle);
      FileClose(handle);
      return true;
   }

   bool IsDeviceToken(const string value)
   {
      if(StringLen(value) != 64) return false;
      for(int i = 0; i < 64; i++)
      {
         ushort ch = StringGetCharacter(value, i);
         if(!((ch >= '0' && ch <= '9') || (ch >= 'a' && ch <= 'f'))) return false;
      }
      return true;
   }

   void SaveDeviceCredentials()
   {
      int handle = FileOpen(m_device_file, FILE_WRITE|FILE_TXT|FILE_ANSI|FILE_COMMON);
      if(handle == INVALID_HANDLE) return;
      FileWriteString(handle, m_device_id + "\r\n" + m_device_token);
      FileFlush(handle);
      FileClose(handle);
   }

   void LoadDeviceCredentials()
   {
      int handle = FileOpen(m_device_file, FILE_READ|FILE_TXT|FILE_ANSI|FILE_COMMON);
      if(handle != INVALID_HANDLE)
      {
         m_device_id = Trim(FileReadString(handle));
         m_device_token = Trim(FileReadString(handle));
         FileClose(handle);
      }
      if(StringLen(m_device_id) < 16)
      {
         MathSrand((int)(TimeLocal() + GetTickCount()));
         m_device_id = "mt5-" + Digest(TerminalInfoString(TERMINAL_COMMONDATA_PATH) + IntegerToString((int)TimeLocal()) + IntegerToString(MathRand()))
                       + "-" + Digest(IntegerToString((int)GetTickCount()) + IntegerToString(MathRand()));
         m_device_token = "";
         SaveDeviceCredentials();
      }
      if(!IsDeviceToken(m_device_token)) m_device_token = "";
   }

   void ClearData()
   {
      m_has_data = false;
      m_score = "—";
      m_bias = "—";
      m_box_h4 = "—";
      m_box_h1 = "—";
      m_panda_lines = "—";
      m_xtf = "—";
      m_base_xtf = "—";
      m_quote_xtf = "—";
      m_updated_at = "—";
   }

   bool AcquireLock(const double now_value)
   {
      if(!GlobalVariableCheck(m_lock_key)) GlobalVariableSet(m_lock_key, 0.0);
      double held = GlobalVariableGet(m_lock_key);
      if(held > 0.0 && now_value - held <= PANDA_LOCK_TIMEOUT_SECONDS) return false;
      if(held > 0.0) GlobalVariableSet(m_lock_key, 0.0);
      return GlobalVariableSetOnCondition(m_lock_key, now_value, 0.0);
   }

   void ReleaseLock()
   {
      GlobalVariableSet(m_lock_key, 0.0);
   }

   void RefreshFromNetwork()
   {
      // MetaTrader prohibits WebRequest() inside indicators (error 4014/4060).
      // Indicator instances display the shared snapshot; a Feed EA refreshes it.
      if(!m_can_http)
      {
         if(!m_has_data && m_status == "CONNECTING") m_status = "ATTACH FEED EA";
         return;
      }
      double now_value = (double)TimeLocal();
      double last_attempt = GlobalVariableCheck(m_attempt_key) ? GlobalVariableGet(m_attempt_key) : 0.0;
      if(now_value - last_attempt < PANDA_REFRESH_SECONDS) return;
      if(!AcquireLock(now_value)) return;
      GlobalVariableSet(m_attempt_key, now_value);

      if(m_edition == "LICENSED") LoadDeviceCredentials();

      string headers = m_header_name + ": " + m_credential + "\r\nAccept: application/json\r\n";
      if(m_edition == "LICENSED")
      {
         headers += "x-panda-device-id: " + m_device_id + "\r\n";
         if(m_device_token != "") headers += "x-panda-device-token: " + m_device_token + "\r\n";
      }
      char request_data[];
      char response_data[];
      string response_headers = "";
      ResetLastError();
      int status_code = WebRequest("GET", PANDA_MT5_ENDPOINT, headers, 12000, request_data, response_data, response_headers);
      int request_error = GetLastError();
      string body = CharArrayToString(response_data, 0, -1, CP_UTF8);

      if(status_code == 200 && ParseSnapshot(body))
      {
         string activation_object = JsonObject(body, "device_activation");
         string activation = JsonString(activation_object, "token");
         if(IsDeviceToken(activation))
         {
            m_device_token = activation;
            SaveDeviceCredentials();
         }
         WriteCache(body);
         GlobalVariableSet(m_received_key, now_value);
         m_status = "LIVE";
      }
      else if(status_code == 401 || status_code == 403)
      {
         string denial = JsonString(body, "status");
         m_status = denial == "" ? "LICENSE REQUIRED" : denial;
         ClearData();
         WriteCache(body);
         GlobalVariableSet(m_received_key, now_value);
      }
      else if(status_code == -1 && (request_error == 4014 || request_error == 4060))
      {
         m_status = "ALLOW WEBREQUEST";
      }
      else
      {
         m_status = m_has_data ? "STALE" : "SYNC ERROR";
      }

      ReleaseLock();
      Render();
   }

   color BiasColor()
   {
      if(m_bias == "BUY") return C'0,255,159';
      if(m_bias == "SELL") return C'255,77,109';
      return clrSilver;
   }

   color StatusColor()
   {
      if(m_status == "LIVE") return C'0,255,159';
      if(m_status == "STALE") return C'255,209,102';
      return C'255,77,109';
   }

   void SetCommon(const string name, const int x, const int y)
   {
      ObjectSetInteger(0, name, OBJPROP_CORNER, PANDA_DEFAULT_CORNER);
      ObjectSetInteger(0, name, OBJPROP_XDISTANCE, x);
      ObjectSetInteger(0, name, OBJPROP_YDISTANCE, y);
      ObjectSetInteger(0, name, OBJPROP_HIDDEN, true);
   }

   void Rect(const string suffix, const int x, const int y, const int width, const int height,
             const color background, const color border, const bool selectable)
   {
      string name = m_prefix + suffix;
      if(ObjectFind(0, name) < 0) ObjectCreate(0, name, OBJ_RECTANGLE_LABEL, 0, 0, 0);
      SetCommon(name, x, y);
      ObjectSetInteger(0, name, OBJPROP_XSIZE, width);
      ObjectSetInteger(0, name, OBJPROP_YSIZE, height);
      ObjectSetInteger(0, name, OBJPROP_BGCOLOR, background);
      ObjectSetInteger(0, name, OBJPROP_COLOR, border);
      ObjectSetInteger(0, name, OBJPROP_BORDER_TYPE, BORDER_FLAT);
      ObjectSetInteger(0, name, OBJPROP_SELECTABLE, selectable);
      ObjectSetInteger(0, name, OBJPROP_SELECTED, false);
   }

   void Label(const string suffix, const string text, const int x, const int y,
              const color value_color, const int size, const bool selectable = false)
   {
      string name = m_prefix + suffix;
      if(ObjectFind(0, name) < 0) ObjectCreate(0, name, OBJ_LABEL, 0, 0, 0);
      SetCommon(name, x, y);
      ObjectSetInteger(0, name, OBJPROP_ANCHOR, ANCHOR_LEFT_UPPER);
      ObjectSetInteger(0, name, OBJPROP_COLOR, value_color);
      ObjectSetInteger(0, name, OBJPROP_FONTSIZE, size);
      ObjectSetInteger(0, name, OBJPROP_SELECTABLE, selectable);
      ObjectSetString(0, name, OBJPROP_FONT, "Arial");
      ObjectSetString(0, name, OBJPROP_TEXT, text);
   }

   void Row(const string suffix, const string label, const string value, const int row_y, const color value_color, const int value_size = 10)
   {
      Label(suffix + "Label", label, m_x + 10, row_y, clrGray, 8);
      Label(suffix + "Value", value == "" ? "—" : value, m_x + 104, row_y, value_color, value_size);
   }

   void DeleteByPrefix(const string prefix)
   {
      int total = ObjectsTotal(0, 0, -1);
      for(int i = total - 1; i >= 0; i--)
      {
         string name = ObjectName(0, i, 0, -1);
         if(StringFind(name, prefix) == 0) ObjectDelete(0, name);
      }
   }

   void DeleteObjects()
   {
      DeleteByPrefix(m_prefix);
   }

   void SavePosition()
   {
      GlobalVariableSet(m_position_key + ".X", m_x);
      GlobalVariableSet(m_position_key + ".Y", m_y);
      GlobalVariableSet(m_position_key + ".M", m_minimized ? 1.0 : 0.0);
      GlobalVariableSet(m_position_key + ".C", m_corner);
      GlobalVariableSet(m_position_key + ".U", m_custom ? 1.0 : 0.0);
   }

public:
   PandaOverlayMT5()
   {
      m_max_age = 600;
      m_x = 12;
      m_y = 12;
      m_minimized = false;
      m_has_data = false;
      m_can_http = false;
      m_corner = PANEL_BOTTOM_LEFT;
      m_custom = false;
      m_status = "CONNECTING";
      ClearData();
   }

   bool Initialize(const string edition, const string header_name, const string credential, const int corner = PANEL_BOTTOM_LEFT)
   {
      m_edition = edition;
      m_corner = corner;
      m_header_name = header_name;
      m_credential = Trim(credential);
      int program_type = (int)MQLInfoInteger(MQL_PROGRAM_TYPE);
      m_can_http = program_type == PROGRAM_EXPERT || program_type == PROGRAM_SCRIPT;
      m_symbol = CanonicalSymbol(Symbol());
      m_prefix = "PandaMT5." + IntegerToString((int)ChartID()) + (m_can_http ? ".F." : ".I.");
      DeleteByPrefix("PandaMT5.");
      m_cache_key = Digest("MT5|" + m_header_name + "|" + m_credential);
      m_cache_file = "PandaOverlay\\MT5-" + m_cache_key + ".json";
      FolderCreate("PandaOverlay", FILE_COMMON);
      m_device_file = "PandaOverlay\\MT5-device-" + Digest(m_credential) + ".txt";
      if(m_edition == "LICENSED") LoadDeviceCredentials();
      m_lock_key = "Panda.MT5.Lock." + m_cache_key;
      m_attempt_key = "Panda.MT5.Try." + m_cache_key;
      m_received_key = "Panda.MT5.Rx." + m_cache_key;
      m_position_key = "Panda.MT5.Pos." + edition + (m_can_http ? ".F." : ".I.") + IntegerToString((int)ChartID());
      if(GlobalVariableCheck(m_position_key + ".C") && (int)GlobalVariableGet(m_position_key + ".C") == m_corner)
      {
         if(GlobalVariableCheck(m_position_key + ".U")) m_custom = GlobalVariableGet(m_position_key + ".U") > 0.5;
         if(m_custom && GlobalVariableCheck(m_position_key + ".X")) m_x = (int)GlobalVariableGet(m_position_key + ".X");
         if(m_custom && GlobalVariableCheck(m_position_key + ".Y")) m_y = (int)GlobalVariableGet(m_position_key + ".Y");
      }
      if(GlobalVariableCheck(m_position_key + ".M")) m_minimized = GlobalVariableGet(m_position_key + ".M") > 0.5;
      if(m_symbol == "") m_status = "UNSUPPORTED SYMBOL";
      else if(m_credential == "") m_status = "AUTH REQUIRED";
      Render();
      OnTimer();
      return true;
   }

   void Shutdown()
   {
      SavePosition();
      DeleteObjects();
      ChartRedraw(0);
   }

   void OnTimer()
   {
      if(m_symbol == "" || m_credential == "")
      {
         Render();
         return;
      }

      string cached = "";
      if(ReadCache(cached))
      {
         if(!ParseSnapshot(cached))
         {
            string denial = JsonString(cached, "status");
            if(denial != "")
            {
               ClearData();
               m_status = denial;
            }
         }
         else
         {
            double received = GlobalVariableCheck(m_received_key) ? GlobalVariableGet(m_received_key) : 0.0;
            m_status = received > 0.0 && TimeLocal() - received > m_max_age ? "STALE" : "LIVE";
         }
      }
      RefreshFromNetwork();
      Render();
   }

   void OnChartEvent(const int id, const long &lparam, const double &dparam, const string &sparam)
   {
      if(id == CHARTEVENT_OBJECT_DRAG && sparam == m_prefix + "Header")
      {
         m_x = (int)ObjectGetInteger(0, sparam, OBJPROP_XDISTANCE) - 4;
         m_y = (int)ObjectGetInteger(0, sparam, OBJPROP_YDISTANCE) - 4;
         if(m_x < 0) m_x = 0;
         if(m_y < 0) m_y = 0;
         m_custom = true;
         SavePosition();
         Render();
      }
      if(id == CHARTEVENT_CHART_CHANGE)
      {
         Render();
      }
      if(id == CHARTEVENT_OBJECT_CLICK && sparam == m_prefix + "Minimize")
      {
         m_minimized = !m_minimized;
         SavePosition();
         DeleteObjects();
         Render();
      }
   }

   int OnCalculate(const int rates_total, const int prev_calculated)
   {
      return rates_total;
   }

   void RenderFeedBadge()
   {
      int bw = 200;
      int bh = 22;
      int chart_w = (int)ChartGetInteger(0, CHART_WIDTH_IN_PIXELS, 0);
      int chart_h = (int)ChartGetInteger(0, CHART_HEIGHT_IN_PIXELS, 0);
      bool right_side = m_corner == PANEL_TOP_RIGHT || m_corner == PANEL_BOTTOM_RIGHT;
      bool bottom_side = m_corner == PANEL_BOTTOM_LEFT || m_corner == PANEL_BOTTOM_RIGHT;
      int bx = right_side ? chart_w - bw - 4 : 4;
      int by = bottom_side ? 4 : chart_h - bh - 4;
      if(bx < 0) bx = 0;
      if(by < 0) by = 0;
      Rect("Background", bx, by, bw, bh, C'9,15,25', C'26,37,64', false);
      Label("Title", "PANDA FEED", bx + 8, by + 5, clrWhite, 8);
      Label("Status", m_status, bx + 92, by + 5, StatusColor(), 8);
      ChartRedraw(0);
   }

   void Render()
   {
      if(m_can_http)
      {
         RenderFeedBadge();
         return;
      }
      int width = PANDA_PANEL_WIDTH;
      int height = m_minimized ? PANDA_PANEL_HEIGHT_MIN : PANDA_PANEL_HEIGHT;
      if(!m_custom)
      {
         int chart_w = (int)ChartGetInteger(0, CHART_WIDTH_IN_PIXELS, 0);
         int chart_h = (int)ChartGetInteger(0, CHART_HEIGHT_IN_PIXELS, 0);
         bool right_side = m_corner == PANEL_TOP_RIGHT || m_corner == PANEL_BOTTOM_RIGHT;
         bool bottom_side = m_corner == PANEL_BOTTOM_LEFT || m_corner == PANEL_BOTTOM_RIGHT;
         m_x = right_side ? chart_w - width - PANDA_PANEL_MARGIN : PANDA_PANEL_MARGIN;
         m_y = bottom_side ? chart_h - height - PANDA_PANEL_MARGIN : PANDA_PANEL_MARGIN;
         if(m_x < 0) m_x = 0;
         if(m_y < 0) m_y = 0;
      }

      Rect("Background", m_x, m_y, width, height, C'9,15,25', C'26,37,64', false);
      Rect("Header", m_x + 4, m_y + 4, width - 8, 24, C'14,21,37', C'0,180,255', true);
      Label("Title", (m_symbol == "" ? Symbol() : m_symbol) + " · PANDA", m_x + 10, m_y + 9, clrWhite, 9);
      Label("Minimize", m_minimized ? "[+]" : "[-]", m_x + width - 24, m_y + 9, C'0,180,255', 9, true);

      if(m_minimized)
      {
         Label("Status", m_score + "  " + m_bias, m_x + 120, m_y + 10, BiasColor(), 9);
      }
      else
      {
         Label("Status", m_status, m_x + 120, m_y + 10, StatusColor(), 8);
         Row("Score", "SCORE", m_score, m_y + 36, BiasColor(), 16);
         Row("BaseXtf", "BASE XTF", m_base_xtf, m_y + 64, C'120,200,255', 8);
         Row("QuoteXtf", "QUOTE XTF", m_quote_xtf, m_y + 80, C'120,200,255', 8);
         Row("Bias", "BIAS", m_bias, m_y + 98, BiasColor(), 10);
         Row("BoxH4", "BOX H4", m_box_h4, m_y + 118, clrWhite, 9);
         Row("BoxH1", "BOX H1", m_box_h1, m_y + 138, clrWhite, 9);
         Row("PandaLines", "PANDA LINES", m_panda_lines, m_y + 158, m_panda_lines == "CONFIRMED" ? C'0,255,159' : C'255,209,102', 9);
         Row("Xtf", "XTF", m_xtf, m_y + 178, C'120,200,255', 8);
         Label("Footer", "Dashboard sync · " + (m_updated_at == "" ? "—" : m_updated_at), m_x + 10, m_y + height - 18, StatusColor(), 7);
      }
      ChartRedraw(0);
   }
};

#endif

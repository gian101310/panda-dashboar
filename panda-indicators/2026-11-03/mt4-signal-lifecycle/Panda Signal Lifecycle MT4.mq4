#property strict
#property indicator_chart_window
#property version "1.03"

// Read-only mirror of Panda Engine's lifecycle export. No trading or scoring.
input bool ShowPanel = true;
input int RefreshSeconds = 15;
input ENUM_BASE_CORNER PanelCorner = CORNER_LEFT_UPPER;
input int PanelX = 12;
input int PanelY = 30;

string prefix;
string pairName;
string keys[32];
string values[32];
int fieldCount = 0;
bool minimized = false;
int panelXCurrent;
int panelYCurrent;
string lastRenderedKey = "";

string SupportedPair()
{
   string symbolName = Symbol();
   StringToUpper(symbolName);
   string pairs[21] = {"AUDJPY","AUDCAD","AUDNZD","AUDUSD","CADJPY","EURAUD","EURCAD",
                       "EURGBP","EURJPY","EURNZD","EURUSD","GBPAUD","GBPCAD","GBPJPY",
                       "GBPNZD","GBPUSD","NZDCAD","NZDJPY","NZDUSD","USDCAD","USDJPY"};
   string found = "";
   for(int i=0; i<21; i++)
      if(StringFind(symbolName, pairs[i]) >= 0)
      {
         if(found != "") return "";
         found = pairs[i];
      }
   return found;
}

void ClearObjects()
{
   for(int i=0; i<18; i++) ObjectDelete(0, prefix + IntegerToString(i));
   ObjectDelete(0, prefix + "bg");
   ObjectDelete(0, prefix + "toggle");
}

void Label(int index, string message, int y, color ink, int size=10)
{
   string name = prefix + IntegerToString(index);
   ObjectCreate(0, name, OBJ_LABEL, 0, 0, 0);
   ObjectSetInteger(0, name, OBJPROP_CORNER, PanelCorner);
   ObjectSetInteger(0, name, OBJPROP_XDISTANCE, panelXCurrent + 12);
   ObjectSetInteger(0, name, OBJPROP_YDISTANCE, panelYCurrent + y);
   ObjectSetInteger(0, name, OBJPROP_COLOR, ink);
   ObjectSetInteger(0, name, OBJPROP_FONTSIZE, size);
   ObjectSetInteger(0, name, OBJPROP_SELECTABLE, false);
   ObjectSetInteger(0, name, OBJPROP_HIDDEN, true);
   ObjectSetString(0, name, OBJPROP_FONT, "Consolas");
   ObjectSetString(0, name, OBJPROP_TEXT, message);
}

void Background(int height)
{
   string name = prefix + "bg";
   ObjectCreate(0, name, OBJ_RECTANGLE_LABEL, 0, 0, 0);
   ObjectSetInteger(0, name, OBJPROP_CORNER, PanelCorner);
   ObjectSetInteger(0, name, OBJPROP_XDISTANCE, panelXCurrent);
   ObjectSetInteger(0, name, OBJPROP_YDISTANCE, panelYCurrent);
   ObjectSetInteger(0, name, OBJPROP_XSIZE, 490);
   ObjectSetInteger(0, name, OBJPROP_YSIZE, height);
   ObjectSetInteger(0, name, OBJPROP_BGCOLOR, C'17,25,35');
   ObjectSetInteger(0, name, OBJPROP_COLOR, C'0,180,255');
   ObjectSetInteger(0, name, OBJPROP_BORDER_TYPE, BORDER_FLAT);
   ObjectSetInteger(0, name, OBJPROP_BACK, false);
   ObjectSetInteger(0, name, OBJPROP_SELECTABLE, true);
   ObjectSetInteger(0, name, OBJPROP_HIDDEN, true);
   string button = prefix + "toggle";
   ObjectCreate(0, button, OBJ_BUTTON, 0, 0, 0);
   ObjectSetInteger(0, button, OBJPROP_CORNER, PanelCorner);
   ObjectSetInteger(0, button, OBJPROP_XDISTANCE, panelXCurrent + 456);
   ObjectSetInteger(0, button, OBJPROP_YDISTANCE, panelYCurrent + 7);
   ObjectSetInteger(0, button, OBJPROP_XSIZE, 24);
   ObjectSetInteger(0, button, OBJPROP_YSIZE, 19);
   ObjectSetInteger(0, button, OBJPROP_BGCOLOR, C'36,49,62');
   ObjectSetInteger(0, button, OBJPROP_COLOR, clrWhite);
   ObjectSetInteger(0, button, OBJPROP_SELECTABLE, false);
   ObjectSetString(0, button, OBJPROP_TEXT, minimized ? "+" : "-");
}

string ShortText(string value, int limit=68)
{
   if(StringLen(value) <= limit) return value;
   return StringSubstr(value, 0, limit - 3) + "...";
}

string Field(string key)
{
   for(int i=0; i<fieldCount; i++) if(keys[i] == key) return values[i];
   return "";
}

bool LoadReading()
{
   fieldCount = 0;
   string fileName = "panda_lifecycle_" + pairName + ".txt";
   int handle = FileOpen(fileName, FILE_READ | FILE_TXT | FILE_ANSI | FILE_COMMON);
   if(handle == INVALID_HANDLE) return false;
   while(!FileIsEnding(handle) && fieldCount < 32)
   {
      string line = FileReadString(handle);
      int separator = StringFind(line, "=");
      if(separator < 1) continue;
      keys[fieldCount] = StringSubstr(line, 0, separator);
      values[fieldCount] = StringSubstr(line, separator + 1);
      fieldCount++;
   }
   FileClose(handle);
   return Field("SYMBOL") == pairName;
}

void DrawPanel()
{
   ClearObjects();
   if(!ShowPanel) return;
   Background(minimized ? 38 : 273);
   bool loaded = pairName != "" && LoadReading();
   int age = loaded ? (int)(TimeGMT() - (datetime)StrToInteger(Field("GENERATED_EPOCH"))) : 0;
   bool fresh = loaded && age >= -60 && age <= 1200;
   string bias = fresh ? Field("BIAS") : "";
   color biasColor = bias == "BUY" ? clrLime : bias == "SELL" ? clrTomato : clrGold;
   if(minimized)
   {
      string summary = fresh ? pairName + "  " + bias + "  GAP " + Field("GAP") + "  |  " + Field("PHASE") :
         pairName + "  |  NO CURRENT READING";
      Label(0, ShortText(summary, 56), 9, biasColor, 11);
      ChartRedraw(); return;
   }
   Label(0, "PANDA | SIGNAL LIFECYCLE  " + pairName, 9, clrDeepSkyBlue, 11);
   if(pairName == "")
   {
      Label(1, "NO CURRENT READING | pair outside Panda list", 44, clrGold);
      ChartRedraw(); return;
   }
   if(!loaded)
   {
      Label(1, "NO CURRENT READING | waiting for MT4 Common Files export", 44, clrGold);
      ChartRedraw(); return;
   }
   if(!fresh)
   {
      Label(1, "NO CURRENT READING | snapshot older than 20 minutes", 44, clrGold);
      Label(2, "Last export: " + Field("GENERATED_UTC"), 66, clrSilver);
      ChartRedraw(); return;
   }
   Label(1, bias + "  GAP " + Field("GAP") + "  |  " + Field("PHASE"), 39, biasColor, 11);
   Label(2, "BOX H1 " + Field("BOX_H1") + "  H4 " + Field("BOX_H4") + "  D1 " + Field("BOX_D1"), 64, clrWhite);
   Label(3, "LEVEL: " + ShortText(Field("LEVEL")), 88, Field("LEVEL_REVIEW") == "1" ? clrGold : clrSilver);
   Label(4, "BASE: " + Field("BASE_BREADTH") + "  |  QUOTE: " + Field("QUOTE_BREADTH"), 112, clrSilver);
   Label(5, "4H: " + ShortText(Field("EVIDENCE")), 136, clrGold);
   if(Field("CONFLICTS") != "-") Label(6, "TF CONFLICT: " + ShortText(Field("CONFLICTS")), 160, clrTomato);
   else if(Field("BOX_CHANGES") != "-") Label(6, "BOX CHANGE: " + ShortText(Field("BOX_CHANGES")), 160, clrGold);
   else Label(6, "REASON: " + ShortText(Field("REASONS")), 160, clrSilver);
   Label(7, "READ: " + ShortText(Field("REASONS")), 184, clrSilver);
   Label(8, "Updated " + Field("GENERATED_UTC") + "  |  no orders", 213, clrSilver, 9);
   Label(9, "Phase is context; verify Panda bias and chart before acting.", 239, clrSilver, 9);
   ChartRedraw();
}

int OnInit()
{
   prefix = "PandaLifecycleMT4_" + IntegerToString(ChartID()) + "_";
   pairName = SupportedPair();
   panelXCurrent = PanelX;
   panelYCurrent = PanelY;
   EventSetTimer(MathMax(5, RefreshSeconds));
   DrawPanel();
   return INIT_SUCCEEDED;
}

void OnDeinit(const int reason)
{
   EventKillTimer();
   ClearObjects();
   ChartRedraw();
}

void OnTimer()
{
   if(!ShowPanel || pairName == "") return;
   string key = "MISSING";
   if(LoadReading())
   {
      int age = (int)(TimeGMT() - (datetime)StrToInteger(Field("GENERATED_EPOCH")));
      key = Field("GENERATED_EPOCH") + (age < -60 || age > 1200 ? "STALE" : "FRESH");
   }
   if(key == lastRenderedKey) return;
   lastRenderedKey = key;
   DrawPanel();
}

void OnChartEvent(const int id, const long &lparam, const double &dparam, const string &sparam)
{
   if(id == CHARTEVENT_OBJECT_CLICK && sparam == prefix + "toggle")
   {
      minimized = !minimized;
      DrawPanel();
   }
   if(id == CHARTEVENT_OBJECT_DRAG && sparam == prefix + "bg")
   {
      panelXCurrent = MathMax(0, (int)ObjectGetInteger(0, sparam, OBJPROP_XDISTANCE));
      panelYCurrent = MathMax(0, (int)ObjectGetInteger(0, sparam, OBJPROP_YDISTANCE));
      DrawPanel();
   }
}

int OnCalculate(const int rates_total, const int prev_calculated, const datetime &time[],
                const double &open[], const double &high[], const double &low[],
                const double &close[], const long &tick_volume[], const long &volume[],
                const int &spread[])
{
   return rates_total;
}

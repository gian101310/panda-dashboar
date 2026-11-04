#property strict
#property version "1.00"
#property description "Read-only licensed data bridge for Panda Trend Confluence v1 indicator"

input string LicenseToken = ""; // Individually issued in Panda License Admin
input int RefreshSeconds = 60;

const string FEED_URL = "https://pandaengine.app/api/trend-confluence-feed";

string FeedFile()
{
   return "PandaTrendConfluenceV1_" + IntegerToString(AccountInfoInteger(ACCOUNT_LOGIN)) + ".txt";
}

void SaveFeed(const string status,const string body)
{
   int file=FileOpen(FeedFile(),FILE_WRITE|FILE_TXT|FILE_COMMON|FILE_ANSI,0,CP_UTF8);
   if(file==INVALID_HANDLE) { Print("Trend Confluence feed file error: ",GetLastError()); return; }
   FileWrite(file,IntegerToString(AccountInfoInteger(ACCOUNT_LOGIN)));
   FileWrite(file,IntegerToString(TimeGMT()));
   FileWrite(file,status);
   FileWrite(file,body);
   FileClose(file);
}

void RefreshFeed()
{
   if(StringLen(LicenseToken)!=64)
   {
      SaveFeed("TOKEN_REQUIRED","");
      return;
   }
   string headers="x-panda-account-number: "+IntegerToString(AccountInfoInteger(ACCOUNT_LOGIN))+"\r\n"+
                  "x-panda-product-code: mt5_trend_confluence_v1\r\n"+
                  "x-panda-confluence-token: "+LicenseToken+"\r\n";
   char request[],response[];
   string response_headers;
   ResetLastError();
   int code=WebRequest("GET",FEED_URL,headers,12000,request,response,response_headers);
   if(code==200)
   {
      SaveFeed("LIVE",CharArrayToString(response,0,-1,CP_UTF8));
      return;
   }
   string status=code==-1 ? "NETWORK_ERROR" : "LICENSE_DENIED";
   SaveFeed(status,"");
   Print("Trend Confluence feed: ",status," HTTP ",code," MQL error ",GetLastError());
}

int OnInit()
{
   EventSetTimer(MathMax(30,RefreshSeconds));
   RefreshFeed();
   return INIT_SUCCEEDED;
}

void OnTimer() { RefreshFeed(); }
void OnDeinit(const int reason) { EventKillTimer(); SaveFeed("OFFLINE",""); }
void OnTick() {}

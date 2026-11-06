#property strict
#property version "1.01"
#property description "Read-only license checker for Panda Box and Lines Licensed. Does not place trades."

int CheckEverySeconds = 300;

string LicenseUrl = "https://pandaengine.app/api/panda-box-lines-license";

string LicenseKey()
{
   long hash = 0;
   string server = AccountServer();
   for(int i = 0; i < StringLen(server); i++)
      hash = (hash * 131 + StringGetCharacter(server, i)) % 2147483647;
   return("PBL." + IntegerToString(AccountNumber()) + "." + IntegerToString((int)hash));
}

void PublishState(const int state)
{
   string key = LicenseKey();
   GlobalVariableSet(key + ".state", state);
   GlobalVariableSet(key + ".at", TimeGMT());
}

void CheckApproval()
{
   PublishState(-1);
   string body = "account_number=" + IntegerToString(AccountNumber());
   char post[];
   char response[];
   string responseHeaders = "";
   StringToCharArray(body, post, 0, StringLen(body), CP_UTF8);
   ResetLastError();
   int code = WebRequest("POST", LicenseUrl,
                         "Content-Type: application/x-www-form-urlencoded\r\n",
                         5000, post, response, responseHeaders);
   if(code == 200 && StringFind(CharArrayToString(response, 0, -1, CP_UTF8), "OK|APPROVED") == 0)
   {
      PublishState(1);
      Comment("Panda Box and Lines license: approved");
      return;
   }
   if(code == 403)
   {
      PublishState(0);
      Comment("Panda Box and Lines license: account not approved");
      return;
   }
   PublishState(-1);
   Print("Panda Box and Lines license check failed. HTTP=", code, " MT4 error=", GetLastError());
   Comment("Panda Box and Lines license: check failed. Allow https://pandaengine.app in WebRequest settings.");
}

int OnInit()
{
   if(AccountNumber() <= 0)
      return(INIT_FAILED);
   EventSetTimer(MathMax(60, CheckEverySeconds));
   CheckApproval();
   return(INIT_SUCCEEDED);
}

void OnTimer()
{
   CheckApproval();
}

void OnDeinit(const int reason)
{
   EventKillTimer();
   PublishState(-1);
   Comment("");
}

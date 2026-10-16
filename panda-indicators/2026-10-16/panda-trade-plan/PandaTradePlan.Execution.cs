using System;
using System.Globalization;
using cAlgo.API;
using PandaPlanning;

namespace cAlgo
{
    public partial class PandaTradePlan
    {
        [Parameter("Default order type",Group="Execution",DefaultValue=ExecutionKind.Limit)]
        public ExecutionKind DefaultOrderKind {get;set;}
        [Parameter("Default lots",Group="Execution",DefaultValue=0.01,MinValue=0.00000001)]
        public double DefaultLots {get;set;}
        [Parameter("Market slippage limit (pips)",Group="Execution",DefaultValue=2,MinValue=0,MaxValue=100)]
        public double MarketSlippage {get;set;}
        private ExecutionKind _orderKind;
        private TextBox _lots;
        private Button _place;
        private Plan _submittedPlan;
        private readonly SubmissionGate _submission=new SubmissionGate();
        private void BuildExecutionPanel(StackPanel panel,double full,double half)
        {
            _orderKind=DefaultOrderKind;
            var row=new Grid(1,2){Margin=Scale(2)};
            row.AddChild(Text("Order type",Blue,12),0,0);
            var kind=new ComboBox {Width=Scale(half),Height=Scale(27),FontSize=Math.Max(8,Scale(12))};
            foreach(var name in Enum.GetNames(typeof(ExecutionKind)))kind.AddItem(name);
            kind.SelectedIndex=(int)_orderKind;
            kind.SelectedItemChanged+=e=>
            {
                _orderKind=(ExecutionKind)kind.SelectedIndex;
                _fields["Entry"].IsReadOnly=_orderKind==ExecutionKind.Market;
                CreatePlan(_pandaBias);
            };
            row.AddChild(kind,0,1);panel.AddChild(row);
            var size=new Grid(1,2){Margin=Scale(2)};size.AddChild(Text("Lots",Color.White,12),0,0);
            _lots=new TextBox {Text=DefaultLots.ToString("0.########",CultureInfo.InvariantCulture),Width=Scale(half),Height=Scale(26),FontSize=Math.Max(8,Scale(12))};
            _lots.TextChanged+=e=>UpdatePreviewVolume();
            size.AddChild(_lots,0,1);panel.AddChild(size);
            panel.AddChild(Text("Broker min "+Symbol.VolumeInUnitsToQuantity(Symbol.VolumeInUnitsMin).ToString("0.########",CultureInfo.InvariantCulture)+
                " | step "+Symbol.VolumeInUnitsToQuantity(Symbol.VolumeInUnitsStep).ToString("0.########",CultureInfo.InvariantCulture)+" lots",Grey,10));
        }
        private OrderType NativeOrderType {get{return (_plan==null?_orderKind:_plan.Kind)==ExecutionKind.Limit?OrderType.Limit:(_plan==null?_orderKind:_plan.Kind)==ExecutionKind.Stop?OrderType.Stop:OrderType.Market;}}
        private void UpdatePreviewVolume()
        {
            var rr=Chart.FindObject(_prefix+"rr") as ChartRiskReward;double lots;
            if(rr==null||!double.TryParse(_lots.Text,NumberStyles.Float,CultureInfo.InvariantCulture,out lots))return;
            double units=Symbol.QuantityToVolumeInUnits(lots);
            if(Rules.Finite(units)&&units>=Symbol.VolumeInUnitsMin&&units<=Symbol.VolumeInUnitsMax&&
                Math.Abs(units/Symbol.VolumeInUnitsStep-Math.Round(units/Symbol.VolumeInUnitsStep))<.000001)rr.VolumeInUnits=units;
        }
        private OrderTicket PrepareOrder(out string reason)
        {
            RefreshContext();
            if(_plan!=null&&(!string.IsNullOrEmpty(_plan.SubmissionId)||ReferenceEquals(_plan,_submittedPlan))){reason="This plan was already submitted. Refresh plan before placing another order.";return null;}
            double lots;double.TryParse(_lots.Text,NumberStyles.Float,CultureInfo.InvariantCulture,out lots);
            var ticket=ExecutionRules.Prepare(_plan,_orderKind,Symbol.Bid,Symbol.Ask,Symbol.PipSize,MinTargetPips,lots,Symbol.LotSize,
                Symbol.VolumeInUnitsMin,Symbol.VolumeInUnitsMax,Symbol.VolumeInUnitsStep,_scoreReady,_pandaBias,_hardInvalid,out reason);
            if(ticket==null)return null;
            if(Mode==PlanMode.PandaLinesConfirmed)
            {
                bool valid=_contextBars.Count>=23;string zone=valid?PandaLineStatusAt(_contextBars.Count-2):"";
                if(!valid||zone!=(_plan.Side=="BUY"?"ABOVE":"BELOW")){reason="Panda Lines are no longer confirmed";return null;}
            }
            if(!ExecutionRules.BrokerDistancesValid(ticket,Symbol.MinStopLossDistance,Symbol.MinTakeProfitDistance,
                Symbol.MinDistanceType==SymbolMinDistanceType.Percentage,Symbol.PipSize,out reason))return null;
            if(!Symbol.IsTradingEnabled||!Symbol.MarketHours.IsOpened()){reason="Trading is unavailable or market is closed";return null;}
            if(_plan.RuleVersion!=5){reason="Refresh the retained older plan before placing an order";return null;}
            if((_orderKind!=ExecutionKind.Market&&Field("Entry")!=_plan.Entry)||Field("Stop loss")!=_plan.Stop||Field("TP1")!=_plan.Target)
            {reason="Apply edited prices before placing the order";return null;}
            return ticket;
        }
        // This handler is the only path to broker submission. Never called by
        // planning, initialization, chart events or automatic refresh.
        private void PlaceOrder()
        {
            if(!_submission.Enter(DateTime.UtcNow))return;
            _place.IsEnabled=false;
            try
            {
                string reason;var ticket=PrepareOrder(out reason);
                if(ticket==null){_message=reason;return;}
                if(!Permissions.TradingPermission.IsAllowed)Permissions.TradingPermission.Request();
                if(!Permissions.TradingPermission.IsAllowed){_message="Trading permission was not granted";return;}
                // Permission UI can remain open while quotes or bias change.
                ticket=PrepareOrder(out reason);if(ticket==null){_message=reason;return;}
                var side=ticket.Side=="BUY"?TradeType.Buy:TradeType.Sell;
                string label="PandaPlan-"+Guid.NewGuid().ToString("N").Substring(0,12);
                TradeResult result;
                if(ticket.Kind==ExecutionKind.Limit)
                    result=PlaceLimitOrder(side,SymbolName,ticket.VolumeUnits,ticket.Entry,label,ticket.Stop,ticket.Target,ProtectionType.Absolute);
                else if(ticket.Kind==ExecutionKind.Stop)
                    result=PlaceStopOrder(side,SymbolName,ticket.VolumeUnits,ticket.Entry,label,ticket.Stop,ticket.Target,ProtectionType.Absolute);
                else
                    result=ExecuteMarketRangeOrder(side,SymbolName,ticket.VolumeUnits,MarketSlippage,ticket.Entry,label,ticket.StopPips,ticket.TargetPips);
                if(!result.IsSuccessful){_message="Order rejected: "+result.Error+". Check Orders before retrying.";return;}
                _submittedPlan=_plan;_plan.SubmissionId=label;_autoPaused=true;_plan.Manual=true;
                if(result.Position!=null)
                {
                    var position=result.Position;_plan.Entry=position.EntryPrice;
                    if(position.StopLoss.HasValue)_plan.Stop=position.StopLoss.Value;
                    if(position.TakeProfit.HasValue)_plan.Target=position.TakeProfit.Value;
                    _message="Market order placed | position "+position.Id;
                }
                else _message="Pending order placed | order "+result.PendingOrder.Id;
                _plan.Target2=null;_plan.Target3=null;Save();Render();
            }
            catch(Exception ex){_message="Submission interrupted ("+ex.GetType().Name+"). Check Orders before retrying.";}
            finally {_submission.Complete();_place.IsEnabled=true;UpdateStatus();}
        }
    }
}

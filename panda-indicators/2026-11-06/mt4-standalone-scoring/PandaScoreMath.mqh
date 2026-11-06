#ifndef PANDA_SCORE_MATH
#define PANDA_SCORE_MATH
// Pure arithmetic shared by the MT4 indicator and the native calculation tests.
int PandaVote(double bid,double low,double high){return bid>high?1:bid<low?-1:0;}
int PandaStrongest(int p0,int n0,int p1,int n1,int p2,int n2){
 int strongestPositive=p0>p1?p0:p1;strongestPositive=strongestPositive>p2?strongestPositive:p2;
 int strongestNegative=n0<n1?n0:n1;strongestNegative=strongestNegative<n2?strongestNegative:n2;
 if(strongestPositive>=4 && strongestNegative<=-4)return 0;
 if(strongestPositive==-strongestNegative)return 0;return strongestPositive>-strongestNegative?strongestPositive:strongestNegative;
}
bool PandaConflict(int p0,int n0,int p1,int n1,int p2,int n2){return (p0>=4 || p1>=4 || p2>=4) && (n0<=-4 || n1<=-4 || n2<=-4);}
struct PandaDecision {int gap;int bias;int execution;int confidence;bool invalid;};
PandaDecision PandaDecide(int base,int quote,bool conflict){
 PandaDecision d;d.gap=0;d.bias=0;d.execution=0;d.confidence=0;
 int ab=base<0?-base:base,aq=quote<0?-quote:quote;
 d.invalid=conflict || (ab<4 && aq<4);if(d.invalid)return d;
 d.gap=base-quote;int magnitude=d.gap<0?-d.gap:d.gap;
 d.bias=d.gap>=5?1:d.gap<=-5?-1:0;
 d.execution=magnitude>=9?2:magnitude>=5?1:0;
 d.confidence=magnitude>=10?3:magnitude>=8?2:magnitude>=5?1:0;return d;
}
#endif

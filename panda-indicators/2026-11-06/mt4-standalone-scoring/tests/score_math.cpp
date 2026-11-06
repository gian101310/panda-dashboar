#include <cassert>
#include <iostream>
#include "../PandaScoreMath.mqh"
int main(){
 assert(PandaVote(11,5,10)==1);assert(PandaVote(4,5,10)==-1);assert(PandaVote(10,5,10)==0);assert(PandaVote(5,5,10)==0);
 assert(PandaStrongest(3,-1,0,0,0,0)==3);assert(PandaStrongest(3,-3,2,0,0,0)==0);assert(PandaStrongest(0,-5,3,-1,0,0)==-5);
 assert(PandaConflict(4,0,0,-4,0,0));assert(!PandaConflict(3,0,0,-4,0,0));
 auto b=PandaDecide(6,-3,false);assert(b.gap==9 && b.bias==1 && b.execution==2 && b.confidence==2 && !b.invalid);
 auto s=PandaDecide(-4,1,false);assert(s.gap==-5 && s.bias==-1 && s.execution==1 && s.confidence==1);
 assert(PandaDecide(3,-3,false).invalid);assert(PandaDecide(6,-4,false).confidence==3);assert(PandaDecide(4,-4,false).confidence==2);
 auto c=PandaDecide(6,-5,true);assert(c.invalid && c.gap==0 && c.bias==0);
 assert(PandaDecide(4,1,false).bias==0);std::cout<<"Standalone arithmetic checks passed\n";
}

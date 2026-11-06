"""Compare the actual portable MT4 math against the locked engine functions.
Only selected function ASTs are loaded; app.py is never started or imported.
"""
import ast, contextlib, ctypes, io, pathlib, random, re, subprocess, tempfile
root = pathlib.Path(__file__).resolve().parents[4]
source = ast.parse((root / 'app.py').read_text())
names = {'extract_panda_score', '_build_currency_line', 'compute_scores_all_pairs'}
module = ast.Module(body=[n for n in source.body if isinstance(n, ast.FunctionDef) and n.name in names], type_ignores=[])
engine = {'re': re}
exec(compile(module, 'locked-engine-functions', 'exec'), engine)
header = pathlib.Path(__file__).resolve().parents[1] / 'PandaScoreMath.mqh'
with tempfile.TemporaryDirectory() as folder:
    folder = pathlib.Path(folder)
    cpp = folder / 'parity.cpp'
    cpp.write_text('#include "' + str(header) + '"\n' + '''extern "C" void score(const int* v,int* out){
      int b=PandaStrongest(v[0],v[1],v[2],v[3],v[4],v[5]);
      int q=PandaStrongest(v[6],v[7],v[8],v[9],v[10],v[11]);
      bool conflict=PandaConflict(v[0],v[1],v[2],v[3],v[4],v[5]) || PandaConflict(v[6],v[7],v[8],v[9],v[10],v[11]);
      PandaDecision d=PandaDecide(b,q,conflict);out[0]=b;out[1]=q;out[2]=d.gap;out[3]=d.bias;out[4]=d.execution;out[5]=d.confidence;out[6]=d.invalid;
    }''')
    library = folder / 'parity.dylib'
    subprocess.run(['clang++', '-std=c++17', '-shared', '-fPIC', str(cpp), '-o', str(library)], check=True)
    lib = ctypes.CDLL(str(library))
    lib.score.argtypes = [ctypes.POINTER(ctypes.c_int), ctypes.POINTER(ctypes.c_int)]
    rng = random.Random(20261106)
    for case in range(2000):
        values = [rng.randint(0,6) if i%2==0 else -rng.randint(0,6) for i in range(12)]
        def line(currency,offset):
            return currency + ' ' + ' '.join(f'{tf}:{values[offset+i*2]:+d}/{values[offset+i*2+1]:+d}' for i,tf in enumerate(['D1','H4','H1']))
        parsed={'base_cur':'EUR','quote_cur':'USD','raw_base_line':line('EUR',0),'raw_quote_line':line('USD',6)}
        with contextlib.redirect_stdout(io.StringIO()):
            expected=engine['compute_scores_all_pairs']({'EURUSD':parsed})['EURUSD']
        output=(ctypes.c_int*7)();lib.score((ctypes.c_int*12)(*values),output)
        actual={'base_score':output[0],'quote_score':output[1],'gap':output[2], 'bias':'HARD_INVALID' if output[6] else {1:'BUY',-1:'SELL',0:'INVALID'}[output[3]],'execution':['NONE','PULLBACK','MARKET'][output[4]],'confidence':['INVALID','LOW','MEDIUM','HIGH'][output[5]],'hard_invalid':bool(output[6])}
        for key,value in actual.items():
            assert expected[key]==value,(case,key,values,expected,actual)
print('2,000 cases match locked engine scoring, bias, invalidation, execution and confidence')

import test from 'node:test';
import assert from 'node:assert/strict';
import { hashOverlayToken } from '../lib/ctraderOverlay.mjs';
import { decideConfluenceAccess, confluencePlatform } from '../lib/trendConfluenceLicense.mjs';
import { getIndicatorProduct } from '../lib/indicatorProducts.mjs';
const productCode='ctrader_raw_score_engine';
const token='a'.repeat(64), account='12345678';
function fixture(){return {productCode,token,account,license:{id:'raw-1',product_code:productCode,platform:'CTRADER',trading_account_number:account,status:'APPROVED',paid_confirmed:true,expires_at:null},credential:{license_id:'raw-1',product_code:productCode,platform:'CTRADER',token_hash:hashOverlayToken(token)}};}
test('raw score product is registered for account-bound cTrader licensing',()=>{
 assert.equal(getIndicatorProduct(productCode)?.platform,'CTRADER');
 assert.equal(confluencePlatform(productCode),'CTRADER');
 assert.equal(decideConfluenceAccess(fixture()).ok,true);
});
test('raw score token alone cannot bypass account registration or approval',()=>{
 for(const changes of [{license:null},{account:'87654321'},{token:'b'.repeat(64)},{credential:null},{token:''}])assert.equal(decideConfluenceAccess({...fixture(),...changes}).ok,false);
 for(const status of ['PENDING','DISABLED','EXPIRED']){const f=fixture();f.license.status=status;assert.equal(decideConfluenceAccess(f).ok,false);}
 const f=fixture();f.license.paid_confirmed=false;assert.equal(decideConfluenceAccess(f).ok,false);
});
test('another product token cannot activate raw score',()=>{
 const f=fixture();f.credential.product_code='ctrader_trend_confluence_v1';assert.equal(decideConfluenceAccess(f).ok,false);
});

import { readFileSync } from 'node:fs';
import { normalizeTradingAccountNumber } from '../lib/indicatorLicense.mjs';
import { sanitizeOverlayRows } from '../lib/ctraderOverlay.mjs';
async function routeFixture(overrides={}) {
 let reads=0;
 const f={...fixture(),...overrides};
 const supabase={from(table){const q={select(){return q},eq(){return q},order(){return q},limit(){return q},update(){return q},async maybeSingle(){return {data:table==='indicator_licenses'?f.license:f.credential,error:null}},then(resolve){if(table==='dashboard')reads++;return Promise.resolve({data:table==='dashboard'?[{symbol:'EURUSD',gap:8,bias:'BUY',base_d1:4,adv_base_h1:2}]:null,error:null}).then(resolve)}};return q;}};
 const source=readFileSync(new URL('../pages/api/trend-confluence-feed.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace('export default async function handler','async function handler');
 const route=new Function('supabase','sanitizeOverlayRows','normalizeTradingAccountNumber','confluencePlatform','decideConfluenceAccess',source+'\nreturn handler;')(supabase,sanitizeOverlayRows,normalizeTradingAccountNumber,confluencePlatform,decideConfluenceAccess);
 const res={statusCode:200,setHeader(){},status(n){this.statusCode=n;return this},json(body){this.body=body;return this},end(){return this}};
 await route({method:'GET',headers:{'x-panda-product-code':productCode,'x-panda-account-number':f.account,'x-panda-confluence-token':f.token}},res);
 return {res,reads};
}
test('licensed HTTP feed rejects unregistered accounts before reading scores',async()=>{
 const {res,reads}=await routeFixture({license:null});assert.equal(res.statusCode,403);assert.equal(reads,0);
});
test('licensed HTTP feed rejects incorrect and missing tokens before reading scores',async()=>{
 for(const token of ['', 'b'.repeat(64)]){const {res,reads}=await routeFixture({token});assert.ok([401,403].includes(res.statusCode));assert.equal(reads,0);}
});
test('licensed HTTP feed returns stored raw and ADV fields for approved account and bound token',async()=>{
 const {res,reads}=await routeFixture();assert.equal(res.statusCode,200);assert.equal(reads,1);assert.equal(res.body.pairs[0].base_d1,4);assert.equal(res.body.pairs[0].adv_base_h1,2);
});
test('licensed HTTP feed blocks disabled, unpaid, expired and mismatched accounts',async()=>{
 const fixtures=[];
 for(const status of ['PENDING','DISABLED','EXPIRED']){const f=fixture();f.license.status=status;fixtures.push(f);}
 const unpaid=fixture();unpaid.license.paid_confirmed=false;fixtures.push(unpaid);
 const expired=fixture();expired.license.expires_at='2020-01-01T00:00:00Z';fixtures.push(expired);
 fixtures.push({...fixture(),account:'87654321'});
 const revoked=fixture();revoked.credential=null;fixtures.push(revoked);
 for(const f of fixtures){const {res,reads}=await routeFixture(f);assert.equal(res.statusCode,403);assert.equal(reads,0);}
});

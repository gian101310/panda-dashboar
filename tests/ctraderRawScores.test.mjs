import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeOverlayRows } from '../lib/ctraderOverlay.mjs';
test('feed preserves engine current and ADV scores without recomputing gap',()=>{
 const source={symbol:'EURUSD',gap:8,bias:'BUY',execution:'PULLBACK',confidence:'MEDIUM',base_d1:3,base_h4:5,base_h1:0,quote_d1:-3,quote_h4:0,quote_h1:1,adv_base_d1:4,adv_base_h4:2,adv_base_h1:1,adv_quote_d1:-2,adv_quote_h4:0,adv_quote_h1:-1,atr:123,atr_reference:456};
 const [row]=sanitizeOverlayRows([source]);
 for(const key of Object.keys(source))assert.equal(row[key],source[key],key);
});
test('missing or malformed scores stay unavailable, never become zero',()=>{
 const [row]=sanitizeOverlayRows([{symbol:'EURUSD',base_d1:null,base_h4:'',base_h1:'bad',adv_base_d1:0,atr:-1}]);
 assert.equal(row.base_d1,null);assert.equal(row.base_h4,null);assert.equal(row.base_h1,null);assert.equal(row.adv_base_d1,0);assert.equal(row.atr,null);
});

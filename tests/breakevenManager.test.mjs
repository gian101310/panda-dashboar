import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateBreakeven, planBreakevenActions } from '../lib/breakevenManager.mjs';

describe('evaluateBreakeven', () => {
  const basePosition = {
    id: '12345',
    label: 'PANDA-PLPB',
    symbolName: 'EURUSD',
    tradeSide: 'BUY',
    entryPrice: 1.10000,
    pips: 35,
    stopLoss: 1.09500,
  };

  it('triggers breakeven when pips >= 30', () => {
    const result = evaluateBreakeven(basePosition);
    assert.ok(result);
    assert.equal(result.action, 'amend_position');
    assert.equal(result.args.positionId, '12345');
    // newSL = entry + 2 pips buffer = 1.10000 + 0.00020 = 1.10020
    assert.equal(result.args.stopLoss, 1.10020);
  });

  it('does not trigger below threshold', () => {
    const result = evaluateBreakeven({ ...basePosition, pips: 20 });
    assert.equal(result, null);
  });

  it('does not trigger for non-PANDA positions', () => {
    const result = evaluateBreakeven({ ...basePosition, label: 'MANUAL' });
    assert.equal(result, null);
  });

  it('does not trigger if SL already at/past entry (BUY)', () => {
    const result = evaluateBreakeven({ ...basePosition, stopLoss: 1.10050 });
    assert.equal(result, null);
  });

  it('handles SELL positions correctly', () => {
    const sellPos = {
      ...basePosition,
      tradeSide: 'SELL',
      stopLoss: 1.10500,
    };
    const result = evaluateBreakeven(sellPos);
    assert.ok(result);
    // newSL = entry - 2 pips = 1.10000 - 0.00020 = 1.09980
    assert.equal(result.args.stopLoss, 1.09980);
  });

  it('handles JPY pairs with correct pip size', () => {
    const jpyPos = {
      ...basePosition,
      symbolName: 'USDJPY',
      entryPrice: 150.000,
      stopLoss: 149.500,
    };
    const result = evaluateBreakeven(jpyPos);
    assert.ok(result);
    // newSL = 150.000 + 2 * 0.01 = 150.020
    assert.equal(result.args.stopLoss, 150.020);
  });

  it('respects custom trigger and buffer', () => {
    const result = evaluateBreakeven(
      { ...basePosition, pips: 25 },
      { triggerPips: 25, bufferPips: 5 }
    );
    assert.ok(result);
    // newSL = 1.10000 + 5 * 0.0001 = 1.10050
    assert.equal(result.args.stopLoss, 1.10050);
  });
});

describe('planBreakevenActions', () => {
  it('returns actions only for qualifying positions', () => {
    const positions = [
      { id: '1', label: 'PANDA-PLPB', symbolName: 'EURUSD', tradeSide: 'BUY', entryPrice: 1.10000, pips: 35, stopLoss: 1.09500 },
      { id: '2', label: 'PANDA-INTRA-PB', symbolName: 'GBPUSD', tradeSide: 'SELL', entryPrice: 1.27000, pips: 10, stopLoss: 1.27500 },
      { id: '3', label: 'MANUAL', symbolName: 'AUDUSD', tradeSide: 'BUY', entryPrice: 0.66000, pips: 50, stopLoss: 0.65500 },
    ];
    const actions = planBreakevenActions(positions);
    assert.equal(actions.length, 1);
    assert.equal(actions[0].args.positionId, '1');
  });
});

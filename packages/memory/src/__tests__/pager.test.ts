import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ContextPager } from '../pager.js';

let pager: ContextPager;

beforeEach(() => { pager = new ContextPager({ maxTokens: 1000, dbPath: ':memory:' }); });
afterEach(() => { pager.close(); });

describe('ContextPager', () => {
  it('starts empty', () => {
    expect(pager.hotTokens()).toBe(0);
    expect(pager.coldCount()).toBe(0);
    expect(pager.getHot()).toHaveLength(0);
  });

  it('add item under budget stays hot', () => {
    pager.add({ id: 'a', content: 'hello', tokens: 100 });
    expect(pager.hotTokens()).toBe(100);
    expect(pager.getHot()).toHaveLength(1);
    expect(pager.coldCount()).toBe(0);
  });

  it('hot tokens never exceed maxTokens', () => {
    for (let i = 0; i < 20; i++) {
      pager.add({ id: `item-${i}`, content: `content ${i}`, tokens: 100 });
    }
    expect(pager.hotTokens()).toBeLessThanOrEqual(1000);
  });

  it('excess items are paged to cold', () => {
    for (let i = 0; i < 15; i++) {
      pager.add({ id: `item-${i}`, content: `c${i}`, tokens: 100 });
    }
    expect(pager.coldCount()).toBeGreaterThan(0);
    expect(pager.hotTokens()).toBeLessThanOrEqual(1000);
  });

  it('retrieve promotes cold item back to hot', () => {
    for (let i = 0; i < 11; i++) {
      pager.add({ id: `item-${i}`, content: `c${i}`, tokens: 100 });
    }
    const coldBefore = pager.coldCount();
    expect(coldBefore).toBeGreaterThan(0);

    const firstColdId = pager.coldIds()[0]!;
    const retrieved = pager.retrieve(firstColdId);
    expect(retrieved).toBeDefined();
    expect(retrieved!.id).toBe(firstColdId);
    // item is now in hot, not in cold
    expect(pager.coldIds()).not.toContain(firstColdId);
    expect(pager.getHot().some((h) => h.id === firstColdId)).toBe(true);
  });

  it('item exceeding maxTokens by itself goes straight to cold', () => {
    pager.add({ id: 'huge', content: 'x'.repeat(10), tokens: 2000 });
    expect(pager.hotTokens()).toBe(0);
    expect(pager.coldCount()).toBe(1);
  });

  it('clear resets hot and cold', () => {
    pager.add({ id: 'a', content: 'x', tokens: 500 });
    pager.add({ id: 'b', content: 'y', tokens: 600 });
    pager.clear();
    expect(pager.hotTokens()).toBe(0);
    expect(pager.coldCount()).toBe(0);
  });

  it('coldIds returns IDs of cold items', () => {
    for (let i = 0; i < 12; i++) {
      pager.add({ id: `item-${i}`, content: `c${i}`, tokens: 100 });
    }
    const ids = pager.coldIds();
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) expect(typeof id).toBe('string');
  });

  it('acceptance: 50k tokens of content runs in 8k window', () => {
    const p = new ContextPager({ maxTokens: 8000, dbPath: ':memory:' });
    for (let i = 0; i < 100; i++) {
      p.add({ id: `chunk-${i}`, content: `content chunk ${i}`, tokens: 500 });
    }
    expect(p.hotTokens()).toBeLessThanOrEqual(8000);
    expect(p.coldCount()).toBeGreaterThan(0);
    p.close();
  });
});

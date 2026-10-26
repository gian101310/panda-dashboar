export function createIndicatorLicenseLookupBackoff(lookup, { retryMs = 60_000, now = Date.now } = {}) {
  const pending = new Set();
  const retryAfter = new Map();

  return async (account, productCode) => {
    const key = `${productCode}:${account}`;
    if (pending.has(key) || (retryAfter.get(key) || 0) > now()) {
      throw new Error('License lookup temporarily unavailable');
    }

    pending.add(key);
    try {
      const license = await lookup(account, productCode);
      retryAfter.delete(key);
      return license;
    } catch (error) {
      retryAfter.set(key, now() + retryMs);
      throw error;
    } finally {
      pending.delete(key);
    }
  };
}

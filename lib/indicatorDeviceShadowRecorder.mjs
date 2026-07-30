export function createIndicatorDeviceShadowRecorder({
  writeEvent,
  now = () => Date.now(),
  throttleMs = 5 * 60 * 1000,
}) {
  const recent = new Map();

  return async function recordIndicatorDeviceShadowEvent(event) {
    const safeEvent = {
      licenseId: event?.licenseId,
      productCode: event?.productCode,
      platform: event?.platform,
      wouldStatus: event?.wouldStatus,
      installationPresent: event?.installationPresent === true,
      tokenPresent: event?.tokenPresent === true,
    };
    const key = [
      safeEvent.licenseId,
      safeEvent.productCode,
      safeEvent.platform,
      safeEvent.wouldStatus,
      safeEvent.installationPresent,
      safeEvent.tokenPresent,
    ].join(':');
    const timestamp = now();
    if (recent.has(key) && timestamp - recent.get(key) < throttleMs) return false;

    await writeEvent(safeEvent);
    recent.set(key, timestamp);

    if (recent.size > 1000) {
      for (const [storedKey, lastWrite] of recent) {
        if (timestamp - lastWrite >= throttleMs) recent.delete(storedKey);
      }
    }
    return true;
  };
}

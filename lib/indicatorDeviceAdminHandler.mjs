import {
  CTRADER_OVERLAY_PRODUCT_CODE,
  MT4_OVERLAY_PRODUCT_CODE,
  MT5_OVERLAY_PRODUCT_CODE,
} from './indicatorProducts.mjs';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DEVICE_PRODUCTS = new Set([
  CTRADER_OVERLAY_PRODUCT_CODE,
  MT4_OVERLAY_PRODUCT_CODE,
  MT5_OVERLAY_PRODUCT_CODE,
]);

function validUuid(value) {
  const normalized = String(value || '').trim();
  return UUID_PATTERN.test(normalized) ? normalized : '';
}

function sanitizeDevice(device) {
  return {
    id: device?.id,
    license_id: device?.license_id,
    product_code: device?.product_code,
    platform: device?.platform,
    device_fingerprint: String(device?.device_fingerprint || '').slice(0, 12),
    status: device?.status,
    activated_at: device?.activated_at || null,
    last_seen_at: device?.last_seen_at || null,
    revoked_at: device?.revoked_at || null,
  };
}

export function createIndicatorDeviceAdminHandler({
  requireAdmin,
  listPolicies = async () => [],
  listDevices = async () => [],
  getActiveDeviceCount = async () => 0,
  setLicenseLimit = async () => {},
  setEnforcement = async () => {},
  revokeDevice = async () => {},
  resetDevices = async () => {},
}) {
  return async function indicatorDeviceAdminHandler(req, res) {
    const admin = await requireAdmin(req);
    if (!admin) return res.status(403).json({ error: 'Admin only' });

    if (req.method === 'GET') {
      const requestedLicense = req.query?.license_id;
      const licenseId = requestedLicense ? validUuid(requestedLicense) : '';
      if (requestedLicense && !licenseId) return res.status(400).json({ error: 'Invalid license id' });
      const [policies, devices] = await Promise.all([
        listPolicies(),
        licenseId ? listDevices(licenseId) : [],
      ]);
      return res.status(200).json({
        policies: Array.isArray(policies) ? policies.map((policy) => ({
          product_code: policy?.product_code,
          enabled: policy?.enabled === true,
          updated_at: policy?.updated_at || null,
          updated_by: policy?.updated_by || null,
        })) : [],
        devices: Array.isArray(devices) ? devices.map(sanitizeDevice) : [],
      });
    }

    if (req.method === 'PATCH') {
      if (req.body?.action === 'set_limit') {
        const licenseId = validUuid(req.body?.license_id);
        const deviceLimit = Number(req.body?.device_limit);
        if (!licenseId || !Number.isInteger(deviceLimit) || deviceLimit < 1 || deviceLimit > 100) {
          return res.status(400).json({ error: 'Device limit must be an integer from 1 to 100' });
        }
        const activeCount = Number(await getActiveDeviceCount(licenseId)) || 0;
        if (deviceLimit < activeCount) {
          return res.status(409).json({ error: `Revoke devices first; ${activeCount} devices are active` });
        }
        await setLicenseLimit(licenseId, deviceLimit);
        return res.status(200).json({ ok: true, device_limit: deviceLimit, active_devices: activeCount });
      }

      if (req.body?.action === 'set_enforcement') {
        const productCode = String(req.body?.product_code || '').trim().toLowerCase();
        if (!DEVICE_PRODUCTS.has(productCode) || typeof req.body?.enabled !== 'boolean') {
          return res.status(400).json({ error: 'Invalid device enforcement policy' });
        }
        await setEnforcement(
          productCode,
          req.body.enabled,
          String(admin.username || admin.panda_users?.username || 'admin'),
        );
        return res.status(200).json({ ok: true, product_code: productCode, enabled: req.body.enabled });
      }

      return res.status(400).json({ error: 'Unknown device action' });
    }

    if (req.method === 'POST') {
      if (req.body?.action === 'revoke') {
        const deviceId = validUuid(req.body?.device_id);
        if (!deviceId) return res.status(400).json({ error: 'Invalid device id' });
        await revokeDevice(deviceId, new Date().toISOString());
        return res.status(200).json({ ok: true });
      }
      if (req.body?.action === 'reset') {
        const licenseId = validUuid(req.body?.license_id);
        if (!licenseId) return res.status(400).json({ error: 'Invalid license id' });
        await resetDevices(licenseId, new Date().toISOString());
        return res.status(200).json({ ok: true });
      }
      return res.status(400).json({ error: 'Unknown device action' });
    }

    return res.status(405).end();
  };
}

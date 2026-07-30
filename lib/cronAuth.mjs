export function isCronAuthorized(authorization, secret) {
  return Boolean(secret) && authorization === `Bearer ${secret}`;
}

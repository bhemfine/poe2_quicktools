/** Chromium error codes that mean QuickTools itself can't get online. */
const BLOCKED = /ERR_NETWORK_ACCESS_DENIED|ERR_BLOCKED_BY_CLIENT|ERR_BLOCKED_BY_ADMINISTRATOR/
const OFFLINE = /ERR_INTERNET_DISCONNECTED|ERR_NAME_NOT_RESOLVED|ERR_ADDRESS_UNREACHABLE/

/**
 * Turns a raw network error into something a player can act on, or null when the message is
 * already specific (HTTP status, rate limit, schema).
 */
export function networkHint(message: string | undefined): string | null {
  if (!message) return null
  if (BLOCKED.test(message)) {
    return 'QuickTools is blocked from the internet. Allow PoE2QuickTools.exe in your antivirus firewall (e.g. Bitdefender → Protection → Firewall).'
  }
  if (OFFLINE.test(message)) return 'No internet connection.'
  return null
}

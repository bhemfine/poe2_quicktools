import { describe, expect, it } from 'vitest'
import { version } from '../../package.json'
import { buildUserAgent, USER_AGENT } from '../../src/main/net/http'
import { INVOKE_CHANNELS, isAllowedExternalUrl, isInvokeChannel } from '../../src/shared/ipc'

describe('User-Agent', () => {
  it('matches the format agreed in BUILD_PLAN', () => {
    expect(buildUserAgent('1.2.3')).toBe('PoE2QuickTools/1.2.3 (contact: Bhemfinechua@gmail.com)')
  })

  it('uses the version from package.json', () => {
    expect(USER_AGENT).toBe(buildUserAgent(version))
  })
})

describe('IPC allow-list', () => {
  it('accepts listed channels', () => {
    for (const channel of INVOKE_CHANNELS) expect(isInvokeChannel(channel)).toBe(true)
  })

  it('rejects anything else', () => {
    expect(isInvokeChannel('app:quit')).toBe(false)
    expect(isInvokeChannel(42)).toBe(false)
    expect(isInvokeChannel(undefined)).toBe(false)
  })

  it('only opens https links to poe.ninja and pathofexile.com', () => {
    expect(isAllowedExternalUrl('https://poe.ninja/poe2/economy/x')).toBe(true)
    expect(isAllowedExternalUrl('https://www.pathofexile.com/trade2/search/poe2/x')).toBe(true)
    expect(isAllowedExternalUrl('http://poe.ninja/')).toBe(false)
    expect(isAllowedExternalUrl('https://evil.example/poe.ninja')).toBe(false)
    expect(isAllowedExternalUrl('file:///C:/Windows')).toBe(false)
    expect(
      isAllowedExternalUrl('https://github.com/bhemfine/poe2_quicktools/releases/tag/v0.2.0'),
    ).toBe(true)
    expect(isAllowedExternalUrl('https://github.com/someone-else/repo')).toBe(false)
    expect(isAllowedExternalUrl('https://github.com/bhemfine/poe2_quicktools-evil/x')).toBe(false)
  })
})

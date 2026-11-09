import { describe, expect, it } from 'vitest'
import { version } from '../../package.json'
import { buildUserAgent, USER_AGENT } from '../../src/main/net/http'
import { INVOKE_CHANNELS, isInvokeChannel } from '../../src/shared/ipc'

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
})

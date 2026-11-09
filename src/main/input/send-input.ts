import koffi from 'koffi'
import { isExtendedKey, virtualKeyCode } from '../../shared/hotkeys/vk'

/**
 * Key presses through user32 SendInput, called directly with koffi. Only key-down/key-up events
 * are sent; nothing here listens to the keyboard (no hook library is shipped).
 */
const INPUT_KEYBOARD = 1
const KEYEVENTF_EXTENDEDKEY = 0x1
const KEYEVENTF_KEYUP = 0x2
const MAPVK_VK_TO_VSC = 0

const MOUSEINPUT = koffi.struct('MOUSEINPUT', {
  dx: 'long',
  dy: 'long',
  mouseData: 'uint32',
  dwFlags: 'uint32',
  time: 'uint32',
  dwExtraInfo: 'uintptr_t',
})
const KEYBDINPUT = koffi.struct('KEYBDINPUT', {
  wVk: 'uint16',
  wScan: 'uint16',
  dwFlags: 'uint32',
  time: 'uint32',
  dwExtraInfo: 'uintptr_t',
})
const HARDWAREINPUT = koffi.struct('HARDWAREINPUT', {
  uMsg: 'uint32',
  wParamL: 'uint16',
  wParamH: 'uint16',
})
const INPUT = koffi.struct('INPUT', {
  type: 'uint32',
  u: koffi.union('INPUT_UNION', { mi: MOUSEINPUT, ki: KEYBDINPUT, hi: HARDWAREINPUT }),
})

const user32 = koffi.load('user32.dll')
const SendInput = user32.func('__stdcall', 'SendInput', 'uint32', [
  'uint32',
  koffi.pointer(INPUT),
  'int',
])
const MapVirtualKeyW = user32.func('__stdcall', 'MapVirtualKeyW', 'uint32', ['uint32', 'uint32'])

/** Sends one key down or up. Returns false for an unknown key name. */
export function sendKey(name: string, direction: 'down' | 'up'): boolean {
  const vk = virtualKeyCode(name)
  if (vk === undefined) return false
  let flags = direction === 'up' ? KEYEVENTF_KEYUP : 0
  if (isExtendedKey(name)) flags |= KEYEVENTF_EXTENDEDKEY
  const input = {
    type: INPUT_KEYBOARD,
    u: {
      ki: {
        wVk: vk,
        wScan: MapVirtualKeyW(vk, MAPVK_VK_TO_VSC),
        dwFlags: flags,
        time: 0,
        dwExtraInfo: 0,
      },
    },
  }
  return SendInput(1, [input], koffi.sizeof(INPUT)) === 1
}

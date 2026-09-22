import assert from 'node:assert/strict'
import test from 'node:test'
import {
  formatPushDevicesCount,
  getPushDevicePresentation,
} from './pushDeviceStatus.mjs'

test('device status distinguishes local subscription and browser permission', () => {
  assert.equal(
    getPushDevicePresentation({
      available: null,
      permission: 'default',
      subscribed: false,
    }).label,
    'Проверяем...'
  )
  assert.equal(
    getPushDevicePresentation({
      available: true,
      permission: 'granted',
      subscribed: true,
    }).label,
    'Подключено'
  )
  assert.equal(
    getPushDevicePresentation({
      available: true,
      permission: 'default',
      subscribed: false,
    }).label,
    'Не подключено'
  )
  assert.equal(
    getPushDevicePresentation({
      available: true,
      permission: 'denied',
      subscribed: false,
    }).label,
    'Запрещено браузером'
  )
  assert.equal(
    getPushDevicePresentation({
      available: false,
      permission: 'unsupported',
      subscribed: false,
    }).label,
    'Не поддерживается'
  )
})

test('connected device count uses Russian plural forms', () => {
  assert.equal(formatPushDevicesCount(1), '1 устройство')
  assert.equal(formatPushDevicesCount(2), '2 устройства')
  assert.equal(formatPushDevicesCount(5), '5 устройств')
  assert.equal(formatPushDevicesCount(11), '11 устройств')
  assert.equal(formatPushDevicesCount(21), '21 устройство')
})

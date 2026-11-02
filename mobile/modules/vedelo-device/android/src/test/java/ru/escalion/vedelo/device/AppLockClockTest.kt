package ru.escalion.vedelo.device

import org.junit.Assert.*
import org.junit.Test

class AppLockClockTest {
  @Test fun coldStartAndSessionResetRequireAuthentication() {
    val clock = AppLockClock()
    assertTrue(clock.update(1_000, true))
    clock.authenticated(1_001, true)
    assertFalse(clock.update(1_002, true))
    clock.reset()
    assertTrue(clock.update(1_003, true))
  }

  @Test fun screenOffAloneCountsSleepWithoutJavascriptOrActivityPause() {
    val clock = AppLockClock()
    clock.authenticated(1_000, true)
    clock.update(2_000, false) // ACTION_SCREEN_OFF; no JS/AppState callbacks
    assertTrue(clock.update(62_000, true))
    assertTrue(clock.update(62_001, true)) // duplicate resume cannot unlock
  }

  @Test fun duplicateHiddenCallbacksAndLockedKeyguardCannotRestartTheMinute() {
    val clock = AppLockClock()
    clock.authenticated(1_000, true)
    clock.update(2_000, false)
    clock.update(30_000, false) // activity pause
    clock.update(61_999, false) // screen is on, keyguard is still locked
    assertTrue(clock.update(62_000, true))
  }

  @Test fun shortReturnKeepsGraceButANewMinuteLocks() {
    val clock = AppLockClock()
    clock.authenticated(1_000, true)
    clock.update(2_000, false)
    assertFalse(clock.update(61_999, true))
    clock.update(62_000, false)
    assertTrue(clock.update(122_000, true))
  }

  @Test fun authenticationWhileSystemWindowIsClosingStartsFreshGrace() {
    val clock = AppLockClock()
    clock.update(1_000, false)
    clock.authenticated(90_000, false)
    assertFalse(clock.visible)
    assertFalse(clock.update(90_001, true))
    clock.update(90_002, false)
    assertTrue(clock.update(150_002, true))
  }
}

package ru.escalion.vedelo.device

/** Monotonic elapsed time includes device sleep. Only explicit authentication
 * clears a timeout; repeated resume/focus events cannot clear it. */
class AppLockClock {
  private var hiddenAt: Long? = null
  var requiresAuthentication = true
    private set
  var visible = false
    private set

  fun update(now: Long, visible: Boolean): Boolean {
    this.visible = visible
    if (!visible) {
      if (hiddenAt == null) hiddenAt = now
    } else {
      if (hiddenAt?.let { now - it >= 60_000L } == true) requiresAuthentication = true
      hiddenAt = null
    }
    return requiresAuthentication
  }

  fun authenticated(now: Long, visible: Boolean) {
    this.visible = visible
    requiresAuthentication = false
    // A completed authentication is a new grace period, even if its system
    // window has not returned focus to the activity yet.
    hiddenAt = if (visible) null else now
  }

  fun reset() { hiddenAt = null; requiresAuthentication = true; visible = false }
}

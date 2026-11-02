package ru.escalion.vedelo.device

import android.telecom.Call
import android.telecom.CallScreeningService
import java.util.concurrent.Executors

class VedeloCallScreeningService : CallScreeningService() {
  override fun onScreenCall(details: Call.Details) {
    // Do this before disk, contacts, JS or network. Never reject or silence a call.
    if (details.callDirection == Call.Details.DIRECTION_INCOMING) {
      respondToCall(details, CallResponse.Builder().setDisallowCall(false).setRejectCall(false).setSilenceCall(false).build())
    }
    if (details.handle?.scheme != "tel" || !ProjectionStore.preferences(this).getBoolean("callerEnabled", false)) return
    val number = details.handle.schemeSpecificPart ?: return
    if (number.isBlank()) return
    val context = applicationContext
    val generation = ProjectionStore.generation(context) ?: return
    executor.execute {
      val result = CallerLookup.find(ProjectionStore.read(context), number)
      if (ProjectionStore.generation(context) == generation)
        CallerPresentation.show(context, number, result, generation)
    }
  }
  companion object { private val executor = Executors.newSingleThreadExecutor() }
}

package ru.escalion.vedelo.device

import com.google.firebase.messaging.RemoteMessage
import expo.modules.notifications.service.ExpoFirebaseMessagingService

/** Keep Expo token rotation, while presenting account-bound data-only pushes locally. */
class VedeloFirebaseMessagingService : ExpoFirebaseMessagingService() {
  override fun onMessageReceived(remoteMessage: RemoteMessage) {
    VedeloPush.receive(applicationContext, PushEnvelope.fromExpo(remoteMessage.data), "expo")
  }
}

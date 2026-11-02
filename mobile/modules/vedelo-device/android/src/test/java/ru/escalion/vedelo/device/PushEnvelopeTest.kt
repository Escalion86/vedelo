package ru.escalion.vedelo.device
import org.junit.Assert.*
import org.junit.Test
class PushEnvelopeTest {
  private val data = mapOf("deliveryId" to "session-a", "messageId" to "message-1")
  @Test fun acceptsOnlyCurrentProviderAndSession() {
    assertTrue(PushEnvelope.accepts(data, "session-a", "session-a", "expo", "expo", emptySet()))
    assertFalse(PushEnvelope.accepts(data, "session-b", "session-b", "expo", "expo", emptySet()))
    assertFalse(PushEnvelope.accepts(data, null, null, "expo", "expo", emptySet()))
    assertFalse(PushEnvelope.accepts(data, "session-a", null, "expo", "expo", emptySet()))
    assertFalse(PushEnvelope.accepts(data, "session-a", "session-a", "rustore", "expo", emptySet()))
    assertFalse(PushEnvelope.accepts(data, "session-a", "session-a", "expo", "expo", setOf("message-1")))
  }
  @Test fun decodesExpoEnvelopeAndRejectsMalformedData() {
    assertEquals(data, PushEnvelope.fromExpo(mapOf("body" to "{\"deliveryId\":\"session-a\",\"messageId\":\"message-1\"}")))
    assertTrue(PushEnvelope.fromExpo(mapOf("body" to "invalid")).isEmpty())
    assertFalse(PushEnvelope.accepts(emptyMap(), "session-a", "session-a", "expo", "expo", emptySet()))
  }
}

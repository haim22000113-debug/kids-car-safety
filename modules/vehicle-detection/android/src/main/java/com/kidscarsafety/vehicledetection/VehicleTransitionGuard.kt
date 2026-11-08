package com.kidscarsafety.vehicledetection

/**
 * Pure authorization rule for the exported transition receiver.
 * A callback is accepted only when it carries the private PendingIntent token
 * and tracking is still enabled.
 */
internal object VehicleTransitionGuard {
  fun shouldProcess(
    expectedToken: String,
    suppliedToken: String?,
    trackingEnabled: Boolean
  ): Boolean {
    return expectedToken.isNotBlank() &&
      suppliedToken != null &&
      suppliedToken == expectedToken &&
      trackingEnabled
  }
}

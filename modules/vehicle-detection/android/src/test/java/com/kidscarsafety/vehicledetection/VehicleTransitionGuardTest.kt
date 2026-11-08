package com.kidscarsafety.vehicledetection

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class VehicleTransitionGuardTest {
  private val validToken = "private-install-token"

  @Test
  fun acceptsOnlyMatchingTokenWhileTracking() {
    assertTrue(VehicleTransitionGuard.shouldProcess(validToken, validToken, true))
  }

  @Test
  fun rejectsMissingToken() {
    assertFalse(VehicleTransitionGuard.shouldProcess(validToken, null, true))
  }

  @Test
  fun rejectsIncorrectToken() {
    assertFalse(VehicleTransitionGuard.shouldProcess(validToken, "forged-token", true))
  }

  @Test
  fun rejectsBlankExpectedToken() {
    assertFalse(VehicleTransitionGuard.shouldProcess("", "", true))
  }

  @Test
  fun rejectsLateCallbackAfterProtectionStopped() {
    assertFalse(VehicleTransitionGuard.shouldProcess(validToken, validToken, false))
  }
}

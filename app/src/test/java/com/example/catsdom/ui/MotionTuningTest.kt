package com.example.catsdom.ui

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class MotionTuningTest {
    @Test
    fun fallTimingGrowsPredictablyAndIsCapped() {
        assertEquals(443, MotionTuning.fallDurationMs(1))
        assertEquals(733, MotionTuning.fallDurationMs(6))
        assertEquals(MotionTuning.fallMaxDurationMs, MotionTuning.fallDurationMs(20))
    }

    @Test
    fun movementScaleAndLandingStaySubtle() {
        assertTrue(MotionTuning.movingPieceScale in 0.92f..0.95f)
        assertTrue(MotionTuning.landingScale > 1f)
        assertTrue(MotionTuning.landingScale <= 1.03f)
        assertEquals(0, MotionTuning.cascadeDelayMs)
    }
}

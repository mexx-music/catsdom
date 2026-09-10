package com.example.catsdom.ui

import androidx.compose.animation.core.CubicBezierEasing

/** Central motion values shared by the installed Android puzzle board. */
internal object MotionTuning {
    const val swapDurationMs = 180
    const val clearDurationMs = 265
    const val fallBaseDurationMs = 385
    const val fallPerCellDurationMs = 58
    const val fallMaxDurationMs = 850
    const val fallColumnStaggerMs = 4
    const val landingDurationMs = 90
    const val cascadeDelayMs = 0
    const val movingPieceScale = 0.95f
    const val landingScale = 1.025f
    const val clearedPieceScale = 0.55f

    val swapEasing = CubicBezierEasing(0.22f, 0.72f, 0.28f, 1f)
    val fallEasing = CubicBezierEasing(0.28f, 0.08f, 0.45f, 1f)
    val landingEasing = CubicBezierEasing(0.2f, 0.72f, 0.2f, 1f)
    val clearEasing = CubicBezierEasing(0.25f, 0.8f, 0.3f, 1f)

    fun fallDurationMs(cellDistance: Int): Int =
        (fallBaseDurationMs + cellDistance.coerceAtLeast(1) * fallPerCellDurationMs)
            .coerceAtMost(fallMaxDurationMs)
}

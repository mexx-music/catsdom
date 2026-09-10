export const MOTION_TUNING = Object.freeze({
  swapDuration: 180,
  invalidSwapDuration: 230,
  directDragBaseDuration: 155,
  directDragMinDuration: 75,
  clearDuration: 265,
  clearBoardResponseDuration: 220,
  fallBaseDuration: 385,
  fallPerCellDuration: 58,
  fallMaxDuration: 850,
  fallColumnStagger: 4,
  movingPieceScale: 0.95,
  landingScale: 1.025,
  landingOffsetPixels: 3,
  landingKeyframe: 0.88,
  cascadeDelay: 0,
  swapEasing: "cubic-bezier(.22,.72,.28,1)",
  invalidSwapEasing: "cubic-bezier(.3,.05,.2,1)",
  fallEasing: "cubic-bezier(.28,.08,.45,1)",
  landingEasing: "cubic-bezier(.2,.72,.2,1)",
});

export function fallDurationForDistance(cellDistance) {
  const distance = Math.max(1, Math.round(cellDistance));
  return Math.min(
    MOTION_TUNING.fallMaxDuration,
    MOTION_TUNING.fallBaseDuration + distance * MOTION_TUNING.fallPerCellDuration,
  );
}

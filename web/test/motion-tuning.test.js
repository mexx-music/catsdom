import assert from "node:assert/strict";
import test from "node:test";
import { MOTION_TUNING, fallDurationForDistance } from "../src/motion-tuning.js";

test("fall timing stays readable for short and long drops", () => {
  assert.equal(fallDurationForDistance(1), 443);
  assert.equal(fallDurationForDistance(6), 733);
  assert.equal(fallDurationForDistance(20), MOTION_TUNING.fallMaxDuration);
  assert.ok(fallDurationForDistance(6) > fallDurationForDistance(1));
});

test("motion polish uses subtle scale changes and no cascade pause", () => {
  assert.ok(MOTION_TUNING.movingPieceScale >= 0.92);
  assert.ok(MOTION_TUNING.movingPieceScale <= 0.95);
  assert.ok(MOTION_TUNING.landingScale > 1);
  assert.ok(MOTION_TUNING.landingScale <= 1.03);
  assert.equal(MOTION_TUNING.cascadeDelay, 0);
});

test("continuous flow starts resolutions before motion fully settles", () => {
  assert.equal(MOTION_TUNING.swapResolutionProgress, 0.55);
  assert.equal(MOTION_TUNING.fallResolutionProgress, MOTION_TUNING.landingKeyframe);
  assert.ok(MOTION_TUNING.explosionImpactDelay < MOTION_TUNING.clearDuration);
  assert.ok(MOTION_TUNING.explosionChainStagger <= 20);
});

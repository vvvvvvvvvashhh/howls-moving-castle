// Match every field of the 1,440 frame records used to animate the Blender master.
// The original exporter saved numbers to six decimal places.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createTimeline } from "../direction/timeline.js";
import { createDirection, DURATION } from "../src/director.js";
import { heightAt } from "../src/landforms.js";
import { sampleTurnipMotion, sampleFireMotion } from "../src/companions.js";

const timeline = createTimeline({
  director: createDirection({ heightAt }, "B"),
  heightAt,
  turnip: sampleTurnipMotion,
  fire: sampleFireMotion
});
const digest = createHash("sha256");
const precision = (_, value) => typeof value === "number" ? Math.round(value * 1e6) / 1e6 : value;
const expected = "3d9782839c917e07b57dd7c7f62ef61f94138c60bce5585c15c85b8931317927";
for (let frame = 1; frame <= DURATION * 24; frame++) {
  const shot = timeline.sample((frame - 1) / 24);
  assert.equal(shot.frame, frame);
  digest.update(JSON.stringify(shot, precision) + "\n");
}
assert.equal(digest.digest("hex"), expected, "导演数据与原工程保存的 1440 帧不同");
console.log("1440 帧导演数据与原工程一致。");

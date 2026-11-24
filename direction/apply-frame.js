export function createFramePoser(h) {
  const orientation = h.camera.matrix.clone();
  const point = h.camera.position.clone();
  const worldUp = h.camera.up.clone().set(0, 1, 0);

  function parentTo(object, parent) {
    if (object.parent !== parent) parent.add(object);
  }

  function updateTree(object) {
    object.updateWorldMatrix(true, true);
  }

  // One absolute director sample drives both the cast and camera. The ending
  // can reparent the same rigs into its single continuous valley.
  return function poseFrame(d, options = {}) {
    const ending = d.type === 'flight';
    const stage = options.stage || (ending || d.type === 'journey'
      ? h.journey.scene : d.type === 'interior' ? h.kitchen.scene : h.scene);

    // The source camera still runs the kitchen, greeting and seasonal scene
    // activation. The final optical pose is always the director's world pose.
    const camera = h.camera;
    camera.position.fromArray(d.camera.position);
    camera.up.copy(worldUp);
    camera.lookAt(d.camera.target[0], d.camera.target[1], d.camera.target[2]);
    camera.rotateZ(d.camera.bank);
    camera.fov = d.camera.fovY;
    camera.updateProjectionMatrix();
    updateTree(camera);

    const castle = h.castle;
    parentTo(castle.group, options.castleStage || (ending || d.type === 'journey' ? h.journey.scene : h.scene));
    castle.group.visible = d.type !== 'interior';
    castle.group.position.fromArray(d.castle.position);
    castle.update(d.t, { ...d.motion, direction: d.rig });
    updateTree(castle.group);

    const bird = h.crow;
    parentTo(bird.group, stage);
    bird.group.visible = Boolean(d.bird);
    if (d.bird) {
      bird.group.position.fromArray(d.bird.position);
      bird.group.scale.setScalar(d.bird.scale);
      point.fromArray(d.bird.tangent).add(bird.group.position);
      orientation.lookAt(bird.group.position, point, worldUp);
      bird.group.quaternion.setFromRotationMatrix(orientation);
      bird.group.rotateZ(d.bird.bank);
      bird.setFlight({ glide: d.bird.glide, bank: d.bird.bank, energy: d.bird.energy, look: 0 });
      bird.update(d.t % 30);
    }
    updateTree(bird.group);

    const actor = h.turnip;
    const fire = h.travelingFire;
    parentTo(actor.group, options.actorStage || (ending ? h.journey.scene : h.scene));
    parentTo(fire.group, actor.anchors.carryObject);
    const a = d.companions;
    actor.group.visible = Boolean(a && a.visible);
    fire.group.visible = actor.group.visible;
    if (a) {
      actor.group.position.fromArray(a.position);
      actor.group.scale.setScalar(a.scale);
      actor.group.rotation.set(0, a.yaw, 0);
      updateTree(actor.group);
      const m = actor.update(d.t, {
        action: a.action, local: a.local, energy: a.energy, holdFire: a.holdFire, look: a.look,
      });
      fire.group.scale.setScalar(a.fire.carrierScale);
      fire.group.position.set(0, 0, 0);
      actor.anchors.carryObject.getWorldPosition(point);
      // Use the actual palm, not the torso, for the original greeting close-up.
      const yaw = Math.atan2(camera.position.x - point.x, camera.position.z - point.z) - actor.group.rotation.y;
      fire.group.rotation.set(0, yaw, 0);
      fire.update(d.t, {
        action: 'carried', local: a.local, carrierMotion: m,
        look: .10 * Math.sin(a.local * 1.2), attention: .42,
      });
      if (options.animateFire && fire.anchors.flameObject) {
        const flame = fire.anchors.flameObject;
        flame.position.set(.005, .375, -.013);
        if (a.fire.worldHeight > 0) {
          flame.getWorldPosition(point);
          point.y += a.fire.worldHeight;
          flame.position.copy(flame.parent.worldToLocal(point));
        }
      }
      // The native Blender flame adds its independent arc above the wood.
      // The exported carrier must remain on the palm at every sampled frame.
    }
    updateTree(actor.group);
    return { frame: d.frame, t: d.t };
  };
}

// Deterministic screenshot staging for SOLMAR BAY.
// ?shot=cover|street|mission|menu&seed=1 sets up a fixed scene so the four
// dossier screenshots are reproducible. The camera snaps instantly in shot
// mode (no smoothing), and the scene is advanced with fixed dt steps.
export function shotParams() {
  const q = new URLSearchParams(window.location.search);
  const shot = q.get('shot');
  if (!shot) return null;
  return { shot, seed: Number(q.get('seed') || 1) };
}

export function stageShot(game, name) {
  const { player, drivable, police, missions, hud } = game;
  if (name === 'cover') {
    // chase: Leo driving east with 3-star heat, police right behind and one
    // intercepting ahead so the chase reads in frame
    drivable.setColor(0x2471a3);
    drivable.place(-60, 0, 0);
    drivable.speed = 16;
    drivable.cruise = true;
    player.inCar = drivable;
    player.mesh.visible = false;
    player.x = -60;
    player.z = 0;
    player.heading = 0;
    player.camYaw = 0;
    player.cash = 3000;
    police.wanted = 3;
    police.heat = 0.7;
    police.formation = true;
    police.units = [];
    // formation: two units ahead flanking the road (visible in frame),
    // one far behind (on the minimap, out of the camera's view)
    for (const [px, pz] of [[-45, -5], [-35, 5], [-82, 0]]) {
      const mesh = police.spawnUnitMesh();
      police.units.push({ mesh, x: px, z: pz, heading: 0, speed: 16, grab: 0 });
      mesh.position.set(px, 0, pz);
    }
    missions.index = 4;
    missions.stage = 1;
    hud.setObjective('The Big One — escape to the safehouse!');
    hud.showToast('3-star heat! Lose the cops.');
    hud.setStars(3);
  } else if (name === 'street') {
    // Leo on foot on a downtown road (x=0 is a road), facing north down it
    player.place(2, -40, Math.PI / 2);
    player.camYaw = Math.PI / 2;
    player.cash = 300;
    missions.index = 0;
    missions.stage = 0;
    hud.setObjective('First Wheels — steal a car, then drive to the meet point');
    hud.showToast('Downtown Solmar Bay. Find a car.');
    hud.setStars(0);
  } else if (name === 'mission') {
    // mid-mission: Leo driving west on road z=156 toward the deal, car cruising
    drivable.setColor(0xc0392b);
    drivable.place(-40, 156, Math.PI);
    drivable.speed = 12;
    drivable.cruise = true;
    player.inCar = drivable;
    player.mesh.visible = false;
    player.x = -40;
    player.z = 156;
    player.heading = Math.PI;
    player.camYaw = Math.PI;
    player.cash = 550;
    missions.index = 2;
    missions.stage = 0;
    hud.setObjective('The Pickup — drive to the deal');
    hud.showToast('The deal is at the old yard. Stay sharp.');
    hud.setStars(0);
  } else if (name === 'menu') {
    // title screen over the city (main.js keeps the menu open)
    player.place(0, -40, 0);
    player.camYaw = 0;
    player.cash = 300;
    hud.setStars(0);
  }
  hud.setHealth(100);
}

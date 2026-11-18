// Deterministic screenshot staging: ?shot=cover|street|mission|menu puts
// the game in a fixed, photogenic state with a fixed camera and a frozen
// clock, so the same shot renders the same pixels every time.
export function stageShot(game, name) {
  const { player, police, missions, traffic, world, hud, camera } = game;
  game.shotMode = true;
  game.fixedTime = 1.6;
  hud.showOnly(null);
  if (name === 'menu') {
    game.state = 'menu';
    hud.showOnly('menu');
    // Beach vista behind the menu: camera on the sand looking at the city.
    camera.position.set(-205, 14, 60);
    camera.lookAt(-100, 12, 0);
    return;
  }
  game.state = 'playing';
  hud.showOnly(null);
  if (name === 'cover') {
    // Mid-chase: Leo in a stolen car, three stars, two cruisers on his tail.
    missions.index = 4;
    missions.step = 2;
    missions.active = true;
    hud.setObjective('THE BIG ONE', 'Lose the cops — reach the safehouse');
    police.setWanted(3);
    const car = traffic[0];
    car.stolen = true;
    player.car = car;
    player.onFoot = false;
    player.mesh.visible = false;
    car.mesh.position.set(34, 0, -60);
    car.heading = Math.PI;
    car.speed = 18;
    player.pos.x = 34;
    player.pos.z = -60;
    police.removeAll();
    const p1 = police.spawnCar(34, -88);
    p1.heading = Math.PI;
    p1.speed = 20;
    const p2 = police.spawnCar(31, -97);
    p2.heading = Math.PI;
    p2.speed = 19;
    camera.position.set(34, 5.2, -30);
    camera.lookAt(34, 1.5, -70);
  } else if (name === 'street') {
    // Leo on foot downtown, traffic and pedestrians around him.
    missions.index = -1;
    missions.active = false;
    hud.setObjective('', 'Press M to start the next job.');
    hud.feed('Welcome to Solmar Bay');
    police.clearWanted();
    player.onFoot = true;
    player.mesh.visible = true;
    player.pos.set(-34, 0, 34);
    player.heading = Math.PI * 0.75;
    player.camYaw = Math.PI * 0.25;
    player.camPitch = 0.28;
    camera.position.set(-52, 6.5, 52);
    camera.lookAt(-20, 1.6, 20);
  } else if (name === 'mission') {
    // Harbor Heist in progress: the truck under the waypoint beam.
    missions.index = 3;
    missions.step = 0;
    missions.active = true;
    missions.setupStep();
    hud.setObjective('HARBOR HEIST', 'Steal the cargo truck at the harbour');
    hud.feed('Rosa: the truck is in the harbour yard');
    police.clearWanted();
    const car = traffic[1];
    car.stolen = true;
    player.car = car;
    player.onFoot = false;
    player.mesh.visible = false;
    car.mesh.position.set(-136, 0, -108);
    car.heading = Math.PI;
    car.speed = 0;
    player.pos.x = -136;
    player.pos.z = -108;
    camera.position.set(-136, 5, -94);
    camera.lookAt(-136, 2, -136);
  }
}

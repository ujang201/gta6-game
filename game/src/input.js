// Keyboard + mouse input for SOLMAR BAY.
// Keys are tracked by code (KeyW, ArrowUp, ...). Mouse drag orbits the camera.
// The test harness (window.__solmar) can inject synthetic keys for play-tests.
export class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.pressed = new Set(); // keys pressed since last endFrame()
    this.orbitDX = 0; // accumulated mouse drag for the camera orbit
    this.orbitDY = 0;
    this.dragging = false;
    this.lastX = 0;
    this.lastY = 0;
    this.canvas = canvas;
    this.onKey = null; // optional callback(code) for menu shortcuts

    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this.pressed.add(e.code);
      if (this.onKey) this.onKey(e.code);
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
    });
    window.addEventListener('blur', () => {
      this.keys.clear();
    });
    canvas.addEventListener('mousedown', (e) => {
      this.dragging = true;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
    });
    window.addEventListener('mouseup', () => {
      this.dragging = false;
    });
    window.addEventListener('mousemove', (e) => {
      if (!this.dragging) return;
      this.orbitDX += e.clientX - this.lastX;
      this.orbitDY += e.clientY - this.lastY;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
    });
    // pointer lock is optional; drag orbit works without it.
    canvas.addEventListener('click', () => {
      // left click also counts as "shoot" for the player
      this.pressed.add('MouseClick');
    });
  }

  down(code) {
    return this.keys.has(code);
  }
  // true only on the frame the key went down
  hit(code) {
    return this.pressed.has(code);
  }
  // movement axes: forward (+1) / strafe right (+1), from WASD or arrows
  axes() {
    let f = 0;
    let s = 0;
    if (this.down('KeyW') || this.down('ArrowUp')) f += 1;
    if (this.down('KeyS') || this.down('ArrowDown')) f -= 1;
    if (this.down('KeyD') || this.down('ArrowRight')) s += 1;
    if (this.down('KeyA') || this.down('ArrowLeft')) s -= 1;
    return { f, s };
  }
  // consume the per-frame orbit delta (pixels dragged since last frame)
  takeOrbit() {
    const d = { dx: this.orbitDX, dy: this.orbitDY };
    this.orbitDX = 0;
    this.orbitDY = 0;
    return d;
  }
  // test hook: pretend a key is held / pressed
  testDown(code) {
    this.keys.add(code);
  }
  testHit(code) {
    this.keys.add(code);
    this.pressed.add(code);
  }
  testUp(code) {
    this.keys.delete(code);
  }
  // call at the end of every frame so hit() only fires once per press
  endFrame() {
    this.pressed.clear();
  }
}

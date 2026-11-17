// input.js — keyboard + mouse state for Solmar Bay.
// One shared object: the game loop reads held keys each frame, and
// edge-triggered actions (enter car, punch, pause) are consumed once.

export class Input {
  constructor() {
    this.keys = new Set();
    this.pressed = new Set(); // keys pressed since last consume
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.mouseDown = false;
    this.mouseClicked = false;
    this.dragging = false;
    this.lastX = 0;
    this.lastY = 0;
    this.pointerLocked = false;
    this.onFirstGesture = null;
    this._gestureSeen = false;
  }

  attach(canvas) {
    this.canvas = canvas;
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this.pressed.add(e.code);
      this.noteGesture();
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
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
      this.mouseDown = true;
      this.mouseClicked = true;
      this.dragging = true;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      this.noteGesture();
    });
    window.addEventListener('mouseup', () => {
      this.mouseDown = false;
      this.dragging = false;
    });
    window.addEventListener('mousemove', (e) => {
      if (this.pointerLocked) {
        this.mouseDX += e.movementX;
        this.mouseDY += e.movementY;
        return;
      }
      if (this.dragging) {
        this.mouseDX += e.clientX - this.lastX;
        this.mouseDY += e.clientY - this.lastY;
        this.lastX = e.clientX;
        this.lastY = e.clientY;
      }
    });
    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === canvas;
    });
    canvas.addEventListener('click', () => {
      // Pointer lock gives the mouse-orbit camera its best feel; dragging
      // still works when the browser refuses the lock (headless, iframes).
      if (!this.pointerLocked && document.pointerLockElement !== canvas) {
        try {
          canvas.requestPointerLock();
        } catch (e) {
          /* drag fallback stays active */
        }
      }
    });
  }

  noteGesture() {
    if (!this._gestureSeen) {
      this._gestureSeen = true;
      if (this.onFirstGesture) this.onFirstGesture();
    }
  }

  held(code) {
    return this.keys.has(code);
  }

  // True once per physical press; callers consume it each frame.
  wasPressed(code) {
    return this.pressed.has(code);
  }

  consumeMouse() {
    const dx = this.mouseDX;
    const dy = this.mouseDY;
    this.mouseDX = 0;
    this.mouseDY = 0;
    const clicked = this.mouseClicked;
    this.mouseClicked = false;
    return { dx, dy, clicked };
  }

  endFrame() {
    this.pressed.clear();
  }

  // Movement axes in camera space: forward +1, strafe right +1.
  moveAxes() {
    let f = 0;
    let s = 0;
    if (this.held('KeyW') || this.held('ArrowUp')) f += 1;
    if (this.held('KeyS') || this.held('ArrowDown')) f -= 1;
    if (this.held('KeyD') || this.held('ArrowRight')) s += 1;
    if (this.held('KeyA') || this.held('ArrowLeft')) s -= 1;
    return { forward: f, strafe: s };
  }
}

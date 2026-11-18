// Keyboard and mouse state for Solmar Bay. WASD moves, mouse orbits the
// camera (drag, or click the canvas to lock the pointer), Space/Click shoot.
export function createInput(canvas) {
  const keys = new Set();
  const pressed = new Set();
  let mouseDX = 0;
  let mouseDY = 0;
  let clicked = false;
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  let pointerLocked = false;

  function codeOf(e) {
    return e.code;
  }

  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    keys.add(codeOf(e));
    pressed.add(codeOf(e));
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(codeOf(e))) {
      e.preventDefault();
    }
  });
  window.addEventListener('keyup', (e) => {
    keys.delete(codeOf(e));
  });
  window.addEventListener('blur', () => {
    keys.clear();
    dragging = false;
  });

  canvas.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    clicked = true;
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    if (canvas.requestPointerLock) {
      try {
        canvas.requestPointerLock();
      } catch (err) {
        // Pointer lock is a nicety; dragging still works without it.
      }
    }
  });
  window.addEventListener('mouseup', () => {
    dragging = false;
  });
  document.addEventListener('pointerlockchange', () => {
    pointerLocked = document.pointerLockElement === canvas;
  });
  document.addEventListener('mousemove', (e) => {
    if (pointerLocked) {
      mouseDX += e.movementX || 0;
      mouseDY += e.movementY || 0;
    } else if (dragging) {
      mouseDX += e.clientX - lastX;
      mouseDY += e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
    }
  });

  return {
    down(code) {
      return keys.has(code);
    },
    // Edge-triggered: true once per physical press until the frame consumes it.
    wasPressed(code) {
      return pressed.has(code);
    },
    // Mouse movement since the last frame, in pixels.
    takeMouse() {
      const out = { dx: mouseDX, dy: mouseDY };
      mouseDX = 0;
      mouseDY = 0;
      return out;
    },
    takeClick() {
      const out = clicked;
      clicked = false;
      return out;
    },
    // Called at the end of each frame so presses do not leak into the next.
    endFrame() {
      pressed.clear();
    },
    get pointerLocked() {
      return pointerLocked;
    },
  };
}

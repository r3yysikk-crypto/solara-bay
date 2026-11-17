// Keyboard and mouse input, read every frame. Keys report "held" for driving
// and walking; actions report a single "pressed" edge for things like getting
// in a car, pausing or confirming a menu.
export const ACTION_CONFIRM = 1 << 0;
export const ACTION_PAUSE = 1 << 1;
export const ACTION_ENTER_EXIT = 1 << 2;
export const ACTION_HORN = 1 << 3;
export const ACTION_RUN = 1 << 4;

const KEY_TO_ACTION = {
  Enter: ACTION_CONFIRM,
  Space: ACTION_CONFIRM,
  KeyP: ACTION_PAUSE,
  Escape: ACTION_PAUSE,
  KeyE: ACTION_ENTER_EXIT,
  KeyH: ACTION_HORN,
};

export function createInput(target) {
  const held = new Set();
  const pressed = new Set();
  let mouseDown = false;

  function onKeyDown(event) {
    if (event.repeat) return;
    held.add(event.code);
    const action = KEY_TO_ACTION[event.code];
    if (action) pressed.add(action);
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) {
      event.preventDefault();
    }
  }
  function onKeyUp(event) {
    held.delete(event.code);
  }
  function onMouseDown() {
    mouseDown = true;
    pressed.add(ACTION_CONFIRM);
  }
  function onBlur() {
    held.clear();
  }

  target.addEventListener('keydown', onKeyDown);
  target.addEventListener('keyup', onKeyUp);
  target.addEventListener('mousedown', onMouseDown);
  target.addEventListener('blur', onBlur);

  return {
    // Driving / walking axes, -1..1. Up/W is forward, Down/S brakes or reverses.
    axis() {
      const up = held.has('KeyW') || held.has('ArrowUp');
      const down = held.has('KeyS') || held.has('ArrowDown');
      const left = held.has('KeyA') || held.has('ArrowLeft');
      const right = held.has('KeyD') || held.has('ArrowRight');
      return {
        throttle: (up ? 1 : 0) - (down ? 1 : 0),
        steer: (left ? 1 : 0) - (right ? 1 : 0),
        run: held.has('ShiftLeft') || held.has('ShiftRight'),
        handbrake: held.has('Space'),
      };
    },
    // One-shot actions since the last takeActions() call.
    takeActions() {
      let bits = 0;
      for (const action of pressed) bits |= action;
      pressed.clear();
      if (mouseDown) {
        mouseDown = false;
      }
      return bits;
    },
    isDown(code) {
      return held.has(code);
    },
  };
}

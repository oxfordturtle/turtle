/// <reference lib="dom" />

import {
  updateKeyDown,
  updateKeyUp,
  updateMouseDown,
  updateMouseMove,
  updateMouseUp,
} from "@/core/machine.ts";

/**
 * The machine's *inbound* input: keyboard and mouse, fed to a running program.
 * Unlike the other three adapters this is a driving port - nothing in `src/core`
 * calls it, it calls in.
 */

let canvas: HTMLCanvasElement | null = null;

// Keys typed into an editable element (the code editor) are not intercepted:
// this only feeds keyboard input to a running program.
const isEditableTarget = (target: EventTarget | null): boolean =>
  target instanceof HTMLTextAreaElement ||
  target instanceof HTMLInputElement ||
  (target instanceof HTMLElement && target.isContentEditable);

const handleKeyDown = (event: KeyboardEvent): void => {
  if (isEditableTarget(event.target)) {
    return;
  }

  // backspace would go back a page, and the arrow keys would scroll
  if (
    event.key === "Backspace" ||
    event.key === "ArrowUp" ||
    event.key === "ArrowDown" ||
    event.key === "ArrowLeft" ||
    event.key === "ArrowRight"
  ) {
    event.preventDefault();
  }

  updateKeyDown(
    event.keyCode,
    event.key,
    event.shiftKey,
    event.altKey,
    event.ctrlKey,
  );
};

const handleKeyUp = (event: KeyboardEvent): void => {
  if (isEditableTarget(event.target)) {
    return;
  }
  updateKeyUp(event.keyCode, event.key);
};

const handleMouseMove = (event: MouseEvent): void => {
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  updateMouseMove(
    event.clientX,
    event.clientY,
    rect.left,
    rect.top,
    rect.width,
    rect.height,
  );
};

const handleMouseDown = (event: MouseEvent): void => {
  if (!canvas) return;
  event.preventDefault(); // prevent default behavior
  const rect = canvas.getBoundingClientRect();
  updateMouseDown(
    event.button,
    event.clientX,
    event.clientY,
    rect.left,
    rect.top,
    rect.width,
    rect.height,
    event.shiftKey,
    event.altKey,
    event.ctrlKey,
  );
};

const handleMouseUp = (event: MouseEvent): void => {
  updateMouseUp(event.button);
};

const handleContextMenu = (event: MouseEvent): void => {
  event.preventDefault(); // prevent context menu
};

const handleTouchMove = (event: TouchEvent): void => {
  if (!canvas) return;
  event.preventDefault(); // prevent scrolling
  if (event.touches.length > 0) {
    const touch = event.touches[0]!;
    const rect = canvas.getBoundingClientRect();
    updateMouseMove(
      touch.clientX,
      touch.clientY,
      rect.left,
      rect.top,
      rect.width,
      rect.height,
    );
  }
};

const handleTouchStart = (event: TouchEvent): void => {
  if (!canvas) return;
  if (event.touches.length > 0) {
    const touch = event.touches[0]!;
    const rect = canvas.getBoundingClientRect();
    updateMouseMove(
      touch.clientX,
      touch.clientY,
      rect.left,
      rect.top,
      rect.width,
      rect.height,
    );
    updateMouseDown(
      0, // left button for touch
      touch.clientX,
      touch.clientY,
      rect.left,
      rect.top,
      rect.width,
      rect.height,
      event.shiftKey,
      event.altKey,
      event.ctrlKey,
    );
  }
};

const handleTouchEnd = (_event: TouchEvent): void => {
  updateMouseUp(0); // left button for touch
};

/**
 * Starts feeding input to the machine, from the given canvas and the window.
 * Returns the cleanup, so the caller can be an ordinary Womble effect.
 */
export const attachInput = (
  element: HTMLCanvasElement | null,
): (() => void) => {
  canvas = element;

  element?.addEventListener("mousemove", handleMouseMove);
  element?.addEventListener("mousedown", handleMouseDown);
  element?.addEventListener("mouseup", handleMouseUp);
  element?.addEventListener("contextmenu", handleContextMenu);
  element?.addEventListener("touchmove", handleTouchMove);
  element?.addEventListener("touchstart", handleTouchStart);
  element?.addEventListener("touchend", handleTouchEnd);

  // on the window, since a running program reads the keyboard with nothing in
  // particular focused
  addEventListener("keydown", handleKeyDown);
  addEventListener("keyup", handleKeyUp);

  return () => {
    element?.removeEventListener("mousemove", handleMouseMove);
    element?.removeEventListener("mousedown", handleMouseDown);
    element?.removeEventListener("mouseup", handleMouseUp);
    element?.removeEventListener("contextmenu", handleContextMenu);
    element?.removeEventListener("touchmove", handleTouchMove);
    element?.removeEventListener("touchstart", handleTouchStart);
    element?.removeEventListener("touchend", handleTouchEnd);
    removeEventListener("keydown", handleKeyDown);
    removeEventListener("keyup", handleKeyUp);
    if (canvas === element) canvas = null;
  };
};

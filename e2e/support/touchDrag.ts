import type { Locator, Page } from '@playwright/test';

/**
 * Drives a real browser TouchEvent sequence (touchstart -> hold -> touchmove
 * steps -> touchend) against a @hello-pangea/dnd drag handle. Playwright's
 * `touchscreen` API only exposes `tap()`, so a full press-hold-move-release
 * gesture has to be constructed with the DOM `Touch`/`TouchEvent`
 * constructors. This exercises the same touch listeners the library attaches
 * in production; it does not replace a physical iPhone Safari check, which
 * remains the authoritative confirmation for release-to-drop feel.
 */
export async function touchDragHandle(
  page: Page,
  handle: Locator,
  deltaY: number,
  options: { steps?: number; holdMs?: number } = {},
): Promise<void> {
  const steps = options.steps ?? 14;
  const holdMs = options.holdMs ?? 200;

  const box = await handle.boundingBox();
  if (!box) throw new Error('drag handle has no bounding box');
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;

  await dispatchTouch(page, 'touchstart', startX, startY);
  await page.waitForTimeout(holdMs);
  // A small initial move lifts the item (matches the library's activation
  // threshold) before larger moves reposition it.
  await dispatchTouch(page, 'touchmove', startX, startY + 4);
  await page.waitForTimeout(40);

  for (let index = 1; index <= steps; index += 1) {
    const y = startY + (deltaY * index) / steps;
    await dispatchTouch(page, 'touchmove', startX, y);
    await page.waitForTimeout(40);
  }

  // Give the library's internal reorder engine a moment to settle on the
  // final position before releasing, matching a natural brief pause before
  // lifting a finger.
  await dispatchTouch(page, 'touchmove', startX, startY + deltaY);
  await page.waitForTimeout(150);
  await dispatchTouch(page, 'touchend', startX, startY + deltaY);
  await page.waitForTimeout(150);
}

/**
 * Drives a pointer-based drag (mouse move/down/move/up) against a
 * @hello-pangea/dnd handle. WebKit does not reliably surface synthetic
 * `TouchEvent`s to the library's touch sensor in headless mode (neither the
 * modern `Touch`/`TouchEvent` constructors nor the legacy
 * `document.createTouch` path activate a drag consistently here), so this
 * exercises the same onDragEnd/click-suppression contract through the
 * library's mouse sensor instead. It is a stand-in for, not a replacement
 * of, a physical iPhone Safari touch check.
 */
export async function mouseDragHandle(
  page: Page,
  handle: Locator,
  deltaY: number,
  options: { steps?: number; holdMs?: number } = {},
): Promise<void> {
  const steps = options.steps ?? 30;
  const holdMs = options.holdMs ?? 200;

  const box = await handle.boundingBox();
  if (!box) throw new Error('drag handle has no bounding box');
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  // Fine-grained initial lift: the sensor needs several close-together
  // mousemove events past its activation threshold before it starts
  // tracking the drag, not one large jump.
  for (let offset = 2; offset <= 12; offset += 2) {
    await page.mouse.move(startX, startY + offset);
    await page.waitForTimeout(30);
  }
  await page.waitForTimeout(holdMs);

  for (let index = 1; index <= steps; index += 1) {
    const y = startY + (deltaY * index) / steps;
    await page.mouse.move(startX, y);
    await page.waitForTimeout(15);
  }

  await page.waitForTimeout(250);
  await page.mouse.up();
  await page.waitForTimeout(150);
}

export async function touchTapCancelDrag(
  page: Page,
  handle: Locator,
): Promise<void> {
  const box = await handle.boundingBox();
  if (!box) throw new Error('drag handle has no bounding box');
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;

  await dispatchTouch(page, 'touchstart', startX, startY);
  await page.waitForTimeout(200);
  await dispatchTouch(page, 'touchmove', startX, startY + 4);
  await page.waitForTimeout(30);
  await page.keyboard.press('Escape');
  await dispatchTouch(page, 'touchend', startX, startY);
}

async function dispatchTouch(
  page: Page,
  type: 'touchstart' | 'touchmove' | 'touchend',
  clientX: number,
  clientY: number,
): Promise<void> {
  await page.evaluate(
    ({ type, clientX, clientY }) => {
      const target = document.elementFromPoint(clientX, clientY);
      if (!target) return;

      // WebKit does not support `new Touch(...)`/`new TouchEvent(...)`; it
      // only exposes the legacy `document.createTouch`/`createTouchList`
      // constructors used by real Safari.
      const doc = document as Document & {
        createTouch?: (...args: unknown[]) => Touch;
        createTouchList?: (...touches: Touch[]) => TouchList;
      };

      let touch: Touch;
      let touches: TouchList;
      let changedTouches: TouchList;
      if (typeof doc.createTouch === 'function' && typeof doc.createTouchList === 'function') {
        touch = doc.createTouch(
          window, target, 1, clientX, clientY, clientX, clientY,
        );
        changedTouches = doc.createTouchList(touch);
        touches = type === 'touchend' ? doc.createTouchList() : doc.createTouchList(touch);
      } else {
        touch = new Touch({
          identifier: 1,
          target,
          clientX,
          clientY,
          pageX: clientX,
          pageY: clientY,
          screenX: clientX,
          screenY: clientY,
        });
        const list = [touch];
        changedTouches = list as unknown as TouchList;
        touches = (type === 'touchend' ? [] : list) as unknown as TouchList;
      }

      const event = document.createEvent('TouchEvent') as TouchEvent & {
        initTouchEvent?: (...args: unknown[]) => void;
      };
      if (typeof event.initTouchEvent === 'function') {
        event.initTouchEvent(
          type, true, true, window, 0, 0, 0, 0, 0,
          false, false, false, false,
          touches, touches, changedTouches,
        );
        target.dispatchEvent(event);
        return;
      }

      const fallbackEvent = new TouchEvent(type, {
        bubbles: true,
        cancelable: true,
        composed: true,
        touches: touches as unknown as Touch[],
        targetTouches: touches as unknown as Touch[],
        changedTouches: changedTouches as unknown as Touch[],
      });
      target.dispatchEvent(fallbackEvent);
    },
    { type, clientX, clientY },
  );
}

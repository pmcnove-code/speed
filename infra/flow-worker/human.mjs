/** Deterministic Playwright interaction helpers. */

export function pauseMs(base) {
  return Math.max(0, Math.round(Number(base) || 0));
}

export function pollPauseMs() {
  return 1_000;
}

export function pointInBox(box) {
  return {
    x: box.x + box.width / 2,
    y: box.y + box.height / 2,
  };
}

export async function pause(page, minOrBase, _max) {
  const ms = pauseMs(minOrBase);
  await page.waitForTimeout(ms);
  return ms;
}

export async function moveTo(page, x, y) {
  await page.mouse.move(x, y);
}

export async function think(page) {
  return pause(page, 150);
}

export async function clickXY(page, x, y) {
  await moveTo(page, x, y);
  await page.mouse.click(x, y);
}

/** Accept a measured rectangle or an already resolved click point. */
export async function mouseClickBox(page, box) {
  if (!box || !Number.isFinite(box.x) || !Number.isFinite(box.y)) return false;
  const dx = box.width === undefined ? 0 : Math.min(12, box.width / 2);
  const dy = box.height === undefined ? 0 : Math.min(10, box.height / 2);
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return false;
  await clickXY(page, box.x + dx, box.y + dy);
  return true;
}

export async function clickLocator(locator, { timeout = 4000 } = {}) {
  const el = locator.first();
  const page = el.page();
  await el.scrollIntoViewIfNeeded().catch(() => undefined);
  const box = await el.boundingBox().catch(() => null);
  if (box && box.width >= 2 && box.height >= 2) {
    const { x, y } = pointInBox(box);
    await moveTo(page, x, y);
  }
  try {
    await el.click({ timeout });
  } catch {
    if (box) await clickXY(page, box.x + box.width / 2, box.y + box.height / 2);
    else await el.click({ force: true, timeout: 2000 });
  }
  return true;
}

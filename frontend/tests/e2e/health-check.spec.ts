import { test, expect, type WebSocketRoute } from '@playwright/test';

test('writes to the real backend and synchronizes a second browser without reload', async ({ page, browser }) => {
  const observerContext = await browser.newContext();
  const observer = await observerContext.newPage();
  const errors: Error[] = [];
  page.on('pageerror', error => errors.push(error));
  try {
    await page.goto('/development');
    await observer.goto('http://127.0.0.1:3100/development');
    await expect(page.getByRole('heading', { name: 'AEGIS', exact: true })).toBeVisible();
    for (const client of [page, observer]) {
      await expect(client.getByTestId('connection-status')).toHaveText('Connected');
      await expect(client.getByRole('button', { name: 'Send health check' })).toBeEnabled();
    }
    const message = `Browser subscription verification ${crypto.randomUUID()}`;
    await page.getByLabel('Test message').fill(message);
    await page.getByRole('button', { name: 'Send health check' }).click();
    await expect(page.getByRole('list', { name: 'Health-check records' }).getByText(message)).toBeVisible();
    // This independent client never submits or refreshes: the real subscription must deliver the insert.
    await expect(observer.getByRole('list', { name: 'Health-check records' }).getByText(message)).toBeVisible();
    expect(errors).toEqual([]);
  } finally { await observerContext.close(); }
});

test('survives a dropped backend socket and recovers through the SDK', async ({ page }) => {
  let socket: WebSocketRoute | undefined;
  await page.routeWebSocket(/\/v1\/database\//, route => {
    route.connectToServer(); // Forward real backend traffic unchanged.
    socket = route;
  });
  await page.goto('/development');
  await expect(page.getByTestId('connection-status')).toHaveText('Connected');
  expect(socket).toBeDefined();
  await socket!.close({ code: 1012, reason: 'Testing connection loss' });
  await expect(page.getByTestId('connection-status')).toHaveText('Disconnected');
  await expect(page.getByRole('button', { name: 'Send health check' })).toBeDisabled();
  await expect(page.getByTestId('connection-status')).toHaveText('Connected');
});

test('renders safely when the database cannot be reached initially', async ({ page }) => {
  await page.routeWebSocket(/\/v1\/database\//, route => route.close({ code: 1013, reason: 'Testing unavailable backend' }));
  const errors: Error[] = [];
  page.on('pageerror', error => errors.push(error));
  await page.goto('/development');
  await expect(page.getByRole('heading', { name: 'AEGIS', exact: true })).toBeVisible();
  await expect(page.getByTestId('connection-status')).toHaveText('Connection error');
  await expect(page.getByRole('button', { name: 'Send health check' })).toBeDisabled();
  expect(errors).toEqual([]);
});

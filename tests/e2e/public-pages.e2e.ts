import { expect, test } from '@playwright/test';

test('公共说明页可访问并互相跳转', async ({ page }) => {
  await page.goto('/support');
  await expect(page.getByRole('heading', { name: 'Support' })).toBeVisible();
  await expect(page.getByText('Sign-in problems')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Terms' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Privacy' })).toBeVisible();

  await page.getByRole('link', { name: 'Terms' }).click();
  await expect(page).toHaveURL(/\/terms$/);
  await expect(page.getByRole('heading', { name: 'Terms' })).toBeVisible();
  await expect(page.getByText('No auto-execution')).toBeVisible();

  await page.getByRole('link', { name: 'Privacy' }).click();
  await expect(page).toHaveURL(/\/privacy$/);
  await expect(page.getByRole('heading', { name: 'Privacy' })).toBeVisible();
  await expect(page.getByText('Session cookie', { exact: true })).toBeVisible();

  await page.goto('/support');
  await page.getByRole('link', { name: 'Back to sign in' }).click();
  await expect(page).toHaveURL(/\/daa\/login(?:\?|$)/);
  await expect(page.getByLabel('用户名')).toBeVisible();
});

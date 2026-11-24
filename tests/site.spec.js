import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { parse } from 'yaml';

const site = parse(readFileSync(new URL('../site-pages.yaml', import.meta.url), 'utf8'));
const expectedFiles = site.pages.map(({ file }) => file).sort();

async function expectHeading(page, expected) {
  const headingText = await page.locator('h1').innerText();
  expect(headingText.replace(/\s+/g, ' ').trim().toLowerCase()).toBe(expected.toLowerCase());
}

for (const configuredPage of site.pages) {
  test(`${configuredPage.file}: content, links, keyboard access and accessibility`, async ({ page, baseURL }) => {
    const browserErrors = [];
    page.on('console', (message) => {
      if (message.type() === 'error') {
        browserErrors.push(`console: ${message.text()}`);
      }
    });
    page.on('pageerror', (error) => browserErrors.push(`page: ${error.message}`));

    const response = await page.goto(`/${configuredPage.file}`);
    expect(response?.status()).toBe(200);
    await expect(page).toHaveTitle(configuredPage.title);
    await expect(page.locator('h1')).toHaveCount(1);
    await expectHeading(page, configuredPage.h1);
    await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', configuredPage.description);
    await expect(page.locator('.skip-link')).toHaveAttribute('href', '#main');
    await expect(page.locator('main#main')).toHaveCount(1);

    const headingLevels = await page.locator('h1, h2, h3, h4, h5, h6').evaluateAll((headings) =>
      headings.map((heading) => Number(heading.tagName.slice(1)))
    );
    expect(headingLevels[0]).toBe(1);
    for (let index = 1; index < headingLevels.length; index += 1) {
      expect(headingLevels[index] - headingLevels[index - 1]).toBeLessThanOrEqual(1);
    }

    for (const id of configuredPage.requiredIds) {
      await expect(page.locator(`#${id}`), `required id #${id}`).toHaveCount(1);
    }

    for (const text of configuredPage.requiredText) {
      await expect(page.locator('body')).toContainText(text);
    }

    const navTargets = await page.locator('nav a[href]').evaluateAll((anchors) =>
      anchors.map((anchor) => new URL(anchor.href).pathname.split('/').pop()).sort()
    );
    expect(navTargets).toEqual(expectedFiles);

    const localLinks = await page.locator('a[href]').evaluateAll((anchors, origin) =>
      [...new Set(anchors
        .map((anchor) => anchor.href)
        .filter((href) => {
          const url = new URL(href);
          return url.origin === origin && !url.hash && !url.pathname.endsWith('.css');
        }))]
    , new URL(baseURL).origin);
    for (const href of localLinks) {
      const linkResponse = await page.request.get(href);
      expect(linkResponse.status(), `local link ${href}`).toBeLessThan(400);
    }

    await page.keyboard.press('Tab');
    await expect(page.locator('.skip-link')).toBeFocused();
    const focusOutline = await page.locator('.skip-link').evaluate((element) => getComputedStyle(element).outlineStyle);
    expect(focusOutline).not.toBe('none');

    const accessibility = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'])
      .analyze();
    expect(accessibility.violations).toEqual([]);

    for (const target of site.pages) {
      await page.goto(`/${configuredPage.file}`);
      await page.locator(`nav a[href="${target.file}"]`).click();
      await expect(page).toHaveURL(new URL(`/${target.file}`, baseURL).href);
      await expect(page).toHaveTitle(target.title);
      await expectHeading(page, target.h1);
    }

    expect(browserErrors).toEqual([]);
  });
}

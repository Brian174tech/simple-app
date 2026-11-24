import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import * as cheerio from 'cheerio';
import { parse } from 'yaml';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const distRoot = path.join(projectRoot, 'dist');
const site = parse(readFileSync(path.join(projectRoot, 'site-pages.yaml'), 'utf8'));
const expectedFiles = site.pages.map(({ file }) => file).sort();
const css = readFileSync(path.join(distRoot, 'styles.css'), 'utf8');

test('configured pages match generated HTML files', () => {
  const builtFiles = readdirSync(distRoot)
    .filter((file) => file.endsWith('.html'))
    .sort();
  assert.deepEqual(builtFiles, expectedFiles);
});

for (const configuredPage of site.pages) {
  test(`${configuredPage.file}: metadata, content, structure and local links`, () => {
    const pagePath = path.join(distRoot, configuredPage.file);
    const $ = cheerio.load(readFileSync(pagePath, 'utf8'));

    assert.equal($('title').text().trim(), configuredPage.title);
    assert.equal($('h1').length, 1);
    const headingText = $('h1').contents()
      .map((_, node) => node.type === 'tag' ? $(node).text() : node.data)
      .get()
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
    assert.equal(headingText, configuredPage.h1.toLowerCase());
    assert.equal($('meta[name="description"]').attr('content'), configuredPage.description);
    assert.equal($('html').attr('lang')?.length > 0, true);
    assert.equal($('main#main').length, 1);
    assert.equal($('nav').length, 1);
    assert.equal($('a.skip-link').attr('href'), '#main');
    assert.equal($('a[href]').first().hasClass('skip-link'), true);

    const headingLevels = $('h1, h2, h3, h4, h5, h6')
      .toArray()
      .map((heading) => Number(heading.tagName.slice(1)));
    assert.equal(headingLevels[0], 1);
    for (let index = 1; index < headingLevels.length; index += 1) {
      assert.ok(headingLevels[index] - headingLevels[index - 1] <= 1, 'heading levels should not skip');
    }

    for (const id of configuredPage.requiredIds) {
      assert.equal($('[id]').toArray().filter((element) => $(element).attr('id') === id).length, 1, `id="${id}"`);
    }

    const bodyText = $('body').text().replace(/\s+/g, ' ');
    for (const text of configuredPage.requiredText) {
      assert.ok(bodyText.includes(text), `required text: ${text}`);
    }

    const navTargets = $('nav a[href]')
      .map((_, anchor) => path.basename(new URL($(anchor).attr('href'), `https://site.test/${configuredPage.file}`).pathname))
      .get()
      .sort();
    assert.deepEqual(navTargets, expectedFiles);

    for (const anchor of $('a[href]').toArray()) {
      const href = $(anchor).attr('href');
      const targetUrl = new URL(href, `https://site.test/${configuredPage.file}`);
      if (targetUrl.origin !== 'https://site.test') {
        continue;
      }

      const targetFile = targetUrl.pathname === '/' ? 'index.html' : targetUrl.pathname.slice(1);
      const targetPath = path.resolve(distRoot, targetFile);
      assert.ok(targetPath.startsWith(`${distRoot}${path.sep}`), `local link stays in dist: ${href}`);
      assert.ok(existsSync(targetPath), `local link target exists: ${href}`);

      if (targetUrl.hash) {
        const targetDocument = cheerio.load(readFileSync(targetPath, 'utf8'));
        const targetId = decodeURIComponent(targetUrl.hash.slice(1));
        assert.ok(
          targetDocument('[id]').toArray().some((element) => targetDocument(element).attr('id') === targetId),
          `local link fragment exists: ${href}`
        );
      }
    }
  });
}

test('stylesheet provides visible keyboard-focus and skip-link styles', () => {
  assert.match(css, /a:focus-visible\s*\{/);
  assert.match(css, /\.skip-link:focus\s*\{/);
});

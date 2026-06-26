import { test } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';

const IMG_DIR = path.resolve(__dirname, '..', 'images');
const SERVER_URL = process.env.VSCODE_SERVER_URL || 'http://localhost:34569';

test.describe('AI Evaluator — Screenshots', () => {
  let page;

  test.beforeAll(async ({ browser }) => {
    fs.mkdirSync(IMG_DIR, { recursive: true });
    page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await page.goto(SERVER_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(8000);
  });

  test('01 — Hero: full evaluation flow', async () => {
    await page.screenshot({ path: path.join(IMG_DIR, 'hero-00-vscode-loaded.png') });

    // Open command palette
    await page.keyboard.press('F1');
    await page.waitForTimeout(1000);
    await page.keyboard.type('AI Evaluator: Evaluate from editor');
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(IMG_DIR, 'hero-01-command-palette.png') });

    await page.keyboard.press('Enter');
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(IMG_DIR, 'hero-02-agent-pick.png') });

    await page.keyboard.press('Enter');
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(IMG_DIR, 'hero-03-metrics.png') });

    await page.keyboard.press('Enter');
    await page.waitForTimeout(6000);
    await page.screenshot({ path: path.join(IMG_DIR, 'hero-04-result.png') });
  });

  test('02 — Thresholds form', async () => {
    await page.keyboard.press('F1');
    await page.waitForTimeout(800);
    await page.keyboard.type('AI Evaluator: Evaluate from editor');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1500);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(IMG_DIR, 'feature-thresholds.png') });
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
  });

  test('03 — Custom evaluator', async () => {
    await page.keyboard.press('F1');
    await page.waitForTimeout(800);
    await page.keyboard.type('AI Evaluator: Add Custom Evaluator');
    await page.screenshot({ path: path.join(IMG_DIR, 'feature-custom-evaluator-01-palette.png') });
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(IMG_DIR, 'feature-custom-evaluator-02-form.png') });
    await page.keyboard.press('Escape');
  });

  test('04 — CI/CD snippet', async () => {
    await page.keyboard.press('F1');
    await page.waitForTimeout(800);
    await page.keyboard.type('AI Evaluator: Generate CI/CD Snippet');
    await page.screenshot({ path: path.join(IMG_DIR, 'feature-ci-snippet-01-palette.png') });
    await page.keyboard.press('Enter');
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(IMG_DIR, 'feature-ci-snippet-02-output.png') });
  });
});

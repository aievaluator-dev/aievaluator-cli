# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: screenshots.spec.ts >> AI Evaluator — Screenshots >> 01 — Hero: full evaluation flow
- Location: tests/screenshots.spec.ts:25:7

# Error details

```
TypeError: (0 , _testWeb.launch) is not a function
```

# Test source

```ts
  1   | import { test, expect } from '@playwright/test';
  2   | import { launch } from '@vscode/test-web';
  3   | import * as path from 'path';
  4   | import * as fs from 'fs';
  5   | 
  6   | const EXT_DIR = path.resolve(__dirname, '..');
  7   | const IMG_DIR = path.resolve(EXT_DIR, 'images');
  8   | 
  9   | test.describe('AI Evaluator — Screenshots', () => {
  10  |   let page;
  11  | 
  12  |   test.beforeAll(async ({ browser }) => {
  13  |     fs.mkdirSync(IMG_DIR, { recursive: true });
  14  | 
> 15  |     const vscodeServer = await launch({
      |                                      ^ TypeError: (0 , _testWeb.launch) is not a function
  16  |       browserType: browser.browserType(),
  17  |       extensionDevelopmentPath: EXT_DIR,
  18  |       folderPath: '/tmp/vscode-eval-workspace',
  19  |     });
  20  | 
  21  |     page = await vscodeServer.page;
  22  |     await page.waitForTimeout(5000);
  23  |   });
  24  | 
  25  |   test('01 — Hero: full evaluation flow', async () => {
  26  |     // Open a test file
  27  |     await page.keyboard.press('Control+Shift+P');
  28  |     await page.waitForTimeout(500);
  29  |     await page.keyboard.type('AI Evaluator: Evaluate from editor');
  30  |     await page.waitForTimeout(300);
  31  |     await page.screenshot({ path: path.join(IMG_DIR, 'hero-01-command-palette.png') });
  32  | 
  33  |     // Execute the command
  34  |     await page.keyboard.press('Enter');
  35  |     await page.waitForTimeout(2000);
  36  | 
  37  |     // Agent selection should appear
  38  |     await page.screenshot({ path: path.join(IMG_DIR, 'hero-02-agent-pick.png') });
  39  | 
  40  |     // Select internal agent (first option)
  41  |     await page.keyboard.press('Enter');
  42  |     await page.waitForTimeout(2000);
  43  | 
  44  |     // Metrics selection
  45  |     await page.screenshot({ path: path.join(IMG_DIR, 'hero-03-metrics.png') });
  46  | 
  47  |     // Select metrics and run
  48  |     await page.keyboard.press('Enter');
  49  |     await page.waitForTimeout(6000);
  50  | 
  51  |     // Result
  52  |     await page.screenshot({ path: path.join(IMG_DIR, 'hero-04-result.png') });
  53  |   });
  54  | 
  55  |   test('02 — Thresholds form', async () => {
  56  |     await page.keyboard.press('Control+Shift+P');
  57  |     await page.waitForTimeout(500);
  58  |     await page.keyboard.type('AI Evaluator: Evaluate from editor');
  59  |     await page.keyboard.press('Enter');
  60  |     await page.waitForTimeout(1500);
  61  |     await page.keyboard.press('Enter');
  62  |     await page.waitForTimeout(1500);
  63  | 
  64  |     // Threshold form
  65  |     await page.screenshot({ path: path.join(IMG_DIR, 'feature-thresholds.png') });
  66  | 
  67  |     // Dismiss
  68  |     await page.keyboard.press('Escape');
  69  |     await page.keyboard.press('Escape');
  70  |   });
  71  | 
  72  |   test('03 — Custom evaluator', async () => {
  73  |     await page.keyboard.press('Control+Shift+P');
  74  |     await page.waitForTimeout(500);
  75  |     await page.keyboard.type('AI Evaluator: Add Custom Evaluator');
  76  |     await page.screenshot({ path: path.join(IMG_DIR, 'feature-custom-evaluator-01-palette.png') });
  77  | 
  78  |     await page.keyboard.press('Enter');
  79  |     await page.waitForTimeout(1500);
  80  |     await page.screenshot({ path: path.join(IMG_DIR, 'feature-custom-evaluator-02-form.png') });
  81  | 
  82  |     await page.keyboard.press('Escape');
  83  |   });
  84  | 
  85  |   test('04 — Dataset evaluation', async () => {
  86  |     // Create a test dataset
  87  |     fs.writeFileSync('/tmp/vscode-eval-workspace/test-dataset.json', JSON.stringify([
  88  |       { input: 'What is 2+2?', expected_output: '4' },
  89  |       { input: 'Capital of France?', expected_output: 'Paris' },
  90  |     ], null, 2));
  91  | 
  92  |     // Open it
  93  |     await page.keyboard.press('Control+p');
  94  |     await page.waitForTimeout(300);
  95  |     await page.keyboard.type('test-dataset.json');
  96  |     await page.keyboard.press('Enter');
  97  |     await page.waitForTimeout(1500);
  98  | 
  99  |     // Right-click context menu or Code Lens
  100 |     await page.screenshot({ path: path.join(IMG_DIR, 'feature-dataset-01-editor.png') });
  101 | 
  102 |     await page.keyboard.press('Control+Shift+P');
  103 |     await page.waitForTimeout(500);
  104 |     await page.keyboard.type('AI Evaluator: Evaluate this dataset');
  105 |     await page.keyboard.press('Enter');
  106 |     await page.waitForTimeout(6000);
  107 |     await page.screenshot({ path: path.join(IMG_DIR, 'feature-dataset-02-results.png') });
  108 |   });
  109 | 
  110 |   test('05 — Sidebar history', async () => {
  111 |     // Click activity bar icon
  112 |     const sidebar = page.locator('a[id*="aievaluator"]').first();
  113 |     if (await sidebar.isVisible()) {
  114 |       await sidebar.click();
  115 |       await page.waitForTimeout(1000);
```
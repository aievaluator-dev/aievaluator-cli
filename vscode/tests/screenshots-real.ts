/**
 * AI Evaluator — Real Screenshots via vscode-extension-tester
 * Launches actual desktop VS Code with the extension loaded.
 * Run: npx extest setup-and-run tests/screenshots-real.ts
 */
import { VSBrowser, Workbench, EditorView, InputBox, QuickOpenBox, By, Key, until } from 'vscode-extension-tester';
import * as path from 'path';
import * as fs from 'fs';

const OUTPUT_DIR = '/tmp/aieval-demo-workspace/screenshots-real';
const SCREENSHOT_DELAY = 2000;

function delay(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

async function screenshot(driver: any, name: string) {
  const data = await driver.takeScreenshot();
  const filepath = path.join(OUTPUT_DIR, `${name}.png`);
  fs.writeFileSync(filepath, data, 'base64');
  console.log(`  📸 ${name}.png`);
}

describe('AI Evaluator — Real Screenshots', function () {
  this.timeout(300000); // 5 min timeout

  let driver: any;
  let browser: any;
  let workbench: Workbench;

  before(async function () {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    browser = VSBrowser.instance;
    driver = browser.driver;
    workbench = new Workbench();
    
    // Wait for VS Code to fully load
    await delay(5000);
    console.log('VS Code loaded');
  });

  it('01 — Activity bar shows AI Evaluator icon', async function () {
    console.log('\n🎬 Scene 1: Activity bar');
    await delay(SCREENSHOT_DELAY);
    await screenshot(driver, '01-activity-bar');
  });

  it('02 — Open command palette, find AI Evaluator commands', async function () {
    console.log('\n🎬 Scene 2: Command palette with AI Evaluator commands');
    
    // Open command palette
    const actions = driver.actions();
    await actions.keyDown(Key.CONTROL).keyDown(Key.SHIFT).sendKeys('p').keyUp(Key.SHIFT).keyUp(Key.CONTROL).perform();
    await delay(1500);
    
    // Type to show AI Evaluator commands
    await actions.sendKeys('AI Evaluator').perform();
    await delay(1000);
    await screenshot(driver, '02-command-palette');
    
    // Close palette
    await actions.sendKeys(Key.ESCAPE).perform();
    await delay(500);
  });

  it('03 — Init eval project', async function () {
    console.log('\n🎬 Scene 3: Init eval project');
    
    // Open command palette and run Init
    const actions = driver.actions();
    await actions.keyDown(Key.CONTROL).keyDown(Key.SHIFT).sendKeys('p').keyUp(Key.SHIFT).keyUp(Key.CONTROL).perform();
    await delay(1000);
    await actions.sendKeys('AI Evaluator: Initialize').perform();
    await delay(500);
    await actions.sendKeys(Key.ENTER).perform();
    await delay(3000);
    await screenshot(driver, '03-init-done');
  });

  it('04 — Open smoke-test.json dataset', async function () {
    console.log('\n🎬 Scene 4: Open dataset file');
    
    // Quick open file
    const actions = driver.actions();
    await actions.keyDown(Key.CONTROL).sendKeys('p').keyUp(Key.CONTROL).perform();
    await delay(1000);
    await actions.sendKeys('smoke-test.json').perform();
    await delay(500);
    await screenshot(driver, '04-quick-open');
    await actions.sendKeys(Key.ENTER).perform();
    await delay(2000);
    await screenshot(driver, '05-dataset-open');
  });

  it('05 — Context menu on dataset file', async function () {
    console.log('\n🎬 Scene 5: Context menu');
    
    // Right-click context menu
    const actions = driver.actions();
    await actions.keyDown(Key.SHIFT).sendKeys(Key.F10).keyUp(Key.SHIFT).perform();
    await delay(1500);
    await screenshot(driver, '06-context-menu');
    
    // Close
    await actions.sendKeys(Key.ESCAPE).perform();
    await delay(500);
  });

  it('06 — Open sidebar via activity bar click', async function () {
    console.log('\n🎬 Scene 6: Sidebar view');
    
    // Try to open the AI Evaluator sidebar via command
    // Focus the AI Evaluator view container
    const actions = driver.actions();
    await actions.keyDown(Key.CONTROL).keyDown(Key.SHIFT).sendKeys('p').keyUp(Key.SHIFT).keyUp(Key.CONTROL).perform();
    await delay(1000);
    await actions.sendKeys('View: Show AI Evaluator').perform();
    await delay(500);
    await actions.sendKeys(Key.ENTER).perform();
    await delay(2000);
    await screenshot(driver, '07-sidebar');
  });

  it('07 — Quick eval from selection', async function () {
    console.log('\n🎬 Scene 7: Quick eval flow');
    
    // Select all text in editor
    const actions = driver.actions();
    await actions.keyDown(Key.CONTROL).sendKeys('a').keyUp(Key.CONTROL).perform();
    await delay(300);
    
    // Run Evaluate from editor
    await actions.keyDown(Key.CONTROL).keyDown(Key.SHIFT).sendKeys('p').keyUp(Key.SHIFT).keyUp(Key.CONTROL).perform();
    await delay(1000);
    await actions.sendKeys('AI Evaluator: Evaluate from editor').perform();
    await delay(500);
    await actions.sendKeys(Key.ENTER).perform();
    await delay(3000);
    await screenshot(driver, '08-agent-picker');
    
    // Select internal agent (first option)
    await actions.sendKeys(Key.ENTER).perform();
    await delay(2000);
    await screenshot(driver, '09-metrics-picker');
    
    // Confirm metrics
    await actions.sendKeys(Key.ENTER).perform();
    await delay(2000);
    await screenshot(driver, '10-thresholds');
    
    // Run evaluation
    await actions.sendKeys(Key.ENTER).perform();
    await delay(6000);
    await screenshot(driver, '11-result');
  });

  it('08 — Custom evaluator', async function () {
    console.log('\n🎬 Scene 8: Custom evaluator');
    
    const actions = driver.actions();
    await actions.keyDown(Key.CONTROL).keyDown(Key.SHIFT).sendKeys('p').keyUp(Key.SHIFT).keyUp(Key.CONTROL).perform();
    await delay(1000);
    await actions.sendKeys('AI Evaluator: Add Custom Evaluator').perform();
    await delay(500);
    await actions.sendKeys(Key.ENTER).perform();
    await delay(2000);
    await screenshot(driver, '12-custom-eval-name');
    
    // Type name
    await actions.sendKeys('politeness').perform();
    await delay(300);
    await actions.sendKeys(Key.ENTER).perform();
    await delay(2000);
    await screenshot(driver, '13-custom-eval-prompt');
    
    // Type prompt
    await actions.sendKeys('Is the response polite? Answer YES or NO.').perform();
    await delay(300);
    await actions.sendKeys(Key.ENTER).perform();
    await delay(2000);
    await screenshot(driver, '14-custom-eval-threshold');
    
    // Type threshold
    await actions.sendKeys('0.85').perform();
    await delay(300);
    await actions.sendKeys(Key.ENTER).perform();
    await delay(2000);
    await screenshot(driver, '15-custom-eval-done');
  });

  it('09 — Generate CI/CD snippet', async function () {
    console.log('\n🎬 Scene 9: CI/CD snippet');
    
    const actions = driver.actions();
    await actions.keyDown(Key.CONTROL).keyDown(Key.SHIFT).sendKeys('p').keyUp(Key.SHIFT).keyUp(Key.CONTROL).perform();
    await delay(1000);
    await actions.sendKeys('AI Evaluator: Generate CI/CD Snippet').perform();
    await delay(500);
    await actions.sendKeys(Key.ENTER).perform();
    await delay(2000);
    await screenshot(driver, '16-ci-dataset-path');
    
    // Enter path
    await actions.sendKeys('./evals/regression.json').perform();
    await delay(300);
    await actions.sendKeys(Key.ENTER).perform();
    await delay(3000);
    await screenshot(driver, '17-ci-yaml-output');
  });

  after(async function () {
    console.log(`\n✅ Done! Screenshots in ${OUTPUT_DIR}/`);
  });
});

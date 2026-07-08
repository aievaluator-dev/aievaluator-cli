/**
 * AI Evaluator — Screenshots v2
 * Uses proper ExTester API for QuickPick, InputBox, and WebView.
 */
import { 
  VSBrowser, Workbench, EditorView, InputBox, QuickOpenBox,
  By, Key, until, WebView, BottomBarPanel
} from 'vscode-extension-tester';
import * as path from 'path';
import * as fs from 'fs';

const OUT = '/tmp/aieval-demo-workspace/screenshots-real';
const D = (ms: number) => new Promise(r => setTimeout(r, ms));

async function shot(driver: any, name: string) {
  const data = await driver.takeScreenshot();
  fs.writeFileSync(path.join(OUT, `${name}.png`), data, 'base64');
  console.log(`  📸 ${name}`);
}

describe('AI Evaluator — Screenshots v2', function () {
  this.timeout(300000);

  let driver: any;
  let workbench: Workbench;

  before(async function () {
    fs.mkdirSync(OUT, { recursive: true });
    driver = VSBrowser.instance.driver;
    workbench = new Workbench();
    await D(5000);
  });

  // ═══ 1. SIDEBAR ABIERTA ═══
  it('01 — Activity bar + sidebar visible', async function () {
    // Execute a command that activates the extension and opens the sidebar view
    await workbench.executeCommand('AI Evaluator: Initialize Eval Project');
    await D(3000);
    
    // Now try to focus the AI Evaluator view
    // The view container is "aievaluator" and the view is "aievaluator.sidebar"
    await workbench.executeCommand('workbench.view.extension.aievaluator');
    await D(2000);
    await shot(driver, '01-sidebar-open');
  });

  // ═══ 2. EVALUATE FILE ═══
  it('02 — Evaluate dataset: file picker', async function () {
    // Open quick open first to have a file in workspace
    await workbench.executeCommand('workbench.action.quickOpen');
    await D(800);
    const qb = await QuickOpenBox.create();
    await qb.setText('smoke-test.json');
    await D(500);
    await shot(driver, '02-quick-open-file');
    await qb.confirm();
    await D(2000);
    await shot(driver, '02b-file-opened');
  });

  it('03 — Evaluate dataset: agent picker', async function () {
    // Now trigger evaluate from editor (works when file is open)
    await workbench.executeCommand('AI Evaluator: Evaluate from editor');
    await D(3000);
    await shot(driver, '03-agent-picker');
  });

  it('04 — Evaluate dataset: metrics + run', async function () {
    // Try to interact with QuickPick - press Enter to select first option
    const actions = driver.actions();
    await actions.sendKeys(Key.ENTER).perform();
    await D(2000);
    await shot(driver, '04-metrics-picker');
    
    await actions.sendKeys(Key.ENTER).perform();
    await D(2000);
    await shot(driver, '04b-thresholds');
    
    await actions.sendKeys(Key.ENTER).perform();
    // Wait for evaluation to complete
    await D(8000);
    await shot(driver, '04c-results');
  });

  // ═══ 3. RECENTS en sidebar ═══
  it('05 — Recent evaluations in sidebar', async function () {
    // Close any open results panel
    await workbench.executeCommand('workbench.action.closeActiveEditor');
    await D(1000);
    
    // Open the AI Evaluator sidebar
    await workbench.executeCommand('workbench.view.extension.aievaluator');
    await D(2000);
    await shot(driver, '05-recents-sidebar');
  });

  // ═══ 4. CUSTOM EVALUATOR ═══
  it('06 — Custom evaluator: name prompt', async function () {
    await workbench.executeCommand('AI Evaluator: Add Custom Evaluator');
    await D(2000);
    
    // InputBox for name
    try {
      const input = await InputBox.create();
      await shot(driver, '06-custom-eval-name');
      await input.setText('politeness');
      await D(500);
      await input.confirm();
      await D(2000);
    } catch(e) {
      console.log('  InputBox fallback:', e);
      await shot(driver, '06-custom-eval-fallback');
    }
  });

  it('07 — Custom evaluator: prompt + threshold', async function () {
    // After name, should get prompt editor
    await D(2000);
    await shot(driver, '07-custom-eval-prompt');
    
    // Confirm prompt
    const actions = driver.actions();
    await actions.sendKeys(Key.ENTER).perform();
    await D(2000);
    
    // Threshold input
    try {
      const input = await InputBox.create();
      await shot(driver, '07b-custom-eval-threshold');
      await input.setText('0.85');
      await D(500);
      await input.confirm();
      await D(2000);
      await shot(driver, '07c-custom-eval-done');
    } catch(e) {
      console.log('  Threshold fallback:', e);
      await shot(driver, '07c-custom-eval-fallback');
    }
  });

  // ═══ 5. API KEY ═══
  it('08 — Set API Key', async function () {
    await workbench.executeCommand('AI Evaluator: Set API Key');
    await D(1500);
    try {
      const input = await InputBox.create();
      await shot(driver, '08-api-key-input');
      // Don't actually set a key, just cancel
      await input.cancel();
    } catch(e) {
      await shot(driver, '08-api-key-fallback');
    }
  });

  // ═══ 6. CONTEXT MENU ═══
  it('09 — Context menu on .json file', async function () {
    // Open a .json file first
    await workbench.executeCommand('workbench.action.quickOpen');
    await D(800);
    const qb = await QuickOpenBox.create();
    await qb.setText('smoke-test.json');
    await qb.confirm();
    await D(2000);
    
    // Right-click context menu
    const actions = driver.actions();
    await actions.contextClick().perform();
    await D(1500);
    await shot(driver, '09-context-menu-json');
    await actions.sendKeys(Key.ESCAPE).perform();
    await D(500);
  });

  // ═══ 7. CI/CD ═══
  it('10 — CI/CD snippet', async function () {
    await workbench.executeCommand('AI Evaluator: Generate CI/CD Snippet');
    await D(2000);
    await shot(driver, '10-ci-snippet-prompt');
    
    // Type dataset path
    const actions = driver.actions();
    await actions.sendKeys('./evals/regression.json').perform();
    await D(500);
    await actions.sendKeys(Key.ENTER).perform();
    await D(3000);
    await shot(driver, '10b-ci-yaml-generated');
  });

  after(async function () {
    console.log(`\n✅ Done! Screenshots in ${OUT}/`);
  });
});

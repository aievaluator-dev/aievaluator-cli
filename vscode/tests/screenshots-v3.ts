/**
 * AI Evaluator — Screenshots v3
 * Each test triggers a specific UI state and captures it.
 */
import { 
  VSBrowser, Workbench, InputBox, QuickOpenBox,
  Key
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

describe('AI Evaluator Screenshots', function () {
  this.timeout(300000);
  let driver: any;
  let wb: Workbench;

  before(async function () {
    fs.mkdirSync(OUT, { recursive: true });
    driver = VSBrowser.instance.driver;
    wb = new Workbench();
    await D(5000);
  });

  // ═══════════════ 1. SIDEBAR + ACTIVITY BAR ═══════════════
  it('01 — Sidebar with AI Evaluator icon in activity bar', async function () {
    // Open a file to have editor content, then focus AI Evaluator view
    await wb.executeCommand('workbench.action.quickOpen');
    await D(800);
    const qb = await QuickOpenBox.create();
    await qb.setText('smoke-test.json');
    await qb.confirm();
    await D(2000);

    // Focus the AI Evaluator activity bar icon
    await wb.executeCommand('workbench.view.extension.aievaluator');
    await D(2000);
    await shot(driver, '01-hero-sidebar');
  });

  // ═══════════════ 2. EVALUATE FLOW ═══════════════
  it('02 — Agent picker (QuickPick)', async function () {
    await wb.executeCommand('AI Evaluator: Evaluate from editor');
    await D(2500);
    await shot(driver, '02-agent-picker');
  });

  it('03 — Metrics picker (multi-select QuickPick)', async function () {
    // Select the internal agent (first option)
    const a = driver.actions();
    await a.sendKeys(Key.ENTER).perform();
    await D(2500);
    await shot(driver, '03-metrics-picker');
  });

  it('04 — Threshold form (webview)', async function () {
    // Confirm metrics and move to threshold webview
    const a = driver.actions();
    await a.sendKeys(Key.ENTER).perform();
    await D(3000);
    await shot(driver, '04-threshold-webview');
  });

  // ═══════════════ 3. CUSTOM EVALUATOR ═══════════════
  it('05 — Custom evaluator: name (InputBox)', async function () {
    // Close any open panel first
    await wb.executeCommand('workbench.action.closeAllEditors');
    await D(1000);
    
    await wb.executeCommand('AI Evaluator: Add Custom Evaluator');
    await D(2000);
    await shot(driver, '05-custom-eval-name');
  });

  it('06 — Custom evaluator: prompt (webview)', async function () {
    // Type name and confirm
    try {
      const input = await InputBox.create();
      await input.setText('politeness');
      await D(500);
      await input.confirm();
    } catch(e) {}
    await D(3000);
    await shot(driver, '06-custom-eval-prompt-webview');
  });

  it('07 — Custom evaluator: threshold (InputBox)', async function () {
    // The webview has a Submit button - we can't click it via WebDriver.
    // Send Escape to cancel and try a different approach.
    // Instead, just capture whatever state we're in
    await shot(driver, '07-custom-eval-state');
  });

  // ═══════════════ 4. API KEY ═══════════════
  it('08 — API Key (InputBox, password)', async function () {
    await wb.executeCommand('workbench.action.closeAllEditors');
    await D(1000);
    await wb.executeCommand('AI Evaluator: Set API Key');
    await D(2000);
    await shot(driver, '08-api-key-input');
    
    // Cancel
    try {
      const input = await InputBox.create();
      await input.cancel();
    } catch(e) {}
  });

  // ═══════════════ 5. CONTEXT MENU ═══════════════
  it('09 — Context menu on .json file', async function () {
    await wb.executeCommand('workbench.action.quickOpen');
    await D(800);
    const qb = await QuickOpenBox.create();
    await qb.setText('smoke-test.json');
    await qb.confirm();
    await D(2000);

    // Right-click in editor
    const a = driver.actions();
    await a.click(undefined, 3).perform(); // right-click
    await D(1500);
    await shot(driver, '09-context-menu');
    await a.sendKeys(Key.ESCAPE).perform();
  });

  // ═══════════════ 6. CI/CD ═══════════════
  it('10 — CI/CD snippet: platform picker', async function () {
    await wb.executeCommand('AI Evaluator: Generate CI/CD Snippet');
    await D(2000);
    await shot(driver, '10-ci-platform-picker');
  });

  it('11 — CI/CD snippet: generated YAML', async function () {
    const a = driver.actions();
    await a.sendKeys(Key.ENTER).perform(); // Pick GitHub
    await D(2000);
    await shot(driver, '11-ci-dataset-input');
    
    await a.sendKeys('./evals/regression.json').perform();
    await D(500);
    await a.sendKeys(Key.ENTER).perform();
    await D(3000);
    await shot(driver, '12-ci-yaml-generated');
  });

  after(async function () {
    console.log(`\nDone: ${OUT}/`);
  });
});

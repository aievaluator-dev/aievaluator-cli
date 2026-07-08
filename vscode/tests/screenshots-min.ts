/**
 * MINIMAL screenshot test - just capture key states no webviews
 */
import { VSBrowser, Workbench, InputBox, QuickOpenBox, Key } from 'vscode-extension-tester';
import * as path from 'path';
import * as fs from 'fs';

const OUT = '/tmp/aieval-demo-workspace/screenshots-real';
const D = (ms: number) => new Promise(r => setTimeout(r, ms));

async function shot(driver: any, name: string) {
  const data = await driver.takeScreenshot();
  fs.writeFileSync(path.join(OUT, `${name}.png`), data, 'base64');
}

describe('AIEval screenshots', function () {
  this.timeout(120000);
  let driver: any;
  let wb: Workbench;

  before(async function () {
    fs.mkdirSync(OUT, { recursive: true });
    driver = VSBrowser.instance.driver;
    wb = new Workbench();
    await D(4000);
  });

  // 1. Command palette showing AI Evaluator commands
  it('cmd-palette', async function () {
    await wb.executeCommand('workbench.action.showCommands');
    await D(800);
    const a = driver.actions();
    await a.sendKeys('AI Evaluator').perform();
    await D(600);
    await shot(driver, 's01-cmd-palette');
    await a.sendKeys(Key.ESCAPE).perform();
    await D(300);
  });

  // 2. Agent picker QuickPick  
  it('agent-picker', async function () {
    // Open dataset file first so Evaluate from editor works
    await wb.executeCommand('workbench.action.quickOpen');
    await D(600);
    const qb = await QuickOpenBox.create();
    await qb.setText('smoke-test.json');
    await qb.confirm();
    await D(1500);
    
    // Select all and evaluate
    const a = driver.actions();
    await a.keyDown(Key.CONTROL).sendKeys('a').keyUp(Key.CONTROL).perform();
    await D(200);
    await wb.executeCommand('AI Evaluator: Evaluate from editor');
    await D(2000);
    await shot(driver, 's02-agent-picker');
  });

  // 3. API Key InputBox
  it('api-key', async function () {
    await wb.executeCommand('workbench.action.closeAllEditors');
    await D(800);
    await wb.executeCommand('AI Evaluator: Set API Key');
    await D(1500);
    await shot(driver, 's03-api-key');
    try { const ib = await InputBox.create(); await ib.cancel(); } catch(e) {}
  });

  // 4. Custom evaluator name InputBox
  it('custom-eval-name', async function () {
    await wb.executeCommand('AI Evaluator: Add Custom Evaluator');
    await D(1500);
    await shot(driver, 's04-custom-eval-name');
    try { const ib = await InputBox.create(); await ib.cancel(); } catch(e) {}
  });

  // 5. CI/CD platform picker
  it('ci-platform', async function () {
    await wb.executeCommand('AI Evaluator: Generate CI/CD Snippet');
    await D(1500);
    await shot(driver, 's05-ci-platform');
    const a = driver.actions();
    await a.sendKeys(Key.ESCAPE).perform();
  });

  after(() => console.log(`\nDone: ${OUT}/`));
});

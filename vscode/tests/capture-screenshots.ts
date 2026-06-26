import { VSBrowser, Workbench } from 'vscode-extension-tester';

describe('AI Evaluator — Screenshots', function () {
  this.timeout(120000);

  let browser: VSBrowser;

  before(async function () {
    browser = VSBrowser.instance;
  });

  it('01 — Evaluate command: metrics picker', async function () {
    await new Workbench().executeCommand('AI Evaluator: Evaluate from editor');
    await browser.driver.sleep(3000);
    await browser.takeScreenshot('hero-01-agent-pick');
  });

  it('02 — Custom evaluator command', async function () {
    await new Workbench().executeCommand('AI Evaluator: Add Custom Evaluator');
    await browser.driver.sleep(2000);
    await browser.takeScreenshot('feature-custom-evaluator');
  });

  it('03 — CI/CD snippet command', async function () {
    await new Workbench().executeCommand('AI Evaluator: Generate CI/CD Snippet');
    await browser.driver.sleep(2000);
    await browser.takeScreenshot('feature-ci-snippet');
  });
});

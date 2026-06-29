import { VSBrowser, Workbench } from 'vscode-extension-tester';
import * as path from 'path';
import * as fs from 'fs';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const IMG_DIR = path.resolve(__dirname, '..', 'images');
const FRAMES_DIR = '/tmp/aievaluator-frames';

function delay(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

function buildGif(name: string, frameCount: number) {
  const dir = path.join(FRAMES_DIR, name);
  const gifPath = path.join(IMG_DIR, `${name}.gif`);
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.png')).sort();
  if (files.length === 0) return;
  console.log(`  Building GIF from ${files.length} frames...`);
  // Copy and rename sequentially
  files.forEach((f, i) => {
    fs.renameSync(path.join(dir, f), path.join(dir, `step-${String(i).padStart(2, '0')}.png`));
  });
  execSync(
    `ffmpeg -y -framerate 1/1.2 -i "${dir}/step-%02d.png" ` +
    `-vf "fps=8,scale=800:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse" ` +
    `-loop 0 "${gifPath}" 2>/dev/null`
  );
  const size = fs.existsSync(gifPath) ? (fs.statSync(gifPath).size / 1024).toFixed(0) : 'FAIL';
  console.log(`  ✅ ${name}.gif (${size} KB)`);
  fs.rmSync(dir, { recursive: true });
}

describe('AI Evaluator — Demo Recordings', function () {
  this.timeout(300000);

  it('Record all GIFs', async function () {
    fs.mkdirSync(IMG_DIR, { recursive: true });
    fs.mkdirSync(FRAMES_DIR, { recursive: true });
    const browser = VSBrowser.instance;
    const workbench = new Workbench();

    // ═══ GIF 1 — Hero ═══
    console.log('\n🎬 Hero: quick evaluation');
    const heroDir = path.join(FRAMES_DIR, 'hero-eval-flow');
    fs.mkdirSync(heroDir, { recursive: true });

    await workbench.executeCommand('workbench.action.files.newUntitledFile');
    await delay(600);
    await browser.driver.actions().sendKeys('What is the capital of France?').perform();
    await delay(400);
    await browser.driver.actions().keyDown('Control').sendKeys('a').keyUp('Control').perform();
    await delay(300);
    await browser.takeScreenshot(path.join(heroDir, '00-text-selected.png'));

    await workbench.executeCommand('AI Evaluator: Evaluate from editor');
    await delay(2500);
    await browser.takeScreenshot(path.join(heroDir, '01-agent-picker.png'));

    await browser.driver.actions().sendKeys('\n').perform();
    await delay(2500);
    await browser.takeScreenshot(path.join(heroDir, '02-metrics.png'));

    await browser.driver.actions().sendKeys('\n').perform();
    await delay(2500);
    await browser.takeScreenshot(path.join(heroDir, '03-thresholds.png'));

    await browser.driver.actions().sendKeys('\n').perform();
    await delay(5000);
    await browser.takeScreenshot(path.join(heroDir, '04-result.png'));

    buildGif('hero-eval-flow', 5);

    // ═══ GIF 2 — Custom evaluator ═══
    console.log('\n🎬 Custom evaluator');
    const ceDir = path.join(FRAMES_DIR, 'custom-evaluator');
    fs.mkdirSync(ceDir, { recursive: true });

    await workbench.executeCommand('AI Evaluator: Add Custom Evaluator');
    await delay(1500);
    await browser.takeScreenshot(path.join(ceDir, '00-name-prompt.png'));

    await browser.driver.actions().sendKeys('politeness').perform();
    await browser.driver.actions().sendKeys('\n').perform();
    await delay(1500);
    await browser.takeScreenshot(path.join(ceDir, '01-prompt-field.png'));

    await browser.driver.actions().sendKeys('Is the response polite? Answer YES/NO.').perform();
    await browser.driver.actions().sendKeys('\n').perform();
    await delay(1500);
    await browser.takeScreenshot(path.join(ceDir, '02-threshold-field.png'));

    await browser.driver.actions().sendKeys('0.85').perform();
    await browser.driver.actions().sendKeys('\n').perform();
    await delay(1500);
    await browser.takeScreenshot(path.join(ceDir, '03-success.png'));

    buildGif('custom-evaluator', 4);

    // ═══ GIF 3 — CI/CD ═══
    console.log('\n🎬 CI/CD snippet');
    const ciDir = path.join(FRAMES_DIR, 'ci-cd-snippet');
    fs.mkdirSync(ciDir, { recursive: true });

    await workbench.executeCommand('AI Evaluator: Generate CI/CD Snippet');
    await delay(1500);
    await browser.takeScreenshot(path.join(ciDir, '00-dataset-path.png'));

    await browser.driver.actions().sendKeys('evals/regression.json').perform();
    await browser.driver.actions().sendKeys('\n').perform();
    await delay(3000);
    await browser.takeScreenshot(path.join(ciDir, '01-workflow-yaml.png'));

    buildGif('ci-cd-snippet', 2);
  });
});

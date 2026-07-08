import { chromium } from 'playwright';
import * as path from 'path';
import * as fs from 'fs';

const MOCKUP_DIR = '/tmp/aieval-demo-workspace';
const OUTPUT_DIR = path.join(MOCKUP_DIR, 'screenshots-desktop');

const SCENES = [
  { file: 'mockup-01-sidebar.html',    name: 'hero-sidebar-overview',   label: 'Sidebar + activity bar icon' },
  { file: 'mockup-02-results.html',    name: 'feature-results-panel',   label: 'Dataset evaluation results' },
  { file: 'mockup-03-quickpick.html',  name: 'feature-quick-eval',      label: 'Agent picker + metrics picker' },
  { file: 'mockup-04-custom-eval.html', name: 'feature-custom-evaluator', label: 'Custom evaluator editor' },
  { file: 'mockup-05-cicd.html',       name: 'feature-ci-cd',           label: 'CI/CD GitHub Actions workflow' },
];

async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  
  for (const scene of SCENES) {
    const url = `file://${MOCKUP_DIR}/${scene.file}`;
    console.log(`\n🎬 ${scene.label}`);
    console.log(`   Opening ${scene.file}...`);
    
    await page.goto(url, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(500);
    
    const filepath = path.join(OUTPUT_DIR, `${scene.name}.png`);
    await page.screenshot({ path: filepath, fullPage: false });
    const kb = (fs.statSync(filepath).size / 1024).toFixed(0);
    console.log(`   📸 ${scene.name}.png (${kb} KB)`);
  }
  
  await browser.close();
  
  console.log(`\n${'='.repeat(50)}`);
  console.log(` ✅ Done! ${SCENES.length} screenshots in ${OUTPUT_DIR}/`);
  console.log(`${'='.repeat(50)}`);
  
  for (const scene of SCENES) {
    const fp = path.join(OUTPUT_DIR, `${scene.name}.png`);
    const kb = (fs.statSync(fp).size / 1024).toFixed(0);
    console.log(`   ${scene.name}.png (${kb} KB) — ${scene.label}`);
  }
}

main().catch(console.error);

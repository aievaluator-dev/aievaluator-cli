import { chromium } from 'playwright';
import * as path from 'path';
import * as fs from 'fs';

const OUTPUT_DIR = '/tmp/aieval-demo-workspace/screenshots';
const URL = 'http://localhost:34569';

async function screenshot(page, name: string) {
  const filepath = path.join(OUTPUT_DIR, `${name}.png`);
  await page.screenshot({ path: filepath });
  const size = fs.existsSync(filepath) ? (fs.statSync(filepath).size / 1024).toFixed(0) : 0;
  console.log(`  📸 ${name}.png (${size} KB)`);
  return filepath;
}

async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  
  console.log('Launching browser...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  
  console.log(`Navigating to ${URL}...`);
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  
  // Wait for VS Code to fully load
  console.log('Waiting for VS Code to load...');
  await page.waitForTimeout(12000);
  await screenshot(page, '01-vscode-loaded');
  
  // Wait for the activity bar to be visible (sidebar icons on the left)
  try {
    await page.waitForSelector('.activitybar', { timeout: 10000 });
    console.log('Activity bar found');
    await screenshot(page, '02-activity-bar');
  } catch {
    console.log('Activity bar not found, taking full screenshot');
    await screenshot(page, '02-fallback');
  }

  // Try to click the AI Evaluator icon in activity bar
  // The extension contributes a view container with id "aievaluator"
  try {
    // Click the AI Evaluator activity bar icon
    const aiIcon = page.locator('.activitybar .composite').filter({ hasText: '' }).last();
    // Actually let's try a different approach - look for the sidebar
    await page.waitForTimeout(3000);
    
    // Try keyboard shortcut to open command palette
    console.log('Opening command palette...');
    await page.keyboard.press('F1');
    await page.waitForTimeout(2000);
    await screenshot(page, '03-command-palette');
    
    // Type "AI Evaluator"
    await page.keyboard.type('AI Evaluator: Initialize', { delay: 50 });
    await page.waitForTimeout(1000);
    await screenshot(page, '04-init-command');
    
    // Execute it
    await page.keyboard.press('Enter');
    await page.waitForTimeout(3000);
    await screenshot(page, '05-after-init');
    
  } catch (e) {
    console.log(`Interaction error: ${e}`);
    await screenshot(page, 'error-state');
  }

  // Final full screenshot
  await screenshot(page, '99-final-state');
  
  await browser.close();
  console.log('\nDone! Screenshots in:', OUTPUT_DIR);
}

main().catch(console.error);

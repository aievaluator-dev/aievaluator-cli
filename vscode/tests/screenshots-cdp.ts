/**
 * AI Evaluator — Screenshots via CDP
 * 
 * Launches VS Code with --remote-debugging-port, connects Playwright via CDP,
 * and automates keyboard-driven screenshots of the real extension.
 *
 * Usage:
 *   cd aievaluator-cli/vscode
 *   npx tsx tests/screenshots-cdp.ts
 *
 * Prerequisites:
 *   - npm run compile (extension must be built)
 *   - No other VS Code instance with port 9222
 */

import { chromium } from 'playwright';
import { spawn, type ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

// ═══ CONFIG ═══
const EXT_PATH = process.cwd(); // /aievaluator-cli/vscode
const OUT_DIR = path.join(EXT_PATH, 'images');
const PORT = 9222;
const CDP_URL = `http://localhost:${PORT}`;
const TIMEOUT = 120_000; // 2 min total

// Which VS Code binary to use
const VSCODE_BIN = 'code-insiders';

// Workspace folder to open (so the extension has files to work with)
const WORKSPACE_DIR = '/tmp/aieval-screenshots-workspace';

// ═══ HELPERS ═══
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

function log(msg: string) {
  console.log(`[${new Date().toISOString().slice(11, 19)}] ${msg}`);
}

async function screenshot(page: any, name: string) {
  const filepath = path.join(OUT_DIR, `${name}.png`);
  await page.screenshot({ path: filepath });
  const kb = fs.existsSync(filepath) ? (fs.statSync(filepath).size / 1024).toFixed(0) : 0;
  log(`  📸 ${name}.png (${kb} KB)`);
}

// ═══ SETUP WORKSPACE ═══
function setupWorkspace() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.mkdirSync(WORKSPACE_DIR, { recursive: true });

  // Create a simple test file so the editor has content
  const testFile = path.join(WORKSPACE_DIR, 'test.txt');
  if (!fs.existsSync(testFile)) {
    fs.writeFileSync(testFile, 'What is the capital of France?\nWhat is 2+2?\nExplain quantum computing briefly.', 'utf-8');
  }

  // Create a test dataset
  const evalsDir = path.join(WORKSPACE_DIR, 'evals');
  fs.mkdirSync(evalsDir, { recursive: true });
  const datasetPath = path.join(evalsDir, 'test-dataset.json');
  if (!fs.existsSync(datasetPath)) {
    fs.writeFileSync(datasetPath, JSON.stringify([
      { input: 'What is the capital of France?', expected_output: 'Paris' },
      { input: 'What is 2+2?', expected_output: '4' },
    ], null, 2), 'utf-8');
  }
  
  log(`Workspace ready: ${WORKSPACE_DIR}`);
}

// ═══ WAIT FOR CDP SERVER ═══
async function waitForCDP(maxWaitMs: number = 30000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    try {
      const resp = await fetch(`${CDP_URL}/json/version`);
      if (resp.ok) {
        log('CDP server is ready');
        return true;
      }
    } catch {
      // not ready yet
    }
    await sleep(500);
  }
  return false;
}

// ═══ FIND VS CODE PAGE ═══
async function findVSCodePage(browser: any): Promise<any> {
  const contexts = browser.contexts();
  for (const ctx of contexts) {
    const pages = ctx.pages();
    for (const page of pages) {
      const title = await page.title();
      const url = page.url();
      log(`  Page: title="${title.slice(0,80)}" url="${url.slice(0,80)}"`);
      
      // With --extensionDevelopmentPath from CLI, the title is the workspace name + "— code-insiders"
      // The URL will be a vscode-file:// or vscode-webview:// URL
      if (url.includes('vscode') || title.includes('code-insiders') || title.includes('code')) {
        log(`  ✅ Using: "${title.slice(0,60)}"`);
        return page;
      }
    }
  }
  
  // Fallback: first available page
  const allPages = browser.contexts()[0]?.pages();
  if (allPages?.length > 0) {
    log('  ⚠️  Using first available page (fallback)');
    return allPages[0];
  }
  
  throw new Error('No VS Code pages found via CDP');
}

// ═══ MAIN ═══
async function main() {
  log('═══ AI Evaluator Screenshots via CDP ═══');
  
  // 1. Setup
  setupWorkspace();
  
  // Check that extension is compiled
  if (!fs.existsSync(path.join(EXT_PATH, 'out', 'extension.js'))) {
    log('❌ out/extension.js not found. Run: npm run compile');
    process.exit(1);
  }

  // 2. Kill any existing process on our port
  try {
    const existing = await fetch(`${CDP_URL}/json/version`);
    log('⚠️  Port 9222 already in use. Close other VS Code instances or change PORT.');
    process.exit(1);
  } catch {
    // Port is free, good
  }

  // 3. Launch VS Code with debug port
  // --user-data-dir forces a FRESH Electron process (critical for CDP)
  const userDataDir = `/tmp/vscode-cdp-${Date.now()}`;
  log(`Launching ${VSCODE_BIN} with CDP on port ${PORT}...`);
  log(`  user-data-dir: ${userDataDir}`);
  const vscodeProc: ChildProcess = spawn(VSCODE_BIN, [
    `--extensionDevelopmentPath=${EXT_PATH}`,
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${userDataDir}`,
    '--disable-workspace-trust',
    WORKSPACE_DIR,
  ], {
    detached: true,
    stdio: 'ignore',
    env: { ...process.env },
  });

  vscodeProc.unref();
  log(`VS Code PID: ${vscodeProc.pid}`);

  // 4. Wait for CDP server
  log('Waiting for CDP server...');
  const ready = await waitForCDP(30000);
  if (!ready) {
    log('❌ CDP server did not start. Is VS Code running?');
    log('   Try manually: code-insiders --remote-debugging-port=9222 --new-window');
    process.exit(1);
  }

  // 5. Connect Playwright
  log('Connecting Playwright via CDP...');
  const browser = await chromium.connectOverCDP(CDP_URL);
  
  // List all pages
  const allCtxs = browser.contexts();
  log(`Found ${allCtxs.length} browser context(s)`);
  
  // 6. Find the right page
  const page = await findVSCodePage(browser);
  await page.setViewportSize({ width: 1280, height: 720 });
  
  // Wait for extension to activate
  await sleep(5000);

  // ═══════════════════════════════════════════════
  // SCENE 1: Init project
  // ═══════════════════════════════════════════════
  try {
    log('\n🎬 Scene 1: Init eval project');
    await page.keyboard.press('Control+Shift+P');
    await sleep(800);
    await page.keyboard.type('AI Evaluator: Initialize Eval Project', { delay: 30 });
    await sleep(500);
    await screenshot(page, '01-command-palette');
    await page.keyboard.press('Enter');
    await sleep(3000);
    await screenshot(page, '02-init-done');

    // ═══════════════════════════════════════════════
    // SCENE 2: Open dataset file
    // ═══════════════════════════════════════════════
    log('\n🎬 Scene 2: Open dataset file');
    await page.keyboard.press('Control+P');
    await sleep(600);
    await page.keyboard.type('test-dataset.json');
    await sleep(400);
    await screenshot(page, '03-quick-open-file');
    await page.keyboard.press('Enter');
    await sleep(1500);
    await screenshot(page, '04-dataset-open');

    // ═══════════════════════════════════════════════
    // SCENE 3: Evaluate from editor (agent picker)
    // ═══════════════════════════════════════════════
    log('\n🎬 Scene 3: Agent picker');
    await page.keyboard.press('Control+Shift+P');
    await sleep(800);
    await page.keyboard.type('AI Evaluator: Evaluate from editor', { delay: 20 });
    await sleep(400);
    await page.keyboard.press('Enter');
    await sleep(2000);
    await screenshot(page, '05-agent-picker');
    
    // Select internal agent
    await page.keyboard.press('Enter');
    await sleep(2000);
    await screenshot(page, '06-metrics-picker');
    
    // Confirm metrics
    await page.keyboard.press('Enter');
    await sleep(2500);
    await screenshot(page, '07-thresholds-form');
    
    // Submit thresholds
    await page.keyboard.press('Enter');
    await sleep(5000); // Wait for evaluation
    await screenshot(page, '08-eval-result');

    // ═══════════════════════════════════════════════
    // SCENE 4: Sidebar / activity bar
    // ═══════════════════════════════════════════════
    log('\n🎬 Scene 4: Sidebar');
    await page.keyboard.press('Escape');
    await sleep(500);
    // Focus AI Evaluator view in activity bar
    await page.keyboard.press('Control+Shift+P');
    await sleep(600);
    await page.keyboard.type('View: Show AI Evaluator', { delay: 20 });
    await sleep(300);
    await page.keyboard.press('Enter');
    await sleep(2000);
    await screenshot(page, '09-sidebar');

    // ═══════════════════════════════════════════════
    // SCENE 5: Custom evaluator
    // ═══════════════════════════════════════════════
    log('\n🎬 Scene 5: Custom evaluator');
    await page.keyboard.press('Control+Shift+P');
    await sleep(600);
    await page.keyboard.type('AI Evaluator: Add Custom Evaluator', { delay: 20 });
    await sleep(300);
    await page.keyboard.press('Enter');
    await sleep(1500);
    await screenshot(page, '10-custom-eval-name');
    
    // Type name
    await page.keyboard.type('politeness');
    await sleep(300);
    await page.keyboard.press('Enter');
    await sleep(2000);
    await screenshot(page, '11-custom-eval-prompt');
    
    // Type prompt
    await page.keyboard.type('Is the response polite and professional? Answer YES/NO.');
    await sleep(300);
    await page.keyboard.press('Enter');
    await sleep(2000);
    await screenshot(page, '12-custom-eval-threshold');
    
    // Type threshold
    await page.keyboard.type('0.85');
    await sleep(300);
    await page.keyboard.press('Enter');
    await sleep(2000);
    await screenshot(page, '13-custom-eval-done');

    // ═══════════════════════════════════════════════
    // SCENE 6: Set API Key
    // ═══════════════════════════════════════════════
    log('\n🎬 Scene 6: API Key input');
    await page.keyboard.press('Control+Shift+P');
    await sleep(600);
    await page.keyboard.type('AI Evaluator: Set API Key', { delay: 20 });
    await sleep(300);
    await page.keyboard.press('Enter');
    await sleep(1500);
    await screenshot(page, '14-api-key-input');
    await page.keyboard.press('Escape');
    await sleep(300);

    // ═══════════════════════════════════════════════
    // SCENE 7: CI/CD snippet
    // ═══════════════════════════════════════════════
    log('\n🎬 Scene 7: CI/CD snippet');
    await page.keyboard.press('Control+Shift+P');
    await sleep(600);
    await page.keyboard.type('AI Evaluator: Generate CI/CD Snippet', { delay: 20 });
    await sleep(300);
    await page.keyboard.press('Enter');
    await sleep(2000);
    await screenshot(page, '15-ci-platform-pick');
    
    // Pick GitHub
    await page.keyboard.press('Enter');
    await sleep(2000);
    await screenshot(page, '16-ci-dataset-path');
    
    // Enter path
    await page.keyboard.type('./evals/regression.json');
    await sleep(300);
    await page.keyboard.press('Enter');
    await sleep(2500);
    await screenshot(page, '17-ci-yaml-output');

  } catch (err) {
    log(`❌ Error during capture: ${err}`);
    await screenshot(page, '99-error-state');
  }

  // 8. Cleanup
  log('\n✅ Done! Screenshots in images/');
  log('Closing VS Code...');
  
  // Try to close via keyboard
  try {
    await page.keyboard.press('Control+Q');
    await sleep(1000);
  } catch {}

  await browser.close();
  
  // Kill VS Code process if still running
  try {
    process.kill(-vscodeProc.pid!, 'SIGTERM');
  } catch {}
  
  process.exit(0);
}

main().catch((err) => {
  log(`❌ Fatal: ${err}`);
  process.exit(1);
});

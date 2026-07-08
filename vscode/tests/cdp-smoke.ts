/**
 * Smoke test: verifies CDP connection to VS Code works.
 * Run this FIRST before screenshots-cdp.ts.
 *
 * Usage: npx tsx tests/cdp-smoke.ts
 */
import { chromium } from 'playwright';
import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

const PORT = 9222;
const CDP_URL = `http://localhost:${PORT}`;
const EXT_PATH = process.cwd();

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function main() {
  console.log('🔍 CDP Smoke Test');

  // 1. Check if port already in use
  try {
    const r = await fetch(`${CDP_URL}/json/version`);
    const data = await r.json();
    console.log('⚠️  Port 9222 already in use:', data.Browser);
    console.log('   → Trying to connect to existing instance...');
  } catch {
    // Port free, launch VS Code
    // --user-data-dir forces a FRESH Electron process (no instance reuse)
    const userDataDir = `/tmp/vscode-cdp-profile-${Date.now()}`;
    console.log('Launching VS Code Insiders with CDP...');
    console.log(`  user-data-dir: ${userDataDir}`);
    const proc = spawn('code-insiders', [
      `--extensionDevelopmentPath=${EXT_PATH}`,
      `--remote-debugging-port=${PORT}`,
      `--user-data-dir=${userDataDir}`,
      '--disable-workspace-trust',
      '/tmp/aieval-screenshots-workspace',
    ], { detached: true, stdio: 'ignore' });
    proc.unref();

    // Wait for CDP
    console.log('Waiting for CDP server...');
    for (let i = 0; i < 60; i++) {
      try {
        await fetch(`${CDP_URL}/json/version`);
        console.log('✅ CDP server ready!');
        break;
      } catch {
        await sleep(1000);
      }
    }
  }

  // 2. Connect Playwright
  console.log('Connecting Playwright...');
  const browser = await chromium.connectOverCDP(CDP_URL);
  
  // 3. List all pages
  console.log(`\nContexts: ${browser.contexts().length}`);
  for (const ctx of browser.contexts()) {
    const pages = ctx.pages();
    console.log(`  Context pages: ${pages.length}`);
    for (const page of pages) {
      const title = await page.title();
      const url = page.url();
      console.log(`    📄 "${title}"`);
      console.log(`       ${url.slice(0, 100)}`);
    }
  }

  // 4. Try to interact with the first page
  const page = browser.contexts()[0]?.pages()[0];
  if (page) {
    await page.setViewportSize({ width: 1280, height: 720 });
    
    // Send a key
    await page.keyboard.press('F1');
    await sleep(1000);
    
    // Screenshot
    fs.mkdirSync(path.join(EXT_PATH, 'images'), { recursive: true });
    await page.screenshot({ 
      path: path.join(EXT_PATH, 'images', 'cdp-smoke-test.png') 
    });
    console.log('\n✅ Smoke test passed! Screenshot saved to images/cdp-smoke-test.png');
  } else {
    console.log('\n❌ No page found to interact with');
  }

  await browser.close();
  console.log('Done.');
}

main().catch(err => {
  console.error('❌ Smoke test failed:', err.message);
  process.exit(1);
});

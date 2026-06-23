# 🐛 Debugging the AI Evaluator VS Code Extension

> Run and debug the extension locally in VS Code Insiders.

---

## Quick Start

```bash
cd aievaluator-cli/vscode

# 1. Install dependencies
npm install

# 2. Open the extension in VS Code Insiders
#    (from the vscode/ folder)
code-insiders .

# 3. Press F5
```

That's it. A new **Extension Development Host** window opens with your extension loaded.

---

## Step by Step

### 1. Prerequisites

| Tool | Version | Check |
|---|---|---|
| VS Code Insiders | Latest | `code-insiders --version` |
| Node.js | 18+ | `node --version` |
| npm | 9+ | `npm --version` |

### 2. Install dependencies

```bash
cd /home/franco/cosas/ia_evaluator/aievaluator-cli/vscode
npm install
```

### 3. Open in VS Code Insiders

```bash
code-insiders .
```

> If `code-insiders` is not in PATH, open VS Code Insiders manually → File → Open Folder → select the `vscode/` folder.

### 4. Create launch config

If `.vscode/launch.json` doesn't exist, create it:

```bash
mkdir -p .vscode
```

```json
// .vscode/launch.json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Run Extension",
      "type": "extensionHost",
      "request": "launch",
      "args": [
        "--extensionDevelopmentPath=${workspaceFolder}"
      ],
      "outFiles": [
        "${workspaceFolder}/out/**/*.js"
      ],
      "preLaunchTask": "npm: compile"
    },
    {
      "name": "Run Extension (no build)",
      "type": "extensionHost",
      "request": "launch",
      "args": [
        "--extensionDevelopmentPath=${workspaceFolder}"
      ],
      "outFiles": [
        "${workspaceFolder}/out/**/*.js"
      ]
    }
  ]
}
```

### 5. Press F5

Or: Run and Debug panel → **"Run Extension"** → green play button.

A new window opens with title `[Extension Development Host]`.

---

## Verify It Works

In the **Extension Development Host** window:

1. Open any text file (Ctrl+N → type something)
2. Select some text
3. Right-click → **"AI Evaluator: Evaluate selection"**
4. Enter an expected output when prompted
5. Check the notification for the score

---

## Debugging Tricks

### Console logs

All `console.log()` in `extension.ts` appear in the **main VS Code Insiders** window:

```
View → Output → select "Extension Host" from dropdown
```

Or: `Ctrl+Shift+U` → Output panel.

### Breakpoints

1. Click the gutter next to a line number in `src/extension.ts`
2. Press F5
3. Trigger the command in the Extension Dev Host
4. Execution pauses at the breakpoint
5. Inspect variables, step through, etc.

### Reload without restarting

In the Extension Dev Host: `Ctrl+Shift+P` → **"Developer: Reload Window"**.

Faster than stopping and re-running F5 every time.

### Debug the sidebar webview

In the Extension Dev Host: `Ctrl+Shift+P` → **"Developer: Toggle Developer Tools"**.

This opens Chrome DevTools for the webview HTML/JS. You can:
- Inspect the sidebar HTML
- Run `acquireVsCodeApi()` in the console
- Check for JS errors in the webview

---

## Project Structure for Debugging

```
vscode/
├── .vscode/
│   ├── launch.json       ← F5 configs
│   └── tasks.json        ← Build task (npm compile)
├── package.json          ← Extension manifest
├── tsconfig.json         ← TypeScript config
├── src/
│   ├── extension.ts      ← Main entry — activate() runs on F5
│   └── ...
└── out/                  ← Compiled JS (created by npm run compile)
```

---

## Common Issues

### "Activating extension aievaluator failed"

Check the Extension Host output (`Ctrl+Shift+U` → Extension Host) for the exact error. Usually:
- Missing `package.json` field (`main`, `activationEvents`)
- Import error in `extension.ts`
- `package.json` `main` doesn't match the compiled output path

### Extension doesn't appear in activity bar

1. Verify `package.json` has `"viewsContainers"` and `"views"` sections
2. Check the extension is activated: `Ctrl+Shift+P` → "Developer: Show Running Extensions"
3. Right-click activity bar → check "AI Evaluator" is visible

### Hot reload

VS Code extensions don't support hot reload. After code changes:
1. Stop the debug session (red square)
2. Press F5 again
3. Or in the Extension Dev Host: Ctrl+Shift+P → "Developer: Reload Window"

---

## Tasks for build automation

```json
// .vscode/tasks.json
{
  "version": "2.0.0",
  "tasks": [
    {
      "type": "npm",
      "script": "compile",
      "group": "build",
      "problemMatcher": ["$tsc"],
      "label": "npm: compile"
    }
  ]
}
```

This lets the `preLaunchTask` in `launch.json` auto-compile TypeScript before each F5.

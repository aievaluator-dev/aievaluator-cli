# 🧪 AI Evaluator for VS Code — Tutorial

> Evaluate your AI agents and prompts without leaving your editor.

**Time to complete:** 5 minutes
**Requirements:** VS Code 1.85+

---

## 1. Install

### From Marketplace

1. Open VS Code
2. Press `Ctrl+Shift+X` (or `Cmd+Shift+X` on Mac) to open Extensions
3. Search **"AI Evaluator"**
4. Click **Install**

### From .vsix (manual)

```bash
code --install-extension aievaluator-1.0.0.vsix
```

**Done!** You'll see the 🧪 icon in the activity bar (left sidebar).

---

## 2. Your First Evaluation (no signup)

The extension works **without an API key** in playground mode — 5 free evals/day.

### Select text → evaluate

1. Open any file (`.json`, `.md`, `.py`, `.ts` — any text)
2. **Highlight** a prompt you want to test:

   ```
   What is the capital of France?
   ```

3. **Right-click** → **"AI Evaluator: Evaluate from editor"**
4. Pick your agent (internal or custom URL)
5. Type an expected output (optional) + select metrics → Enter
6. VS Code shows the result:

   ```
   AI Evaluator: g_eval: 92% ✅
   ```

> 💡 **Tip:** You can also use `Ctrl+Shift+P` → type `Evaluate selection`.

### What's happening under the hood

```
Selection  →  playground API  →  LLM Judge (DeepSeek)  →  Score
   "Paris"      /api/v1/          evaluates faithfulness    92%
                playground/
                evaluate
```

---

## 3. Using the Sidebar

Click the **🧪 icon** in the activity bar to open the sidebar panel.

```
┌───────────────────────────────────────────┐
│  🧪 AI Evaluator                          │
│  ────────────────────────                 │
│                                           │
│  Evaluate your prompts and agents         │
│  from VS Code.                            │
│                                           │
│  ┌─────────────────────────────────┐     │
│  │     Run Quick Evaluation        │     │
│  └─────────────────────────────────┘     │
│  ┌─────────────────────────────────┐     │
│  │     Open Dashboard              │     │
│  └─────────────────────────────────┘     │
│                                           │
│  Select text in the editor, then run      │
│  a quick evaluation.                      │
└───────────────────────────────────────────┘
```

- **Run Quick Evaluation** — same as right-click → evaluate selection
- **Open Dashboard** — opens aievaluator.dev in your browser

---

## 4. Setting Your API Key (for CI/CD)

If you want **100 free evals/month** and CI/CD integration:

1. Go to [aievaluator.dev](https://www.aievaluator.dev) → **Sign up**
2. Go to **Settings → API Keys** → **Create key**
3. Copy your key
4. In VS Code: `Ctrl+Shift+P` → **"AI Evaluator: Set API Key"**
5. Paste your key → **Enter**

```
✅ API key saved
```

Your key is stored in VS Code's **secrets storage** (encrypted, per-profile).

---

## 5. Evaluating a Dataset File

The extension works best with dataset JSON files.

### Create a dataset

```json
// evals/smoke-test.json
[
  {"input": "Hello", "expected_output": "Hi!"},
  {"input": "What is 2+2?", "expected_output": "4"},
  {"input": "Capital of France?", "expected_output": "Paris"}
]
```

### Evaluate it

1. Open `smoke-test.json` in VS Code
2. **Right-click** anywhere in the file → **"AI Evaluator: Evaluate selection"**
3. The extension sends the entire file to the playground

**Coming soon:** auto-evaluate on save (`aievaluator.config.json` with `evaluateOnSave: true`).

---

## 6. Generating a CI/CD Workflow

Turn your evals into a CI quality gate:

1. `Ctrl+Shift+P` → **"AI Evaluator: Generate CI/CD snippet"**
2. Enter your dataset path (default: `./evals/regression.json`)
3. A new editor tab opens with a ready-to-use GitHub Actions workflow:

```yaml
# GitHub Actions — AI Quality Gate
name: AI Quality Gate
on: [pull_request]

jobs:
  evaluate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.12'
      - run: pip install aievaluator
      - run: |
          aievaluator eval \
            --agent ${{ vars.STAGING_AGENT_URL }} \
            --dataset ./evals/regression.json \
            --metrics faithfulness,g_eval \
            --min-score 0.80 \
            --ci \
            --format junit > report.xml
        env:
          AIEVALUATOR_API_KEY: ${{ secrets.AI_EVALUATOR_API_KEY }}
```

1. Save it as `.github/workflows/ai-eval.yml`
2. Add `AI_EVALUATOR_API_KEY` to your GitHub secrets
3. Push — **every PR is now evaluated automatically**

---

## 7. Daily Workflow Example

Here's how a typical session looks:

```
1. Open your agent code                         # src/agent/chat.py
2. Write a new prompt variation                 # "What is our return policy?"
3. Select the prompt text                       # Highlight it
4. Right-click → Evaluate selection             # Ctrl+Shift+P also works
5. See score: 89% ✅                            # Try different phrasings
6. When satisfied — commit                      # The eval lives with your code
```

---

## 8. Keyboard Shortcuts

| Action | Windows/Linux | Mac |
|---|---|---|
| Evaluate selection | `Ctrl+Shift+E` `Ctrl+Shift+V` | `Cmd+Shift+E` `Cmd+Shift+V` |
| Set API Key | — via Command Palette | — via Command Palette |
| Generate CI/CD Snippet | — via Command Palette | — via Command Palette |

> 💡 You can **customize shortcuts**: `Ctrl+K Ctrl+S` → search "AI Evaluator".

---

## 9. Troubleshooting

### "No active editor"

Open a file before running the evaluation. Any text file works.

### "HTTP 429 — Daily limit reached"

You've used your 5 free playground evals. Options:
- Wait until midnight UTC (resets automatically)
- Sign up with `AI Evaluator: Set API Key` → 100 free evals/month

### "HTTP 500"

The engine is having issues. Check status at [aievaluator.dev](https://aievaluator.dev).

### Extension not visible

1. Check the activity bar — 🧪 icon on the left
2. If not visible: right-click the activity bar → **"AI Evaluator"** is checked
3. If icon is missing after install: `Ctrl+Shift+P` → **"Developer: Reload Window"**

---

## 10. What's Next

| Tool | What it gives you |
|---|---|
| [AI Evaluator CLI](https://gitlab.com/aievaluator/aievaluator-cli) | Terminal commands for CI/CD |
| [AI Evaluator Dashboard](https://aievaluator.dev) | Full platform: history, reports, teams |
| [GitHub Action](https://github.com/marketplace/actions/ai-evaluator) | Drop-in CI/CD eval step |

---

**Happy evaluating! 🧪**

[Report an issue](https://gitlab.com/aievaluator/aievaluator-cli/-/issues) · [Docs](https://aievaluator.dev/tutorials)

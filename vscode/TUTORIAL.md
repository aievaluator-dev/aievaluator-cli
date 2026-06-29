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

**Done!** You'll see the AI icon in the activity bar (left sidebar).

---

## 2. Initialize Your Project

Start by setting up the example files:

1. Open VS Code in your project folder
2. Click the **AI Evaluator** icon in the activity bar
3. In the sidebar, click **📁 Init eval project**

This creates:

```
your-project/
├── evals/
│   ├── smoke-test.json       ← 5 example queries (JSON array)
│   ├── smoke-test.jsonl      ← Same queries (JSONL format)
│   └── smoke-test-rag.json   ← 3 queries with context for RAG metrics
├── results/                  ← Output for saved evaluation results
└── aievaluator.config.json   ← Project configuration
```

---

## 3. Your First Evaluation (no signup)

The extension works **without an API key** in playground mode — 5 free evals/day.

### Quick eval from selection

1. Open any file and **highlight** text:

   ```
   What is the capital of France?
   ```

2. Click **▶ Quick eval (selection)** in the sidebar
3. Pick your agent (internal or custom URL)
4. Select metrics and set thresholds
5. Click **▶ Run Evaluation**

The result appears in the **Recent** panel. Click it to expand and see the agent's response.

> 💡 **Tip:** You can also right-click → **AI Evaluator: Evaluate from editor**.

---

## 4. Evaluating a Dataset

### Pick a dataset file

1. In the sidebar, click **📋 Evaluate dataset file…**
2. A list of all `.json` and `.jsonl` files in your workspace appears
3. Select `smoke-test.json`

### Configure and run

1. Choose your agent (internal or custom URL)
2. Select which metrics to use (check the ones you want)
3. Set thresholds per metric
4. Optionally provide an expected output
5. Click **▶ Run Evaluation**

### Results panel

After evaluation, a rich results panel opens showing:

- **Overall score** (e.g. `40% ❌`) with pass/fail status
- **Per-query results** — click any row to expand:
  - 🤖 Agent Response — what the agent actually said
  - 📊 Metrics — each metric with **score** and **detailed reason** from the judge
- **Save results as file** — tick the checkbox, set a filename, click 💾 Save
- **Expand All / Collapse All** — toggle all details at once

Saved results go to the `results/` folder in your workspace.

---

## 5. Custom Evaluators

Define your own LLM-as-a-Judge criteria:

### Creating one

1. In the sidebar, find **🔧 Custom Evaluators**
2. Click **+ Add Custom Evaluator**
3. Enter a **name** (e.g. `politeness`) — Enter
4. A panel opens with a full **textarea** — write your evaluation prompt:

   ```
   Is the response polite and professional?
   Answer YES or NO and explain why.
   ```

5. Optional: tick **Save prompt as file** to export it to `evals/politeness-custom_eval.md`
6. Set a **threshold** (default: 0.8)

Your custom evaluator appears listed in the sidebar. Click ✕ to remove it.

### Using custom evaluators

Custom evaluators require an **API key** (they're sent to the eval endpoint). Once your key is set, custom evaluators appear in the metrics picker when evaluating.

---

## 6. Setting Your API Key

An API key unlocks advanced metrics, custom evaluators, and 100 free evals/month:

1. Go to [aievaluator.dev](https://www.aievaluator.dev) → **Sign up**
2. Go to **Settings → API Keys** → **Create key**
3. Copy your key
4. In VS Code sidebar: **🔑 Settings → Set API Key**
5. Paste your key → **Enter**

```
✅ API key saved
```

Your key is stored in VS Code's **secrets storage** (encrypted, per-profile).

---

## 7. Generating a CI/CD Workflow

Turn your evals into a CI quality gate:

1. Sidebar → **🔑 Settings → 📊 Open Dashboard**
2. Or: `Ctrl+Shift+P` → **"AI Evaluator: Generate CI/CD Snippet"**
3. Enter your dataset path (default: `./evals/regression.json`)
4. A new editor tab opens with a ready-to-use GitHub Actions workflow

```yaml
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

Add `AI_EVALUATOR_API_KEY` to your GitHub secrets and push — **every PR is evaluated**.

---

## 8. Sidebar Reference

| Section | What it does |
|---|---|
| **📂 Evaluate** | Quick eval from selection, or pick a dataset file |
| **🔧 Custom Evaluators** | Create, view, and delete your own evaluation criteria |
| **🔑 Settings** | Set API Key, open Dashboard |
| **📖 Docs** | Link to tutorials and documentation |
| **📋 Recent** | Expandable history — click to see agent response + per-metric scores |

---

## 9. Daily Workflow Example

```
1. Open your agent code                          # src/agent/chat.py
2. Write a new prompt variation                  # "What is our return policy?"
3. Select the prompt text                        # Highlight it
4. Click ▶ Quick eval in the sidebar             # Instant feedback
5. See score + response in Recent                # Click to expand details
6. Evaluate the full dataset                     # 📋 Evaluate dataset file…
7. Review results in the Results Panel            # Per-metric scores + reasons
8. Save results if needed                        # 💾 Save to results/
9. When satisfied — commit                       # The evals live with your code
```

---

## 10. Troubleshooting

### "No active editor"

Open a file before running the evaluation. Any text file works.

### "Daily limit reached"

You've used your 5 free playground evals. Options:
- Wait until midnight UTC (resets automatically)
- Click **Get API Key** in the error message → sign up for 100 free evals/month

### Custom evaluators not showing in metrics list

Custom evaluators require an API key. Set your key in **🔑 Settings → Set API Key**, then they'll appear.

### "Local URLs are not reachable"

The cloud engine can't reach `localhost` or `127.0.0.1`. Use a public URL or a tunnel like ngrok for local agents.

### Extension icon not visible

1. Check the activity bar — AI icon on the left
2. Right-click the activity bar → **"AI Evaluator"** is checked
3. `Ctrl+Shift+P` → **"Developer: Reload Window"**

---

## 11. What's Next

| Tool | What it gives you |
|---|---|
| [AI Evaluator CLI](https://gitlab.com/aievaluator/aievaluator-cli) | Terminal commands for CI/CD |
| [AI Evaluator Dashboard](https://aievaluator.dev) | Full platform: history, reports, teams |
| [GitHub Action](https://github.com/marketplace/actions/ai-evaluator) | Drop-in CI/CD eval step |

---

**Happy evaluating! 🧪**

[Report an issue](https://gitlab.com/aievaluator/aievaluator-cli/-/issues) · [Docs](https://aievaluator.dev/tutorials)

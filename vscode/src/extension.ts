// AI Evaluator VS Code Extension
import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
  console.log('AI Evaluator extension activated');

  // Command: evaluate selection
  context.subscriptions.push(
    vscode.commands.registerCommand('aievaluator.evaluateSelection', () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;

      const selection = editor.document.getText(editor.selection);
      if (!selection) {
        vscode.window.showWarningMessage('No text selected');
        return;
      }

      vscode.window.showInformationMessage(`AI Evaluator: coming soon. Selected ${selection.length} chars.`);
    })
  );

  // Command: set API key
  context.subscriptions.push(
    vscode.commands.registerCommand('aievaluator.setAPIKey', async () => {
      const key = await vscode.window.showInputBox({
        prompt: 'Enter your AI Evaluator API key',
        placeHolder: 'sk-...',
        password: true,
      });
      if (key) {
        await context.secrets.store('aievaluator.apiKey', key);
        vscode.window.showInformationMessage('API key saved');
      }
    })
  );

  // Sidebar provider (placeholder)
  const provider = new SidebarProvider();
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('aievaluator.sidebar', provider)
  );
}

class SidebarProvider implements vscode.WebviewViewProvider {
  resolveWebviewView(webviewView: vscode.WebviewView) {
    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.html = `
      <html>
        <body>
          <h3>AI Evaluator 🧪</h3>
          <p>Coming soon. Evaluate your agents from VS Code.</p>
        </body>
      </html>
    `;
  }
}

export function deactivate() {}

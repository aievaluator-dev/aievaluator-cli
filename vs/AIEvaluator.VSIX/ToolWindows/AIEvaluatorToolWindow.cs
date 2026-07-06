using System;
using System.Runtime.InteropServices;
using Microsoft.VisualStudio.Shell;

namespace AIEvaluator.VSIX.ToolWindows
{
    [Guid("8c7ef0a3-1b5d-4e6f-9d3a-2c0b5f7e8a1d")]
    public class AIEvaluatorToolWindow : ToolWindowPane
    {
        public AIEvaluatorToolWindow() : base(null!)
        {
            this.Caption = "AI Evaluator";
            this.Content = new Controls.AIEvaluatorControl();
        }
    }
}

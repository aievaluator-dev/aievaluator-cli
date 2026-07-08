#!/bin/bash
# ============================================================
# GUION 05 — Levantar para grabar video de CI/CD completo
# Abre todo listo: proyecto y VSCode con el plugin
# ============================================================
set -e
cd "$(dirname "$0")"

PROJECT="/home/franco/cosas/ia_evaluator"

echo "============================================"
echo " GUION 05 — Entorno completo para grabar"
echo "============================================"
echo ""

# Verificar compilado
if [ ! -f "out/extension.js" ]; then
    echo "❌ Ejecutá primero: ./guion-01-preparar.sh"
    exit 1
fi

echo "🚀 Abriendo el proyecto en Code Insiders..."
echo ""

# Abrir el proyecto completo
code-insiders "$PROJECT"

echo ""
echo "============================================"
echo " PASOS PARA GRABAR:"
echo "============================================"
echo ""
echo " 1. Presioná F5 → se abre [Extension Development Host]"
echo " 2. En la nueva ventana, hacé Init project desde la sidebar"
echo " 3. Ya tenés acceso a evals/ y results/"
echo ""
echo " 4. Seguí el orden de escenas del GUION 03"
echo ""
echo " 📁 Datasets de ejemplo (se crean con Init):"
echo "    evals/smoke-test.json"
echo "    evals/smoke-test.jsonl"
echo "    evals/smoke-test-rag.json"
echo ""
echo " 🎥 Ctrl+Shift+Alt+R para grabar pantalla en VSCode"
echo "============================================"

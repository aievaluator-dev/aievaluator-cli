#!/bin/bash
# ============================================================
# GUION 02 — Abrir VSCode con el plugin cargado
# Ventana limpia [Extension Development Host] lista para grabar
# ============================================================
set -e
cd "$(dirname "$0")"

echo "============================================"
echo " GUION 02 — Abrir VSCode con el plugin"
echo "============================================"
echo ""

# Verificar que esté compilado
if [ ! -f "out/extension.js" ]; then
    echo "❌ out/extension.js no existe. Ejecutá primero: ./guion-01-preparar.sh"
    exit 1
fi

PROJECT_DIR="/home/franco/cosas/ia_evaluator"

echo "🚀 Abriendo VS Code Insiders con el plugin..."
echo "   Se abre el proyecto para tener acceso a los datasets."
echo ""

code-insiders "$(pwd)"

echo ""
echo "============================================"
echo " AHORA HACÉ ESTO:"
echo "============================================"
echo ""
echo " 1. En la ventana de Code Insiders, presioná F5"
echo " 2. Se abre ventana nueva: [Extension Development Host]"
echo " 3. En esa ventana nueva, hacé Init project desde la sidebar"
echo "    (📁 Init eval project en 📂 Evaluate)"
echo ""
echo " 4. Ya tenés el plugin cargado (icono AI a la izquierda)"
echo " 5. Empezá a grabar → GUION 03"
echo ""
echo " ⚠️  Grabá la ventana [Extension Development Host],"
echo "    no la ventana original de Code Insiders."
echo "============================================"

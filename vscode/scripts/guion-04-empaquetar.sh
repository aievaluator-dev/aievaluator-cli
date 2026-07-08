#!/bin/bash
# ============================================================
# GUION 04 — Empaquetar el .vsix para distribuir
# Por si necesitás regenerar el .vsix antes de publicar
# ============================================================
set -e
cd "$(dirname "$0")"

echo "============================================"
echo " GUION 04 — Empaquetar .vsix"
echo "============================================"
echo ""

# Verificar compilado
if [ ! -f "out/extension.js" ]; then
    echo "❌ out/extension.js no existe. Ejecutá primero: ./guion-01-preparar.sh"
    exit 1
fi

# Verificar que vsce esté instalado
if ! npx vsce --version &>/dev/null; then
    echo "📦 Instalando vsce..."
    npm install -g @vscode/vsce
fi

echo "📦 Empaquetando extensión..."
npx vsce package

echo ""
echo "✅ .vsix generado en esta carpeta."
echo ""
echo "   Para instalar en VSCode normal:"
echo "   code --install-extension aievaluator-*.vsix"
echo ""
echo "   Para publicar en Marketplace:"
echo "   npx vsce publish"
echo "============================================"

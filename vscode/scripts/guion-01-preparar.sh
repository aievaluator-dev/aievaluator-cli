#!/bin/bash
# ============================================================
# GUION 01 — Preparar el entorno
# Instalar dependencias, compilar, verificar que todo funciona
# ============================================================
set -e
cd "$(dirname "$0")"

echo "============================================"
echo " GUION 01 — Preparar el entorno"
echo "============================================"
echo ""

# 1. Instalar dependencias
echo "📦 Paso 1/3: Instalando dependencias npm..."
npm install
echo ""

# 2. Compilar TypeScript
echo "🔨 Paso 2/3: Compilando TypeScript..."
npm run compile
echo ""

# 3. Verificar que compiló bien
echo "🔍 Paso 3/3: Verificando archivos compilados..."
if [ -f "out/extension.js" ]; then
    echo "   ✅ out/extension.js existe"
else
    echo "   ❌ ERROR: No se generó out/extension.js"
    exit 1
fi

echo ""
echo "============================================"
echo " ✅ Entorno listo. Pasá al GUION 02."
echo "============================================"

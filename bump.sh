#!/usr/bin/env bash
set -euo pipefail

# bump.sh — Bump version for a specific language CLI
# Usage: ./bump.sh <lang> <level>
#   lang:  python | node | dotnet | go | vscode
#   level: patch | minor | major

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

usage() {
  echo "Usage: ./bump.sh <lang> <level>"
  echo "  lang:  python | node | dotnet | go | vscode"
  echo "  level: patch | minor | major"
  exit 1
}

# ── Args ─────────────────────────────────────────────────────────────
LANG="${1:-}"
LEVEL="${2:-}"

if [[ -z "$LANG" || -z "$LEVEL" ]]; then
  usage
fi

case "$LEVEL" in
  patch|minor|major) ;;
  *) echo -e "${RED}Error: level must be patch, minor, or major${NC}"; usage ;;
esac

# ── Paths ────────────────────────────────────────────────────────────
ROOT="$(cd "$(dirname "$0")" && pwd)"
VERSION_FILE="$ROOT/$LANG/VERSION"

if [[ ! -f "$VERSION_FILE" ]]; then
  echo -e "${RED}Error: $VERSION_FILE not found. Valid langs: python, node, dotnet, go, vscode${NC}"
  exit 1
fi

# ── Package-specific version file ────────────────────────────────────
case "$LANG" in
  python) PKG_FILE="$ROOT/python/pyproject.toml" ;;
  node)   PKG_FILE="$ROOT/node/package.json" ;;
  dotnet) PKG_FILE="$ROOT/dotnet/src/aievaluator.csproj" ;;
  go)     PKG_FILE="" ;;  # Go uses git tags, no version in go.mod
  vscode) PKG_FILE="$ROOT/vscode/package.json" ;;
esac

# ── Read current version ─────────────────────────────────────────────
CURRENT=$(cat "$VERSION_FILE")
if [[ ! "$CURRENT" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo -e "${RED}Error: invalid version in $VERSION_FILE: $CURRENT${NC}"
  exit 1
fi

# ── Bump semver ──────────────────────────────────────────────────────
IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT"

case "$LEVEL" in
  major)
    MAJOR=$((MAJOR + 1))
    MINOR=0
    PATCH=0
    ;;
  minor)
    MINOR=$((MINOR + 1))
    PATCH=0
    ;;
  patch)
    PATCH=$((PATCH + 1))
    ;;
esac

NEW="$MAJOR.$MINOR.$PATCH"
TAG="${LANG}-v${NEW}"

# ── Pre-flight checks ────────────────────────────────────────────────
# Check for uncommitted changes
if ! git diff-index --quiet HEAD --; then
  echo -e "${RED}Error: uncommitted changes. Commit or stash them first.${NC}"
  exit 1
fi

# Check tag doesn't exist
if git rev-parse "$TAG" >/dev/null 2>&1; then
  echo -e "${RED}Error: tag $TAG already exists.${NC}"
  exit 1
fi

# Verify version consistency (VERSION file vs package file)
if [[ -n "$PKG_FILE" ]]; then
  if [[ "$LANG" == "python" ]]; then
    PKG_VERSION=$(grep -oP 'version\s*=\s*"\K[^"]+' "$PKG_FILE")
  elif [[ "$LANG" == "node" || "$LANG" == "vscode" ]]; then
    PKG_VERSION=$(grep -oP '"version"\s*:\s*"\K[^"]+' "$PKG_FILE")
  elif [[ "$LANG" == "dotnet" ]]; then
    PKG_VERSION=$(grep -oP '<Version>\K[^<]+' "$PKG_FILE")
  fi
  if [[ "$PKG_VERSION" != "$CURRENT" ]]; then
    echo -e "${YELLOW}Warning: $VERSION_FILE ($CURRENT) differs from package version ($PKG_VERSION). Using VERSION file.${NC}"
  fi
fi

# ── Confirm ──────────────────────────────────────────────────────────
echo ""
echo -e "  Lang:    ${GREEN}$LANG${NC}"
echo -e "  Version: ${RED}$CURRENT${NC} → ${GREEN}$NEW${NC}"
echo -e "  Tag:     ${GREEN}$TAG${NC}"
echo ""
read -rp "Bump and push? [y/N] " CONFIRM
if [[ "$CONFIRM" != "y" && "$CONFIRM" != "Y" ]]; then
  echo "Aborted."
  exit 0
fi

# ── Apply bump ───────────────────────────────────────────────────────

# 1. Update VERSION file
echo "$NEW" > "$VERSION_FILE"

# 2. Update package-specific file
if [[ -n "$PKG_FILE" ]]; then
  if [[ "$LANG" == "python" ]]; then
    sed -i "s/version = \"$CURRENT\"/version = \"$NEW\"/" "$PKG_FILE"
  elif [[ "$LANG" == "node" || "$LANG" == "vscode" ]]; then
    sed -i "s/\"version\": \"$CURRENT\"/\"version\": \"$NEW\"/" "$PKG_FILE"
  elif [[ "$LANG" == "dotnet" ]]; then
    sed -i "s/<Version>$CURRENT<\/Version>/<Version>$NEW<\/Version>/" "$PKG_FILE"
  fi
fi

# 3. Commit
git add "$VERSION_FILE" ${PKG_FILE:+"$PKG_FILE"}
git commit -m "release($LANG): bump to $NEW"

# 4. Tag
git tag -a "$TAG" -m "$LANG v$NEW"

# 5. Push
echo ""
echo -e "${GREEN}Pushing commit + tag to origin and github...${NC}"
git push origin master
git push origin "$TAG"
git push github master
git push github "$TAG"

echo ""
echo -e "${GREEN}✅ $LANG bumped to $NEW — tag $TAG pushed.${NC}"
echo -e "   CI will detect $TAG and publish automatically."

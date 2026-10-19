#!/bin/zsh
# One-time setup on a Mac (Apple silicon): Bun deps + build, ML tools, the background server, the app.
# Expects this repo at ~/Library/Application Support/Cut Studio/hyperframes (the app's default StudioDir).
set -e
REPO="$(cd "$(dirname "$0")/.." && pwd)"
SUPPORT="$HOME/Library/Application Support/Cut Studio"
ML="$SUPPORT/ml"
command -v bun >/dev/null || curl -fsSL https://bun.sh/install | bash
export PATH="$HOME/.bun/bin:$PATH"
cd "$REPO" && bun install
bun run --filter '@hyperframes/{parsers,lint,studio-server}' build
bun run --filter @hyperframes/core build
mkdir -p "$ML/stabilize"
cp "$REPO/navy-cut/ml/"*.py "$ML/"
cp "$REPO/navy-cut/ml/stabilize/main.swift" "$ML/stabilize/"
swiftc -O -o "$ML/cut-stabilize" "$ML/stabilize/main.swift"
[ -x "$ML/.venv/bin/python" ] || /opt/homebrew/bin/python3 -m venv "$ML/.venv"
"$ML/.venv/bin/pip" install -q -r "$REPO/navy-cut/ml/requirements.txt"
PLIST="$HOME/Library/LaunchAgents/com.navyansh.navycut.server.plist"
sed -e "s#__BUN__#$HOME/.bun/bin/bun#" -e "s#__STUDIO__#$REPO/packages/studio#" -e "s#__HOME__#$HOME#g" \
  "$REPO/navy-cut/com.navyansh.navycut.server.plist" > "$PLIST"
"$REPO/navy-cut/app/build.sh"
echo "Done. Open Navy Cut from /Applications (drag it to the Dock)."

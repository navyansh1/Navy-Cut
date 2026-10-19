#!/bin/zsh
# Builds "Navy Cut.app" into /Applications and registers it with Launch Services.
set -e
cd "$(dirname "$0")"
REPO="$(cd ../.. && pwd)"
APP="/Applications/Navy Cut.app"
B=build; rm -rf $B; mkdir -p $B/AppIcon.iconset
swiftc -O -o $B/icon icon.swift
$B/icon $B/icon1024.png
for s in 16 32 128 256 512; do
  sips -z $s $s $B/icon1024.png --out $B/AppIcon.iconset/icon_${s}x${s}.png >/dev/null
  sips -z $((s*2)) $((s*2)) $B/icon1024.png --out $B/AppIcon.iconset/icon_${s}x${s}@2x.png >/dev/null
done
iconutil -c icns $B/AppIcon.iconset -o $B/AppIcon.icns
swiftc -O -framework AppKit -framework WebKit -o "$B/Navy Cut" main.swift
rm -rf "$APP"; mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp Info.plist "$APP/Contents/"
cp "$B/Navy Cut" "$APP/Contents/MacOS/"
cp $B/AppIcon.icns "$APP/Contents/Resources/"
GSAP=$(find "$REPO/node_modules" -path '*gsap/dist/gsap.min.js' | head -1)
[ -n "$GSAP" ] && cp "$GSAP" "$APP/Contents/Resources/gsap.min.js"
codesign --force --deep --sign - "$APP"
/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f "$APP"
echo "built $APP"

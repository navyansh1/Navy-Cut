// Navy Cut app icon: bright red→orange→yellow tile, white timeline clips, a navy playhead.
import AppKit
let out = CommandLine.arguments[1]
let S: CGFloat = 1024
let img = NSImage(size: NSSize(width: S, height: S))
img.lockFocus()
let tile = NSBezierPath(roundedRect: NSRect(x: 100, y: 100, width: 824, height: 824), xRadius: 185, yRadius: 185)
// deep navy base
NSGradient(colors: [
  NSColor(calibratedRed: 0.13, green: 0.17, blue: 0.32, alpha: 1),
  NSColor(calibratedRed: 0.05, green: 0.07, blue: 0.15, alpha: 1),
])!.draw(in: tile, angle: -90)
NSColor(calibratedWhite: 1, alpha: 0.10).setStroke(); tile.lineWidth = 4; tile.stroke()
func clip(_ x: CGFloat, _ y: CGFloat, _ w: CGFloat, _ c: NSColor) {
  let p = NSBezierPath(roundedRect: NSRect(x: x, y: y, width: w, height: 112), xRadius: 26, yRadius: 26)
  c.setFill(); p.fill()
}
let sh = NSShadow(); sh.shadowColor = NSColor(calibratedWhite: 0, alpha: 0.45)
sh.shadowOffset = NSSize(width: 0, height: -10); sh.shadowBlurRadius = 24; sh.set()
clip(220, 600, 400, NSColor(calibratedRed: 1.00, green: 0.80, blue: 0.12, alpha: 1))   // yellow
clip(270, 450, 520, NSColor(calibratedRed: 1.00, green: 0.48, blue: 0.14, alpha: 1))   // orange
clip(200, 300, 580, NSColor(calibratedRed: 0.93, green: 0.20, blue: 0.22, alpha: 1))   // red
NSColor.white.setFill()
NSBezierPath(roundedRect: NSRect(x: 556, y: 220, width: 22, height: 590), xRadius: 11, yRadius: 11).fill()
let head = NSBezierPath(); head.move(to: NSPoint(x: 517, y: 820)); head.line(to: NSPoint(x: 617, y: 820)); head.line(to: NSPoint(x: 567, y: 762)); head.close(); head.fill()
img.unlockFocus()
let rep = NSBitmapImageRep(data: img.tiffRepresentation!)!
try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: out))

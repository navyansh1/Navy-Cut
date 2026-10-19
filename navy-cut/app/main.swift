// Navy Cut — a native window for the Navy Cut fork of HyperFrames Studio.
// Starts the local Studio server (from the source checkout), shows it in a WKWebView,
// and opens projects: .navycut (or older .cutstudio) files or project folders (double-click, drag onto the
// Dock icon, or File > Open…).
import AppKit
import WebKit

let defaults = UserDefaults.standard
let home = FileManager.default.homeDirectoryForCurrentUser.path
let studioDir = defaults.string(forKey: "StudioDir")
  ?? "\(home)/Library/Application Support/Cut Studio/hyperframes/packages/studio"
let port = 5190
let base = URL(string: "http://127.0.0.1:\(port)/")!
let logPath = "\(home)/Library/Logs/Navy Cut.log"

final class AppDelegate: NSObject, NSApplicationDelegate, WKUIDelegate, WKNavigationDelegate, WKDownloadDelegate, WKScriptMessageHandler {
  var window: NSWindow!
  var web: WKWebView!
  var pendingProject: String?
  var ready = false

  func applicationDidFinishLaunching(_ note: Notification) {
    buildMenu()
    let config = WKWebViewConfiguration()
    config.websiteDataStore = .default()
    config.mediaTypesRequiringUserActionForPlayback = []
    config.preferences.isElementFullscreenEnabled = true
    // One unified bar: Studio's header sits beside the traffic lights.
    let css = "html.cut-studio-app [data-studio-header]{padding-left:84px!important}"
    let js = "document.documentElement.classList.add('cut-studio-app');" +
      "var s=document.createElement('style');s.textContent='\(css)';document.documentElement.appendChild(s);"
    config.userContentController.add(self, name: "navycut")
    config.userContentController.addUserScript(
      WKUserScript(source: js, injectionTime: .atDocumentStart, forMainFrameOnly: true))
    web = WKWebView(frame: .zero, configuration: config)
    web.uiDelegate = self
    web.navigationDelegate = self
    web.allowsMagnification = false
    web.setValue(false, forKey: "drawsBackground")

    window = NSWindow(
      contentRect: NSRect(x: 0, y: 0, width: 1600, height: 1000),
      styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView],
      backing: .buffered, defer: false)
    window.title = "Navy Cut"
    window.titlebarAppearsTransparent = true
    window.titleVisibility = .hidden
    window.appearance = NSAppearance(named: .darkAqua)
    window.backgroundColor = NSColor(calibratedRed: 0.125, green: 0.122, blue: 0.118, alpha: 1)
    let toolbar = NSToolbar(identifier: "NavyCutBar")
    toolbar.showsBaselineSeparator = false
    window.toolbar = toolbar
    window.toolbarStyle = .unifiedCompact
    let container = NSView()
    web.translatesAutoresizingMaskIntoConstraints = false
    let drag = DragStrip()
    drag.translatesAutoresizingMaskIntoConstraints = false
    container.addSubview(web)
    container.addSubview(drag)
    NSLayoutConstraint.activate([
      web.leadingAnchor.constraint(equalTo: container.leadingAnchor),
      web.trailingAnchor.constraint(equalTo: container.trailingAnchor),
      web.topAnchor.constraint(equalTo: container.topAnchor),
      web.bottomAnchor.constraint(equalTo: container.bottomAnchor),
      // Empty middle of the header: drag to move, double-click to zoom. Buttons on the right stay clickable.
      drag.leadingAnchor.constraint(equalTo: container.leadingAnchor, constant: 300),
      drag.trailingAnchor.constraint(equalTo: container.trailingAnchor, constant: -340),
      drag.topAnchor.constraint(equalTo: container.topAnchor),
      drag.heightAnchor.constraint(equalToConstant: 40),
    ])
    window.contentView = container
    window.setFrameAutosaveName("NavyCutMain")
    window.center()
    window.makeKeyAndOrderFront(nil)
    showSplash("Starting Navy Cut…")
    startServerIfNeeded()
  }

  func applicationShouldTerminateAfterLastWindowClosed(_ app: NSApplication) -> Bool { true }

  // Double-clicked .navycut files, folders dropped on the Dock icon, File > Open.
  func application(_ app: NSApplication, open urls: [URL]) {
    for url in urls { openProject(at: url) }
  }

  func openProject(at url: URL) {
    var dir = url
    var title = url.deletingPathExtension().lastPathComponent
    if !["navycut", "cutstudio"].contains(url.pathExtension) {
      // A generic folder name ("video") borrows its parent's name.
      title = ["video", "project", "src"].contains(url.lastPathComponent.lowercased())
        ? url.deletingLastPathComponent().lastPathComponent : url.lastPathComponent
    }
    if ["navycut", "cutstudio"].contains(url.pathExtension),
       let data = try? Data(contentsOf: url),
       let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
       let path = json["path"] as? String {
      dir = URL(fileURLWithPath: path, relativeTo: url.deletingLastPathComponent()).standardizedFileURL
    }
    // Only folders chosen in Open… are checked here; a .navycut file is trusted, so the app itself
    // never reads inside Desktop (the server, which holds that permission, does).
    if !["navycut", "cutstudio"].contains(url.pathExtension),
       !FileManager.default.fileExists(atPath: dir.appendingPathComponent("index.html").path) {
      alert("Not a Navy Cut project", "“\(dir.lastPathComponent)” has no index.html.")
      return
    }
    let name = title.lowercased()
      .replacingOccurrences(of: "[^a-z0-9]+", with: "-", options: .regularExpression)
      .trimmingCharacters(in: CharacterSet(charactersIn: "-"))
    let link = "\(studioDir)/data/projects/\(name)"
    try? FileManager.default.createDirectory(atPath: "\(studioDir)/data/projects", withIntermediateDirectories: true)
    if let dest = try? FileManager.default.destinationOfSymbolicLink(atPath: link), dest != dir.path {
      try? FileManager.default.removeItem(atPath: link)
    }
    if !FileManager.default.fileExists(atPath: link) {
      try? FileManager.default.createSymbolicLink(atPath: link, withDestinationPath: dir.path)
    }
    // Leave a double-clickable project file next to the folder.
    let marker = ["navycut", "cutstudio"].contains(url.pathExtension) ? url
      : dir.deletingLastPathComponent().appendingPathComponent("\(title).navycut")
    if !["navycut", "cutstudio"].contains(url.pathExtension) && !FileManager.default.fileExists(atPath: marker.path) {
      let json = "{\n  \"path\": \"\(dir.lastPathComponent)\"\n}\n"
      try? json.write(to: marker, atomically: true, encoding: .utf8)
    }
    NSDocumentController.shared.noteNewRecentDocumentURL(marker)
    recordRecent(id: name, title: title, dir: dir.path, marker: marker.path)
    window?.title = title
    if ready { load(project: name) } else { pendingProject = name }
  }

  // Recent projects for the in-editor project picker (read by the server at /api/cut/recent-projects).
  static let registry = "\(home)/Library/Application Support/Cut Studio/recent-projects.json"
  func recordRecent(id: String, title: String, dir: String, marker: String) {
    var list = (try? JSONSerialization.jsonObject(with: Data(contentsOf: URL(fileURLWithPath: AppDelegate.registry)))) as? [[String: Any]] ?? []
    list.removeAll { ($0["id"] as? String) == id }
    list.insert(["id": id, "title": title, "dir": dir, "marker": marker, "opened": Date().timeIntervalSince1970], at: 0)
    if let data = try? JSONSerialization.data(withJSONObject: Array(list.prefix(20)), options: [.prettyPrinted]) {
      try? data.write(to: URL(fileURLWithPath: AppDelegate.registry))
    }
  }

  // Messages from the editor page: open / new project, open a recent one.
  func userContentController(_ c: WKUserContentController, didReceive message: WKScriptMessage) {
    guard let body = message.body as? [String: Any], let action = body["action"] as? String else { return }
    switch action {
    case "open": openPanel()
    case "new": newProject(vertical: (body["aspect"] as? String) == "9:16")
    case "recent":
      if let marker = body["marker"] as? String, FileManager.default.fileExists(atPath: marker) {
        openProject(at: URL(fileURLWithPath: marker))
      } else if let dir = body["dir"] as? String {
        openProject(at: URL(fileURLWithPath: dir))
      }
    default: break
    }
  }

  /// New Project: pick a name and place, get a folder with an empty Timeline 1 and a .navycut file beside it.
  func newProject(vertical: Bool) {
    let panel = NSSavePanel()
    panel.title = vertical ? "New Vertical Project (9:16)" : "New Project (16:9)"
    panel.nameFieldStringValue = "Untitled Project"
    panel.directoryURL = URL(fileURLWithPath: "\(home)/Movies")
    guard panel.runModal() == .OK, let url = panel.url else { return }
    let fm = FileManager.default
    let dir = url.deletingPathExtension()
    let (w, h) = vertical ? (1080, 1920) : (1920, 1080)
    do {
      try fm.createDirectory(at: dir.appendingPathComponent("media"), withIntermediateDirectories: true)
      try fm.createDirectory(at: dir.appendingPathComponent("assets/js"), withIntermediateDirectories: true)
      if let gsap = Bundle.main.url(forResource: "gsap.min", withExtension: "js") {
        try? fm.copyItem(at: gsap, to: dir.appendingPathComponent("assets/js/gsap.min.js"))
      }
      let html = """
        <!doctype html>
        <html lang="en">
          <head>
            <meta charset="UTF-8" />
            <meta name="viewport" content="width=\(w), height=\(h)" />
            <script src="assets/js/gsap.min.js"></script>
            <style>
              * { margin: 0; padding: 0; box-sizing: border-box; }
              html, body { margin: 0; width: \(w)px; height: \(h)px; overflow: hidden; background: #000; }
              #root { position: relative; width: 100%; height: 100%; overflow: hidden; }
              #root > video, #root > img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
            </style>
          </head>
          <body>
            <div id="root" data-composition-id="main" data-cut-timeline="Timeline 1" data-width="\(w)" data-height="\(h)" data-duration="10"></div>
            <script>
              const tl = gsap.timeline({ paused: true });
              tl.set({}, {}, 10);
              window.__timelines = window.__timelines || {};
              window.__timelines["main"] = tl;
            </script>
          </body>
        </html>
        """
      try html.write(to: dir.appendingPathComponent("index.html"), atomically: true, encoding: .utf8)
      let marker = dir.deletingLastPathComponent().appendingPathComponent("\(dir.lastPathComponent).navycut")
      try "{\n  \"path\": \"\(dir.lastPathComponent)\"\n}\n".write(to: marker, atomically: true, encoding: .utf8)
      openProject(at: marker)
    } catch {
      alert("Could not create the project", error.localizedDescription)
    }
  }

  func load(project: String?) {
    var url = base
    if let p = project, let enc = p.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) {
      url = URL(string: "http://127.0.0.1:\(port)/#project/\(enc)")!
    }
    web.load(URLRequest(url: url))
  }

  // MARK: server

  /// The server runs as a user LaunchAgent (com.navyansh.navycut.server), not as a child of this app,
  /// so macOS file permissions belong to the stable `bun` binary and survive app updates.
  func startServerIfNeeded() {
    ping { alive in
      if alive { self.serverReady(); return }
      let uid = getuid()
      let label = "com.navyansh.navycut.server"
      let plist = "\(home)/Library/LaunchAgents/\(label).plist"
      self.launchctl(["bootstrap", "gui/\(uid)", plist])   // no-op error if already loaded
      self.launchctl(["kickstart", "gui/\(uid)/\(label)"])
      self.waitForServer(tries: 120)
    }
  }

  func launchctl(_ args: [String]) {
    let p = Process()
    p.executableURL = URL(fileURLWithPath: "/bin/launchctl")
    p.arguments = args
    p.standardOutput = FileHandle.nullDevice
    p.standardError = FileHandle.nullDevice
    try? p.run(); p.waitUntilExit()
  }

  func waitForServer(tries: Int) {
    ping { alive in
      if alive { self.serverReady(); return }
      // Never give up: the first launch can sit behind a macOS privacy prompt.
      if tries == 0 {
        self.showSplash("Still starting… if macOS asks to allow access to a folder, click Allow.<br>Log: ~/Library/Logs/Navy Cut.log")
      }
      DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { self.waitForServer(tries: tries - 1) }
    }
  }

  func serverReady() {
    ready = true
    load(project: pendingProject)
    pendingProject = nil
  }

  func ping(_ done: @escaping (Bool) -> Void) {
    var req = URLRequest(url: base); req.timeoutInterval = 1
    URLSession.shared.dataTask(with: req) { _, res, _ in
      let ok = (res as? HTTPURLResponse)?.statusCode == 200
      DispatchQueue.main.async { done(ok) }
    }.resume()
  }

  func showSplash(_ text: String) {
    web.loadHTMLString("""
      <html><body style="margin:0;height:100vh;display:grid;place-items:center;background:#1c1c1e;
      color:#9a9aa0;font:500 14px -apple-system">\(text)</body></html>
      """, baseURL: nil)
  }

  // MARK: menu

  func buildMenu() {
    let main = NSMenu()
    let appItem = NSMenuItem(); main.addItem(appItem)
    let appMenu = NSMenu()
    appMenu.addItem(withTitle: "About Navy Cut", action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: "")
    appMenu.addItem(.separator())
    appMenu.addItem(withTitle: "Hide Navy Cut", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
    appMenu.addItem(withTitle: "Quit Navy Cut", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
    appItem.submenu = appMenu

    let fileItem = NSMenuItem(); main.addItem(fileItem)
    let fileMenu = NSMenu(title: "File")
    // ⌘N itself is handled by the editor page; this item is for discovery.
    fileMenu.addItem(withTitle: "New Timeline  (⌘N)", action: #selector(newTimeline), keyEquivalent: "")
    fileMenu.addItem(withTitle: "New Project (16:9)…", action: #selector(newWide), keyEquivalent: "")
    fileMenu.addItem(withTitle: "New Vertical Project (9:16)…", action: #selector(newVertical), keyEquivalent: "")
    fileMenu.addItem(withTitle: "Open Project…", action: #selector(openPanel), keyEquivalent: "o")
    let recent = NSMenuItem(title: "Open Recent", action: nil, keyEquivalent: "")
    let recentMenu = NSMenu(title: "Open Recent")
    recentMenu.perform(NSSelectorFromString("_setMenuName:"), with: "NSRecentDocumentsMenu")
    recentMenu.addItem(withTitle: "Clear Menu", action: #selector(NSDocumentController.clearRecentDocuments(_:)), keyEquivalent: "")
    recent.submenu = recentMenu
    fileMenu.addItem(recent)
    fileMenu.addItem(withTitle: "Reload", action: #selector(reload), keyEquivalent: "r")
    fileMenu.addItem(withTitle: "Close Window", action: #selector(NSWindow.performClose(_:)), keyEquivalent: "w")
    fileItem.submenu = fileMenu

    // Edit: standard selectors only, so web content still sees ⌘C/⌘V/⌘Z keydowns first.
    let editItem = NSMenuItem(); main.addItem(editItem)
    let edit = NSMenu(title: "Edit")
    edit.addItem(withTitle: "Cut", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
    edit.addItem(withTitle: "Copy", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
    edit.addItem(withTitle: "Paste", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
    edit.addItem(withTitle: "Select All", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
    editItem.submenu = edit

    let winItem = NSMenuItem(); main.addItem(winItem)
    let win = NSMenu(title: "Window")
    let std = win.addItem(withTitle: "Standard Workspace", action: #selector(standardLayout), keyEquivalent: "0")
    std.keyEquivalentModifierMask = [.command]
    let vert = win.addItem(withTitle: "Vertical Video Workspace", action: #selector(verticalLayout), keyEquivalent: "0")
    vert.keyEquivalentModifierMask = [.command, .option]
    win.addItem(.separator())
    win.addItem(withTitle: "Minimize", action: #selector(NSWindow.performMiniaturize(_:)), keyEquivalent: "m")
    win.addItem(withTitle: "Zoom", action: #selector(NSWindow.performZoom(_:)), keyEquivalent: "")
    win.addItem(withTitle: "Enter Full Screen", action: #selector(NSWindow.toggleFullScreen(_:)), keyEquivalent: "f")
    win.items.last?.keyEquivalentModifierMask = [.command, .control]
    winItem.submenu = win
    NSApp.windowsMenu = win
    NSApp.mainMenu = main
  }

  @objc func reload() { web.reload() }
  @objc func newWide() { newProject(vertical: false) }
  @objc func newVertical() { newProject(vertical: true) }
  @objc func newTimeline() { web.evaluateJavaScript("window.__cutNewTimeline && window.__cutNewTimeline()") }
  @objc func standardLayout() { web.evaluateJavaScript("window.__cutLayout && window.__cutLayout('standard')") }
  @objc func verticalLayout() { web.evaluateJavaScript("window.__cutLayout && window.__cutLayout('vertical')") }

  @objc func openPanel() {
    let panel = NSOpenPanel()
    panel.canChooseDirectories = true
    panel.canChooseFiles = true
    panel.allowedContentTypes = []
    panel.message = "Choose a project folder (with index.html) or a .navycut file"
    if panel.runModal() == .OK, let url = panel.url { openProject(at: url) }
  }

  func alert(_ title: String, _ text: String) {
    let a = NSAlert(); a.messageText = title; a.informativeText = text; a.runModal()
  }

  // MARK: web UI hooks (file pickers, dialogs, downloads, new windows)

  func webView(_ webView: WKWebView, runOpenPanelWith parameters: WKOpenPanelParameters,
               initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping ([URL]?) -> Void) {
    let panel = NSOpenPanel()
    panel.allowsMultipleSelection = parameters.allowsMultipleSelection
    panel.canChooseDirectories = parameters.allowsDirectories
    panel.begin { completionHandler($0 == .OK ? panel.urls : nil) }
  }

  func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String,
               initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
    alert("Navy Cut", message); completionHandler()
  }

  func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String,
               initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
    let a = NSAlert(); a.messageText = message
    a.addButton(withTitle: "OK"); a.addButton(withTitle: "Cancel")
    completionHandler(a.runModal() == .alertFirstButtonReturn)
  }

  func webView(_ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String,
               defaultText: String?, initiatedByFrame frame: WKFrameInfo,
               completionHandler: @escaping (String?) -> Void) {
    let a = NSAlert(); a.messageText = prompt
    let field = NSTextField(frame: NSRect(x: 0, y: 0, width: 260, height: 24))
    field.stringValue = defaultText ?? ""
    a.accessoryView = field
    a.addButton(withTitle: "OK"); a.addButton(withTitle: "Cancel")
    a.window.initialFirstResponder = field
    completionHandler(a.runModal() == .alertFirstButtonReturn ? field.stringValue : nil)
  }

  func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
               for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
    if let url = navigationAction.request.url { NSWorkspace.shared.open(url) }
    return nil
  }

  func webView(_ webView: WKWebView, decidePolicyFor navigationResponse: WKNavigationResponse,
               decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
    let disposition = (navigationResponse.response as? HTTPURLResponse)?
      .value(forHTTPHeaderField: "Content-Disposition") ?? ""
    decisionHandler(disposition.lowercased().hasPrefix("attachment") || !navigationResponse.canShowMIMEType ? .download : .allow)
  }

  func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
               decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
    decisionHandler(navigationAction.shouldPerformDownload ? .download : .allow)
  }

  func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) { download.delegate = self }
  func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) { download.delegate = self }

  // Exports land in ~/Movies/Navy Cut Exports and are revealed in Finder.
  func download(_ download: WKDownload, decideDestinationUsing response: URLResponse,
                suggestedFilename: String, completionHandler: @escaping (URL?) -> Void) {
    let dir = URL(fileURLWithPath: "\(home)/Movies/Navy Cut Exports")
    try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    var dest = dir.appendingPathComponent(suggestedFilename)
    var n = 2
    while FileManager.default.fileExists(atPath: dest.path) {
      let stem = (suggestedFilename as NSString).deletingPathExtension
      let ext = (suggestedFilename as NSString).pathExtension
      dest = dir.appendingPathComponent("\(stem) \(n).\(ext)"); n += 1
    }
    completionHandler(dest)
  }

  func downloadDidFinish(_ download: WKDownload) {
    NSWorkspace.shared.open(URL(fileURLWithPath: "\(home)/Movies/Navy Cut Exports"))
  }
}

/** Transparent strip over the empty middle of the header that moves the window. */
final class DragStrip: NSView {
  override func mouseDown(with event: NSEvent) {
    if event.clickCount == 2 { window?.performZoom(nil) } else { window?.performDrag(with: event) }
  }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()

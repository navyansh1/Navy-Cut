// Cut Studio stabilizer — Apple silicon end to end:
//  pass 1: Vision (VNTranslationalImageRegistrationRequest) measures frame-to-frame camera motion
//  smoothing: the camera path is low-passed; the difference is the shake to remove
//  pass 2: Core Image (Metal) shifts and slightly zooms each frame; VideoToolbox encodes HEVC; audio passes through.
// usage: cut-stabilize <in> <out> <amount 0..100>   (prints {"progress":…,"stage":…} lines)
import AVFoundation
import CoreImage
import Foundation
import Vision

let args = CommandLine.arguments
guard args.count >= 4 else { print("usage: cut-stabilize in out amount"); exit(2) }
let inURL = URL(fileURLWithPath: args[1]), outURL = URL(fileURLWithPath: args[2])
let amount = max(0, min(100, Double(args[3]) ?? 60)) / 100
// Vision's alignment maps the new frame back onto the previous one, so the shake to undo is the
// opposite of the accumulated alignment (verified: jitter 21.7 → 5.8 px on a synthetic handheld clip).
let sign: CGFloat = -1, signY: CGFloat = -1
func progress(_ p: Double, _ s: String) {
  print("{\"progress\":\(String(format: "%.3f", p)),\"stage\":\"\(s)\"}"); fflush(stdout)
}

let asset = AVURLAsset(url: inURL)
let sem = DispatchSemaphore(value: 0)
var vTrack: AVAssetTrack!, aTrack: AVAssetTrack?
var duration = CMTime.zero, fps: Float = 30, size = CGSize.zero, transform = CGAffineTransform.identity
Task {
  vTrack = try! await asset.loadTracks(withMediaType: .video).first!
  aTrack = try? await asset.loadTracks(withMediaType: .audio).first
  duration = try! await asset.load(.duration)
  fps = try! await vTrack.load(.nominalFrameRate)
  size = try! await vTrack.load(.naturalSize)
  transform = try! await vTrack.load(.preferredTransform)
  sem.signal()
}
sem.wait()
let totalFrames = max(1, Double(CMTimeGetSeconds(duration)) * Double(fps))
let ctx = CIContext(options: [.useSoftwareRenderer: false])

// ── pass 1: motion ──
progress(0.01, "Analyzing motion")
let reader1 = try! AVAssetReader(asset: asset)
let out1 = AVAssetReaderTrackOutput(track: vTrack, outputSettings: [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA])
out1.alwaysCopiesSampleData = false
reader1.add(out1); reader1.startReading()
let analysisScale = min(1, 960 / max(size.width, size.height))
var prev: CIImage?
var path: [CGPoint] = [.zero]   // cumulative camera position, in full-resolution pixels
var i = 0
while let sb = out1.copyNextSampleBuffer(), let pb = CMSampleBufferGetImageBuffer(sb) {
  let img = CIImage(cvPixelBuffer: pb).transformed(by: CGAffineTransform(scaleX: analysisScale, y: analysisScale))
  if let p = prev {
    let req = VNTranslationalImageRegistrationRequest(targetedCIImage: img)
    let handler = VNImageRequestHandler(ciImage: p, options: [:])
    var d = CGPoint.zero
    if (try? handler.perform([req])) != nil, let obs = req.results?.first as? VNImageTranslationAlignmentObservation {
      d = CGPoint(x: obs.alignmentTransform.tx / analysisScale, y: obs.alignmentTransform.ty / analysisScale)
    }
    let last = path.last!
    path.append(CGPoint(x: last.x + d.x, y: last.y + d.y))
  }
  prev = img
  i += 1
  if i % 15 == 0 { progress(0.02 + 0.43 * Double(i) / totalFrames, "Analyzing motion") }
}

// ── smoothing: Gaussian low-pass of the camera path; radius grows with amount ──
let radius = max(2, Int(Double(fps) * (0.3 + 1.7 * amount)))   // 0.3 s … 2 s
let sigma = Double(radius) / 2.5
let kernel = (-radius...radius).map { exp(-Double($0 * $0) / (2 * sigma * sigma)) }
var smooth = [CGPoint](repeating: .zero, count: path.count)
for k in 0..<path.count {
  var sx = 0.0, sy = 0.0, w = 0.0
  for (j, kw) in kernel.enumerated() {
    let idx = min(path.count - 1, max(0, k + j - radius))
    sx += kw * Double(path[idx].x); sy += kw * Double(path[idx].y); w += kw
  }
  smooth[k] = CGPoint(x: sx / w, y: sy / w)
}
var corrections = zip(path, smooth).map { CGPoint(x: sign * ($1.x - $0.x), y: signY * ($1.y - $0.y)) }
// Zoom just enough to hide the moved edges (capped at 15 %).
let maxDX = corrections.map { abs($0.x) }.max() ?? 0, maxDY = corrections.map { abs($0.y) }.max() ?? 0
let zoom = min(1.15, max(1.0, 1 + 2 * max(maxDX / size.width, maxDY / size.height)))
let cap = (zoom - 1) * min(size.width, size.height) / 2
corrections = corrections.map { CGPoint(x: max(-cap, min(cap, $0.x)), y: max(-cap, min(cap, $0.y))) }

// ── pass 2: render ──
progress(0.46, "Stabilizing")
try? FileManager.default.removeItem(at: outURL)
let reader2 = try! AVAssetReader(asset: asset)
let out2 = AVAssetReaderTrackOutput(track: vTrack, outputSettings: [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA])
reader2.add(out2)
var audioOut: AVAssetReaderTrackOutput?
if let a = aTrack { let o = AVAssetReaderTrackOutput(track: a, outputSettings: nil); reader2.add(o); audioOut = o }
let writer = try! AVAssetWriter(outputURL: outURL, fileType: .mp4)
let vIn = AVAssetWriterInput(mediaType: .video, outputSettings: [
  AVVideoCodecKey: AVVideoCodecType.hevc,
  AVVideoWidthKey: Int(size.width), AVVideoHeightKey: Int(size.height),
  AVVideoCompressionPropertiesKey: [AVVideoAverageBitRateKey: Int(size.width * size.height * Double(fps) * 0.12)],
])
vIn.transform = transform
vIn.expectsMediaDataInRealTime = false
let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: vIn, sourcePixelBufferAttributes: [
  kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
  kCVPixelBufferWidthKey as String: Int(size.width), kCVPixelBufferHeightKey as String: Int(size.height),
])
writer.add(vIn)
var aIn: AVAssetWriterInput?
if let a = aTrack {
  let fmt = (try? awaitFormat(a))
  let input = AVAssetWriterInput(mediaType: .audio, outputSettings: nil, sourceFormatHint: fmt)
  input.expectsMediaDataInRealTime = false
  writer.add(input); aIn = input
}
func awaitFormat(_ t: AVAssetTrack) throws -> CMFormatDescription? {
  let s = DispatchSemaphore(value: 0); var f: CMFormatDescription?
  Task { f = try? await t.load(.formatDescriptions).first; s.signal() }
  s.wait(); return f
}
reader2.startReading()
writer.startWriting()
writer.startSession(atSourceTime: .zero)
let center = CGPoint(x: size.width / 2, y: size.height / 2)
var n = 0
let group = DispatchGroup()
group.enter()
let vq = DispatchQueue(label: "v")
vIn.requestMediaDataWhenReady(on: vq) {
  while vIn.isReadyForMoreMediaData {
    guard let sb = out2.copyNextSampleBuffer(), let pb = CMSampleBufferGetImageBuffer(sb) else {
      vIn.markAsFinished(); group.leave(); return
    }
    let c = corrections[min(n, corrections.count - 1)]
    // Vision's translation is in image coordinates (origin bottom-left), matching Core Image.
    let t = CGAffineTransform(translationX: c.x, y: c.y)
      .concatenating(CGAffineTransform(translationX: -center.x, y: -center.y))
      .concatenating(CGAffineTransform(scaleX: zoom, y: zoom))
      .concatenating(CGAffineTransform(translationX: center.x, y: center.y))
    let img = CIImage(cvPixelBuffer: pb).transformed(by: t).cropped(to: CGRect(origin: .zero, size: size))
    var outPB: CVPixelBuffer?
    CVPixelBufferPoolCreatePixelBuffer(nil, adaptor.pixelBufferPool!, &outPB)
    ctx.render(img, to: outPB!)
    adaptor.append(outPB!, withPresentationTime: CMSampleBufferGetPresentationTimeStamp(sb))
    n += 1
    if n % 15 == 0 { progress(0.46 + 0.52 * Double(n) / totalFrames, "Stabilizing") }
  }
}
if let aIn, let audioOut {
  group.enter()
  aIn.requestMediaDataWhenReady(on: DispatchQueue(label: "a")) {
    while aIn.isReadyForMoreMediaData {
      guard let sb = audioOut.copyNextSampleBuffer() else { aIn.markAsFinished(); group.leave(); return }
      aIn.append(sb)
    }
  }
}
group.wait()
let done = DispatchSemaphore(value: 0)
writer.finishWriting { done.signal() }
done.wait()
if writer.status != .completed { FileHandle.standardError.write("write failed: \(String(describing: writer.error))\n".data(using: .utf8)!); exit(1) }
progress(1, "Done")

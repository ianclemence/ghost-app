// GhostLocalInferenceModule (iOS): same contract as Android, same shared
// C++ core (compiled via ios/ghost_llama_core.mm). Swift owns
// lifecycle/state/hash; generation calls the C interface declared in
// cpp/ghost_llama.h. The C symbols are bound with @_silgen_name so no
// bridging header is needed; both end up in the same linked binary.
import ExpoModulesCore
import CryptoKit
import Foundation

// MARK: - C core bindings (cpp/ghost_llama.h)

private struct CGenParams {
  var n_ctx: Int32 = 4096
  var n_threads: Int32 = 0
  var n_predict: Int32 = 512
  var seed: Int32 = -1
}

private typealias CTokenCb = @convention(c) (
  UnsafePointer<CChar>?, Int32, UnsafeMutableRawPointer?
) -> Int32

@_silgen_name("ghost_llama_load")
private func cLoad(
  _ path: UnsafePointer<CChar>?,
  _ out: UnsafeMutablePointer<OpaquePointer?>?,
  _ err: UnsafeMutablePointer<CChar>?,
  _ errLen: Int
) -> Int32

@_silgen_name("ghost_llama_free")
private func cFree(_ ctx: OpaquePointer?)

@_silgen_name("ghost_llama_generate")
private func cGenerate(
  _ ctx: OpaquePointer?,
  _ prompt: UnsafePointer<CChar>?,
  _ params: UnsafePointer<CGenParams>?,
  _ cb: CTokenCb?,
  _ userdata: UnsafeMutableRawPointer?,
  _ cancel: UnsafeMutablePointer<Int32>?,
  _ err: UnsafeMutablePointer<CChar>?,
  _ errLen: Int
) -> Int32

private final class GenBox {
  var data = Data()
  weak var module: GhostLocalInferenceModule?
}

private func tokenTrampoline(
  bytes: UnsafePointer<CChar>?, len: Int32, ud: UnsafeMutableRawPointer?
) -> Int32 {
  guard let ud, let bytes else { return 1 }
  let box = Unmanaged<GenBox>.fromOpaque(ud).takeUnretainedValue()
  let chunk = Data(bytes: bytes, count: Int(len))
  box.data.append(chunk)
  if let tok = String(data: chunk, encoding: .utf8) {
    box.module?.sendEvent("token", ["token": tok])
  }
  return 0
}

public class GhostLocalInferenceModule: Module {
  private var ctx: OpaquePointer?
  private var loadedUri: String?
  private var generating = false
  private var cancelFlag: Int32 = 0
  private var state = "unloaded"
  private let queue = DispatchQueue(label: "ghost.localinference", qos: .userInitiated)

  public func definition() -> ModuleDefinition {
    Name("GhostLocalInference")
    Events("token")

    AsyncFunction("isAvailable") { (promise: Promise) in
      promise.resolve(true) // core compiled in; loadModel validates per artifact
    }

    AsyncFunction("backendStatus") { (promise: Promise) in
      promise.resolve([
        "linked": true,
        "state": self.state,
        "loadedModel": self.loadedUri as Any,
        "engine": "llama.cpp (GGUF, shared C++ core)"
      ])
    }

    AsyncFunction("hashFile") { (uri: String, promise: Promise) in
      self.queue.async {
        do {
          let url = URL(string: uri) ?? URL(fileURLWithPath: uri)
          let handle = try FileHandle(forReadingFrom: url)
          defer { try? handle.close() }
          var digest = SHA256()
          while let chunk = try handle.read(upToCount: 8 * 1024 * 1024), !chunk.isEmpty {
            digest.update(data: chunk)
          }
          let hex = digest.finalize().map { String(format: "%02x", $0) }.joined()
          promise.resolve(hex)
        } catch {
          promise.reject("HASH_FAILED", error.localizedDescription)
        }
      }
    }

    AsyncFunction("loadModel") { (uri: String, promise: Promise) in
      self.queue.async {
        if self.generating {
          promise.reject("LOAD_FAILED", "cannot load while generating; cancel first")
          return
        }
        let url = URL(string: uri) ?? URL(fileURLWithPath: uri)
        guard FileManager.default.fileExists(atPath: url.path) else {
          promise.reject("LOAD_FAILED", "model file missing; reinstall it")
          return
        }
        guard Self.ggufMagicOk(url: url) else {
          promise.reject("LOAD_FAILED", "not a GGUF artifact; refusing to load")
          return
        }
        self.state = "loading"
        if let c = self.ctx { cFree(c); self.ctx = nil }
        var loaded: OpaquePointer?
        var err = [CChar](repeating: 0, count: 512)
        let rc = url.path.withCString { cPath in
          cLoad(cPath, &loaded, &err, 512)
        }
        if rc != 0 || loaded == nil {
          self.state = "error"
          promise.reject("LOAD_FAILED", String(cString: err))
          return
        }
        self.ctx = loaded
        self.loadedUri = uri
        self.state = "ready"
        promise.resolve(nil)
      }
    }

    AsyncFunction("unloadModel") { (promise: Promise) in
      self.queue.async {
        self.cancelFlag = 1
        if let c = self.ctx { cFree(c); self.ctx = nil }
        self.loadedUri = nil
        self.state = "unloaded"
        promise.resolve(nil)
      }
    }

    AsyncFunction("loadedModelUri") { (promise: Promise) in
      promise.resolve(self.loadedUri)
    }

    AsyncFunction("generate") { (prompt: String, promise: Promise) in
      self.run(prompt: prompt, promise: promise)
    }

    AsyncFunction("streamGenerate") { (prompt: String, promise: Promise) in
      self.run(prompt: prompt, promise: promise)
    }

    AsyncFunction("cancel") { (promise: Promise) in
      self.cancelFlag = 1
      promise.resolve(nil)
    }

    AsyncFunction("deviceInfo") { (promise: Promise) in
      promise.resolve([
        "platform": "ios",
        "arch": "arm64",
        "totalRamMb": ProcessInfo.processInfo.physicalMemory / 1024 / 1024
      ])
    }
  }

  private func run(prompt: String, promise: Promise) {
    queue.async {
      guard let c = self.ctx else {
        promise.reject("GENERATE_FAILED", "no model loaded")
        return
      }
      guard !self.generating else {
        promise.reject("GENERATE_FAILED", "generation already in progress")
        return
      }
      self.generating = true
      self.state = "generating"
      self.cancelFlag = 0
      var params = CGenParams()
      let box = GenBox()
      box.module = self
      let ud = Unmanaged.passUnretained(box).toOpaque()
      var err = [CChar](repeating: 0, count: 512)
      let rc = prompt.withCString { cPrompt in
        withUnsafeMutablePointer(to: &self.cancelFlag) { cancel in
          cGenerate(c, cPrompt, &params, tokenTrampoline, ud, cancel, &err, 512)
        }
      }
      self.generating = false
      self.state = "ready"
      if rc != 0 {
        promise.reject("GENERATE_FAILED", String(cString: err))
        return
      }
      promise.resolve(String(data: box.data, encoding: .utf8) ?? "")
    }
  }

  private static func ggufMagicOk(url: URL) -> Bool {
    guard let h = try? FileHandle(forReadingFrom: url) else { return false }
    defer { try? h.close() }
    guard let magic = try? h.read(upToCount: 4), magic.count == 4 else { return false }
    return magic[magic.startIndex] == UInt8(ascii: "G")
      && magic[magic.startIndex + 1] == UInt8(ascii: "G")
      && magic[magic.startIndex + 2] == UInt8(ascii: "U")
      && magic[magic.startIndex + 3] == UInt8(ascii: "F")
  }
}

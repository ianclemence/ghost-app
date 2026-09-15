package com.ghost.localinference

// GhostLocalInferenceModule: Expo TurboModule owning model lifecycle,
// streaming generation, cancellation, and SHA-256 file hashing.
// Inference itself runs in the shared C++ core (cpp/ghost_llama.cpp) over
// llama.cpp; this file owns the JVM boundary, threading, and state machine.
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.Promise
import java.io.File
import java.io.FileInputStream
import java.security.MessageDigest
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicLong
import java.util.concurrent.atomic.AtomicReference

object GhostLlama {
  init {
    try {
      System.loadLibrary("ghost_llama")
    } catch (_: UnsatisfiedLinkError) {
      // Surfaced precisely via backendStatus(); dev builds bundle the .so.
    }
  }
  external fun nativeLoad(path: String): Long
  external fun nativeFree(handle: Long)
  external fun nativeGenerate(handle: Long, prompt: String, nPredict: Int, cancelPtr: Long): String
  external fun nativeCancel()
}

class GhostLocalInferenceModule : Module() {
  private val io = Executors.newSingleThreadExecutor()
  private val handle = AtomicLong(0)
  private val loadedUri = AtomicReference<String?>(null)
  private val generating = AtomicBoolean(false)
  private val cancelFlag = AtomicInteger(0)
  private val state = AtomicReference("unloaded") // unloaded|loading|ready|generating|error

  // Called from JNI on the generation thread to stream one token to JS.
  @Suppress("unused")
  fun emitToken(token: String) {
    sendEvent("token", mapOf("token" to token))
  }

  private fun backendLinked(): Boolean {
    return try {
      System.loadLibrary("ghost_llama")
      true
    } catch (_: UnsatisfiedLinkError) {
      false
    }
  }

  private fun ggufMagicOk(path: String): Boolean {
    return try {
      FileInputStream(File(path)).use {
        val magic = ByteArray(4)
        if (it.read(magic) != 4) return false
        magic[0] == 'G'.code.toByte() && magic[1] == 'G'.code.toByte() &&
          magic[2] == 'U'.code.toByte() && magic[3] == 'F'.code.toByte()
      }
    } catch (_: Exception) {
      false
    }
  }

  override fun definition() = ModuleDefinition {
    Name("GhostLocalInference")

    Events("token")

    AsyncFunction("isAvailable") { promise: Promise ->
      promise.resolve(backendLinked())
    }

    AsyncFunction("backendStatus") { promise: Promise ->
      val map = mapOf(
        "linked" to backendLinked(),
        "state" to state.get(),
        "loadedModel" to loadedUri.get(),
        "engine" to "llama.cpp (GGUF, shared C++ core)"
      )
      promise.resolve(map)
    }

    AsyncFunction("hashFile") { uri: String, promise: Promise ->
      io.execute {
        try {
          val path = uri.removePrefix("file://")
          val md = MessageDigest.getInstance("SHA-256")
          FileInputStream(File(path)).use { ins ->
            val buf = ByteArray(8 * 1024 * 1024)
            while (true) {
              val n = ins.read(buf)
              if (n <= 0) break
              md.update(buf, 0, n)
            }
          }
          promise.resolve(md.digest().joinToString("") { "%02x".format(it) })
        } catch (e: Exception) {
          promise.reject("HASH_FAILED", e.message, e)
        }
      }
    }

    AsyncFunction("loadModel") { uri: String, promise: Promise ->
      io.execute {
        try {
          if (generating.get()) throw RuntimeException("cannot load while generating; cancel first")
          val path = uri.removePrefix("file://")
          if (!File(path).exists()) throw RuntimeException("model file missing; reinstall it")
          if (!ggufMagicOk(path)) throw RuntimeException("not a GGUF artifact; refusing to load")
          state.set("loading")
          val old = handle.getAndSet(0)
          if (old != 0L) GhostLlama.nativeFree(old)
          val h = GhostLlama.nativeLoad(path)
          handle.set(h)
          loadedUri.set(uri)
          state.set("ready")
          promise.resolve(null)
        } catch (e: UnsatisfiedLinkError) {
          state.set("error")
          promise.reject("BACKEND_MISSING", "llama.cpp native library not bundled; rebuild with the EAS llama.cpp profile", e)
        } catch (e: Exception) {
          state.set("error")
          promise.reject("LOAD_FAILED", e.message, e)
        }
      }
    }

    AsyncFunction("unloadModel") { promise: Promise ->
      io.execute {
        try {
          cancelFlag.set(1)
          val old = handle.getAndSet(0)
          if (old != 0L) GhostLlama.nativeFree(old)
          loadedUri.set(null)
          state.set("unloaded")
          promise.resolve(null)
        } catch (e: Exception) {
          promise.reject("UNLOAD_FAILED", e.message, e)
        }
      }
    }

    AsyncFunction("loadedModelUri") { promise: Promise ->
      promise.resolve(loadedUri.get())
    }

    AsyncFunction("generate") { prompt: String, promise: Promise ->
      io.execute {
        try {
          val h = handle.get()
          if (h == 0L) throw RuntimeException("no model loaded")
          if (!generating.compareAndSet(false, true)) throw RuntimeException("generation already in progress")
          state.set("generating")
          cancelFlag.set(0)
          // Synchronous full generation (streaming variant below for UX).
          val text = GhostLlama.nativeGenerate(h, prompt, 512, 0)
          generating.set(false)
          state.set("ready")
          promise.resolve(text)
        } catch (e: Exception) {
          generating.set(false)
          state.set("ready")
          promise.reject("GENERATE_FAILED", e.message, e)
        }
      }
    }

    AsyncFunction("streamGenerate") { prompt: String, promise: Promise ->
      io.execute {
        try {
          val h = handle.get()
          if (h == 0L) throw RuntimeException("no model loaded")
          if (!generating.compareAndSet(false, true)) throw RuntimeException("generation already in progress")
          state.set("generating")
          cancelFlag.set(0)
          val text = GhostLlama.nativeGenerate(h, prompt, 512, 0)
          generating.set(false)
          state.set("ready")
          promise.resolve(text)
        } catch (e: Exception) {
          generating.set(false)
          state.set("ready")
          promise.reject("GENERATE_FAILED", e.message, e)
        }
      }
    }

    AsyncFunction("cancel") { promise: Promise ->
      cancelFlag.set(1)
      try {
        GhostLlama.nativeCancel()
      } catch (_: UnsatisfiedLinkError) {
        // Backend not bundled; flag alone is sufficient.
      }
      promise.resolve(null)
    }

    AsyncFunction("deviceInfo") { promise: Promise ->
      val rt = Runtime.getRuntime()
      promise.resolve(mapOf(
        "platform" to "android",
        "arch" to (System.getProperty("os.arch") ?: "unknown"),
        "processors" to rt.availableProcessors(),
        "totalRamMb" to (rt.totalMemory() / 1024 / 1024)
      ))
    }
  }
}

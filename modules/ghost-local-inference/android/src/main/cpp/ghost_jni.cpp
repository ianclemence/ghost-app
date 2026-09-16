// JNI bridge: com.ghost.localinference native methods <-> shared C++ core.
#include <jni.h>

#include <atomic>
#include <cstring>
#include <string>
#include <vector>

#include "ghost_llama.h"

static std::string jstr(JNIEnv *env, jstring s) {
  if (!s) return {};
  const char *c = env->GetStringUTFChars(s, nullptr);
  std::string out(c ? c : "");
  if (c) env->ReleaseStringUTFChars(s, c);
  return out;
}

// Process-wide cancellation flag: GhostLocalInferenceModule.cancel() sets it
// via nativeCancel(); the streaming callback below stops the C++ loop.
static std::atomic<bool> g_cancel{false};

struct StreamState {
  JNIEnv *env;
  jobject emitter;  // global ref to module instance
  jmethodID emit_mid;
  std::atomic<bool> failed{false};
};

static int token_cb(const char *utf8, int32_t len, void *userdata) {
  auto *st = static_cast<StreamState *>(userdata);
  jstring tok = st->env->NewStringUTF(std::string(utf8, (size_t)len).c_str());
  st->env->CallVoidMethod(st->emitter, st->emit_mid, tok);
  st->env->DeleteLocalRef(tok);
  if (st->env->ExceptionCheck()) {
    st->env->ExceptionClear();
    st->failed = true;
    return 1;
  }
  return 0;
}

extern "C" {

JNIEXPORT jlong JNICALL
Java_com_ghost_localinference_GhostLlama_nativeLoad(JNIEnv *env, jobject, jstring path) {
  std::string p = jstr(env, path);
  ghost_llama_t *ctx = nullptr;
  char err[512] = {0};
  if (ghost_llama_load(p.c_str(), &ctx, err, sizeof(err)) != 0) {
    jclass ex = env->FindClass("java/lang/RuntimeException");
    env->ThrowNew(ex, err[0] ? err : "load failed");
    return 0;
  }
  return reinterpret_cast<jlong>(ctx);
}

JNIEXPORT void JNICALL
Java_com_ghost_localinference_GhostLlama_nativeFree(JNIEnv *, jobject, jlong handle) {
  ghost_llama_free(reinterpret_cast<ghost_llama_t *>(handle));
}

JNIEXPORT jstring JNICALL
Java_com_ghost_localinference_GhostLlama_nativeGenerate(JNIEnv *env, jobject thiz, jlong handle,
                                                       jstring prompt, jint nPredict,
                                                       jlong cancelPtr) {
  auto *ctx = reinterpret_cast<ghost_llama_t *>(handle);
  std::string p = jstr(env, prompt);
  ghost_gen_params_t params{};
  params.n_predict = nPredict;
  params.n_ctx = 4096;
  jclass cls = env->GetObjectClass(thiz);
  jmethodID emit = env->GetMethodID(cls, "emitToken", "(Ljava/lang/String;)V");
  jobject gref = env->NewGlobalRef(thiz);
  StreamState st{env, gref, emit};
  std::string collected;
  auto collect = [](const char *u, int32_t l, void *ud) -> int {
    if (g_cancel.load()) return 1;  // cancelled: stop between tokens
    auto *s = static_cast<std::pair<StreamState *, std::string *> *>(ud);
    s->second->append(u, (size_t)l);
    return token_cb(u, l, s->first);
  };
  std::pair<StreamState *, std::string *> ud{&st, &collected};
  char err[512] = {0};
  int rc = ghost_llama_generate(ctx, p.c_str(), &params, collect, &ud,
                                reinterpret_cast<volatile int *>(cancelPtr), err, sizeof(err));
  env->DeleteGlobalRef(gref);
  if (rc != 0) {
    jclass ex = env->FindClass("java/lang/RuntimeException");
    env->ThrowNew(ex, err[0] ? err : "generate failed");
    return nullptr;
  }
  return env->NewStringUTF(collected.c_str());
}

JNIEXPORT void JNICALL
Java_com_ghost_localinference_GhostLlama_nativeCancel(JNIEnv *, jobject) {
  g_cancel.store(true);
}

}  // extern "C"

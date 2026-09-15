// Shared C++ inference core interface. Implemented in cpp/ghost_llama.cpp
// against the llama.cpp C API; called from Kotlin (JNI) and Swift (C bridge)
// so both platforms run the same GGUF execution path.
#pragma once

#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef struct ghost_llama ghost_llama_t;

// Token callback: return 0 to continue, nonzero to stop early (cancellation).
typedef int (*ghost_token_cb)(const char *utf8, int32_t len, void *userdata);

typedef struct {
  int32_t n_ctx;       // context size; 0 = model default capped to 4096
  int32_t n_threads;   // 0 = auto
  int32_t n_predict;   // max new tokens; <=0 = 512
  int32_t seed;        // -1 = random
} ghost_gen_params_t;

// Returns 0 on success, nonzero + human-readable error via err_buf.
int ghost_llama_load(const char *model_path, ghost_llama_t **out, char *err_buf, size_t err_len);
void ghost_llama_free(ghost_llama_t *ctx);
// Generates to completion (or stop); streams deltas through cb. Checks
// *cancel_flag between tokens for prompt cancellation.
int ghost_llama_generate(ghost_llama_t *ctx, const char *prompt,
                         const ghost_gen_params_t *params,
                         ghost_token_cb cb, void *userdata,
                         volatile int *cancel_flag,
                         char *err_buf, size_t err_len);
int ghost_llama_embedding_dim(ghost_llama_t *ctx);

#ifdef __cplusplus
}
#endif

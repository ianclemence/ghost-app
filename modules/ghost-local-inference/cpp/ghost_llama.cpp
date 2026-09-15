// Ghost shared inference core: GGUF execution via the llama.cpp C API.
// Built with -DHAVE_LLAMA_CPP when the EAS/Android/Xcode build provides
// llama.cpp headers+lib (see android/CMakeLists.txt). Without it the TU still
// compiles and every entry point reports a precise "backend not bundled"
// error, so misconfigured builds fail loudly instead of silently.
#include "ghost_llama.h"

#include <cstdlib>
#include <cstring>
#include <string>
#include <vector>

#ifdef HAVE_LLAMA_CPP
#include "llama.h"
#endif

struct ghost_llama {
#ifdef HAVE_LLAMA_CPP
  llama_model *model = nullptr;
  llama_context *lctx = nullptr;
  const llama_vocab *vocab = nullptr;
#endif
  std::string model_path;
};

static void set_err(char *buf, size_t len, const char *msg) {
  if (!buf || len == 0) return;
  strncpy(buf, msg, len - 1);
  buf[len - 1] = '\0';
}

int ghost_llama_load(const char *model_path, ghost_llama_t **out, char *err_buf, size_t err_len) {
  if (!model_path || !out) {
    set_err(err_buf, err_len, "model_path and out required");
    return -1;
  }
#ifdef HAVE_LLAMA_CPP
  llama_backend_init();
  llama_model_params mparams = llama_model_default_params();
  llama_model *model = llama_model_load_from_file(model_path, mparams);
  if (!model) {
    set_err(err_buf, err_len, "llama_model_load_from_file failed (corrupt GGUF or OOM)");
    return -2;
  }
  llama_context_params cparams = llama_context_default_params();
  cparams.n_ctx = 4096;
  llama_context *lctx = llama_init_from_model(model, cparams);
  if (!lctx) {
    llama_model_free(model);
    set_err(err_buf, err_len, "llama_init_from_model failed");
    return -3;
  }
  ghost_llama_t *g = new ghost_llama_t();
  g->model = model;
  g->lctx = lctx;
  g->vocab = llama_model_get_vocab(model);
  g->model_path = model_path;
  *out = g;
  return 0;
#else
  (void)out;
  set_err(err_buf, err_len,
          "llama.cpp backend not bundled in this build (HAVE_LLAMA_CPP unset). "
          "Rebuild with the EAS profile that vendors llama.cpp.");
  return -99;
#endif
}

void ghost_llama_free(ghost_llama_t *ctx) {
#ifdef HAVE_LLAMA_CPP
  if (!ctx) return;
  llama_free(ctx->lctx);
  llama_model_free(ctx->model);
  llama_backend_free();
  delete ctx;
#else
  (void)ctx;
#endif
}

int ghost_llama_generate(ghost_llama_t *ctx, const char *prompt,
                         const ghost_gen_params_t *params,
                         ghost_token_cb cb, void *userdata,
                         volatile int *cancel_flag,
                         char *err_buf, size_t err_len) {
  if (!ctx || !prompt || !cb) {
    set_err(err_buf, err_len, "context, prompt and callback required");
    return -1;
  }
#ifdef HAVE_LLAMA_CPP
  int32_t n_predict = (params && params->n_predict > 0) ? params->n_predict : 512;
  const llama_vocab *vocab = ctx->vocab;

  // Tokenize prompt.
  int32_t n_prompt = -llama_tokenize(vocab, prompt, (int32_t)strlen(prompt), nullptr, 0, true, true);
  if (n_prompt <= 0) {
    set_err(err_buf, err_len, "prompt tokenization failed");
    return -2;
  }
  std::vector<llama_token> prompt_tokens((size_t)n_prompt);
  if (llama_tokenize(vocab, prompt, (int32_t)strlen(prompt), prompt_tokens.data(),
                     (int32_t)prompt_tokens.size(), true, true) < 0) {
    set_err(err_buf, err_len, "prompt tokenization failed");
    return -2;
  }

  llama_sampler *smpl = llama_sampler_chain_init(llama_sampler_chain_default_params());
  llama_sampler_chain_add(smpl, llama_sampler_init_greedy());

  llama_batch batch = llama_batch_get_one(prompt_tokens.data(), (int32_t)prompt_tokens.size());
  llama_token new_token_id;
  std::string acc;
  acc.reserve(1024);

  for (int n = 0; n < n_predict; n++) {
    if (cancel_flag && *cancel_flag) break;
    if (llama_decode(ctx->lctx, batch) != 0) {
      set_err(err_buf, err_len, "llama_decode failed");
      llama_sampler_free(smpl);
      return -3;
    }
    new_token_id = llama_sampler_sample(smpl, ctx->lctx, -1);
    if (llama_vocab_is_eog(vocab, new_token_id)) break;
    char piece[256];
    int32_t plen = llama_token_to_piece(vocab, new_token_id, piece, sizeof(piece), 0, true);
    if (plen > 0) {
      if (cb(piece, plen, userdata) != 0) break;  // JS asked to stop
      acc.append(piece, (size_t)plen);
    }
    batch = llama_batch_get_one(&new_token_id, 1);
  }
  llama_sampler_free(smpl);
  return 0;
#else
  (void)ctx; (void)prompt; (void)params; (void)cb; (void)userdata; (void)cancel_flag;
  set_err(err_buf, err_len, "llama.cpp backend not bundled in this build");
  return -99;
#endif
}

int ghost_llama_embedding_dim(ghost_llama_t *ctx) {
  (void)ctx;
  return 0;  // phone text artifacts ship no embedding head (documented)
}

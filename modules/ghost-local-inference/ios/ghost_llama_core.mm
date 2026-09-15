// iOS compile unit for the shared C++ core. The Expo autolinked target
// compiles ios/*.swift + ios/*.{m,mm,cpp}; including the shared
// implementation here keeps one GGUF execution path for both platforms.
// Build settings must provide llama.cpp headers/lib and -DHAVE_LLAMA_CPP
// (see module README "iOS build"); without it the core compiles in stub
// mode and reports "backend not bundled" at runtime.
#include "../../cpp/ghost_llama.cpp"

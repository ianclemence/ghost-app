# ghost_llama: shared C++ core + JNI bridge, linked against llama.cpp.
# The EAS build provides llama.cpp via -DLLAMA_CPP_DIR=<path> (a checkout of
# the pinned tag documented in the module README). Without it the sources
# still compile (HAVE_LLAMA_CPP unset) and report "backend not bundled".
cmake_minimum_required(VERSION 3.22.1)
project(ghost_llama)

set(CMAKE_CXX_STANDARD 17)

add_library(ghost_llama SHARED
  src/main/cpp/ghost_jni.cpp
  ../../cpp/ghost_llama.cpp
)

target_include_directories(ghost_llama PRIVATE
  ../../cpp
)

if(DEFINED LLAMA_CPP_DIR)
  target_include_directories(ghost_llama PRIVATE ${LLAMA_CPP_DIR}/include)
  add_definitions(-DHAVE_LLAMA_CPP)
  find_library(LLAMA_LIB llama PATHS ${LLAMA_CPP_DIR}/build/src NO_DEFAULT_PATH)
  find_library(COMMON_LIB common PATHS ${LLAMA_CPP_DIR}/build/common NO_DEFAULT_PATH)
  if(LLAMA_LIB)
    target_link_libraries(ghost_llama ${LLAMA_LIB} ${COMMON_LIB} log)
  endif()
endif()

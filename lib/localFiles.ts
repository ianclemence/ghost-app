// On-device file access. expo-file-system's default export is the File/Paths
// API; the older readAsStringAsync/writeAsStringAsync functions are not on it,
// so code that looked them up there found nothing and quietly did nothing
// (voice transcription returned empty; downloads said "not supported").

/** A local file's contents as base64. */
export async function readBase64(uri: string): Promise<string> {
  const { File } = await import("expo-file-system");
  return new File(uri).base64();
}

/** Writes a file into the cache directory and returns its uri. */
export async function writeCacheFile(
  name: string,
  content: string,
  encoding: "utf8" | "base64",
): Promise<string> {
  const { File, Paths } = await import("expo-file-system");
  const file = new File(Paths.cache, name);
  file.create({ overwrite: true });
  file.write(content, { encoding });
  return file.uri;
}

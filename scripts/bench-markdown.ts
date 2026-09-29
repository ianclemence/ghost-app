/**
 * Markdown rendering cost benchmark (bun scripts/bench-markdown.ts).
 *
 * Streaming re-parses the in-progress message on each token. This measures
 * that cost so the design decision is evidence-based rather than assumed.
 * Numbers from a dev machine (Apple Silicon, bun 1.4):
 *
 *   0.7KB  prepare=0.03ms  parse=0.67ms
 *   2.9KB  prepare=0.08ms  parse=1.28ms
 *   8.8KB  prepare=0.19ms  parse=2.50ms
 *
 * At ~30 tokens/s a 9KB response costs ~7% of one core for parsing, and
 * completed messages are memoized so they parse once. Block-splitting the
 * live message would remove that cost but changes spacing; the measurement
 * says it is not needed, so the simpler single-parse renderer stands.
 */
import MarkdownIt from "markdown-it";
import { prepareStreamingMarkdown } from "../lib/streaming";

const md = MarkdownIt({ typographer: true, linkify: true, html: false });

function doc(sections: number): string {
  let s = "";
  for (let i = 0; i < sections; i++) {
    s += `## Section ${i} with **bold** and \`code\`\n\n`;
    s += `Prose with *em* and a [link](https://example.com/x).\n\n`;
    s += `- one\n- two\n\n`;
    s += "```go\nresult := ghost.Process(request)\n```\n\n";
  }
  return s;
}

function bench(label: string, iters: number, fn: () => void): number {
  const t0 = performance.now();
  for (let i = 0; i < iters; i++) fn();
  const ms = (performance.now() - t0) / iters;
  console.log(`${label.padEnd(28)} ${ms.toFixed(3)}ms`);
  return ms;
}

for (const n of [5, 20, 60]) {
  const text = doc(n);
  console.log(`\n${(text.length / 1024).toFixed(1)}KB response`);
  bench("prepareStreamingMarkdown", 200, () => prepareStreamingMarkdown(text));
  bench("markdown-it parse", 200, () => md.parse(text, {}));
}

import type { Plugin } from "vite";

const readableStreamModule =
  /[/\\]readable-stream[/\\]lib[/\\]_stream_readable\.js(?:\?.*)?$/;
const sourceStreamDebuglog =
  /debugUtil\.debuglog\(\s*(["'])stream\1\s*\)/g;
const bundledStreamDebuglog = /\.debuglog\(\s*(["'`])stream\1\s*\)/;

/**
 * Cloudflare's native util.debuglog is always enabled. readable-stream passes
 * complete chunks to its stream logger, which can expose decompressed XLSX XML.
 */
export function disableReadableStreamDebug(): Plugin {
  return {
    name: "disable-readable-stream-debug",
    enforce: "pre",
    transform(code, id) {
      if (!readableStreamModule.test(id)) return null;
      const transformed = code.replace(sourceStreamDebuglog, "(() => {})");
      if (transformed === code && code.includes("debuglog"))
        throw new Error(
          `Unsupported readable-stream debug logger in ${id}. Refusing to build a bundle that may log stream contents.`,
        );
      return transformed === code ? null : { code: transformed, map: null };
    },
    generateBundle(_options, bundle) {
      for (const output of Object.values(bundle)) {
        if (
          output.type === "chunk" &&
          output.code.includes("readableAddChunk") &&
          bundledStreamDebuglog.test(output.code)
        )
          throw new Error(
            `Stream debugging remains in ${output.fileName}. Refusing to emit a bundle that may log stream contents.`,
          );
      }
    },
  };
}

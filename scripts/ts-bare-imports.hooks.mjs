import { existsSync } from "node:fs";
import { extname } from "node:path";
import { fileURLToPath } from "node:url";

/** Resolve `./file` to `./file.ts` when that file exists on disk. */
export async function resolve(specifier, context, nextResolve) {
  if ((specifier.startsWith("./") || specifier.startsWith("../")) && !extname(specifier) && context.parentURL) {
    const candidate = new URL(`${specifier}.ts`, context.parentURL);
    if (existsSync(fileURLToPath(candidate))) {
      return nextResolve(`${specifier}.ts`, context);
    }
  }
  return nextResolve(specifier, context);
}

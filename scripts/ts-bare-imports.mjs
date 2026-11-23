/**
 * Load hook so `node --experimental-strip-types --test` can follow
 * extensionless relative imports the Vite app already uses (`./model`).
 */
import { register } from "node:module";

register(new URL("./ts-bare-imports.hooks.mjs", import.meta.url));

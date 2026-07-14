#!/usr/bin/env bun
import { runTuiDirect } from "./tui/index.js";
import { homeDir } from "./core/paths.js";

process.on("SIGINT", () => process.exit(0));
process.on("SIGTERM", () => process.exit(0));

const index = process.argv.indexOf("--home");
const home = index >= 0 && process.argv[index + 1] ? process.argv[index + 1]! : homeDir();
try {
  await runTuiDirect(home);
} catch (error) {
  console.error((error as Error).message);
  process.exit(2);
}

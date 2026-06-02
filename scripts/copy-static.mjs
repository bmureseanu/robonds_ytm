import { cpSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const targets = [
  [path.join(rootDir, "src", "public"), path.join(rootDir, "dist", "public")],
  [path.join(rootDir, "src", "views"), path.join(rootDir, "dist", "views")],
];

for (const [sourceDir, targetDir] of targets) {
  rmSync(targetDir, { force: true, recursive: true });
  mkdirSync(path.dirname(targetDir), { recursive: true });
  cpSync(sourceDir, targetDir, { recursive: true });
}
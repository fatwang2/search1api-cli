/**
 * Build script for creating standalone binaries using Bun.
 *
 * Usage:
 *   bun run scripts/build-binary.ts                  # build for current platform
 *   bun run scripts/build-binary.ts --cross           # build for all platforms
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

const pkg = JSON.parse(
  readFileSync(join(import.meta.dir, "../package.json"), "utf-8")
);
const version = pkg.version;
const name = pkg.name;

const crossBuild = process.argv.includes("--cross");

interface Target {
  target: string;
  outfile: string;
}

const allTargets: Target[] = [
  { target: "bun-darwin-arm64", outfile: `dist-bin/s1-darwin-arm64` },
  { target: "bun-darwin-x64", outfile: `dist-bin/s1-darwin-x64` },
  { target: "bun-linux-x64", outfile: `dist-bin/s1-linux-x64` },
  { target: "bun-linux-arm64", outfile: `dist-bin/s1-linux-arm64` },
  { target: "bun-windows-x64", outfile: `dist-bin/s1-windows-x64.exe` },
];

async function build(targets: Target[]) {
  for (const { target, outfile } of targets) {
    console.log(`Building ${outfile} (${target})...`);
    const proc = Bun.spawn(
      [
        "bun",
        "build",
        "./src/index.ts",
        "--compile",
        "--target",
        target,
        "--define",
        `__PKG_VERSION__="${version}"`,
        "--define",
        `__PKG_NAME__="${name}"`,
        "--outfile",
        outfile,
      ],
      { stdout: "inherit", stderr: "inherit" }
    );
    const exitCode = await proc.exited;
    if (exitCode !== 0) {
      console.error(`Failed to build ${target}`);
      process.exit(1);
    }
    console.log(`  ✓ ${outfile}`);
  }
}

if (crossBuild) {
  await build(allTargets);
} else {
  // Detect current platform
  const os = process.platform === "win32" ? "windows" : process.platform;
  const arch = process.arch === "arm64" ? "arm64" : "x64";
  const ext = os === "windows" ? ".exe" : "";
  const current: Target = {
    target: `bun-${os}-${arch}`,
    outfile: `dist-bin/s1-${os}-${arch}${ext}`,
  };
  await build([current]);
}

console.log("\nDone!");

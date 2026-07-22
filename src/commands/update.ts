import { Command } from "commander";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  mkdtempSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import chalk from "chalk";

const REPO = "superagents-lab/search1api-cli";
const PKG_NAME = "search1api-cli";

interface UpdateOptions {
  pkg: { name: string; version: string };
  /** true when running as a Bun-compiled standalone binary */
  isBinary: boolean;
}

export function registerUpdateCommand(
  program: Command,
  { pkg, isBinary }: UpdateOptions
): void {
  program
    .command("update")
    .description("Update s1 to the latest version")
    .option("--force", "reinstall even if already on the latest version")
    .action(async (opts) => {
      if (isBinary) {
        await updateBinary(pkg.version, opts.force);
      } else {
        updateNpm();
      }
    });
}

function updateNpm(): void {
  console.log(
    `This s1 was installed via npm. Update it with:\n\n` +
      `  ${chalk.cyan(`npm install -g ${PKG_NAME}`)}\n`
  );
}

/** Maps Node's platform/arch onto the release asset naming scheme. */
function resolveAsset(): { os: string; arch: string; ext: string } | null {
  let os: string;
  switch (process.platform) {
    case "darwin":
      os = "darwin";
      break;
    case "linux":
      os = "linux";
      break;
    case "win32":
      os = "windows";
      break;
    default:
      return null;
  }

  let arch: string;
  switch (process.arch) {
    case "x64":
      arch = "x64";
      break;
    case "arm64":
      arch = "arm64";
      break;
    default:
      return null;
  }

  return { os, arch, ext: os === "windows" ? ".exe" : "" };
}

async function fetchLatestVersion(): Promise<string | null> {
  const res = await fetch(
    `https://api.github.com/repos/${REPO}/releases/latest`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": `${PKG_NAME}-cli`,
      },
    }
  );
  if (!res.ok) return null;
  const data = (await res.json()) as { tag_name?: string };
  if (!data.tag_name) return null;
  return data.tag_name.replace(/^v/, "");
}

async function updateBinary(currentVersion: string, force: boolean): Promise<void> {
  const asset = resolveAsset();
  if (!asset) {
    throw new Error(
      `Unsupported platform: ${process.platform}-${process.arch}. ` +
        `Please update manually from https://github.com/${REPO}/releases/latest`
    );
  }

  console.log(chalk.dim("Checking for the latest release..."));
  const latest = await fetchLatestVersion();

  if (latest && !force && latest === currentVersion) {
    console.log(
      chalk.green(`s1 is already up to date (v${currentVersion}).`)
    );
    return;
  }
  if (latest && !force && isOlder(latest, currentVersion)) {
    console.log(
      chalk.green(
        `s1 v${currentVersion} is newer than the latest release (v${latest}). Nothing to do.`
      )
    );
    return;
  }

  const assetName = `s1-${asset.os}-${asset.arch}${asset.ext}`;
  const url = `https://github.com/${REPO}/releases/latest/download/${assetName}`;

  console.log(
    chalk.dim(
      latest
        ? `Updating s1 v${currentVersion} → v${latest}...`
        : `Downloading latest s1...`
    )
  );

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Download failed (${res.status}): ${url}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());

  const tmpDir = mkdtempSync(join(tmpdir(), "s1-update-"));
  const tmpFile = join(tmpDir, assetName);
  try {
    writeFileSync(tmpFile, buf);
    if (asset.os !== "windows") chmodSync(tmpFile, 0o755);

    const dest = process.execPath;
    installOver(tmpFile, dest, asset.os);

    console.log(
      chalk.green(
        latest
          ? `Successfully updated to v${latest}.`
          : `Successfully updated s1.`
      )
    );
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

/** Replace the running binary at `dest` with the freshly downloaded `src`. */
function installOver(src: string, dest: string, os: string): void {
  if (os === "windows") {
    // A running .exe can't be overwritten in place; swap it out via a sidecar.
    const old = `${dest}.old`;
    try {
      rmSync(old, { force: true });
      renameSync(dest, old);
      copyFileSync(src, dest);
    } catch (err) {
      throw new Error(
        `Could not replace ${dest}: ${(err as Error).message}. ` +
          `Download it manually from https://github.com/${REPO}/releases/latest`
      );
    }
    return;
  }

  try {
    // rename fails across filesystems (tmp → /usr/local/bin); fall back to copy.
    try {
      renameSync(src, dest);
    } catch {
      copyFileSync(src, dest);
    }
    chmodSync(dest, 0o755);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "EACCES") {
      console.log(chalk.dim(`Installing to ${dest} (requires sudo)...`));
      const r = spawnSync("sudo", ["cp", src, dest], { stdio: "inherit" });
      if (r.status !== 0) {
        throw new Error(`Failed to install to ${dest} with sudo.`);
      }
      spawnSync("sudo", ["chmod", "755", dest], { stdio: "inherit" });
    } else {
      throw err;
    }
  }
}

/** Returns true if semver `a` is strictly older than `b`. */
function isOlder(a: string, b: string): boolean {
  const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x !== y) return x < y;
  }
  return false;
}

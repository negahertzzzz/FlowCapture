#!/usr/bin/env node
/**
 * Verifies (and optionally installs) dev prerequisites for FlowCapture.
 *
 * Usage:
 *   npm run setup              # check deps + npm install
 *   npm run setup -- --install # also install system packages (Linux) / Rust
 */

import { execSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = new Set(process.argv.slice(2));
const install = args.has("--install") || args.has("-y");
const skipNpm = args.has("--skip-npm");

const LINUX_APT_PACKAGES = [
  "libwebkit2gtk-4.1-dev",
  "build-essential",
  "curl",
  "wget",
  "file",
  "libxdo-dev",
  "libssl-dev",
  "libayatana-appindicator3-dev",
  "librsvg2-dev",
  "pkg-config",
];

const LINUX_DNF_PACKAGES = [
  "webkit2gtk4.1-devel",
  "openssl-devel",
  "curl",
  "wget",
  "file",
  "libappindicator-gtk3-devel",
  "librsvg2-devel",
  "libxdo-devel",
  "@development-tools",
];

const LINUX_PACMAN_PACKAGES = [
  "webkit2gtk-4.1",
  "base-devel",
  "curl",
  "wget",
  "file",
  "openssl",
  "libappindicator-gtk3",
  "librsvg",
  "xdotool",
  "pkgconf",
];

let failed = false;

function log(message) {
  console.log(message);
}

function warn(message) {
  console.warn(`warning: ${message}`);
}

function fail(message) {
  console.error(`error: ${message}`);
  failed = true;
}

function run(command, options = {}) {
  return execSync(command, {
    stdio: options.silent ? "pipe" : "inherit",
    encoding: "utf8",
    ...options,
  });
}

function hasCommand(command) {
  const check =
    process.platform === "win32"
      ? `where ${command}`
      : `command -v ${command}`;
  try {
    execSync(check, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function commandSucceeded(command) {
  try {
    execSync(command, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function readLinuxDistro() {
  const osReleasePath = "/etc/os-release";
  if (!existsSync(osReleasePath)) {
    return null;
  }

  const content = readFileSync(osReleasePath, "utf8");
  const idLike = content.match(/^ID_LIKE=(.+)$/m)?.[1]?.replaceAll('"', "") ?? "";
  const id = content.match(/^ID=(.+)$/m)?.[1]?.replaceAll('"', "") ?? "";

  if (id === "ubuntu" || id === "debian" || idLike.includes("debian")) {
    return "debian";
  }
  if (
    id === "fedora" ||
    id === "rhel" ||
    id === "centos" ||
    idLike.includes("fedora") ||
    idLike.includes("rhel")
  ) {
    return "fedora";
  }
  if (id === "arch" || idLike.includes("arch")) {
    return "arch";
  }

  return id || null;
}

function checkNode() {
  const version = process.versions.node;
  const major = Number.parseInt(version.split(".")[0] ?? "0", 10);
  if (major < 20) {
    fail(`Node.js 20+ required (found ${version}). Install from https://nodejs.org/`);
    return;
  }
  log(`ok Node.js ${version}`);
}

function installRust() {
  if (!hasCommand("curl")) {
    fail("curl is required to install Rust via rustup");
    return;
  }

  log("installing Rust (stable) via rustup...");
  run('curl --proto "=https" --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y');
  const cargo = path.join(os.homedir(), ".cargo", "bin", "cargo");
  if (!existsSync(cargo)) {
    fail("Rust install finished but cargo was not found. Restart your shell and run setup again.");
    return;
  }
  log("ok Rust installed");
}

function checkRust() {
  if (hasCommand("cargo") && hasCommand("rustc")) {
    const version = execSync("rustc --version", { encoding: "utf8" }).trim();
    log(`ok ${version}`);
    return;
  }

  if (install) {
    installRust();
    return;
  }

  fail(
    "Rust is not installed. Run: curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh\n" +
      "Or rerun with: npm run setup -- --install",
  );
}

function checkMacOS() {
  if (!commandSucceeded("xcode-select -p")) {
    if (install) {
      log("installing Xcode Command Line Tools (may open a system dialog)...");
      run("xcode-select --install");
      warn("finish the Xcode CLT install, then rerun npm run setup");
      return;
    }
    fail(
      "Xcode Command Line Tools are required. Run: xcode-select --install\n" +
        "Or rerun with: npm run setup -- --install",
    );
    return;
  }
  log("ok Xcode Command Line Tools");

  if (!hasCommand("curl")) {
    fail("curl is required (used to download ffmpeg during builds)");
  } else {
    log("ok curl");
  }
}

function linuxDepsSatisfied() {
  return commandSucceeded("pkg-config --exists webkit2gtk-4.1");
}

function installLinuxDeps(distro) {
  if (!hasCommand("sudo")) {
    fail("sudo is required to install Linux system packages");
    return;
  }

  if (distro === "debian") {
    log(`installing Linux packages via apt (${LINUX_APT_PACKAGES.join(", ")})...`);
    run("sudo apt-get update");
    run(`sudo apt-get install -y ${LINUX_APT_PACKAGES.join(" ")}`);
    return;
  }

  if (distro === "fedora") {
    if (!hasCommand("dnf") && !hasCommand("yum")) {
      fail("dnf or yum is required on Fedora/RHEL systems");
      return;
    }
    const pkgManager = hasCommand("dnf") ? "dnf" : "yum";
    log(`installing Linux packages via ${pkgManager}...`);
    run(`sudo ${pkgManager} install -y ${LINUX_DNF_PACKAGES.join(" ")}`);
    return;
  }

  if (distro === "arch") {
    log("installing Linux packages via pacman...");
    run(`sudo pacman -S --needed --noconfirm ${LINUX_PACMAN_PACKAGES.join(" ")}`);
    return;
  }

  fail(
    `unsupported Linux distro "${distro ?? "unknown"}". Install Tauri 2 Linux deps manually: https://v2.tauri.app/start/prerequisites/`,
  );
}

function checkLinux() {
  const distro = readLinuxDistro();
  if (distro) {
    log(`detected Linux distro: ${distro}`);
  } else {
    warn("could not detect Linux distro from /etc/os-release");
  }

  if (!hasCommand("pkg-config")) {
    if (install && distro) {
      installLinuxDeps(distro);
    } else {
      fail(
        "pkg-config is missing. On Ubuntu 22.04+ run:\n" +
          `  sudo apt-get install -y ${LINUX_APT_PACKAGES.join(" ")}\n` +
          "Or rerun with: npm run setup -- --install",
      );
      return;
    }
  }

  if (!linuxDepsSatisfied()) {
    if (install && distro) {
      installLinuxDeps(distro);
    } else {
      fail(
        "WebKitGTK 4.1 dev libraries are missing (required by Tauri 2 on Linux).\n" +
          "Ubuntu 22.04+ example:\n" +
          `  sudo apt-get install -y ${LINUX_APT_PACKAGES.join(" ")}\n` +
          "Or rerun with: npm run setup -- --install",
      );
      return;
    }
  }

  if (!linuxDepsSatisfied()) {
    fail("Linux WebKitGTK dependencies are still missing after install attempt");
    return;
  }

  if (!hasCommand("curl")) {
    fail("curl is required (used to download ffmpeg during builds)");
  } else {
    log("ok curl");
  }

  log("ok Linux system libraries (webkit2gtk-4.1)");
}

function checkWindows() {
  if (!hasCommand("cargo")) {
    return;
  }

  const hasMsvc =
    commandSucceeded("where cl") ||
    commandSucceeded("where link") ||
    existsSync(
      "C:\\Program Files (x86)\\Microsoft Visual Studio\\2022\\BuildTools\\VC\\Tools\\MSVC",
    );

  if (!hasMsvc) {
    warn(
      "MSVC build tools not detected. Install \"Desktop development with C++\" from Visual Studio Build Tools.",
    );
  } else {
    log("ok MSVC build tools");
  }

  warn(
    "WebView2 runtime is required on Windows (usually preinstalled on Windows 10/11).",
  );
}

function runNpmInstall() {
  if (skipNpm) {
    return;
  }

  log("installing npm dependencies...");
  const npmCmd = existsSync(path.join(root, "package-lock.json")) ? "npm ci" : "npm install";
  run(npmCmd, { cwd: root });
  log("ok npm dependencies");
}

function main() {
  log("FlowCapture dev setup\n");

  checkNode();
  checkRust();

  if (process.platform === "darwin") {
    checkMacOS();
  } else if (process.platform === "linux") {
    checkLinux();
  } else if (process.platform === "win32") {
    checkWindows();
  } else {
    warn(`unsupported platform "${process.platform}" — setup checks are limited`);
  }

  if (failed) {
    console.error("\nSetup incomplete. Fix the errors above and rerun npm run setup.");
    process.exit(1);
  }

  runNpmInstall();

  log("\nSetup complete. Start the app with:");
  log("  npm run tauri:dev");
}

main();

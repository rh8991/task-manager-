// Runs firebase-tools with a Java 21+ first on PATH.
// The Firebase emulators need Java 21+, but many Windows PCs also have an old Java 8
// on the system PATH (…\Oracle\Java\java8path) that wins. This finds a newer one
// (JAVA_HOME, or a standard install folder) and puts it first, just for this command.
// Usage: node scripts/firebase.cjs <firebase args…>
const { spawnSync, spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const exe = process.platform === "win32" ? "java.exe" : "java";

function majorVersion(javaPath) {
  const r = spawnSync(javaPath, ["-version"], { encoding: "utf8" });
  if (r.error) return 0;
  const m = /version "(\d+)(?:\.(\d+))?/.exec(`${r.stderr}${r.stdout}`);
  if (!m) return 0;
  return m[1] === "1" ? Number(m[2]) : Number(m[1]);
}

function candidates() {
  const list = [];
  if (process.env.JAVA_HOME) list.push(path.join(process.env.JAVA_HOME, "bin"));
  const roots =
    process.platform === "win32"
      ? ["C:\\Program Files\\Eclipse Adoptium", "C:\\Program Files\\Java", "C:\\Program Files\\Microsoft", "C:\\Program Files\\Zulu", "C:\\Program Files\\Amazon Corretto"]
      : ["/usr/lib/jvm", "/Library/Java/JavaVirtualMachines"];
  for (const root of roots) {
    let dirs = [];
    try { dirs = fs.readdirSync(root); } catch { continue; }
    for (const d of dirs.sort().reverse()) {
      list.push(path.join(root, d, "bin"));
      list.push(path.join(root, d, "Contents", "Home", "bin"));
    }
  }
  return list;
}

const env = { ...process.env };
if (majorVersion("java") < 21) {
  const bin = candidates().find((b) => fs.existsSync(path.join(b, exe)) && majorVersion(path.join(b, exe)) >= 21);
  if (bin) {
    const key = Object.keys(env).find((k) => k.toLowerCase() === "path") || "PATH";
    env[key] = bin + path.delimiter + (env[key] || "");
    env.JAVA_HOME = path.dirname(bin);
    console.log(`Using Java from ${bin}`);
  } else {
    console.error("Java 21 or newer is needed for the Firebase emulators. Install it with:\n  winget install EclipseAdoptium.Temurin.21.JDK\nthen open a new terminal.");
    process.exit(1);
  }
}

const cli = require.resolve("firebase-tools/lib/bin/firebase.js");
const child = spawn(process.execPath, [cli, ...process.argv.slice(2)], { stdio: "inherit", env });
child.on("exit", (code) => process.exit(code ?? 1));

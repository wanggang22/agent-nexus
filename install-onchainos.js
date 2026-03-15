// Download onchainos binary directly (no curl/wget needed)
const https = require("https");
const fs = require("fs");
const path = require("path");
const os = require("os");

const INSTALL_DIR = path.join(os.homedir(), ".local", "bin");
const BINARY_PATH = path.join(INSTALL_DIR, "onchainos");

// Skip if already installed
try {
  require("child_process").execSync("onchainos --version", { stdio: "ignore" });
  console.log("[install] onchainos already available");
  process.exit(0);
} catch {}

if (fs.existsSync(BINARY_PATH)) {
  console.log("[install] onchainos already at", BINARY_PATH);
  process.exit(0);
}

// Get latest release tag from GitHub API
function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { "User-Agent": "onchainos-installer" } }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return httpsGet(res.headers.location).then(resolve, reject);
      }
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => resolve({ status: res.statusCode, data }));
      res.on("error", reject);
    }).on("error", reject);
  });
}

function downloadBinary(url, dest) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { "User-Agent": "onchainos-installer" } }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return downloadBinary(res.headers.location, dest).then(resolve, reject);
      }
      const file = fs.createWriteStream(dest);
      res.pipe(file);
      file.on("finish", () => { file.close(); resolve(); });
      file.on("error", reject);
    }).on("error", reject);
  });
}

async function main() {
  try {
    // Get latest release
    console.log("[install] Fetching latest release...");
    const { data } = await httpsGet("https://api.github.com/repos/okx/onchainos-skills/releases/latest");
    const release = JSON.parse(data);
    const tag = release.tag_name;
    console.log("[install] Latest version:", tag);

    // Determine platform
    const target = "x86_64-unknown-linux-gnu"; // Railway is Linux x86_64
    const binaryName = `onchainos-${target}`;
    const url = `https://github.com/okx/onchainos-skills/releases/download/${tag}/${binaryName}`;

    // Create install dir
    fs.mkdirSync(INSTALL_DIR, { recursive: true });

    // Download
    console.log("[install] Downloading", url);
    await downloadBinary(url, BINARY_PATH);

    // Make executable
    fs.chmodSync(BINARY_PATH, 0o755);
    console.log("[install] onchainos installed to", BINARY_PATH);

    // Verify
    const version = require("child_process").execSync(BINARY_PATH + " --version", { encoding: "utf-8" }).trim();
    console.log("[install] Verified:", version);
  } catch (e) {
    console.error("[install] Failed:", e.message);
    // Don't exit with error — let the service start anyway
  }
}

main();

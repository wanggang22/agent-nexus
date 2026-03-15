# Railway 部署 OnchainOS CLI 完整指南

## 问题背景

OnchainOS CLI 是 OKX 官方提供的链上数据查询工具（Rust 编译的二进制文件）。本地开发时通过 `curl | sh` 安装到 `~/.local/bin/onchainos`，直接可用。但 Railway 部署时遇到以下问题：

1. **Railway 容器没有预装 onchainos** — 所有数据调用返回空
2. **容器没有 curl/wget** — 无法用常规方式下载安装
3. **Nixpacks 构建阶段安装的文件不会带到运行镜像** — 构建时装了也白装
4. **Custom Start Command 路径不同** — Railway 从 repo root 执行，不是从 package 目录

## 最终解决方案

### 核心思路

用 **Node.js 的 https 模块**直接从 GitHub Releases 下载 onchainos 二进制文件（不依赖 curl/wget），在**服务启动时**（而非构建时）安装。

### 1. 创建 `install-onchainos.js`（放在 repo 根目录）

```javascript
// install-onchainos.js
const https = require("https");
const fs = require("fs");
const path = require("path");
const os = require("os");

const INSTALL_DIR = path.join(os.homedir(), ".local", "bin");
const BINARY_PATH = path.join(INSTALL_DIR, "onchainos");

// 已安装则跳过
try {
  require("child_process").execSync("onchainos --version", { stdio: "ignore" });
  console.log("[install] onchainos already available");
  process.exit(0);
} catch {}

if (fs.existsSync(BINARY_PATH)) {
  console.log("[install] onchainos already at", BINARY_PATH);
  process.exit(0);
}

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
    console.log("[install] Fetching latest release...");
    const { data } = await httpsGet(
      "https://api.github.com/repos/okx/onchainos-skills/releases/latest"
    );
    const release = JSON.parse(data);
    const tag = release.tag_name;
    console.log("[install] Latest version:", tag);

    const target = "x86_64-unknown-linux-gnu"; // Railway 是 Linux x86_64
    const binaryName = `onchainos-${target}`;
    const url = `https://github.com/okx/onchainos-skills/releases/download/${tag}/${binaryName}`;

    fs.mkdirSync(INSTALL_DIR, { recursive: true });

    console.log("[install] Downloading", url);
    await downloadBinary(url, BINARY_PATH);

    fs.chmodSync(BINARY_PATH, 0o755);
    console.log("[install] onchainos installed to", BINARY_PATH);

    const version = require("child_process")
      .execSync(BINARY_PATH + " --version", { encoding: "utf-8" }).trim();
    console.log("[install] Verified:", version);
  } catch (e) {
    console.error("[install] Failed:", e.message);
  }
}

main();
```

### 2. Railway 每个 Agent 服务的 Custom Start Command

在 Railway 控制台 → 每个服务 → Settings → Deploy → Custom Start Command：

| 服务 | Custom Start Command |
|------|---------------------|
| **gateway** | `node install-onchainos.js && PATH=/root/.local/bin:$PATH node packages/gateway/dist/index.js` |
| **signal-agent** | `node install-onchainos.js && PATH=/root/.local/bin:$PATH node packages/signal-agent/dist/server.js` |
| **analyst-agent** | `node install-onchainos.js && PATH=/root/.local/bin:$PATH node packages/analyst-agent/dist/server.js` |
| **risk-agent** | `node install-onchainos.js && PATH=/root/.local/bin:$PATH node packages/risk-agent/dist/server.js` |
| **trader-agent** | `node install-onchainos.js && PATH=/root/.local/bin:$PATH node packages/trader-agent/dist/server.js` |
| **dashboard** | 不需要改（不用 onchainos） |

### 3. 关键细节

**PATH 设置：** 必须在 node 命令前加 `PATH=/root/.local/bin:$PATH`，因为 onchainos 装到 `/root/.local/bin/`，默认 PATH 不包含这个目录。

**启动路径：** Railway 从 repo root (`/app`) 执行命令，所以：
- `install-onchainos.js` 直接在 root，可以找到
- `node packages/xxx/dist/server.js` 用完整路径，不需要 `cd`

**冷启动时间：** 第一次启动下载二进制约 5-10 秒。Railway 每次重新部署会重新下载（容器是全新的）。

## 走过的弯路

| 尝试 | 结果 | 原因 |
|------|------|------|
| `start.sh` 里 curl 安装 | 失败 | Railway 没用 package.json 的 start 脚本 |
| 环境变量 `NIXPACKS_START_CMD` | 无效 | Railway Settings UI 里的配置覆盖了环境变量 |
| 环境变量 `NIXPACKS_INSTALL_CMD` | 安装了但运行时没有 | Nixpacks 构建层和运行层分离 |
| 环境变量 `NIXPACKS_BUILD_CMD` | 同上 | 构建产物不含 ~/.local/bin |
| Custom Start Command 用 `curl` | 失败 | 容器没有 curl |
| Custom Start Command 用 `wget` | 失败 | 容器没有 wget |
| Custom Start Command 用 `node -e "..."` 内联 | crashed | URL 特殊字符被 shell 转义坏了 |
| `install.sh` 通过 Node.js 下载执行 | 失败 | install.sh 内部也需要 curl 下载二进制 |
| **Node.js 直接下载二进制** | **成功** | 不依赖任何外部工具 |

## 验证方法

部署后检查日志应该看到：
```
[install] Fetching latest release...
[install] Latest version: v1.0.5
[install] Downloading https://github.com/okx/onchainos-skills/releases/download/v1.0.5/onchainos-x86_64-unknown-linux-gnu
[install] onchainos installed to /root/.local/bin/onchainos
[install] Verified: onchainos 1.0.5
```

测试 API：
```bash
curl https://gateway-production-2ee2.up.railway.app/signals/hot-tokens?chain=base
```

应该返回真实的代币数据（有 tokenSymbol、price、marketCap 等字段）。

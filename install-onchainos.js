// Download and install onchainos CLI on Railway (no curl/wget needed)
const https = require("https");
const fs = require("fs");
const { execSync } = require("child_process");

const url = "https://raw.githubusercontent.com/okx/onchainos-skills/main/install.sh";

https.get(url, (res) => {
  if (res.statusCode === 301 || res.statusCode === 302) {
    https.get(res.headers.location, handleResponse);
  } else {
    handleResponse(res);
  }
});

function handleResponse(res) {
  let data = "";
  res.on("data", (chunk) => (data += chunk));
  res.on("end", () => {
    fs.writeFileSync("/tmp/install-onchainos.sh", data);
    try {
      execSync("sh /tmp/install-onchainos.sh", { stdio: "inherit" });
      console.log("[install] onchainos installed successfully");
    } catch (e) {
      console.error("[install] onchainos install failed:", e.message);
    }
  });
}

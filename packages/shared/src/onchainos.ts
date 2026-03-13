import { execSync } from "child_process";
import path from "path";
import os from "os";

const ONCHAINOS_PATH = path.join(os.homedir(), ".local", "bin");

export function runOnchainos(command: string): string {
  try {
    const envPath = process.env.PATH || "";
    const fullPath = envPath.includes(ONCHAINOS_PATH) ? envPath : `${ONCHAINOS_PATH};${envPath}`;

    return execSync(`onchainos ${command}`, {
      encoding: "utf-8",
      timeout: 30000,
      env: { ...process.env, PATH: fullPath },
    }).trim();
  } catch (e: any) {
    // Only log if it's not a "not found" error
    if (!e.message?.includes("not recognized") && !e.message?.includes("not found")) {
      console.error(`onchainos command failed: ${command}`, e.message?.slice(0, 200));
    }
    return "";
  }
}

export function safeJsonParse(str: string): any {
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}

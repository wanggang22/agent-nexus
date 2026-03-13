import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

export const env = {
  PRIVATE_KEY: process.env.PRIVATE_KEY!,
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY!,
  OKX_API_KEY: process.env.OKX_API_KEY || "",
  OKX_SECRET_KEY: process.env.OKX_SECRET_KEY || "",
  OKX_PASSPHRASE: process.env.OKX_PASSPHRASE || "",
  XLAYER_RPC: process.env.XLAYER_RPC || "https://rpc.xlayer.tech",
  XLAYER_CHAIN_ID: parseInt(process.env.XLAYER_CHAIN_ID || "196"),
  USDC_ADDRESS: process.env.USDC_ADDRESS || "0x74b7f16337b8972027f6196a17a631ac6de26d22",
};

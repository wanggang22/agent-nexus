/**
 * Deploy MemeLaunchFactory to X Layer
 * Run: npx tsx scripts/deploy-factory.ts
 */
import { createWalletClient, createPublicClient, http, defineChain } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { readFileSync } from "fs";

const xlayer = defineChain({
  id: 196,
  name: "X Layer",
  nativeCurrency: { name: "OKB", symbol: "OKB", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.xlayer.tech"] } },
});

const NFPM = "0x8f56331c494ea64e60ab4fb7d1cd38a09230fe86";
const WOKB = "0xe538905cf8410324e03A5A23C1c177a474D59b2b";

async function main() {
  const pk = process.env.PRIVATE_KEY as `0x${string}`;
  const account = privateKeyToAccount(pk);
  console.log("Deployer:", account.address);

  const publicClient = createPublicClient({ chain: xlayer, transport: http() });
  const walletClient = createWalletClient({ account, chain: xlayer, transport: http() });

  // Read bytecode
  const bytecode = readFileSync("contracts/out/contracts_MemeLaunchFactory_sol_MemeLaunchFactory.bin", "utf-8").trim();

  // Encode constructor args: (address nfpm, address wokb)
  const nfpmPadded = NFPM.replace("0x", "").toLowerCase().padStart(64, "0");
  const wokbPadded = WOKB.replace("0x", "").toLowerCase().padStart(64, "0");
  const deployData = ("0x" + bytecode + nfpmPadded + wokbPadded) as `0x${string}`;

  console.log("Deploying MemeLaunchFactory...");
  const hash = await walletClient.sendTransaction({
    data: deployData,
    gas: 3000000n,
  });
  console.log("TX:", hash);

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  console.log("Factory deployed at:", receipt.contractAddress);
  console.log("Status:", receipt.status);
}

main().catch(console.error);

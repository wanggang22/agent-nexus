import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with:", deployer.address);
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "OKB");

  // Deploy AgentRegistry
  const AgentRegistry = await ethers.getContractFactory("AgentRegistry");
  const registry = await AgentRegistry.deploy();
  await registry.waitForDeployment();
  const registryAddr = await registry.getAddress();
  console.log("AgentRegistry deployed to:", registryAddr);

  // Deploy PaymentLedger
  const PaymentLedger = await ethers.getContractFactory("PaymentLedger");
  const ledger = await PaymentLedger.deploy();
  await ledger.waitForDeployment();
  const ledgerAddr = await ledger.getAddress();
  console.log("PaymentLedger deployed to:", ledgerAddr);

  // Output for .env
  console.log("\n--- Add to .env ---");
  console.log(`AGENT_REGISTRY_ADDRESS=${registryAddr}`);
  console.log(`PAYMENT_LEDGER_ADDRESS=${ledgerAddr}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

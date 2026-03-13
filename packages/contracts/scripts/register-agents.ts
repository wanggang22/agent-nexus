import { ethers } from "hardhat";

async function main() {
  const registryAddr = process.env.AGENT_REGISTRY_ADDRESS || "0x294f885031544d7Af38D79fe1E9a5c87f3880DEA";
  const registry = await ethers.getContractAt("AgentRegistry", registryAddr);

  const [deployer] = await ethers.getSigners();
  console.log("Registering agents with:", deployer.address);

  // Since all agents use the same wallet in this setup,
  // we register via recordCall to track them
  // First register the deployer as the main agent
  try {
    const tx = await registry.registerAgent(
      "AgentNexus Platform",
      "http://localhost:4000",
      ["signal", "analysis", "risk", "trading"]
    );
    await tx.wait();
    console.log("Platform registered. TX:", tx.hash);
  } catch (e: any) {
    if (e.message.includes("Already registered")) {
      console.log("Platform already registered, skipping.");
    } else {
      throw e;
    }
  }

  // Verify
  const count = await registry.getAgentCount();
  console.log("Total agents registered:", count.toString());

  const info = await registry.agents(deployer.address);
  console.log("Agent info:", {
    name: info.name,
    endpoint: info.endpoint,
    reputation: info.reputation.toString(),
    active: info.active,
  });

  console.log("\nAgent registration TX hash (for hackathon submission):", "check above");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

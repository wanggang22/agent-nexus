// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";

/// @title AgentRegistry — On-chain registry for AgentNexus services
/// @notice Registers AI agents, their capabilities, and tracks usage/reputation
contract AgentRegistry is Ownable {
    struct AgentInfo {
        address wallet;
        string name;
        string endpoint;
        string[] capabilities;
        uint256 totalCalls;
        uint256 totalEarnedUSDC; // 6 decimals
        uint256 reputation;     // 0-1000
        bool active;
        uint256 registeredAt;
    }

    mapping(address => AgentInfo) public agents;
    address[] public agentList;

    event AgentRegistered(address indexed agent, string name, string endpoint);
    event AgentUpdated(address indexed agent, string name);
    event AgentDeactivated(address indexed agent);
    event CallRecorded(address indexed agent, uint256 amount, string service);
    event ReputationUpdated(address indexed agent, uint256 newScore);

    constructor() Ownable(msg.sender) {}

    function registerAgent(
        string memory name,
        string memory endpoint,
        string[] memory capabilities
    ) external {
        require(agents[msg.sender].registeredAt == 0, "Already registered");

        agents[msg.sender] = AgentInfo({
            wallet: msg.sender,
            name: name,
            endpoint: endpoint,
            capabilities: capabilities,
            totalCalls: 0,
            totalEarnedUSDC: 0,
            reputation: 500,
            active: true,
            registeredAt: block.timestamp
        });

        agentList.push(msg.sender);
        emit AgentRegistered(msg.sender, name, endpoint);
    }

    function recordCall(address agent, uint256 amountUSDC, string memory service) external onlyOwner {
        require(agents[agent].active, "Agent not active");
        agents[agent].totalCalls++;
        agents[agent].totalEarnedUSDC += amountUSDC;
        emit CallRecorded(agent, amountUSDC, service);
    }

    function updateReputation(address agent, uint256 newScore) external onlyOwner {
        require(newScore <= 1000, "Score max 1000");
        agents[agent].reputation = newScore;
        emit ReputationUpdated(agent, newScore);
    }

    function deactivateAgent(address agent) external onlyOwner {
        agents[agent].active = false;
        emit AgentDeactivated(agent);
    }

    function getAgentCount() external view returns (uint256) {
        return agentList.length;
    }

    function getAgentCapabilities(address agent) external view returns (string[] memory) {
        return agents[agent].capabilities;
    }

    function getAllAgents() external view returns (address[] memory) {
        return agentList;
    }
}

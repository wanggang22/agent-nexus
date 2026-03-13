// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";

/// @title PaymentLedger — On-chain record of all x402 payments through AgentNexus
/// @notice Provides verifiable payment history for transparency and auditing
contract PaymentLedger is Ownable {
    struct Payment {
        address payer;
        address agent;
        uint256 amountUSDC; // 6 decimals
        string service;
        uint256 timestamp;
        bytes32 x402TxHash;
    }

    Payment[] public payments;
    uint256 public totalPayments;
    uint256 public totalVolumeUSDC;

    mapping(address => uint256) public payerTotalSpent;
    mapping(address => uint256) public agentTotalEarned;

    event PaymentRecorded(
        uint256 indexed paymentId,
        address indexed payer,
        address indexed agent,
        uint256 amount,
        string service
    );

    constructor() Ownable(msg.sender) {}

    function recordPayment(
        address payer,
        address agent,
        uint256 amountUSDC,
        string memory service,
        bytes32 x402TxHash
    ) external onlyOwner {
        payments.push(Payment({
            payer: payer,
            agent: agent,
            amountUSDC: amountUSDC,
            service: service,
            timestamp: block.timestamp,
            x402TxHash: x402TxHash
        }));

        totalPayments++;
        totalVolumeUSDC += amountUSDC;
        payerTotalSpent[payer] += amountUSDC;
        agentTotalEarned[agent] += amountUSDC;

        emit PaymentRecorded(totalPayments - 1, payer, agent, amountUSDC, service);
    }

    function getPayment(uint256 id) external view returns (Payment memory) {
        require(id < payments.length, "Invalid ID");
        return payments[id];
    }

    function getRecentPayments(uint256 count) external view returns (Payment[] memory) {
        uint256 len = payments.length;
        uint256 start = len > count ? len - count : 0;
        uint256 size = len - start;

        Payment[] memory recent = new Payment[](size);
        for (uint256 i = 0; i < size; i++) {
            recent[i] = payments[start + i];
        }
        return recent;
    }
}

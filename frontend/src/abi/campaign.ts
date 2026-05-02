// src/abi/campaign.ts

export const fundarcCampaignAbi = [
  { type: "function", name: "title", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "description", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "creator", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },

  { type: "function", name: "totalRaised", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "totalWithdrawn", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "unlockedAmount", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "availableToWithdraw", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },

  { type: "function", name: "milestoneCount", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  {
    type: "function",
    name: "getMilestone",
    stateMutability: "view",
    inputs: [{ name: "index", type: "uint256" }],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "amount", type: "uint96" },
          { name: "voteStart", type: "uint40" },
          { name: "voteEnd", type: "uint40" },
          { name: "state", type: "uint8" },
          { name: "evidenceHash", type: "bytes32" },
          { name: "yesWeight", type: "uint128" },
          { name: "noWeight", type: "uint128" },
        ],
      },
    ],
  },

  { type: "function", name: "contributed", stateMutability: "view", inputs: [{ name: "", type: "address" }], outputs: [{ type: "uint256" }] },

  { type: "function", name: "contribute", stateMutability: "nonpayable", inputs: [{ name: "amount", type: "uint256" }], outputs: [] },

  { type: "function", name: "submitMilestone", stateMutability: "nonpayable", inputs: [{ name: "evidenceHash", type: "bytes32" }], outputs: [] },
  { type: "function", name: "vote", stateMutability: "nonpayable", inputs: [{ name: "milestoneIndex", type: "uint256" }, { name: "support", type: "bool" }], outputs: [] },
  { type: "function", name: "finalizeMilestone", stateMutability: "nonpayable", inputs: [{ name: "milestoneIndex", type: "uint256" }], outputs: [] },

  { type: "function", name: "withdrawUnlocked", stateMutability: "nonpayable", inputs: [{ name: "amount", type: "uint256" }], outputs: [] },

  { type: "function", name: "claimRefund", stateMutability: "nonpayable", inputs: [], outputs: [] },
  { type: "function", name: "refundableOf", stateMutability: "view", inputs: [{ name: "funder", type: "address" }], outputs: [{ type: "uint256" }] },
] as const;
// src/abi/factory.ts


export const fundarcFactoryAbi = [
  {
    type: "event",
    name: "CampaignCreated",
    inputs: [
      { indexed: true, name: "creator", type: "address" },
      { indexed: true, name: "campaign", type: "address" },
      { indexed: true, name: "campaignId", type: "uint256" },
    ],
    anonymous: false,
  },
  {
    type: "function",
    name: "createCampaign",
    stateMutability: "nonpayable",
    inputs: [
      { name: "title", type: "string" },
      { name: "description", type: "string" },
      { name: "milestoneAmounts", type: "uint96[]" },
      { name: "votingPeriod", type: "uint40" },
      { name: "quorumBps", type: "uint16" },
      { name: "passBps", type: "uint16" },
    ],
    outputs: [{ name: "campaign", type: "address" }],
  },
  { type: "function", name: "campaigns", stateMutability: "view", inputs: [{ name: "", type: "uint256" }], outputs: [{ name: "", type: "address" }] },
  { type: "function", name: "campaignsCount", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },

  // fees / revenue
  { type: "function", name: "feeBps", stateMutability: "view", inputs: [], outputs: [{ type: "uint16" }] },
  { type: "function", name: "feeTreasury", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "totalFeesCollected", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
] as const;
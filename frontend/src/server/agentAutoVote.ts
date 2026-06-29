import { randomUUID } from "node:crypto";
import { createPublicClient, http, zeroAddress, zeroHash, type PublicClient } from "viem";
import { circleFetch, DEFAULT_CIRCLE_BLOCKCHAIN, generateEntitySecretCiphertext } from "@/src/server/circle";

export const AGENT_AUTOMATION_SECRET_HEADER = "x-fundarc-agent-secret";

const CONTRACT_EXECUTION_PATH =
  process.env.CIRCLE_CONTRACT_EXECUTION_PATH ?? "/v1/w3s/developer/transactions/contractExecution";

export const campaignAutoVoteAbi = [
  { type: "function", name: "campaignState", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { type: "function", name: "creator", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "currentMilestone", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "totalRaised", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "unlockedAmount", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  {
    type: "function",
    name: "contributed",
    stateMutability: "view",
    inputs: [{ name: "", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "voteDelegate",
    stateMutability: "view",
    inputs: [{ name: "", type: "address" }],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "voteChoice",
    stateMutability: "view",
    inputs: [
      { name: "", type: "uint256" },
      { name: "", type: "address" },
    ],
    outputs: [{ type: "uint8" }],
  },
  {
    type: "function",
    name: "milestoneEvidenceURI",
    stateMutability: "view",
    inputs: [{ name: "", type: "uint256" }],
    outputs: [{ type: "string" }],
  },
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
] as const;

export type AgentAutoVoteResult = {
  action: "WAIT" | "VOTE_YES" | "VOTE_NO";
  reason?: string;
  support?: boolean;
  milestoneIndex?: string;
  transaction?: unknown;
};

export type MilestoneAutoVoteRead = {
  amount: bigint;
  voteStart: bigint;
  voteEnd: bigint;
  state: number;
  evidenceHash: `0x${string}`;
  yesWeight: bigint;
  noWeight: bigint;
};

export function isAddress(value: unknown): value is `0x${string}` {
  return typeof value === "string" && /^0x[a-fA-F0-9]{40}$/.test(value);
}

export function sameAddress(a: string, b: string) {
  return a.toLowerCase() === b.toLowerCase();
}

export function agentVoteMessage(contributor: string, campaign: string, agentWallet: string, timestamp: number) {
  return [
    "Fundarc agent automated vote",
    `Contributor: ${contributor.toLowerCase()}`,
    `Campaign: ${campaign.toLowerCase()}`,
    `Agent: ${agentWallet.toLowerCase()}`,
    `Timestamp: ${timestamp}`,
  ].join("\n");
}

export function getArcPublicClient() {
  const rpcUrl = process.env.ARC_RPC_URL ?? process.env.NEXT_PUBLIC_ARC_RPC_URL;
  if (!rpcUrl) throw new Error("ARC_RPC_URL or NEXT_PUBLIC_ARC_RPC_URL is required.");
  return createPublicClient({ transport: http(rpcUrl) });
}

export function hasAutomationSecret(request: Request) {
  const automationSecret = process.env.AGENT_AUTOMATION_SECRET;
  if (!automationSecret) return false;

  const suppliedSecret = request.headers.get(AGENT_AUTOMATION_SECRET_HEADER);
  const authorization = request.headers.get("authorization");
  return suppliedSecret === automationSecret || authorization === `Bearer ${automationSecret}`;
}

export async function runAgentAutoVote({
  client,
  contributor,
  campaign,
  agentWallet,
}: {
  client: PublicClient;
  contributor: `0x${string}`;
  campaign: `0x${string}`;
  agentWallet: `0x${string}`;
}): Promise<AgentAutoVoteResult> {
  const [state, creator, currentMilestone, totalRaised, unlockedAmount, contribution, delegate] = await Promise.all([
    client.readContract({ abi: campaignAutoVoteAbi, address: campaign, functionName: "campaignState" }),
    client.readContract({ abi: campaignAutoVoteAbi, address: campaign, functionName: "creator" }),
    client.readContract({ abi: campaignAutoVoteAbi, address: campaign, functionName: "currentMilestone" }),
    client.readContract({ abi: campaignAutoVoteAbi, address: campaign, functionName: "totalRaised" }),
    client.readContract({ abi: campaignAutoVoteAbi, address: campaign, functionName: "unlockedAmount" }),
    client.readContract({ abi: campaignAutoVoteAbi, address: campaign, functionName: "contributed", args: [contributor] }),
    client.readContract({ abi: campaignAutoVoteAbi, address: campaign, functionName: "voteDelegate", args: [contributor] }),
  ]);

  if (Number(state) !== 0) return { action: "WAIT", reason: "Campaign is not active." };
  if (sameAddress(contributor, creator)) return { action: "WAIT", reason: "Creator has no vote weight." };
  if (contribution <= 0n) return { action: "WAIT", reason: "Contributor has no vote weight." };
  if (delegate === zeroAddress || !sameAddress(delegate, agentWallet)) {
    return { action: "WAIT", reason: "Agent wallet is not the contributor delegate." };
  }

  const [milestone, evidenceURI, milestoneVoteChoice] = await Promise.all([
    client.readContract({ abi: campaignAutoVoteAbi, address: campaign, functionName: "getMilestone", args: [currentMilestone] }),
    client.readContract({ abi: campaignAutoVoteAbi, address: campaign, functionName: "milestoneEvidenceURI", args: [currentMilestone] }),
    client.readContract({ abi: campaignAutoVoteAbi, address: campaign, functionName: "voteChoice", args: [currentMilestone, contributor] }),
  ]);

  if (Number(milestoneVoteChoice) !== 0) {
    return { action: "WAIT", reason: "Contributor already voted." };
  }

  const voteStart = BigInt(milestone.voteStart);
  const voteEnd = BigInt(milestone.voteEnd);
  const amount = BigInt(milestone.amount);
  const now = BigInt(Math.floor(Date.now() / 1000));
  const requiredFunding = unlockedAmount + amount;

  if (Number(milestone.state) !== 1 || now < voteStart || now >= voteEnd) {
    return { action: "WAIT", reason: "Voting is not live." };
  }

  if (totalRaised < requiredFunding) {
    return { action: "WAIT", reason: "Milestone funding is not available." };
  }

  const hasEvidence = milestone.evidenceHash !== zeroHash || Boolean(evidenceURI);
  const support = currentMilestone === 0n || hasEvidence;
  const entitySecretCiphertext = await generateEntitySecretCiphertext();
  const blockchain = process.env.CIRCLE_BLOCKCHAIN ?? DEFAULT_CIRCLE_BLOCKCHAIN;

  const payload = await circleFetch(CONTRACT_EXECUTION_PATH, {
    method: "POST",
    body: JSON.stringify({
      idempotencyKey: randomUUID(),
      entitySecretCiphertext,
      walletAddress: agentWallet,
      blockchain,
      contractAddress: campaign,
      abiFunctionSignature: "voteFor(address,uint256,bool)",
      abiParameters: [contributor, currentMilestone.toString(), support],
      feeLevel: process.env.CIRCLE_TRANSACTION_FEE_LEVEL ?? "MEDIUM",
    }),
  });

  return {
    action: support ? "VOTE_YES" : "VOTE_NO",
    support,
    milestoneIndex: currentMilestone.toString(),
    transaction: payload?.data ?? payload,
  };
}

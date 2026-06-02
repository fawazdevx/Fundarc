import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { createPublicClient, http, verifyMessage, zeroAddress, zeroHash } from "viem";
import { circleFetch, DEFAULT_CIRCLE_BLOCKCHAIN, generateEntitySecretCiphertext } from "@/src/server/circle";

const MAX_SIGNATURE_AGE_MS = 5 * 60 * 1000;
const CONTRACT_EXECUTION_PATH =
  process.env.CIRCLE_CONTRACT_EXECUTION_PATH ?? "/v1/w3s/developer/transactions/contractExecution";

const campaignAbi = [
  { type: "function", name: "campaignState", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { type: "function", name: "creator", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "currentMilestone", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "totalRaised", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "unlockedAmount", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "contributed", stateMutability: "view", inputs: [{ name: "", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "voteDelegate", stateMutability: "view", inputs: [{ name: "", type: "address" }], outputs: [{ type: "address" }] },
  {
    type: "function",
    name: "voteChoice",
    stateMutability: "view",
    inputs: [{ name: "", type: "uint256" }, { name: "", type: "address" }],
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

function isAddress(value: unknown): value is `0x${string}` {
  return typeof value === "string" && /^0x[a-fA-F0-9]{40}$/.test(value);
}

function agentVoteMessage(contributor: string, campaign: string, agentWallet: string, timestamp: number) {
  return [
    "Fundarc agent automated vote",
    `Contributor: ${contributor.toLowerCase()}`,
    `Campaign: ${campaign.toLowerCase()}`,
    `Agent: ${agentWallet.toLowerCase()}`,
    `Timestamp: ${timestamp}`,
  ].join("\n");
}

function sameAddress(a: string, b: string) {
  return a.toLowerCase() === b.toLowerCase();
}

function publicClient() {
  const rpcUrl = process.env.ARC_RPC_URL ?? process.env.NEXT_PUBLIC_ARC_RPC_URL;
  if (!rpcUrl) throw new Error("ARC_RPC_URL or NEXT_PUBLIC_ARC_RPC_URL is required.");
  return createPublicClient({ transport: http(rpcUrl) });
}

async function requestAuthorized(request: NextRequest, body: any) {
  const automationSecret = process.env.AGENT_AUTOMATION_SECRET;
  const suppliedSecret = request.headers.get("x-fundarc-agent-secret");
  if (automationSecret && suppliedSecret === automationSecret) return true;

  const contributor = body?.contributor;
  const campaign = body?.campaign;
  const agentWallet = body?.agentWallet;
  const timestamp = Number(body?.timestamp);
  const signature = body?.signature;

  if (!Number.isFinite(timestamp) || Math.abs(Date.now() - timestamp) > MAX_SIGNATURE_AGE_MS) return false;
  if (typeof signature !== "string") return false;

  return verifyMessage({
    address: contributor,
    message: agentVoteMessage(contributor, campaign, agentWallet, timestamp),
    signature: signature as `0x${string}`,
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const contributor = body?.contributor;
    const campaign = body?.campaign;
    const agentWallet = body?.agentWallet;

    if (!isAddress(contributor) || !isAddress(campaign) || !isAddress(agentWallet)) {
      return NextResponse.json({ error: "Contributor, campaign, and agent wallet addresses are required." }, { status: 400 });
    }

    if (!(await requestAuthorized(request, body))) {
      return NextResponse.json({ error: "Unauthorized agent vote request." }, { status: 401 });
    }

    const client = publicClient();
    const [
      state,
      creator,
      currentMilestone,
      totalRaised,
      unlockedAmount,
      contribution,
      delegate,
    ] = await Promise.all([
      client.readContract({ abi: campaignAbi, address: campaign, functionName: "campaignState" }),
      client.readContract({ abi: campaignAbi, address: campaign, functionName: "creator" }),
      client.readContract({ abi: campaignAbi, address: campaign, functionName: "currentMilestone" }),
      client.readContract({ abi: campaignAbi, address: campaign, functionName: "totalRaised" }),
      client.readContract({ abi: campaignAbi, address: campaign, functionName: "unlockedAmount" }),
      client.readContract({ abi: campaignAbi, address: campaign, functionName: "contributed", args: [contributor] }),
      client.readContract({ abi: campaignAbi, address: campaign, functionName: "voteDelegate", args: [contributor] }),
    ]);

    if (Number(state) !== 0) return NextResponse.json({ action: "WAIT", reason: "Campaign is not active." });
    if (sameAddress(contributor, creator)) return NextResponse.json({ action: "WAIT", reason: "Creator has no vote weight." });
    if (contribution <= 0n) return NextResponse.json({ action: "WAIT", reason: "Contributor has no vote weight." });
    if (delegate === zeroAddress || !sameAddress(delegate, agentWallet)) {
      return NextResponse.json({ action: "WAIT", reason: "Agent wallet is not the contributor delegate." });
    }

    const [milestone, evidenceURI, milestoneVoteChoice] = await Promise.all([
      client.readContract({ abi: campaignAbi, address: campaign, functionName: "getMilestone", args: [currentMilestone] }),
      client.readContract({ abi: campaignAbi, address: campaign, functionName: "milestoneEvidenceURI", args: [currentMilestone] }),
      client.readContract({ abi: campaignAbi, address: campaign, functionName: "voteChoice", args: [currentMilestone, contributor] }),
    ]);

    if (Number(milestoneVoteChoice) !== 0) {
      return NextResponse.json({ action: "WAIT", reason: "Contributor already voted." });
    }

    const voteStart = BigInt(milestone.voteStart);
    const voteEnd = BigInt(milestone.voteEnd);
    const amount = BigInt(milestone.amount);
    const now = BigInt(Math.floor(Date.now() / 1000));
    const requiredFunding = unlockedAmount + amount;

    if (Number(milestone.state) !== 1 || now < voteStart || now >= voteEnd) {
      return NextResponse.json({ action: "WAIT", reason: "Voting is not live." });
    }

    if (totalRaised < requiredFunding) {
      return NextResponse.json({ action: "WAIT", reason: "Milestone funding is not available." });
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

    return NextResponse.json({
      action: support ? "VOTE_YES" : "VOTE_NO",
      support,
      milestoneIndex: currentMilestone.toString(),
      transaction: payload?.data ?? payload,
    });
  } catch (error: any) {
    console.error(error);
    return NextResponse.json(
      { error: error?.message ?? "Failed to run agent auto-vote." },
      { status: error?.message?.includes("required") ? 503 : 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { parseAbiItem, zeroAddress, type AbiEvent } from "viem";
import { fundarcFactoryAbi } from "@/src/abi/factory";
import {
  campaignAutoVoteAbi,
  getArcPublicClient,
  hasAutomationSecret,
  isAddress,
  runAgentAutoVote,
  sameAddress,
} from "@/src/server/agentAutoVote";
import { HIDDEN_LEGACY_CAMPAIGN_COUNT } from "@/src/config/campaigns";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DEFAULT_CAMPAIGN_LIMIT = 20;
const DEFAULT_CONTRIBUTOR_LIMIT = 60;
const DEFAULT_BLOCK_LOOKBACK = 200_000n;
const LOG_BLOCK_RANGE = 9_999n;

type DelegateCandidate = {
  contributor: `0x${string}`;
  agentWallet: `0x${string}`;
};

function numberEnv(name: string, fallback: number, min: number, max: number) {
  const value = Number(process.env[name]);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(value)));
}

function bigintEnv(name: string, fallback: bigint) {
  const value = process.env[name];
  if (!value) return fallback;

  try {
    const parsed = BigInt(value);
    return parsed > 0n ? parsed : fallback;
  } catch {
    return fallback;
  }
}

async function getLogsInChunks({
  client,
  address,
  event,
  fromBlock,
  toBlock,
}: {
  client: ReturnType<typeof getArcPublicClient>;
  address: `0x${string}`;
  event: AbiEvent;
  fromBlock: bigint;
  toBlock: bigint;
}) {
  const logs = [];
  let chunkStart = fromBlock;

  while (chunkStart <= toBlock) {
    const chunkEnd = chunkStart + LOG_BLOCK_RANGE > toBlock ? toBlock : chunkStart + LOG_BLOCK_RANGE;
    const chunkLogs = await client.getLogs({
      address,
      event,
      fromBlock: chunkStart,
      toBlock: chunkEnd,
    });
    logs.push(...chunkLogs);
    chunkStart = chunkEnd + 1n;
  }

  return logs;
}

async function getLatestDelegates({
  client,
  campaign,
  fromBlock,
  toBlock,
}: {
  client: ReturnType<typeof getArcPublicClient>;
  campaign: `0x${string}`;
  fromBlock: bigint;
  toBlock: bigint;
}) {
  const event = parseAbiItem("event VoteDelegateUpdated(address indexed funder, address indexed delegate)") as AbiEvent;
  const logs = await getLogsInChunks({ client, address: campaign, event, fromBlock, toBlock });
  const latestByContributor = new Map<`0x${string}`, `0x${string}`>();

  for (const log of logs) {
    const args = log.args as { funder?: unknown; delegate?: unknown };
    const funder = args.funder;
    const delegate = args.delegate;
    if (!isAddress(funder) || !isAddress(delegate)) continue;

    if (delegate === zeroAddress) latestByContributor.delete(funder);
    else latestByContributor.set(funder, delegate);
  }

  return Array.from(latestByContributor, ([contributor, agentWallet]) => ({ contributor, agentWallet }));
}

export async function POST(request: NextRequest) {
  try {
    if (!hasAutomationSecret(request)) {
      return NextResponse.json({ error: "Unauthorized automation sweep." }, { status: 401 });
    }

    const factory = process.env.NEXT_PUBLIC_FACTORY_ADDRESS;
    if (!isAddress(factory)) {
      return NextResponse.json({ error: "NEXT_PUBLIC_FACTORY_ADDRESS is required." }, { status: 503 });
    }

    const client = getArcPublicClient();
    const campaignLimit = numberEnv("AGENT_SWEEP_CAMPAIGN_LIMIT", DEFAULT_CAMPAIGN_LIMIT, 1, 100);
    const contributorLimit = numberEnv("AGENT_SWEEP_CONTRIBUTOR_LIMIT", DEFAULT_CONTRIBUTOR_LIMIT, 1, 250);
    const offset = numberEnv("AGENT_SWEEP_CAMPAIGN_OFFSET", 0, 0, 1_000_000);
    const blockLookback = bigintEnv("AGENT_SWEEP_BLOCK_LOOKBACK", DEFAULT_BLOCK_LOOKBACK);
    const latestBlock = await client.getBlockNumber();
    const fromBlock = latestBlock > blockLookback ? latestBlock - blockLookback : 0n;
    const campaignCount = await client.readContract({
      abi: fundarcFactoryAbi,
      address: factory,
      functionName: "campaignsCount",
    });

    const totalCampaigns = Number(campaignCount);
    const discoverableCampaigns = Math.max(0, totalCampaigns - HIDDEN_LEGACY_CAMPAIGN_COUNT);
    const scanCount = Math.min(campaignLimit, Math.max(0, discoverableCampaigns - offset));
    const campaignIndexes = Array.from({ length: scanCount }, (_, i) => BigInt(totalCampaigns - 1 - offset - i));
    const campaignAddresses = await Promise.all(
      campaignIndexes.map((index) =>
        client.readContract({
          abi: fundarcFactoryAbi,
          address: factory,
          functionName: "campaigns",
          args: [index],
        })
      )
    );

    const summary = {
      scannedCampaigns: 0,
      campaignOffset: offset,
      activeVotingCampaigns: 0,
      delegateCandidates: 0,
      attemptedVotes: 0,
      submittedVotes: 0,
      waited: 0,
      errors: 0,
      results: [] as Array<{
        campaign: `0x${string}`;
        contributor?: `0x${string}`;
        agentWallet?: `0x${string}`;
        action: string;
        reason?: string;
        error?: string;
      }>,
    };

    let processedContributors = 0;

    for (const campaign of campaignAddresses) {
      if (processedContributors >= contributorLimit) break;
      if (!isAddress(campaign)) continue;

      summary.scannedCampaigns += 1;

      const [state, currentMilestone] = await Promise.all([
        client.readContract({ abi: campaignAutoVoteAbi, address: campaign, functionName: "campaignState" }),
        client.readContract({ abi: campaignAutoVoteAbi, address: campaign, functionName: "currentMilestone" }),
      ]);

      if (Number(state) !== 0) continue;

      const milestone = await client.readContract({
        abi: campaignAutoVoteAbi,
        address: campaign,
        functionName: "getMilestone",
        args: [currentMilestone],
      });
      const now = BigInt(Math.floor(Date.now() / 1000));
      const isVotingLive = Number(milestone.state) === 1 && now >= BigInt(milestone.voteStart) && now < BigInt(milestone.voteEnd);
      if (!isVotingLive) continue;

      summary.activeVotingCampaigns += 1;

      let delegates: DelegateCandidate[] = [];
      try {
        delegates = await getLatestDelegates({ client, campaign, fromBlock, toBlock: latestBlock });
      } catch (error: any) {
        summary.errors += 1;
        summary.results.push({ campaign, action: "ERROR", error: error?.message ?? "Failed to load delegate events." });
        continue;
      }

      summary.delegateCandidates += delegates.length;

      for (const { contributor, agentWallet } of delegates) {
        if (processedContributors >= contributorLimit) break;
        if (sameAddress(contributor, agentWallet)) continue;

        processedContributors += 1;
        summary.attemptedVotes += 1;

        try {
          const result = await runAgentAutoVote({ client, contributor, campaign, agentWallet });
          if (result.action === "VOTE_YES" || result.action === "VOTE_NO") summary.submittedVotes += 1;
          else summary.waited += 1;

          summary.results.push({
            campaign,
            contributor,
            agentWallet,
            action: result.action,
            reason: result.reason,
          });
        } catch (error: any) {
          summary.errors += 1;
          summary.results.push({
            campaign,
            contributor,
            agentWallet,
            action: "ERROR",
            error: error?.message ?? "Agent vote failed.",
          });
        }
      }
    }

    return NextResponse.json(summary);
  } catch (error: any) {
    console.error(error);
    return NextResponse.json(
      { error: error?.message ?? "Failed to run auto-vote sweep." },
      { status: error?.message?.includes("required") ? 503 : 500 }
    );
  }
}

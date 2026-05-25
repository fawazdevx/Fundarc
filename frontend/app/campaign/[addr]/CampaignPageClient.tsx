// app/campaign/[addr]/CampaignPageClient.tsx
// console.log("CampaignPageClient version: 2026-05-02-voteStart-fix");

"use client";

import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { formatUnits, isAddress, parseAbiItem, parseUnits, zeroAddress, zeroHash } from "viem";
import type { AbiEvent } from "viem";
import {
  useAccount,
  usePublicClient,
  useReadContract,
  useReadContracts,
  useWriteContract,
} from "wagmi";
import { fundarcCampaignAbi } from "@/src/abi/campaign";
import { erc20Abi } from "@/src/abi/erc20";
import { ArcNameLabel } from "@/src/components/ArcNameLabel";
import { CreatorReputationCard } from "@/src/components/CreatorReputationCard";
import { useCreatorReputation } from "@/src/hooks/useCreatorReputation";
import type { CreatorReputation, ReputationCampaign } from "@/src/hooks/useCreatorReputation";
import {
  ExternalLink,
  RefreshCcw,
  ThumbsDown,
  ThumbsUp,
  Flag,
  Upload,
  Send,
  Wallet,
  Bot,
  ShieldCheck,
  WandSparkles,
} from "lucide-react";

const USDC = process.env.NEXT_PUBLIC_USDC_ADDRESS as `0x${string}`;
const FACTORY = process.env.NEXT_PUBLIC_FACTORY_ADDRESS as `0x${string}`;
const EXPLORER = process.env.NEXT_PUBLIC_EXPLORER!;
const CONTRIBUTOR_LOOKUP_TIMEOUT_MS = 12_000;
const RPC_CHUNK_TIMEOUT_MS = 6_000;
const LOG_BLOCK_RANGE = 9_999n;
const MINIMUM_CONTRIBUTION_USDC = 10;
const MINIMUM_CONTRIBUTION = 10n * 1_000_000n;

function cleanCampaignDescription(description: string) {
  return description.replace(/\n?\[Fundarc category:[^\]]+\]\s*$/i, "").trim();
}

function addrUrl(a: string) {
  return `${EXPLORER}/address/${a}`;
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string) {
  let timeoutId: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), ms);
  });

  return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId));
}

async function getLogsInChunks(
  getLogs: (fromBlock: bigint, toBlock: bigint) => Promise<any[]>,
  fromBlock: bigint,
  toBlock: bigint,
  startedAt: number
) {
  const logs = [];
  let chunkStart = fromBlock;

  while (chunkStart <= toBlock) {
    if (Date.now() - startedAt > CONTRIBUTOR_LOOKUP_TIMEOUT_MS) {
      throw new Error("Contributor lookup timed out. Try refresh again.");
    }

    const chunkEnd = chunkStart + LOG_BLOCK_RANGE > toBlock ? toBlock : chunkStart + LOG_BLOCK_RANGE;
    const chunkLogs = await withTimeout(
      getLogs(chunkStart, chunkEnd),
      RPC_CHUNK_TIMEOUT_MS,
      "RPC log request timed out. Try again in a moment."
    );
    logs.push(...chunkLogs);
    chunkStart = chunkEnd + 1n;
  }

  return logs;
}

async function findCampaignCreatedBlock(
  publicClient: NonNullable<ReturnType<typeof usePublicClient>>,
  campaign: `0x${string}`,
  event: AbiEvent,
  latestBlock: bigint,
  minBlock: bigint,
  startedAt: number
) {
  let chunkEnd = latestBlock;

  while (chunkEnd >= minBlock) {
    if (Date.now() - startedAt > CONTRIBUTOR_LOOKUP_TIMEOUT_MS) return minBlock;

    const chunkStart =
      chunkEnd > minBlock + LOG_BLOCK_RANGE ? chunkEnd - LOG_BLOCK_RANGE : minBlock;
    const logs = await withTimeout(
      publicClient.getLogs({
        address: FACTORY,
        event,
        args: { campaign },
        fromBlock: chunkStart,
        toBlock: chunkEnd,
      }),
      RPC_CHUNK_TIMEOUT_MS,
      "Campaign creation lookup timed out. Try again in a moment."
    );

    if (logs[0]?.blockNumber !== undefined) return logs[0].blockNumber;
    if (chunkStart === minBlock) break;
    chunkEnd = chunkStart - 1n;
  }

  return minBlock;
}

function secondsToHuman(secs: number) {
  if (secs <= 0) return "0s";
  const d = Math.floor(secs / 86400);
  const h = Math.floor((secs % 86400) / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  const parts: string[] = [];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  if (!parts.length) parts.push(`${s}s`);
  return parts.join(" ");
}

function formatCreatedAt(timestamp: number) {
  if (!timestamp) return "Creation time unavailable";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(timestamp * 1000));
}

function campaignStateLabel(state: number) {
  if (state === 1) return "Canceled";
  if (state === 2) return "Failed";
  if (state === 3) return "Successful";
  return "Active";
}

type MilestoneObj = {
  amount: bigint;
  voteStart: bigint;
  voteEnd: bigint;
  state: number;
  evidenceHash: `0x${string}`;
  yesWeight: bigint;
  noWeight: bigint;
};

type Contributor = {
  address: `0x${string}`;
  amount: bigint;
  contributions: number;
};

type EvidenceUploadResponse = {
  cid: string;
  uri: string;
  hash: `0x${string}`;
  name: string;
  size: number;
  type: string;
};

type MilestoneAgentReview = {
  recommendation: "Approve" | "Reject" | "Wait";
  tone: "success" | "warn" | "danger";
  confidence: number;
  summary: string;
  checks: string[];
  risks: string[];
  nextSteps: string[];
};

type VotingAssistantPlan = {
  ready: boolean;
  suggestedSupport?: boolean;
  label: string;
  summary: string;
  blockers: string[];
  reasons: string[];
};

function asBigint(v: unknown): bigint {
  if (typeof v === "bigint") return v;
  if (typeof v === "number") return BigInt(v);
  return 0n;
}

function asNumber(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "bigint") return Number(v);
  return 0;
}

function getErrorMessage(e: any, fallback: string) {
  return e?.shortMessage ?? e?.message ?? fallback;
}

function isBytes32Hex(value: string) {
  return /^0x[0-9a-fA-F]{64}$/.test(value);
}

function ipfsUrl(uri: string) {
  if (!uri.startsWith("ipfs://")) return uri;
  return `https://gateway.pinata.cloud/ipfs/${uri.replace("ipfs://", "")}`;
}

function milestoneStateName(state: number) {
  if (state === 1) return "Voting";
  if (state === 2) return "Approved";
  if (state === 3) return "Rejected";
  if (state === 4) return "Finalized";
  return "Pending submission";
}

function formatPercent(numerator: bigint, denominator: bigint) {
  if (denominator <= 0n) return "0%";
  return `${Number((numerator * 10_000n) / denominator / 100n)}%`;
}

function buildMilestoneAgentReview({
  index,
  amount,
  state,
  evidenceHash,
  evidenceURI,
  voteStart,
  voteEnd,
  yesWeight,
  noWeight,
  now,
  totalRaised,
  requiredFunding,
  creatorReputation,
  campaignHistory,
}: {
  index: number;
  amount: bigint;
  state: number;
  evidenceHash: `0x${string}`;
  evidenceURI: string;
  voteStart: bigint;
  voteEnd: bigint;
  yesWeight: bigint;
  noWeight: bigint;
  now: number;
  totalRaised: bigint;
  requiredFunding: bigint;
  creatorReputation?: CreatorReputation;
  campaignHistory?: ReputationCampaign;
}): MilestoneAgentReview {
  const checks: string[] = [];
  const risks: string[] = [];
  const nextSteps: string[] = [];
  const participated = yesWeight + noWeight;
  const hasEvidenceHash = evidenceHash !== zeroHash;
  const hasEvidence = hasEvidenceHash || evidenceURI.length > 0;
  const votingConfigured = voteStart > 0n && voteEnd > 0n;
  const isVotingLive = votingConfigured && BigInt(now) >= voteStart && BigInt(now) < voteEnd;
  const hasVotingEnded = votingConfigured && BigInt(now) >= voteEnd;
  const evidenceRequired = index > 0;
  let score = 0;

  if (totalRaised >= requiredFunding) {
    checks.push(`Funding is available for this ${formatUnits(amount, 6)} USDC tranche.`);
    score += 1;
  } else {
    risks.push(`Campaign needs ${formatUnits(requiredFunding - totalRaised, 6)} more USDC before this tranche is fully funded.`);
    score -= 2;
  }

  if (hasEvidence) {
    checks.push(evidenceURI ? "Creator attached IPFS evidence for contributor review." : "Creator submitted an onchain evidence hash.");
    score += evidenceURI ? 2 : 1;
  } else if (evidenceRequired) {
    risks.push("No milestone evidence is attached yet.");
    score -= 3;
  } else {
    checks.push("First milestone can be treated as upfront funding if contributors accept the campaign plan.");
  }

  if (creatorReputation) {
    checks.push(`Creator reputation: ${creatorReputation.label} (${creatorReputation.score}).`);
    if (creatorReputation.score >= 55) score += 2;
    else if (creatorReputation.score >= 25) score += 1;
    else score -= 1;

    if (creatorReputation.failedCampaigns > 0 || creatorReputation.canceledCampaigns > 0) {
      risks.push("Creator has failed or canceled campaign history.");
      score -= 2;
    }
  } else {
    risks.push("Creator has no established Fundarc reputation yet.");
    score -= 1;
  }

  if (campaignHistory) {
    if (campaignHistory.externalContributors >= 3) {
      checks.push(`${campaignHistory.externalContributors} external contributors are recorded for this campaign.`);
      score += 1;
    } else {
      risks.push("External contributor signal is still thin.");
      score -= 1;
    }

    if (campaignHistory.selfFundedAmount > campaignHistory.externalRaised && campaignHistory.selfFundedAmount > 0n) {
      risks.push("Self-funded amount is higher than external funding.");
      score -= 1;
    }
  }

  if (participated > 0n) {
    const yesShare = formatPercent(yesWeight, participated);
    checks.push(`Current vote split is ${yesShare} YES by contribution weight.`);
    if (yesWeight > noWeight) score += 1;
    if (noWeight > yesWeight) score -= 1;
  } else if (isVotingLive) {
    risks.push("Voting is live but no contributor weight has participated yet.");
  }

  if (!votingConfigured) {
    nextSteps.push("Wait for the creator to submit this milestone and open voting.");
  } else if (isVotingLive) {
    nextSteps.push("Review the evidence link/hash before voting.");
    nextSteps.push("Vote before the current milestone window closes.");
  } else if (hasVotingEnded && state === 1) {
    nextSteps.push("Voting has ended. Anyone can finalize the milestone result.");
  } else if (state === 4) {
    nextSteps.push("Milestone is finalized. Review the next pending milestone if one exists.");
  }

  if (risks.length > 0) {
    nextSteps.push("Treat this review as a decision aid, not an automatic vote.");
  }

  if (!votingConfigured || state === 0) {
    return {
      recommendation: "Wait",
      tone: "warn",
      confidence: Math.min(78, Math.max(35, 52 + score * 6)),
      summary: "The agent cannot recommend approval until the milestone is submitted and the voting window is open.",
      checks,
      risks,
      nextSteps,
    };
  }

  if (score >= 3) {
    return {
      recommendation: "Approve",
      tone: "success",
      confidence: Math.min(92, 62 + score * 6),
      summary: "Evidence, funding, and reputation signals are strong enough for a positive contributor review.",
      checks,
      risks,
      nextSteps,
    };
  }

  if (score <= -2) {
    return {
      recommendation: "Reject",
      tone: "danger",
      confidence: Math.min(88, 58 + Math.abs(score) * 6),
      summary: "The review found material risk in the evidence, funding, or creator history for this milestone.",
      checks,
      risks,
      nextSteps,
    };
  }

  return {
    recommendation: "Wait",
    tone: "warn",
    confidence: Math.min(82, Math.max(48, 58 + score * 5)),
    summary: "Signals are mixed. Contributors should inspect the evidence and wait for stronger participation before deciding.",
    checks,
    risks,
    nextSteps,
  };
}

function buildVotingAssistantPlan({
  agentReview,
  isConnected,
  isCreator,
  myContribution,
  existingVote,
  isVotingLive,
  isCurrentMilestone,
  secondsLeft,
}: {
  agentReview: MilestoneAgentReview;
  isConnected: boolean;
  isCreator: boolean;
  myContribution: bigint;
  existingVote: number;
  isVotingLive: boolean;
  isCurrentMilestone: boolean;
  secondsLeft: number;
}): VotingAssistantPlan {
  const blockers: string[] = [];
  const reasons: string[] = [];

  if (!isConnected) blockers.push("Connect a wallet to use the voting assistant.");
  if (!isCurrentMilestone) blockers.push("Only the current milestone can receive votes.");
  if (!isVotingLive) blockers.push("Voting is not live for this milestone.");
  if (isCreator) blockers.push("Creators do not receive voting weight on their own campaign.");
  if (myContribution <= 0n) blockers.push("This wallet has no contribution weight for this campaign.");
  if (existingVote === 1) blockers.push("This wallet already voted YES on this milestone.");
  if (existingVote === 2) blockers.push("This wallet already voted NO on this milestone.");

  if (myContribution > 0n) {
    reasons.push(`Your voting weight is ${formatUnits(myContribution, 6)} USDC.`);
  }

  if (secondsLeft > 0 && isVotingLive) {
    reasons.push(`Voting window closes in ${secondsToHuman(secondsLeft)}.`);
  }

  if (agentReview.recommendation === "Approve") {
    reasons.push("The milestone review found enough positive evidence to support approval.");
    return {
      ready: blockers.length === 0,
      suggestedSupport: true,
      label: "Assist Vote YES",
      summary: "The assistant recommends a YES vote for this milestone.",
      blockers,
      reasons,
    };
  }

  if (agentReview.recommendation === "Reject") {
    reasons.push("The milestone review found material risk, so the assistant recommends rejection.");
    return {
      ready: blockers.length === 0,
      suggestedSupport: false,
      label: "Assist Vote NO",
      summary: "The assistant recommends a NO vote for this milestone.",
      blockers,
      reasons,
    };
  }

  reasons.push("The milestone review is not confident enough to pick YES or NO.");
  return {
    ready: false,
    label: "Assistant Waiting",
    summary: "The assistant recommends waiting until the review signals are clearer.",
    blockers: blockers.length > 0 ? blockers : ["No assisted vote is available while the recommendation is Wait."],
    reasons,
  };
}

export default function CampaignPageClient({ addr }: { addr: string }) {
  const campaign = addr as `0x${string}`;

  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync, isPending } = useWriteContract();

  const [contribution, setContribution] = useState("10");
  const [evidenceHash, setEvidenceHash] = useState<string>(zeroHash);
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [evidenceUpload, setEvidenceUpload] = useState<EvidenceUploadResponse | null>(null);
  const [withdrawAmt, setWithdrawAmt] = useState("1");
  const [agentEmail, setAgentEmail] = useState("");
  const [delegateInput, setDelegateInput] = useState("");
  const [contributors, setContributors] = useState<Contributor[]>([]);
  const [contributorsLoading, setContributorsLoading] = useState(false);
  const [contributorsLoaded, setContributorsLoaded] = useState(false);
  const [contributorsError, setContributorsError] = useState<string | null>(null);

  const baseReads = useReadContracts({
    contracts: [
      { abi: fundarcCampaignAbi, address: campaign, functionName: "title" },
      { abi: fundarcCampaignAbi, address: campaign, functionName: "description" },
      { abi: fundarcCampaignAbi, address: campaign, functionName: "creator" },
      { abi: fundarcCampaignAbi, address: campaign, functionName: "totalRaised" },
      { abi: fundarcCampaignAbi, address: campaign, functionName: "unlockedAmount" },
      { abi: fundarcCampaignAbi, address: campaign, functionName: "totalWithdrawn" },
      { abi: fundarcCampaignAbi, address: campaign, functionName: "availableToWithdraw" },
      { abi: fundarcCampaignAbi, address: campaign, functionName: "milestoneCount" },
      { abi: fundarcCampaignAbi, address: campaign, functionName: "createdAt" },
      { abi: fundarcCampaignAbi, address: campaign, functionName: "campaignState" },
      { abi: fundarcCampaignAbi, address: campaign, functionName: "currentMilestone" },
    ],
  });

  const title =
    baseReads.data?.[0]?.status === "success"
      ? (baseReads.data?.[0].result as string)
      : undefined;
  const description =
    baseReads.data?.[1]?.status === "success"
      ? cleanCampaignDescription(baseReads.data?.[1].result as string)
      : undefined;
  const creator =
    baseReads.data?.[2]?.status === "success"
      ? (baseReads.data?.[2].result as string)
      : undefined;
  const creatorReputation = useCreatorReputation(creator);

  const totalRaised =
    (baseReads.data?.[3]?.status === "success"
      ? (baseReads.data?.[3].result as bigint)
      : undefined) ?? 0n;
  const unlockedAmount =
    (baseReads.data?.[4]?.status === "success"
      ? (baseReads.data?.[4].result as bigint)
      : undefined) ?? 0n;
  const totalWithdrawn =
    (baseReads.data?.[5]?.status === "success"
      ? (baseReads.data?.[5].result as bigint)
      : undefined) ?? 0n;
  const availableToWithdraw =
    (baseReads.data?.[6]?.status === "success"
      ? (baseReads.data?.[6].result as bigint)
      : undefined) ?? 0n;

  const milestoneCount = Number(
    (baseReads.data?.[7]?.status === "success"
      ? (baseReads.data?.[7].result as bigint)
      : undefined) ?? 0n
  );
  const createdAt = asNumber(
    baseReads.data?.[8]?.status === "success" ? baseReads.data?.[8].result : 0
  );
  const campaignState = asNumber(
    baseReads.data?.[9]?.status === "success" ? baseReads.data?.[9].result : 0
  );
  const currentMilestoneIndex = asNumber(
    baseReads.data?.[10]?.status === "success" ? baseReads.data?.[10].result : 0
  );

  const milestonesReads = useMemo(
    () =>
      Array.from({ length: milestoneCount }, (_, i) => ({
        abi: fundarcCampaignAbi,
        address: campaign,
        functionName: "getMilestone" as const,
        args: [BigInt(i)] as const,
      })),
    [milestoneCount, campaign]
  );

  const milestones = useReadContracts({
    contracts: milestonesReads,
    query: { enabled: milestoneCount > 0 },
  });

  const evidenceReads = useMemo(
    () =>
      Array.from({ length: milestoneCount }, (_, i) => ({
        abi: fundarcCampaignAbi,
        address: campaign,
        functionName: "milestoneEvidenceURI" as const,
        args: [BigInt(i)] as const,
      })),
    [milestoneCount, campaign]
  );

  const evidenceURIs = useReadContracts({
    contracts: evidenceReads,
    query: { enabled: milestoneCount > 0 },
  });

  const voteChoiceReads = useMemo(
    () =>
      Array.from({ length: milestoneCount }, (_, i) => ({
        abi: fundarcCampaignAbi,
        address: campaign,
        functionName: "voteChoice" as const,
        args: [BigInt(i), address ?? "0x0000000000000000000000000000000000000000"] as const,
      })),
    [address, campaign, milestoneCount]
  );

  const myVoteChoices = useReadContracts({
    contracts: voteChoiceReads,
    query: { enabled: !!address && milestoneCount > 0 },
  });

  const totalRequested = useMemo(() => {
    if (!milestones.data) return 0n;
    return milestones.data.reduce((acc, item) => {
      if (item.status !== "success") return acc;
      const m = item.result as unknown as MilestoneObj;
      return acc + asBigint(m.amount);
    }, 0n);
  }, [milestones.data]);

  const myContrib = useReadContract({
    abi: fundarcCampaignAbi,
    address: campaign,
    functionName: "contributed",
    args: [address ?? "0x0000000000000000000000000000000000000000"],
    query: { enabled: !!address },
  });

  const myRefundable = useReadContract({
    abi: fundarcCampaignAbi,
    address: campaign,
    functionName: "refundableOf",
    args: [address ?? "0x0000000000000000000000000000000000000000"],
    query: { enabled: !!address },
  });

  const currentVoteDelegate = useReadContract({
    abi: fundarcCampaignAbi,
    address: campaign,
    functionName: "voteDelegate",
    args: [address ?? zeroAddress],
    query: { enabled: !!address },
  });

  const allowance = useReadContract({
    abi: erc20Abi,
    address: USDC,
    functionName: "allowance",
    args: [address ?? "0x0000000000000000000000000000000000000000", campaign],
    query: { enabled: !!address },
  });

  const isCreator =
    !!address && !!creator && address.toLowerCase() === creator.toLowerCase();
  const activeDelegate =
    typeof currentVoteDelegate.data === "string" && currentVoteDelegate.data !== zeroAddress
      ? currentVoteDelegate.data
      : undefined;
  const activeCampaignHistory = useMemo(() => {
    if (!creatorReputation.creator) return undefined;
    return creatorReputation.creator.campaigns.find(
      (item) => item.address.toLowerCase() === campaign.toLowerCase()
    );
  }, [campaign, creatorReputation.creator]);

  async function refetchContributors() {
    if (!publicClient) return;

    setContributorsLoading(true);
    setContributorsError(null);

    try {
      const byFunder = new Map<`0x${string}`, { amount: bigint; contributions: number }>();
      const contributedEvent = parseAbiItem("event Contributed(address indexed funder, uint256 amount)") as AbiEvent;
      const campaignCreatedEvent = parseAbiItem(
        "event CampaignCreated(address indexed creator, address indexed campaign, uint256 indexed campaignId)"
      ) as AbiEvent;
      const startedAt = Date.now();
      const latestBlock = await publicClient.getBlockNumber();

      const fromBlock = await withTimeout(
        findCampaignCreatedBlock(
          publicClient,
          campaign,
          campaignCreatedEvent,
          latestBlock,
          0n,
          startedAt
        ),
        CONTRIBUTOR_LOOKUP_TIMEOUT_MS,
        "Campaign creation lookup timed out."
      );
      const logs = await getLogsInChunks(
        (from, to) =>
          publicClient.getLogs({
            address: campaign,
            event: contributedEvent,
            fromBlock: from,
            toBlock: to,
          }),
        fromBlock,
        latestBlock,
        startedAt
      );

      for (const log of logs) {
        const funder = log.args.funder;
        const amount = log.args.amount ?? 0n;

        if (!funder) continue;

        const current = byFunder.get(funder) ?? { amount: 0n, contributions: 0 };
        byFunder.set(funder, {
          amount: current.amount + amount,
          contributions: current.contributions + 1,
        });
      }

      setContributors(
        Array.from(byFunder, ([funder, data]) => ({
          address: funder,
          amount: data.amount,
          contributions: data.contributions,
        })).sort((a, b) => (a.amount === b.amount ? 0 : a.amount > b.amount ? -1 : 1))
      );
      setContributorsLoaded(true);
    } catch (e: any) {
      console.error(e);
      setContributorsError(e?.shortMessage ?? e?.message ?? "Failed to load contributors.");
    } finally {
      setContributorsLoading(false);
    }
  }

  function refetchCoreReads() {
    baseReads.refetch?.();
    milestones.refetch?.();
    evidenceURIs.refetch?.();
    myVoteChoices.refetch?.();
    currentVoteDelegate.refetch?.();
    myContrib.refetch?.();
    myRefundable.refetch?.();
    allowance.refetch?.();
  }

  function refetchAll() {
    refetchCoreReads();
    if (contributorsLoaded) void refetchContributors();
  }

  async function waitForReceipt(hash: `0x${string}`) {
    if (!publicClient) return;
    await publicClient.waitForTransactionReceipt({ hash });
  }

  useEffect(() => {
    const id = setInterval(refetchCoreReads, 4000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaign, address, creator, milestoneCount]);

  useEffect(() => {
    setContributors([]);
    setContributorsLoaded(false);
    setContributorsError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaign]);

  async function approveAndContribute() {
    if (!address) {
      toast.error("Connect your wallet first.");
      return;
    }

    let amt: bigint;
    try {
      amt = parseUnits(contribution || "0", 6);
    } catch {
      toast.error("Enter a valid USDC amount.");
      return;
    }
    if (amt <= 0n) {
      toast.error("Contribution amount must be greater than zero.");
      return;
    }
    if (amt < MINIMUM_CONTRIBUTION) {
      toast.error(`Minimum contribution is ${MINIMUM_CONTRIBUTION_USDC} USDC.`);
      return;
    }

    const toastId = toast.loading("Preparing contribution...");

    try {
      const currentAllowance = (allowance.data ?? 0n) as bigint;

      if (currentAllowance < amt) {
        toast.loading("Approving USDC spend...", { id: toastId });
        const approvalHash = await writeContractAsync({
          abi: erc20Abi,
          address: USDC,
          functionName: "approve",
          args: [campaign, amt],
        });
        await waitForReceipt(approvalHash);
      }

      toast.loading("Funding campaign...", { id: toastId });
      const contributionHash = await writeContractAsync({
        abi: fundarcCampaignAbi,
        address: campaign,
        functionName: "contribute",
        args: [amt],
      });
      await waitForReceipt(contributionHash);

      refetchAll();
      toast.success(`Contribution successful: ${formatUnits(amt, 6)} USDC funded.`, { id: toastId });
    } catch (e: any) {
      console.error(e);
      toast.error(getErrorMessage(e, "Transaction failed."), { id: toastId });
    }
  }

  async function submitMilestone() {
    const currentMilestoneRead = milestones.data?.[currentMilestoneIndex];
    if (currentMilestoneRead?.status === "success") {
      const milestone = currentMilestoneRead.result as unknown as MilestoneObj;
      const requiredFunding = unlockedAmount + asBigint(milestone.amount);

      if (totalRaised < requiredFunding) {
        toast.error(
          `Funds not available yet. This milestone needs ${formatUnits(requiredFunding, 6)} USDC funded before voting can start.`
        );
        return;
      }
    }

    let hashValue = evidenceHash.trim();
    let evidenceURI = evidenceUpload?.uri ?? "";

    if (evidenceFile) {
      const formData = new FormData();
      formData.set("file", evidenceFile);

      const uploadResponse = await fetch("/api/evidence", {
        method: "POST",
        body: formData,
      });
      const uploadPayload = await uploadResponse.json();

      if (!uploadResponse.ok) {
        toast.error(uploadPayload?.error ?? "Failed to upload evidence.");
        return;
      }

      const uploaded = uploadPayload as EvidenceUploadResponse;
      setEvidenceUpload(uploaded);
      hashValue = uploaded.hash;
      evidenceURI = uploaded.uri;
    }

    if (!isBytes32Hex(hashValue)) {
      toast.error("Evidence hash must be a valid 32-byte hex value (0x...).");
      return;
    }

    const toastId = toast.loading("Submitting milestone...");
    try {
      const functionName = evidenceURI ? "submitMilestoneWithEvidence" : "submitMilestone";
      const hash = await writeContractAsync({
        abi: fundarcCampaignAbi,
        address: campaign,
        functionName,
        args: evidenceURI ? [hashValue as `0x${string}`, evidenceURI] : [hashValue as `0x${string}`],
      });
      await waitForReceipt(hash);
      setEvidenceFile(null);
      setEvidenceUpload(null);
      setEvidenceHash(zeroHash);
      refetchAll();
      toast.success("Milestone submitted. Voting is now open.", { id: toastId });
    } catch (e: any) {
      console.error(e);
      toast.error(getErrorMessage(e, "Failed to submit milestone."), { id: toastId });
    }
  }

  async function vote(index: number, support: boolean) {
    const toastId = toast.loading(`Submitting ${support ? "YES" : "NO"} vote...`);
    try {
      const hash = await writeContractAsync({
        abi: fundarcCampaignAbi,
        address: campaign,
        functionName: "vote",
        args: [BigInt(index), support],
      });
      await waitForReceipt(hash);
      refetchAll();
      toast.success(`Vote submitted for milestone #${index}.`, { id: toastId });
    } catch (e: any) {
      console.error(e);
      toast.error(getErrorMessage(e, "Failed to vote."), { id: toastId });
    }
  }

  async function setVoteDelegate(delegate: `0x${string}`) {
    const toastId = toast.loading(delegate === zeroAddress ? "Revoking voting agent..." : "Assigning voting agent...");
    try {
      const hash = await writeContractAsync({
        abi: fundarcCampaignAbi,
        address: campaign,
        functionName: "setVoteDelegate",
        args: [delegate],
      });
      await waitForReceipt(hash);
      if (delegate !== zeroAddress) setDelegateInput("");
      refetchAll();
      toast.success(delegate === zeroAddress ? "Voting agent revoked." : "Voting agent assigned.", { id: toastId });
    } catch (e: any) {
      console.error(e);
      toast.error(getErrorMessage(e, "Failed to update voting agent."), { id: toastId });
    }
  }

  async function assignVoteDelegate() {
    if (!address) {
      toast.error("Connect your wallet first.");
      return;
    }

    const nextDelegate = delegateInput.trim();
    if (!isAddress(nextDelegate)) {
      toast.error("Enter a valid agent wallet address.");
      return;
    }

    if (nextDelegate.toLowerCase() === address.toLowerCase()) {
      toast.error("Delegate must be a separate agent wallet.");
      return;
    }

    await setVoteDelegate(nextDelegate as `0x${string}`);
  }

  async function copyText(value: string, successMessage: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(successMessage);
    } catch {
      toast.error("Copy failed. Select and copy the text manually.");
    }
  }

  async function finalize(index: number) {
    const toastId = toast.loading(`Finalizing milestone #${index}...`);
    try {
      const hash = await writeContractAsync({
        abi: fundarcCampaignAbi,
        address: campaign,
        functionName: "finalizeMilestone",
        args: [BigInt(index)],
      });
      await waitForReceipt(hash);
      refetchAll();
      toast.success(`Milestone #${index} finalized.`, { id: toastId });
    } catch (e: any) {
      console.error(e);
      toast.error(getErrorMessage(e, "Failed to finalize."), { id: toastId });
    }
  }

  async function withdraw() {
    let amt: bigint;
    try {
      amt = parseUnits(withdrawAmt || "0", 6);
    } catch {
      toast.error("Enter a valid USDC amount.");
      return;
    }
    if (amt <= 0n) {
      toast.error("Withdrawal amount must be greater than zero.");
      return;
    }
    if (amt > availableToWithdraw) {
      toast.error("Withdrawal amount exceeds available balance.");
      return;
    }

    const toastId = toast.loading("Withdrawing unlocked funds...");
    try {
      const hash = await writeContractAsync({
        abi: fundarcCampaignAbi,
        address: campaign,
        functionName: "withdrawUnlocked",
        args: [amt],
      });
      await waitForReceipt(hash);
      refetchAll();
      toast.success(`Withdrawal successful: ${formatUnits(amt, 6)} USDC.`, { id: toastId });
    } catch (e: any) {
      console.error(e);
      toast.error(getErrorMessage(e, "Failed to withdraw."), { id: toastId });
    }
  }

  async function claimRefund() {
    const toastId = toast.loading("Claiming refund...");
    try {
      const hash = await writeContractAsync({
        abi: fundarcCampaignAbi,
        address: campaign,
        functionName: "claimRefund",
        args: [],
      });
      await waitForReceipt(hash);
      refetchAll();
      toast.success("Refund claimed successfully.", { id: toastId });
    } catch (e: any) {
      console.error(e);
      toast.error(getErrorMessage(e, "Failed to claim refund."), { id: toastId });
    }
  }

  const baseLoading = baseReads.isLoading;
  const milestonesLoading = milestones.isLoading;
  const now = Math.floor(Date.now() / 1000);
  const agentLoginCommand = `circle wallet login --email ${agentEmail.trim() || "<your-email>"}`;
  const agentCreateCommand = "circle wallet create --blockchain ARC-TESTNET --name fundarc-voting-agent";
  const agentListCommand = "circle wallet list";

  return (
    <main className="page">
      <section className="card hero">
        <div className="row spread">
          <div>
            <h1 className="hero-title">
              {title ?? (baseLoading ? "Loading…" : "Campaign")}
            </h1>
            <div className="subtext">{description ?? ""}</div>
            <div className="metric-value">
              Total requested:{" "}
              {milestoneCount === 0
                ? baseLoading
                  ? "Loading…"
                  : "0 USDC"
                : milestonesLoading
                  ? "Loading…"
                  : `${formatUnits(totalRequested, 6)} USDC`}
            </div>
            <div className="subtext" style={{ marginTop: 8 }}>
              Created: {formatCreatedAt(createdAt)} • Status: {campaignStateLabel(campaignState)}
            </div>
          </div>

          <div className="actions">
            <button className="btn" type="button" onClick={refetchAll}>
              <RefreshCcw size={16} />
              Refresh
            </button>
            <a className="btn" href={addrUrl(campaign)} target="_blank" rel="noreferrer">
              Campaign <ExternalLink size={16} />
            </a>
            {creator ? (
              <a className="btn" href={addrUrl(creator)} target="_blank" rel="noreferrer">
                Creator: <ArcNameLabel address={creator} /> <ExternalLink size={16} />
              </a>
            ) : null}
          </div>
        </div>
      </section>

      {creator ? (
        <section className="card section section-gap">
          <CreatorReputationCard
            reputation={creatorReputation.creator}
            creator={creator}
            compact
          />
        </section>
      ) : null}

      <div className="grid-2 section-gap">
        <section className="card section">
          <div className="section-head">
            <div className="section-copy">
              <h2>Live totals</h2>
              <div className="subtext">Current funding, unlock, and wallet-specific balances.</div>
            </div>
            <span className="badge mono">{campaign.slice(0, 10)}…</span>
          </div>

          <div className="stats-grid">
            <div className="kv">
              <div className="k">Total raised</div>
              <div className="v">{formatUnits(totalRaised, 6)} USDC</div>
            </div>
            <div className="kv">
              <div className="k">Unlocked amount</div>
              <div className="v">{formatUnits(unlockedAmount, 6)} USDC</div>
            </div>
            <div className="kv">
              <div className="k">Total withdrawn</div>
              <div className="v">{formatUnits(totalWithdrawn, 6)} USDC</div>
            </div>
            <div className="kv">
              <div className="k">Available to withdraw</div>
              <div className="v">{formatUnits(availableToWithdraw, 6)} USDC</div>
            </div>
            <div className="kv">
              <div className="k">Created</div>
              <div className="v">{formatCreatedAt(createdAt)}</div>
            </div>
            <div className="kv">
              <div className="k">Status</div>
              <div className="v">{campaignStateLabel(campaignState)}</div>
            </div>
            <div className="kv">
              <div className="k">My contributed</div>
              <div className="v">
                {formatUnits((myContrib.data ?? 0n) as bigint, 6)} USDC
              </div>
            </div>
          </div>
        </section>

        <section className="card section">
          <div className="section-copy">
            <h2>Contribute</h2>
            <div className="subtext">Approve once, then contribute. Minimum is {MINIMUM_CONTRIBUTION_USDC} USDC.</div>
          </div>

          <div className="row align-end section-gap">
            <div className="field" style={{ flex: 1, minWidth: 220 }}>
              <label>Amount</label>
              <input value={contribution} onChange={(e) => setContribution(e.target.value)} />
            </div>
            <div style={{ minWidth: 240, flex: "0 0 auto" }}>
              <button
                className="btn btn-primary btn-lg btn-block"
                onClick={approveAndContribute}
                disabled={isPending || !address}
                type="button"
              >
                <Wallet size={18} />
                {isPending ? "Pending..." : "Approve + Contribute"}
              </button>
            </div>
          </div>

          <div className="divider" />

          <h2>Refunds</h2>
          <div className="kv section-gap">
            <div className="k">My refundable</div>
            <div className="v">{formatUnits((myRefundable.data ?? 0n) as bigint, 6)} USDC</div>
          </div>
          <button
            className="btn btn-primary btn-lg btn-block"
            onClick={claimRefund}
            disabled={isPending || !address || ((myRefundable.data ?? 0n) as bigint) <= 0n}
            style={{ marginTop: 12 }}
            type="button"
          >
            <Flag size={18} />
            Claim refund
          </button>
        </section>
      </div>

      <section className="card section section-gap">
        <div className="section-head">
          <div className="section-copy">
            <h2>Agent voting delegation</h2>
            <div className="subtext">
              Assign a Circle agent wallet to vote on this campaign using your contribution weight. Funds stay with your wallet.
            </div>
          </div>
          <span className="badge">
            <WandSparkles size={14} />
            voteFor enabled
          </span>
        </div>

        <div className="delegate-panel">
          <div className="kv">
            <div>
              <div className="k">Current agent wallet</div>
              <div className="v mono address-line">
                {activeDelegate ? <ArcNameLabel address={activeDelegate} /> : "No agent assigned"}
              </div>
            </div>
            {activeDelegate ? (
              <a className="btn btn-sm" href={addrUrl(activeDelegate)} target="_blank" rel="noreferrer">
                ArcScan <ExternalLink size={16} />
              </a>
            ) : null}
          </div>

          <div className="circle-agent-wizard">
            <div className="section-head">
              <div className="section-copy">
                <h3>Create Circle agent wallet</h3>
                <div className="subtext">
                  Use Circle&apos;s Agent Wallet CLI, then paste the created ARC-TESTNET wallet address below.
                </div>
              </div>
              <a
                className="btn btn-sm"
                href="https://developers.circle.com/agent-stack/agent-wallets"
                target="_blank"
                rel="noreferrer"
              >
                Circle docs <ExternalLink size={16} />
              </a>
            </div>

            <div className="field">
              <label>Circle login email</label>
              <input
                value={agentEmail}
                onChange={(event) => setAgentEmail(event.target.value)}
                placeholder="you@example.com"
              />
            </div>

            <div className="agent-command-grid">
              <div className="command-card">
                <div className="k">1. Login</div>
                <code>{agentLoginCommand}</code>
                <button
                  className="btn btn-sm"
                  type="button"
                  onClick={() => void copyText(agentLoginCommand, "Login command copied.")}
                >
                  Copy
                </button>
              </div>
              <div className="command-card">
                <div className="k">2. Create wallet</div>
                <code>{agentCreateCommand}</code>
                <button
                  className="btn btn-sm"
                  type="button"
                  onClick={() => void copyText(agentCreateCommand, "Create command copied.")}
                >
                  Copy
                </button>
              </div>
              <div className="command-card">
                <div className="k">3. Find address</div>
                <code>{agentListCommand}</code>
                <button
                  className="btn btn-sm"
                  type="button"
                  onClick={() => void copyText(agentListCommand, "List command copied.")}
                >
                  Copy
                </button>
              </div>
            </div>
          </div>

          <div className="row align-end section-gap">
            <div className="field" style={{ flex: 1, minWidth: 260 }}>
              <label>Agent wallet address</label>
              <input
                value={delegateInput}
                onChange={(event) => setDelegateInput(event.target.value)}
                placeholder="0x... Circle agent wallet"
              />
              <div className="fineprint">
                The agent can only call delegated vote functions for this campaign. It cannot withdraw your funds.
              </div>
            </div>
            <div className="actions">
              <button
                className="btn btn-primary btn-lg"
                onClick={assignVoteDelegate}
                disabled={isPending || !address}
                type="button"
              >
                <WandSparkles size={18} />
                Assign agent
              </button>
              <button
                className="btn btn-lg"
                onClick={() => void setVoteDelegate(zeroAddress)}
                disabled={isPending || !address || !activeDelegate}
                type="button"
              >
                Revoke
              </button>
            </div>
          </div>

          <div className="status-card section-gap">
            Agent execution call: <span className="mono">voteFor({address ? `${address.slice(0, 10)}...` : "funder"}, milestoneIndex, support)</span>.
            The campaign records the vote against your contributor address, so double-vote protection still applies.
          </div>
        </div>
      </section>

      <section className="card section section-gap">
        <div className="section-head">
          <div className="section-copy">
            <h2>Contributors</h2>
            <div className="subtext">Wallets that have funded this campaign. Load on demand to avoid slow RPC scans.</div>
          </div>
          <div className="actions">
            <span className="badge">wallets: {contributors.length}</span>
            <button className="btn btn-sm" type="button" onClick={refetchContributors} disabled={contributorsLoading}>
              {contributorsLoading ? "Loading..." : contributorsLoaded ? "Refresh contributors" : "Load contributors"}
            </button>
          </div>
        </div>

        <div className="contributor-list">
          {contributorsLoading ? (
            <div className="subtext">Loading contributors...</div>
          ) : contributorsError ? (
            <div className="subtext">{contributorsError}</div>
          ) : !contributorsLoaded ? (
            <div className="subtext">Contributor history is available on demand.</div>
          ) : contributors.length === 0 ? (
            <div className="subtext">No contributor wallets found yet.</div>
          ) : (
            contributors.map((contributor) => (
              <div key={contributor.address} className="kv contributor-item">
                <div>
                  <a
                    className="mono address-line"
                    href={addrUrl(contributor.address)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <ArcNameLabel address={contributor.address} />
                  </a>
                  <div className="fineprint">
                    {contributor.contributions} contribution{contributor.contributions === 1 ? "" : "s"}
                  </div>
                </div>
                <div className="v">{formatUnits(contributor.amount, 6)} USDC</div>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="card section section-gap">
        <div className="section-head">
          <div className="section-copy">
            <h2>Milestones</h2>
            <div className="subtext">Review status, votes, and creator evidence for each tranche.</div>
          </div>
          <span className="badge">count: {milestoneCount}</span>
        </div>

        <div className="divider" />

        <div className="stack">
          {milestoneCount === 0 ? (
            <div className="subtext">No milestones found for this campaign.</div>
          ) : milestonesLoading ? (
            <div className="subtext">Loading milestones…</div>
          ) : (
            (milestones.data ?? []).map((r, idx) => {
              if (r.status !== "success") {
                return (
                  <div key={idx} className="subtext">
                    Milestone #{idx} failed to load.
                  </div>
                );
              }

              const m = r.result as unknown as MilestoneObj;

              const amount = asBigint(m.amount);
              const voteStart = asBigint(m.voteStart);
              const voteEnd = asBigint(m.voteEnd);
              const state = asNumber(m.state);
              const yesWeight = asBigint(m.yesWeight);
              const noWeight = asBigint(m.noWeight);
              const myVoteChoice = asNumber(
                myVoteChoices.data?.[idx]?.status === "success"
                  ? myVoteChoices.data[idx].result
                  : 0
              );
              const myContribution = (myContrib.data ?? 0n) as bigint;

              const votingConfigured = voteStart > 0n && voteEnd > 0n;
              const isVotingLive =
                votingConfigured && BigInt(now) >= voteStart && BigInt(now) <= voteEnd;
              const hasVotingEnded = votingConfigured && BigInt(now) > voteEnd;

              const canVote = isVotingLive;
              const canFinalize = hasVotingEnded;

              const secondsLeft = Math.max(0, Number(voteEnd) - now);

              const isCurrentMilestone = idx === currentMilestoneIndex;
              const requiredFunding = unlockedAmount + amount;
              const hasFundingForMilestone = totalRaised >= requiredFunding;
              const canSubmitMilestone =
                isCreator && isCurrentMilestone && !votingConfigured && hasFundingForMilestone;
              const evidenceURI =
                evidenceURIs.data?.[idx]?.status === "success" &&
                typeof evidenceURIs.data[idx].result === "string"
                  ? evidenceURIs.data[idx].result
                  : "";
              const agentReview = buildMilestoneAgentReview({
                index: idx,
                amount,
                state,
                evidenceHash: m.evidenceHash,
                evidenceURI,
                voteStart,
                voteEnd,
                yesWeight,
                noWeight,
                now,
                totalRaised,
                requiredFunding,
                creatorReputation: creatorReputation.creator,
                campaignHistory: activeCampaignHistory,
              });
              const votingAssistant = buildVotingAssistantPlan({
                agentReview,
                isConnected: !!address,
                isCreator,
                myContribution,
                existingVote: myVoteChoice,
                isVotingLive,
                isCurrentMilestone,
                secondsLeft,
              });

              let statusText = "Voting not started.";
              if (!votingConfigured) {
                statusText = isCreator
                  ? "Voting not started. Submit milestone to open voting."
                  : "Voting not started. Waiting for creator to submit.";
              } else if (isVotingLive) {
                statusText = `Voting is LIVE (ends in ${secondsToHuman(secondsLeft)}).`;
              } else if (hasVotingEnded) {
                statusText = "Voting ended. Finalize to apply result.";
              }

              return (
                <div key={idx} className="panel milestone-card">
                  <div className="row spread">
                    <div style={{ maxWidth: 720 }}>
                      <div className="badge">Milestone #{idx}</div>

                      <div className="badge subtext" style={{ marginTop: 8 }}>
                        {idx === 0
                          ? "Upfront funding — YES votes unlock funds for creator."
                          : "Deliverable milestone — review proof before voting."}
                      </div>

                      <div className="section-gap">
                        <div className="subtext">Amount</div>
                        <div className="mono metric-value">
                          {formatUnits(amount, 6)} USDC
                        </div>
                      </div>

                      <div className="subtext" style={{ marginTop: 8 }}>
                        {statusText}
                      </div>

                      {!hasFundingForMilestone && isCurrentMilestone ? (
                        <div className="subtext warn-text" style={{ marginTop: 6 }}>
                          Funding needed before submission: {formatUnits(requiredFunding, 6)} USDC.
                        </div>
                      ) : null}

                      {votingConfigured ? (
                        <div className="subtext" style={{ marginTop: 6 }}>
                          window: {new Date(Number(voteStart) * 1000).toLocaleString()} →{" "}
                          {new Date(Number(voteEnd) * 1000).toLocaleString()}
                        </div>
                      ) : null}

                      <div className="subtext" style={{ marginTop: 6 }}>
                        state={milestoneStateName(state)} • voteStart={voteStart.toString()} • voteEnd={voteEnd.toString()}
                      </div>

                      {evidenceURI ? (
                        <div className="subtext" style={{ marginTop: 6 }}>
                          Evidence:{" "}
                          <a href={ipfsUrl(evidenceURI)} target="_blank" rel="noreferrer">
                            {evidenceURI}
                          </a>
                        </div>
                      ) : null}
                    </div>

                    <div style={{ textAlign: "right" }}>
                      <div className="subtext">Votes</div>
                      <div className="subtext" style={{ marginTop: 8 }}>
                        yes: {formatUnits(yesWeight, 6)} • no: {formatUnits(noWeight, 6)}
                      </div>
                    </div>
                  </div>

                  <div className={`agent-review agent-review-${agentReview.tone}`}>
                    <div className="agent-review-head">
                      <div className="section-copy">
                        <span className="badge">
                          <Bot size={14} />
                          Milestone Review Agent
                        </span>
                        <h3>{agentReview.summary}</h3>
                      </div>
                      <span
                        className={`badge ${
                          agentReview.tone === "success"
                            ? "badge-success"
                            : agentReview.tone === "warn"
                              ? "badge-warn"
                              : "badge-danger"
                        }`}
                      >
                        <ShieldCheck size={14} />
                        {agentReview.recommendation} • {agentReview.confidence}% confidence
                      </span>
                    </div>

                    <div className="agent-review-grid">
                      <div>
                        <div className="k">Positive checks</div>
                        <ul>
                          {agentReview.checks.length > 0 ? (
                            agentReview.checks.map((check) => <li key={check}>{check}</li>)
                          ) : (
                            <li>No positive checks yet.</li>
                          )}
                        </ul>
                      </div>
                      <div>
                        <div className="k">Risk flags</div>
                        <ul>
                          {agentReview.risks.length > 0 ? (
                            agentReview.risks.map((risk) => <li key={risk}>{risk}</li>)
                          ) : (
                            <li>No major risk flags detected.</li>
                          )}
                        </ul>
                      </div>
                      <div>
                        <div className="k">Suggested next steps</div>
                        <ul>
                          {agentReview.nextSteps.map((step) => <li key={step}>{step}</li>)}
                        </ul>
                      </div>
                    </div>
                  </div>

                  <div className="voting-assistant">
                    <div className="agent-review-head">
                      <div className="section-copy">
                        <span className="badge">
                          <WandSparkles size={14} />
                          Contributor Voting Assistant
                        </span>
                        <h3>{votingAssistant.summary}</h3>
                        <div className="subtext">
                          This helper never votes automatically. It prepares the suggested vote and your wallet still confirms the transaction.
                        </div>
                      </div>
                      <button
                        className={`btn btn-lg ${votingAssistant.suggestedSupport === false ? "btn-no" : "btn-yes"}`}
                        onClick={() => {
                          if (votingAssistant.suggestedSupport !== undefined) {
                            void vote(idx, votingAssistant.suggestedSupport);
                          }
                        }}
                        disabled={isPending || !votingAssistant.ready}
                        title={votingAssistant.blockers[0] ?? "Submit the assistant's suggested vote."}
                        type="button"
                      >
                        {votingAssistant.suggestedSupport === false ? <ThumbsDown size={18} /> : <ThumbsUp size={18} />}
                        {votingAssistant.label}
                      </button>
                    </div>

                    <div className="assistant-grid">
                      <div>
                        <div className="k">Why this vote</div>
                        <ul>
                          {votingAssistant.reasons.map((reason) => <li key={reason}>{reason}</li>)}
                        </ul>
                      </div>
                      <div>
                        <div className="k">Wallet checks</div>
                        <ul>
                          {votingAssistant.blockers.length > 0 ? (
                            votingAssistant.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)
                          ) : (
                            <li>Ready to submit with this wallet.</li>
                          )}
                        </ul>
                      </div>
                    </div>
                  </div>

                  <div className="actions section-gap">
                    <button
                      className="btn btn-yes btn-lg"
                      onClick={() => vote(idx, true)}
                      disabled={isPending || !canVote}
                      title={!canVote ? "Voting is not live." : ""}
                    >
                      <ThumbsUp size={18} />
                      Vote YES
                    </button>

                    <button
                      className="btn btn-no btn-lg"
                      onClick={() => vote(idx, false)}
                      disabled={isPending || !canVote}
                      title={!canVote ? "Voting is not live." : ""}
                    >
                      <ThumbsDown size={18} />
                      Vote NO
                    </button>

                    <button
                      className="btn btn-primary btn-lg"
                      onClick={() => finalize(idx)}
                      disabled={isPending || !canFinalize}
                      title={!canFinalize ? `Finalize available in ${secondsToHuman(secondsLeft)}` : ""}
                    >
                      <Send size={18} />
                      {canFinalize ? "Finalize" : `Finalize (in ${secondsToHuman(secondsLeft)})`}
                    </button>
                  </div>

                  {isCreator ? (
                    <>
                      <div className="divider" />
                      <div
                        className="row spread align-end"
                      >
                        <div className="field" style={{ flex: 1, minWidth: 260 }}>
                          <label>Evidence hash or media proof</label>
                          <input
                            value={evidenceHash}
                            onChange={(e) => setEvidenceHash(e.target.value)}
                            placeholder="0x... (bytes32) or leave zeroHash for upfront."
                          />
                          <input
                            type="file"
                            accept="image/*,video/*"
                            onChange={(e) => {
                              const file = e.target.files?.[0] ?? null;
                              setEvidenceFile(file);
                              setEvidenceUpload(null);
                            }}
                          />
                          <div className="fineprint">
                            {evidenceFile
                              ? `${evidenceFile.name} will be uploaded as milestone evidence.`
                              : "Images and videos are uploaded to IPFS; the hash and URI are submitted on-chain."}
                          </div>
                        </div>
                        <div>
                          <button
                            className="btn btn-primary btn-lg"
                            onClick={submitMilestone}
                            disabled={isPending || !canSubmitMilestone || !isBytes32Hex(evidenceHash.trim())}
                            title={
                              !isCurrentMilestone
                                ? "Only the current milestone can be submitted."
                                : !hasFundingForMilestone
                                  ? "Funds are not available for this milestone yet."
                                  : ""
                            }
                          >
                            {evidenceFile ? <Upload size={18} /> : <Send size={18} />}
                            Submit milestone
                          </button>
                        </div>
                      </div>
                    </>
                  ) : null}
                </div>
              );
            })
          )}
        </div>
      </section>

      <section className="card section section-gap">
        <div className="section-copy">
          <h2>Withdraw unlocked (creator)</h2>
          <div className="subtext">Withdraw funds after successful milestone votes.</div>
        </div>
        <div className="row align-end section-gap">
          <div className="field" style={{ flex: 1 }}>
            <label>Amount</label>
            <input value={withdrawAmt} onChange={(e) => setWithdrawAmt(e.target.value)} />
          </div>
          <div>
            <button
              className="btn btn-primary btn-lg"
              onClick={withdraw}
              disabled={isPending || !isCreator || availableToWithdraw <= 0n}
            >
              <Wallet size={18} />
              Withdraw
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}

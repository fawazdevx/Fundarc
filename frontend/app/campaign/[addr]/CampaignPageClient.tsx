// app/campaign/[addr]/CampaignPageClient.tsx
// console.log("CampaignPageClient version: 2026-05-02-voteStart-fix");

"use client";

import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { formatUnits, parseAbiItem, parseUnits, zeroHash } from "viem";
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
import {
  ExternalLink,
  RefreshCcw,
  ThumbsDown,
  ThumbsUp,
  Flag,
  Send,
  Wallet,
} from "lucide-react";

const USDC = process.env.NEXT_PUBLIC_USDC_ADDRESS as `0x${string}`;
const FACTORY = process.env.NEXT_PUBLIC_FACTORY_ADDRESS as `0x${string}`;
const EXPLORER = process.env.NEXT_PUBLIC_EXPLORER!;
const CONTRIBUTOR_LOOKUP_TIMEOUT_MS = 12_000;
const LOG_BLOCK_RANGE = 9_999n;
const deploymentBlockCache = new Map<string, bigint>();

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
    const chunkLogs = await getLogs(chunkStart, chunkEnd);
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
    const logs = await publicClient.getLogs({
      address: FACTORY,
      event,
      args: { campaign },
      fromBlock: chunkStart,
      toBlock: chunkEnd,
    });

    if (logs[0]?.blockNumber !== undefined) return logs[0].blockNumber;
    if (chunkStart === minBlock) break;
    chunkEnd = chunkStart - 1n;
  }

  return minBlock;
}

async function findDeploymentBlock(
  publicClient: NonNullable<ReturnType<typeof usePublicClient>>,
  address: `0x${string}`,
  latestBlock: bigint
) {
  const cacheKey = address.toLowerCase();
  const cached = deploymentBlockCache.get(cacheKey);
  if (cached !== undefined) return cached;

  let low = 0n;
  let high = latestBlock;

  while (low < high) {
    const mid = (low + high) / 2n;
    const code = await publicClient.getCode({ address, blockNumber: mid });

    if (code && code !== "0x") {
      high = mid;
    } else {
      low = mid + 1n;
    }
  }

  deploymentBlockCache.set(cacheKey, low);
  return low;
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

export default function CampaignPageClient({ addr }: { addr: string }) {
  const campaign = addr as `0x${string}`;

  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync, isPending } = useWriteContract();

  const [contribution, setContribution] = useState("10");
  const [evidenceHash, setEvidenceHash] = useState<string>(zeroHash);
  const [withdrawAmt, setWithdrawAmt] = useState("1");
  const [contributors, setContributors] = useState<Contributor[]>([]);
  const [contributorsLoading, setContributorsLoading] = useState(false);
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
    ],
  });

  const title =
    baseReads.data?.[0]?.status === "success"
      ? (baseReads.data?.[0].result as string)
      : undefined;
  const description =
    baseReads.data?.[1]?.status === "success"
      ? (baseReads.data?.[1].result as string)
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

  const allowance = useReadContract({
    abi: erc20Abi,
    address: USDC,
    functionName: "allowance",
    args: [address ?? "0x0000000000000000000000000000000000000000", campaign],
    query: { enabled: !!address },
  });

  const isCreator =
    !!address && !!creator && address.toLowerCase() === creator.toLowerCase();

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
      const campaignDeployBlock = await findDeploymentBlock(publicClient, campaign, latestBlock);

      const fromBlock = await withTimeout(
        findCampaignCreatedBlock(
          publicClient,
          campaign,
          campaignCreatedEvent,
          latestBlock,
          campaignDeployBlock,
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
    myContrib.refetch?.();
    myRefundable.refetch?.();
    allowance.refetch?.();
  }

  function refetchAll() {
    refetchCoreReads();
    void refetchContributors();
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
    void refetchContributors();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaign, publicClient]);

  async function approveAndContribute() {
    if (!address) {
      toast.error("Connect your wallet first.");
      return;
    }

    const toastId = toast.loading("Preparing contribution...");

    try {
      const amt = parseUnits(contribution || "0", 6);
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
    const toastId = toast.loading("Submitting milestone...");
    try {
      const hash = await writeContractAsync({
        abi: fundarcCampaignAbi,
        address: campaign,
        functionName: "submitMilestone",
        args: [evidenceHash as `0x${string}`],
      });
      await waitForReceipt(hash);
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
    const toastId = toast.loading("Withdrawing unlocked funds...");
    try {
      const amt = parseUnits(withdrawAmt || "0", 6);
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
            <div className="subtext">Approve once, then contribute. Amount is in USDC.</div>
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
            disabled={isPending}
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
            <h2>Contributors</h2>
            <div className="subtext">Wallets that have funded this campaign, aggregated from contribution events.</div>
          </div>
          <span className="badge">wallets: {contributors.length}</span>
        </div>

        <div className="contributor-list">
          {contributorsLoading ? (
            <div className="subtext">Loading contributors...</div>
          ) : contributorsError ? (
            <div className="subtext">{contributorsError}</div>
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

              const votingConfigured = voteStart > 0n && voteEnd > 0n;
              const isVotingLive =
                votingConfigured && BigInt(now) >= voteStart && BigInt(now) <= voteEnd;
              const hasVotingEnded = votingConfigured && BigInt(now) > voteEnd;

              const canVote = isVotingLive;
              const canFinalize = hasVotingEnded;

              const secondsLeft = Math.max(0, Number(voteEnd) - now);

              const canSubmitMilestone = isCreator && !votingConfigured;

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

                      {votingConfigured ? (
                        <div className="subtext" style={{ marginTop: 6 }}>
                          window: {new Date(Number(voteStart) * 1000).toLocaleString()} →{" "}
                          {new Date(Number(voteEnd) * 1000).toLocaleString()}
                        </div>
                      ) : null}

                      <div className="subtext" style={{ marginTop: 6 }}>
                        state={state} • voteStart={voteStart.toString()} • voteEnd={voteEnd.toString()}
                      </div>
                    </div>

                    <div style={{ textAlign: "right" }}>
                      <div className="subtext">Votes</div>
                      <div className="subtext" style={{ marginTop: 8 }}>
                        yes: {formatUnits(yesWeight, 6)} • no: {formatUnits(noWeight, 6)}
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
                          <label>Evidence hash (creator)</label>
                          <input
                            value={evidenceHash}
                            onChange={(e) => setEvidenceHash(e.target.value)}
                            placeholder="0x... (bytes32) or leave zeroHash for upfront."
                          />
                        </div>
                        <div>
                          <button
                            className="btn btn-primary btn-lg"
                            onClick={submitMilestone}
                            disabled={isPending || !canSubmitMilestone}
                          >
                            <Send size={18} />
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
            <button className="btn btn-primary btn-lg" onClick={withdraw} disabled={isPending}>
              <Wallet size={18} />
              Withdraw
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}

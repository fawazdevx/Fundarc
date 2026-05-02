// app/campaign/[addr]/CampaignPageClient.tsx
// console.log("CampaignPageClient version: 2026-05-02-voteStart-fix");

"use client";

import { useEffect, useMemo, useState } from "react";
import { formatUnits, parseUnits, zeroHash } from "viem";
import {
  useAccount,
  useReadContract,
  useReadContracts,
  useWriteContract,
} from "wagmi";
import { fundarcCampaignAbi } from "@/src/abi/campaign";
import { erc20Abi } from "@/src/abi/erc20";

const USDC = process.env.NEXT_PUBLIC_USDC_ADDRESS as `0x${string}`;
const EXPLORER = process.env.NEXT_PUBLIC_EXPLORER!;

function addrUrl(a: string) {
  return `${EXPLORER}/address/${a}`;
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
  state: number; // wagmi may return number or bigint; we handle below
  evidenceHash: `0x${string}`;
  yesWeight: bigint;
  noWeight: bigint;
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

export default function CampaignPageClient({ addr }: { addr: string }) {
  const campaign = addr as `0x${string}`;

  const { address } = useAccount();
  const { writeContractAsync, isPending } = useWriteContract();

  const [contribution, setContribution] = useState("10");
  const [evidenceHash, setEvidenceHash] = useState<string>(zeroHash);
  const [withdrawAmt, setWithdrawAmt] = useState("1");

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

  function refetchAll() {
    baseReads.refetch?.();
    milestones.refetch?.();
    myContrib.refetch?.();
    myRefundable.refetch?.();
    allowance.refetch?.();
  }

  useEffect(() => {
    const id = setInterval(refetchAll, 4000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaign, address, creator, milestoneCount]);

  async function approveAndContribute() {
    if (!address) return alert("Connect your wallet first.");

    const amt = parseUnits(contribution || "0", 6);
    const currentAllowance = (allowance.data ?? 0n) as bigint;

    try {
      if (currentAllowance < amt) {
        await writeContractAsync({
          abi: erc20Abi,
          address: USDC,
          functionName: "approve",
          args: [campaign, amt],
        });
      }

      await writeContractAsync({
        abi: fundarcCampaignAbi,
        address: campaign,
        functionName: "contribute",
        args: [amt],
      });

      refetchAll();
    } catch (e: any) {
      console.error(e);
      alert(e?.shortMessage ?? e?.message ?? "Transaction failed.");
    }
  }

  async function submitMilestone() {
    try {
      await writeContractAsync({
        abi: fundarcCampaignAbi,
        address: campaign,
        functionName: "submitMilestone",
        args: [evidenceHash as `0x${string}`],
      });
      refetchAll();
    } catch (e: any) {
      console.error(e);
      alert(e?.shortMessage ?? e?.message ?? "Failed to submit milestone.");
    }
  }

  async function vote(index: number, support: boolean) {
    try {
      await writeContractAsync({
        abi: fundarcCampaignAbi,
        address: campaign,
        functionName: "vote",
        args: [BigInt(index), support],
      });
      refetchAll();
    } catch (e: any) {
      console.error(e);
      alert(e?.shortMessage ?? e?.message ?? "Failed to vote.");
    }
  }

  async function finalize(index: number) {
    try {
      await writeContractAsync({
        abi: fundarcCampaignAbi,
        address: campaign,
        functionName: "finalizeMilestone",
        args: [BigInt(index)],
      });
      refetchAll();
    } catch (e: any) {
      console.error(e);
      alert(e?.shortMessage ?? e?.message ?? "Failed to finalize.");
    }
  }

  async function withdraw() {
    try {
      const amt = parseUnits(withdrawAmt || "0", 6);
      await writeContractAsync({
        abi: fundarcCampaignAbi,
        address: campaign,
        functionName: "withdrawUnlocked",
        args: [amt],
      });
      refetchAll();
    } catch (e: any) {
      console.error(e);
      alert(e?.shortMessage ?? e?.message ?? "Failed to withdraw.");
    }
  }

  async function claimRefund() {
    try {
      await writeContractAsync({
        abi: fundarcCampaignAbi,
        address: campaign,
        functionName: "claimRefund",
        args: [],
      });
      refetchAll();
    } catch (e: any) {
      console.error(e);
      alert(e?.shortMessage ?? e?.message ?? "Failed to claim refund.");
    }
  }

  const baseLoading = baseReads.isLoading;
  const milestonesLoading = milestones.isLoading;
  const now = Math.floor(Date.now() / 1000);

  return (
    <main className="page">
      <section className="card hero">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div>
            <h1 className="hero-title">{title ?? (baseLoading ? "Loading…" : "Campaign")}</h1>
            <div className="subtext">{description ?? ""}</div>
            <div className="v" style={{ marginTop: 6, fontWeight: 700 }}>
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

          <div className="row">
            <button className="btn" type="button" onClick={refetchAll}>
              Refresh data
            </button>
            <a className="btn" href={addrUrl(campaign)} target="_blank" rel="noreferrer">
              Campaign on ArcScan
            </a>
            {creator ? (
              <a className="btn" href={addrUrl(creator)} target="_blank" rel="noreferrer">
                Creator
              </a>
            ) : null}
          </div>
        </div>
      </section>

      <div className="grid-2" style={{ marginTop: 14 }}>
        <section className="card" style={{ padding: 16 }}>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h2>Live totals</h2>
            <span className="badge mono">{campaign.slice(0, 10)}…</span>
          </div>

          <div className="stack" style={{ marginTop: 10 }}>
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
              <div className="v">{formatUnits((myContrib.data ?? 0n) as bigint, 6)} USDC</div>
            </div>
          </div>
        </section>

        <section className="card" style={{ padding: 16 }}>
          <h2>Contribute (USDC)</h2>
          <div className="subtext">Approve once, then contribute. Amount is in USDC.</div>

          <div className="row" style={{ marginTop: 10 }}>
            <div style={{ flex: 1 }}>
              <label>Amount</label>
              <input value={contribution} onChange={(e) => setContribution(e.target.value)} />
            </div>
            <div style={{ marginTop: 22 }}>
              <button className="btn btn-primary" onClick={approveAndContribute} disabled={isPending || !address}>
                {isPending ? "Pending..." : "Approve + Contribute"}
              </button>
            </div>
          </div>

          <div className="hr-glow" style={{ margin: "14px 0" }} />

          <h2>Refunds</h2>
          <div className="kv" style={{ marginTop: 10 }}>
            <div className="k">My refundable</div>
            <div className="v">{formatUnits((myRefundable.data ?? 0n) as bigint, 6)} USDC</div>
          </div>
          <button className="btn" onClick={claimRefund} disabled={isPending} style={{ marginTop: 10 }}>
            Claim refund
          </button>
        </section>
      </div>

      <section className="card" style={{ padding: 16, marginTop: 14 }}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2>Milestones</h2>
          <span className="badge">count: {milestoneCount}</span>
        </div>

        <div className="hr-glow" style={{ margin: "10px 0 14px" }} />

        <div className="stack">
          {milestoneCount === 0 ? (
            <div className="subtext">No milestones found for this campaign.</div>
          ) : milestonesLoading ? (
            <div className="subtext">Loading milestones…</div>
          ) : (
            (milestones.data ?? []).map((r, idx) => {
              if (r.status !== "success") {
                return <div key={idx} className="subtext">Milestone #{idx} failed to load.</div>;
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
              const voteEndNum = Number(voteEnd ?? 0n);

              const secondsLeft = Math.max(0, Number(voteEnd) - now);

              const canSubmitMilestone = isCreator && !votingConfigured;
              

              let statusText = "Voting not started.";
              if (!votingConfigured) {
                statusText = isCreator
                  ? "Voting not started. Submit milestone to open voting."
                  : "Voting not started. Waiting for creator to submit.";
              } else if (isVotingLive) {
                statusText = `Voting is LIVE (ends in ${secondsToHuman(Number(voteEnd - BigInt(now)))}).`;
              } else if (hasVotingEnded) {
                statusText = "Voting ended. Finalize to apply result.";
              }

              return (
                <div key={idx} className="card" style={{ padding: 14 }}>
                  <div className="row" style={{ justifyContent: "space-between" }}>
                    <div style={{ maxWidth: 720 }}>
                      <div className="badge">Milestone #{idx}</div>

                      <div className="badge subtext" style={{ marginTop: 8 }}>
                        {idx === 0
                          ? "Upfront funding — YES votes unlock funds for creator."
                          : "Deliverable milestone — review proof before voting."}
                      </div>

                      <div style={{ marginTop: 10 }}>
                        <div className="subtext">Amount</div>
                        <div className="mono" style={{ fontSize: 18, fontWeight: 800 }}>
                          {formatUnits(amount, 6)} USDC
                        </div>
                      </div>

                      <div className="subtext" style={{ marginTop: 8 }}>{statusText}</div>

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

                  <div className="actions" style={{ marginTop: 12 }}>
                    <button className="btn btn-primary" onClick={() => vote(idx, true)} disabled={isPending || !canVote}>
                      Vote YES
                    </button>
                    <button className="btn" onClick={() => vote(idx, false)} disabled={isPending || !canVote}>
                      Vote NO
                    </button>
                    <button className="btn" onClick={() => finalize(idx)} disabled={isPending || !canFinalize} 
                      title={!canFinalize ? `Finalize available in ${secondsToHuman(secondsLeft)}` : ""} > 
                      {canFinalize ? "Finalize" : `Finalize (in ${secondsToHuman(secondsLeft)})`}
                    </button>
                  </div>

                  {isCreator ? (
                    <>
                      <div className="hr-glow" style={{ margin: "14px 0" }} />
                      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-end" }}>
                        <div style={{ flex: 1, minWidth: 260 }}>
                          <label>Evidence hash (creator)</label>
                          <input
                            value={evidenceHash}
                            onChange={(e) => setEvidenceHash(e.target.value)}
                            placeholder="0x... (bytes32) or leave zeroHash for upfront."
                          />
                        </div>
                        <div>
                          <button
                            className="btn btn-primary"
                            onClick={submitMilestone}
                            disabled={isPending || !canSubmitMilestone}
                          >
                            Submit milestone (open voting)
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

      <section className="card" style={{ padding: 16, marginTop: 14 }}>
        <h2>Withdraw unlocked (creator)</h2>
        <div className="row" style={{ marginTop: 10 }}>
          <div style={{ flex: 1 }}>
            <label>Amount</label>
            <input value={withdrawAmt} onChange={(e) => setWithdrawAmt(e.target.value)} />
          </div>
          <div style={{ marginTop: 22 }}>
            <button className="btn" onClick={withdraw} disabled={isPending}>
              Withdraw
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}
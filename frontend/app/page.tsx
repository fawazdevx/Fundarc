// app/page.tsx

"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import toast from "react-hot-toast";
import { formatUnits, parseUnits } from "viem";
import {
  useAccount,
  usePublicClient,
  useReadContract,
  useReadContracts,
  useWriteContract,
} from "wagmi";
import { fundarcFactoryAbi } from "@/src/abi/factory";
import { fundarcCampaignAbi } from "@/src/abi/campaign";
import { ArcNameLabel } from "@/src/components/ArcNameLabel";
import { CreatorReputationInline } from "@/src/components/CreatorReputationCard";
import { useCreatorReputation } from "@/src/hooks/useCreatorReputation";
import { BarChart3, ExternalLink, Plus, RefreshCcw } from "lucide-react";

const FACTORY = process.env.NEXT_PUBLIC_FACTORY_ADDRESS as `0x${string}`;
const EXPLORER = process.env.NEXT_PUBLIC_EXPLORER!;

function explorerAddress(addr: string) {
  return `${EXPLORER}/address/${addr}`;
}

function getMilestoneAmount(result: unknown): bigint | null {
  if (!result) return null;
  if (typeof (result as any).amount === "bigint") return (result as any).amount;
  if (Array.isArray(result) && typeof result[0] === "bigint") return result[0];
  return null;
}

function getErrorMessage(e: any, fallback: string) {
  return e?.shortMessage ?? e?.message ?? fallback;
}

export default function HomePage() {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync, isPending } = useWriteContract();
  const reputation = useCreatorReputation();

  const [showCompleted, setShowCompleted] = useState(false);

  const [title, setTitle] = useState("Fundarc Campaign");
  const [description, setDescription] = useState(
    "Milestone-based stablecoin crowdfunding on Arc."
  );
  const [milestones, setMilestones] = useState<string[]>(["100", "200"]);
  const [votingPeriodHours, setVotingPeriodHours] = useState(24);
  const [quorumBps, setQuorumBps] = useState(2000);
  const [passBps, setPassBps] = useState(6000);

  const count = useReadContract({
    abi: fundarcFactoryAbi,
    address: FACTORY,
    functionName: "campaignsCount",
  });

  const n = Number(count.data ?? 0n);

  const campaignAddrReads = useMemo(() => {
    return Array.from({ length: n }, (_, i) => ({
      abi: fundarcFactoryAbi,
      address: FACTORY,
      functionName: "campaigns" as const,
      args: [BigInt(i)] as const,
    }));
  }, [n]);

  const campaignAddrs = useReadContracts({
    contracts: campaignAddrReads,
    query: { enabled: n > 0 },
  });

  const addresses: `0x${string}`[] = useMemo(() => {
    return (campaignAddrs.data ?? [])
      .filter((r) => r.status === "success" && typeof r.result === "string")
      .map((r) => r.result as `0x${string}`);
  }, [campaignAddrs.data]);

  const metaReads = useMemo(() => {
    return addresses.flatMap((addr) => [
      { abi: fundarcCampaignAbi, address: addr, functionName: "title" as const },
      { abi: fundarcCampaignAbi, address: addr, functionName: "milestoneCount" as const },
      { abi: fundarcCampaignAbi, address: addr, functionName: "totalWithdrawn" as const },
      { abi: fundarcCampaignAbi, address: addr, functionName: "creator" as const },
    ]);
  }, [addresses]);

  const metas = useReadContracts({
    contracts: metaReads,
    query: { enabled: metaReads.length > 0 },
  });

  const milestoneReads = useMemo(() => {
    if (!metas.data) return [];

    const reads: any[] = [];
    for (let i = 0; i < addresses.length; i++) {
      const msCountIndex = i * 4 + 1;
      const msCount =
        metas.data[msCountIndex]?.status === "success"
          ? Number(metas.data[msCountIndex].result ?? 0n)
          : 0;

      for (let m = 0; m < msCount; m++) {
        reads.push({
          abi: fundarcCampaignAbi,
          address: addresses[i],
          functionName: "getMilestone" as const,
          args: [BigInt(m)] as const,
        });
      }
    }
    return reads;
  }, [addresses, metas.data]);

  const milestonesAll = useReadContracts({
    contracts: milestoneReads,
    query: { enabled: milestoneReads.length > 0 },
  });

  const totalsByCampaign = useMemo(() => {
    const totals = new Map<string, bigint>();
    addresses.forEach((a) => totals.set(a, 0n));
    if (!metas.data || !milestonesAll.data) return totals;

    let cursor = 0;
    for (let i = 0; i < addresses.length; i++) {
      const msCountIndex = i * 4 + 1;
      const msCount =
        metas.data[msCountIndex]?.status === "success"
          ? Number(metas.data[msCountIndex].result ?? 0n)
          : 0;

      let sum = 0n;
      for (let m = 0; m < msCount; m++) {
        const r = milestonesAll.data[cursor++];
        if (r?.status === "success") {
          const amt = getMilestoneAmount(r.result);
          if (amt) sum += amt;
        }
      }
      totals.set(addresses[i], sum);
    }

    return totals;
  }, [addresses, metas.data, milestonesAll.data]);

  async function create() {
    if (!address) {
      toast.error("Connect your wallet first.");
      return;
    }

    const cleaned = milestones.map((s) => s.trim()).filter(Boolean);
    if (cleaned.length === 0) {
      toast.error("Add at least one milestone.");
      return;
    }

    const votingPeriodSeconds = votingPeriodHours * 60 * 60;
    const toastId = toast.loading("Creating campaign...");

    try {
      const ms = cleaned.map((s) => parseUnits(s, 6));
      const hash = await writeContractAsync({
        abi: fundarcFactoryAbi,
        address: FACTORY,
        functionName: "createCampaign",
        args: [
          title,
          description,
          ms,
          votingPeriodSeconds,
          quorumBps,
          passBps,
        ],
      });
      await publicClient?.waitForTransactionReceipt({ hash });

      campaignAddrs.refetch?.();
      metas.refetch?.();
      milestonesAll.refetch?.();
      count.refetch?.();
      toast.success("Campaign created successfully.", { id: toastId });
    } catch (e: any) {
      console.error(e);
      toast.error(getErrorMessage(e, "Failed to create campaign."), { id: toastId });
    }
  }

  function refreshList() {
    campaignAddrs.refetch?.();
    metas.refetch?.();
    milestonesAll.refetch?.();
  }

  return (
    <main className="page">
      <section className="card hero">
        <div className="row spread">
          <div>
            <h1 className="hero-title">Fundarc</h1>
            <div className="subtext">
              Stablecoin-native, milestone-based crowdfunding on Arc Testnet.
            </div>
          </div>
          <div className="actions">
            <Link className="btn btn-primary" href="/dashboard">
              <BarChart3 size={16} />
              Fundarc metrics
            </Link>
            <button className="btn" type="button" onClick={refreshList}>
              <RefreshCcw size={16} />
              Refresh
            </button>
            <a className="btn" href={explorerAddress(FACTORY)} target="_blank" rel="noreferrer">
              Factory <ExternalLink size={16} />
            </a>
          </div>
        </div>

        <div className="divider" />
        <div className="row">
          <span className="badge">USDC gas</span>
          <span className="badge">Milestone voting</span>
          <span className="badge">Refund safety</span>
        </div>
      </section>

      <div className="grid-2 section-gap">
        {/* CREATE */}
        <section className="card section">
          <div className="section-head">
            <div className="section-copy">
              <h2>Create campaign</h2>
              <div className="subtext">Define funding tranches, voting rules, and campaign metadata.</div>
            </div>
          </div>

          <div className="field">
            <label>Title</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>

          <div className="field section-gap">
            <label>Description</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>

          <div className="section-gap">
            <h3 style={{ marginBottom: 8 }}>Milestones (USDC)</h3>
            <div className="stack">
              {milestones.map((m, idx) => (
                <div key={idx} className="row spread">
                  <input
                    value={m}
                    onChange={(e) => {
                      const copy = [...milestones];
                      copy[idx] = e.target.value;
                      setMilestones(copy);
                    }}
                    style={{ flex: 1, minWidth: 180 }}
                  />
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => setMilestones(milestones.filter((_, i) => i !== idx))}
                    disabled={milestones.length <= 1}
                    type="button"
                  >
                    remove
                  </button>
                </div>
              ))}
              <button className="btn btn-primary" onClick={() => setMilestones([...milestones, "50"])} type="button">
                <Plus size={16} />
                Add milestone
              </button>
            </div>
          </div>

          <div className="form-grid section-gap">
            <div className="field">
              <label>Voting (hours)</label>
              <input
                type="number"
                value={votingPeriodHours}
                onChange={(e) => setVotingPeriodHours(Number(e.target.value))}
              />
            </div>
            <div className="field">
              <label>Quorum (bps)</label>
              <input type="number" value={quorumBps} onChange={(e) => setQuorumBps(Number(e.target.value))} />
            </div>
            <div className="field">
              <label>Pass (bps)</label>
              <input type="number" value={passBps} onChange={(e) => setPassBps(Number(e.target.value))} />
            </div>
          </div>

          <div className="actions section-gap">
            <button
              className="btn btn-primary btn-lg btn-block"
              onClick={create}
              disabled={isPending || !address}
              type="button"
            >
              {isPending ? "Creating..." : address ? "Create Campaign" : "Connect wallet to create"}
            </button>
          </div>
        </section>

        {/* LIST */}
        <section className="card section">
          <div className="section-head">
            <div className="section-copy">
              <h2>Campaigns</h2>
              <div className="subtext">Browse active campaign contracts and funding progress.</div>
            </div>
            <span className="badge">{n} total</span>
          </div>

          <div className="row spread">
            <label className="check-row">
              <input type="checkbox" checked={showCompleted} onChange={(e) => setShowCompleted(e.target.checked)} />
              Show completed
            </label>
          </div>

          <div className="divider" />

          <div className="stack">
            {(campaignAddrs.data ?? []).map((r, idx) => {
              const addr = r.status === "success" ? (r.result as `0x${string}`) : "";
              if (!addr) return <div key={idx} className="subtext">Loading…</div>;

              const titleIndex = idx * 4;
              const withdrawIndex = idx * 4 + 2;
              const creatorIndex = idx * 4 + 3;

              const name =
                metas.data?.[titleIndex]?.status === "success"
                  ? (metas.data?.[titleIndex]?.result as string)
                  : "Campaign";

              const requested = totalsByCampaign.get(addr) ?? 0n;

              const totalWithdrawn =
                metas.data?.[withdrawIndex]?.status === "success"
                  ? (metas.data?.[withdrawIndex]?.result as bigint)
                  : 0n;
              const creator =
                metas.data?.[creatorIndex]?.status === "success"
                  ? (metas.data?.[creatorIndex]?.result as `0x${string}`)
                  : undefined;
              const creatorReputation = creator
                ? reputation.creators.find((item) => item.creator.toLowerCase() === creator.toLowerCase())
                : undefined;

              const isCompleted = requested > 0n && totalWithdrawn >= requested;

              if (!showCompleted && isCompleted) return null;

              return (
                <div key={addr} className="kv campaign-item">
                  <div style={{ minWidth: 0 }}>
                    <div className="k">
                      {name}{" "}
                      {isCompleted ? <span className="badge badge-success" style={{ marginLeft: 8 }}>Completed</span> : null}
                    </div>
                    <div className="v mono address-line">
                      {addr}
                    </div>
                    {creator ? (
                      <div className="subtext" style={{ marginTop: 4 }}>
                        Creator: <ArcNameLabel address={creator} className="mono" />
                      </div>
                    ) : null}
                    {creatorReputation ? (
                      <div style={{ marginTop: 6 }}>
                        <CreatorReputationInline reputation={creatorReputation} />
                      </div>
                    ) : null}
                    <div className="subtext" style={{ marginTop: 4 }}>
                      Requested: {formatUnits(requested, 6)} USDC • Withdrawn:{" "}
                      {formatUnits(totalWithdrawn, 6)} USDC
                    </div>
                  </div>

                  <div className="actions">
                    <Link className="btn btn-primary btn-sm" href={`/campaign/${addr}`}>
                      Open
                    </Link>
                    <a className="btn btn-sm" href={explorerAddress(addr)} target="_blank" rel="noreferrer">
                      ArcScan <ExternalLink size={16} />
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </main>
  );
}

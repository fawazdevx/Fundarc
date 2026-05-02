// app/page.tsx

"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { formatUnits, parseUnits } from "viem";
import {
  useAccount,
  useReadContract,
  useReadContracts,
  useWriteContract,
} from "wagmi";
import { fundarcFactoryAbi } from "@/src/abi/factory";
import { fundarcCampaignAbi } from "@/src/abi/campaign";

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

export default function HomePage() {
  const { address } = useAccount();
  const { writeContractAsync, isPending } = useWriteContract();

  const [showCompleted, setShowCompleted] = useState(false);

  // Create form state
  const [title, setTitle] = useState("Fundarc Campaign");
  const [description, setDescription] = useState(
    "Milestone-based stablecoin crowdfunding on Arc."
  );
  const [milestones, setMilestones] = useState<string[]>(["100", "200"]);
  const [votingPeriodHours, setVotingPeriodHours] = useState(24);
  const [quorumBps, setQuorumBps] = useState(2000);
  const [passBps, setPassBps] = useState(6000);

  // Count campaigns
  const count = useReadContract({
    abi: fundarcFactoryAbi,
    address: FACTORY,
    functionName: "campaignsCount",
  });

  const n = Number(count.data ?? 0n);

  // Read campaign addresses
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

  // Read title + milestoneCount + totalWithdrawn per campaign
  const metaReads = useMemo(() => {
    return addresses.flatMap((addr) => [
      { abi: fundarcCampaignAbi, address: addr, functionName: "title" as const },
      { abi: fundarcCampaignAbi, address: addr, functionName: "milestoneCount" as const },
      { abi: fundarcCampaignAbi, address: addr, functionName: "totalWithdrawn" as const },
    ]);
  }, [addresses]);

  const metas = useReadContracts({
    contracts: metaReads,
    query: { enabled: metaReads.length > 0 },
  });

  // Build milestone reads for ALL campaigns (to compute total requested)
  const milestoneReads = useMemo(() => {
    if (!metas.data) return [];

    const reads: any[] = [];
    for (let i = 0; i < addresses.length; i++) {
      const msCountIndex = i * 3 + 1; // title, milestoneCount, totalWithdrawn
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
      const msCountIndex = i * 3 + 1;
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
      alert("Connect your wallet first.");
      return;
    }

    const cleaned = milestones.map((s) => s.trim()).filter(Boolean);
    if (cleaned.length === 0) {
      alert("Add at least one milestone.");
      return;
    }

    const ms = cleaned.map((s) => parseUnits(s, 6));
    const votingPeriodSeconds = BigInt(votingPeriodHours) * 60n * 60n;

    try {
      await writeContractAsync({
        abi: fundarcFactoryAbi,
        address: FACTORY,
        functionName: "createCampaign",
        args: [
          title,
          description,
          ms,
          votingPeriodSeconds,
          BigInt(quorumBps),
          BigInt(passBps),
        ],
      });

      campaignAddrs.refetch?.();
      metas.refetch?.();
      milestonesAll.refetch?.();
    } catch (e: any) {
      console.error(e);
      alert(e?.shortMessage ?? e?.message ?? "Failed to create campaign.");
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
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div>
            <h1 className="hero-title">Fundarc</h1>
            <div className="subtext">
              Stablecoin-native, milestone-based crowdfunding on Arc Testnet.
            </div>
          </div>
          <div className="row">
            <button className="btn" type="button" onClick={refreshList}>
              Refresh list
            </button>
            <a
              className="btn"
              href={explorerAddress(FACTORY)}
              target="_blank"
              rel="noreferrer"
            >
              Factory on ArcScan
            </a>
          </div>
        </div>

        <div className="hr-glow" style={{ marginTop: 14 }} />
        <div className="row" style={{ marginTop: 12 }}>
          <span className="badge">USDC gas</span>
          <span className="badge">Milestone voting</span>
          <span className="badge">Refund safety</span>
        </div>
      </section>

      <div className="grid-2" style={{ marginTop: 14 }}>
        {/* CREATE */}
        <section className="card" style={{ padding: 16 }}>
          <h2>Create campaign</h2>

          <label>Title</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} />

          <label>Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />

          <div style={{ marginTop: 12 }}>
            <h3 style={{ marginBottom: 8 }}>Milestones (USDC)</h3>
            <div className="stack">
              {milestones.map((m, idx) => (
                <div
                  key={idx}
                  className="row"
                  style={{ justifyContent: "space-between" }}
                >
                  <input
                    value={m}
                    onChange={(e) => {
                      const copy = [...milestones];
                      copy[idx] = e.target.value;
                      setMilestones(copy);
                    }}
                    style={{ flex: 1 }}
                  />
                  <button
                    className="btn"
                    onClick={() =>
                      setMilestones(milestones.filter((_, i) => i !== idx))
                    }
                    disabled={milestones.length <= 1}
                    type="button"
                  >
                    remove
                  </button>
                </div>
              ))}
              <button
                className="btn"
                onClick={() => setMilestones([...milestones, "50"])}
                type="button"
              >
                + add milestone
              </button>
            </div>
          </div>

          <div className="grid-3" style={{ marginTop: 12 }}>
            <div>
              <label>Voting (hours)</label>
              <input
                type="number"
                value={votingPeriodHours}
                onChange={(e) => setVotingPeriodHours(Number(e.target.value))}
              />
            </div>
            <div>
              <label>Quorum (bps)</label>
              <input
                type="number"
                value={quorumBps}
                onChange={(e) => setQuorumBps(Number(e.target.value))}
              />
            </div>
            <div>
              <label>Pass (bps)</label>
              <input
                type="number"
                value={passBps}
                onChange={(e) => setPassBps(Number(e.target.value))}
              />
            </div>
          </div>

          <div className="actions" style={{ marginTop: 12 }}>
            <button
              className="btn btn-primary"
              onClick={create}
              disabled={isPending || !address}
              type="button"
            >
              {isPending
                ? "Creating..."
                : address
                  ? "Create Campaign"
                  : "Connect wallet to create"}
            </button>
          </div>
        </section>

        {/* LIST */}
        <section className="card" style={{ padding: 16 }}>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h2>Campaigns</h2>
            <span className="badge">{n} total</span>
          </div>

          <div className="row" style={{ marginTop: 10, justifyContent: "space-between" }}>
            <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                type="checkbox"
                checked={showCompleted}
                onChange={(e) => setShowCompleted(e.target.checked)}
              />
              Show completed
            </label>
          </div>

          <div className="hr-glow" style={{ margin: "10px 0 12px" }} />

          <div className="stack">
            {(campaignAddrs.data ?? []).map((r, idx) => {
              const addr =
                r.status === "success" ? (r.result as `0x${string}`) : "";
              if (!addr) return <div key={idx} className="subtext">Loading…</div>;

              const titleIndex = idx * 3;
              const withdrawIndex = idx * 3 + 2;

              const name =
                metas.data?.[titleIndex]?.status === "success"
                  ? (metas.data?.[titleIndex]?.result as string)
                  : "Campaign";

              const requested = totalsByCampaign.get(addr) ?? 0n;

              const totalWithdrawn =
                metas.data?.[withdrawIndex]?.status === "success"
                  ? (metas.data?.[withdrawIndex]?.result as bigint)
                  : 0n;

              const isCompleted = requested > 0n && totalWithdrawn >= requested;

              if (!showCompleted && isCompleted) return null;

              return (
                <div key={addr} className="kv">
                  <div style={{ minWidth: 0 }}>
                    <div className="k">
                      {name}{" "}
                      {isCompleted ? <span className="badge" style={{ marginLeft: 8 }}>Completed</span> : null}
                    </div>
                    <div className="v mono" style={{ fontSize: 12 }}>
                      {addr}
                    </div>
                    <div className="subtext" style={{ marginTop: 4 }}>
                      Requested: {formatUnits(requested, 6)} USDC • Withdrawn:{" "}
                      {formatUnits(totalWithdrawn, 6)} USDC
                    </div>
                  </div>

                  <div className="row">
                    <Link className="btn btn-primary" href={`/campaign/${addr}`}>
                      Open
                    </Link>
                    <a className="btn" href={explorerAddress(addr)} target="_blank" rel="noreferrer">
                      ArcScan
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
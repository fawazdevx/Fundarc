"use client";

import Link from "next/link";
import { formatUnits } from "viem";
import { ExternalLink, RefreshCcw } from "lucide-react";
import { ArcNameLabel } from "@/src/components/ArcNameLabel";
import { CreatorReputationCard } from "@/src/components/CreatorReputationCard";
import { useCreatorReputation } from "@/src/hooks/useCreatorReputation";

const EXPLORER = process.env.NEXT_PUBLIC_EXPLORER!;

function explorerAddress(addr: string) {
  return `${EXPLORER}/address/${addr}`;
}

function stateLabel(state: number) {
  if (state === 1) return "Canceled";
  if (state === 2) return "Failed";
  if (state === 3) return "Successful";
  return "Active";
}

function formatUSDC(value: bigint) {
  const formatted = Number(formatUnits(value, 6));
  return Intl.NumberFormat("en", {
    maximumFractionDigits: formatted >= 100 ? 0 : 2,
  }).format(formatted);
}

export default function CreatorProfileClient({ address }: { address: string }) {
  const creatorAddress = address as `0x${string}`;
  const reputation = useCreatorReputation(creatorAddress);
  const creator = reputation.creator;

  return (
    <main className="page">
      <section className="card hero">
        <div className="row spread">
          <div>
            <h1 className="hero-title">Creator profile</h1>
            <div className="subtext">
              <ArcNameLabel address={creatorAddress} className="mono" />
            </div>
          </div>
          <div className="actions">
            <button className="btn" type="button" onClick={reputation.refetch}>
              <RefreshCcw size={16} />
              Refresh
            </button>
            <a className="btn" href={explorerAddress(creatorAddress)} target="_blank" rel="noreferrer">
              ArcScan <ExternalLink size={16} />
            </a>
          </div>
        </div>
      </section>

      <section className="card section section-gap">
        <CreatorReputationCard
          reputation={creator}
          creator={creatorAddress}
          showProfileLink={false}
        />
      </section>

      <section className="card section section-gap">
        <div className="section-head">
          <div className="section-copy">
            <h2>Campaign history</h2>
            <div className="subtext">Campaign outcomes and milestone delivery history for this creator.</div>
          </div>
          <span className="badge">{creator?.campaigns.length ?? 0} campaigns</span>
        </div>

        <div className="stack">
          {reputation.isLoading ? (
            <div className="subtext">Loading creator reputation...</div>
          ) : !creator ? (
            <div className="subtext">No Fundarc campaigns found for this creator.</div>
          ) : (
            creator.campaigns.map((campaign) => (
              <div key={campaign.address} className="kv campaign-item">
                <div style={{ minWidth: 0 }}>
                  <div className="k">
                    {campaign.title}{" "}
                    <span className={`badge ${campaign.campaignState === 3 ? "badge-success" : ""}`} style={{ marginLeft: 8 }}>
                      {stateLabel(campaign.campaignState)}
                    </span>
                  </div>
                  <div className="v mono address-line">{campaign.address}</div>
                  <div className="subtext" style={{ marginTop: 4 }}>
                    Raised: {formatUSDC(campaign.totalRaised)} USDC • Unlocked:{" "}
                    {formatUSDC(campaign.unlockedAmount)} USDC • Refunded:{" "}
                    {formatUSDC(campaign.totalRefunded)} USDC
                  </div>
                  <div className="subtext" style={{ marginTop: 4 }}>
                    Milestones: {campaign.approvedMilestones} approved • {campaign.rejectedMilestones} rejected •{" "}
                    {campaign.submittedMilestones}/{campaign.milestoneCount} submitted
                  </div>
                </div>
                <div className="actions">
                  <Link className="btn btn-primary btn-sm" href={`/campaign/${campaign.address}`}>
                    Open
                  </Link>
                  <a className="btn btn-sm" href={explorerAddress(campaign.address)} target="_blank" rel="noreferrer">
                    ArcScan <ExternalLink size={16} />
                  </a>
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </main>
  );
}

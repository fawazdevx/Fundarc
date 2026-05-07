"use client";

import Link from "next/link";
import { formatUnits } from "viem";
import { Award, ExternalLink, ShieldCheck, TrendingUp } from "lucide-react";
import { ArcNameLabel } from "@/src/components/ArcNameLabel";
import type { CreatorReputation } from "@/src/hooks/useCreatorReputation";

type Props = {
  reputation?: CreatorReputation;
  creator?: `0x${string}` | string;
  compact?: boolean;
  showProfileLink?: boolean;
};

function formatUSDC(value: bigint) {
  const formatted = Number(formatUnits(value, 6));
  return Intl.NumberFormat("en", {
    maximumFractionDigits: formatted >= 100 ? 0 : 2,
  }).format(formatted);
}

function scoreTone(score: number) {
  if (score >= 55) return "badge-success";
  if (score >= 25) return "badge-warn";
  return "";
}

export function CreatorReputationCard({
  reputation,
  creator,
  compact = false,
  showProfileLink = true,
}: Props) {
  const creatorAddress = reputation?.creator ?? (creator as `0x${string}` | undefined);

  if (!creatorAddress) {
    return (
      <div className="reputation-card">
        <div className="subtext">Creator reputation loading...</div>
      </div>
    );
  }

  if (!reputation) {
    return (
      <div className="reputation-card">
        <div className="section-head">
          <div className="section-copy">
            <h2>Creator reputation</h2>
            <div className="subtext">
              <ArcNameLabel address={creatorAddress} className="mono" />
            </div>
          </div>
          <span className="badge">New creator</span>
        </div>
        <div className="subtext">No completed Fundarc history yet.</div>
      </div>
    );
  }

  return (
    <div className="reputation-card">
      <div className="section-head">
        <div className="section-copy">
          <h2>Creator reputation</h2>
          <div className="subtext">
            <ArcNameLabel address={creatorAddress} className="mono" />
          </div>
        </div>
        <span className={`badge ${scoreTone(reputation.score)}`}>
          <ShieldCheck size={14} />
          {reputation.label}
        </span>
      </div>

      <div className="reputation-score">
        <div>
          <div className="k">Score</div>
          <div className="score-value">{reputation.score}</div>
        </div>
        <div className="subtext">
          {reputation.completedCampaigns} completed campaign
          {reputation.completedCampaigns === 1 ? "" : "s"} • {reputation.milestoneApprovalRate}% milestone approval
        </div>
      </div>

      <div className={compact ? "reputation-metrics compact" : "reputation-metrics"}>
        <div className="kv">
          <div className="k">Campaigns</div>
          <div className="v">{reputation.campaignsCreated}</div>
        </div>
        <div className="kv">
          <div className="k">Unlocked</div>
          <div className="v">{formatUSDC(reputation.totalUnlocked)} USDC</div>
        </div>
        {!compact ? (
          <>
            <div className="kv">
              <div className="k">Raised</div>
              <div className="v">{formatUSDC(reputation.totalRaised)} USDC</div>
            </div>
            <div className="kv">
              <div className="k">Failed/canceled</div>
              <div className="v">{reputation.failedCampaigns + reputation.canceledCampaigns}</div>
            </div>
          </>
        ) : null}
      </div>

      {showProfileLink ? (
        <div className="actions section-gap">
          <Link className="btn btn-primary btn-sm" href={`/creator/${creatorAddress}`}>
            <Award size={16} />
            Creator profile
          </Link>
          <span className="badge">
            <TrendingUp size={14} />
            {reputation.approvedMilestones}/{Math.max(reputation.submittedMilestones, 1)} milestones
          </span>
        </div>
      ) : null}
    </div>
  );
}

export function CreatorReputationInline({ reputation }: { reputation?: CreatorReputation }) {
  if (!reputation) return null;

  return (
    <Link className="badge reputation-inline" href={`/creator/${reputation.creator}`}>
      <ShieldCheck size={13} />
      {reputation.label} • {reputation.score}
      <ExternalLink size={13} />
    </Link>
  );
}

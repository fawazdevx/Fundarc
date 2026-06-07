"use client";

import Image from "next/image";
import Link from "next/link";
import { formatUnits } from "viem";
import { useReadContracts } from "wagmi";
import { fundarcFactoryAbi } from "@/src/abi/factory";
import { HIDDEN_LEGACY_CAMPAIGN_COUNT } from "@/src/config/campaigns";
import {
  ArrowDown,
  ArrowRight,
  BarChart3,
  CircleDollarSign,
  Compass,
  LockKeyhole,
  ShieldCheck,
  Sparkles,
  Vote,
  WalletCards,
} from "lucide-react";

const FACTORY = process.env.NEXT_PUBLIC_FACTORY_ADDRESS as `0x${string}` | undefined;

function formatUsdc(value?: bigint) {
  if (value === undefined) return "Loading";

  const formatted = Number(formatUnits(value, 6));
  return `${formatted.toLocaleString(undefined, {
    maximumFractionDigits: formatted >= 100 ? 0 : 2,
  })} USDC`;
}

function formatCount(value?: bigint) {
  if (value === undefined) return "Loading";

  const visible = Math.max(0, Number(value) - HIDDEN_LEGACY_CAMPAIGN_COUNT);
  return visible.toLocaleString();
}

export default function LandingPage() {
  const stats = useReadContracts({
    contracts: [
      { abi: fundarcFactoryAbi, address: FACTORY, functionName: "campaignsCount" },
      { abi: fundarcFactoryAbi, address: FACTORY, functionName: "totalFeesCollected" },
    ],
    query: {
      enabled: Boolean(FACTORY),
    },
  });

  const campaignsCount =
    stats.data?.[0]?.status === "success" ? (stats.data[0].result as bigint) : undefined;
  const totalFees =
    stats.data?.[1]?.status === "success" ? (stats.data[1].result as bigint) : undefined;

  return (
    <main className="landing-page">
      <section className="landing-hero">
        <Image
          src="/brand/fundarc-banner.svg"
          alt=""
          fill
          priority
          aria-hidden="true"
          className="landing-banner-wash"
          sizes="100vw"
        />
        <div className="landing-grid" aria-hidden="true" />
        <div className="landing-glow" aria-hidden="true" />

        <div className="landing-float landing-float-left" aria-hidden="true">
          <div className="coin-orbit">
            <span className="coin-face">
              <CircleDollarSign size={58} />
            </span>
          </div>
          <div className="float-panel progress-panel">
            <div className="float-title">Milestone Escrow</div>
            <div className="float-row">
              <span>Funding</span>
              <strong>Locked</strong>
            </div>
            <div className="progress-track">
              <span />
            </div>
            <div className="float-row muted">
              <span>Creator submits proof</span>
              <span>Contributors review</span>
            </div>
            <div className="float-divider" />
            <div className="float-title">Contributor Vote</div>
            <div className="vote-summary">
              <div className="vote-ring" />
              <div className="vote-values">
                <span><i className="yes-dot" /> Approve <strong>Unlock</strong></span>
                <span><i className="no-dot" /> Reject <strong>Refund path</strong></span>
              </div>
            </div>
          </div>
        </div>

        <div className="landing-content">
          <div className="landing-badges">
            <span className="badge">
              <span className="status-dot" aria-hidden="true" />
              Live on Arc Testnet
            </span>
            <span className="badge">
              <ShieldCheck size={14} />
              Secure · Transparent · Onchain
            </span>
          </div>

          <h1 className="landing-title">Fundarc</h1>
          <p className="landing-copy">
            Stablecoin crowdfunding with <strong>milestone voting</strong>, transparent creator history, and
            refund-aware campaign flows for public goods, open source, creators, and communities.
          </p>

          <div className="landing-actions">
            <Link className="btn btn-primary btn-lg" href="/launch">
              <WalletCards size={18} />
              Create campaign
              <ArrowRight size={18} />
            </Link>
            <Link className="btn btn-lg" href="/discover">
              <Compass size={18} />
              Explore campaigns
            </Link>
            <Link className="btn btn-lg" href="/dashboard">
              <BarChart3 size={18} />
              View metrics
            </Link>
          </div>

          <div className="landing-chips" aria-label="Fundarc features">
            <span><CircleDollarSign size={16} /> USDC Native</span>
            <span><ShieldCheck size={16} /> Milestone Voting</span>
            <span><Vote size={16} /> Refund Protection</span>
          </div>

          <div className="landing-stats">
            <div className="landing-stat">
              <span><LockKeyhole size={24} /></span>
              <strong>{formatCount(campaignsCount)}</strong>
              <small>Visible Campaigns</small>
            </div>
            <div className="landing-stat">
              <span><Sparkles size={24} /></span>
              <strong>{formatUsdc(totalFees)}</strong>
              <small>Total Fees Collected</small>
            </div>
          </div>

          <div className="scroll-cue">
            <span>Scroll to explore</span>
            <ArrowDown size={16} />
          </div>
        </div>

        <div className="landing-float landing-float-right" aria-hidden="true">
          <div className="logo-orbit">
            <span className="logo-face">
              <Image src="/brand/favicon.svg" alt="" width={92} height={92} />
            </span>
          </div>
          <div className="float-panel lock-panel">
            <div className="float-title">Funds are locked securely</div>
            <div className="lock-badge">
              <LockKeyhole size={30} />
            </div>
            <p>Funds release only after <strong>milestone</strong> approval.</p>
            <div className="secured-line">
              <ShieldCheck size={16} />
              Secured by smart contracts
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo } from "react";
import { formatUnits } from "viem";
import { useReadContracts } from "wagmi";
import { fundarcCampaignAbi } from "@/src/abi/campaign";
import { fundarcFactoryAbi } from "@/src/abi/factory";
import { HIDDEN_LEGACY_CAMPAIGN_COUNT } from "@/src/config/campaigns";
import {
  ArrowDown,
  ArrowRight,
  BarChart3,
  Bot,
  CheckCircle2,
  CircleDollarSign,
  Compass,
  FileText,
  LockKeyhole,
  ShieldCheck,
  Sparkles,
  Users,
  Vote,
  WalletCards,
} from "lucide-react";

const FACTORY = process.env.NEXT_PUBLIC_FACTORY_ADDRESS as `0x${string}` | undefined;
const CAMPAIGN_PREVIEW_COUNT = 3;
const CAMPAIGN_PREVIEW_READS = 4;

type CampaignPreview = {
  addr: `0x${string}`;
  title: string;
  creator?: `0x${string}`;
  totalRaised: bigint;
  state: number;
};

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

function shortAddress(address?: string) {
  if (!address) return "Unknown creator";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function campaignStateLabel(state: number) {
  if (state === 0) return "Active";
  if (state === 1) return "Successful";
  if (state === 2) return "Failed";
  if (state === 3) return "Cancelled";
  return "Campaign";
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
  const totalCampaigns = Number(campaignsCount ?? 0n);
  const visibleCampaigns = Math.max(0, totalCampaigns - HIDDEN_LEGACY_CAMPAIGN_COUNT);

  const previewAddressReads = useMemo(() => {
    if (!FACTORY || visibleCampaigns <= 0) return [];

    const count = Math.min(CAMPAIGN_PREVIEW_COUNT, visibleCampaigns);
    return Array.from({ length: count }, (_, i) => ({
      abi: fundarcFactoryAbi,
      address: FACTORY,
      functionName: "campaigns" as const,
      args: [BigInt(totalCampaigns - 1 - i)] as const,
    }));
  }, [totalCampaigns, visibleCampaigns]);

  const previewAddressResults = useReadContracts({
    contracts: previewAddressReads,
    query: { enabled: previewAddressReads.length > 0 },
  });

  const previewAddresses = useMemo(() => {
    return (previewAddressResults.data ?? [])
      .filter((item) => item.status === "success" && typeof item.result === "string")
      .map((item) => item.result as `0x${string}`);
  }, [previewAddressResults.data]);

  const previewMetaReads = useMemo(() => {
    return previewAddresses.flatMap((addr) => [
      { abi: fundarcCampaignAbi, address: addr, functionName: "title" as const },
      { abi: fundarcCampaignAbi, address: addr, functionName: "creator" as const },
      { abi: fundarcCampaignAbi, address: addr, functionName: "totalRaised" as const },
      { abi: fundarcCampaignAbi, address: addr, functionName: "campaignState" as const },
    ]);
  }, [previewAddresses]);

  const previewMetaResults = useReadContracts({
    contracts: previewMetaReads,
    query: { enabled: previewMetaReads.length > 0 },
  });

  const campaignPreviews = useMemo(() => {
    if (!previewMetaResults.data) return [];

    return previewAddresses.map((addr, index): CampaignPreview => {
      const offset = index * CAMPAIGN_PREVIEW_READS;
      return {
        addr,
        title:
          previewMetaResults.data[offset]?.status === "success" &&
          typeof previewMetaResults.data[offset].result === "string"
            ? (previewMetaResults.data[offset].result as string)
            : "Fundarc campaign",
        creator:
          previewMetaResults.data[offset + 1]?.status === "success" &&
          typeof previewMetaResults.data[offset + 1].result === "string"
            ? (previewMetaResults.data[offset + 1].result as `0x${string}`)
            : undefined,
        totalRaised:
          previewMetaResults.data[offset + 2]?.status === "success"
            ? (previewMetaResults.data[offset + 2].result as bigint)
            : 0n,
        state:
          previewMetaResults.data[offset + 3]?.status === "success"
            ? Number(previewMetaResults.data[offset + 3].result ?? 0n)
            : 0,
      };
    });
  }, [previewAddresses, previewMetaResults.data]);

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

      <section className="landing-section landing-live-section">
        <div className="landing-section-head">
          <div>
            <span className="section-eyebrow">Live on Arc Testnet</span>
            <h2>Recent campaigns</h2>
          </div>
          <Link className="btn btn-sm" href="/discover">
            Explore all <ArrowRight size={16} />
          </Link>
        </div>

        <div className="landing-campaign-grid">
          {campaignPreviews.length > 0 ? (
            campaignPreviews.map((campaign) => (
              <article className="landing-campaign-card" key={campaign.addr}>
                <div className="row spread">
                  <span className="badge">{campaignStateLabel(campaign.state)}</span>
                  <span className="fineprint mono">{shortAddress(campaign.addr)}</span>
                </div>
                <h3>{campaign.title}</h3>
                <div className="landing-campaign-meta">
                  <span>Creator</span>
                  <strong className="mono">{shortAddress(campaign.creator)}</strong>
                </div>
                <div className="landing-campaign-meta">
                  <span>Raised</span>
                  <strong>{formatUsdc(campaign.totalRaised)}</strong>
                </div>
                <Link className="btn btn-primary btn-sm" href={`/campaign/${campaign.addr}`}>
                  View campaign
                </Link>
              </article>
            ))
          ) : (
            <div className="landing-empty-card">
              <Sparkles size={18} />
              <span>Campaign previews will appear here as new campaigns are created.</span>
            </div>
          )}
        </div>
      </section>

      <section className="landing-section">
        <div className="landing-section-head">
          <div>
            <span className="section-eyebrow">Milestone funding</span>
            <h2>How Fundarc works</h2>
          </div>
        </div>

        <div className="landing-step-grid">
          <div className="landing-step-card">
            <span><FileText size={22} /></span>
            <h3>Create milestones</h3>
            <p>Creators define funding tranches, evidence expectations, and voting rules before launch.</p>
          </div>
          <div className="landing-step-card">
            <span><CircleDollarSign size={22} /></span>
            <h3>Fund with USDC</h3>
            <p>Contributors back campaigns with stablecoin-native funding on Arc Testnet.</p>
          </div>
          <div className="landing-step-card">
            <span><CheckCircle2 size={22} /></span>
            <h3>Approve releases</h3>
            <p>Milestone funds unlock only after contributor review and contribution-weighted approval.</p>
          </div>
        </div>
      </section>

      <section className="landing-section landing-agent-section">
        <div className="landing-agent-copy">
          <span className="section-eyebrow">Circle AI agent automation</span>
          <h2>Contributors can stay represented when they are unavailable.</h2>
          <p>
            Fundarc supports delegated voting through Circle agent wallets, so contributors can assign an agent to
            review milestone context and vote during active voting windows.
          </p>
          <div className="landing-agent-actions">
            <Link className="btn btn-primary" href="/discover">
              Find a campaign
            </Link>
            <Link className="btn" href="/launch">
              Create campaign
            </Link>
          </div>
        </div>

        <div className="landing-agent-panel">
          <div className="agent-orbit-icon">
            <Bot size={34} />
          </div>
          <div className="landing-agent-row">
            <Users size={18} />
            <span>Contributor delegates voting</span>
          </div>
          <div className="landing-agent-row">
            <Bot size={18} />
            <span>Agent reviews milestone context</span>
          </div>
          <div className="landing-agent-row">
            <Vote size={18} />
            <span>Vote is submitted during the window</span>
          </div>
        </div>
      </section>
    </main>
  );
}

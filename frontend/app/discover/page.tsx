"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { formatUnits } from "viem";
import { useReadContract, useReadContracts } from "wagmi";
import { fundarcFactoryAbi } from "@/src/abi/factory";
import { fundarcCampaignAbi } from "@/src/abi/campaign";
import { ArcNameLabel } from "@/src/components/ArcNameLabel";
import { HIDDEN_LEGACY_CAMPAIGN_COUNT } from "@/src/config/campaigns";
import { ExternalLink, Plus, RefreshCcw, Search, Share2, ShieldCheck } from "lucide-react";

const FACTORY = process.env.NEXT_PUBLIC_FACTORY_ADDRESS as `0x${string}`;
const EXPLORER = process.env.NEXT_PUBLIC_EXPLORER!;
const MIN_VISIBLE_CAMPAIGN_USDC = 100n * 1_000_000n;
const CAMPAIGN_META_READS = 9;
const INITIAL_CAMPAIGN_SCAN = 60;
const CAMPAIGN_SCAN_STEP = 60;
const CATEGORY_TAG_PREFIX = "[Fundarc category:";
const DISCOVERY_CATEGORIES = ["All", "Public goods", "Open source", "Creator", "Community"] as const;
const CREATE_CATEGORIES = ["Public goods", "Open source", "Creator", "Community"] as const;

type DiscoveryCategory = (typeof DISCOVERY_CATEGORIES)[number];
type CampaignCategory = (typeof CREATE_CATEGORIES)[number];
type SortMode = "trending" | "newest" | "goal";

type CampaignCard = {
  addr: `0x${string}`;
  title: string;
  description: string;
  creator?: `0x${string}`;
  requested: bigint;
  requestedResolved: boolean;
  totalRaised: bigint;
  totalWithdrawn: bigint;
  externalContributors: number;
  createdAt: number;
  state: number;
  category?: CampaignCategory;
};

function explorerAddress(addr: string) {
  return `${EXPLORER}/address/${addr}`;
}

function getMilestoneAmount(result: unknown): bigint | null {
  if (!result) return null;
  if (typeof (result as any).amount === "bigint") return (result as any).amount;
  if (Array.isArray(result) && typeof result[0] === "bigint") return result[0];
  return null;
}

function numberResult(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  return 0;
}

function formatCreatedAt(timestamp: number) {
  if (!timestamp) return "Creation time unavailable";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(timestamp * 1000));
}

function parseCampaignDescription(rawDescription: string): { description: string; category?: CampaignCategory } {
  const categoryLine = rawDescription
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.startsWith(CATEGORY_TAG_PREFIX) && line.endsWith("]"));
  const category = categoryLine
    ?.replace(CATEGORY_TAG_PREFIX, "")
    .replace("]", "")
    .trim() as CampaignCategory | undefined;
  const validCategory = CREATE_CATEGORIES.includes(category as CampaignCategory) ? category : undefined;

  return {
    description: rawDescription
      .replace(/\n?\[Fundarc category:[^\]]+\]\s*$/i, "")
      .trim(),
    category: validCategory,
  };
}

function shareUrl(addr: string, title: string) {
  const campaignUrl =
    typeof window === "undefined" ? `/campaign/${addr}` : `${window.location.origin}/campaign/${addr}`;
  const text = encodeURIComponent(`Support ${title} on Fundarc`);
  return `https://twitter.com/intent/tweet?text=${text}&url=${encodeURIComponent(campaignUrl)}`;
}

export default function DiscoverPage() {
  const [showCompleted, setShowCompleted] = useState(false);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<DiscoveryCategory>("All");
  const [sortMode, setSortMode] = useState<SortMode>("trending");
  const [scanCount, setScanCount] = useState(INITIAL_CAMPAIGN_SCAN);

  const count = useReadContract({
    abi: fundarcFactoryAbi,
    address: FACTORY,
    functionName: "campaignsCount",
  });

  const n = Number(count.data ?? 0n);
  const discoverableCampaignCount = Math.max(0, n - HIDDEN_LEGACY_CAMPAIGN_COUNT);
  const activeScanCount = Math.min(discoverableCampaignCount, scanCount);
  const hasMoreCampaigns = activeScanCount < discoverableCampaignCount;

  const campaignAddrReads = useMemo(() => {
    return Array.from({ length: activeScanCount }, (_, i) => ({
      abi: fundarcFactoryAbi,
      address: FACTORY,
      functionName: "campaigns" as const,
      args: [BigInt(n - 1 - i)] as const,
    }));
  }, [activeScanCount, n]);

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
      { abi: fundarcCampaignAbi, address: addr, functionName: "description" as const },
      { abi: fundarcCampaignAbi, address: addr, functionName: "milestoneCount" as const },
      { abi: fundarcCampaignAbi, address: addr, functionName: "totalWithdrawn" as const },
      { abi: fundarcCampaignAbi, address: addr, functionName: "creator" as const },
      { abi: fundarcCampaignAbi, address: addr, functionName: "totalRaised" as const },
      { abi: fundarcCampaignAbi, address: addr, functionName: "externalContributors" as const },
      { abi: fundarcCampaignAbi, address: addr, functionName: "createdAt" as const },
      { abi: fundarcCampaignAbi, address: addr, functionName: "campaignState" as const },
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
      const msCountIndex = i * CAMPAIGN_META_READS + 2;
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

  const campaignCards = useMemo(() => {
    if (!metas.data) return [];

    const cards: CampaignCard[] = [];
    let cursor = 0;
    for (let i = 0; i < addresses.length; i++) {
      const offset = i * CAMPAIGN_META_READS;
      const msCountIndex = offset + 2;
      const msCount =
        metas.data[msCountIndex]?.status === "success"
          ? Number(metas.data[msCountIndex].result ?? 0n)
          : 0;

      let sum = 0n;
      let requestedResolved = !!milestonesAll.data && msCount > 0;
      for (let m = 0; m < msCount; m++) {
        const r = milestonesAll.data?.[cursor++];
        if (r?.status === "success") {
          const amt = getMilestoneAmount(r.result);
          if (amt) sum += amt;
        } else {
          requestedResolved = false;
        }
      }

      const title =
        metas.data[offset]?.status === "success" && typeof metas.data[offset].result === "string"
          ? (metas.data[offset].result as string)
          : "Campaign";
      const description =
        metas.data[offset + 1]?.status === "success" && typeof metas.data[offset + 1].result === "string"
          ? (metas.data[offset + 1].result as string)
          : "";
      const parsedDescription = parseCampaignDescription(description);
      const creator =
        metas.data[offset + 4]?.status === "success" && typeof metas.data[offset + 4].result === "string"
          ? (metas.data[offset + 4].result as `0x${string}`)
          : undefined;

      cards.push({
        addr: addresses[i],
        title,
        description: parsedDescription.description,
        creator,
        requested: sum,
        requestedResolved,
        totalWithdrawn:
          metas.data[offset + 3]?.status === "success" ? (metas.data[offset + 3].result as bigint) : 0n,
        totalRaised:
          metas.data[offset + 5]?.status === "success" ? (metas.data[offset + 5].result as bigint) : 0n,
        externalContributors:
          metas.data[offset + 6]?.status === "success" ? numberResult(metas.data[offset + 6].result) : 0,
        createdAt:
          metas.data[offset + 7]?.status === "success" ? numberResult(metas.data[offset + 7].result) : 0,
        state: metas.data[offset + 8]?.status === "success" ? numberResult(metas.data[offset + 8].result) : 0,
        category: parsedDescription.category,
      });
    }

    return cards;
  }, [addresses, metas.data, milestonesAll.data]);

  const visibleCampaigns = useMemo(() => {
    const q = query.trim().toLowerCase();

    return campaignCards
      .filter((campaign) => {
        const isBelowVisibleGoal =
          !campaign.requestedResolved || campaign.requested < MIN_VISIBLE_CAMPAIGN_USDC;
        const isCompleted =
          campaign.requestedResolved && campaign.requested > 0n && campaign.totalWithdrawn >= campaign.requested;
        const matchesQuery =
          !q ||
          campaign.title.toLowerCase().includes(q) ||
          campaign.description.toLowerCase().includes(q) ||
          campaign.addr.toLowerCase().includes(q) ||
          campaign.creator?.toLowerCase().includes(q);
        const matchesCategory = category === "All" || campaign.category === category;

        return !isBelowVisibleGoal && (showCompleted || !isCompleted) && matchesQuery && matchesCategory;
      })
      .sort((a, b) => {
        if (sortMode === "newest") return b.createdAt - a.createdAt;
        if (sortMode === "goal") return Number(b.requested - a.requested);
        const bTrend = b.totalRaised + BigInt(b.externalContributors) * 10_000_000n;
        const aTrend = a.totalRaised + BigInt(a.externalContributors) * 10_000_000n;
        return Number(bTrend - aTrend);
      });
  }, [campaignCards, category, query, showCompleted, sortMode]);

  const verifyingCampaigns = campaignCards.filter((campaign) => !campaign.requestedResolved).length;
  const listLoading =
    count.isLoading ||
    campaignAddrs.isLoading ||
    metas.isLoading ||
    (milestoneReads.length > 0 && milestonesAll.isLoading);

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
            <h1 className="hero-title">Discover campaigns</h1>
            <div className="subtext">Find verified Fundarc campaigns by category, traction, creator, and search.</div>
          </div>
          <div className="actions">
            <Link className="btn btn-primary" href="/launch">
              <Plus size={16} />
              Create campaign
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
          <span className="badge">{visibleCampaigns.length} shown</span>
          <span className="badge">{discoverableCampaignCount.toLocaleString()} discoverable</span>
          {verifyingCampaigns > 0 ? <span className="badge">{verifyingCampaigns} verifying goal</span> : null}
        </div>
      </section>

      <section className="section discover-shell">
        <div className="discovery-panel">
          <div className="discovery-controls">
            <label className="search-box">
              <Search size={16} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search campaigns, creators, or addresses"
              />
            </label>
            <label className="field compact-field">
              <span>Category</span>
              <select value={category} onChange={(e) => setCategory(e.target.value as DiscoveryCategory)}>
                {DISCOVERY_CATEGORIES.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <label className="field compact-field">
              <span>Sort</span>
              <select value={sortMode} onChange={(e) => setSortMode(e.target.value as SortMode)}>
                <option value="trending">Trending</option>
                <option value="newest">Newest</option>
                <option value="goal">Highest goal</option>
              </select>
            </label>
          </div>
          <div className="row spread">
            <label className="check-row">
              <input type="checkbox" checked={showCompleted} onChange={(e) => setShowCompleted(e.target.checked)} />
              Show completed
            </label>
            <div className="fineprint">
              Scanning newest {activeScanCount.toLocaleString()} of {discoverableCampaignCount.toLocaleString()} campaigns.
            </div>
          </div>
        </div>

        <div className="section-gap">
          {listLoading ? <div className="status-card">Loading campaign discovery.</div> : null}
          {!listLoading && visibleCampaigns.length === 0 ? (
            <div className="status-card">No verified campaigns match these discovery filters.</div>
          ) : null}

          <div className="campaign-card-grid">
            {visibleCampaigns.map((campaign) => {
              const isCompleted =
                campaign.requestedResolved &&
                campaign.requested > 0n &&
                campaign.totalWithdrawn >= campaign.requested;
              const progressPct =
                campaign.requested > 0n
                  ? Math.min(100, Number((campaign.totalRaised * 100n) / campaign.requested))
                  : 0;

              return (
                <article key={campaign.addr} className="campaign-discovery-card">
                  <div className="campaign-card-top">
                    <div className="campaign-card-title">
                      <h2>{campaign.title}</h2>
                      <div className="mono address-line">{campaign.addr}</div>
                    </div>
                    <div className="campaign-card-badges">
                      {isCompleted ? <span className="badge badge-success">Completed</span> : null}
                      {campaign.category ? <span className="badge">{campaign.category}</span> : null}
                    </div>
                  </div>

                  {campaign.creator ? (
                    <div className="subtext">
                      Creator: <ArcNameLabel address={campaign.creator} className="mono" />
                    </div>
                  ) : null}

                  {campaign.description ? (
                    <div className="subtext campaign-description">{campaign.description}</div>
                  ) : null}

                  <div className="campaign-progress" aria-label={`${progressPct}% funded`}>
                    <span style={{ width: `${progressPct}%` }} />
                  </div>

                  <div className="campaign-card-stats">
                    <div>
                      <span>Requested</span>
                      <strong>{campaign.requestedResolved ? `${formatUnits(campaign.requested, 6)} USDC` : "Loading"}</strong>
                    </div>
                    <div>
                      <span>Raised</span>
                      <strong>{formatUnits(campaign.totalRaised, 6)} USDC</strong>
                    </div>
                    <div>
                      <span>Withdrawn</span>
                      <strong>{formatUnits(campaign.totalWithdrawn, 6)} USDC</strong>
                    </div>
                  </div>

                  <div className="fineprint">Created: {formatCreatedAt(campaign.createdAt)}</div>

                  <div className="campaign-card-actions">
                    <Link className="btn btn-primary btn-sm" href={`/campaign/${campaign.addr}`}>
                      Open
                    </Link>
                    {campaign.creator ? (
                      <Link className="btn btn-sm" href={`/creator/${campaign.creator}`}>
                        Reputation <ShieldCheck size={16} />
                      </Link>
                    ) : null}
                    <a className="btn btn-sm" href={shareUrl(campaign.addr, campaign.title)} target="_blank" rel="noreferrer">
                      Share <Share2 size={16} />
                    </a>
                    <a className="btn btn-sm" href={explorerAddress(campaign.addr)} target="_blank" rel="noreferrer">
                      ArcScan <ExternalLink size={16} />
                    </a>
                  </div>
                </article>
              );
            })}
          </div>

          {hasMoreCampaigns ? (
            <button
              className="btn btn-block"
              type="button"
              onClick={() => setScanCount((current) => Math.min(n, current + CAMPAIGN_SCAN_STEP))}
            >
              Scan older campaigns
            </button>
          ) : null}
        </div>
      </section>
    </main>
  );
}

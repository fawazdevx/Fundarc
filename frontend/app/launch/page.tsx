// app/page.tsx

"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import toast from "react-hot-toast";
import { formatUnits, isAddressEqual, parseUnits, zeroAddress } from "viem";
import {
  useAccount,
  usePublicClient,
  useReadContract,
  useReadContracts,
  useWriteContract,
} from "wagmi";
import { fundarcFactoryAbi } from "@/src/abi/factory";
import { fundarcCampaignAbi } from "@/src/abi/campaign";
import { erc20Abi } from "@/src/abi/erc20";
import { ArcNameLabel } from "@/src/components/ArcNameLabel";
import { HIDDEN_LEGACY_CAMPAIGN_COUNT } from "@/src/config/campaigns";
import { BarChart3, ExternalLink, Plus, RefreshCcw, Search, Share2, ShieldCheck } from "lucide-react";

const FACTORY = process.env.NEXT_PUBLIC_FACTORY_ADDRESS as `0x${string}`;
const EXPLORER = process.env.NEXT_PUBLIC_EXPLORER!;
const USDC = process.env.NEXT_PUBLIC_USDC_ADDRESS as `0x${string}`;
const CAMPAIGN_CREATION_MAINTENANCE =
  process.env.NEXT_PUBLIC_CAMPAIGN_CREATION_MAINTENANCE === "true";
const MIN_RECOMMENDED_CAMPAIGN_USDC = 100;
const MIN_VISIBLE_CAMPAIGN_USDC = 100n * 1_000_000n;
const CAMPAIGN_META_READS = 9;
const INITIAL_CAMPAIGN_SCAN = 60;
const CAMPAIGN_SCAN_STEP = 60;
const MAX_MILESTONES = 12;
const MAX_TITLE_LENGTH = 96;
const MAX_DESCRIPTION_LENGTH = 1_900;
const MAX_VOTING_PERIOD_HOURS = 24 * 30;
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

function getErrorMessage(e: any, fallback: string) {
  return e?.shortMessage ?? e?.message ?? fallback;
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

function descriptionWithCategory(description: string, category: CampaignCategory) {
  return `${description.trim()}\n\n${CATEGORY_TAG_PREFIX} ${category}]`;
}

function shareUrl(addr: string, title: string) {
  const campaignUrl =
    typeof window === "undefined" ? `/campaign/${addr}` : `${window.location.origin}/campaign/${addr}`;
  const text = encodeURIComponent(`Support ${title} on Fundarc`);
  return `https://twitter.com/intent/tweet?text=${text}&url=${encodeURIComponent(campaignUrl)}`;
}

export default function HomePage() {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync, isPending } = useWriteContract();

  const [showCompleted, setShowCompleted] = useState(false);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<DiscoveryCategory>("All");
  const [sortMode, setSortMode] = useState<SortMode>("trending");
  const [scanCount, setScanCount] = useState(INITIAL_CAMPAIGN_SCAN);

  const [title, setTitle] = useState("Fundarc Campaign");
  const [description, setDescription] = useState(
    "Milestone-based stablecoin crowdfunding on Arc."
  );
  const [createCategory, setCreateCategory] = useState<CampaignCategory>("Public goods");
  const [milestones, setMilestones] = useState<string[]>(["100", "200"]);
  const [votingPeriodHours, setVotingPeriodHours] = useState(24);
  const [quorumBps, setQuorumBps] = useState(2000);
  const [passBps, setPassBps] = useState(6000);

  const count = useReadContract({
    abi: fundarcFactoryAbi,
    address: FACTORY,
    functionName: "campaignsCount",
  });
  const campaignCreationPaused = useReadContract({
    abi: fundarcFactoryAbi,
    address: FACTORY,
    functionName: "campaignCreationPaused",
  });
  const campaignCreationFee = useReadContract({
    abi: fundarcFactoryAbi,
    address: FACTORY,
    functionName: "campaignCreationFee",
  });
  const factoryAllowance = useReadContract({
    abi: erc20Abi,
    address: USDC,
    functionName: "allowance",
    args: [address ?? "0x0000000000000000000000000000000000000000", FACTORY],
    query: { enabled: !!address },
  });
  const activeCampaignByCreator = useReadContract({
    abi: fundarcFactoryAbi,
    address: FACTORY,
    functionName: "activeCampaignByCreator",
    args: [address ?? zeroAddress],
    query: { enabled: !!address },
  });

  const n = Number(count.data ?? 0n);
  const isCreationPaused =
    CAMPAIGN_CREATION_MAINTENANCE || campaignCreationPaused.data === true;
  const discoverableCampaignCount = Math.max(0, n - HIDDEN_LEGACY_CAMPAIGN_COUNT);
  const activeScanCount = Math.min(discoverableCampaignCount, scanCount);
  const hasMoreCampaigns = activeScanCount < discoverableCampaignCount;
  const milestoneTotal = useMemo(() => {
    try {
      return milestones
        .map((s) => s.trim())
        .filter(Boolean)
        .reduce((sum, value) => sum + parseUnits(value, 6), 0n);
    } catch {
      return 0n;
    }
  }, [milestones]);

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
  const activeCampaignFromFactory =
    activeCampaignByCreator.data &&
    typeof activeCampaignByCreator.data === "string" &&
    activeCampaignByCreator.data !== zeroAddress
      ? (activeCampaignByCreator.data as `0x${string}`)
      : undefined;
  const activeCampaignFromVisibleList = useMemo(() => {
    if (!address) return undefined;
    return campaignCards.find(
      (campaign) =>
        campaign.state === 0 &&
        !!campaign.creator &&
        isAddressEqual(campaign.creator, address)
    )?.addr;
  }, [address, campaignCards]);
  const activeCampaignAddress = activeCampaignFromFactory ?? activeCampaignFromVisibleList;
  const hasActiveCampaign = !!activeCampaignAddress;

  async function create() {
    if (CAMPAIGN_CREATION_MAINTENANCE || campaignCreationPaused.data === true) {
      toast.error("Campaign creation is temporarily paused for maintenance.");
      return;
    }

    if (!address) {
      toast.error("Connect your wallet first.");
      return;
    }
    if (hasActiveCampaign) {
      toast.error("You already have an active campaign. Finalize or complete it before creating another.");
      return;
    }

    const cleaned = milestones.map((s) => s.trim()).filter(Boolean);
    if (cleaned.length === 0) {
      toast.error("Add at least one milestone.");
      return;
    }
    if (cleaned.length > MAX_MILESTONES) {
      toast.error(`Use ${MAX_MILESTONES} milestones or fewer.`);
      return;
    }
    if (!title.trim() || title.trim().length > MAX_TITLE_LENGTH) {
      toast.error(`Title must be 1-${MAX_TITLE_LENGTH} characters.`);
      return;
    }
    if (!description.trim() || description.trim().length > MAX_DESCRIPTION_LENGTH) {
      toast.error(`Description must be 1-${MAX_DESCRIPTION_LENGTH} characters.`);
      return;
    }
    if (votingPeriodHours < 1 || votingPeriodHours > MAX_VOTING_PERIOD_HOURS) {
      toast.error(`Voting period must be between 1 hour and ${MAX_VOTING_PERIOD_HOURS} hours.`);
      return;
    }
    if (quorumBps < 0 || quorumBps > 10_000 || passBps < 0 || passBps > 10_000) {
      toast.error("Quorum and pass values must be between 0 and 10000 bps.");
      return;
    }

    const votingPeriodSeconds = votingPeriodHours * 60 * 60;
    const toastId = toast.loading("Creating campaign...");

    try {
      const ms = cleaned.map((s) => parseUnits(s, 6));
      if (ms.some((amt) => amt <= 0n)) {
        toast.error("Each milestone amount must be greater than zero.", { id: toastId });
        return;
      }
      const requestedTotal = ms.reduce((sum, amt) => sum + amt, 0n);
      if (requestedTotal < MIN_VISIBLE_CAMPAIGN_USDC) {
        toast.error(`Campaign goal must be at least ${MIN_RECOMMENDED_CAMPAIGN_USDC} USDC.`, { id: toastId });
        return;
      }
      const creationFee = (campaignCreationFee.data ?? 0n) as bigint;
      const currentAllowance = (factoryAllowance.data ?? 0n) as bigint;

      if (creationFee > 0n && currentAllowance < creationFee) {
        toast.loading("Approving campaign creation fee...", { id: toastId });
        const approvalHash = await writeContractAsync({
          abi: erc20Abi,
          address: USDC,
          functionName: "approve",
          args: [FACTORY, creationFee],
        });
        await publicClient?.waitForTransactionReceipt({ hash: approvalHash });
      }

      toast.loading("Creating campaign...", { id: toastId });
      const hash = await writeContractAsync({
        abi: fundarcFactoryAbi,
        address: FACTORY,
        functionName: "createCampaign",
        args: [
          title.trim(),
          descriptionWithCategory(description, createCategory),
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
      activeCampaignByCreator.refetch?.();
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
          {isCreationPaused ? (
            <div className="maintenance-panel">
              <span className="badge badge-warn">Maintenance mode</span>
              <div className="section-copy">
                <h2>Campaign creation is paused</h2>
                <div className="subtext">
                  Fundarc is temporarily blocking new campaign creation while updates are in progress. Existing
                  campaigns remain visible for review.
                </div>
              </div>
              <div className="kv">
                <div>
                  <div className="k">Upcoming creation minimum</div>
                  <div className="v">{MIN_RECOMMENDED_CAMPAIGN_USDC} USDC</div>
                </div>
                <div className="subtext">
                  This minimum will make tiny campaign farming much harder and keep reputation tied to meaningful
                  funding goals.
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="section-head">
                <div className="section-copy">
                  <h2>Create campaign</h2>
                  <div className="subtext">Define funding tranches, voting rules, and campaign metadata.</div>
                </div>
              </div>

              {hasActiveCampaign ? (
                <div className="status-card section-gap">
                  You already have an active campaign. Finalize, cancel, or complete it before creating another.
                  <div className="actions section-gap">
                    <Link className="btn btn-primary btn-sm" href={`/campaign/${activeCampaignAddress}`}>
                      Open active campaign
                    </Link>
                  </div>
                </div>
              ) : null}

              <div className="field">
                <label>Title</label>
                <input maxLength={MAX_TITLE_LENGTH} value={title} onChange={(e) => setTitle(e.target.value)} />
                <div className="fineprint">{title.length}/{MAX_TITLE_LENGTH}</div>
              </div>

              <div className="field section-gap">
                <label>Description</label>
                <textarea
                  maxLength={MAX_DESCRIPTION_LENGTH}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
                <div className="fineprint">{description.length}/{MAX_DESCRIPTION_LENGTH}</div>
              </div>

              <div className="field section-gap">
                <label>Category</label>
                <select value={createCategory} onChange={(e) => setCreateCategory(e.target.value as CampaignCategory)}>
                  {CREATE_CATEGORIES.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
                <div className="fineprint">This is saved with the campaign so Discovery filters can find it later.</div>
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
                  <button
                    className="btn btn-primary"
                    onClick={() => setMilestones([...milestones, "50"])}
                    disabled={milestones.length >= MAX_MILESTONES}
                    type="button"
                  >
                    <Plus size={16} />
                    Add milestone
                  </button>
                </div>
                <div className={milestoneTotal < MIN_VISIBLE_CAMPAIGN_USDC ? "fineprint warn-text" : "fineprint"}>
                  Total requested: {formatUnits(milestoneTotal, 6)} USDC. Minimum: {MIN_RECOMMENDED_CAMPAIGN_USDC} USDC. Max milestones: {MAX_MILESTONES}.
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
                  disabled={isPending || !address || hasActiveCampaign}
                  type="button"
                >
                  {isPending
                    ? "Creating..."
                    : !address
                      ? "Connect wallet to create"
                      : hasActiveCampaign
                        ? "Active campaign already exists"
                        : "Create Campaign"}
                </button>
              </div>
            </>
          )}
        </section>

        {/* LIST */}
        <section className="card section">
          <div className="section-head">
            <div className="section-copy">
              <h2>Discovery</h2>
              <div className="subtext">Find verified campaigns by category, traction, creator reputation, and search.</div>
            </div>
            <span className="badge">{visibleCampaigns.length} shown</span>
          </div>

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
              <div className="fineprint">
                Discovery starts at campaign #{HIDDEN_LEGACY_CAMPAIGN_COUNT + 1} and scans newest campaigns first.
              </div>
              <div className="row">
                {verifyingCampaigns > 0 ? <span className="badge">{verifyingCampaigns} verifying goal</span> : null}
              </div>
            </div>
          </div>

          <div className="row spread section-gap">
            <label className="check-row">
              <input type="checkbox" checked={showCompleted} onChange={(e) => setShowCompleted(e.target.checked)} />
              Show completed
            </label>
          </div>

          <div className="divider" />

          <div className="stack">
            {listLoading ? <div className="status-card">Loading campaign discovery once. This may take a moment after the spam cleanup.</div> : null}
            {!listLoading && visibleCampaigns.length === 0 ? (
              <div className="status-card">No verified campaigns match these discovery filters.</div>
            ) : null}
            {visibleCampaigns.map((campaign) => {
              const isCompleted =
                campaign.requestedResolved &&
                campaign.requested > 0n &&
                campaign.totalWithdrawn >= campaign.requested;

              return (
                <div key={campaign.addr} className="kv campaign-item">
                  <div style={{ minWidth: 0 }}>
                    <div className="k">
                      {campaign.title}{" "}
                      {isCompleted ? <span className="badge badge-success" style={{ marginLeft: 8 }}>Completed</span> : null}
                      {campaign.category ? <span className="badge" style={{ marginLeft: 8 }}>{campaign.category}</span> : null}
                    </div>
                    <div className="v mono address-line">
                      {campaign.addr}
                    </div>
                    {campaign.creator ? (
                      <div className="subtext" style={{ marginTop: 4 }}>
                        Creator: <ArcNameLabel address={campaign.creator} className="mono" />
                      </div>
                    ) : null}
                    {campaign.description ? (
                      <div className="subtext campaign-description">{campaign.description}</div>
                    ) : null}
                    <div className="subtext" style={{ marginTop: 4 }}>
                      Requested:{" "}
                      {campaign.requestedResolved ? `${formatUnits(campaign.requested, 6)} USDC` : "loading goal"} •
                      Raised: {formatUnits(campaign.totalRaised, 6)} USDC • Withdrawn:{" "}
                      {formatUnits(campaign.totalWithdrawn, 6)} USDC
                    </div>
                    <div className="subtext" style={{ marginTop: 4 }}>
                      Created: {formatCreatedAt(campaign.createdAt)}
                    </div>
                  </div>

                  <div className="actions">
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
                </div>
              );
            })}
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
      </div>
    </main>
  );
}

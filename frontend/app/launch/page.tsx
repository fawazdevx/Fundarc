"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import toast from "react-hot-toast";
import { formatUnits, parseUnits, zeroAddress } from "viem";
import { useAccount, usePublicClient, useReadContract, useWriteContract } from "wagmi";
import { fundarcFactoryAbi } from "@/src/abi/factory";
import { erc20Abi } from "@/src/abi/erc20";
import { BarChart3, Compass, ExternalLink, Plus } from "lucide-react";

const FACTORY = process.env.NEXT_PUBLIC_FACTORY_ADDRESS as `0x${string}`;
const EXPLORER = process.env.NEXT_PUBLIC_EXPLORER!;
const USDC = process.env.NEXT_PUBLIC_USDC_ADDRESS as `0x${string}`;
const CAMPAIGN_CREATION_MAINTENANCE =
  process.env.NEXT_PUBLIC_CAMPAIGN_CREATION_MAINTENANCE === "true";
const MIN_RECOMMENDED_CAMPAIGN_USDC = 100;
const MIN_VISIBLE_CAMPAIGN_USDC = 100n * 1_000_000n;
const MAX_MILESTONES = 12;
const MAX_TITLE_LENGTH = 96;
const MAX_DESCRIPTION_LENGTH = 1_900;
const MAX_VOTING_PERIOD_HOURS = 24 * 30;
const CATEGORY_TAG_PREFIX = "[Fundarc category:";
const CREATE_CATEGORIES = ["Public goods", "Open source", "Creator", "Community"] as const;

type CampaignCategory = (typeof CREATE_CATEGORIES)[number];

function explorerAddress(addr: string) {
  return `${EXPLORER}/address/${addr}`;
}

function getErrorMessage(e: any, fallback: string) {
  return e?.shortMessage ?? e?.message ?? fallback;
}

function descriptionWithCategory(description: string, category: CampaignCategory) {
  return `${description.trim()}\n\n${CATEGORY_TAG_PREFIX} ${category}]`;
}

export default function LaunchPage() {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync, isPending } = useWriteContract();

  const [title, setTitle] = useState("Fundarc Campaign");
  const [description, setDescription] = useState("Milestone-based stablecoin crowdfunding on Arc.");
  const [createCategory, setCreateCategory] = useState<CampaignCategory>("Public goods");
  const [milestones, setMilestones] = useState<string[]>(["100", "200"]);
  const [votingPeriodHours, setVotingPeriodHours] = useState(24);
  const [quorumBps, setQuorumBps] = useState(2000);
  const [passBps, setPassBps] = useState(6000);

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
    args: [address ?? zeroAddress, FACTORY],
    query: { enabled: !!address },
  });
  const activeCampaignByCreator = useReadContract({
    abi: fundarcFactoryAbi,
    address: FACTORY,
    functionName: "activeCampaignByCreator",
    args: [address ?? zeroAddress],
    query: { enabled: !!address },
  });

  const isCreationPaused = CAMPAIGN_CREATION_MAINTENANCE || campaignCreationPaused.data === true;
  const activeCampaignAddress =
    activeCampaignByCreator.data &&
    typeof activeCampaignByCreator.data === "string" &&
    activeCampaignByCreator.data !== zeroAddress
      ? (activeCampaignByCreator.data as `0x${string}`)
      : undefined;
  const hasActiveCampaign = !!activeCampaignAddress;
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

      activeCampaignByCreator.refetch?.();
      toast.success("Campaign created successfully.", { id: toastId });
    } catch (e: any) {
      console.error(e);
      toast.error(getErrorMessage(e, "Failed to create campaign."), { id: toastId });
    }
  }

  return (
    <main className="page">
      <section className="card hero">
        <div className="row spread">
          <div>
            <h1 className="hero-title">Create campaign</h1>
            <div className="subtext">Launch a USDC-native milestone campaign on Arc Testnet.</div>
          </div>
          <div className="actions">
            <Link className="btn btn-primary" href="/discover">
              <Compass size={16} />
              Discover campaigns
            </Link>
            <Link className="btn" href="/dashboard">
              <BarChart3 size={16} />
              Metrics
            </Link>
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

      <div className="create-shell section-gap">
        <section className="card section">
          {isCreationPaused ? (
            <div className="maintenance-panel">
              <span className="badge badge-warn">Maintenance mode</span>
              <div className="section-copy">
                <h2>Campaign creation is paused</h2>
                <div className="subtext">
                  Fundarc is temporarily blocking new campaign creation while updates are in progress. Existing
                  campaigns remain available in discovery.
                </div>
              </div>
              <div className="kv">
                <div>
                  <div className="k">Upcoming creation minimum</div>
                  <div className="v">{MIN_RECOMMENDED_CAMPAIGN_USDC} USDC</div>
                </div>
                <div className="subtext">
                  This minimum makes tiny campaign farming much harder and keeps reputation tied to meaningful funding
                  goals.
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="section-head">
                <div className="section-copy">
                  <h2>Campaign details</h2>
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
                <div className="fineprint">This is saved with the campaign so discovery filters can find it later.</div>
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
                  Total requested: {formatUnits(milestoneTotal, 6)} USDC. Minimum: {MIN_RECOMMENDED_CAMPAIGN_USDC} USDC.
                  Max milestones: {MAX_MILESTONES}.
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
      </div>
    </main>
  );
}

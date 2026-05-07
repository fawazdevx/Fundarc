"use client";

import { useMemo } from "react";
import { formatUnits } from "viem";
import { useReadContract, useReadContracts } from "wagmi";
import { fundarcCampaignAbi } from "@/src/abi/campaign";
import { fundarcFactoryAbi } from "@/src/abi/factory";

const FACTORY = process.env.NEXT_PUBLIC_FACTORY_ADDRESS as `0x${string}`;

const META_READS_PER_CAMPAIGN = 8;

export type ReputationCampaign = {
  address: `0x${string}`;
  title: string;
  creator: `0x${string}`;
  campaignState: number;
  totalRaised: bigint;
  totalRefunded: bigint;
  totalWithdrawn: bigint;
  unlockedAmount: bigint;
  milestoneCount: number;
  approvedMilestones: number;
  rejectedMilestones: number;
  submittedMilestones: number;
  requestedAmount: bigint;
};

export type CreatorReputation = {
  creator: `0x${string}`;
  score: number;
  label: string;
  campaignsCreated: number;
  completedCampaigns: number;
  activeCampaigns: number;
  failedCampaigns: number;
  canceledCampaigns: number;
  approvedMilestones: number;
  rejectedMilestones: number;
  submittedMilestones: number;
  milestoneApprovalRate: number;
  totalRaised: bigint;
  totalUnlocked: bigint;
  totalRefunded: bigint;
  campaigns: ReputationCampaign[];
};

type MilestoneResult = {
  amount?: bigint;
  state?: number;
};

function sameAddress(a?: string, b?: string) {
  return !!a && !!b && a.toLowerCase() === b.toLowerCase();
}

function bigintResult(value: unknown) {
  return typeof value === "bigint" ? value : 0n;
}

function numberResult(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  return 0;
}

function milestoneParts(result: unknown): { amount: bigint; state: number } {
  const milestone = result as MilestoneResult | readonly unknown[];

  if (Array.isArray(milestone)) {
    return {
      amount: bigintResult(milestone[0]),
      state: numberResult(milestone[3]),
    };
  }

  return {
    amount: bigintResult((milestone as MilestoneResult)?.amount),
    state: numberResult((milestone as MilestoneResult)?.state),
  };
}

function reputationLabel(score: number, stats: Pick<CreatorReputation, "campaignsCreated" | "failedCampaigns" | "canceledCampaigns">) {
  if (stats.failedCampaigns > 0 && score < 25) return "High risk";
  if (stats.campaignsCreated === 0) return "New creator";
  if (score >= 90) return "Top creator";
  if (score >= 55) return "Reliable creator";
  if (score >= 25) return "Verified builder";
  if (stats.canceledCampaigns > 0 || stats.failedCampaigns > 0) return "Needs review";
  return "New creator";
}

function scoreReputation(stats: Omit<CreatorReputation, "score" | "label" | "creator" | "campaigns" | "milestoneApprovalRate">) {
  const unlockedUSDC = Number(formatUnits(stats.totalUnlocked, 6));
  const raisedUSDC = Number(formatUnits(stats.totalRaised, 6));

  return Math.max(
    0,
    Math.round(
      stats.campaignsCreated * 2 +
        stats.completedCampaigns * 20 +
        stats.approvedMilestones * 10 +
        Math.min(unlockedUSDC / 25, 30) +
        Math.min(raisedUSDC / 100, 15) -
        stats.failedCampaigns * 25 -
        stats.canceledCampaigns * 15 -
        stats.rejectedMilestones * 15
    )
  );
}

export function useCreatorReputation(targetCreator?: string) {
  const count = useReadContract({
    abi: fundarcFactoryAbi,
    address: FACTORY,
    functionName: "campaignsCount",
  });

  const campaignCount = Number(count.data ?? 0n);

  const campaignReads = useMemo(
    () =>
      Array.from({ length: campaignCount }, (_, i) => ({
        abi: fundarcFactoryAbi,
        address: FACTORY,
        functionName: "campaigns" as const,
        args: [BigInt(i)] as const,
      })),
    [campaignCount]
  );

  const campaignAddresses = useReadContracts({
    contracts: campaignReads,
    query: { enabled: campaignReads.length > 0 },
  });

  const addresses = useMemo(
    () =>
      (campaignAddresses.data ?? [])
        .filter((r) => r.status === "success" && typeof r.result === "string")
        .map((r) => r.result as `0x${string}`),
    [campaignAddresses.data]
  );

  const metaReads = useMemo(
    () =>
      addresses.flatMap((address) => [
        { abi: fundarcCampaignAbi, address, functionName: "title" as const },
        { abi: fundarcCampaignAbi, address, functionName: "creator" as const },
        { abi: fundarcCampaignAbi, address, functionName: "campaignState" as const },
        { abi: fundarcCampaignAbi, address, functionName: "totalRaised" as const },
        { abi: fundarcCampaignAbi, address, functionName: "totalRefunded" as const },
        { abi: fundarcCampaignAbi, address, functionName: "totalWithdrawn" as const },
        { abi: fundarcCampaignAbi, address, functionName: "unlockedAmount" as const },
        { abi: fundarcCampaignAbi, address, functionName: "milestoneCount" as const },
      ]),
    [addresses]
  );

  const metas = useReadContracts({
    contracts: metaReads,
    query: { enabled: metaReads.length > 0 },
  });

  const milestoneReads = useMemo(() => {
    if (!metas.data) return [];

    return addresses.flatMap((address, campaignIndex) => {
      const milestoneCountIndex = campaignIndex * META_READS_PER_CAMPAIGN + 7;
      const milestoneCount =
        metas.data?.[milestoneCountIndex]?.status === "success"
          ? Number(metas.data[milestoneCountIndex].result ?? 0n)
          : 0;

      return Array.from({ length: milestoneCount }, (_, milestoneIndex) => ({
        abi: fundarcCampaignAbi,
        address,
        functionName: "getMilestone" as const,
        args: [BigInt(milestoneIndex)] as const,
      }));
    });
  }, [addresses, metas.data]);

  const milestones = useReadContracts({
    contracts: milestoneReads,
    query: { enabled: milestoneReads.length > 0 },
  });

  const campaigns = useMemo(() => {
    if (!metas.data) return [];

    const result: ReputationCampaign[] = [];
    let milestoneCursor = 0;

    for (let i = 0; i < addresses.length; i++) {
      const offset = i * META_READS_PER_CAMPAIGN;
      const creatorResult = metas.data[offset + 1];

      if (creatorResult?.status !== "success" || typeof creatorResult.result !== "string") {
        continue;
      }

      const milestoneCount = numberResult(
        metas.data[offset + 7]?.status === "success" ? metas.data[offset + 7].result : 0n
      );
      let approvedMilestones = 0;
      let rejectedMilestones = 0;
      let submittedMilestones = 0;
      let requestedAmount = 0n;

      for (let m = 0; m < milestoneCount; m++) {
        const milestoneRead = milestones.data?.[milestoneCursor++];
        if (milestoneRead?.status !== "success") continue;

        const milestone = milestoneParts(milestoneRead.result);
        requestedAmount += milestone.amount;

        if (milestone.state !== 0) submittedMilestones += 1;
        if (milestone.state === 2 || milestone.state === 4) approvedMilestones += 1;
        if (milestone.state === 3) rejectedMilestones += 1;
      }

      result.push({
        address: addresses[i],
        title:
          metas.data[offset]?.status === "success" && typeof metas.data[offset].result === "string"
            ? metas.data[offset].result
            : "Campaign",
        creator: creatorResult.result as `0x${string}`,
        campaignState: numberResult(
          metas.data[offset + 2]?.status === "success" ? metas.data[offset + 2].result : 0
        ),
        totalRaised: bigintResult(
          metas.data[offset + 3]?.status === "success" ? metas.data[offset + 3].result : 0n
        ),
        totalRefunded: bigintResult(
          metas.data[offset + 4]?.status === "success" ? metas.data[offset + 4].result : 0n
        ),
        totalWithdrawn: bigintResult(
          metas.data[offset + 5]?.status === "success" ? metas.data[offset + 5].result : 0n
        ),
        unlockedAmount: bigintResult(
          metas.data[offset + 6]?.status === "success" ? metas.data[offset + 6].result : 0n
        ),
        milestoneCount,
        approvedMilestones,
        rejectedMilestones,
        submittedMilestones,
        requestedAmount,
      });
    }

    return result;
  }, [addresses, metas.data, milestones.data]);

  const creators = useMemo(() => {
    const byCreator = new Map<`0x${string}`, ReputationCampaign[]>();

    for (const campaign of campaigns) {
      const key = campaign.creator.toLowerCase() as `0x${string}`;
      byCreator.set(key, [...(byCreator.get(key) ?? []), campaign]);
    }

    return Array.from(byCreator, ([creator, creatorCampaigns]) => {
      const baseStats = creatorCampaigns.reduce(
        (acc, campaign) => ({
          campaignsCreated: acc.campaignsCreated + 1,
          completedCampaigns: acc.completedCampaigns + (campaign.campaignState === 3 ? 1 : 0),
          activeCampaigns: acc.activeCampaigns + (campaign.campaignState === 0 ? 1 : 0),
          failedCampaigns: acc.failedCampaigns + (campaign.campaignState === 2 ? 1 : 0),
          canceledCampaigns: acc.canceledCampaigns + (campaign.campaignState === 1 ? 1 : 0),
          approvedMilestones: acc.approvedMilestones + campaign.approvedMilestones,
          rejectedMilestones: acc.rejectedMilestones + campaign.rejectedMilestones,
          submittedMilestones: acc.submittedMilestones + campaign.submittedMilestones,
          totalRaised: acc.totalRaised + campaign.totalRaised,
          totalUnlocked: acc.totalUnlocked + campaign.unlockedAmount,
          totalRefunded: acc.totalRefunded + campaign.totalRefunded,
        }),
        {
          campaignsCreated: 0,
          completedCampaigns: 0,
          activeCampaigns: 0,
          failedCampaigns: 0,
          canceledCampaigns: 0,
          approvedMilestones: 0,
          rejectedMilestones: 0,
          submittedMilestones: 0,
          totalRaised: 0n,
          totalUnlocked: 0n,
          totalRefunded: 0n,
        }
      );
      const milestoneApprovalRate =
        baseStats.submittedMilestones === 0
          ? 0
          : Math.round((baseStats.approvedMilestones / baseStats.submittedMilestones) * 100);
      const score = scoreReputation(baseStats);

      return {
        creator,
        ...baseStats,
        milestoneApprovalRate,
        score,
        label: reputationLabel(score, baseStats),
        campaigns: creatorCampaigns,
      } satisfies CreatorReputation;
    }).sort((a, b) => b.score - a.score);
  }, [campaigns]);

  const creator = creators.find((item) => sameAddress(item.creator, targetCreator));

  return {
    creators,
    creator,
    campaigns,
    isLoading: count.isLoading || campaignAddresses.isLoading || metas.isLoading || milestones.isLoading,
    refetch() {
      count.refetch?.();
      campaignAddresses.refetch?.();
      metas.refetch?.();
      milestones.refetch?.();
    },
  };
}

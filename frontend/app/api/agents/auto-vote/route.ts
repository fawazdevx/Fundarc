import { NextRequest, NextResponse } from "next/server";
import { verifyMessage } from "viem";
import {
  agentVoteMessage,
  getArcPublicClient,
  hasAutomationSecret,
  isAddress,
  runAgentAutoVote,
} from "@/src/server/agentAutoVote";

const MAX_SIGNATURE_AGE_MS = 5 * 60 * 1000;

async function requestAuthorized(request: NextRequest, body: any) {
  if (hasAutomationSecret(request)) return true;

  const contributor = body?.contributor;
  const campaign = body?.campaign;
  const agentWallet = body?.agentWallet;
  const timestamp = Number(body?.timestamp);
  const signature = body?.signature;

  if (!Number.isFinite(timestamp) || Math.abs(Date.now() - timestamp) > MAX_SIGNATURE_AGE_MS) return false;
  if (typeof signature !== "string") return false;

  return verifyMessage({
    address: contributor,
    message: agentVoteMessage(contributor, campaign, agentWallet, timestamp),
    signature: signature as `0x${string}`,
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const contributor = body?.contributor;
    const campaign = body?.campaign;
    const agentWallet = body?.agentWallet;

    if (!isAddress(contributor) || !isAddress(campaign) || !isAddress(agentWallet)) {
      return NextResponse.json({ error: "Contributor, campaign, and agent wallet addresses are required." }, { status: 400 });
    }

    if (!(await requestAuthorized(request, body))) {
      return NextResponse.json({ error: "Unauthorized agent vote request." }, { status: 401 });
    }

    const result = await runAgentAutoVote({
      client: getArcPublicClient(),
      contributor,
      campaign,
      agentWallet,
    });

    return NextResponse.json(result);
  } catch (error: any) {
    console.error(error);
    return NextResponse.json(
      { error: error?.message ?? "Failed to run agent auto-vote." },
      { status: error?.message?.includes("required") ? 503 : 500 }
    );
  }
}

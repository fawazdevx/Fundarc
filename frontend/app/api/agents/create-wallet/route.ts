import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { verifyMessage } from "viem";
import {
  circleFetch,
  DEFAULT_CIRCLE_BLOCKCHAIN,
  generateEntitySecretCiphertext,
  requiredEnv,
} from "@/src/server/circle";

const MAX_SIGNATURE_AGE_MS = 5 * 60 * 1000;

type CircleWallet = {
  id: string;
  address: string;
  blockchain: string;
  state?: string;
  walletSetId?: string;
  name?: string;
  refId?: string;
};

function isAddress(value: unknown): value is `0x${string}` {
  return typeof value === "string" && /^0x[a-fA-F0-9]{40}$/.test(value);
}

function agentWalletMessage(contributor: string, campaign: string, timestamp: number) {
  return [
    "Fundarc Circle agent wallet creation",
    `Contributor: ${contributor.toLowerCase()}`,
    `Campaign: ${campaign.toLowerCase()}`,
    `Timestamp: ${timestamp}`,
  ].join("\n");
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const contributor = body?.contributor;
    const campaign = body?.campaign;
    const timestamp = Number(body?.timestamp);
    const signature = body?.signature;

    if (!isAddress(contributor) || !isAddress(campaign)) {
      return NextResponse.json({ error: "Contributor and campaign addresses are required." }, { status: 400 });
    }

    if (!Number.isFinite(timestamp) || Math.abs(Date.now() - timestamp) > MAX_SIGNATURE_AGE_MS) {
      return NextResponse.json({ error: "Create-wallet signature expired. Try again." }, { status: 401 });
    }

    if (typeof signature !== "string") {
      return NextResponse.json({ error: "Wallet signature is required." }, { status: 401 });
    }

    const signatureValid = await verifyMessage({
      address: contributor,
      message: agentWalletMessage(contributor, campaign, timestamp),
      signature: signature as `0x${string}`,
    });

    if (!signatureValid) {
      return NextResponse.json({ error: "Invalid create-wallet signature." }, { status: 401 });
    }

    const walletSetId = requiredEnv("CIRCLE_WALLET_SET_ID");
    const blockchain = process.env.CIRCLE_BLOCKCHAIN ?? DEFAULT_CIRCLE_BLOCKCHAIN;
    const entitySecretCiphertext = await generateEntitySecretCiphertext();
    const walletName = `fundarc-agent-${contributor.slice(2, 8)}-${campaign.slice(2, 8)}`;
    const refId = `fundarc:${campaign.toLowerCase()}:${contributor.toLowerCase()}`;

    const payload = await circleFetch("/v1/w3s/developer/wallets", {
      method: "POST",
      body: JSON.stringify({
        idempotencyKey: randomUUID(),
        blockchains: [blockchain],
        entitySecretCiphertext,
        walletSetId,
        accountType: process.env.CIRCLE_WALLET_ACCOUNT_TYPE ?? "EOA",
        count: 1,
        metadata: [
          {
            name: walletName,
            refId,
          },
        ],
      }),
    });

    const wallet = payload?.data?.wallets?.[0] as CircleWallet | undefined;
    if (!wallet?.address) {
      return NextResponse.json({ error: "Circle did not return a wallet address." }, { status: 502 });
    }

    return NextResponse.json({
      walletId: wallet.id,
      address: wallet.address,
      blockchain: wallet.blockchain,
      state: wallet.state,
      walletSetId: wallet.walletSetId,
      name: wallet.name,
      refId: wallet.refId,
    });
  } catch (error: any) {
    console.error(error);
    return NextResponse.json(
      { error: error?.message ?? "Failed to create Circle agent wallet." },
      { status: error?.message?.includes("required") ? 503 : 500 }
    );
  }
}

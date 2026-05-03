// src/components/Header.tsx

"use client";

import Link from "next/link";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useReadContracts } from "wagmi";
import { formatUnits } from "viem";
import { fundarcFactoryAbi } from "@/src/abi/factory";
import { Coins, ExternalLink } from "lucide-react";

const FACTORY = process.env.NEXT_PUBLIC_FACTORY_ADDRESS as `0x${string}`;
const EXPLORER = process.env.NEXT_PUBLIC_EXPLORER!;

function addrUrl(a: string) {
  return `${EXPLORER}/address/${a}`;
}

export function Header() {
  const reads = useReadContracts({
    contracts: [
      { abi: fundarcFactoryAbi, address: FACTORY, functionName: "feeBps" },
      { abi: fundarcFactoryAbi, address: FACTORY, functionName: "feeTreasury" },
      { abi: fundarcFactoryAbi, address: FACTORY, functionName: "totalFeesCollected" },
    ],
  });

  const feeBps = reads.data?.[0]?.status === "success" ? (reads.data?.[0].result as number) : 0;
  const treasury = (reads.data?.[1]?.status === "success" ? (reads.data?.[1].result as string) : undefined) as
    | string
    | undefined;
  const totalFees = (reads.data?.[2]?.status === "success" ? (reads.data?.[2].result as bigint) : 0n) ?? 0n;

  const feePct = feeBps / 100;

  return (
    <div className="header">
      <div className="header-inner">
        <div className="brand">
          <Link href="/" className="hero-title">
            Fundarc
          </Link>

          <small>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <Coins size={14} />
              Fee: <span className="mono">{feePct.toFixed(2)}%</span> • Revenue:{" "}
              <span className="mono">{formatUnits(totalFees, 6)} USDC</span>
            </span>

            {treasury ? (
              <>
                {" "}
                •{" "}
                <a href={addrUrl(treasury)} target="_blank" rel="noreferrer" style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                  Treasury <ExternalLink size={14} />
                </a>
              </>
            ) : null}
          </small>
        </div>

        {/* Keep RK aligned and not cramped */}
        <div className="wallet-slot">
          <ConnectButton />
        </div>
      </div>
    </div>
  );
}

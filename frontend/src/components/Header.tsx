// src/components/Header.tsx

"use client";

import Link from "next/link";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useReadContracts } from "wagmi";
import { formatUnits } from "viem";
import { fundarcFactoryAbi } from "@/src/abi/factory";

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

  // viem returns uint16/uint256 as bigint
  const feeBps = (reads.data?.[0]?.status === "success" ? (reads.data?.[0].result as bigint) : 0n) ?? 0n;
  const treasury = (reads.data?.[1]?.status === "success" ? (reads.data?.[1].result as string) : undefined) as
    | string
    | undefined;
  const totalFees = (reads.data?.[2]?.status === "success" ? (reads.data?.[2].result as bigint) : 0n) ?? 0n;

  const feePct = Number(feeBps) / 100; // bps -> percent

  return (
    <div className="header">
      <div className="header-inner">
        <div className="brand">
          <Link href="/">Fundarc</Link>
          <small>
            Fee: <span className="mono">{feePct.toFixed(2)}%</span> • Revenue:{" "}
            <span className="mono">{formatUnits(totalFees, 6)} USDC</span>
            {treasury ? (
              <>
                {" "}
                •{" "}
                <a href={addrUrl(treasury)} target="_blank" rel="noreferrer">
                  Treasury (ArcScan)
                </a>
              </>
            ) : null}
          </small>
        </div>

        <ConnectButton />
      </div>
    </div>
  );
}
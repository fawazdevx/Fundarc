// src/components/Header.tsx

"use client";

import Link from "next/link";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useReadContracts } from "wagmi";
import { formatUnits } from "viem";
import { useANSReverse } from "@arcnames/sdk-react";
import { fundarcFactoryAbi } from "@/src/abi/factory";
import { Coins, ExternalLink } from "lucide-react";

const FACTORY = process.env.NEXT_PUBLIC_FACTORY_ADDRESS as `0x${string}`;
const EXPLORER = process.env.NEXT_PUBLIC_EXPLORER!;

function addrUrl(a: string) {
  return `${EXPLORER}/address/${a}`;
}

function shortAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function WalletAccountButton({
  account,
  openAccountModal,
}: {
  account: {
    address: string;
    displayBalance?: string;
  };
  openAccountModal: () => void;
}) {
  const { arcName } = useANSReverse(account.address);

  return (
    <button className="btn btn-primary" type="button" onClick={openAccountModal}>
      <span className="mono">{arcName ?? shortAddress(account.address)}</span>
      {account.displayBalance ? <span className="badge">{account.displayBalance}</span> : null}
    </button>
  );
}

function FundarcConnectButton() {
  return (
    <ConnectButton.Custom>
      {({ account, chain, mounted, openAccountModal, openChainModal, openConnectModal }) => {
        const ready = mounted;
        const connected = ready && account && chain;

        if (!connected) {
          return (
            <button className="btn btn-primary" type="button" onClick={openConnectModal}>
              Connect wallet
            </button>
          );
        }

        if (chain.unsupported) {
          return (
            <button className="btn btn-warn" type="button" onClick={openChainModal}>
              Wrong network
            </button>
          );
        }

        return <WalletAccountButton account={account} openAccountModal={openAccountModal} />;
      }}
    </ConnectButton.Custom>
  );
}

export function Header() {
  const reads = useReadContracts({
    contracts: [
      { abi: fundarcFactoryAbi, address: FACTORY, functionName: "feeBps" },
      { abi: fundarcFactoryAbi, address: FACTORY, functionName: "feeTreasury" },
      { abi: fundarcFactoryAbi, address: FACTORY, functionName: "totalFeesCollected" },
    ],
  });

  const feeBps =
    reads.data?.[0]?.status === "success"
      ? Number(reads.data?.[0].result ?? 0n)
      : 0;
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
          <FundarcConnectButton />
        </div>
      </div>
    </div>
  );
}

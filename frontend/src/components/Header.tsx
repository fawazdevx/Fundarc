// src/components/Header.tsx

"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ConnectButton, useAccountModal } from "@rainbow-me/rainbowkit";
import { useDisconnect } from "wagmi";
import { useANSReverse } from "@arcnames/sdk-react";
import { BarChart3, ChevronDown, LogOut, Rocket } from "lucide-react";

function shortAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function WalletAccountButton({
  account,
}: {
  account: {
    address: string;
    displayBalance?: string;
  };
}) {
  const [fallbackOpen, setFallbackOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { arcName } = useANSReverse(account.address);
  const { openAccountModal } = useAccountModal();
  const { disconnect } = useDisconnect();

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setFallbackOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  function handleAccountClick() {
    if (openAccountModal) {
      openAccountModal();
      setFallbackOpen(false);
      return;
    }

    setFallbackOpen((open) => !open);
  }

  function handleDisconnect() {
    disconnect();
    setFallbackOpen(false);
  }

  return (
    <div className="wallet-account-menu" ref={menuRef}>
      <button
        aria-expanded={fallbackOpen}
        aria-haspopup="menu"
        className="btn btn-primary wallet-account-trigger"
        type="button"
        onClick={handleAccountClick}
      >
        <span className="mono">{arcName ?? shortAddress(account.address)}</span>
        {account.displayBalance ? <span className="badge">{account.displayBalance}</span> : null}
        <ChevronDown size={16} aria-hidden="true" />
      </button>

      {fallbackOpen ? (
        <div className="wallet-account-popover" role="menu">
          <button className="wallet-account-action" type="button" role="menuitem" onClick={handleDisconnect}>
            <LogOut size={16} aria-hidden="true" />
            Disconnect
          </button>
        </div>
      ) : null}
    </div>
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

        return <WalletAccountButton account={account} />;
      }}
    </ConnectButton.Custom>
  );
}

export function Header() {
  return (
    <div className="header">
      <div className="header-inner">
        <div className="brand">
          <Link href="/" className="hero-title">
            <Image
              src="/brand/favicon.svg"
              alt=""
              width={34}
              height={34}
              priority
              aria-hidden="true"
              className="brand-mark"
            />
            Fundarc
          </Link>

          <small>
            <span className="status-dot" aria-hidden="true" />
            Built on Arc Testnet
          </small>
        </div>

        <div className="wallet-slot">
          <Link className="btn btn-sm" href="/launch">
            <Rocket size={16} />
            Launch dApp
          </Link>
          <Link className="btn btn-sm" href="/dashboard">
            <BarChart3 size={16} />
            Metrics
          </Link>
          <FundarcConnectButton />
        </div>
      </div>
    </div>
  );
}

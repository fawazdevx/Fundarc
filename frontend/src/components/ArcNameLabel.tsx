"use client";

import { useANSReverse } from "@arcnames/sdk-react";

function shortAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function ArcNameLabel({
  address,
  className,
}: {
  address: `0x${string}` | string;
  className?: string;
}) {
  const { arcName } = useANSReverse(address);

  return (
    <span className={className} title={address}>
      {arcName ?? shortAddress(address)}
    </span>
  );
}

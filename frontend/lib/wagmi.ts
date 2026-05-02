// lib/wagmi.ts

import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { http } from "wagmi";
import { defineChain } from "viem";

const chainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID);
const rpcUrl = process.env.NEXT_PUBLIC_ARC_RPC_URL!;
const explorer = process.env.NEXT_PUBLIC_EXPLORER!;

export const arcTestnet = defineChain({
  id: chainId,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 6 },
  rpcUrls: {
    default: { http: [rpcUrl] },
    public: { http: [rpcUrl] },
  },
  blockExplorers: {
    default: { name: "ArcScan", url: explorer },
  },
});

export const wagmiConfig = getDefaultConfig({
  appName: "Fundarc",
  // In wagmi config
  projectId: process.env.NEXT_PUBLIC_WC_PROJECT_ID, // <-- replace with env if you want
  chains: [arcTestnet],
  transports: {
    [arcTestnet.id]: http(rpcUrl),
  },
  ssr: true,
});
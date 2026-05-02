// app/providers.tsx

"use client";

import { useState } from "react";
import { WagmiProvider } from "wagmi";
import { RainbowKitProvider, darkTheme } from "@rainbow-me/rainbowkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { wagmiConfig, arcTestnet } from "@/lib/wagmi";

export function Providers({ children }: { children: React.ReactNode }) {
  // Ensure QueryClient is stable across hot reloads/renders
  const [qc] = useState(() => new QueryClient());

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={qc}>
        <RainbowKitProvider
          initialChain={arcTestnet}
          theme={darkTheme({
            accentColor: "#a855f7",
            accentColorForeground: "#0b0615",
            borderRadius: "large",
            overlayBlur: "small",
          })}
        >
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
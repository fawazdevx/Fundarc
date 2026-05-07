// app/providers.tsx

"use client";

import { useState } from "react";
import { WagmiProvider } from "wagmi";
import { RainbowKitProvider, darkTheme } from "@rainbow-me/rainbowkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "react-hot-toast";
import { ANSProvider } from "@arcnames/sdk-react";
import { ANS_REGISTRY_ADDRESSES, ANS_RPC_URLS } from "@arcnames/sdk/constants";
import { wagmiConfig, arcTestnet } from "@/lib/wagmi";

export function Providers({ children }: { children: React.ReactNode }) {
  // Ensure QueryClient is stable across hot reloads/renders
  const [qc] = useState(() => new QueryClient());
  const ansConfig = {
    rpcUrl: ANS_RPC_URLS[arcTestnet.id],
    registryAddress: ANS_REGISTRY_ADDRESSES[arcTestnet.id],
    cacheTimeout: 5 * 60 * 1000,
  };

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={qc}>
        <RainbowKitProvider initialChain={arcTestnet} 
          theme={darkTheme({
            accentColor: '#7b3fe4',
            accentColorForeground: 'white',
            borderRadius: 'medium',
          })} modalSize="wide">
          <ANSProvider config={ansConfig}>
            {children}
            <Toaster
              position="top-right"
              toastOptions={{
                duration: 4500,
                style: {
                  border: "1px solid rgba(45, 212, 191, 0.28)",
                  background: "rgba(8, 9, 13, 0.94)",
                  color: "rgba(255, 255, 255, 0.94)",
                },
                success: {
                  iconTheme: {
                    primary: "#2dd4bf",
                    secondary: "#07100f",
                  },
                },
              }}
            />
          </ANSProvider>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

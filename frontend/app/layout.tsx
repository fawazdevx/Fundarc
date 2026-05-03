// app/layout.tsx

import "./globals.css";
import { Providers } from "./providers";
import { Header } from "@/src/components/Header";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <Header />
          {children}
        </Providers>
      </body>
    </html>
  );
}

// app/layout.tsx

import "./globals.css";
import { Providers } from "./providers";
import { Header } from "@/src/components/Header";

export const dynamic = "force-dynamic";

const FRONTEND_MAINTENANCE =
  process.env.MAINTENANCE_MODE === "true" ||
  process.env.NEXT_PUBLIC_MAINTENANCE_MODE === "true";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  if (FRONTEND_MAINTENANCE) {
    return (
      <html lang="en">
        <body>
          <main className="maintenance-page">
            <section className="maintenance-shell">
              <span className="badge badge-warn">Maintenance mode</span>
              <h1>Fundarc is temporarily unavailable</h1>
              <p>
                Updates are in progress.
              </p>
            </section>
          </main>
        </body>
      </html>
    );
  }

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

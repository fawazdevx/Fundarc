// app/campaign/[addr]/page.tsx

import { Suspense } from "react";
import CampaignPageClient from "./CampaignPageClient";

export default async function Page({ params }: { params: Promise<{ addr: string }> }) {
  const { addr } = await params;
  return (
    <Suspense fallback={<div>Loading campaign…</div>}>
      <CampaignPageClient addr={addr} />
    </Suspense>
  );
}
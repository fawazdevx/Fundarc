import { Suspense } from "react";
import CreatorProfileClient from "./CreatorProfileClient";

export default async function Page({ params }: { params: Promise<{ address: string }> }) {
  const { address } = await params;

  return (
    <Suspense fallback={<div>Loading creator...</div>}>
      <CreatorProfileClient address={address} />
    </Suspense>
  );
}

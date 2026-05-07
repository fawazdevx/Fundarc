
// app/dashboard/page.tsx

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPublicClient, http, formatUnits, parseAbiItem } from "viem";
import { useReadContracts } from "wagmi";
import { fundarcFactoryAbi } from "@/src/abi/factory";
import type { AbiEvent } from "viem";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  Tooltip,
  XAxis,
  YAxis,
  BarChart,
  Bar,
} from "recharts";

const FACTORY = process.env.NEXT_PUBLIC_FACTORY_ADDRESS as `0x${string}`;
const RPC_URL = process.env.NEXT_PUBLIC_ARC_RPC_URL as string; // <-- add this to .env
const USDC_DECIMALS = 6;
const LOG_BLOCK_RANGE = 9_999n;

const client = createPublicClient({
  transport: http(RPC_URL),
});

type RangeKey = "7d" | "30d";
type DashboardPoint = { day: string; campaigns: number; revenueUSDC: number };
const blockTimestampCache = new Map<bigint, number>();

function startOfDayUTC(tsSec: number) {
  const d = new Date(tsSec * 1000);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / 1000;
}

function fmtDayUTC(tsSec: number) {
  const d = new Date(tsSec * 1000);
  // YYYY-MM-DD in UTC
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

async function findFirstBlockAtOrAfter(timestampSec: number, latestBlock: bigint) {
  let low = 0n;
  let high = latestBlock;

  while (low < high) {
    const mid = (low + high) / 2n;
    const block = await client.getBlock({ blockNumber: mid });

    if (Number(block.timestamp) < timestampSec) {
      low = mid + 1n;
    } else {
      high = mid;
    }
  }

  return low;
}

async function getLogsInChunks(event: AbiEvent, fromBlock: bigint, toBlock: bigint) {
  const logs = [];
  let chunkStart = fromBlock;

  while (chunkStart <= toBlock) {
    const chunkEnd = chunkStart + LOG_BLOCK_RANGE > toBlock ? toBlock : chunkStart + LOG_BLOCK_RANGE;
    const chunkLogs = await client.getLogs({
      address: FACTORY,
      event,
      fromBlock: chunkStart,
      toBlock: chunkEnd,
    });

    logs.push(...chunkLogs);
    chunkStart = chunkEnd + 1n;
  }

  return logs;
}

async function fetchDashboard(range: RangeKey) {
  const nowSec = Math.floor(Date.now() / 1000);
  const days = range === "7d" ? 7 : 30;

  // Start at 00:00 UTC (days-1 days ago) for clean buckets
  const startDay = startOfDayUTC(nowSec - (days - 1) * 86400);
  const endSec = nowSec;

  const campaignCreatedEvent = parseAbiItem(
    "event CampaignCreated(address indexed creator, address indexed campaign, uint256 indexed campaignId)"
  ) as AbiEvent;
  const feeTakenEvent = parseAbiItem(
    "event FeeTaken(address indexed campaign, uint256 feeAmount)"
  ) as AbiEvent;

  const latestBlock = await client.getBlockNumber();
  const fromBlock = await findFirstBlockAtOrAfter(startDay, latestBlock);

  const [createdLogs, feeLogs] = await Promise.all([
    getLogsInChunks(campaignCreatedEvent, fromBlock, latestBlock),
    getLogsInChunks(feeTakenEvent, fromBlock, latestBlock),
  ]);

  // Filter by timestamp (need block timestamps)
  // We'll fetch block timestamps for only relevant logs.
  const uniqueBlocks = new Set<bigint>();
  for (const l of createdLogs) uniqueBlocks.add(l.blockNumber!);
  for (const l of feeLogs) uniqueBlocks.add(l.blockNumber!);

  const blockTs = new Map<bigint, number>();
  await Promise.all(
    Array.from(uniqueBlocks).map(async (bn) => {
      const cached = blockTimestampCache.get(bn);
      if (cached !== undefined) {
        blockTs.set(bn, cached);
        return;
      }
      const b = await client.getBlock({ blockNumber: bn });
      const timestamp = Number(b.timestamp);
      blockTimestampCache.set(bn, timestamp);
      blockTs.set(bn, timestamp);
    })
  );

  // Prepare buckets
  const buckets = new Map<number, { day: string; campaigns: number; revenue: bigint }>();
  for (let i = 0; i < days; i++) {
    const dayStart = startDay + i * 86400;
    buckets.set(dayStart, { day: fmtDayUTC(dayStart), campaigns: 0, revenue: 0n });
  }

  // Apply CampaignCreated logs
  for (const l of createdLogs) {
    const ts = blockTs.get(l.blockNumber!) ?? 0;
    if (ts < startDay || ts > endSec) continue;

    const bucketKey = startOfDayUTC(ts);
    const b = buckets.get(bucketKey);
    if (b) b.campaigns += 1;
  }

  // Apply FeeTaken logs
  for (const l of feeLogs) {
    const ts = blockTs.get(l.blockNumber!) ?? 0;
    if (ts < startDay || ts > endSec) continue;

    const feeAmount = (l.args as any)?.feeAmount as bigint | undefined;
    if (!feeAmount) continue;

    const bucketKey = startOfDayUTC(ts);
    const b = buckets.get(bucketKey);
    if (b) b.revenue += feeAmount;
  }

  // Output array in order
  const series = Array.from(buckets.values()).sort((a, b) => (a.day < b.day ? -1 : 1));
  return series.map((p) => ({
    day: p.day,
    campaigns: p.campaigns,
    revenueUSDC: Number(formatUnits(p.revenue, USDC_DECIMALS)),
  }));
}

export default function DashboardPage() {
  const [range, setRange] = useState<RangeKey>("7d");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<DashboardPoint[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  const summaryReads = useReadContracts({
    contracts: [
      { abi: fundarcFactoryAbi, address: FACTORY, functionName: "campaignsCount" },
      { abi: fundarcFactoryAbi, address: FACTORY, functionName: "totalFeesCollected" },
    ],
  });

  const lifetimeCampaigns =
    summaryReads.data?.[0]?.status === "success" ? (summaryReads.data[0].result as bigint) : 0n;
  const lifetimeRevenue =
    summaryReads.data?.[1]?.status === "success" ? (summaryReads.data[1].result as bigint) : 0n;

  const totals = useMemo(() => {
    return data.reduce(
      (acc, d) => ({
        campaigns: acc.campaigns + d.campaigns,
        revenue: acc.revenue + d.revenueUSDC,
      }),
      { campaigns: 0, revenue: 0 }
    );
  }, [data]);

  const load = useCallback(async () => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    setLoading(true);
    setErr(null);
    try {
      const series = await fetchDashboard(range);
      if (requestId !== requestIdRef.current) return;
      setData(series);
    } catch (e: any) {
      if (requestId !== requestIdRef.current) return;
      console.error(e);
      setErr(e?.message ?? "Failed to load dashboard.");
    } finally {
      if (requestId !== requestIdRef.current) return;
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <main className="page">
      <section className="card hero">
        <div className="row spread">
          <div>
            <h1 className="hero-title">Dashboard</h1>
            <div className="subtext">Network-wide stats from factory events.</div>
          </div>

          <div className="actions">
            <button className={`btn ${range === "7d" ? "btn-primary" : ""}`} onClick={() => setRange("7d")}>
              7d
            </button>
            <button className={`btn ${range === "30d" ? "btn-primary" : ""}`} onClick={() => setRange("30d")}>
              30d
            </button>
            <button className="btn" onClick={load} disabled={loading}>
              {loading ? "Loading..." : "Refresh"}
            </button>
          </div>
        </div>

        <div className="divider" />

        <div className="row">
          <span className="badge">Campaigns created: {lifetimeCampaigns.toString()}</span>
          <span className="badge">Revenue generated: {formatUnits(lifetimeRevenue, USDC_DECIMALS)} USDC</span>
          <span className="badge">{range} campaigns: {totals.campaigns}</span>
          <span className="badge">{range} revenue: {totals.revenue.toFixed(2)} USDC</span>
        </div>

        {err ? <div className="subtext" style={{ marginTop: 10, color: "rgba(255,120,140,0.9)" }}>{err}</div> : null}
      </section>

      <div className="grid-2 section-gap">
        <section className="card section">
          <div className="section-copy">
            <h2>Campaigns created / day</h2>
            <div className="subtext">From CampaignCreated events.</div>
          </div>

          <div className="chart-box">
            <ResponsiveContainer width="100%" height={300} minWidth={0} minHeight={300}>
              <BarChart data={data}>
                <CartesianGrid stroke="rgba(255,255,255,0.08)" />
                <XAxis dataKey="day" tick={{ fill: "rgba(255,255,255,0.65)", fontSize: 12 }} />
                <YAxis tick={{ fill: "rgba(255,255,255,0.65)", fontSize: 12 }} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    background: "rgba(10,10,18,0.92)",
                    border: "1px solid rgba(255,255,255,0.12)",
                    borderRadius: 14,
                    color: "rgba(255,255,255,0.92)",
                  }}
                />
                <Bar dataKey="campaigns" fill="rgba(168, 85, 247, 0.9)" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="card section">
          <div className="section-copy">
            <h2>Revenue / day (USDC)</h2>
            <div className="subtext">From FeeTaken events.</div>
          </div>

          <div className="chart-box">
            <ResponsiveContainer width="100%" height={300} minWidth={0} minHeight={300}>
              <LineChart data={data}>
                <CartesianGrid stroke="rgba(255,255,255,0.08)" />
                <XAxis dataKey="day" tick={{ fill: "rgba(255,255,255,0.65)", fontSize: 12 }} />
                <YAxis tick={{ fill: "rgba(255,255,255,0.65)", fontSize: 12 }} />
                <Tooltip
                  contentStyle={{
                    background: "rgba(10,10,18,0.92)",
                    border: "1px solid rgba(255,255,255,0.12)",
                    borderRadius: 14,
                    color: "rgba(255,255,255,0.92)",
                  }}
                  formatter={(v: any) => [`${Number(v).toFixed(4)} USDC`, "Revenue"]}
                />
                <Line
                  type="monotone"
                  dataKey="revenueUSDC"
                  stroke="rgba(34, 211, 238, 0.95)"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>

      <section className="card section section-gap">
        <h2>Notes</h2>
        <div className="subtext">
          This dashboard queries logs directly from the RPC.
        </div>
        <div className="subtext" style={{ marginTop: 8 }}>
          Factory: <span className="mono">{FACTORY}</span>
        </div>
      </section>
    </main>
  );
}

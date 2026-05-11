"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight, BarChart3, ShieldCheck, Sparkles, WalletCards } from "lucide-react";

export default function LandingPage() {
  return (
    <main className="landing-page">
      <section className="landing-hero">
        {/* <Image
          src="/fundarc-hero.png"
          alt=""
          fill
          priority
          className="landing-hero-image"
          sizes="100vw"
        /> */}
        <div className="landing-overlay" />

        <div className="landing-content">
          <div className="landing-badges">
            <span className="badge">
              <Sparkles size={14} />
              Live on Arc Testnet
            </span>
            <span className="badge">
              <ShieldCheck size={14} />
              Milestone escrow
            </span>
          </div>

          <h1 className="landing-title">Fundarc</h1>
          <p className="landing-copy">
            Programmable USDC-native milestone funding for internet-native builders, open-source projects, 
            creators, and communities - with milestone voting, transparent creator history, and 
            refund-aware funding flows.


          </p>

          <div className="landing-actions">
            <Link className="btn btn-primary btn-lg" href="/launch">
              <WalletCards size={18} />
              Launch dApp
              <ArrowRight size={18} />
            </Link>
            <Link className="btn btn-lg" href="/dashboard">
              <BarChart3 size={18} />
              View metrics
            </Link>
          </div>

          <div className="landing-stats">
            <div className="kv">
              <div className="k">Funding</div>
              <div className="v">USDC</div>
            </div>
            <div className="kv">
              <div className="k">Release</div>
              <div className="v">Milestones</div>
            </div>
            <div className="kv">
              <div className="k">Protection</div>
              <div className="v">Refunds</div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

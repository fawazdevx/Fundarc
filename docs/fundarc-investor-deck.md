# Fundarc Investor Deck

USDC-native milestone funding on Arc

Website: https://fundarc.netlify.app  
X: @fundarcapp  
Chain: Arc Testnet

---

## 1. Cover

# Fundarc

Programmable milestone funding for creators, open-source builders, public goods, and communities.

Fundarc uses USDC on Arc to lock campaign funds in smart contracts and release them only after contributor-approved milestones.

---

## 2. The Problem

Crowdfunding is still too trust-based.

Creators often receive funds upfront, while contributors have limited visibility into delivery, weak refund protection, and little influence after contributing.

This is worse for global builders and communities because many traditional crowdfunding platforms are region-limited, centralized, and dependent on manual moderation.

Key pain points:

- Contributors fund promises, not verified progress.
- Creators lack transparent onchain reputation.
- Communities coordinate funding offchain with weak accountability.
- Refunds and milestone enforcement are usually manual or centralized.
- Contributors may miss important voting windows.

---

## 3. The Solution

Fundarc is a USDC-native milestone funding protocol on Arc.

Creators launch campaigns with defined milestones. Contributors fund with USDC. Funds remain locked until creators submit milestone evidence and contributors vote to approve release.

Fundarc combines:

- USDC campaign funding
- Milestone-based escrow
- Contribution-weighted voting
- Refund-aware campaign flows
- Creator reputation tracking
- Campaign discovery
- IPFS milestone evidence
- Circle agent wallet delegation and automated voting

---

## 4. Why Now

Stablecoin-native funding is becoming practical for global internet-native work.

Arc provides a strong foundation for Fundarc because it is designed around USDC-first settlement and predictable payment experiences. Circle developer infrastructure also makes it possible to improve onboarding, agent wallets, delegated execution, and future gas abstraction.

Why this is possible now:

- USDC is widely understood by contributors and creators.
- Arc provides a stablecoin-native blockchain environment.
- Smart contracts can enforce milestone escrow and refund logic.
- Circle wallet infrastructure enables automated contributor participation.
- Agentic workflows can help contributors stay represented during voting windows.

---

## 5. Product Overview

Fundarc turns crowdfunding into a transparent milestone workflow.

Creator flow:

1. Create campaign.
2. Define milestones and voting rules.
3. Submit evidence for each milestone.
4. Withdraw funds only after contributor approval.

Contributor flow:

1. Discover campaigns.
2. Fund with USDC.
3. Review milestone evidence.
4. Vote on fund release.
5. Claim refunds if a campaign fails.

Agent flow:

1. Create a Circle agent wallet inside Fundarc.
2. Delegate voting to the agent wallet.
3. Let the agent review milestone context and vote during active windows.

---

## 6. Product Screens / Demo Flow

Recommended video/demo sequence:

- Landing page with live campaign previews
- Dedicated campaign discovery page
- Campaign creation flow
- Campaign contribution with USDC
- Milestone evidence upload
- Contributor voting
- Circle agent wallet creation
- Vote delegation and automated voting
- Creator withdrawal after approved milestone
- Creator reputation profile

---

## 7. Circle + Arc Integration

Fundarc is built around Circle and Arc infrastructure.

Currently integrated:

- USDC for campaign funding, escrow, refunds, withdrawals, and protocol fees
- Arc Testnet deployment
- Circle wallet infrastructure for in-app agent wallet creation
- Circle agent wallet delegation for contributor voting
- Automated milestone voting through delegated Circle agent wallets

Planned integrations:

- Circle Paymaster for gas abstraction
- Expanded Circle Wallet support for onboarding
- Circle Gateway and/or CCTP for future crosschain USDC funding flows
- Additional Circle developer services for automation and monitoring

---

## 8. Technical Architecture

Fundarc uses upgradeable smart contracts and a Next.js frontend.

Core components:

- `FundarcFactory`
  - Creates campaigns
  - Tracks campaign implementations
  - Enforces campaign creation safeguards
  - Tracks active campaigns per creator

- `FundarcCampaign`
  - Holds USDC funds
  - Tracks milestones
  - Handles contributions, voting, refunds, withdrawals, and delegation
  - Enforces milestone-based fund release

- Frontend
  - Next.js, TypeScript, wagmi, viem
  - Campaign creation and discovery
  - Contributor voting UX
  - Circle agent wallet creation and automated voting flows

- Storage and evidence
  - IPFS-based milestone evidence uploads

---

## 9. Smart Contract Deployments

Arc Testnet deployments:

- Factory Proxy: `0x6D7FFE972726134B880b43B3866fF97e72ac7792`
- FundarcCampaign Implementation: `0x2210f569946251a00809DAF95FCe2656CadA296d`
- FundarcFactory Implementation: `0x222f72a92785Fa6B0f4730284F49D042234fFCE8`
- Owner: `0xB3aae9496a6670d13e1b80B1Fb3ad445c635aC23`

Security improvements completed:

- Disabled direct implementation initialization
- Creator active campaign guard
- Minimum campaign goal protection
- Minimum contribution guard
- Funding deadline support
- Creator-only empty campaign cancellation
- Funded campaigns cannot be canceled by creators
- Delegated voting double-vote protection

---

## 10. Traction

Fundarc is live on Arc Testnet with an end-to-end working product.

Built and shipped:

- Campaign creation
- USDC funding
- Milestone escrow
- Contribution-weighted voting
- Refund flow
- Creator withdrawals
- Creator reputation
- Campaign discovery
- IPFS milestone evidence
- Circle agent wallet creation
- Vote delegation
- Automated voting
- Improved landing page and campaign UX
- Smart contract security review and mitigations

Fundarc has received public feedback and testing from the Arc builder community through X and ecosystem discussions.

---

## 11. Market Opportunity

Fundarc targets internet-native funding coordination.

Primary users:

- Open-source maintainers
- Public goods teams
- Indie builders
- Creator communities
- Hackathon teams
- Onchain communities
- Global contributors excluded from traditional platforms

Expansion opportunities:

- Grants management
- DAO/community funding
- Open-source bounties
- Creator memberships
- Milestone-based service agreements
- Agent-assisted treasury workflows

---

## 12. Business Model

Fundarc can monetize without breaking contributor trust.

Potential revenue streams:

- Small protocol fee on approved creator withdrawals
- Premium campaign analytics
- Reputation and verification tooling
- Sponsored discovery for verified campaigns
- API/indexing services for funding data
- Future enterprise/community grant management tooling

Current priority:

Build trusted infrastructure, improve UX, grow campaign supply, and prove repeatable USDC milestone funding flows on Arc.

---

## 13. Roadmap

Q3 2026: Production stability and indexing

- Stronger anti-spam protections
- Event indexing and analytics
- Campaign discovery performance
- Creator reputation improvements
- Monitoring for campaign lifecycle events

Q3-Q4 2026: Circle-powered onboarding and payments

- Improved Circle agent wallet UX
- More reliable delegated voting
- Automated voting improvements
- Paymaster research and integration

Q4 2026: Verification and governance

- Better IPFS evidence flows
- Automated milestone review agents
- Contributor governance analytics
- Improved reputation scoring

Q1 2027: Expanded USDC funding

- Explore Circle Gateway and/or CCTP
- Crosschain USDC funding paths
- Broader creator and community funding workflows

---

## 14. Grant / Funding Use

Circle grant funding would accelerate Fundarc from advanced testnet MVP to production-ready infrastructure.

Funding will support:

- Smart contract security improvements and audits
- Circle Paymaster and wallet UX integration
- Agent wallet automation reliability
- Event indexing infrastructure
- Anti-spam and moderation tooling
- IPFS evidence improvements
- Contributor analytics
- Creator reputation infrastructure
- Frontend onboarding polish
- Continued Arc and USDC-native protocol development

---

## 15. Team

Fawaz Oyebode  
Founder & Full Stack Blockchain Developer  
Lagos, Nigeria

Fawaz is a Web3 builder focused on smart contract systems, stablecoin applications, and developer tooling on Arc. He created Fundarc and the arc-ue4-plugin for Unreal Engine blockchain integrations. He has hands-on experience with Solidity, Foundry, Next.js, TypeScript, wagmi, viem, OpenZeppelin, upgradeable contracts, and USDC-based protocol design.

Rabiah Ubaidu  
Smart Contract Security Researcher  
Kano, Nigeria

Rabiah is a Solidity developer and smart contract security researcher focused on identifying vulnerabilities and improving protocol safety. She reviewed Fundarc’s smart contracts, identified issues, and provided mitigation recommendations that strengthened Fundarc’s implementation and deployment readiness.

---

## 16. Closing

Fundarc makes funding accountable.

Instead of sending funds upfront and hoping creators deliver, contributors fund with USDC, review milestone evidence, vote on release, and retain a refund path when campaigns fail.

Fundarc brings together Arc, USDC, Circle wallet infrastructure, milestone escrow, contributor governance, and AI agent delegation to build a more transparent funding layer for global creators and communities.

Website: https://fundarc.netlify.app  
X: @fundarcapp


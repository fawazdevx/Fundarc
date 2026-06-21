# Fundarc

![Fundarc banner](frontend/public/brand/fundarc-banner.svg)

Fundarc is a **USDC-native programmable milestone funding protocol on Arc Testnet**. It helps builders, creators, open-source projects, public goods teams, and online communities raise funds transparently while contributors retain approval rights over when creator funds unlock.

Instead of releasing all funding upfront, Fundarc splits campaigns into milestones. Contributors fund campaigns with USDC, creators submit milestone evidence, and contributors vote with contribution-weighted governance before each tranche can be withdrawn.

Fundarc also integrates Circle-powered agent wallet flows so contributors can delegate milestone voting to an agent wallet when they are unavailable during voting windows.

## Links

- App: https://fundarc.netlify.app
- GitHub: https://github.com/fawazdevx/Fundarc
- Investor / grant deck source: [docs/fundarc-investor-deck.md](docs/fundarc-investor-deck.md)

## Why Fundarc

Traditional crowdfunding still depends heavily on centralized trust, manual enforcement, and offchain moderation. Contributors often fund promises upfront with limited visibility into delivery, weak refund paths, and little influence after contributing.

Fundarc turns funding into an onchain milestone workflow:

- Creators define milestones before fundraising.
- Contributors fund with USDC.
- Funds remain escrowed in campaign contracts.
- Creators submit evidence for each milestone.
- Contributors vote to approve or reject fund release.
- Approved milestones unlock creator withdrawals.
- Failed or canceled campaigns preserve refund paths.
- Creator reputation builds from public campaign history.
- Agent wallets can help contributors vote when they are unavailable.

## Current Status

Fundarc is live as a working Arc Testnet application with deployed smart contracts and an active frontend.

Implemented product flows:

- Campaign creation
- Campaign discovery
- USDC contributions
- Milestone escrow
- IPFS milestone evidence uploads
- Contribution-weighted milestone voting
- Creator withdrawals after approval
- Refund claims for failed or canceled campaigns
- Creator reputation profiles
- Contributor lists
- Dashboard metrics
- Circle agent wallet creation inside Fundarc
- Vote delegation to agent wallets
- Automated milestone voting through delegated agent wallets
- Empty campaign cancellation by creators
- Canceled/failed campaign filtering in discovery

## Circle and Arc Alignment

Fundarc is built around USDC-native funding coordination on Arc.

### Current Circle / Arc Usage

- **USDC funding**: Campaign contributions, escrowed balances, refunds, withdrawals, and protocol fees use USDC-denominated flows.
- **Arc Testnet**: Contracts are deployed on Arc Testnet and the frontend is configured for Arc-based interactions.
- **Circle agent wallets**: Contributors can create an agent wallet from inside Fundarc.
- **Delegated voting**: Contributors can assign an agent wallet to vote on a campaign using their contribution weight.
- **Automated voting**: The app includes an automated milestone voting flow where the delegated agent wallet can review context and submit a vote during an active voting window.

### Planned Circle Integrations

- Circle Paymaster for smoother gas abstraction.
- Expanded Circle Wallet UX for onboarding and agent management.
- Circle Gateway and/or CCTP exploration for future crosschain USDC funding.
- More robust agentic payment and automation workflows for campaign governance.

## Deployed Contracts

Arc Testnet:

| Contract | Address |
| --- | --- |
| Factory Proxy | `0x6D7FFE972726134B880b43B3866fF97e72ac7792` |
| FundarcCampaign Implementation | `0x2210f569946251a00809DAF95FCe2656CadA296d` |
| FundarcFactory Implementation | `0x222f72a92785Fa6B0f4730284F49D042234fFCE8` |

Arc Testnet reference:

- Chain ID: `5042002`
- Explorer: https://testnet.arcscan.app
- Faucet: https://faucet.circle.com
- ERC-20 USDC on Arc Testnet: `0x3600000000000000000000000000000000000000`

## Architecture

```text
Fundarc/
|-- contracts/
|   |-- src/
|   |   |-- FundarcFactory.sol
|   |   |-- FundarcCampaign.sol
|   |   `-- interfaces/
|   |       `-- IERC20Minimal.sol
|   |-- script/
|   |   |-- Deploy.s.sol
|   |   |-- SetCampaignImplementation.s.sol
|   |   |-- UpgradeFactoryAndCampaign.s.sol
|   |   `-- ...
|   `-- test/
|       `-- FundarcSecurity.t.sol
|-- frontend/
|   |-- app/
|   |   |-- page.tsx
|   |   |-- launch/
|   |   |-- discover/
|   |   |-- dashboard/
|   |   |-- creator/
|   |   |-- campaign/
|   |   `-- api/
|   |       |-- agents/
|   |       `-- evidence/
|   |-- src/
|   |   |-- abi/
|   |   |-- components/
|   |   |-- config/
|   |   |-- hooks/
|   |   `-- server/
|   `-- package.json
|-- docs/
|   `-- fundarc-investor-deck.md
`-- README.md
```

## Smart Contracts

### `FundarcFactory`

The factory is the protocol-level contract used to create campaigns and manage factory configuration.

Responsibilities:

- Stores the USDC token address.
- Stores the current campaign implementation.
- Deploys campaign clones.
- Tracks all created campaigns.
- Tracks one active campaign per creator.
- Enforces campaign creation fee and minimum goal rules.
- Supports campaign creation pause controls.
- Lets the owner update the campaign implementation for future campaigns.
- Clears creator active campaign slots when campaigns complete, fail, or are canceled.

### `FundarcCampaign`

Each campaign contract holds funds and enforces the campaign lifecycle.

Responsibilities:

- Accepts USDC contributions.
- Tracks contributor balances and vote weight.
- Tracks milestones and milestone states.
- Stores IPFS evidence URIs for milestone submissions.
- Opens voting windows after creator evidence submission.
- Supports direct contributor voting.
- Supports delegated voting through `voteFor`.
- Finalizes milestone results.
- Unlocks approved milestone funds.
- Handles creator withdrawals.
- Handles contributor refunds.
- Allows creator cancellation only while the campaign has received zero funding.

Campaign states:

- `Active`
- `Canceled`
- `Failed`
- `Successful`

Milestone states:

- `PendingSubmission`
- `Voting`
- `Approved`
- `Rejected`
- `Finalized`

## Product Features

### Campaign Creation

Creators can launch campaigns with:

- Title and description
- Category
- One or more USDC milestones
- Voting duration
- Quorum threshold
- Pass threshold

Campaign creation includes safeguards such as a minimum campaign goal, maximum milestone count, active campaign limits per creator, and optional factory-level creation pause.

### Campaign Discovery

The discovery page provides:

- Search by campaign, creator, or address
- Category filters
- Sorting by trending, newest, or highest goal
- Responsive campaign cards
- Automatic hiding of canceled and failed campaigns
- Optional display for completed campaigns

### Contributions

Contributors approve and fund campaigns with USDC. Contribution amounts determine voting weight. Creator self-funding is tracked separately and does not create voting weight for the creator.

### Milestone Evidence

Creators can submit milestone evidence with:

- Onchain evidence hash
- IPFS media/file upload through the frontend evidence route
- Evidence URI display on campaign milestone cards

### Contributor Voting

Contributors can vote yes or no on the current milestone during the voting window. Voting is contribution-weighted and double voting is blocked.

### Circle Agent Wallet Delegation

Contributors can:

- Create a Circle agent wallet inside Fundarc.
- Copy or auto-fill the agent wallet address.
- Assign the agent wallet as their campaign voting delegate.
- Revoke the delegate.
- Let the delegated agent wallet submit a milestone vote through `voteFor`.

The delegated agent can vote for the contributor, but it cannot withdraw contributor funds.

### Creator Reputation

Fundarc computes creator reputation from public campaign history, including:

- Active campaigns
- Completed campaigns
- Failed campaigns
- Canceled campaigns
- Approved milestones
- Rejected milestones
- External contributors
- Self-funded amount vs external funding

### Refund and Cancellation Safety

Refunds are available when campaigns fail or are canceled.

Creators can cancel an empty campaign only if no USDC has been contributed. Once a campaign receives funding, the creator cannot unilaterally cancel it; the campaign must proceed through milestone voting and refund-aware lifecycle rules.

## Frontend Routes

| Route | Purpose |
| --- | --- |
| `/` | Landing page with project overview and live campaign previews |
| `/launch` | Focused campaign creation flow |
| `/discover` | Campaign discovery and filtering |
| `/campaign/[addr]` | Campaign detail, contributions, milestones, voting, delegation, refunds, withdrawals |
| `/creator/[address]` | Creator reputation profile |
| `/dashboard` | Protocol metrics and analytics |
| `/api/agents/create-wallet` | Server route for Circle agent wallet creation |
| `/api/agents/auto-vote` | Server route for automated delegated voting |
| `/api/evidence` | Server route for evidence uploads |

## Tech Stack

### Smart Contracts

- Solidity `0.8.24`
- Foundry
- OpenZeppelin Contracts
- OpenZeppelin Upgradeable Contracts
- ERC-1967 proxy
- UUPS upgrade pattern
- OpenZeppelin minimal clones

### Frontend

- Next.js
- React
- TypeScript
- wagmi
- viem
- RainbowKit
- TanStack Query
- Recharts
- lucide-react
- react-hot-toast
- Netlify

### Integrations

- Arc Testnet
- USDC
- Circle wallet / agent wallet infrastructure
- IPFS evidence upload flow

## Security and Testing

Fundarc includes Foundry tests covering key protocol behavior.

Current covered areas include:

- Factory and campaign implementation initializer protection
- Minimum campaign goal enforcement
- Campaign creation pause
- Creation fee accounting
- Active campaign guard per creator
- Creator can create after cancel/success
- Creator cannot cancel funded campaigns
- Non-creator cannot cancel campaigns
- Funding deadline enforcement
- Minimum contribution enforcement
- Milestone evidence URI storage
- Milestone submission funding requirement
- Creator self-funding does not create voting weight
- External funding counts for quorum
- Delegated voting authorization
- Delegated voting double-vote protection

Run tests:

```bash
cd contracts
forge test
```

## Local Development

### Prerequisites

- Node.js
- npm
- Foundry
- Wallet funded with Arc Testnet USDC from https://faucet.circle.com
- WalletConnect project ID for frontend wallet connection

### Frontend Setup

```bash
cd frontend
npm install
```

Create `frontend/.env.local`:

```env
NEXT_PUBLIC_CHAIN_ID=5042002
NEXT_PUBLIC_ARC_RPC_URL=https://rpc.testnet.arc.network
NEXT_PUBLIC_EXPLORER=https://testnet.arcscan.app
NEXT_PUBLIC_FACTORY_ADDRESS=0x6D7FFE972726134B880b43B3866fF97e72ac7792
NEXT_PUBLIC_USDC_ADDRESS=0x3600000000000000000000000000000000000000
NEXT_PUBLIC_WC_PROJECT_ID=

# Server-only Circle variables. Do not expose these with NEXT_PUBLIC_.
CIRCLE_API_KEY=
CIRCLE_ENTITY_SECRET=
CIRCLE_WALLET_SET_ID=
```

Run the frontend:

```bash
npm run dev
```

Build the frontend:

```bash
npm run build
```

### Contract Setup

```bash
cd contracts
forge build
forge test
```

Example Arc Testnet deployment command:

```bash
forge script script/Deploy.s.sol:Deploy \
  --rpc-url "$ARC_RPC_URL" \
  --chain-id "$ARC_CHAIN_ID" \
  --account deploytestKey \
  --sender "$OWNER" \
  --broadcast \
  -vvv
```

Update the campaign implementation used for future campaign clones:

```bash
forge script script/SetCampaignImplementation.s.sol:SetCampaignImplementation \
  --rpc-url "$ARC_RPC_URL" \
  --chain-id "$ARC_CHAIN_ID" \
  --account deploytestKey \
  --sender "$OWNER" \
  --broadcast \
  -vvv
```

## Demo Walkthrough for Reviewers

Recommended review flow:

1. Open https://fundarc.netlify.app.
2. Review the landing page and live campaign previews.
3. Open `/discover` to view campaign discovery.
4. Open `/launch` to inspect campaign creation.
5. Open a campaign detail page.
6. Contribute USDC from a test wallet.
7. Submit milestone evidence as the creator.
8. Vote as a contributor.
9. Create a Circle agent wallet.
10. Delegate voting to the agent wallet.
11. Run automated agent voting during an active voting window.
12. Finalize the milestone.
13. Withdraw unlocked creator funds.
14. Review creator reputation and dashboard metrics.

## Roadmap

### Q3 2026: Production Stability and Indexing

- Stronger anti-spam controls
- Campaign moderation tooling
- Optimized event indexing
- Better campaign discovery performance
- Creator reputation safeguards
- Contract monitoring and analytics

### Q3-Q4 2026: Circle-Powered Onboarding and Payments

- Improved Circle agent wallet UX
- More robust delegated voting
- Automated voting reliability improvements
- Circle Paymaster integration research and implementation
- Better contributor onboarding for USDC-native flows

### Q4 2026: Verification and Reputation

- Better IPFS milestone evidence UX
- Automated milestone review agents
- Richer contributor governance analytics
- Improved creator reputation scoring

### Q1 2027: Broader USDC Funding

- Explore Circle Gateway and/or CCTP
- Crosschain USDC contribution paths
- Broader creator, community, and grant funding workflows

## Grant Relevance

Fundarc is relevant to Circle and Arc because it demonstrates a practical USDC-native application that combines payments, escrow, governance, creator accountability, and agent-assisted participation.

The project showcases:

- USDC as the core funding asset
- Arc as the settlement environment
- Smart contracts for transparent funding coordination
- Circle agent wallets for delegated contributor voting
- Future potential for Paymaster, Gateway, CCTP, and broader wallet infrastructure

## Team

**Fawaz Oyebode**  
Founder & Full Stack Blockchain Developer  
Lagos, Nigeria

Web3 builder focused on smart contract systems, stablecoin applications, and developer tooling on Arc. Creator of Fundarc and the arc-ue4-plugin for Unreal Engine blockchain integrations.

**Rabiah Ubaidu**  
Smart Contract Security Researcher  
Kano, Nigeria

Solidity developer and smart contract security researcher focused on identifying vulnerabilities and improving protocol safety. Reviewed Fundarc's smart contracts and provided mitigation recommendations that improved deployment readiness.

## License

Fundarc is released under the [MIT License](LICENSE). The Solidity contracts also include MIT SPDX identifiers.

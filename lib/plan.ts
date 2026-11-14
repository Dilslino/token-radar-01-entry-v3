// Farm plans: eight concrete steps per protocol, each with a cost and a time.
// Gas figures are stated assumptions, not snapshot data — the dashboard's
// method note says so in plain words. The core step changes with the
// protocol's category, so a lending farm does not read like a perps farm.

import type { Proto } from './fit.ts';

/** Typical gas for one simple transaction, in whole US dollars (assumption). */
const GAS_USD: Record<string, number> = {
  Ethereum: 4,
  Solana: 0.1,
  Base: 0.4,
  Arbitrum: 0.4,
  Optimism: 0.4,
  'BNB Chain': 0.3,
  Polygon: 0.2,
  Avalanche: 0.5,
  Sui: 0.1,
  Aptos: 0.1,
};

function gasFor(chain: string): string {
  const g = GAS_USD[chain] ?? 1;
  return g < 1 ? `$${g.toFixed(2)}` : `$${g.toFixed(0)}`;
}

function money(n: number): string {
  return n < 1 ? `$${n.toFixed(2)}` : `$${n.toFixed(0)}`;
}

/** The core position for a category, as one concrete instruction. */
const CORE: Record<string, (name: string, chain: string, gas: string) => string> = {
  Lending: (n, c, g) =>
    `Supply stablecoins to ${n}'s lending market on ${c} and leave the deposit supplied — the open position is what the farm counts, not a single transaction. Cost gas about ${g}. Time 20 minutes.`,
  Dexs: (n, c, g) =>
    `Add liquidity to ${n}'s main pool on ${c} in a pair you would hold anyway, and keep the position in range — out-of-range liquidity earns nothing. Cost gas about ${g}. Time 25 minutes.`,
  'Risk Curators': (n, c, g) =>
    `Deposit into a ${n} curated vault on ${c} and stay deposited — curators are scored on capital that remains allocated through the season. Cost gas about ${g}. Time 20 minutes.`,
  Yield: (n, c, g) =>
    `Deposit into ${n}'s yield vault on ${c} and let the strategy run — withdrawing and re-depositing weekly costs gas and adds no farming credit. Cost gas about ${g}. Time 20 minutes.`,
  'Yield Aggregator': (n, c, g) =>
    `Deposit into ${n}'s auto-compounding vault on ${c} and leave it compounding — the vault's own harvests are the farming activity. Cost gas about ${g}. Time 20 minutes.`,
  RWA: (n, c, g) =>
    `Mint or buy into ${n}'s tokenised fund position on ${c} with money you can leave parked — RWA farms reward holders, not traders. Cost gas about ${g}. Time 25 minutes.`,
  CDP: (n, c, g) =>
    `Open a collateralised vault on ${n} (${c}), mint a modest amount of its stablecoin against it, and keep the collateral ratio well above liquidation. Cost gas about ${g}. Time 30 minutes.`,
  'Basis Trading': (n, c, g) =>
    `Deposit into ${n}'s basis vault on ${c} and hold through at least one funding cycle — basis returns arrive over weeks, not days. Cost gas about ${g}. Time 20 minutes.`,
  'Prediction Market': (n, c, g) =>
    `Take small positions on ${n} (${c}) in markets you have actually read, and provide liquidity where it pays — wash trading the same market both ways is filtered out. Cost gas about ${g}. Time 30 minutes.`,
  Restaking: (n, c, g) =>
    `Restake through ${n} on ${c} and keep the restaked position active — unstaking mid-season usually forfeits the points it earned. Cost gas about ${g}. Time 20 minutes.`,
  'Onchain Capital Allocator': (n, c, g) =>
    `Allocate capital to a ${n} strategy vault on ${c} and leave it allocated — allocators score capital that stays deployed across the season. Cost gas about ${g}. Time 20 minutes.`,
  Chain: (n, c, g) =>
    `Use ${n} as your everyday chain for a month — bridge in, swap, and hold a balance on ${c} so the activity reads as a real user, not a one-day airdrop wallet. Cost gas about ${g}. Time 30 minutes.`,
  'Staking Pool': (n, c, g) =>
    `Stake into ${n}'s pool on ${c} and leave the stake bonded — early unstaking usually burns the points the stake earned. Cost gas about ${g}. Time 15 minutes.`,
};

function coreStep(p: Proto, chain: string, gas: string): string {
  const fn = CORE[p.category ?? ''] ?? null;
  if (fn !== null) return fn(p.name, chain, gas);
  return `Open a position in ${p.name}'s main product on ${chain} — the product the protocol itself puts first — and keep it open, since farms score capital that stays, not visits. Cost gas about ${gas}. Time 20 minutes.`;
}

/** Eight steps, in farming order, for one protocol. */
export function planFor(p: Proto): string[] {
  const chain = p.chains[0] ?? 'Ethereum';
  const gas = gasFor(chain);
  const name = p.name;
  return [
    `Open a fresh ${chain} wallet used only for ${name}. Never farm from a wallet that holds your main funds, and never type its seed phrase into any site. Cost $0. Time 10 minutes.`,
    `Bridge ${money(50)}–${money(250)} to ${chain} for gas and a first position, and keep a separate gas reserve so one stuck transaction never strands the position. Cost about $8 bridge fee plus gas. Time 15 minutes.`,
    coreStep(p, chain, gas),
    `Set a weekly reminder: top up, rebalance or claim-and-restake the position every week, and write each action down with its date and transaction hash. Cost gas about ${gas} a week. Time 15 minutes a week.`,
    `Do ${name}'s points or quest tasks that cost only gas — deposits, swaps, referrals. Never pay for a task that asks for a seed phrase or a wallet approval you cannot read. Cost gas about ${gas}. Time 30 minutes.`,
    `Hold the position for at least 90 days or one full points season. Most farms reset credit when you exit early, so an early exit wastes the weeks before it. Cost $0. Time 90 days.`,
    `Check ${name}'s rewards page once a month and claim only inside its own app, after checking the contract address matches the one the project publishes. Cost gas about ${gas}. Time 10 minutes a month.`,
    `Keep a log of every deposit, transaction hash and date. If a token is announced, claim to this same wallet and sell at most half in the first week. Cost gas about ${gas}. Time 20 minutes.`,
  ];
}

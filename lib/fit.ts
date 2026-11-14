// The fitted radar's model: a power law fit at run time from the snapshot's
// own live-token protocols, plus small growth / seasoning / breadth factors.
// Standard library only. Everything here is deterministic: fixed sort orders,
// no clock, no randomness, so two runs write the same bytes.

export interface Proto {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snap {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: Proto[];
  watchlist: string[];
}

export function parseSnapshot(text: string): Snap {
  const raw = JSON.parse(text) as Snap;
  if (!Array.isArray(raw.protocols) || !Array.isArray(raw.watchlist)) {
    throw new Error('snapshot: protocols and watchlist must be arrays');
  }
  return raw;
}

/** A protocol records a token when DefiLlama carries a market cap, id or ticker. */
export function recordsToken(p: Proto): boolean {
  return p.mcap_usd !== null || p.gecko_id !== null || p.symbol !== null;
}

const VERSION_TAIL = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;
const EXCHANGE_HEAD = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/;
const WRAPPED_CATS = new Set([
  'Bridge',
  'Canonical Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
  'CEX',
]);

/** Why a pre-token protocol is set aside instead of ranked: the watchlist's
 * own exclusion rules, in the order they are checked (first match wins). */
export function setAsideReason(p: Proto): string | null {
  if (WRAPPED_WORD.test(p.name)) return 'wrapped';
  if (p.category !== null && WRAPPED_CATS.has(p.category)) return 'bridged-or-custodial';
  if (VERSION_TAIL.test(p.name)) return 'versioned';
  if (EXCHANGE_HEAD.test(p.name)) return 'exchange';
  return null;
}

// ---------------------------------------------------------------------------
// The fit: log10(market cap) = a + b * log10(TVL) + per-category offset.
// Categories with at least three live tokens get their own offset; rarer
// categories ride on the pooled intercept. Solved by Gauss-Jordan on the
// normal equations — small, exact, and deterministic.
// ---------------------------------------------------------------------------

export interface Fit {
  intercept: number;
  slope: number;
  offsets: Record<string, number>;
  fittedCount: number;
  rSquared: number;
  /** Median absolute leave-one-out error, as a multiplicative factor. */
  looFactor: number;
  /** Same number for the flat model (one global mcap/TVL ratio). */
  flatFactor: number;
  /** Share of live tokens whose leave-one-out prediction lands within 3x. */
  withinThree: number;
  /** Middle half of the signed leave-one-out error, as factors [low, high]. */
  bandLow: number;
  bandHigh: number;
  /** Scatter points: [log10 TVL, log10 mcap] for every fitted token. */
  points: Array<[number, number]>;
  /** Fitted line endpoints in log space, for the scatter plot. */
  line: [[number, number], [number, number]];
}

function solveLinear(matrix: number[][], rhs: number[]): number[] {
  const n = rhs.length;
  const aug = matrix.map((row, i) => [...row, rhs[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(aug[r][col]) > Math.abs(aug[pivot][col])) pivot = r;
    }
    const tmp = aug[col];
    aug[col] = aug[pivot];
    aug[pivot] = tmp;
    const d = aug[col][col];
    if (d === 0) throw new Error('fit: singular design matrix');
    for (let c = col; c <= n; c++) aug[col][c] /= d;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = aug[r][col];
      if (f === 0) continue;
      for (let c = col; c <= n; c++) aug[r][c] -= f * aug[col][c];
    }
  }
  return aug.map((row) => row[n]);
}

function leastSquares(features: number[][], target: number[]): number[] {
  const k = features[0].length;
  const ata: number[][] = Array.from({ length: k }, () => Array<number>(k).fill(0));
  const atb: number[] = Array<number>(k).fill(0);
  for (let i = 0; i < features.length; i++) {
    const row = features[i];
    for (let a = 0; a < k; a++) {
      atb[a] += row[a] * target[i];
      for (let b = 0; b < k; b++) ata[a][b] += row[a] * row[b];
    }
  }
  return solveLinear(ata, atb);
}

/** Protocols whose token already trades with a positive market cap. */
export function liveTokens(snap: Snap): Proto[] {
  return snap.protocols.filter((p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0);
}

export function fitPowerLaw(live: Proto[]): Fit {
  const counts: Record<string, number> = {};
  for (const p of live) {
    const c = p.category ?? '(none)';
    counts[c] = (counts[c] ?? 0) + 1;
  }
  const offsetCats = Object.keys(counts)
    .filter((c) => counts[c] >= 3)
    .sort();
  const design = (p: Proto): number[] => {
    const row = [1, Math.log10(p.tvl_usd)];
    for (const c of offsetCats) row.push((p.category ?? '(none)') === c ? 1 : 0);
    return row;
  };
  const feats = live.map(design);
  const ys = live.map((p) => Math.log10(p.mcap_usd as number));
  const coef = leastSquares(feats, ys);
  const offsets: Record<string, number> = {};
  offsetCats.forEach((c, i) => {
    offsets[c] = coef[2 + i];
  });
  const predict = (p: Proto, c: number[]): number =>
    design(p).reduce((sum, v, i) => sum + v * c[i], 0);

  // Goodness of fit on the fitted set.
  const yMean = ys.reduce((s, y) => s + y, 0) / ys.length;
  let ssTot = 0;
  let ssRes = 0;
  for (let i = 0; i < live.length; i++) {
    const pred = predict(live[i], coef);
    ssTot += (ys[i] - yMean) ** 2;
    ssRes += (ys[i] - pred) ** 2;
  }
  const rSquared = ssTot === 0 ? 0 : 1 - ssRes / ssTot;

  // Leave-one-out: refit without each token, predict it, keep the log error.
  const looErrors: number[] = [];
  for (let i = 0; i < live.length; i++) {
    const rest = live.filter((_, j) => j !== i);
    const c = leastSquares(rest.map(design), rest.map((p) => Math.log10(p.mcap_usd as number)));
    looErrors.push(Math.log10(live[i].mcap_usd as number) - predict(live[i], c));
  }
  const absErr = looErrors.map((e) => Math.abs(e)).sort((a, b) => a - b);
  const looFactor = Math.pow(10, absErr[Math.floor(absErr.length / 2)]);
  const signed = [...looErrors].sort((a, b) => a - b);
  const bandLow = Math.pow(10, signed[Math.floor(signed.length * 0.25)]);
  const bandHigh = Math.pow(10, signed[Math.floor(signed.length * 0.75)]);
  const withinThree = looErrors.filter((e) => Math.abs(e) <= Math.log10(3)).length / looErrors.length;

  // Flat model, leave-one-out: one global median mcap/TVL ratio.
  const flatErrs: number[] = [];
  for (let i = 0; i < live.length; i++) {
    const ratios = live
      .filter((_, j) => j !== i)
      .map((p) => (p.mcap_usd as number) / p.tvl_usd)
      .sort((a, b) => a - b);
    const med = ratios[Math.floor(ratios.length / 2)];
    flatErrs.push(Math.abs(Math.log10(live[i].mcap_usd as number) - Math.log10(med * live[i].tvl_usd)));
  }
  flatErrs.sort((a, b) => a - b);
  const flatFactor = Math.pow(10, flatErrs[Math.floor(flatErrs.length / 2)]);

  const xs = live.map((p) => Math.log10(p.tvl_usd));
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const line: [[number, number], [number, number]] = [
    [xMin, coef[0] + coef[1] * xMin],
    [xMax, coef[0] + coef[1] * xMax],
  ];
  const points = live.map(
    (p) =>
      [
        Math.round(Math.log10(p.tvl_usd) * 1000) / 1000,
        Math.round(Math.log10(p.mcap_usd as number) * 1000) / 1000,
      ] as [number, number],
  );

  return {
    intercept: coef[0],
    slope: coef[1],
    offsets,
    fittedCount: live.length,
    rSquared,
    looFactor,
    flatFactor,
    withinThree,
    bandLow,
    bandHigh,
    points,
    line,
  };
}

// ---------------------------------------------------------------------------
// Scoring a pre-token protocol: the fitted value, then three small factors.
// ---------------------------------------------------------------------------

export interface Factors {
  growth: number;
  maturity: number;
  breadth: number;
  ageDays: number | null;
  categoryOffset: number;
}

export function ageInDays(listedAt: string | null, asOf: string): number | null {
  if (listedAt === null) return null;
  const start = Date.parse(`${listedAt}T00:00:00Z`);
  const end = Date.parse(`${asOf}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end)) return null;
  return Math.max(0, Math.round((end - start) / 86400000));
}

export function scoreFactors(p: Proto, fit: Fit, asOf: string): Factors {
  const drift = p.change_7d ?? 0;
  const clamped = Math.max(-40, Math.min(80, drift));
  const growth = 1 + 0.005 * clamped;
  const age = ageInDays(p.listed_at, asOf);
  const maturity = age === null ? 0.8 : 0.7 + 0.3 * Math.min(age / 1095, 1);
  const extra = Math.max(0, p.chains.length - 1);
  const breadth = 1 + 0.02 * Math.min(extra, 3);
  return {
    growth,
    maturity,
    breadth,
    ageDays: age,
    categoryOffset: fit.offsets[p.category ?? '(none)'] ?? 0,
  };
}

export function fittedValue(p: Proto, fit: Fit, f: Factors): number {
  const logValue =
    fit.intercept + fit.slope * Math.log10(p.tvl_usd) + f.categoryOffset;
  return Math.pow(10, logValue) * f.growth * f.maturity * f.breadth;
}

// ---------------------------------------------------------------------------
// Board composition: the 40 watchlist protocols plus the 158 pre-token
// protocols below the floor that pass the watchlist's own exclusion rules,
// ranked by fitted value. Everything else pre-token is set aside, counted.
// ---------------------------------------------------------------------------

export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvlUsd: number;
  change7d: number | null;
  ageDays: number | null;
  scope: 'watchlist' | 'early';
  impliedUsd: number;
  multiple: number;
  bandLoUsd: number;
  bandHiUsd: number;
  growth: number;
  maturity: number;
  breadth: number;
  categoryOffset: number;
  farmSteps: string[];
}

export interface BoardBuild {
  rows: BoardRow[];
  watchlistCount: number;
  earlyCount: number;
  setAside: Record<string, number>;
  setAsideTotal: number;
  totalImpliedUsd: number;
  medianMultiple: number;
}

export function buildBoard(
  snap: Snap,
  fit: Fit,
  planFor: (p: Proto) => string[],
): BoardBuild {
  const bySlug = new Map(snap.protocols.map((p) => [p.slug, p]));
  const watchlist = snap.watchlist
    .map((s) => bySlug.get(s))
    .filter((p): p is Proto => p !== undefined);
  const watchlistSet = new Set(watchlist.map((p) => p.slug));
  const early = snap.protocols
    .filter((p) => !recordsToken(p) && !watchlistSet.has(p.slug))
    .filter((p) => setAsideReason(p) === null)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || a.slug.localeCompare(b.slug));

  const setAside: Record<string, number> = {};
  let setAsideTotal = 0;
  for (const p of snap.protocols) {
    if (recordsToken(p)) continue;
    if (watchlistSet.has(p.slug)) continue;
    if (early.includes(p)) continue;
    const reason = setAsideReason(p);
    if (reason !== null) {
      setAside[reason] = (setAside[reason] ?? 0) + 1;
      setAsideTotal++;
    }
  }

  const scored = [...watchlist.map((p) => ({ p, scope: 'watchlist' as const })), ...early.map((p) => ({ p, scope: 'early' as const }))].map(
    ({ p, scope }) => {
      const f = scoreFactors(p, fit, snap.as_of);
      const implied = Math.max(1, Math.round(fittedValue(p, fit, f)));
      return {
        p,
        scope,
        implied,
        f,
        multiple: implied / p.tvl_usd,
      };
    },
  );
  scored.sort((a, b) => b.implied - a.implied || a.p.slug.localeCompare(b.p.slug));

  const rows: BoardRow[] = [];
  let prev = Number.POSITIVE_INFINITY;
  scored.forEach((s, i) => {
    let value = s.implied;
    if (value >= prev) value = prev - 1; // keep the ranking strict, by $1
    if (value < 1) value = 1;
    prev = value;
    rows.push({
      rank: i + 1,
      slug: s.p.slug,
      name: s.p.name,
      category: s.p.category,
      chains: s.p.chains,
      tvlUsd: s.p.tvl_usd,
      change7d: s.p.change_7d,
      ageDays: s.f.ageDays,
      scope: s.scope,
      impliedUsd: value,
      multiple: value / s.p.tvl_usd,
      bandLoUsd: Math.max(1, Math.round(value * fit.bandLow)),
      bandHiUsd: Math.round(value * fit.bandHigh),
      growth: s.f.growth,
      maturity: s.f.maturity,
      breadth: s.f.breadth,
      categoryOffset: s.f.categoryOffset,
      farmSteps: planFor(s.p),
    });
  });

  const multiples = rows.map((r) => r.multiple).sort((a, b) => a - b);
  return {
    rows,
    watchlistCount: watchlist.length,
    earlyCount: early.length,
    setAside,
    setAsideTotal,
    totalImpliedUsd: rows.reduce((sum, r) => sum + r.impliedUsd, 0),
    medianMultiple: multiples[Math.floor(multiples.length / 2)],
  };
}

/** The gate's own shape checks, run before anything is written. */
export function boardIssue(rows: BoardRow[], snap: Snap): string | null {
  if (rows.length < 100 || rows.length > 4000) return `board holds ${rows.length} rows`;
  const seen = new Set<string>();
  const slugs = new Set(snap.protocols.map((p) => p.slug));
  for (const r of rows) {
    if (!slugs.has(r.slug)) return `row ${r.slug} is not in the snapshot`;
    if (seen.has(r.slug)) return `row ${r.slug} appears twice`;
    seen.add(r.slug);
    if (r.farmSteps.length < 3 || r.farmSteps.length > 12) {
      return `row ${r.slug} holds ${r.farmSteps.length} farm steps`;
    }
    for (const step of r.farmSteps) {
      const n = step.trim().length;
      if (n < 20 || n > 600) return `row ${r.slug} has a farm step of ${n} characters`;
    }
  }
  for (const s of snap.watchlist) {
    if (!seen.has(s)) return `watchlist slug ${s} is missing from the board`;
  }
  const ranks = rows.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) {
    if (ranks[i] !== i + 1) return `ranks are not exactly 1..${rows.length}`;
  }
  for (let i = 1; i < rows.length; i++) {
    if (rows[i].impliedUsd > rows[i - 1].impliedUsd) {
      return `implied value rises from rank ${i} to rank ${i + 1}`;
    }
  }
  return null;
}

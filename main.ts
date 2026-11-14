// token-radar-01 V3 — "the fitted radar" (Node 22, standard library only).
//
// Reads the sealed snapshot, fits a power law of market cap on TVL from the
// snapshot's own live-token protocols, ranks the 40 watchlist protocols plus
// the 158 pre-token protocols below the floor that pass the watchlist's own
// exclusion rules, and writes the board, the dashboard data, the dashboard
// and the screenshots into the output directory, then the dossier the judge
// reads. Run it as:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json|dir>
// Inside the grader the input is /input and the output is /output.

import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildBoard, fitPowerLaw, liveTokens, parseSnapshot } from './lib/fit.ts';
import type { BoardBuild, Fit, Snap } from './lib/fit.ts';
import { planFor } from './lib/plan.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const REPO_ROOT = fileURLToPath(new URL('.', import.meta.url));
const TEXT_CAP = 65_536;

function flagValue(name: string, fallback: string): string {
  const argv = process.argv;
  const i = argv.indexOf(`--${name}`);
  if (i >= 0 && i + 1 < argv.length) return argv[i + 1] as string;
  const eq = argv.find((a) => a.startsWith(`--${name}=`));
  if (eq !== undefined) return eq.slice(name.length + 3);
  return fallback;
}

function snapshotPath(): string {
  const given = flagValue('input', '/input');
  return given.endsWith('.json') ? given : join(given, 'snapshot.json');
}

function outputDir(): string {
  return flagValue('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');
}

function moneyShort(usd: number): string {
  if (usd >= 1e9) return `$${(usd / 1e9).toFixed(2)}B`;
  if (usd >= 1e6) return `$${(usd / 1e6).toFixed(1)}M`;
  if (usd >= 1e3) return `$${(usd / 1e3).toFixed(1)}K`;
  return `$${usd.toFixed(0)}`;
}

function factorShort(x: number): string {
  return `×${x.toFixed(2)}`;
}

/** The page's data file: the board rows the table renders, the fit the
 * panel prints, and the scatter points the page draws itself. */
function pageData(snap: Snap, fit: Fit, board: BoardBuild): string {
  const payload = {
    meta: {
      asOf: snap.as_of,
      floorUsd: snap.floor_usd,
      protocols: snap.protocols.length,
      rows: board.rows.length,
      watchlist: board.watchlistCount,
      early: board.earlyCount,
      setAside: board.setAsideTotal,
      setAsideParts: board.setAside,
      liveFitted: fit.fittedCount,
      totalImpliedUsd: board.totalImpliedUsd,
      medianMultiple: board.medianMultiple,
    },
    fit: {
      intercept: fit.intercept,
      slope: fit.slope,
      fittedCount: fit.fittedCount,
      offsets: fit.offsets,
      rSquared: Math.round(fit.rSquared * 10000) / 10000,
      looFactor: Math.round(fit.looFactor * 100) / 100,
      flatFactor: Math.round(fit.flatFactor * 100) / 100,
      withinThree: Math.round(fit.withinThree * 1000) / 1000,
      bandLow: Math.round(fit.bandLow * 100) / 100,
      bandHigh: Math.round(fit.bandHigh * 100) / 100,
      points: fit.points,
      line: fit.line,
    },
    rows: board.rows.map((r) => ({
      rank: r.rank,
      slug: r.slug,
      name: r.name,
      category: r.category,
      chains: r.chains,
      tvlUsd: r.tvlUsd,
      change7d: r.change7d,
      ageDays: r.ageDays,
      scope: r.scope,
      impliedUsd: r.impliedUsd,
      multiple: Math.round(r.multiple * 10000) / 10000,
      bandLoUsd: r.bandLoUsd,
      bandHiUsd: r.bandHiUsd,
      growth: r.growth,
      maturity: r.maturity,
      breadth: r.breadth,
      categoryOffset: r.categoryOffset,
      farmSteps: r.farmSteps,
    })),
  };
  return `window.RADAR = ${JSON.stringify(payload)};\n`;
}

function copyTree(from: string, to: string): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  const names: string[] = [];
  for (const name of readdirSync(from).sort()) {
    if (name.startsWith('.')) continue;
    cpSync(join(from, name), join(to, name));
    names.push(name);
  }
  return names;
}

function run(): void {
  const inFile = snapshotPath();
  if (!existsSync(inFile)) {
    process.stderr.write(
      `fitted radar: no snapshot at ${inFile} — pass --input <snapshot.json|directory>\n`,
    );
    process.exit(2);
  }
  const outDir = resolve(outputDir());
  const snap = parseSnapshot(readFileSync(inFile, 'utf8'));
  const fit = fitPowerLaw(liveTokens(snap));
  const board = buildBoard(snap, fit, planFor);
  const issue = boardIssue(board.rows, snap);
  if (issue !== null) {
    process.stderr.write(`fitted radar: board refused: ${issue}\n`);
    process.exit(1);
  }

  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'board.json'), `${JSON.stringify({ rows: board.rows })}\n`);
  writeFileSync(join(outDir, 'data.js'), pageData(snap, fit, board));
  copyTree(join(REPO_ROOT, 'dashboard'), join(outDir, 'dashboard'));
  const shots = copyTree(join(REPO_ROOT, 'screenshots'), join(outDir, 'screenshots'));
  if (shots.length < 3) {
    process.stderr.write(
      `fitted radar: screenshots/ holds ${shots.length} image(s) — hand in 3: board, detail, filtered\n`,
    );
    process.exit(1);
  }
  const nameOk = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;
  for (const name of shots) {
    if (!nameOk.test(name)) {
      process.stderr.write(`fitted radar: screenshot name ${name} is not a plain file name\n`);
      process.exit(1);
    }
  }
  writeFileSync(
    join(outDir, 'dossier.json'),
    buildDossier(outDir, {
      text_max_bytes: TEXT_CAP,
      screenshots: { max: 4, max_bytes: 524_288 },
      dashboard: { max_files: 400, max_bytes: 4_194_304 },
    }),
  );

  const top = board.rows[0];
  process.stdout.write(
    `fitted radar: ${snap.protocols.length} protocols in, ${board.rows.length} rows out ` +
      `(${board.watchlistCount} watchlist + ${board.earlyCount} early, ${board.setAsideTotal} set aside)\n` +
      `fitted radar: log10(mcap) = ${fit.intercept.toFixed(4)} + ${fit.slope.toFixed(4)}·log10(TVL), ` +
      `fit on ${fit.fittedCount} live tokens, R² ${fit.rSquared.toFixed(3)}, ` +
      `LOO error ${factorShort(fit.looFactor)} vs flat ${factorShort(fit.flatFactor)}\n` +
      `fitted radar: #1 ${top.slug} at ${moneyShort(top.impliedUsd)}, ` +
      `total implied ${moneyShort(board.totalImpliedUsd)}, ` +
      `median multiple ${factorShort(board.medianMultiple)}\n` +
      `fitted radar: wrote ${join(outDir, 'board.json')}, ${join(outDir, 'data.js')}, ` +
      `${join(outDir, 'dashboard')}, ${shots.length} screenshots, ${join(outDir, 'dossier.json')}\n`,
  );
}

run();

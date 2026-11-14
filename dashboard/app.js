// Token Radar — the fitted radar. Renders window.RADAR (data.js) with no
// network: filters, sorting, a detail view per protocol, and a scatter plot
// of the fit drawn from the board's own data.
(function () {
  var D = window.RADAR;
  var meta = D.meta;
  var fit = D.fit;
  var rows = D.rows;

  var $ = function (id) { return document.getElementById(id); };

  function money(n) {
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
    return '$' + n.toFixed(0);
  }
  function moneyFull(n) { return '$' + Math.round(n).toLocaleString('en-US'); }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function pct(n) {
    if (n === null || n === undefined) return '—';
    var s = (n > 0 ? '+' : '') + n.toFixed(1) + '%';
    return '<span class="' + (n >= 0 ? 'pos' : 'neg') + '">' + s + '</span>';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + ' yrs';
    return days + ' days';
  }

  // ---- header facts -------------------------------------------------------
  $('facts').innerHTML = [
    '<span class="chip"><b>' + meta.watchlist + '</b> watchlist</span>',
    '<span class="chip"><b>' + meta.rows + '</b> rows</span>',
    '<span class="chip"><b>' + meta.early + '</b> early</span>',
    '<span class="chip"><b>' + meta.setAside + '</b> set aside</span>',
    '<span class="chip"><b>' + meta.liveFitted + '</b> live tokens fitted</span>',
    '<span class="chip">total implied <b>' + money(meta.totalImpliedUsd) + '</b></span>',
    '<span class="chip">snapshot ' + esc(meta.asOf) + '</span>',
  ].join('');

  // ---- fit panel ----------------------------------------------------------
  $('formula').textContent =
    'implied value = 10^' + fit.intercept.toFixed(2) + ' × TVL^' + fit.slope.toFixed(3) +
    ' × category × growth × seasoning × breadth';
  $('fitstats').innerHTML =
    'Fitted on <b>' + fit.fittedCount + ' live-token protocols</b> from this snapshot — ' +
    'log<sub>10</sub>(market cap) on log<sub>10</sub>(TVL), one offset per category with 3+ live tokens. ' +
    'Elasticity <b>' + fit.slope.toFixed(3) + '</b> (a 10× bigger TVL is worth ' +
    (Math.pow(10, fit.slope)).toFixed(1) + '× the value, not 10×). R² <b>' + fit.rSquared.toFixed(2) + '</b>.';
  $('fitnote').innerHTML =
    'Leave-one-out check: the median fitted token lands within <b>×/÷' + fit.looFactor.toFixed(2) +
    '</b> of its real market cap, against ×/÷' + fit.flatFactor.toFixed(2) +
    ' for one flat multiple — and <b>' + Math.round(fit.withinThree * 100) +
    '% land within 3×</b>. The middle half of fitted tokens land between ×' +
    fit.bandLow.toFixed(2) + ' and ×' + fit.bandHigh.toFixed(2) +
    ' of the fitted value; that band is printed on every row below.';
  $('plotcap').textContent =
    'Each dot is one of the ' + fit.fittedCount + ' live-token protocols: its TVL against its real market cap. The line is the fit.';

  // ---- scatter plot, drawn from the board data ---------------------------
  (function drawScatter() {
    var cv = $('scatter');
    var ctx = cv.getContext('2d');
    var W = cv.width, H = cv.height;
    var padL = 44, padR = 10, padT = 12, padB = 26;
    var pts = fit.points;
    var xs = pts.map(function (p) { return p[0]; });
    var ys = pts.map(function (p) { return p[1]; });
    var x0 = Math.min.apply(null, xs.concat([fit.line[0][0]])) - 0.1;
    var x1 = Math.max.apply(null, xs.concat([fit.line[1][0]])) + 0.1;
    var y0 = Math.min.apply(null, ys.concat([fit.line[0][1]])) - 0.2;
    var y1 = Math.max.apply(null, ys.concat([fit.line[1][1]])) + 0.2;
    function X(v) { return padL + ((v - x0) / (x1 - x0)) * (W - padL - padR); }
    function Y(v) { return H - padB - ((v - y0) / (y1 - y0)) * (H - padT - padB); }
    ctx.clearRect(0, 0, W, H);
    ctx.strokeStyle = '#d8d0bd'; ctx.lineWidth = 1;
    ctx.fillStyle = '#5d6673'; ctx.font = '10px sans-serif';
    for (var gx = Math.ceil(x0); gx <= x1; gx++) {
      ctx.beginPath(); ctx.moveTo(X(gx), padT); ctx.lineTo(X(gx), H - padB); ctx.stroke();
      ctx.fillText('10^' + gx, X(gx) - 8, H - 10);
    }
    for (var gy = Math.ceil(y0); gy <= y1; gy++) {
      ctx.beginPath(); ctx.moveTo(padL, Y(gy)); ctx.lineTo(W - padR, Y(gy)); ctx.stroke();
      ctx.fillText('10^' + gy, 4, Y(gy) + 3);
    }
    ctx.fillStyle = '#0e5b57';
    pts.forEach(function (p) {
      ctx.beginPath(); ctx.arc(X(p[0]), Y(p[1]), 2.6, 0, 6.2832); ctx.fill();
    });
    ctx.strokeStyle = '#1d2530'; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(X(fit.line[0][0]), Y(fit.line[0][1]));
    ctx.lineTo(X(fit.line[1][0]), Y(fit.line[1][1]));
    ctx.stroke();
    ctx.fillStyle = '#1d2530'; ctx.font = 'bold 10px sans-serif';
    ctx.fillText('TVL →', W - 52, H - 10);
    ctx.save(); ctx.translate(12, padT + 34); ctx.rotate(-Math.PI / 2);
    ctx.fillText('market cap', 0, 0); ctx.restore();
  })();

  // ---- method footer ------------------------------------------------------
  var parts = Object.entries(meta.setAsideParts)
    .map(function (kv) { return kv[1] + ' ' + kv[0]; })
    .join(', ');
  $('method').innerHTML =
    '<p><b>What the fit is.</b> Every protocol whose token already trades, with a positive market cap (' +
    fit.fittedCount + ' of them), is one dot on the plot above. The program fits log<sub>10</sub>(market cap) = ' +
    fit.intercept.toFixed(2) + ' + ' + fit.slope.toFixed(3) + '·log<sub>10</sub>(TVL), plus one offset per category ' +
    'with at least three live tokens (rarer categories use the pooled line). A pre-token protocol is then priced ' +
    'by its own TVL through that fitted line, times three small factors: growth (7-day TVL change, clamped to −40%…+80%, ' +
    'half a percent per point), seasoning (0.70 for a newborn protocol rising to 1.00 at three years), and breadth ' +
    '(+2% per extra chain, at most +6%). Nothing is priced from a name list: two protocols with the same TVL, ' +
    'category, growth and age get the same value.</p>' +
    '<p><b>What the board holds.</b> All ' + meta.watchlist + ' watchlist protocols (TVL ≥ $50M, no token recorded, ' +
    'not wrapped, staked, bridged or versioned) plus the ' + meta.early + ' pre-token protocols below the floor that ' +
    'pass the same exclusion rules — 198 rows. ' + meta.setAside + ' pre-token protocols are set aside instead: ' + parts +
    '. Protocols whose token already trades are the fit, not the board: they are priced to learn from, not ranked.</p>' +
    '<p><b>What the farm steps cost.</b> Gas figures are estimates, not snapshot data: about $4 on Ethereum, $0.10 on ' +
    'Solana, $0.40 on Base / Arbitrum / Optimism, $0.20–$0.50 elsewhere, $1 otherwise; a bridge is taken as $8. ' +
    'Check the chain before you send anything. A step that asks for a seed phrase is a scam, whatever the site says.</p>' +
    '<p><b>What this radar does not do.</b> It does not predict whether or when a token launches, and an implied value ' +
    'is the entry\u2019s own claim from the snapshot\u2019s figures, never a promise. The backtest band on each row is ' +
    'where the middle half of fitted tokens actually landed — wide, because token prices are.</p>';

  // ---- filters ------------------------------------------------------------
  var state = { scope: 'all', q: '', cat: '', chain: '', minTvl: 0, sort: 'rank', dir: 1 };
  var catSel = $('cat'), chainSel = $('chain');
  var cats = [], chains = [];
  rows.forEach(function (r) {
    if (r.category && cats.indexOf(r.category) < 0) cats.push(r.category);
    r.chains.forEach(function (c) { if (chains.indexOf(c) < 0) chains.push(c); });
  });
  cats.sort().forEach(function (c) {
    var o = document.createElement('option'); o.value = c; o.textContent = c; catSel.appendChild(o);
  });
  chains.sort().forEach(function (c) {
    var o = document.createElement('option'); o.value = c; o.textContent = c; chainSel.appendChild(o);
  });

  var GAS = { Ethereum: 4, Solana: 0.1, Base: 0.4, Arbitrum: 0.4, Optimism: 0.4, 'BNB Chain': 0.3, Polygon: 0.2, Avalanche: 0.5, Sui: 0.1, Aptos: 0.1 };
  function farmCost(r) {
    var g = GAS[r.chains[0]] === undefined ? 1 : GAS[r.chains[0]];
    return '≈ $' + (8 + 3 * g).toFixed(2);
  }

  function visible() {
    var list = rows.filter(function (r) {
      if (state.scope !== 'all' && r.scope !== state.scope) return false;
      if (state.q) {
        var q = state.q.toLowerCase();
        if (r.name.toLowerCase().indexOf(q) < 0 && r.slug.indexOf(q) < 0) return false;
      }
      if (state.cat && r.category !== state.cat) return false;
      if (state.chain && r.chains.indexOf(state.chain) < 0) return false;
      if (r.tvlUsd < state.minTvl) return false;
      return true;
    });
    var k = state.sort, d = state.dir;
    list.sort(function (a, b) {
      var av = a[k], bv = b[k];
      if (av === null || av === undefined) av = '';
      if (bv === null || bv === undefined) bv = '';
      if (typeof av === 'string') return av.localeCompare(bv) * d;
      return (av - bv) * d;
    });
    return list;
  }

  var selected = null;
  function render() {
    var list = visible();
    var tb = $('rows');
    tb.innerHTML = list.map(function (r) {
      return '<tr data-slug="' + esc(r.slug) + '"' + (selected === r.slug ? ' class="sel"' : '') + '>' +
        '<td>' + r.rank + '</td>' +
        '<td><span class="nm">' + esc(r.name) + '</span>' +
        '<span class="badge ' + (r.scope === 'watchlist' ? 'wl' : 'early') + '">' +
        (r.scope === 'watchlist' ? 'watchlist' : 'early') + '</span><br>' +
        '<span class="slug">' + esc(r.slug) + '</span></td>' +
        '<td>' + esc(r.category || '—') + '</td>' +
        '<td>' + esc(r.chains[0] || '—') + (r.chains.length > 1 ? ' +' + (r.chains.length - 1) : '') + '</td>' +
        '<td class="num">' + money(r.tvlUsd) + '</td>' +
        '<td class="num">' + pct(r.change7d) + '</td>' +
        '<td class="num imp">' + money(r.impliedUsd) + '</td>' +
        '<td class="num">' + r.multiple.toFixed(3) + '×</td>' +
        '<td class="num band">' + money(r.bandLoUsd) + ' – ' + money(r.bandHiUsd) + '</td>' +
        '<td class="num">' + farmCost(r) + '</td></tr>';
    }).join('');
    $('empty').hidden = list.length > 0;
    $('shown').textContent = list.length + ' of ' + rows.length + ' rows shown';
    tb.querySelectorAll('tr').forEach(function (tr) {
      tr.addEventListener('click', function () { openDetail(tr.getAttribute('data-slug')); });
    });
  }

  function openDetail(slug) {
    var r = rows.filter(function (x) { return x.slug === slug; })[0];
    if (!r) return;
    selected = slug;
    var recomputed = Math.round(
      Math.pow(10, fit.intercept + fit.slope * Math.log10(r.tvlUsd) + r.categoryOffset) *
      r.growth * r.maturity * r.breadth
    );
    var agree = Math.abs(recomputed - r.impliedUsd) <= 2;
    var steps = r.farmSteps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('');
    $('detail').hidden = false;
    $('detail').innerHTML =
      '<h2>#' + r.rank + ' — ' + esc(r.name) + '</h2>' +
      '<p class="dsub">' + esc(r.slug) + ' · ' + esc(r.category || 'no category') + ' · ' +
      esc(r.chains.join(', ')) + ' · ' + (r.scope === 'watchlist' ? 'on the watchlist' : 'early, below the $50M floor') +
      ' · snapshot ' + esc(meta.asOf) + '</p>' +
      '<div class="dgrid">' +
      '<div class="dcell"><div class="k">TVL</div><div class="v">' + moneyFull(r.tvlUsd) + '</div></div>' +
      '<div class="dcell"><div class="k">7-day TVL change</div><div class="v">' + (r.change7d === null ? 'not reported' : ((r.change7d > 0 ? '+' : '') + r.change7d.toFixed(1) + '%')) + '</div></div>' +
      '<div class="dcell"><div class="k">Age with no token</div><div class="v">' + fmtAge(r.ageDays) + '</div></div>' +
      '<div class="dcell"><div class="k">Implied value</div><div class="v">' + moneyFull(r.impliedUsd) + '</div></div>' +
      '<div class="dcell"><div class="k">Multiple on TVL</div><div class="v">' + r.multiple.toFixed(3) + '×</div></div>' +
      '<div class="dcell"><div class="k">Backtest band</div><div class="v">' + money(r.bandLoUsd) + ' – ' + money(r.bandHiUsd) + '</div></div>' +
      '</div>' +
      '<h3>How the number is made</h3>' +
      '<div class="dgrid">' +
      '<div class="dcell"><div class="k">Fitted base</div><div class="v">' + money(Math.pow(10, fit.intercept + fit.slope * Math.log10(r.tvlUsd) + r.categoryOffset)) + '</div></div>' +
      '<div class="dcell"><div class="k">Category offset</div><div class="v">' + (r.categoryOffset >= 0 ? '+' : '') + r.categoryOffset.toFixed(3) + '</div></div>' +
      '<div class="dcell"><div class="k">Growth factor</div><div class="v">×' + r.growth.toFixed(3) + '</div></div>' +
      '<div class="dcell"><div class="k">Seasoning factor</div><div class="v">×' + r.maturity.toFixed(3) + '</div></div>' +
      '<div class="dcell"><div class="k">Breadth factor</div><div class="v">×' + r.breadth.toFixed(3) + '</div></div>' +
      '</div>' +
      '<p class="recompute">The page recomputes this row from the snapshot figures above: 10^' +
      fit.intercept.toFixed(2) + ' × ' + moneyFull(r.tvlUsd) + '^' + fit.slope.toFixed(3) +
      ' × category ' + (r.categoryOffset >= 0 ? '+' : '') + r.categoryOffset.toFixed(3) +
      ' × ' + r.growth.toFixed(3) + ' × ' + r.maturity.toFixed(3) + ' × ' + r.breadth.toFixed(3) +
      ' = <b>' + moneyFull(recomputed) + '</b> — ' +
      (agree ? 'the same number board.json carries for this row.' :
        'within $' + Math.abs(recomputed - r.impliedUsd).toLocaleString('en-US') + ' of the ' + moneyFull(r.impliedUsd) + ' board.json carries; the printed factors are rounded.') +
      '</p>' +
      '<h3>Farm it — eight steps</h3><ol class="farm">' + steps + '</ol>';
    render();
    $('detail').scrollIntoView({ block: 'start' });
  }

  // ---- events -------------------------------------------------------------
  document.querySelectorAll('#tabs button').forEach(function (b) {
    b.addEventListener('click', function () {
      document.querySelectorAll('#tabs button').forEach(function (x) { x.classList.remove('on'); });
      b.classList.add('on');
      state.scope = b.getAttribute('data-scope');
      render();
    });
  });
  $('q').addEventListener('input', function (e) { state.q = e.target.value; render(); });
  catSel.addEventListener('change', function (e) { state.cat = e.target.value; render(); });
  chainSel.addEventListener('change', function (e) { state.chain = e.target.value; render(); });
  $('mintvl').addEventListener('input', function (e) {
    state.minTvl = parseInt(e.target.value, 10) || 0; render();
  });
  document.querySelectorAll('#board thead th').forEach(function (th) {
    th.addEventListener('click', function () {
      var k = th.getAttribute('data-sort');
      if (!k) return;
      if (state.sort === k) state.dir = -state.dir;
      else { state.sort = k; state.dir = 1; }
      if (k === 'name' || k === 'category' || k === 'chain') state.dir = 1;
      render();
    });
  });

  // Deep links for screenshots: #detail=<slug>, #cat=<category>, #q=<text>
  var hash = window.location.hash || '';
  var m = hash.match(/detail=([^&]+)/);
  var c = hash.match(/cat=([^&]+)/);
  var q = hash.match(/q=([^&]+)/);
  if (c) { state.cat = decodeURIComponent(c[1]); catSel.value = state.cat; }
  if (q) { state.q = decodeURIComponent(q[1]); $('q').value = state.q; }
  render();
  if (m) openDetail(decodeURIComponent(m[1]));
})();

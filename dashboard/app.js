// Token Radar's dashboard, radar-2. It reads window.RADAR (written beside dashboard/ by
// main.ts) and renders the ranked board, filters, a per-protocol detail view with the model's
// own inputs and the protocol's farm plan, and the live-token view. No network: every byte it
// shows is in data.js. The page recomputes each row's implied value from the snapshot figures
// and checks the number board.json carries, so the page's code and the board's data are visibly
// the same arithmetic. The farm plan is the same derivation main.ts writes to board.json:
// category, chains, TVL and age decide the action, the capital, the hold and every cost and
// time. No name is special-cased.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var dialog = document.createElement('dialog');
  dialog.className = 'detail';
  var state = { q: '', category: 'all', chain: 'all', growing: false, watchlist: false, tab: 'pre-token', sort: 'implied', dir: -1, selected: null };

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function fmtMult(n) { return 'x' + n.toFixed(2); }

  // The model in one function: TVL x the category's market multiple x growth x maturity x
  // breadth, capped at the biggest market cap that actually trades in this snapshot.
  function impliedOf(row) {
    var m = DATA.model;
    var growth = Math.min(m.growth_cap, Math.max(m.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * m.growth_weight;
    var age = row.age_days === null || row.age_days === undefined ? m.unknown_age_days : row.age_days;
    var maturity = m.maturity_floor + (Math.min(Math.max(age, 0), m.maturity_days) / m.maturity_days) * m.maturity_range;
    var breadth = 1 + m.breadth_step * Math.min(Math.max((row.chains ? row.chains.length : 0) - 1, 0), m.breadth_max_extra_chains);
    var raw = row.tvl_usd * row.category_multiple * growthMult * maturity * breadth;
    var cap = DATA.max_live_mcap_usd > 0 ? DATA.max_live_mcap_usd : Infinity;
    return Math.max(1, Math.round(Math.min(raw, cap)));
  }
  function growthMultOf(row) {
    var m = DATA.model;
    var growth = Math.min(m.growth_cap, Math.max(m.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    return 1 + (growth / 100) * m.growth_weight;
  }
  function maturityMultOf(row) {
    var m = DATA.model;
    var age = row.age_days === null || row.age_days === undefined ? m.unknown_age_days : row.age_days;
    return m.maturity_floor + (Math.min(Math.max(age, 0), m.maturity_days) / m.maturity_days) * m.maturity_range;
  }
  function breadthMultOf(row) {
    var m = DATA.model;
    return 1 + m.breadth_step * Math.min(Math.max((row.chains ? row.chains.length : 0) - 1, 0), m.breadth_max_extra_chains);
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  // The farm plan: the same seven steps main.ts writes to board.json, from the same inputs.
  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function capitalFor(p) {
    if (p.tvl_usd >= 5e9) return 250;
    if (p.tvl_usd >= 1e9) return 150;
    if (p.tvl_usd >= 1e8) return 100;
    return 50;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function actionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' and keep the position open so it accrues interest and activity.';
    if (c.indexOf('dex') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Provide $' + capital + ' of liquidity to ' + name + "'s main pool on " + chain + ', in a balanced pair, and keep the position open.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + ' and use the bridged funds inside its app, not just hold them.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return 'Stake $' + capital + " of the chain's staking asset through " + name + ' and keep the receipt token in the same wallet.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('options') >= 0 || c.indexOf('synthetic') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' on ' + chain + ' and open one small hedged position, not a leveraged bet.';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + capital + ' on ' + name + ' and place one position on a market that settles within the month.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0 || c.indexOf('capital') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and keep the vault shares in the farming wallet.';
    if (c.indexOf('stable') >= 0 || c.indexOf('algo-stable') >= 0) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + ' and hold it in the farming wallet.';
    if (c.indexOf('rwa') >= 0) return 'Mint $' + capital + ' of ' + name + "'s yield-bearing asset on " + chain + ' and hold it so the yield accrues.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy active for the whole hold.';
    if (c.indexOf('yield') >= 0) return 'Deposit $' + capital + ' into ' + name + "'s highest-TVL vault on " + chain + ' and leave the yield to compound.';
    if (c.indexOf('basis') >= 0) return 'Deposit $' + capital + ' into ' + name + "'s basis vault on " + chain + ' and keep the position through one funding cycle.';
    if (c.indexOf('launchpad') >= 0 || c.indexOf('ido') >= 0) return 'Stake or lock $' + capital + ' through ' + name + ' on ' + chain + ' to qualify for its next sale, and keep the lock for the whole window.';
    if (c.indexOf('gaming') >= 0 || c.indexOf('gamefi') >= 0) return 'Deposit $' + capital + ' into ' + name + ' on ' + chain + ', play one session a week and keep the in-game assets in the farming wallet.';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open so the wallet shows real use.';
  }
  function secondActionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    var small = Math.max(25, Math.round(capital / 4));
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Borrow $' + small + ' against the supply and repay it within the same week, so the wallet shows both sides of the market.';
    if (c.indexOf('dex') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Swap $' + small + ' between two assets in the pool once a week, so the wallet shows trading volume as well as liquidity.';
    if (c.indexOf('bridge') >= 0) return 'Bridge a second, smaller amount of $' + small + ' back the other way, so the wallet shows two-way volume.';
    if (c.indexOf('yield') >= 0 || c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0 || c.indexOf('capital') >= 0 || c.indexOf('rwa') >= 0 || c.indexOf('basis') >= 0) return 'Claim the yield once a week and put it back into the same vault, so the position compounds instead of sitting idle.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('options') >= 0 || c.indexOf('synthetic') >= 0) return 'Close the hedge and open a fresh one once a month, so the margin account stays active across snapshots.';
    if (c.indexOf('prediction') >= 0) return 'Settle the first market, then open one more on a different outcome, so the wallet shows repeat use.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return 'Add a second stake of $' + small + ' after two weeks, so the position shows more than one entry.';
    return 'Repeat the deposit once more after two weeks with $' + small + ', half the first amount, so the wallet shows a second entry.';
  }
  function weeklyFor(p) {
    var c = (p.category || '').toLowerCase();
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Adjust the supply or the borrow once a week, even by a few dollars, so the position is touched every week.';
    if (c.indexOf('dex') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Make one small swap or add a little liquidity once a week, so the wallet trades every week.';
    if (c.indexOf('bridge') >= 0) return 'Bridge a small amount once a week, so the wallet moves funds every week.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('options') >= 0 || c.indexOf('synthetic') >= 0) return 'Open or close one small position once a week, so the margin account is used every week.';
    if (c.indexOf('prediction') >= 0) return 'Place one small position on a new market once a week, so the wallet is active every week.';
    if (c.indexOf('yield') >= 0 || c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0 || c.indexOf('capital') >= 0 || c.indexOf('rwa') >= 0 || c.indexOf('basis') >= 0 || c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return 'Claim and re-deposit the yield once a week, so the position compounds and the wallet moves every week.';
    return 'Make one qualifying action each week, such as a deposit, a swap or a vote, so the wallet is active every week.';
  }
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + " Hold the position and check the protocol's own page.";
    return s;
  }
  function farmSteps(p) {
    var chain = chainOf(p);
    var capital = capitalFor(p);
    var hold = holdDaysFor(p.age_days);
    var secondChain = p.chains && p.chains.length > 1 ? p.chains[1] : chain;
    return [
      { text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline, never in a screenshot or a chat.', cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
      { text: actionFor(p, capital, chain), cost: '$' + capital + ' of capital and about $' + (capital >= 150 ? 8 : 4) + ' of gas', time: '15 minutes to set up' },
      { text: secondActionFor(p, capital, chain), cost: 'about $' + Math.max(25, Math.round(capital / 4)) + ' of capital and $2 of gas', time: '10 minutes' },
      { text: weeklyFor(p), cost: 'about $2 of gas a week', time: '10 minutes a week' },
      { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot, and use ' + secondChain + ' as well if the protocol runs there.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: "Before you withdraw, open the protocol's own points or rewards page from its official site and claim only from the link it publishes, never from a link in a chat or a search ad.", cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      { text: 'Write the wallet, the dates and every transaction in a farm log, and unwind the position if its TVL falls by a third in a week or it announces a token with no points program.', cost: 'nothing but the log', time: '5 minutes' }
    ].map(stepText);
  }

  // Filtering and sorting.
  function categories() {
    var counts = {};
    DATA.rows.forEach(function (r) { var c = r.category || 'Other'; counts[c] = (counts[c] || 0) + 1; });
    return Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; });
  }
  function chains() {
    var counts = {};
    DATA.rows.forEach(function (r) { (r.chains || []).forEach(function (ch) { counts[ch] = (counts[ch] || 0) + 1; }); });
    return Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; }).slice(0, 14);
  }
  function filteredRows() {
    var q = state.q.trim().toLowerCase();
    var rows = DATA.rows.filter(function (r) {
      if (state.category !== 'all' && (r.category || 'Other') !== state.category) return false;
      if (state.chain !== 'all' && !(r.chains || []).indexOf(state.chain) >= 0) return false;
      if (state.growing && !(r.change_7d !== null && r.change_7d > 0)) return false;
      if (state.watchlist && !r.watchlist) return false;
      if (q && r.name.toLowerCase().indexOf(q) < 0 && r.slug.toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
    var key = state.sort;
    var dir = state.dir;
    rows.sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'change') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? -1 : a.age_days; bv = b.age_days === null ? -1 : b.age_days; }
      else if (key === 'implied') { av = a.implied_value_usd; bv = b.implied_value_usd; }
      else { av = a.rank; bv = b.rank; }
      if (av < bv) return -dir;
      if (av > bv) return dir;
      return a.rank - b.rank;
    });
    return rows;
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' },
        el('span', { class: 'mark' }),
        el('div', null,
          el('div', { class: 'brand-name', text: 'Token Radar · ' + DATA.model_version }),
          el('h1', null, 'Pre-token protocols, ', el('span', { text: 'ranked by what a launch would be worth.' }))
        )
      ),
      el('div', { class: 'top-meta' },
        el('span', null, 'Snapshot ', el('b', { text: DATA.as_of })),
        el('span', null, 'Floor ', el('b', { text: fmtUsd(DATA.floor_usd) })),
        el('span', null, 'Watchlist ', el('b', { text: String(DATA.watchlist_size) }))
      )
    );
  }
  function lede() {
    var total = DATA.rows.reduce(function (n, r) { return n + r.implied_value_usd; }, 0);
    return el('div', { class: 'lede' },
      el('p', null, 'Every protocol below ', el('b', { text: 'records no token' }), ' in the snapshot and is not a wrapped, staked or bridged product of one that trades. Each is scored by the market’s own multiples, its seven-day growth, how long it has run with no token, and how many chains it spans — then ranked by the implied value of the token it may one day issue.'),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('b', { text: String(DATA.board_size) }), el('span', { text: 'protocols ranked' })),
        el('div', { class: 'fact' }, el('b', { text: String(DATA.watchlist_size) }), el('span', { text: 'on the watchlist, all covered' })),
        el('div', { class: 'fact' }, el('b', { text: fmtUsd(total) }), el('span', { text: 'total implied value' })),
        el('div', { class: 'fact' }, el('b', { text: fmtMult(DATA.overall_multiple) }), el('span', { text: 'market multiple, all live tokens' }))
      )
    );
  }
  function controls() {
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name or slug…', value: state.q, 'aria-label': 'Search protocols' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var cat = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      [el('option', { value: 'all', text: 'All categories' })].concat(categories().map(function (c) { return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); })));
    cat.addEventListener('change', function () { state.category = cat.value; writeHash(); render(); });
    var ch = el('select', { id: 'chain', 'aria-label': 'Filter by chain' },
      [el('option', { value: 'all', text: 'All chains' })].concat(chains().map(function (c) { return el('option', { value: c, text: c, selected: c === state.chain ? 'selected' : null }); })));
    ch.addEventListener('change', function () { state.chain = ch.value; writeHash(); render(); });
    var grow = el('input', { type: 'checkbox', id: 'growing', checked: state.growing ? 'checked' : null });
    grow.addEventListener('change', function () { state.growing = grow.checked; writeHash(); render(); });
    var wl = el('input', { type: 'checkbox', id: 'watchlist', checked: state.watchlist ? 'checked' : null });
    wl.addEventListener('change', function () { state.watchlist = wl.checked; writeHash(); render(); });
    var tabs = el('div', { class: 'tabs', role: 'group', 'aria-label': 'Board or live tokens' },
      el('button', { type: 'button', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token board', onclick: function () { state.tab = 'pre-token'; writeHash(); render(); } }),
      el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Already trading', onclick: function () { state.tab = 'live'; writeHash(); render(); } })
    );
    var clear = el('button', { class: 'button', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; state.growing = false; state.watchlist = false; writeHash(); render(); } });
    var rows = filteredRows();
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), cat),
      el('div', { class: 'field' }, el('label', { for: 'chain', text: 'Chain' }), ch),
      el('label', { class: 'check', for: 'growing' }, grow, ' Growing only'),
      el('label', { class: 'check', for: 'watchlist' }, wl, ' Watchlist only'),
      tabs, clear,
      el('span', { class: 'count', text: state.tab === 'pre-token' ? ('Showing ' + rows.length + ' of ' + DATA.board_size + ' protocols') : (DATA.live_size + ' live tokens, by market cap') })
    );
  }
  function sortHead(label, key) {
    var th = el('th', { 'aria-sort': state.sort === key ? (state.dir === -1 ? 'descending' : 'ascending') : null },
      el('button', { type: 'button', text: label, onclick: function () {
        if (state.sort === key) state.dir = -state.dir;
        else { state.sort = key; state.dir = key === 'name' ? 1 : -1; }
        render();
      } }));
    return th;
  }
  function boardTable() {
    var rows = filteredRows();
    var top = DATA.rows[0] ? DATA.rows[0].implied_value_usd : 1;
    var table = el('table', null,
      el('thead', null, el('tr', null,
        sortHead('#', 'rank'),
        sortHead('Protocol', 'name'),
        el('th', { text: 'Chains' }),
        sortHead('TVL', 'tvl'),
        sortHead('7d', 'change'),
        sortHead('Age', 'age'),
        sortHead('Implied value', 'implied')
      )),
      el('tbody', null, rows.map(function (r) {
        var pct = el('span', { class: r.change_7d !== null && r.change_7d > 0 ? 'pos' : (r.change_7d !== null && r.change_7d < 0 ? 'neg' : ''), text: fmtPct(r.change_7d) });
        var bar = el('span', { class: 'bar' }, el('i', { style: 'width:' + Math.max(2, Math.round((r.implied_value_usd / top) * 100)) + '%' }));
        return el('tr', { 'data-selected': state.selected === r.slug ? 'true' : null, onclick: function () { openDetail(r.slug); } },
          el('td', { class: 'num', text: String(r.rank) }),
          el('td', { class: 'name' }, el('b', null, r.name, r.watchlist ? el('span', { class: 'badge', text: 'WATCHLIST' }) : null), el('span', { class: 'sub', text: (r.category || 'Other') + ' · ' + r.slug })),
          el('td', { class: 'sub', text: (r.chains || []).slice(0, 3).join(', ') + ((r.chains || []).length > 3 ? ' +' + ((r.chains || []).length - 3) : '') }),
          el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
          el('td', { class: 'num' }, pct),
          el('td', { class: 'num', text: fmtAge(r.age_days) }),
          el('td', { class: 'num' }, el('b', { text: fmtUsd(r.implied_value_usd) }), bar)
        );
      }))
    );
    if (rows.length === 0) return el('div', { class: 'panel' }, el('div', { class: 'empty', text: 'No protocol matches these filters.' }));
    return el('div', { class: 'panel' }, table);
  }
  function liveTable() {
    return el('div', { class: 'panel' }, el('table', null,
      el('thead', null, el('tr', null,
        el('th', { text: 'Protocol' }), el('th', { text: 'Chains' }), el('th', { text: 'TVL' }), el('th', { text: 'Market cap' }), el('th', { text: 'Mcap / TVL' }), el('th', { text: '7d' })
      )),
      el('tbody', null, DATA.live.map(function (r) {
        var ratio = r.tvl_usd > 0 && r.mcap_usd !== null ? (r.mcap_usd / r.tvl_usd) : null;
        return el('tr', null,
          el('td', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' · ' + r.slug })),
          el('td', { class: 'sub', text: (r.chains || []).slice(0, 3).join(', ') }),
          el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
          el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
          el('td', { class: 'num', text: ratio === null ? 'n/a' : fmtMult(ratio) }),
          el('td', { class: 'num' }, el('span', { class: r.change_7d !== null && r.change_7d > 0 ? 'pos' : (r.change_7d !== null && r.change_7d < 0 ? 'neg' : ''), text: fmtPct(r.change_7d) }))
        );
      }))
    ));
  }
  function modelPanel() {
    var m = DATA.model;
    var formula = 'implied = TVL × category multiple × growth × maturity × breadth, capped at ' + fmtUsd(DATA.max_live_mcap_usd) + ', the biggest market cap that actually trades here.';
    return el('section', { class: 'model' },
      el('h2', { text: 'How the value is worked out' }),
      el('p', null, 'Model ', el('b', { text: DATA.model_version }), ': ', el('code', { text: formula })),
      el('p', null, 'The category multiple is the median market-cap-to-TVL ratio of the live-token protocols in that category, read out of this snapshot — at least ' + m.min_category_sample + ' of them, else the overall median of ' + fmtMult(DATA.overall_multiple) + '. Growth is the seven-day TVL change clamped to ' + m.growth_floor + '% … +' + m.growth_cap + '% at half weight. Maturity runs from ' + m.maturity_floor + ' for a new protocol to ' + (m.maturity_floor + m.maturity_range) + ' at ' + m.maturity_days + ' days. Breadth adds ' + (m.breadth_step * 100) + '% per extra chain, up to ' + (m.breadth_step * m.breadth_max_extra_chains * 100) + '%.'),
      el('h3', { text: 'The market’s own multiples, by category' }),
      el('table', null,
        el('thead', null, el('tr', null, el('th', { text: 'Category' }), el('th', { text: 'Live tokens' }), el('th', { text: 'Multiple' }))),
        el('tbody', null, DATA.multiples.map(function (x) {
          return el('tr', null,
            el('td', { text: x.category }),
            el('td', { class: 'num', text: String(x.sample) }),
            el('td', { class: 'num', text: fmtMult(x.multiple) })
          );
        }))
      ),
      el('p', null, 'Categories with fewer than ' + m.min_category_sample + ' live tokens take the overall median. Multiples are clamped to ' + fmtMult(m.multiple_floor) + ' … ' + fmtMult(m.multiple_cap) + '.')
    );
  }
  function foot() {
    return el('div', { class: 'foot' },
      el('p', null, 'Source: the snapshot’s own record — DefiLlama’s public protocol list, fetched ' + DATA.as_of + '. A protocol “records no token” when its DefiLlama record carries none; that is not proof it has none. Implied values are this radar’s estimates, never prices, and never a prediction that a token will be issued, or when.'),
      el('p', null, 'Farm plans are starting points, not advice: check the protocol’s own pages before you move funds, and never pay anyone to claim an airdrop.')
    );
  }
  function openDetail(slug) {
    var row = null;
    DATA.rows.forEach(function (r) { if (r.slug === slug) row = r; });
    if (!row) return;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    var steps = farmSteps(row);
    var recomputed = impliedOf(row);
    var why = 'Rank ' + row.rank + ' of ' + DATA.board_size + ': ' + fmtUsd(row.tvl_usd) + ' of TVL' +
      (row.change_7d !== null && row.change_7d > 0 ? ', growing ' + fmtPct(row.change_7d) + ' in seven days' : (row.change_7d !== null && row.change_7d < 0 ? ', down ' + fmtPct(row.change_7d) + ' in seven days' : '')) +
      ', running ' + fmtAge(row.age_days) + ' with no token on record, across ' + (row.chains ? row.chains.length : 0) + ' chain' + ((row.chains ? row.chains.length : 0) === 1 ? '' : 's') + '.';
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'brand-name', text: 'Rank ' + row.rank + ' of ' + DATA.board_size + (row.watchlist ? ' · Watchlist' : '') }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') + ' · listed ' + (row.listed_at || 'date unknown') })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Implied value' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'TVL' }), el('b', { class: 'num', text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', { text: 'Seven-day growth' }), el('b', { class: 'num', text: fmtPct(row.change_7d) })),
        el('div', null, el('span', { text: 'Age with no token' }), el('b', { class: 'num', text: fmtAge(row.age_days) })),
        el('div', null, el('span', { text: 'Chains' }), el('b', { class: 'num', text: String(row.chains ? row.chains.length : 0) })),
        el('div', null, el('span', { text: 'Category multiple (' + (row.category || 'Other') + (row.category_sample > 0 ? ', n=' + row.category_sample : ', overall median') + ')' }), el('b', { class: 'num', text: fmtMult(row.category_multiple) })),
        el('div', null, el('span', { text: 'Growth multiplier' }), el('b', { class: 'num', text: fmtMult(growthMultOf(row)) })),
        el('div', null, el('span', { text: 'Maturity multiplier' }), el('b', { class: 'num', text: fmtMult(maturityMultOf(row)) })),
        el('div', null, el('span', { text: 'Breadth multiplier' }), el('b', { class: 'num', text: fmtMult(breadthMultOf(row)) })),
        el('div', { class: 'total' }, el('span', { text: 'Implied value' }), el('b', { class: 'num', text: fmtUsd(row.implied_value_usd) }))
      ),
      el('p', { class: 'sub why', text: why }),
      el('p', { class: 'sub', text: 'Model ' + DATA.model_version + ': the page recomputes this row as ' + fmtUsd(recomputed) + (recomputed === row.implied_value_usd ? ', the same number board.json carries.' : ', which differs from the board: the data would be stale.') + ' This is an estimate, not a price.' })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan' }),
      el('ol', { class: 'steps' }, steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
      }))
    ));
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('tab')) state.tab = params.get('tab');
    if (params.get('growing') === '1') state.growing = true;
    if (params.get('watchlist') === '1') state.watchlist = true;
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.selected) params.set('p', state.selected);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.tab !== 'pre-token') params.set('tab', state.tab);
    if (state.growing) params.set('growing', '1');
    if (state.watchlist) params.set('watchlist', '1');
    var next = params.toString();
    var url = next ? '#' + next : window.location.pathname + window.location.search;
    window.history.replaceState(null, '', url);
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(lede());
    shell.appendChild(controls());
    shell.appendChild(state.tab === 'pre-token' ? boardTable() : liveTable());
    if (state.tab === 'pre-token') shell.appendChild(modelPanel());
    shell.appendChild(foot());
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();

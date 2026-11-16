# makefun-token-radar-01

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/Glauciky/makefun-token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/Glauciky/makefun-token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Token Radar (radar-2): every pre-token protocol in the sealed DefiLlama snapshot, ranked by the implied value of the token it may one day issue. Each protocol is scored from the market's own multiples — the median market-cap-to-TVL ratio of the live-token protocols in its category, read out of the snapshot itself — its seven-day TVL growth, how long it has run with no token, and how many chains it spans. The board covers the whole watchlist plus every other protocol that passes the same pre-token test, and every row carries a seven-step farm plan with costs and times. The dashboard shows the board, a detail view for each protocol with its value breakdown, filters, and the live-token protocols kept apart at their market values.

## Run it

```sh
node main.ts --input <path-to-snapshot.json> --output out
```

The program reads the sealed snapshot, writes the ranked board to `out/board.json`, the dashboard's data to `out/data.js`, copies `dashboard/` and `screenshots/` into `out/`, and writes `out/dossier.json`. Node.js 22.18 or later, standard library only, no network.

---

<sub>Entered on [make.fun](https://make.fun/?ref=hst5m5ez&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>

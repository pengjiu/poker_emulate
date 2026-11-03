# Weighted ranges, decision calculations and external strategy data

These additions remain optional fields of a decision-bound `scene.analysis` item. They use the same rule engine, public node, review stamp and media evidence checks as the existing analysis canvas. Updating a range, calculation setting, tournament assumption or imported strategy invalidates the material review. Changes to rake, antes, units or the public action history invalidate the decision review.

## Weighted range input

```js
{
  id: 'decision-study',
  node: {beatId: 'facing-bet'},
  title: {'zh-CN': '范围与价格', 'en-US': 'Range and price', 'ja-JP': 'レンジと価格'},
  range: {
    seat: 'villain',
    entries: [
      {hand: 'AKs', weight: 0.5, actions: {call: 0.7, raise: 0.3}},
      {hand: 'QcQd', weight: 1, actions: {call: 1}, equity: 0.65,
       ev: {call: 2.3, raise: 1.1}}
    ]
  },
  metrics: ['spr', 'equity', 'callEV'],
  equityOptions: {method: 'auto', samples: 2048, seed: 42}
}
```

Existing `range.groups` and `calculation:'potOdds'` continue to work. Groups are illustrative and may overlap; weighted `entries` cannot overlap. A hand is a pair (`QQ`), suited/offsuit class (`AKs`, `AKo`), both (`AK`) or exact combination (`AsKd`). The optional weight defaults to 1 and is the inclusion probability **of each physical combination**, not the hand's percentage of the whole range. Weights and action frequencies are in [0,1]; each supplied action distribution sums to one. Optional `equity` and `ev` are author/external-source inputs, not automatically calculated strategy. Chip EV uses the scene unit (`BB` or `chips`).

The compiled `range` contains:

- `matrix`: all 169 cells, in conventional A–2 order, pairs diagonal, suited above and offsuit below. Each cell has `hand,row,column,category,combinationCount,availableCombinations,weight,weightedCount,rangeShare`, plus `actions,equity,ev` only when the positive-weight rows provide complete data for that metric.
- `combos`: unblocked explicit combinations with `cards,hand,category,weight,probability`, optional `actions,equity,ev`, and `madeHand` on flop/turn/river using the shared rule evaluator.
- `weightedCount`, `combinationCount`, `blockedCount`, `coverage:'weighted-assumption'` and explicit metric `units`.

`weight` is included mass / all publicly available combinations in a cell. `rangeShare` and combo `probability` are fractions of the specified weighted range. They do not claim that all possible opponent hands were modeled. Unrevealed opponents' actual cards do not block the analysis. `filterRange` preserves original probabilities and returns `shareOfOriginalRange`; filtering never silently normalizes a subset to 100%.

## Calculations

`metrics` accepts any distinct subset of `spr,equity,outs,callEV`. Results are `analysis.metrics`, an array of `{kind,applicable,value,unit,...details}`. Inapplicable requested calculations produce a blocking structured issue with the actual reason.

| Metric | Definition and valid domain |
| --- | --- |
| `spr` | Remaining effective stack / current gross pot. Multiway results include one ratio per opponent; the headline uses the deepest live opponent. Requires a positive unawarded pot. |
| `equity` | Heads-up showdown pot share of known hero cards against the explicit opponent weighted range. Future community cards are uniformly dealt without replacement; no future strategy is assumed. Wins/ties/losses and exact/sample metadata are returned. |
| `outs` | Flop/turn next-card classifications against the weighted range. Clean cards lead every still-possible opposing combination at the next card; dirty cards improve average pot share without guaranteeing a win. Flop results explicitly warn that river redraws remain. Card probabilities account for opponent card removal. |
| `callEV` | Incremental terminal river call EV relative to folding now: equity × net contestable pot after the actual call − actual call cost. Requires two live players, one shared pot and no remaining betting. Rake comes from the engine, including unmatched-bet refunds. |

The old price card now uses the same net-pot rule. It retains its old output shape for existing no-rake projects; raked pots add `grossTotal,rake`, and explicit chip-denominated scenes add `unit`.

Equity enumeration is exact on the river. `auto` enumerates at most 20,000 possible outcomes, otherwise samples; an explicit exact request is capped at 100,000 outcomes. Sampling supports 100–100,000 samples, defaults to 2,048, and uses a stored 32-bit seed. The result reports the method, sample count, seed, standard error and a conservative 95% bounded-score interval under the random sampling assumption. It is not a solver, a strategy frequency or a precision guarantee beyond the declared inputs. A small bounded computation cache changes cost, not outputs.

## External solver JSON

`solverRequest(scene,node)` exports the public input context and decision hash. It contains no hidden opponent cards or future actions. An external adapter supplies this normalized payload:

```js
{
  version: 1,
  decision: /* exact solverRequest(...).decision */,
  // Alternatively decisionHash from the exported request, or both.
  model: {
    game: 'NLHE', units: 'BB', rake: null,
    algorithm: 'Named external solver and version',
    actions: [{id:'fold',type:'fold'}, {id:'call',type:'call'}],
    accuracy: {metric:'exploitability',value:0.01,unit:'BB/hand'}
  },
  strategy: {
    seat:'hero',
    entries:[{hand:'AQs',weight:1,actions:{fold:0.2,call:0.8},
              equity:0.55,ev:{fold:0,call:1.5}}]
  }
}
```

`importSolverAnalysis(directory,scene,item,source)` accepts `{data:payload}`, `{path:absoluteJsonPath}`, or an existing project-relative `evidence/...` string. It validates the public node, actor, units, rake, legal action sizes and strategy probability columns. It copies immutable bytes into `evidence/solver-<sha256>.json` and returns the updated item without a review stamp. The public `analysis.importSolver` command calls this helper; the author then explicitly confirms the material. No author computes a fingerprint or audio duration by hand.

The internal item stores `solver:{data,boundDecisionHash}`. A later decision change cannot be approved away with `analysis.confirm`: a matching external result must be imported. At media validation, both exact attachment bytes and parsed JSON must match the embedded strategy. A source link or an unrelated file cannot certify it. Imported result checks prove identity and integrity; optimality, abstraction quality and the external accuracy metric remain attributed to their source.

The normalized format is deliberately solver-neutral; proprietary binary formats require an exporter that writes this JSON. Model rake is either `null` or `{rate,cap,noFlopNoDrop,minPot?}` in the scene's chip unit. Optional `model.ranges:[{seat,entries}]` records the weighted input ranges. The actor's strategy must cover exactly its declared input weights; a teaching range for the same seat must match the imported model. If an input range is omitted, the output lists it in `missingInputRanges` instead of claiming a complete reproduction of every solver input. No automatic full-game solver is claimed.

## Tournament ICM

```js
tournament: {
  unit:'USD', payouts:[50,30,20],
  otherStacks:[{id:'offtable',stack:50}],
  outcomes:[
    {id:'win',label:{'zh-CN':'假设赢','en-US':'Win assumption','ja-JP':'勝利の仮定'},
     probability:0.5,
     stacks:[{id:'hero',stack:50},{id:'villain',stack:0},{id:'offtable',stack:50}]},
    {id:'lose',label:{'zh-CN':'假设输','en-US':'Loss assumption','ja-JP':'敗北の仮定'},
     probability:0.5,
     stacks:[{id:'hero',stack:0},{id:'villain',stack:50},{id:'offtable',stack:50}]}
  ]
}
```

Table stacks are read from the node; `otherStacks` only adds explicitly identified off-table players. At an unsettled node the baseline is remaining chips plus each player's own current-hand contribution and recorded ante, not an assumed award of the pending pot. Unassigned dead money is rejected because it cannot be reconstructed per player. The displayed baseline explains this. At a settled node it uses actual final stacks. Each optional outcome is labeled a hypothesis and must preserve the same players and total chips. Its supplied probability distribution must sum to one. Cash pot rake is rejected in ICM mode.

`analysis.tournament` exposes per-player finish probabilities, ICM prize equity, chip-chop comparison, payout ladder and assumptions. Outcome results distinguish chip delta (scene unit) from prize-equity delta (the named prize unit). The exact subset-state algorithm supports 1–16 players; zero-stack players share tied bottom places explicitly. It models equal future skill and ignores position, future blind obligations, bounties and deal adjustments. These limitations remain visible instead of representing ICM as an exact tournament-win predictor.

## Verification and primary references

`tests/advanced-analysis.test.mjs` checks blocker privacy, weighted normalization, exact river/tie and turn-draw arithmetic, deterministic sampling and work limits, actual rake and units, ICM symmetry/prize conservation/elimination, decision mismatch and attachment mismatch. Existing analysis and evidence checks remain unchanged.

- [GTO Wizard study mode](https://help.gtowizard.com/study-mode/) separates strategy frequencies, equity, EV and range weights; this contract preserves those distinctions.
- [GTO Wizard breakdown definitions](https://help.gtowizard.com/breakdown-tab/) distinguishes range share, action performance and representation within an action.
- [PokerStars ICM introduction](https://www.pokerstars.com/poker/learn/lesson/icm-and-its-impact-on-tournaments/) identifies stacks and the payout structure as model inputs.

The mathematical tests validate the implemented assumptions; external strategy truth and real learner outcomes require their own evidence.

Scene-derived SPR, equity, outs and call EV require the hero still to be live. A folded hero cannot claim a share of the remaining pot. Explicit alternative-hand studies may use a separate hypothetical node or the independent `equityAgainstRange` calculation.

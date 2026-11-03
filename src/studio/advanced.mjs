import {esc} from '../client/render.mjs';

const dictionary = {
  tools:['教学制作','Teaching tools','教材制作'], analysis:['分析资料与范围','Analysis and ranges','分析とレンジ'], ranges:['范围展示','Range display','レンジ表示'], solver:['导入求解结果','Import solver result','解析結果を読み込む'], artwork:['画板与镜头','Drawing and camera','描画とカメラ'], comparison:['路线对照','Compare routes','ライン比較'], course:['课程目标与术语','Course and terminology','コースと用語'], sound:['声音后期','Sound mix','音声ミックス'], delivery:['交付版本','Delivery versions','出力バージョン'],
  title:['标题','Title','タイトル'], objective:['学习目标','Learning objective','学習目標'], assumptions:['范围假设','Range assumptions','レンジの仮定'], conditions:['适用条件','Conditions','適用条件'], takeaway:['判断方法与结论','Method and takeaway','判断方法と結論'], node:['分析时点','Decision point','分析時点'], actionIndex:['动作序号（留空表示片段末尾）','Action index (blank: end of passage)','アクション番号（空欄：区間終了）'], player:['范围所属玩家','Range player','レンジの対象'], hand:['手牌 / 组合','Hand / combination','ハンド／組合せ'], weight:['组合权重 0–1','Combo weight 0–1','組合せの重み 0–1'], frequencies:['行动频率（call=0.7,raise=0.3）','Action frequencies (call=0.7,raise=0.3)','頻度（call=0.7,raise=0.3）'], ev:['行动 EV（call=1.2,raise=-0.5）','Action EV (call=1.2,raise=-0.5)','アクション EV（call=1.2,raise=-0.5）'], equity:['权益 0–1','Equity 0–1','エクイティ 0–1'], add:['添加','Add','追加'], remove:['删除','Remove','削除'], calculations:['计算卡','Calculations','計算カード'], rangeHelp:['每行权重作用于该手牌的每个具体组合。行动频率总和须为 1；没有数据时留空。','A weight applies to each physical combo. Action frequencies must sum to 1; leave unknown data blank.','重みは各具体的な組合せに適用されます。頻度の合計は 1。不明な値は空欄にします。'], price:['河牌跟注价格','River call price','リバーのコール価格'], spr:['SPR','SPR','SPR'], outs:['下一张牌的出路','Next-card outs','次のカードのアウト'], callEV:['河牌跟注 EV','River call EV','リバーのコール EV'],
  mode:['展示方式','Display mode','表示形式'], groups:['分组卡片','Groups','グループ'], matrix:['完整范围矩阵','Full range matrix','レンジ全体のマトリクス'], combos:['具体组合','Exact combinations','具体的な組合せ'], metric:['数值口径','Metric','指標'], rangeShare:['占原范围比例','Share of original range','元のレンジに占める割合'], frequency:['行动频率','Action frequency','アクション頻度'], evMetric:['行动 EV','Action EV','アクション EV'], action:['行动名称','Action ID','アクション名'], category:['牌型筛选','Category filter','カテゴリーフィルター'], all:['全部','All','すべて'], pair:['口袋对子','Pocket pairs','ポケットペア'], suited:['同花','Suited','スーテッド'], offsuit:['非同花','Offsuit','オフスート'], minWeight:['最小权重','Minimum weight','最小の重み'], page:['组合页（从 0 开始）','Combo page (starting at 0)','組合せページ（0 から）'],
  noAnalysis:['请先为当前片段创建或选择分析资料。','Create or select analysis for this passage first.','先にこの区間の分析資料を作成・選択してください。'], solverHelp:['先导出当前决定，交给外部求解器适配器；再选择其结果 JSON。导入只核对模型与数据，不证明策略最优。','Export this decision for an external solver adapter, then select its result JSON. Import checks identity and integrity, not optimality.','現在の局面を外部ソルバーへ出力し、結果 JSON を選択します。整合性の検証であり、最適性の証明ではありません。'], exportRequest:['下载求解输入','Download solve input','解析入力をダウンロード'], file:['选择文件','Choose file','ファイルを選択'],
  annotate:['标记','Annotations','注釈'], arrow:['箭头','Arrow','矢印'], circle:['圈画','Circle','円'], label:['短标记','Label','ラベル'], path:['自由线条','Freehand stroke','フリーハンド'], image:['图片','Image','画像'], svg:['静态 SVG','Static SVG','静的 SVG'], from:['起点 / 目标','From / target','始点／対象'], to:['终点','To','終点'], text:['文字','Text','テキスト'], color:['颜色','Color','色'], width:['笔宽','Stroke width','線幅'], drawHelp:['在画布上拖动画线；坐标随横竖版缩放。箭头和圈画优先选择牌张或玩家对象。','Drag to draw. Strokes scale with the frame; prefer semantic card/player targets for arrows and circles.','ドラッグして描画します。矢印や円にはカード・プレイヤーの対象を選ぶと画面サイズに追従します。'], camera:['镜头','Camera','カメラ'], full:['全景','Full frame','全体'], zoom:['放大倍数','Zoom scale','拡大率'], duration:['过渡秒数','Transition seconds','移動秒数'], motion:['动作动画','Action motion','アクションの動き'],
  choices:['同一决定的不同选择','Choices at one decision','同じ局面の選択肢'], changed:['改变条件的对照','Changed conditions','条件を変えた比較'], origin:['共同起点','Origin','起点'], route:['路线','Route','ライン'], scene:['场景','Scene','シーン'], start:['起点资料','Start analysis','開始の分析'], end:['终点资料','End analysis','終了の分析'], compareHelp:['先为每条路线保存起点与终点分析。选择对照必须拥有相同公开历史；条件对照会显示差异。','Save start/end analysis for each route first. Choice comparisons require the same public history; condition comparisons display differences.','各ラインの開始・終了分析を保存してください。選択肢比較は同じ公開履歴が必要です。'],
  prerequisites:['先修知识','Prerequisites','前提知識'], style:['整套表达约定','Course style','コースの表現方針'], episodes:['章节顺序','Episode order','章の順序'], check:['检验题 / 迁移任务','Check / transfer task','確認問題'], terms:['统一术语','Terminology','用語'], term:['术语','Term','用語'], definition:['定义','Definition','定義'], up:['上移','Move up','上へ'], down:['下移','Move down','下へ'],
  entry:['章节入口场景','Episode entry scene','章の入口シーン'], members:['有序场景成员','Ordered scene members','順序付きシーン'], sceneToAdd:['添加场景','Scene to add','追加するシーン'], memberHelp:['成员顺序用于课程编排；入口可以是其中任一场景。选择成员外的入口会追加该场景；删除或替换入口成员时会切换到剩余第一项。','Member order defines the episode sequence; its entry may be any member. Choosing an entry outside the list adds it. Removing or replacing the entry selects the first remaining member.','メンバー順が章の構成順です。入口は任意のメンバーです。リスト外の入口は末尾に追加され、入口の削除・置換時は残りの先頭に切り替わります。'], entryAdded:['已将入口追加到场景成员。','Added the entry to the scene members.','入口をシーンのメンバーに追加しました。'], entryChanged:['入口已切换到剩余第一项。','Entry changed to the first remaining member.','入口を残りの先頭メンバーに変更しました。'],
  concepts:['教学概念','Teaching concepts','学習概念'], conceptId:['概念 ID','Concept ID','概念 ID'], description:['概念说明','Description','概念の説明'], newConcept:['新概念','New concept','新しい概念'], requires:['需要先修','Requires','前提概念'], introduces:['本章引入','Introduces','導入する概念'], recaps:['本章复习','Recaps','復習する概念'], conceptHelp:['章节关系只引用已声明的概念。修改 ID 会同步更新引用；删除前须取消所有章节中的引用。','Episode relations use declared concepts. Renaming an ID updates its references. Clear every episode reference before deleting a concept.','章の関係は宣言済み概念を参照します。ID の変更は参照にも反映されます。概念を削除する前に全章の参照を外してください。'], otherLanguages:['其他语言','Other languages','他の言語'], updateConcepts:['更新概念选项','Update concept options','概念の選択肢を更新'], noConcepts:['先添加概念，即可设置章节关系。','Add a concept to set episode relations.','概念を追加すると章の関係を設定できます。'], invalidConceptId:['概念 ID 不能为空、重复或包含 ::。','Concept IDs must be nonempty, unique, and contain no ::.','概念 ID は空欄・重複・:: を使用できません。'], missingDescription:['每个概念至少需要一种语言的说明。','Each concept needs a description in at least one language.','各概念には少なくとも一言語の説明が必要です。'], conceptInUse:['无法删除，以下章节仍在引用该概念','Cannot delete: these episodes still reference the concept','削除できません。以下の章がまだこの概念を参照しています'],
  effects:['动作音效','Action sounds','アクション効果音'], volume:['音量 0–1','Volume 0–1','音量 0–1'], voiceGain:['人声增益 dB','Voice gain dB','音声ゲイン dB'], duck:['旁白时降低其他声音','Duck other audio under narration','ナレーション中に他の音を下げる'], reduction:['降低 dB','Reduction dB','低減 dB'], normalize:['统一响度','Normalize loudness','ラウドネスを統一'], lufs:['目标 LUFS','Target LUFS','目標 LUFS'], peak:['真峰值 dBTP','True peak dBTP','トゥルーピーク dBTP'], bed:['背景音轨','Background track','背景音'], bedVolume:['背景音量 0–1','Background volume 0–1','背景音量 0–1'], bedStart:['背景音起始秒数','Background start seconds','背景音の開始秒'], loop:['循环背景音轨','Loop background track','背景音をループ'], clearBed:['移除背景音轨','Remove background track','背景音を削除'],
  language:['语言','Language','言語'], aspect:['画幅','Aspect','画面比率'], landscape:['横版','Landscape','横長'], portrait:['竖版','Portrait','縦長'], profile:['画质','Profile','画質'], final:['正式 1080p','Final 1080p','最終 1080p'], draft:['预览 720p','Draft 720p','下書き 720p'], sequence:['当前多手编排','Current sequence','現在のシーケンス'], version:['输出文件名（字母、数字、-、_）','Filename (letters, digits, - and _)','ファイル名（英数字、-、_）'],
  tournament:['赛事 ICM','Tournament ICM','トーナメント ICM'], payouts:['剩余奖金（由高到低，逗号分隔）','Remaining payouts (descending, comma-separated)','残り賞金（降順、カンマ区切り）'], prizeUnit:['奖金单位','Prize unit','賞金の単位'], offTable:['其他桌筹码（每行 玩家=筹码）','Off-table stacks (one player=chips per line)','他テーブル（各行 プレイヤー=チップ）'], outcomes:['假设结果（概率总和为 1）','Hypothetical outcomes (probabilities sum to 1)','仮定した結果（確率の合計は 1）'], probability:['发生概率 0–1','Outcome probability 0–1','結果の確率 0–1'], stacks:['结果筹码（每行 玩家=筹码）','Outcome stacks (one player=chips per line)','結果のチップ（各行 プレイヤー=チップ）'], icmHelp:['本桌筹码从牌局读取。ICM 是明确的等技术模型；不会预测真实选手的未来表现。','Table chips come from the engine. ICM is an equal-skill model, not a forecast of actual players.','このテーブルのチップは局面から取得します。ICM は同等スキルのモデルです。'],
  summary:['当前设置','Current settings','現在の設定'], newAnalysis:['新建分析资料','New analysis','新しい分析'], preserved:['未编辑的语言和高级字段会保留。','Other languages and advanced fields are preserved.','他の言語と詳細フィールドは保持されます。']
};

const languageIndex = locale => locale?.startsWith('zh') ? 0 : locale?.startsWith('ja') ? 2 : 1;
const tr = (ctx, key) => dictionary[key]?.[languageIndex(ctx.locale)] ?? key;
const clone = value => structuredClone(value);
const by = (root, id) => root.querySelector('[data-field="' + id + '"]');
const input = (ctx, key, value = '', extra = '') => `<label>${esc(tr(ctx, key))}<input data-field="${key}" value="${esc(value)}" ${extra}></label>`;
const area = (ctx, key, value = '', rows = 2) => `<label>${esc(tr(ctx, key))}<textarea data-field="${key}" rows="${rows}" style="min-height:64px;height:auto">${esc(value)}</textarea></label>`;
const option = (value, label, chosen) => `<option value="${esc(value)}" ${String(value) === String(chosen) ? 'selected' : ''}>${esc(label)}</option>`;
const select = (ctx, key, choices, value) => `<label>${esc(tr(ctx, key))}<select data-field="${key}">${choices.map(([id, label]) => option(id, label, value)).join('')}</select></label>`;
const toggle = (ctx, key, checked, field = key) => `<label class="voice-scope"><span>${esc(tr(ctx, key))}</span><input type="checkbox" data-field="${field}" ${checked ? 'checked' : ''}></label>`;
const group = content => `<div class="advanced-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px">${content}</div>`;
const button = (ctx, key, attributes) => `<button type="button" ${attributes}>${esc(tr(ctx, key))}</button>`;
const allBeats = scene => [...scene.beats, ...(scene.branches ?? []).flatMap(branch => branch.beats)];
const localized = (old, locale, value) => { const result = {...old}; if (value.trim()) result[locale] = value.trim(); else delete result[locale]; return Object.keys(result).length ? result : undefined; };
const selectedAnalysis = ctx => ctx.scene.analysis?.find(item => item.id === ctx.beat?.presentation?.analysisId);
const id = prefix => prefix + '-' + crypto.randomUUID().slice(0, 8);
const error = message => { throw {code: 'SCHEMA', message}; };

export function advancedMarkup(ctx) {
  if (!ctx.beat) return '';
  const buttons = ['analysis', 'ranges', 'artwork', 'comparison', 'solver', 'course', 'sound', 'delivery'];
  return `<details class="teaching-settings advanced-tools" ${ctx.advancedToolsOpen ? 'open' : ''}><summary>${esc(tr(ctx, 'tools'))}</summary><div class="advanced-actions" style="display:grid;grid-template-columns:1fr 1fr;gap:6px">${buttons.map(key => button(ctx, key, `data-ui="advanced-${key}"`)).join('')}${button(ctx, 'newAnalysis', 'data-ui="advanced-new-analysis"')}</div></details>`;
}

function currentPresentation(ctx) { return clone(ctx.beat.presentation ?? {surface: 'table', focus: [], show: ['range', 'calculation', 'conditions']}); }
const setPresentation = (ctx, value) => ctx.apply([{type: 'presentation.set', sceneId: ctx.scene.id, beatId: ctx.beat.id, value}]);
function analysisRequired(ctx) { const item = selectedAnalysis(ctx); if (!item) error(tr(ctx, 'noAnalysis')); return item; }
function parsePairs(text) {
  if (!text.trim()) return undefined;
  const pairs = text.split(',').map(part => part.trim().split('='));
  if (pairs.some(pair => pair.length !== 2 || !pair[0].trim() || !Number.isFinite(Number(pair[1])))) error('Use name=number pairs.');
  return Object.fromEntries(pairs.map(([name, value]) => [name.trim(), Number(value)]));
}
const pairsText = values => Object.entries(values ?? {}).map(([name, value]) => name + '=' + value).join(', ');

function editAnalysis(ctx, forceNew = false) {
  const old = !forceNew && selectedAnalysis(ctx), material = clone(old || {id: id('analysis'), node: {beatId: ctx.beat.id, ...(Number.isSafeInteger(ctx.current?.actionIndex) ? {actionIndex: ctx.current.actionIndex} : {})}, title: {[ctx.locale]: tr(ctx, 'analysis')}});
  const sceneId = ctx.scene.id, beatId = ctx.beat.id, rows = clone(material.range?.entries ?? []), outcomes = clone(material.tournament?.outcomes ?? []), p = currentPresentation(ctx);
  const fields = ['title', 'objective', 'assumptions', 'conditions', 'takeaway'];
  const body = `<p class="quiet">${esc(tr(ctx, 'preserved'))}</p>${group(fields.map(key => area(ctx, key, material[key]?.[ctx.locale] ?? '')).join(''))}${group(select(ctx, 'node', allBeats(ctx.scene).map(beat => [beat.id, beat.label?.[ctx.locale] ?? beat.id]), material.node.beatId) + input(ctx, 'actionIndex', material.node.actionIndex ?? '', 'type="number" min="0" step="1"'))}<details open><summary>${esc(tr(ctx, 'ranges'))}</summary>${select(ctx, 'player', ctx.scene.start.seats.map(player => [player.id, player.name ?? player.id]), material.range?.seat ?? ctx.scene.start.seats.find(player => player.id !== ctx.scene.start.hero)?.id)}<p class="quiet">${esc(tr(ctx, 'rangeHelp'))}</p><div data-range-rows></div>${button(ctx, 'add', 'data-add-range')}</details><div class="section-label">${esc(tr(ctx, 'calculations'))}</div>${group(toggle(ctx, 'price', material.calculation === 'potOdds') + ['spr', 'equity', 'outs', 'callEV'].map(kind => toggle(ctx, kind, material.metrics?.includes(kind), 'metric-' + kind)).join(''))}<details><summary>${esc(tr(ctx, 'tournament'))}</summary>${toggle(ctx, 'tournament', !!material.tournament)}${group(input(ctx, 'payouts', material.tournament?.payouts?.join(', ') ?? '50, 30, 20') + input(ctx, 'prizeUnit', material.tournament?.unit ?? 'USD'))}${area(ctx, 'offTable', (material.tournament?.otherStacks ?? []).map(player => player.id + '=' + player.stack).join('\n'))}<p class="quiet">${esc(tr(ctx, 'icmHelp'))}</p></details>`;
  const layer = ctx.modal(tr(ctx, 'analysis'), body + `<details><summary>${esc(tr(ctx, 'outcomes'))}</summary><div data-icm-outcomes></div>${button(ctx, 'add', 'data-add-outcome')}</details>`, async root => {
    readRows();
    for (const key of fields) { const value = localized(material[key], ctx.locale, by(root, key).value); if (value) material[key] = value; else delete material[key]; }
    material.node = {beatId: by(root, 'node').value}; if (by(root, 'actionIndex').value !== '') material.node.actionIndex = Number(by(root, 'actionIndex').value);
    if (rows.length) material.range = {...material.range, seat: by(root, 'player').value, entries: rows};
    else if (material.range?.groups) { delete material.range.entries; material.range.seat = by(root, 'player').value; }
    else delete material.range;
    if (by(root, 'price').checked) material.calculation = 'potOdds'; else delete material.calculation;
    const metrics = ['spr', 'equity', 'outs', 'callEV'].filter(kind => by(root, 'metric-' + kind).checked); if (metrics.length) material.metrics = metrics; else delete material.metrics;
    if (by(root, 'tournament').checked) {
      const otherStacks = by(root, 'offTable').value.split('\n').map(line => line.trim()).filter(Boolean).map(line => { const [id, amount, extra] = line.split('='); if (extra !== undefined || !id || !Number.isFinite(Number(amount))) error('Use player=chips on each line.'); return {id: id.trim(), stack: Number(amount)}; });
      material.tournament = {...material.tournament, unit: by(root, 'prizeUnit').value.trim(), payouts: by(root, 'payouts').value.split(',').map(value => Number(value.trim()))};
      if (otherStacks.length) material.tournament.otherStacks = otherStacks; else delete material.tournament.otherStacks;
      readOutcomes(); if (outcomes.length) material.tournament.outcomes = outcomes; else delete material.tournament.outcomes;
    } else delete material.tournament;
    await ctx.apply([{type: 'analysis.put', sceneId, value: material}, {type: 'presentation.set', sceneId, beatId, value: {...p, analysisId: material.id, surface: 'analysis', show: [...new Set([...(p.show ?? []), ...(metrics.length || material.tournament ? ['metrics'] : [])])]}}]);
  });
  function readRows() { layer.querySelectorAll('[data-range-row]').forEach(row => { const at = Number(row.dataset.rangeRow), original = rows[at], next = {...original, hand: by(row, 'hand').value.trim(), weight: Number(by(row, 'weight').value)}; for (const [field, key] of [['actions', 'frequencies'], ['ev', 'ev']]) { const value = parsePairs(by(row, key).value); if (value) next[field] = value; else delete next[field]; } if (by(row, 'equity').value !== '') next.equity = Number(by(row, 'equity').value); else delete next.equity; rows[at] = next; }); }
  function draw() { layer.querySelector('[data-range-rows]').innerHTML = rows.map((entry, at) => `<fieldset data-range-row="${at}" style="border:1px solid #40515e;border-radius:8px;margin:8px 0;padding:10px">${group(input(ctx, 'hand', entry.hand) + input(ctx, 'weight', entry.weight ?? 1, 'type="number" min="0" max="1" step="0.01"') + input(ctx, 'equity', entry.equity ?? '', 'type="number" min="0" max="1" step="0.01"'))}${group(input(ctx, 'frequencies', pairsText(entry.actions)) + input(ctx, 'ev', pairsText(entry.ev)))}${button(ctx, 'remove', `data-remove-range="${at}"`)}</fieldset>`).join(''); }
  layer.querySelector('[data-add-range]').onclick = () => { readRows(); rows.push({hand: '', weight: 1}); draw(); };
  layer.querySelector('[data-range-rows]').onclick = event => { const remove = event.target.closest('[data-remove-range]'); if (remove) { readRows(); rows.splice(Number(remove.dataset.removeRange), 1); draw(); } }; draw();
  function readOutcomes() {
    layer.querySelectorAll('[data-icm-outcome]').forEach(row => {
      const outcome = outcomes[Number(row.dataset.icmOutcome)]; outcome.label = localized(outcome.label, ctx.locale, by(row, 'title').value); outcome.probability = Number(by(row, 'probability').value);
      outcome.stacks = by(row, 'stacks').value.split('\n').map(line => line.trim()).filter(Boolean).map(line => { const [id, amount, extra] = line.split('='); if (extra !== undefined || !id || !Number.isFinite(Number(amount))) error('Use player=chips on each line.'); return {id: id.trim(), stack: Number(amount)}; });
    });
  }
  function drawOutcomes() { layer.querySelector('[data-icm-outcomes]').innerHTML = outcomes.map((outcome, at) => `<fieldset data-icm-outcome="${at}" style="margin:8px 0;padding:10px;border:1px solid #40515e;border-radius:8px">${group(input(ctx, 'title', outcome.label?.[ctx.locale] ?? '') + input(ctx, 'probability', outcome.probability, 'type="number" min="0" max="1" step="0.01"'))}${area(ctx, 'stacks', outcome.stacks.map(player => player.id + '=' + player.stack).join('\n'), 4)}${button(ctx, 'remove', `data-remove-outcome="${at}"`)}</fieldset>`).join(''); }
  layer.querySelector('[data-add-outcome]').onclick = () => {
    readOutcomes(); const state = ctx.current?.presentation?.analysis?.decision ?? ctx.current?.state, divisor = state?.unit ? 1 : 100;
    const stacks = state ? state.seats.map(player => ({id: player.id, stack: (player.stack + (state.settled ? 0 : player.contributed + (state.antePaid?.[player.id] ?? 0))) / divisor})) : ctx.scene.start.seats.map(player => ({id: player.id, stack: player.stack + (player.contributed ?? 0)}));
    outcomes.push({id: id('outcome'), label: {[ctx.locale]: tr(ctx, 'outcomes')}, probability: outcomes.length ? .5 : 1, stacks: [...stacks, ...(material.tournament?.otherStacks ?? [])]}); drawOutcomes();
  };
  layer.querySelector('[data-icm-outcomes]').onclick = event => { const remove = event.target.closest('[data-remove-outcome]'); if (remove) { readOutcomes(); outcomes.splice(Number(remove.dataset.removeOutcome), 1); drawOutcomes(); } }; drawOutcomes();
}

function editRangeView(ctx) {
  analysisRequired(ctx); const p = currentPresentation(ctx), value = p.rangeView ?? {mode: 'matrix', metric: 'weight'};
  ctx.modal(tr(ctx, 'ranges'), group(select(ctx, 'mode', ['groups', 'matrix', 'combos'].map(key => [key, tr(ctx, key)]), value.mode) + select(ctx, 'metric', ['weight', 'rangeShare', 'frequency', 'equity', 'ev'].map(key => [key, tr(ctx, key === 'ev' ? 'evMetric' : key)]), value.metric ?? 'weight') + input(ctx, 'action', value.action ?? '') + input(ctx, 'hand', value.hand ?? '') + select(ctx, 'category', ['', 'pair', 'suited', 'offsuit'].map(key => [key, tr(ctx, key || 'all')]), value.filter?.category ?? '') + input(ctx, 'minWeight', value.filter?.minWeight ?? 0, 'type="number" min="0" max="1" step="0.01"') + input(ctx, 'page', value.page ?? 0, 'type="number" min="0" step="1"')), async layer => {
    const next = {...value, mode: by(layer, 'mode').value, metric: by(layer, 'metric').value, page: Number(by(layer, 'page').value), filter: {...value.filter, minWeight: Number(by(layer, 'minWeight').value)}};
    for (const key of ['action', 'hand']) { const text = by(layer, key).value.trim(); if (text) next[key] = text; else delete next[key]; }
    const category = by(layer, 'category').value; if (category) next.filter.category = category; else delete next.filter.category;
    await setPresentation(ctx, {...p, rangeView: next, show: [...new Set([...(p.show ?? []), 'range'])]});
  });
}

const download = (name, content, type = 'application/json') => { const a = document.createElement('a'), url = URL.createObjectURL(new Blob([content], {type})); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); };
const fileData = file => new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(reader.error); reader.readAsDataURL(file); });
function importSolver(ctx) {
  const material = analysisRequired(ctx), sceneId = ctx.scene.id, analysisId = material.id;
  const layer = ctx.modal(tr(ctx, 'solver'), `<p>${esc(tr(ctx, 'solverHelp'))}</p>${button(ctx, 'exportRequest', 'data-export-solver')}<label>${esc(tr(ctx, 'file'))}<input type="file" accept="application/json,.json" data-field="file"></label>`, async root => {
    const file = by(root, 'file').files[0]; if (!file) error(tr(ctx, 'file'));
    const data = JSON.parse(await file.text()); await ctx.apply([{type: 'analysis.importSolver', sceneId, analysisId, source: {data}}]);
  });
  layer.querySelector('[data-export-solver]').onclick = async () => { try { const value = await ctx.rpc('export', {kind: 'solver', sceneId, analysisId}); download('river-solver-request.json', JSON.stringify(value, null, 2)); } catch (error) { ctx.notify(error); } };
}

function anchors(ctx) {
  const state = ctx.current?.presentation?.analysis?.decision ?? ctx.current?.state ?? ctx.scene.start;
  const visibleHands = state.seats.filter(player => player.id === state.hero || state.revealed?.includes(player.id)).flatMap(player => player.hole ?? []).filter(Boolean);
  return [['hero', 'Hero'], ['board', 'Board'], ['pot', 'Pot'], ...state.seats.flatMap(player => [['seat:' + player.id, player.name ?? player.id], ['bet:' + player.id, (player.name ?? player.id) + ' · Bet'], ['stack:' + player.id, (player.name ?? player.id) + ' · Stack']]), ...[...new Set([...state.board, ...visibleHands])].map(card => ['card:' + card, card]), ['calculation', tr(ctx, 'calculations')]];
}

function editArtwork(ctx) {
  const p = currentPresentation(ctx), annotations = clone(p.annotations ?? []), targets = anchors(ctx), initialCamera = p.camera, m = typeof p.motion === 'object' ? p.motion : {};
  const body = group(select(ctx, 'annotate', ['arrow', 'circle', 'label'].map(key => [key, tr(ctx, key)]), 'arrow') + select(ctx, 'from', targets, 'hero') + select(ctx, 'to', targets, 'board') + input(ctx, 'text') + input(ctx, 'color', '#f9cf64', 'type="color"') + input(ctx, 'width', 3, 'type="number" min="1" max="8" step="1"')) + button(ctx, 'add', 'data-add-mark') + `<div data-mark-list></div><p class="quiet">${esc(tr(ctx, 'drawHelp'))}</p><svg data-drawing viewBox="0 0 1000 562.5" style="width:100%;aspect-ratio:16/9;background:#152832;border:1px solid #617887;touch-action:none;border-radius:8px;cursor:crosshair"></svg><label>${esc(tr(ctx, 'image'))} / SVG<input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml,.svg" data-field="artFile"></label><div class="section-label">${esc(tr(ctx, 'camera'))}</div>${group(select(ctx, 'camera', [['', tr(ctx, 'full')], ...targets], initialCamera?.target ?? '') + input(ctx, 'zoom', initialCamera?.scale ?? 1.5, 'type="number" min="1" max="3" step="0.1"') + input(ctx, 'duration', initialCamera?.duration ?? .45, 'type="number" min="0" max="1.5" step="0.05"'))}${toggle(ctx, 'motion', !!p.motion)}`;
  const layer = ctx.modal(tr(ctx, 'artwork'), body, async root => {
    const target = by(root, 'camera').value, file = by(root, 'artFile').files[0];
    if (file) { const svg = file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg'); annotations.push({id: id('art'), type: svg ? 'svg' : 'image', source: svg ? await file.text() : await fileData(file), box: {x: .6, y: .08, width: .32, height: .3}}); }
    await setPresentation(ctx, {...p, annotations, camera: target ? {target, scale: Number(by(root, 'zoom').value), duration: Number(by(root, 'duration').value)} : null, motion: by(root, 'motion').checked ? {...m, duration: m.duration ?? .45} : false});
  });
  const drawing = layer.querySelector('[data-drawing]'); let stroke = null;
  function draw() {
    layer.querySelector('[data-mark-list]').innerHTML = annotations.map((mark, at) => `<div style="display:flex;gap:8px;align-items:center;margin:5px 0"><span style="flex:1">${esc(tr(ctx, mark.type))} · ${esc(mark.target ?? mark.from ?? mark.id)}${mark.to ? ' → ' + esc(mark.to) : ''}</span>${button(ctx, 'remove', `data-remove-mark="${at}"`)}</div>`).join('');
    drawing.innerHTML = annotations.filter(mark => mark.type === 'path').map(mark => `<polyline points="${mark.points.map(([x, y]) => x * 1000 + ',' + y * 562.5).join(' ')}" stroke="${esc(mark.color ?? '#f9cf64')}" stroke-width="${mark.width ?? 3}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`).join('');
  }
  layer.querySelector('[data-add-mark]').onclick = () => {
    const type = by(layer, 'annotate').value, a = {id: id('mark'), type, color: by(layer, 'color').value, width: Number(by(layer, 'width').value)};
    if (type === 'arrow') { a.from = by(layer, 'from').value; a.to = by(layer, 'to').value; }
    else { a.target = by(layer, 'from').value; if (type === 'label') a.text = {[ctx.locale]: by(layer, 'text').value.trim()}; }
    annotations.push(a); draw();
  };
  layer.querySelector('[data-mark-list]').onclick = event => { const remove = event.target.closest('[data-remove-mark]'); if (remove) { annotations.splice(Number(remove.dataset.removeMark), 1); draw(); } };
  const point = event => { const rect = drawing.getBoundingClientRect(); return [Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)), Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height))]; };
  drawing.onpointerdown = event => { stroke = {id: id('stroke'), type: 'path', color: by(layer, 'color').value, width: Number(by(layer, 'width').value), points: [point(event)]}; drawing.setPointerCapture(event.pointerId); };
  drawing.onpointermove = event => { if (!stroke || stroke.points.length >= 500) return; const next = point(event), prior = stroke.points.at(-1); if (Math.hypot(next[0] - prior[0], next[1] - prior[1]) < .003) return; stroke.points.push(next); draw(); const live = document.createElementNS('http://www.w3.org/2000/svg', 'polyline'); live.setAttribute('points', stroke.points.map(([x, y]) => x * 1000 + ',' + y * 562.5).join(' ')); live.setAttribute('stroke', stroke.color); live.setAttribute('stroke-width', stroke.width); live.setAttribute('fill', 'none'); drawing.append(live); };
  drawing.onpointerup = drawing.onpointercancel = () => { if (stroke?.points.length > 1) annotations.push(stroke); stroke = null; draw(); }; draw();
}

function editComparison(ctx) {
  const material = analysisRequired(ctx), p = currentPresentation(ctx), value = clone(p.comparison ?? {mode: 'choices', origin: {sceneId: ctx.scene.id, analysisId: material.id}, routes: [0, 1].map(() => ({id: id('route'), label: {[ctx.locale]: tr(ctx, 'route')}, sceneId: ctx.scene.id, startAnalysisId: material.id, endAnalysisId: material.id}))});
  const scenes = ctx.snapshot.project.lesson.scenes, sceneOptions = scenes.map(scene => [scene.id, scene.title[ctx.locale] ?? scene.id]);
  const layer = ctx.modal(tr(ctx, 'comparison'), `<p>${esc(tr(ctx, 'compareHelp'))}</p>${select(ctx, 'mode', ['choices', 'conditions'].map(key => [key, tr(ctx, key === 'conditions' ? 'changed' : key)]), value.mode)}<div data-routes></div>${button(ctx, 'add', 'data-add-route')}`, async () => { read(); await setPresentation(ctx, {...p, comparison: value, show: [...new Set([...(p.show ?? []), 'comparison'])]}); });
  function read() { value.mode = by(layer, 'mode').value; layer.querySelectorAll('[data-route]').forEach(row => { const route = value.routes[Number(row.dataset.route)]; route.label = localized(route.label, ctx.locale, by(row, 'title').value); route.sceneId = by(row, 'scene').value; route.startAnalysisId = by(row, 'start').value; route.endAnalysisId = by(row, 'end').value; }); }
  function draw() { layer.querySelector('[data-routes]').innerHTML = value.routes.map((route, at) => { const s = scenes.find(scene => scene.id === route.sceneId), materials = (s?.analysis ?? []).map(item => [item.id, item.title[ctx.locale] ?? item.id]); return `<fieldset data-route="${at}" style="margin:10px 0;border:1px solid #40515e;border-radius:8px;padding:10px">${input(ctx, 'title', route.label?.[ctx.locale] ?? '')}${group(select(ctx, 'scene', sceneOptions, route.sceneId) + select(ctx, 'start', materials, route.startAnalysisId) + select(ctx, 'end', materials, route.endAnalysisId))}${value.routes.length > 2 ? button(ctx, 'remove', `data-remove-route="${at}"`) : ''}</fieldset>`; }).join(''); layer.querySelector('[data-add-route]').disabled = value.routes.length >= 3; }
  layer.querySelector('[data-routes]').onchange = event => { if (event.target.dataset.field === 'scene') { read(); const route = value.routes[Number(event.target.closest('[data-route]').dataset.route)], first = scenes.find(scene => scene.id === route.sceneId)?.analysis?.[0]?.id ?? ''; route.startAnalysisId = first; route.endAnalysisId = first; draw(); } };
  layer.querySelector('[data-routes]').onclick = event => { const button = event.target.closest('[data-remove-route]'); if (button) { read(); value.routes.splice(Number(button.dataset.removeRoute), 1); draw(); } };
  layer.querySelector('[data-add-route]').onclick = () => { read(); if (value.routes.length < 3) value.routes.push({...clone(value.routes[0]), id: id('route')}); draw(); }; draw();
}

function editCourse(ctx) {
  const scenes = ctx.snapshot.project.lesson.scenes, fields = ['title', 'prerequisites', 'objectives', 'style'], relations = ['requires', 'introduces', 'recaps'];
  let value = clone(ctx.snapshot.project.lesson.course ?? {id: id('course'), title: {[ctx.locale]: tr(ctx, 'course')}, episodes: scenes.map(scene => ({id: id('episode'), sceneId: scene.id, objective: {[ctx.locale]: scene.title[ctx.locale] ?? scene.id}}))});
  for (const episode of value.episodes) episode.sceneIds ??= [episode.sceneId];
  const sceneOptions = scenes.map(scene => [scene.id, scene.title[ctx.locale] ?? scene.id]);
  const layer = ctx.modal(tr(ctx, 'course'), `<p class="quiet">${esc(tr(ctx, 'preserved'))}</p><p data-course-notice role="alert" hidden></p>` + group(fields.map(key => area(ctx, key === 'objectives' ? 'objective' : key, value[key]?.[ctx.locale] ?? '')).join('')) + `<h3>${esc(tr(ctx, 'concepts'))}</h3><p class="quiet">${esc(tr(ctx, 'conceptHelp'))}</p><div data-concepts></div>${button(ctx, 'add', 'data-add-concept')} ${button(ctx, 'updateConcepts', 'data-update-concepts')}<h3>${esc(tr(ctx, 'episodes'))}</h3><p class="quiet">${esc(tr(ctx, 'memberHelp'))}</p><div data-episodes></div>${button(ctx, 'add', 'data-add-episode')}<h3>${esc(tr(ctx, 'terms'))}</h3><div data-terms></div>${button(ctx, 'add', 'data-add-term')}`, async () => {
    try { read({validate: true}); await ctx.apply([{type: 'course.set', value}]); }
    catch (problem) { notice(problem.message); throw problem; }
  });
  function notice(message = '') { const node = layer.querySelector('[data-course-notice]'); node.textContent = message; node.hidden = !message; }
  function mapField(item, key, locale, text) { const map = localized(item[key], locale, text); if (map) item[key] = map; else delete item[key]; }
  function syncEntry(episode) { if (!episode.sceneIds.includes(episode.sceneId)) { episode.sceneId = episode.sceneIds[0]; notice(tr(ctx, 'entryChanged')); } }
  // Read the entire local draft before any reordering. Rename references in the same
  // transaction, so a later validation error never leaves half-renamed concepts.
  function read({memberEdit, validate = false} = {}) {
    const next = clone(value), renames = new Map(), ids = new Set();
    layer.querySelectorAll('[data-concept]').forEach(row => {
      const concept = next.concepts[Number(row.dataset.concept)], name = by(row, 'conceptId').value.trim();
      if (!name || name.includes('::') || ids.has(name)) error(tr(ctx, 'invalidConceptId'));
      ids.add(name); renames.set(row.dataset.conceptId, name); concept.id = name;
      row.querySelectorAll('[data-concept-locale]').forEach(language => {
        for (const key of ['description', 'conditions']) mapField(concept, key, language.dataset.conceptLocale, by(language, key).value);
      });
      if (validate && !concept.description) error(tr(ctx, 'missingDescription'));
    });
    for (const key of fields) mapField(next, key, ctx.locale, by(layer, key === 'objectives' ? 'objective' : key).value);
    let entryNotice = '';
    layer.querySelectorAll('[data-episode]').forEach(row => {
      const at = Number(row.dataset.episode), episode = next.episodes[at];
      episode.sceneId = by(row, 'scene').value;
      episode.sceneIds = [...row.querySelectorAll('[data-member]')].map(member => by(member, 'member').value);
      if (!episode.sceneIds.includes(episode.sceneId)) {
        if (memberEdit === at) { episode.sceneId = episode.sceneIds[0]; entryNotice = tr(ctx, 'entryChanged'); }
        else { episode.sceneIds.push(episode.sceneId); entryNotice = tr(ctx, 'entryAdded'); }
      }
      for (const key of ['objective', 'conditions', 'check']) mapField(episode, key, ctx.locale, by(row, key).value);
      for (const key of relations) {
        const checked = [...row.querySelectorAll(`[data-relation="${key}"]:checked`)].map(box => renames.get(box.value) ?? box.value);
        const previous = (episode[key] ?? []).map(name => renames.get(name) ?? name);
        const selected = [...previous.filter(name => checked.includes(name)), ...checked.filter(name => !previous.includes(name))];
        if (selected.length || Object.hasOwn(episode, key)) episode[key] = selected;
      }
    });
    layer.querySelectorAll('[data-term]').forEach(row => {
      const term = next.terminology[Number(row.dataset.term)];
      for (const key of ['term', 'definition']) mapField(term, key, ctx.locale, by(row, key).value);
    });
    value = next;
    if (entryNotice) notice(entryNotice);
  }
  function conceptFields(concept, locale) { return `<div data-concept-locale="${esc(locale)}"><h4>${esc(locale)}</h4>${group(area(ctx, 'description', concept.description?.[locale] ?? '') + area(ctx, 'conditions', concept.conditions?.[locale] ?? ''))}</div>`; }
  function relationFields(episode) {
    const concepts = value.concepts ?? [];
    if (!concepts.length) return `<p class="quiet">${esc(tr(ctx, 'noConcepts'))}</p>`;
    return group(relations.map(key => `<fieldset><legend>${esc(tr(ctx, key))}</legend>${concepts.map(concept => `<label class="voice-scope"><span>${esc(concept.id)} · ${esc(concept.description?.[ctx.locale] ?? Object.values(concept.description ?? {})[0] ?? '')}</span><input type="checkbox" data-relation="${key}" value="${esc(concept.id)}" ${episode[key]?.includes(concept.id) ? 'checked' : ''}></label>`).join('')}</fieldset>`).join(''));
  }
  function draw() {
    layer.querySelector('[data-concepts]').innerHTML = (value.concepts ?? []).map((concept, at) => {
      const locales = [...new Set([ctx.locale, ...(ctx.snapshot.locales ?? ['zh-CN', 'en-US', 'ja-JP']), ...Object.keys(concept.description ?? {}), ...Object.keys(concept.conditions ?? {})])];
      return `<fieldset data-concept="${at}" data-concept-id="${esc(concept.id)}" style="margin:8px 0;padding:10px;border:1px solid #40515e;border-radius:8px">${input(ctx, 'conceptId', concept.id)}${conceptFields(concept, ctx.locale)}<details data-concept-translations><summary>${esc(tr(ctx, 'otherLanguages'))}</summary>${locales.filter(locale => locale !== ctx.locale).map(locale => conceptFields(concept, locale)).join('')}</details>${button(ctx, 'remove', `data-remove-concept="${at}"`)}</fieldset>`;
    }).join('');
    layer.querySelector('[data-episodes]').innerHTML = value.episodes.map((episode, at) => {
      const members = episode.sceneIds, available = sceneOptions.filter(([name]) => !members.includes(name));
      return `<fieldset data-episode="${at}" style="margin:8px 0;padding:10px;border:1px solid #40515e;border-radius:8px"><legend>${esc(episode.id)}</legend><label>${esc(tr(ctx, 'entry'))}<select data-field="scene">${sceneOptions.map(([name, label]) => option(name, label, episode.sceneId)).join('')}</select></label><h4>${esc(tr(ctx, 'members'))}</h4>${members.map((name, memberAt) => `<div data-member="${memberAt}" style="display:flex;gap:6px;align-items:end;margin-bottom:6px"><span>${memberAt + 1}.</span><label style="flex:1"><select data-field="member">${sceneOptions.filter(([candidate]) => candidate === name || !members.includes(candidate)).map(([candidate, label]) => option(candidate, label, name)).join('')}</select></label>${button(ctx, 'up', `data-move-member="${memberAt}" data-delta="-1" ${memberAt === 0 ? 'disabled' : ''}`)}${button(ctx, 'down', `data-move-member="${memberAt}" data-delta="1" ${memberAt === members.length - 1 ? 'disabled' : ''}`)}${button(ctx, 'remove', `data-remove-member="${memberAt}" ${members.length === 1 ? 'disabled' : ''}`)}</div>`).join('')}<div style="display:flex;gap:6px;align-items:end">${select(ctx, 'sceneToAdd', available, available[0]?.[0])}${button(ctx, 'add', `data-add-member ${available.length ? '' : 'disabled'}`)}</div>${group(['objective', 'conditions', 'check'].map(key => area(ctx, key, episode[key]?.[ctx.locale] ?? '')).join(''))}<div data-episode-relations>${relationFields(episode)}</div>${button(ctx, 'up', `data-move-episode="${at}" data-delta="-1" ${at === 0 ? 'disabled' : ''}`)}${button(ctx, 'down', `data-move-episode="${at}" data-delta="1" ${at === value.episodes.length - 1 ? 'disabled' : ''}`)}${value.episodes.length > 1 ? button(ctx, 'remove', `data-remove-episode="${at}"`) : ''}</fieldset>`;
    }).join('');
    layer.querySelector('[data-terms]').innerHTML = (value.terminology ?? []).map((term, at) => `<div data-term="${at}">${group(input(ctx, 'term', term.term?.[ctx.locale] ?? '') + input(ctx, 'definition', term.definition?.[ctx.locale] ?? ''))}${button(ctx, 'remove', `data-remove-term="${at}"`)}</div>`).join('');
  }
  function change(action = () => {}, options) {
    try { notice(); read(options); action(); draw(); }
    catch (problem) { notice(problem.message); }
  }
  layer.querySelector('[data-add-concept]').onclick = () => change(() => { (value.concepts ??= []).push({id: id('concept'), description: {[ctx.locale]: tr(ctx, 'newConcept')}}); });
  layer.querySelector('[data-update-concepts]').onclick = () => change();
  layer.querySelector('[data-concepts]').onclick = event => {
    const remove = event.target.closest('[data-remove-concept]');
    if (!remove) return;
    change(() => {
      const at = Number(remove.dataset.removeConcept), concept = value.concepts[at];
      const references = value.episodes.flatMap(episode => relations.filter(key => episode[key]?.includes(concept.id)).map(key => episode.id + ' / ' + tr(ctx, key)));
      if (references.length) { notice(tr(ctx, 'conceptInUse') + ': ' + concept.id + ' — ' + references.join(', ')); return; }
      value.concepts.splice(at, 1); if (!value.concepts.length) delete value.concepts;
    });
  };
  layer.querySelector('[data-add-term]').onclick = () => change(() => { (value.terminology ??= []).push({id: id('term'), term: {[ctx.locale]: ''}}); });
  layer.querySelector('[data-add-episode]').onclick = () => change(() => {
    const scene = scenes.find(scene => !value.episodes.some(episode => episode.sceneIds.includes(scene.id))) ?? scenes[0];
    value.episodes.push({id: id('episode'), sceneId: scene.id, sceneIds: [scene.id], objective: {[ctx.locale]: scene.title[ctx.locale] ?? scene.id}});
  });
  layer.querySelector('[data-terms]').onclick = event => {
    const remove = event.target.closest('[data-remove-term]');
    if (remove) change(() => { value.terminology.splice(Number(remove.dataset.removeTerm), 1); if (!value.terminology.length) delete value.terminology; });
  };
  layer.querySelector('[data-episodes]').onchange = event => {
    if (['scene', 'member'].includes(event.target.dataset.field)) change(undefined, event.target.dataset.field === 'member' ? {memberEdit: Number(event.target.closest('[data-episode]').dataset.episode)} : undefined);
  };
  layer.querySelector('[data-episodes]').onclick = event => {
    const control = event.target.closest('[data-add-member], [data-remove-member], [data-move-member], [data-remove-episode], [data-move-episode]');
    if (!control || control.disabled) return;
    const row = control.closest('[data-episode]'), at = Number(row.dataset.episode), addedScene = by(row, 'sceneToAdd').value;
    change(() => {
      const episode = value.episodes[at];
      if (control.hasAttribute('data-add-member')) { if (addedScene && !episode.sceneIds.includes(addedScene)) episode.sceneIds.push(addedScene); }
      else if (control.hasAttribute('data-remove-member')) { episode.sceneIds.splice(Number(control.dataset.removeMember), 1); syncEntry(episode); }
      else if (control.hasAttribute('data-move-member')) { const from = Number(control.dataset.moveMember), to = from + Number(control.dataset.delta); [episode.sceneIds[from], episode.sceneIds[to]] = [episode.sceneIds[to], episode.sceneIds[from]]; }
      else if (control.hasAttribute('data-remove-episode')) value.episodes.splice(at, 1);
      else { const to = at + Number(control.dataset.delta); [value.episodes[at], value.episodes[to]] = [value.episodes[to], value.episodes[at]]; }
    });
  };
  draw();
}

function editSound(ctx) {
  const value = clone(ctx.snapshot.project.sound ?? {});
  const body = group(toggle(ctx, 'effects', value.effects?.enabled ?? false) + input(ctx, 'volume', value.effects?.volume ?? .3, 'type="number" min="0" max="1" step="0.05"') + input(ctx, 'voiceGain', value.voiceGainDB ?? 0, 'type="number" min="-24" max="12" step="0.5"') + toggle(ctx, 'duck', value.ducking?.enabled !== false) + input(ctx, 'reduction', value.ducking?.reductionDB ?? 12, 'type="number" min="0" max="30" step="1"') + toggle(ctx, 'normalize', !!value.loudness) + input(ctx, 'lufs', value.loudness?.integrated ?? -16, 'type="number" min="-30" max="-10" step="1"') + input(ctx, 'peak', value.loudness?.truePeak ?? -1.5, 'type="number" min="-6" max="-1" step="0.1"')) + `<label>${esc(tr(ctx, 'bed'))}<input type="file" accept="audio/*" data-field="file"></label>${group(input(ctx, 'bedVolume', value.bed?.volume ?? .15, 'type="number" min="0" max="1" step="0.05"') + input(ctx, 'bedStart', value.bed?.start ?? 0, 'type="number" min="0" step="0.1"'))}${toggle(ctx, 'loop', value.bed?.loop ?? true)}${toggle(ctx, 'clearBed', false)}`;
  ctx.modal(tr(ctx, 'sound'), body, async layer => {
    value.effects = {...value.effects, enabled: by(layer, 'effects').checked, volume: Number(by(layer, 'volume').value)}; value.voiceGainDB = Number(by(layer, 'voiceGain').value);
    value.ducking = {...value.ducking, enabled: by(layer, 'duck').checked, reductionDB: Number(by(layer, 'reduction').value)};
    if (by(layer, 'normalize').checked) value.loudness = {...value.loudness, integrated: Number(by(layer, 'lufs').value), truePeak: Number(by(layer, 'peak').value)}; else delete value.loudness;
    if (value.bed) { value.bed.loop = by(layer, 'loop').checked; value.bed.volume = Number(by(layer, 'bedVolume').value); value.bed.start = Number(by(layer, 'bedStart').value); }
    const commands = [{type: 'sound.set', value}], file = by(layer, 'file').files[0];
    if (by(layer, 'clearBed').checked) commands.push({type: 'sound.bed', source: null});
    else if (file) commands.push({type: 'sound.bed', source: {data: await fileData(file)}, value: {volume: Number(by(layer, 'bedVolume').value), start: Number(by(layer, 'bedStart').value), loop: by(layer, 'loop').checked}});
    await ctx.apply(commands);
  });
}

function editDelivery(ctx) {
  const project = ctx.snapshot.project, values = clone(project.deliverables ?? [{id: 'lesson', title: {[ctx.locale]: tr(ctx, 'delivery')}, output: project.output}]);
  const layer = ctx.modal(tr(ctx, 'delivery'), `<div data-deliveries></div>${button(ctx, 'add', 'data-add-delivery')}`, async () => { read(); await ctx.apply([{type: 'delivery.set', value: values}]); });
  function read() { layer.querySelectorAll('[data-delivery]').forEach(row => { const item = values[Number(row.dataset.delivery)], sceneId = by(row, 'scene').value; item.id = by(row, 'version').value.trim(); item.title = localized(item.title, ctx.locale, by(row, 'title').value); item.output = {...item.output, locale: by(row, 'language').value, aspect: by(row, 'aspect').value, profile: by(row, 'profile').value}; if (sceneId !== '@sequence') { if (sceneId !== item.output.sceneId) item.output.branchId = null; item.output.sceneId = sceneId; delete item.output.sequence; } else item.output.sequence ??= clone(project.output.sequence); }); }
  function draw() { layer.querySelector('[data-deliveries]').innerHTML = values.map((item, at) => `<fieldset data-delivery="${at}" style="margin:8px 0;padding:10px;border:1px solid #40515e;border-radius:8px">${group(input(ctx, 'version', item.id) + input(ctx, 'title', item.title?.[ctx.locale] ?? '') + select(ctx, 'language', ctx.snapshot.locales.map(locale => [locale, {'zh-CN': '中文', 'en-US': 'English', 'ja-JP': '日本語'}[locale] ?? locale]), item.output.locale) + select(ctx, 'aspect', ['landscape', 'portrait'].map(key => [key, tr(ctx, key)]), item.output.aspect) + select(ctx, 'profile', ['final', 'draft'].map(key => [key, tr(ctx, key)]), item.output.profile) + select(ctx, 'scene', [...(item.output.sequence || project.output.sequence ? [['@sequence', tr(ctx, 'sequence')]] : []), ...project.lesson.scenes.map(scene => [scene.id, scene.title[ctx.locale] ?? scene.id])], item.output.sequence ? '@sequence' : item.output.sceneId))}${values.length > 1 ? button(ctx, 'remove', `data-remove-delivery="${at}"`) : ''}</fieldset>`).join(''); }
  layer.querySelector('[data-add-delivery]').onclick = () => { read(); values.push({id: id('version'), title: {[ctx.locale]: tr(ctx, 'delivery')}, output: clone(project.output)}); draw(); };
  layer.querySelector('[data-deliveries]').onclick = event => { const button = event.target.closest('[data-remove-delivery]'); if (button) { read(); values.splice(Number(button.dataset.removeDelivery), 1); draw(); } }; draw();
}

/** Each modal captures the scene and beat supplied when it opens. */
export async function handleAdvanced(action, context) {
  const handlers = {'advanced-analysis': editAnalysis, 'advanced-new-analysis': ctx => editAnalysis(ctx, true), 'advanced-ranges': editRangeView, 'advanced-solver': importSolver, 'advanced-artwork': editArtwork, 'advanced-comparison': editComparison, 'advanced-course': editCourse, 'advanced-sound': editSound, 'advanced-delivery': editDelivery};
  if (!handlers[action]) return false;
  const ctx = {...context, scene: clone(context.scene), beat: clone(context.beat), current: clone(context.current)};
  handlers[action](ctx); return true;
}

// Authored teaching inputs. The runtime derives every displayed game amount.
const text=(zh,en,ja)=>({'zh-CN':zh,...(en?{'en-US':en}:{}),...(ja?{'ja-JP':ja}:{})});
const beat=(id,label,narration,extra={})=>({id,label:text(label),...(narration?{narration:text(narration)}:{}),...extra});
const action=(id,label,actions)=>beat(id,label,null,{actions,hold:.8,actionHold:.45});
const table={surface:'table'};
const canvas=(analysisId,show=['range','calculation','conditions'],extra={})=>({surface:'analysis',analysisId,show,...extra});
const names={btn:'riverpilot',sb:'momo_88',bb:'Northstar',utg:'AceRoutine',hj:'Kai_17',co:'BlueFin'};
const start=(hero='btn',hole=['Ah','Qh'],villain=['Ks','Jh'])=>({street:'preflop',board:[],button:'btn',hero,actor:'utg',bigBlind:1,seats:['btn','sb','bb','utg','hj','co'].map(id=>({id,name:names[id],stack:id==='sb'?99.5:id==='bb'?99:100,contributed:id==='sb'?.5:id==='bb'?1:0,streetBet:id==='sb'?.5:id==='bb'?1:0,hole:id===hero?hole:id==='bb'?villain:[]}))});
const appearance={tableName:'Orion 06',felt:'#1b5850'};
const hypothesis=(model,detail)=>({kind:'hypothesis',source:'Original authored teaching assumptions',model:text(model),detail:text(detail)});

export function priceLesson(){
  return {
    id:'price-and-range',title:text('第 1 集 · 价格不是权益'),appearance,start:start(),
    beats:[
      beat('opening','今天要判断什么','河牌面对一枪，顶对顶踢脚是不是必须跟？这集先把两个问题分开：我花多少钱争夺多大的底池，以及对手带着什么牌下注。算清第一件事，只是开始。我们从六人桌的按钮位打起，沿着每一街的信息走，不提前看对手的底牌。',{hold:20,presentation:table}),
      action('preflop','六人桌进入单挑',[{seat:'utg',type:'fold'},{seat:'hj',type:'fold'},{seat:'co',type:'fold'},{seat:'btn',type:'raise',to:2.5},{seat:'sb',type:'fold'},{seat:'bb',type:'call'}]),
      beat('preflop-plan','翻前计划','前面三家都弃了，我拿红桃 A Q，在按钮位开到两点五，大盲跟进。现在是六人桌里两个人争这个底池，不是一开始就在打单挑。我们的位置有利，后手仍然很深。接下来先看牌面，再考虑哪些更差的牌愿意继续。',{hold:22,presentation:{surface:'table',focus:['hero','pot']}}),
      action('flop','翻牌与过牌',[{type:'deal',cards:['Qd','7c','2s']},{seat:'bb',type:'check'}]),
      beat('flop-plan','顶对想向谁收费','翻牌 Q、七、二，三种花色。我们中了顶对顶踢脚。这里示范一笔小下注，目标是让更弱的 Q 和部分中小对子继续，而不是因为自己牌强就尽量把池子做大。对手如果加注，范围会发生变化，那时要重新判断，不能照着现在的计划一直打。',{hold:24,presentation:{surface:'table',focus:['hero','board']}}),
      action('flop-bet','小下注被跟注',[{seat:'btn',type:'bet',to:1.8},{seat:'bb',type:'call'}]),
      action('turn','转牌双方过牌',[{type:'deal',cards:['Tc']},{seat:'bb',type:'check'},{seat:'btn',type:'check'}]),
      beat('turn-review','过牌保留了什么','转牌是梅花十，我们都过了。这个路线让对手的范围里仍可能保留较弱成手，也可能保留没有摊牌价值的牌。这里不是证明过牌一定优于下注，而是记住自己实际走过的路线。到河牌，我们只能根据这条路线和新的下注更新判断。',{hold:23,presentation:table}),
      action('river-bet','面对六个大盲',[{type:'deal',cards:['4d']},{seat:'bb',type:'bet',to:6}]),
      beat('question','先做自己的判断','河牌方块四，大盲下注六个大盲。先停一下：你会用什么理由跟注或弃牌？先说理由，再选动作。如果你的理由只是“我有顶对”，试着补上一个范围判断。',{hold:15,presentation:{surface:'table',focus:['hero','board','pot'],question:text('你还需要知道什么，才能判断这次跟注？')}}),
      beat('thinking-pause','留给观众的时间',null,{hold:4,presentation:{surface:'table',focus:['hero','pot']}}),
      beat('price','价格的分母','先看价格。现在底池十五点一个大盲，已经包含对手刚下的六个。我要再跟六个，跟完的总池是二十一点一个。因此六除以二十一点一，大约百分之二十八点四。这是河牌、单底池、无抽水且跟注后结束下注时的盈亏平衡权益门槛。它还没有告诉我们，这手 A Q 真有多少权益。',{hold:28,presentation:canvas('river-price',['calculation','conditions'],{focus:['pot']})}),
      beat('range','把范围展开','再看对手可能拿什么。暗三条、两对，是我们担心的强牌；较弱的 Q，可能有摊牌价值，但不一定愿意主动下注；K J、J 九这类没成的听牌，才可能成为诈唬。画板上只是候选分组，没有给组合权重，也没有承诺完整覆盖。几张牌的名字不能直接变成一个精确胜率。',{hold:28,presentation:canvas('river-price',['range','conditions'])}),
      beat('choice','选择与代价','如果对手会把足够多的错过听牌拿来诈唬，跟注可以留下这些牌。加注则可能让它们全部弃掉，愿意继续的反而更强。可是，如果对手几乎从不诈唬，顶对也可能该弃。这个示范选择跟注，是为了把路线走完；选择成立的理由需要范围假设支持，不能靠结尾赢了多少来倒推。',{hold:30,presentation:canvas('river-price',['range','takeaway'])}),
      action('call','回到当前决定并跟注',[{seat:'btn',type:'call'}]),
      action('showdown','本次示范的摊牌',[{type:'showdown'}]),
      beat('wrap','赢这一手不能证明方法','这一次对手亮出 K J，我们赢了。但这只是一种可能的结果，不能证明所有类似的顶对都该跟。你现在应该能分别回答三个问题：价格门槛是多少，范围假设是什么，什么条件一变就要重做判断。下一集用一个能够完整推导的河牌模型，检查这些分母为什么不能混用。',{hold:27,presentation:table})
    ],
    analysis:[{
      id:'river-price',node:{beatId:'river-bet'},title:text('跟注价格与范围判断'),
      objective:text('把价格门槛、实际权益和行动频率分开。'),
      assumptions:text('单底池、无抽水；候选范围未加权，也未穷举。'),conditions:text('仅对当前河牌跟注；跟注后结束下注。'),
      takeaway:text('先算价格，再检验范围；一次输赢不能证明决策质量。'),
      range:{seat:'bb',groups:[{id:'strong',label:text('强价值候选'),hands:['77','22','TT','QT']},{id:'weaker',label:text('较弱成手候选'),hands:['KQ','QJ','Q9']},{id:'missed',label:text('未成听牌候选'),hands:['KJ','J9','98']}]},
      calculation:'potOdds',evidence:hypothesis('六人桌打到河牌剩两人；面对 6 BB 下注。','范围是教学假设，未提供精确权益、EV 或 GTO 频率。')
    }]
  };
}

export function equilibriumLesson(){
  const title=text('第 2 集 · 用一个可推导模型检查频率');
  return {id:'bounded-equilibrium',title,appearance:{...appearance,tableName:'Orion 02'},
    start:{street:'river',board:['Ac','Kd','7h','2s','3c'],button:'hero',hero:'hero',actor:'bettor',bigBlind:1,seats:[{id:'bettor',name:'Northstar',stack:10,contributed:5,hole:['As','Ad']},{id:'hero',name:'riverpilot',stack:10,contributed:5,hole:['Qc','Qd']}]},
    beats:[
      beat('model','先说明模型的边界','这一集研究一个完整写明规则的河牌模型。底池十个大盲，两人后手各十个。我拿一对 Q，只能赢诈唬，不能赢价值牌。对手的初始范围一半是必胜的价值牌，一半是必败的空气。两类牌的比例是模型给定的条件，不是我们从普通实战里猜出来的精确答案。',{hold:28,presentation:{surface:'table',focus:['hero','board','pot']}}),
      beat('allowed','可选择的动作','模型再限制两件事：对手只能过牌或者全下十个；如果他过牌，直接摊牌，我不能再下注。如果他全下，我只能跟注或者弃牌，没有加注。这些条件很重要。接下来得到的频率，是这个有限游戏的均衡，不能不加检查地搬到允许多种尺寸和继续加注的普通牌局。',{hold:28,presentation:canvas('polar-model',['conditions','evidence'])}),
      beat('predict','先猜两个频率','先猜一猜：对手拿空气时应该全部诈唬吗？而我面对全下，需要每次都跟注吗？如果我永远弃牌，他会很愿意拿所有空气下注；如果我永远跟，他又没有理由用空气送出十个。我们要找的，是双方都无法靠单独改策略提高期望收益的组合。',{hold:26,presentation:{surface:'table',question:text('什么策略能让双方都不愿单独偏离？')}}),
      beat('pause','独立思考',null,{hold:4,presentation:table}),
      beat('defend','先让空气无差异','先从对手的空气出发。诈唬成功能赢原有的十个；被我跟注就输自己推出的十个。如果我一半跟、一半弃，他用空气全下的期望收益就是零，和直接过牌认输相同。所以这里让空气无差异的跟注频率是二分之一。它回答的是我多常跟，不是我跟注需要多少权益。',{hold:29,presentation:canvas('polar-model',['conditions','evidence'],{title:text('空气的 EV：½ × 10 − ½ × 10 = 0')})}),
      beat('balance','再让抓诈唬无差异','再看我的抓诈唬牌。我跟十个去争跟完后的三十个，门槛是三分之一。因此，对手下注范围里需要有三分之一诈唬，才能让我跟或弃的期望收益相同。注意分母是“已经下注的牌”，不是“最初拿到的所有牌”，更不是对手每一手空气的下注频率。',{hold:29,presentation:canvas('polar-model',['range','conditions'],{title:text('模型中面对全下：10 ÷ 30 = ⅓')})}),
      beat('prior','从先验比例推回下注策略','最初价值和空气各一半。价值牌全部下注，空气只有一半下注，那么下注里价值占两份，空气占一份，诈唬就正好是三分之一。于是我们得到了三个不同的数：我跟注一半，空气下注一半，下注范围里的空气占三分之一。它们可能看起来相似，却在回答不同的问题。',{hold:30,presentation:canvas('polar-model',['range','takeaway'],{title:text('下注范围：价值 2 份，空气 1 份')})}),
      beat('check','检查单独偏离有没有好处','这套推导还要经过检查。对手的四种纯策略，是两类牌分别选过牌或全下；我的纯策略是总跟或总弃。逐一计算这些偏离的收益，没有哪一个能超过当前混合策略，才支持这里的均衡结论。只要任何一方找到更有利的单独改变，这组频率就还不是均衡。这里双方最佳回应能够增加的收益都是零；有些偏离反而更差。',{hold:30,presentation:canvas('polar-model',['evidence','takeaway'],{title:text('双方最佳回应：额外收益 = 0')})}),
      action('model-bet','示范其中一条下注路线',[{seat:'bettor',type:'allin'}]),
      beat('observed','回到这个待决节点','现在画面示范对手全下后的节点。底池二十个，我要跟十个。价格门槛仍然是三分之一，而均衡策略里这张抓诈唬牌跟注一半。这个画面只演示其中一次跟注，不假称刚刚做过随机抽样。对手真实的牌仍然没有公开，不能用它来指导此刻的选择。',{hold:28,presentation:canvas('after-bet',['calculation','conditions'])}),
      action('model-call','示范跟注',[{seat:'hero',type:'call'}]),
      action('model-show','摊牌',[{type:'showdown'}]),
      beat('conclusion','一次输掉与策略是否合理','这一次撞上价值牌，跟注输了。它不推翻前面的均衡推导，就像上一集赢了也不能证明所有跟注都正确。如果价值与空气的先验比例改变，或者允许新的下注尺寸，我们就需要重新求解。这一集记住的是怎样检查条件、分母和偏离收益，而不是背一个到处适用的二分之一。',{hold:28,presentation:table})
    ],analysis:[
      {id:'polar-model',node:{beatId:'model'},title:text('受限河牌极化模型'),objective:text('用无差异与最佳回应检验一个明确模型的均衡。'),assumptions:text('价值/空气先验各 50%；价值总胜，空气总负。'),conditions:text('P=10 BB，B=10 BB；仅过牌或全下；过牌直接摊牌，面对全下仅跟或弃；无抽水。'),takeaway:text('跟注频率 50%；空气下注频率 50%；下注范围中的空气占 33.33%。'),range:{seat:'bettor',groups:[{id:'value',label:text('价值候选 · 先验一半'),hands:['AsAd']},{id:'bluff',label:text('空气候选 · 先验一半'),hands:['JhTh']}]},evidence:{kind:'derivation',source:'evidence/river-equilibrium.json',model:text('受限零和河牌模型 P=10, B=10, valueProbability=0.5；允许策略见本集边界。'),detail:text('独立枚举下注者四种纯策略、跟注者两种纯策略验证最佳回应；不是完整无限注德州求解。')}},
      {id:'after-bet',node:{beatId:'model-bet'},title:text('价格与行动频率的分母'),assumptions:text('受限模型的均衡下注范围中，价值与空气为 2:1。'),conditions:text('河牌单挑，单底池，无抽水；全下前双方有效筹码 10 BB，面对 10 BB 全下。'),takeaway:text('价格门槛 33.33% 不等于跟注频率 50%。'),calculation:'potOdds',evidence:{kind:'derivation',source:'evidence/river-equilibrium.json',model:text('同一受限模型的下注后节点；先验与允许动作不变。')}}
    ]};
}

export function transferLesson(){
  return {id:'conditions-transfer',title:text('第 3 集 · 条件变了，重新判断'),appearance,start:start('co',['Kc','Jc'],['As','8h']),
    beats:[
      beat('opening','把方法带回一手新牌','这次不再拿 A Q。我们在六人桌的关煞位拿梅花 K J，前面两家还没有行动，我先考虑自己的位置和手牌。上一集的二分之一和三分之一先放到一边：这里没有给定价值与空气各半，也没有限制对手只能用一种尺寸。我们把判断步骤带回来，具体数字从当前牌局重新读取。',{hold:26,presentation:{surface:'table',focus:['hero']}}),
      action('preflop','进入单挑',[{seat:'utg',type:'fold'},{seat:'hj',type:'fold'},{seat:'co',type:'raise',to:2.5},{seat:'btn',type:'fold'},{seat:'sb',type:'fold'},{seat:'bb',type:'call'}]),
      action('flop','翻牌大盲过牌',[{type:'deal',cards:['Jd','8c','3s']},{seat:'bb',type:'check'}]),
      beat('flop-thought','先回答下注针对谁','翻牌 J、八、三，我们又有顶对。这次踢脚是 K。对手过牌以后，我示范下注二点八，目标仍然是让更差成手和部分听牌付费。不要因为上一手打了小注，就机械地复制同一个尺寸；下注之前应该能说出哪些牌继续，哪些牌弃掉，以及被反击后自己如何应对。',{hold:29,presentation:{surface:'table',focus:['board','hero']}}),
      action('flop-call','下注被跟注',[{seat:'co',type:'bet',to:2.8},{seat:'bb',type:'call'}]),
      action('turn','转牌 A 与双方过牌',[{type:'deal',cards:['Ah']},{seat:'bb',type:'check'},{seat:'co',type:'check'}]),
      beat('turn-change','一张牌改变了相对强度','转牌红桃 A，双方过牌。我们的手牌没有变，牌力的位置却变了：一些翻牌继续的 A 高现在已经超过我们，部分两对也可能出现。这里需要更新范围，不能继续沿用翻牌“顶对”的标签。我们没有知道对手拿着 A，只是说明新的公共信息改变了候选范围。',{hold:28,presentation:{surface:'table',focus:['card:Ah','hero']}}),
      action('river-bet','河牌面对满池',[{type:'deal',cards:['2h']},{seat:'bb',type:'bet',to:11.1}]),
      beat('quiz','先独立判断一次','河牌红桃二，对手下注十一点一个大盲，是下注前的满池。你会怎样把价格和范围结合起来？请先说出跟注需要的门槛，再说哪些候选牌决定你能不能达到它。最后补一个条件：对手具备什么行为倾向，你就会改变选择？',{hold:24,presentation:{surface:'table',question:text('先算价格，再说范围；什么条件会让你改答案？'),focus:['hero','pot','board']}}),
      beat('pause','真实留白',null,{hold:5,presentation:table}),
      beat('price','从新节点重算','面对下注时底池是二十二点二，再跟十一点一，总池三十三点三。因此门槛是三分之一。它与第二集碰巧是同一个数，因为面对的都是满池下注，并不代表两个场景有同样的范围或同样的跟注频率。形式相同的价格，可以对应完全不同的实际选择。',{hold:27,presentation:canvas('transfer-price',['calculation','conditions'])}),
      beat('assumptions','给两个可以检验的范围假设','想象两种对手。一种会用错过的顺子听牌积极诈唬；另一种到河牌几乎只拿强牌打大注。面对第一种，我的抓诈唬牌可能有继续的理由。面对第二种，即使价格一样，也可能达不到门槛。这是需要观察支持的剥削假设，画板没有把它包装成已知的精确人群频率。',{hold:29,presentation:canvas('transfer-price',['range','conditions'])}),
      beat('condition','没有前史时不要编一个读牌','这段示范没有给出可核对的对手前史，所以我们不能声称“他就是从不诈唬”。如果要做连续实战课，就应该把之前观察到的下注与摊牌保存下来，再解释这些证据如何改变我们的假设。当前教学只比较条件：同样的价格，在不同范围下为什么会得到不同的决定。',{hold:27,presentation:canvas('transfer-price',['conditions','evidence'])}),
      beat('decision','演示低诈唬假设下的弃牌','现在明确选择一个分支：假设这名对手在这个路线中诈唬不足，我们示范弃牌。这个动作的代价是放弃抓到少数诈唬的机会，收益是减少对强价值牌的额外支付。结论依赖刚刚说明的假设。把假设换掉，这个弃牌理由也要重新检查；关键是学会判断理由在什么条件下仍然成立。',{hold:29,presentation:canvas('transfer-price',['takeaway'])}),
      action('fold','返回牌桌弃牌',[{seat:'co',type:'fold'}]),
      beat('transfer','检验你是否能迁移','这一手不亮出对手底牌。你仍然可以检查推理是否完整：当前事实是什么，价格怎么算，范围依据是什么，选择付出什么代价。再把下注从满池改成半池，先重算价格，再考虑下注范围是否也变化。能解释这些改变，比记住某一手牌最后跟了还是弃了更有用。',{hold:28,presentation:table})
    ],analysis:[{id:'transfer-price',node:{beatId:'river-bet'},title:text('新牌面、新范围，同样检查方法'),objective:text('把判断方法迁移到不同位置、牌面和下注尺寸。'),assumptions:text('范围分组未加权；“诈唬不足”是示范条件，没有伪造对手前史。'),conditions:text('河牌单底池无抽水；满池下注；只计算跟注价格。'),takeaway:text('相同价格不保证相同决策；条件变化需要重新审查范围与结论。'),range:{seat:'bb',groups:[{id:'value',label:text('价值候选'),hands:['AJ','A8','88','33']},{id:'missed',label:text('未成听牌候选'),hands:['QT','T9','97']}]},calculation:'potOdds',evidence:hypothesis('关煞位对大盲，J 高翻牌，A 转牌后双方过牌。','两类对手是条件对照，不是已观测人群统计。')}]};
}

export function localizedProbe(){
  const scene=equilibriumLesson();scene.id='localized-probe';scene.title=text('短片 · 价格与频率','Short · Price and frequency','短編 · 価格と頻度');
  scene.beats=[
    {id:'bet',label:text('面对全下','Facing a shove','オールインに直面'),actions:[{seat:'bettor',type:'allin'}],hold:1},
    {id:'question',label:text('先区分两个分母','Separate the denominators','分母を分ける'),narration:text('现在底池二十个大盲，我要跟十个。跟完总池三十个，价格门槛是三分之一。这个数不是我的跟注频率。只有明确对手的范围和模型允许的动作，才能进一步讨论策略。','The pot is now twenty big blinds, and calling costs ten. The final pot would be thirty, so the break-even equity threshold is one third. That is not my calling frequency. A strategy also needs an opponent range and a clearly defined set of allowed actions.','現在のポットは二十ビッグブラインド、コール額は十です。コール後のポットは三十なので、損益分岐点のエクイティは三分の一です。これはコール頻度ではありません。戦略を考えるには、相手のレンジと許されるアクションも必要です。'),hold:18,presentation:canvas('price',['calculation','conditions'])}
  ];scene.analysis=[{id:'price',node:{beatId:'bet'},title:text('价格不是频率','Price is not frequency','価格と頻度は別'),conditions:text('河牌 · 单底池 · 无抽水','River · One pot · No rake','リバー · 単一ポット · レーキなし'),calculation:'potOdds'}];return scene;
}

export const course={id:'decision-foundations',title:text('从价格到判断'),prerequisites:text('知道位置、公共牌、跟注、加注与弃牌的含义。'),objectives:text('能够区分事实、范围假设、价格门槛与行动频率，并说出结论改变的条件。'),episodes:[{id:'lesson-1',sceneId:'price-and-range',objective:text('把价格与范围分开。'),conditions:text('无抽水河牌，单底池。'),check:text('面对 6 BB 下注，解释 28.44% 的分母。')},{id:'lesson-2',sceneId:'bounded-equilibrium',objective:text('用最佳回应检查受限模型的均衡。'),conditions:text('明确给定先验、两种下注选择与终止条件。'),check:text('解释 50% 跟注频率与 33.33% 下注中诈唬占比为何不同。')},{id:'lesson-3',sceneId:'conditions-transfer',objective:text('在新牌面与新范围假设下重新判断。'),check:text('改变下注尺寸或诈唬假设，指出哪些事实和结论必须复核。')}]};
export const scenes=()=>[priceLesson(),equilibriumLesson(),transferLesson(),localizedProbe()];

// The slice keeps the complete legal opening history instead of copying pot/stack facts.
export function verticalSlice(){
  const scene=priceLesson();scene.id='teaching-slice';scene.title=text('样片 · 先看价格，再看范围');
  const keep=new Set(['preflop','preflop-plan','flop','flop-plan','flop-bet','turn','river-bet','question','thinking-pause','price','range','choice','call']);
  scene.beats=scene.beats.filter(item=>keep.has(item.id));
  for(const item of scene.beats)if(['preflop-plan','flop-plan'].includes(item.id))item.hold=15;
  return scene;
}

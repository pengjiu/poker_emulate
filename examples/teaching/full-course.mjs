// Complete reusable production inputs. These are authored scenarios, not live reads.
import {priceLesson,equilibriumLesson,localizedProbe} from './course.mjs';
import {continueSession,reviewSession} from '../../src/project/session.mjs';
import {createVariant} from '../../src/project/variants.mjs';
import {createHand} from '../../src/poker/rules.mjs';
import {localizeFullCourse} from './full-course-locales.mjs';

export const words=(zh,en,ja)=>({'zh-CN':zh,...(en?{'en-US':en}:{}),...(ja?{'ja-JP':ja}:{})});
const title=text=>words(text);
const talk=(id,label,narration,presentation={surface:'table'},extra={})=>({id,label:title(label),narration:title(narration),presentation,...extra});
const actions=(id,label,list)=>({id,label:title(label),actions:list,hold:.8,actionHold:.5,presentation:{surface:'table',motion:{duration:.45}}});
const analysis=(id,node,heading,extra={})=>({id,node,title:title(heading),...extra});
const canvas=(id,show,extra={})=>({surface:'analysis',analysisId:id,show,...extra});
const ring=(id,target)=>({id,type:'circle',target,color:'#f7cc68',width:3});
const label=(id,target,text)=>({id,type:'label',target,text:title(text)});
const motion={duration:.45};
const hypothesis=text=>({kind:'hypothesis',source:'Authored teaching assumptions; not an estimated population strategy',model:title(text)});
const weightedHands=['7d7h','7d7s','7h7s','2c2d','2c2h','2d2h','KsJh','KdJs','KcJd'];
const addBefore=(scene,id,...beats)=>scene.beats.splice(scene.beats.findIndex(b=>b.id===id),0,...beats);
function estimate(scene){
  for(const beat of [...scene.beats,...(scene.branches??[]).flatMap(b=>b.beats)]){
    if(beat.narration?.['zh-CN']){
      beat.narration['zh-CN']=beat.narration['zh-CN'].replaceAll('全下','All-in');
      // Each language rehearses its own actual script. Recorded speech overrides estimates.
      beat.hold=1.2;
      beat.rehearsalDuration=Object.fromEntries(Object.entries(beat.narration).map(([locale,text])=>{
        const seconds=locale==='en-US'?text.trim().split(/\s+/).length/2.7:[...text].length/(locale==='ja-JP'?5:5.6);
        return [locale,Math.max(4,Math.ceil(seconds*10)/10)];
      }));
    }
    if(beat.actions?.length)beat.presentation??={surface:'table',motion};
    if(beat.id.includes('pause'))beat.sound={quiet:true};
  }
  return scene;
}

export function fullPriceLesson(){
  const scene=priceLesson();scene.id='full-price';scene.title=title('第 1 集 · 让价格、范围和选择对得上');
  for(const beat of scene.beats)if(beat.actions?.length)beat.presentation={surface:'table',motion};
  scene.beats.find(b=>b.id==='question').presentation={surface:'table',focus:['hero','pot'],camera:{target:'hero',scale:1.45,duration:.4},annotations:[ring('size','bet:bb'),label('pending','hero','先说理由，再选动作')]};
  scene.beats.find(b=>b.id==='price').presentation=canvas('river-price',['calculation','conditions'],{annotations:[ring('price-ring','calculation'),{id:'price-arrow',type:'arrow',from:'pot',to:'calculation',color:'#f7cc68'}]});
  scene.beats.find(b=>b.id==='range').presentation=canvas('river-price',['range','conditions'],{annotations:[ring('strong','range:strong'),{id:'air-path',type:'arrow',from:'range:missed',to:'hero'}]});
  addBefore(scene,'choice',
    talk('weighted','给权重以后才谈权益','现在另设一个可以算清的教学范围：六个价值组合，三个错过的 K J 组合，每个组合等权。这不是从对手身上测出来的频率，只是公开写下的假设。我们的 A Q 赢三个，输六个，权益是三分之一。把这个数和刚才的价格放在一起，跟注的增量期望收益才有了明确的计算依据。',canvas('weighted',['range','metrics','conditions'],{rangeView:{mode:'matrix',metric:'rangeShare'},annotations:[ring('kj-cell','hand:KJo')]})),
    talk('combos','牌类不是一个组合','把非同花 K J，也就是 KJo 展开。它共有十二个可能组合，我们这次只给其中三个具体花色组合权重。矩阵里的格子表示牌类，展开后才是实际参与计算的组合。若手里或牌面上出现同一张牌，对应组合必须删去。筛选只是帮助我们看清某一部分，不会把筛选后的数字偷偷改成完整范围。',canvas('weighted',['range','metrics'],{rangeView:{mode:'combos',metric:'weight',hand:'KJo'},annotations:[label('weights','hero','明确假设：九个等权组合')]})),
    talk('missing-bluff','少一个诈唬会怎样','现在保留六个价值组合，只留两个诈唬。不是改下注价格，而是改范围假设。权益降到四分之一，低于这个价格需要的门槛，跟注的期望收益也转为负数。两幅牌桌看起来完全一样，答案却可以改变。真正改变结论的是范围里的相对权重，而不是“顶对顶踢脚”这个名字。',canvas('low-bluff',['range','metrics','calculation'],{rangeView:{mode:'matrix',metric:'rangeShare'}}))
  );
  scene.beats.find(b=>b.id==='choice').narration=title('刚才少一个诈唬，是用来检验边界的反例。现在回到六个价值、三个诈唬的九组合假设，用它走主线。在这个假设下，跟注相对弃牌的增量期望收益为正。加注可能赶走空气、留下更强的继续范围；若要严格比较加注，还需要说明对手怎样回应。我们没有求解那棵树，所以这里只在跟与弃之间选择跟注，不把它说成所有动作里唯一最优。');
  scene.beats.find(b=>b.id==='choice').presentation=canvas('weighted',['range','metrics','conditions'],{rangeView:{mode:'matrix',metric:'rangeShare'},annotations:[label('restore-assumption','hero','主线：恢复九组合假设')]});
  addBefore(scene,'call',talk('compare','两条路线从同一个决定出发','跟注，要再付六个大盲；弃牌，就不再投入。右边是同一个决定的两种结果，暂时都不翻对手的牌。跟完池子变大，不等于这次跟注就赚钱；赚不赚，要用刚才的范围算。对照看完，回到我面前这笔下注，动作还没点。',canvas('river-price',['comparison'],{comparison:{mode:'choices',origin:{sceneId:scene.id,analysisId:'river-price'},routes:[{id:'call',label:title('跟注 · 支付 6 BB'),sceneId:scene.id,startAnalysisId:'river-price',endAnalysisId:'call-end'},{id:'fold',label:title('弃牌 · 不再投入'),sceneId:scene.id,startAnalysisId:'river-price',endAnalysisId:'fold-end'}]}})));
  scene.branches=[{id:'fold-line',from:'compare',label:title('同一决定选择弃牌'),beats:[actions('fold-end','弃牌后的状态',[{seat:'btn',type:'fold'}])]}];
  scene.analysis.push(
    analysis('weighted',{beatId:'river-bet'},'九个等权组合的明确假设',{assumptions:title('六个暗三条组合、三个 KJ 空气组合，均为权重 1；没有人群频率估计。'),conditions:title('无抽水河牌单底池，跟注后结束下注。'),range:{seat:'bb',entries:weightedHands.map(hand=>({hand,weight:1}))},metrics:['spr','equity','callEV'],calculation:'potOdds',evidence:hypothesis('有限、完整列出的九组合范围；跟注 EV 相对当前弃牌。')}),
    analysis('low-bluff',{beatId:'river-bet'},'同样价格，减少一个诈唬组合',{conditions:title('范围变为六个价值与两个空气组合；其余当前事实不变。'),range:{seat:'bb',entries:weightedHands.slice(0,-1).map(hand=>({hand,weight:1}))},metrics:['equity','callEV'],calculation:'potOdds',evidence:hypothesis('与九组合版本的单一范围条件对照。')}),
    analysis('call-end',{beatId:'call'},'跟注后的资金状态',{conditions:title('只展示动作后状态，不揭示对手底牌，不代表一次结果就是 EV。')}),
    analysis('fold-end',{beatId:'fold-end'},'弃牌后的资金状态',{conditions:title('同一起点的另一动作；这条分支没有发生在主线。')})
  );
  return estimate(scene);
}

export function fullEquilibriumLesson(){
  const scene=equilibriumLesson();scene.id='full-equilibrium';scene.title=title('第 2 集 · 频率、依据和模型边界');
  for(const beat of scene.beats)if(beat.actions?.length)beat.presentation={surface:'table',motion};
  scene.beats.find(b=>b.id==='defend').presentation=canvas('polar-model',['conditions','evidence'],{title:title('空气的 EV：½ × 10 − ½ × 10 = 0'),annotations:[{id:'half-path',type:'path',points:[[.56,.60],[.63,.64],[.69,.58],[.77,.62]],color:'#f7cc68',width:3}]});
  addBefore(scene,'model-call',
    talk('solver-data','一半跟注是什么意思','看这张 Q Q：在刚才限定的河牌模型里，一半跟，一半弃。这是我拿着这手牌时怎么选动作，不是说对手有一半诈唬，也不是说我的胜率有一半。对手下注里的诈唬是三分之一，我的跟注频率却是一半。两个分母，千万别混。',canvas('strategy-import',['range','evidence'],{rangeView:{mode:'matrix',metric:'frequency',action:'call'},annotations:[ring('qq-policy','hand:QQ')]})),
    talk('source-limit','哪些条件一变就要重算','这套频率有用，是因为刚才检查过双方改打法还能不能多赚。它只回答这道题：固定满池 All-in、价值和空气各半、没有抽水。换成小注、加上加注空间，或者改变范围，都得重新算。记住推理怎么走，比背住一个百分之五十更值钱。',canvas('strategy-import',['evidence','conditions'],{annotations:[label('model-limit','hero','固定尺寸与范围下的均衡')]}))
  );
  scene.analysis.push(analysis('strategy-import',{beatId:'model-bet'},'当前决定的结构化策略附件',{conditions:title('有限模型，防守者只允许跟注或弃牌；50% 频率不适用于任意普通牌局。'),evidence:{kind:'hypothesis',model:title('来自本项目有限模型推导的格式适配，不是商业求解器输出。')}}));
  return estimate(scene);
}

function nextSessionScene(project,sourceSceneId,id,heading,holes,notes=[]){return continueSession(project,{sourceSceneId,id,title:title(heading),holes,observations:notes,level:{bigBlind:1,smallBlind:.5,unit:'BB',buttonRule:'moving'}});}
export function fullSessionInputs(first){
  const project={lesson:{scenes:[first]}};
  const firstNote={id:'earlier-bluff',sceneId:first.id,beatId:'showdown',actionIndex:0,seatId:'bb',kind:'observed',text:title('上一手 Northstar 在这条路线下注并在摊牌亮出 KsJh；这是一手样本。')};
  const second=nextSessionScene(project,first.id,'full-session-2','第 3 集 · 连续实战中的观察与更新',{btn:['Kc','Jc'],bb:['As','8h']},[firstNote]);
  project.lesson.scenes.push(second.scene);project.lesson.session=second.session;
  const s=second.scene;
  s.beats=[
    talk('setup','沿用真实前史进入下一手','接着第一集继续打。筹码来自那一手的实际结算，按钮向前移动，Northstar 现在在小盲，我在CO 位，也就是按钮右手一位拿梅花 K J。上一手我们确实见到他用 K J 诈唬，但只有一手样本。它能证明他做过这件事，不能证明他在任何牌面、任何尺寸下都会频繁诈唬。我们保留这条观察，也保留不确定性。',{surface:'table',focus:['hero','seat:bb'],annotations:[label('observed-history','seat:bb','已观察：一次河牌诈唬摊牌')]}),
    actions('preflop','新位置下进入单挑',[{seat:'hj',type:'fold'},{seat:'co',type:'fold'},{seat:'btn',type:'raise',to:2.5},{seat:'sb',type:'fold'},{seat:'bb',type:'call'},{seat:'utg',type:'fold'}]),
    actions('flop','J 高翻牌',[{type:'deal',cards:['Jd','8c','3s']},{seat:'bb',type:'check'}]),
    talk('flop-plan','先看这手牌的价值目标','J、八、三，我们中了顶对。这里先按当前牌面考虑更弱的 J、八和部分听牌，示范下注二点八。上一手他的诈唬不会自动让这些牌变多，也不意味着我们应该在任何时候加大底池。我现在关心的是这笔下注向谁收费，被加注以后怎样重新划范围。',{surface:'table',focus:['hero','board'],camera:{target:'board',scale:1.4,duration:.35}}),
    actions('flop-call','小盲跟注',[{seat:'btn',type:'bet',to:2.8},{seat:'bb',type:'call'}]),
    actions('turn','A 转牌双方过牌',[{type:'deal',cards:['Ah']},{seat:'bb',type:'check'},{seat:'btn',type:'check'}]),
    talk('turn-thought','更新牌面信息','红桃 A 让部分 A 高超过了我们，某些两对也出现了。我们的两张手牌没有变，相对强度却变了。圈出的 A 是本手公开的新事实；上一手见过一次诈唬，是另一条历史事实。我们不能让后一条信息压过当前牌面，也不能把“可能有 A”说成“他一定有 A”。',{surface:'table',focus:['card:Ah','hero'],annotations:[ring('ace','card:Ah'),{id:'ace-to-range',type:'arrow',from:'card:Ah',to:'hero'},label('update','hero','牌没变，相对强度变了')]}),
    actions('river-bet','面对满池下注',[{type:'deal',cards:['2h']},{seat:'bb',type:'bet',to:11.6}]),
    talk('question','检验独立判断','现在他打满池。先算价格，再说范围。假如你认为这一条路线只有三个价值组合和一个诈唬组合，等权，K J 应该怎么做？这只是一个明确给定的练习范围。请不要用刚刚那一次诈唬，直接把它改成自己喜欢的比例。', {surface:'table',question:title('三个价值、一个诈唬：满池价格下如何选择？')}),
    {id:'pause',label:title('留白'),hold:5,presentation:{surface:'table'},sound:{quiet:true}},
    talk('reason','把选择和前提一起说出来','满池下注要求跟注达到三分之一的盈亏平衡权益。这个练习范围只给四分之一，所以在限定的跟或弃选择里，弃牌更好。如果你有另外的观察支持更多诈唬，可以改范围再算，但必须说清楚证据和权重。好读牌是可以被新事实修正的判断，不是把一个人固定叫成“爱诈唬的玩家”。',canvas('session-price',['range','metrics','calculation','conditions'],{rangeView:{mode:'combos',metric:'weight'}})),
    actions('fold','按给定假设弃牌',[{seat:'btn',type:'fold'}]),
    talk('no-reveal','不拿未知底牌替自己证明','这手没摊牌，我不知道他拿什么，只记下这条路线里的一次满池下注。弃牌有没有道理，要回头检查价格和范围，不能靠猜他的底牌给自己颁奖。带着结算后的筹码，继续下一手。',{surface:'table',camera:null})
  ];
  s.analysis=[analysis('session-price',{beatId:'river-bet'},'一个明确的低诈唬练习范围',{range:{seat:'bb',entries:['As8h','AdJs','8d8h','QsTs'].map(hand=>({hand,weight:1}))},metrics:['equity','callEV'],calculation:'potOdds',conditions:title('三个价值、一个空气组合等权；此假设不是从上一手诈唬自动估计出来。'),evidence:hypothesis('连续实战背景中的显式练习范围；对手真实底牌未公开。')})];
  estimate(s);
  const third=nextSessionScene(project,s.id,'full-session-3','第 3 集 · 下一手检验调整',{btn:['9s','9h'],bb:['Ah','Kh']});
  project.lesson.scenes.push(third.scene);project.lesson.session=third.session;
  third.scene.beats=[
    talk('setup','再换一个决策任务','按钮又移了一格。Northstar 在按钮位，我在HJ 位，也就是 CO 右手一位拿一对九。这里的问题已经不同：上一手是在河牌抓诈唬，这一手要从翻前建立计划。我们保留他曾经亮出一次诈唬的记录，却不把那条记录当成无限的进攻许可。对手的座位和双方后手也已经变化，画面会跟着真实结算更新。',{surface:'table',focus:['hero','seat:bb'],annotations:[label('different-question','hero','新任务：如何获得价值')]}),
    actions('preflop','面对按钮再加注',[{seat:'co',type:'fold'},{seat:'btn',type:'raise',to:2.5},{seat:'sb',type:'fold'},{seat:'bb',type:'raise',to:8},{seat:'utg',type:'fold'},{seat:'hj',type:'fold'},{seat:'btn',type:'call'}]),
    actions('flop','暗三条面对下注',[{type:'deal',cards:['9d','6c','2h']},{seat:'btn',type:'check'},{seat:'bb',type:'bet',to:5}]),
    talk('flop-choice','强牌也要想谁会继续','九、六、二，彩虹面，我中了顶暗三条。他在十七点五的池里打五个，我准备先跟。加注可能赶走 A K、A Q；TT 到 AA 这些超对，两条路线都可能收得到钱。先跟，是拿这一街少收一点，换他后面继续下注的机会。转牌若来 A 或 K，高张可能成对；如果他突然打很大，我也会重新比较跟注与加注。慢打一街，不等于后面都慢打。',{surface:'table',camera:{target:'hero',scale:1.45,duration:.4},annotations:[ring('set-card','card:9d'),{id:'keep-air',type:'arrow',from:'seat:bb',to:'pot'}]}),
    actions('flop-call','跟注保留范围',[{seat:'btn',type:'call'}]),
    actions('turn','K 转牌过牌',[{type:'deal',cards:['Kd']},{seat:'btn',type:'check'},{seat:'bb',type:'check'}]),
    actions('river-card','河牌发出',[{type:'deal',cards:['3c']}]),
    talk('river-plan','从保留范围走向价值下注','河牌梅花三。四五成顺了，不过它有没有进翻前的 3bet 范围，还得看对手。转牌 K 他过牌，A K、K Q 可能想控池，TT 到 QQ 也可能愿意抓一枪。现在池里二十七点五，我准备打十二，让这些更差的成手付钱。若被加注，再看他会不会拿更小的暗三条这样打，以及 K K、四五和诈唬各有多少。拿着强牌，也得知道这枪向谁收钱。',{surface:'table',focus:['board','hero'],annotations:[ring('new-value','card:Kd')]}),
    actions('river','河牌价值下注',[{seat:'btn',type:'bet',to:12},{seat:'bb',type:'call'}]),
    actions('showdown','实际结算',[{type:'showdown'}]),
    talk('review','什么真的增加了我们的知识','这次看见了 A K，结算后的筹码继续保存。两次摊牌提供了两条不同情境下的事实，夹在中间的弃牌没有底牌答案。我们不能用三手小样本报告精确的对手频率，但可以描述他实际做过的动作，并据此提出需要更多观察的假设。练习页会让你重新回答条件变化题，而不是只问你记不记得这次赢了。',{surface:'table',camera:null})
  ];
  estimate(third.scene);
  return {scenes:[s,third.scene],session:project.lesson.session};
}

export function tournamentLesson(){
  const start=createHand({seats:[{id:'hero',name:'riverpilot',stack:25,hole:['As','Kd']},{id:'rival',name:'Northstar',stack:25,hole:[]},{id:'leader',name:'BlueFin',stack:50,hole:[]}],button:'hero',hero:'hero',bigBlind:2,smallBlind:1,bigBlindAnte:2,unit:'chips'});
  return estimate({id:'tournament-boundary',title:title('赛事边界 · 筹码和奖金不是同一个目标'),start,beats:[
    talk('setup','计价和BBA','再换到一个三人赛事模型。筹码单位直接写 chips，盲注是一、二，大盲另外支付二的 ante。盲注升级不会凭空减少任何人的筹码，也不会把二十五筹码显示成二十五个当前大盲。Ante 是全桌共享的死钱，不算大盲已经完成的活下注；短筹码时，先支付活盲注。',{surface:'table',focus:['pot','hero']}),
    talk('icm','明确说明ICM假设','奖金为五十、三十、二十。假设两个二十五筹码的玩家做一场各半概率的输赢，赢家得到五十，输家归零，另一名五十筹码的玩家不变。平均筹码变化是零，ICM 奖金期望却可以下降。这不是在推荐当前手牌做这个赌博，而是在展示筹码收益和奖金收益的口径差别。ICM 还假设未来技术相同，不考虑位置、未来盲注和赏金。',canvas('icm',['metrics','conditions','evidence']))
  ],analysis:[analysis('icm',{beatId:'setup'},'相同筹码期望，不同奖金期望',{conditions:title('完整三人奖金结构；假设结果非当前手牌的求解策略。'),tournament:{unit:'prize units',payouts:[50,30,20],outcomes:[{id:'win',label:title('假设赢'),probability:.5,stacks:[{id:'hero',stack:50},{id:'rival',stack:0},{id:'leader',stack:50}]},{id:'lose',label:title('假设输'),probability:.5,stacks:[{id:'hero',stack:0},{id:'rival',stack:50},{id:'leader',stack:50}]}]},evidence:hypothesis('等技术 ICM 的独立假设结果比较；未把该分布当成当前真实手牌权益。')})]});
}

export function rakeLesson(){
  return estimate({id:'rake-boundary',title:title('现金局边界 · 抽水改变净价格'),start:{street:'river',board:['Qd','7c','2s','Tc','4d'],button:'hero',hero:'hero',actor:'rival',rake:{rate:.05,cap:1,noFlopNoDrop:true},seats:[{id:'hero',name:'riverpilot',stack:20,contributed:5,hole:['Ah','Qh']},{id:'rival',name:'Northstar',stack:20,contributed:5,hole:['Ks','Jh']}]},beats:[actions('bet','面对满池下注',[{seat:'rival',type:'bet',to:10}]),talk('net-price','分清毛池与净池','最后看抽水。这个教学模型按底池百分之五收取，每手最多一个筹码单位，向下取到最小单位，没见翻牌不收。跟注后毛池是三十，预计抽水一个，净池二十九。跟十个的门槛因此高于三分之一。你要按实际牌室的规则填写模型，包括上限、舍入和是否抽翻前池，不能把无抽水结论原样搬过来。',canvas('net-price',['calculation','conditions'],{annotations:[ring('net','calculation')]})),actions('call','跟注并结算',[{seat:'hero',type:'call'},{type:'showdown'}])],analysis:[analysis('net-price',{beatId:'bet'},'净可争夺底池',{calculation:'potOdds',conditions:title('教学抽水模型：5%，每手cap=1，向下舍入，no-flop-no-drop；不声称匹配特定牌室。')})]});
}

export function outsLesson(){
  return estimate({id:'outs-boundary',title:title('听牌边界 · 成牌不等于稳赢'),start:{street:'turn',board:['Jh','7h','2c','9s'],button:'hero',hero:'hero',actor:'rival',seats:[{id:'hero',name:'riverpilot',stack:30,contributed:10,hole:['Ah','Kh']},{id:'rival',name:'Northstar',stack:30,contributed:10,hole:[]}]},beats:[talk('setup','干净与不干净的出路','A K 红桃听花，看见红桃别急着全算成干净出路。对面先给 J J、七七和 J 九这三个等权组合。河牌红桃九，我虽然成花，暗三条却成了葫芦，J 九也成了葫芦；红桃二能赢 J 九，却仍输给暗三条补成的葫芦。成牌是一回事，成牌以后能赢谁，是另一回事。逐张看这个范围，才知道哪些补牌真能帮我。',canvas('outs',['metrics','range','conditions'],{rangeView:{mode:'combos',metric:'weight'}}))],analysis:[analysis('outs',{beatId:'setup'},'逐张河牌检查',{range:{seat:'rival',entries:[{hand:'JsJd',weight:1},{hand:'7c7d',weight:1},{hand:'Jc9c',weight:1}]},metrics:['spr','equity','outs'],equityOptions:{method:'exact'},conditions:title('明确列出的三组合等权范围；权益与出路只对这组假设成立。')})]});
}

export function fullLocalizedProbe(){
  const scene=localizedProbe();scene.id='full-localized-probe';
  for(const beat of scene.beats)if(beat.actions?.length)beat.presentation={surface:'table',motion};
  scene.beats.find(b=>b.id==='question').presentation.annotations=[ring('formula','calculation'),{id:'price-label',type:'label',target:'hero',text:words('价格 ≠ 频率','Price ≠ frequency','価格 ≠ 頻度')}];
  scene.beats[1].narration['zh-CN']=scene.beats[1].narration['zh-CN'].replaceAll('全下','All-in');
  return estimate(scene);
}

export function fullCourseInputs(){
  const first=fullPriceLesson(),second=fullEquilibriumLesson(),session=fullSessionInputs(first),rake=rakeLesson(),tournament=tournamentLesson(),outs=outsLesson(),probe=fullLocalizedProbe();
  const pairedHands=[...weightedHands,'QsTd','QcTh','QsTs'];
  first.analysis.push(analysis('board-baseline',{beatId:'river-bet'},'原牌面：相同十二组合',{range:{seat:'bb',entries:pairedHands.map(hand=>({hand,weight:1}))},metrics:['equity','callEV'],calculation:'potOdds',evidence:hypothesis('两边固定十二个等权组合，只比较转牌变化。')}));
  const turnVariant=createVariant(first,{id:'full-price-turn-ace',title:title('单变量：把转牌 T 换成 A'),change:{kind:'board',beatId:'turn',actionIndex:0,cardIndex:0,card:'Ad'}});
  // A counterfactual is a new teaching argument: remove the old spoken claim and rebuild its material.
  turnVariant.beats=turnVariant.beats.filter(b=>b.actions?.length&&['preflop','flop','flop-bet','turn','river-bet'].includes(b.id));delete turnVariant.branches;
  turnVariant.beats.push(talk('changed-condition','改变公共牌后重审结论','这次两边都固定成同样十二个等权组合：六个暗三条，三个 K J，三个 Q T。原来转牌 T，Q T 是两对，我只赢三个 K J，权益百分之二十五。转牌换成 A，我的 A Q 成了更大的两对，也能赢 Q T，权益升到百分之五十。价格仍是百分之二十八点四，因此同一范围下，跟注从亏零点七二五，变成赚四点五五个大盲。这里单独检查一张牌的影响；实战中，对手的下注范围也可能跟着牌面调整。',canvas('changed',['metrics','calculation','conditions'],{annotations:[ring('new-ace','card:Ad')]})));
  turnVariant.analysis=[analysis('changed',{beatId:'river-bet'},'同样范围下的转牌变化',{range:{seat:'bb',entries:pairedHands.map(hand=>({hand,weight:1}))},metrics:['equity','callEV'],calculation:'potOdds',conditions:title('两边固定十二个等权组合，只比较转牌变化。'),evidence:hypothesis('两边固定十二个等权组合，只比较转牌变化。')})];estimate(turnVariant);
  const all=[first,second,...session.scenes,outs,rake,tournament,turnVariant,probe];
  const thirdMembers=[session.scenes[0].id,session.scenes[1].id];
  const course={id:'full-decision-course',title:title('决策、依据与连续实战'),prerequisites:title('熟悉德州基本规则、位置、下注与底池。'),objectives:title('能说明事实、价格、范围依据、选择代价和改变判断的条件，并完成新的条件题。'),style:title('单人第一视角；先说当时看到什么，再说判断；口语化且不把假设说成已知。只在实战行动之外切入分析。'),terminology:[{id:'equity',term:words('权益','Equity','エクイティ'),definition:words('给定范围与剩余牌下的底池份额期望。','Expected share of the pot against a stated range and runouts.','指定レンジとランアウトに対するポット持分の期待値。')},{id:'frequency',term:words('行动频率','Action frequency','アクション頻度'),definition:title('相同模型条件下选择某动作的比例。')},{id:'allin',term:words('All-in','All-in','オールイン')}],concepts:[{id:'price',description:title('价格门槛与范围权益分别计算'),conditions:title('注意抽水与跟注后是否继续下注。')},{id:'evidence',description:title('策略数据必须对应同一模型与决定')},{id:'transfer',description:title('公开前史与新事实共同更新判断')}],episodes:[{id:'episode-1',sceneId:first.id,introduces:['price'],objective:title('用明确范围比较价格与权益，再解释动作代价。'),check:title('将九组合改为八组合，解释为什么选择改变。')},{id:'episode-2',sceneId:second.id,requires:['price'],introduces:['evidence'],recaps:['price'],objective:title('区分三种分母，并检查策略依据与模型条件。'),check:title('说明频率、权益、范围占比为什么不同。')},{id:'episode-3',sceneId:thirdMembers[0],sceneIds:thirdMembers,requires:['price','evidence'],introduces:['transfer'],objective:title('在连续两手中保留真实前史，并对新的事实作出调整。'),check:title('一次已见诈唬能证明什么，不能证明什么？')}]};
  first.analysis.push(analysis('transfer-weights',{beatId:'river-bet'},'相同牌类，不同权重',{range:{seat:'bb',entries:weightedHands.map((hand,i)=>({hand,weight:i<6?1:.5}))},metrics:['equity','callEV'],calculation:'potOdds',evidence:hypothesis('六个价值组合权重1，三个诈唬组合各权重0.5。')}));
  const practice={id:'full-course-practice',title:words('复习与迁移练习','Recall and transfer','復習と応用'),questions:[
    {id:'price-versus-range',sceneId:first.id,node:{beatId:'river-bet'},analysisId:'weighted',prompt:title('复习：当前明确九个等权组合：六个价值、三个诈唬。在限定跟或弃下，哪项判断成立？'),choices:[{id:'call',text:title('给定范围权益高于价格门槛，跟注增量 EV 为正')},{id:'automatic',text:title('顶对顶踢脚在任何范围下都必须跟注')},{id:'frequency',text:title('28.44% 就是应采用的跟注频率')}],correctChoiceIds:['call'],explanation:title('这是当前明确范围下的判断。三分之一的权益超过约28.44%的价格门槛；两者都不是行动频率。'),objective:title('区分价格、权益与频率')},
    {id:'new-range',sceneId:first.id,node:{beatId:'river-bet'},analysisId:'low-bluff',prompt:title('复习：条件改为六个价值、两个诈唬，等权，价格不变。哪项成立？'),choices:[{id:'fold',text:title('权益变为25%，在限定跟或弃下弃牌更好')},{id:'same',text:title('价格没变，所以答案一定不变')}],correctChoiceIds:['fold'],explanation:title('变的是范围，不是牌局价格。新范围权益低于价格门槛，因此必须重审原结论。')},
    {id:'history',sceneId:session.scenes[0].id,node:{beatId:'river-bet'},prompt:title('复习：上一手确实见到 Northstar 诈唬。这能直接推出哪些结论？'),choices:[{id:'observed',text:title('他在那一条已记录路线中至少诈唬过一次')},{id:'all',text:title('他在所有河牌尺寸下都诈唬过多')},{id:'sample',text:title('一手样本不足以给当前范围精确估计诈唬比例')}],correctChoiceIds:['observed','sample'],explanation:title('观察可以核对，推广到其他牌面与尺寸的结论仍是推断。前史为新假设提供线索，不提供无限保证。')}
    ,{id:'weighted-transfer',sceneId:first.id,node:{beatId:'river-bet'},analysisId:'transfer-weights',prompt:title('新条件：六个价值组合各权重1，三个诈唬组合各权重0.5，价格不变。限定跟或弃，哪项正确？'),choices:[{id:'fold',text:title('诈唬权重占20%，跟注EV为−1.78 BB，选择弃牌')},{id:'count',text:title('仍有三个诈唬组合，所以权益仍是三分之一')}],correctChoiceIds:['fold'],explanation:title('总权重为7.5，能赢的权重为1.5。权益20%，跟注EV为0.2×21.1−6=−1.78 BB。要看权重，不能只数牌类。')}
  ],attempts:[]};
  const output=(sceneId,locale='zh-CN',aspect='landscape',sequence)=>({locale,aspect,profile:'final',sceneId,branchId:null,captions:true,...(sequence?{sequence:sequence.map((id,i)=>({id:`part-${i+1}`,sceneId:id,branchId:null}))}:{})});
  const deliverables=course.episodes.flatMap(e=>['landscape','portrait'].map(aspect=>({id:`${e.id}-${aspect}`,title:words(`第 ${e.id.slice(-1)} 集 · ${aspect==='landscape'?'横版':'竖版'}`,`Episode ${e.id.slice(-1)} · ${aspect==='landscape'?'Landscape':'Portrait'}`,`第${e.id.slice(-1)}回 · ${aspect==='landscape'?'横型':'縦型'}`),output:output(e.sceneId,'zh-CN',aspect,e.sceneIds)})));
  for(const locale of ['en-US','ja-JP'])for(const e of course.episodes)for(const aspect of ['landscape','portrait'])deliverables.push({id:`${e.id}-${locale}-${aspect}`,title:words(`第 ${e.id.slice(-1)} 集 · ${aspect==='landscape'?'横版':'竖版'}`,`Episode ${e.id.slice(-1)} · ${aspect==='landscape'?'Landscape':'Portrait'}`,`第${e.id.slice(-1)}回 · ${aspect==='landscape'?'横型':'縦型'}`),output:output(e.sceneId,locale,aspect,e.sceneIds)});
  for(const locale of ['en-US','ja-JP'])for(const aspect of ['landscape','portrait'])deliverables.push({id:`probe-${locale}-${aspect}`,title:words('语言适配短片','Localized probe','言語別ショート'),output:output(probe.id,locale,aspect)});
  deliverables.push({id:'research-extras',title:title('变式、听牌、抽水与ICM'),output:output(turnVariant.id,'zh-CN','landscape',[turnVariant.id,outs.id,rake.id,tournament.id])});
  const short=structuredClone(first);short.id='full-short';short.title=title('竖版短课 · 少一个诈唬就能改变判断');short.beats=short.beats.filter(b=>b.actions?.length&&['preflop','flop','flop-bet','turn','river-bet'].includes(b.id)||['question','thinking-pause','price','weighted','missing-bluff'].includes(b.id));delete short.branches;short.analysis=short.analysis.filter(a=>['river-price','weighted','low-bluff'].includes(a.id));all.push(short);deliverables.push({id:'decision-short',title:title('独立竖版短课'),output:output(short.id,'zh-CN','portrait')});
  const input=localizeFullCourse({lesson:{scenes:all,course,session:session.session,practice},deliverables,sound:{effects:{enabled:true,volume:.24},ducking:{enabled:true,reductionDB:12,attack:.08,release:.25},loudness:{integrated:-18,truePeak:-1.5,range:9}}});
  // Spoken readings are scoped to numeric passages; captions keep poker notation.
  const japaneseReadings={
    'full-price':{
      'preflop-plan':{'2.5':'にてんご','A Q':'エースクイーン'},
      'flop-plan':{'Q、7、2':'クイーン、なな、に','Q':'クイーン'},
      range:{'K J':'キングジャック','J 9':'ジャックナイン','Q':'クイーン'},
      price:{'15.1':'じゅうごてんいち','21.1':'にじゅういちてんいち','28.4%':'にじゅうはちてんよんパーセント','6BB':'ろくビッグブラインド','6を':'ろくを','BB':'ビッグブラインド','A Q':'エースクイーン'}
    },
    'full-equilibrium':{
      'solver-data':{'QQ':'ポケットクイーン','3分の1':'さんぶんのいち','2分の1':'にぶんのいち'},
      conclusion:{'2分の1':'にぶんのいち'}
    },
    'full-session-2':{'flop-plan':{'2.8':'にてんはち','J':'ジャック'}},
    'full-session-3':{setup:{'99':'ポケットナイン'},'flop-choice':{'9、6、2のレインボーでトップセットです。':'フロップは、ナイン、シックス、デュース。レインボーのボードで、トップセットです。','17.5のポットに5のベット。':'ポットは、じゅうななてんごビッグブラインド。相手のベット額は、ごビッグブラインドです。','AK':'エースキング','AQ':'エースクイーン','TT':'ポケットテン','AA':'ポケットエース'},'river-plan':{'54':'ファイブフォー','ポット27.5に12を打ち、そうした弱いハンドから取るつもりです。':'ポットは、にじゅうななてんごビッグブラインド。ここで、じゅうにビッグブラインドをベットして、そうした弱いハンドから取るつもりです。','クラブの3':'クラブのスリー','TT':'ポケットテン','QQ':'ポケットクイーン','KK':'ポケットキング','AK':'エースキング','KQ':'キングクイーン','Kの':'キングの','3ベット':'スリーベット'}}
  };
  japaneseReadings['full-short']=japaneseReadings['full-price'];
  for(const scene of input.lesson.scenes)for(const beat of scene.beats){
    const pronunciations=japaneseReadings[scene.id]?.[beat.id];
    if(pronunciations)beat.delivery={...beat.delivery,'ja-JP':{pronunciations}};
  }
  const riverThought=input.lesson.scenes.find(s=>s.id==='full-session-3').beats.find(b=>b.id==='river-plan');
  riverThought.delivery={...riverThought.delivery,'zh-CN':{speed:.76,pronunciations:{'现在池里二十七点五，我准备打十二，':'现在底池是二十七点五个大盲。我准备下注十二个大盲，'}}};
  input.lesson.scenes.find(s=>s.id==='tournament-boundary').beats.find(b=>b.id==='icm').delivery={'zh-CN':{pronunciations:{'奖金为五十、三十、二十。':'奖金依次是：第一名，五十；第二名，三十；第三名，二十。'}}};
  for(const scene of all)estimate(scene);
  // Translating an observation changes its authored text, so explicitly review that note again.
  input.lesson.session=reviewSession(input,input.lesson.session);
  return input;
}

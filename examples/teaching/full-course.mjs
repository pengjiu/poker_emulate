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
    talk('combos','牌类不是一个组合','把 K J 展开。我们这次只列了三个具体花色组合，绝不把整个 K J 自动当成十二个组合。矩阵里的格子表示牌类，展开后才是实际参与计算的组合。若手里或牌面上出现同一张牌，对应组合必须删去。筛选只是帮助我们看清某一部分，不会把筛选后的数字偷偷改成完整范围。',canvas('weighted',['range','metrics'],{rangeView:{mode:'combos',metric:'weight',hand:'KJo'},annotations:[label('weights','hero','明确假设：九个等权组合')]})),
    talk('missing-bluff','少一个诈唬会怎样','现在保留六个价值组合，只留两个诈唬。不是改下注价格，而是改范围假设。权益降到四分之一，低于这个价格需要的门槛，跟注的期望收益也转为负数。两幅牌桌看起来完全一样，答案却可以改变。真正改变结论的是范围里的相对权重，而不是“顶对顶踢脚”这个名字。',canvas('low-bluff',['range','metrics','calculation'],{rangeView:{mode:'matrix',metric:'rangeShare'}}))
  );
  scene.beats.find(b=>b.id==='choice').narration=title('刚才少一个诈唬，是用来检验边界的反例。现在回到六个价值、三个诈唬的九组合假设，用它走主线。在这个假设下，跟注相对弃牌的增量期望收益为正。加注可能赶走空气、留下更强的继续范围；若要严格比较加注，还需要说明对手怎样回应。我们没有求解那棵树，所以这里只在跟与弃之间选择跟注，不把它说成所有动作里唯一最优。');
  scene.beats.find(b=>b.id==='choice').presentation=canvas('weighted',['range','metrics','conditions'],{rangeView:{mode:'matrix',metric:'rangeShare'},annotations:[label('restore-assumption','hero','主线：恢复九组合假设')]});
  addBefore(scene,'call',talk('compare','两条路线从同一个决定出发','再把跟注和弃牌并排看。两条路线从完全相同的六个大盲下注开始，右侧只演示我们选完动作以后，筹码和底池怎样变化。这里没有提前摊牌，也没有把这一条演示的输赢写成期望收益。期望收益来自刚才明确的范围模型；动作对照负责说明代价。看完后，我们回到仍然轮到自己行动的牌桌。',canvas('river-price',['comparison'],{comparison:{mode:'choices',origin:{sceneId:scene.id,analysisId:'river-price'},routes:[{id:'call',label:title('跟注 · 支付 6 BB'),sceneId:scene.id,startAnalysisId:'river-price',endAnalysisId:'call-end'},{id:'fold',label:title('弃牌 · 不再投入'),sceneId:scene.id,startAnalysisId:'river-price',endAnalysisId:'fold-end'}]}})));
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
    talk('solver-data','把推导变成可检查的数据','现在把刚才经过最佳回应检查的策略，按统一的数据格式附在这个决定上。画面中的一半跟注、一半弃牌，属于当前这张抓诈唬牌，在限定的跟或弃模型下的行动频率。它不是对手范围里空气的占比，也不是这张牌的权益。资料还记录牌面、筹码、允许动作和算法说明；换成另一个决定，旧数据不能继续冒充当前答案。',canvas('strategy-import',['range','evidence'],{rangeView:{mode:'matrix',metric:'frequency',action:'call'},annotations:[ring('qq-policy','hand:QQ')]})),
    talk('source-limit','确认附件不等于证明任何策略','系统能检查附件有没有被替换，输入是不是当前节点，策略的动作是否合法。它不能因为文件上写着“solver”就证明一个任意答案最优。这份示范另外保留了有限模型的独立最佳回应推导。实际接入其他求解器时，还要检查它的抽水、行动树、范围、精度和约束，不能只拿到一张漂亮矩阵就结束。',canvas('strategy-import',['evidence','conditions'],{annotations:[label('model-limit','hero','数据完整性和策略正确性分开检查')]}))
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
    talk('setup','沿用真实前史进入下一手','接着第一集继续打。筹码来自那一手的实际结算，按钮向前移动，Northstar 现在在小盲，我在关煞位拿梅花 K J。上一手我们确实见到他用 K J 诈唬，但只有一手样本。它能证明他做过这件事，不能证明他在任何牌面、任何尺寸下都会频繁诈唬。我们保留这条观察，也保留不确定性。',{surface:'table',focus:['hero','seat:bb'],annotations:[label('observed-history','seat:bb','已观察：一次河牌诈唬摊牌')]}),
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
    talk('no-reveal','不拿未知底牌替自己证明','我们弃了，这一手没有摊牌。我不知道他究竟拿什么，也不能在复盘里偷偷翻出预先安排的底牌，证明自己读得准。当前能检查的是行动是否合法、价格是否算对、假设是否说清。这些都能成立，而结果依旧保持未知。下一手继续沿用真实筹码，不重置成一百个大盲。',{surface:'table',camera:null})
  ];
  s.analysis=[analysis('session-price',{beatId:'river-bet'},'一个明确的低诈唬练习范围',{range:{seat:'bb',entries:['As8h','AdJs','8d8h','QsTs'].map(hand=>({hand,weight:1}))},metrics:['equity','callEV'],calculation:'potOdds',conditions:title('三个价值、一个空气组合等权；此假设不是从上一手诈唬自动估计出来。'),evidence:hypothesis('连续实战背景中的显式练习范围；对手真实底牌未公开。')})];
  estimate(s);
  const third=nextSessionScene(project,s.id,'full-session-3','第 3 集 · 下一手检验调整',{btn:['9s','9h'],bb:['Ah','Kh']});
  project.lesson.scenes.push(third.scene);project.lesson.session=third.session;
  third.scene.beats=[
    talk('setup','再换一个决策任务','按钮又移了一格。Northstar 在按钮位，我在劫煞位拿一对九。这里的问题已经不同：上一手是在河牌抓诈唬，这一手要从翻前建立计划。我们保留他曾经亮出一次诈唬的记录，却不把那条记录当成无限的进攻许可。对手的座位和双方后手也已经变化，画面会跟着真实结算更新。',{surface:'table',focus:['hero','seat:bb'],annotations:[label('different-question','hero','新任务：如何获得价值')]}),
    actions('preflop','面对按钮再加注',[{seat:'co',type:'fold'},{seat:'btn',type:'raise',to:2.5},{seat:'sb',type:'fold'},{seat:'bb',type:'raise',to:8},{seat:'utg',type:'fold'},{seat:'hj',type:'fold'},{seat:'btn',type:'call'}]),
    actions('flop','暗三条面对下注',[{type:'deal',cards:['9d','6c','2h']},{seat:'btn',type:'check'},{seat:'bb',type:'bet',to:5}]),
    talk('flop-choice','强牌也要想谁会继续','翻牌暗三条，先别急着因为强就加注。我想保留他的高张和一部分弱成手，让这些牌还有机会在后续投入。跟注和加注各有代价；加注可以立刻向较强的继续范围收费，也可能把空气赶走。这里示范跟注，是一种路线，不宣称唯一答案。重要的是执行前说出自己希望哪些牌留下。',{surface:'table',camera:{target:'hero',scale:1.45,duration:.4},annotations:[ring('set-card','card:9d'),{id:'keep-air',type:'arrow',from:'seat:bb',to:'pot'}]}),
    actions('flop-call','跟注保留范围',[{seat:'btn',type:'call'}]),
    actions('turn','K 转牌过牌',[{type:'deal',cards:['Kd']},{seat:'btn',type:'check'},{seat:'bb',type:'check'}]),
    talk('river-plan','从保留范围走向价值下注','K 出现后，部分高张变成能支付的成手。到了河牌，我们的目标从“保留他继续诈唬的机会”转成“让更差成手愿意跟注”。这不是前后矛盾，而是街道和信息发生了变化。先确定目标，再选择尺寸；不能把翻牌的慢打当成必须一路过牌的承诺。',{surface:'table',focus:['board','hero'],annotations:[ring('new-value','card:Kd')]}),
    actions('river','河牌价值下注',[{type:'deal',cards:['3c']},{seat:'btn',type:'bet',to:12},{seat:'bb',type:'call'}]),
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
  return estimate({id:'outs-boundary',title:title('听牌边界 · 成牌不等于稳赢'),start:{street:'turn',board:['Jh','7h','2c','9s'],button:'hero',hero:'hero',actor:'rival',seats:[{id:'hero',name:'riverpilot',stack:30,contributed:10,hole:['Ah','Kh']},{id:'rival',name:'Northstar',stack:30,contributed:10,hole:[]}]},beats:[talk('setup','干净与不干净的出路','这里用 A K 红桃听花，面对一个明确列出的强牌范围。看起来能改善手牌的牌，并不一定都让我们赢：配对牌面可能让对手变成葫芦，某些高张也可能继续输给两对或三条。出路面板会逐张河牌检查给定范围下的权益，并把成牌改善与真正的获胜可能分开。它只按当前公共信息和指定范围计算，不读取安排好的下一张牌。',canvas('outs',['metrics','range','conditions'],{rangeView:{mode:'combos',metric:'weight'}}))],analysis:[analysis('outs',{beatId:'setup'},'逐张河牌检查',{range:{seat:'rival',entries:[{hand:'JsJd',weight:1},{hand:'7c7d',weight:1},{hand:'Jc9c',weight:1}]},metrics:['spr','equity','outs'],equityOptions:{method:'exact'},conditions:title('明确列出的三组合等权范围；权益与出路只对这组假设成立。')})]});
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
  const turnVariant=createVariant(first,{id:'full-price-turn-ace',title:title('单变量：把转牌 T 换成 A'),change:{kind:'board',beatId:'turn',actionIndex:0,cardIndex:0,card:'Ad'}});
  // A counterfactual is a new teaching argument: remove the old spoken claim and rebuild its material.
  turnVariant.beats=turnVariant.beats.filter(b=>b.actions?.length&&['preflop','flop','flop-bet','turn','river-bet'].includes(b.id));delete turnVariant.branches;
  turnVariant.beats.push(talk('changed-condition','改变公共牌后重审结论','这次从转牌发生前改动一张公共牌，再由同一规则重放，底池和行动来自新路线。A 替换了 T，英雄的相对强度、某些价值组合和听牌路径都会改变。我们把旧的范围结论撤下，重新声明假设。变式的价值，是指出哪些条件支撑原判断，而不是只给相同讲稿换一张背景牌。',canvas('changed',['conditions'],{annotations:[ring('new-ace','card:Ad')]})));
  turnVariant.analysis=[analysis('changed',{beatId:'river-bet'},'从事件发生前重放的牌面变化',{conditions:title('仅转牌由 Tc 改为 Ad；旧范围与旧讲稿不自动沿用。')})];estimate(turnVariant);
  const all=[first,second,...session.scenes,outs,rake,tournament,turnVariant,probe];
  const thirdMembers=[session.scenes[0].id,session.scenes[1].id];
  const course={id:'full-decision-course',title:title('决策、依据与连续实战'),prerequisites:title('熟悉德州基本规则、位置、下注与底池。'),objectives:title('能说明事实、价格、范围依据、选择代价和改变判断的条件，并完成新的条件题。'),style:title('单人第一视角；先说当时看到什么，再说判断；口语化且不把假设说成已知。只在实战行动之外切入分析。'),terminology:[{id:'equity',term:words('权益','Equity','エクイティ'),definition:words('给定范围与剩余牌下的底池份额期望。','Expected share of the pot against a stated range and runouts.','指定レンジとランアウトに対するポット持分の期待値。')},{id:'frequency',term:words('行动频率','Action frequency','アクション頻度'),definition:title('相同模型条件下选择某动作的比例。')},{id:'allin',term:words('All-in','All-in','オールイン')}],concepts:[{id:'price',description:title('价格门槛与范围权益分别计算'),conditions:title('注意抽水与跟注后是否继续下注。')},{id:'evidence',description:title('策略数据必须对应同一模型与决定')},{id:'transfer',description:title('公开前史与新事实共同更新判断')}],episodes:[{id:'episode-1',sceneId:first.id,introduces:['price'],objective:title('用明确范围比较价格与权益，再解释动作代价。'),check:title('将九组合改为八组合，解释为什么选择改变。')},{id:'episode-2',sceneId:second.id,requires:['price'],introduces:['evidence'],recaps:['price'],objective:title('区分三种分母，并检查策略依据与模型条件。'),check:title('说明频率、权益、范围占比为什么不同。')},{id:'episode-3',sceneId:thirdMembers[0],sceneIds:thirdMembers,requires:['price','evidence'],introduces:['transfer'],objective:title('在连续两手中保留真实前史，并对新的事实作出调整。'),check:title('一次已见诈唬能证明什么，不能证明什么？')}]};
  const practice={id:'full-course-practice',title:words('把判断用到新问题','Apply the method','判断方法を使ってみる'),questions:[
    {id:'price-versus-range',sceneId:first.id,node:{beatId:'river-bet'},analysisId:'weighted',prompt:title('当前明确九个等权组合：六个价值、三个诈唬。在限定跟或弃下，哪项判断成立？'),choices:[{id:'call',text:title('给定范围权益高于价格门槛，跟注增量 EV 为正')},{id:'automatic',text:title('顶对顶踢脚在任何范围下都必须跟注')},{id:'frequency',text:title('28.44% 就是应采用的跟注频率')}],correctChoiceIds:['call'],explanation:title('这是当前明确范围下的判断。三分之一的权益超过约28.44%的价格门槛；两者都不是行动频率。'),objective:title('区分价格、权益与频率')},
    {id:'new-range',sceneId:first.id,node:{beatId:'river-bet'},analysisId:'low-bluff',prompt:title('条件改为六个价值、两个诈唬，等权，价格不变。哪项成立？'),choices:[{id:'fold',text:title('权益变为25%，在限定跟或弃下弃牌更好')},{id:'same',text:title('价格没变，所以答案一定不变')}],correctChoiceIds:['fold'],explanation:title('变的是范围，不是牌局价格。新范围权益低于价格门槛，因此必须重审原结论。')},
    {id:'history',sceneId:session.scenes[0].id,node:{beatId:'river-bet'},prompt:title('上一手确实见到 Northstar 诈唬。这能直接推出哪些结论？'),choices:[{id:'observed',text:title('他在那一条已记录路线中至少诈唬过一次')},{id:'all',text:title('他在所有河牌尺寸下都诈唬过多')},{id:'sample',text:title('一手样本不足以给当前范围精确估计诈唬比例')}],correctChoiceIds:['observed','sample'],explanation:title('观察可以核对，推广到其他牌面与尺寸的结论仍是推断。前史为新假设提供线索，不提供无限保证。')}
  ],attempts:[]};
  const output=(sceneId,locale='zh-CN',aspect='landscape',sequence)=>({locale,aspect,profile:'final',sceneId,branchId:null,captions:true,...(sequence?{sequence:sequence.map((id,i)=>({id:`part-${i+1}`,sceneId:id,branchId:null}))}:{})});
  const deliverables=course.episodes.flatMap(e=>['landscape','portrait'].map(aspect=>({id:`${e.id}-${aspect}`,title:title(`${e.id} ${aspect}`),output:output(e.sceneId,'zh-CN',aspect,e.sceneIds)})));
  for(const locale of ['en-US','ja-JP'])for(const e of course.episodes)for(const aspect of ['landscape','portrait'])deliverables.push({id:`${e.id}-${locale}-${aspect}`,title:title(`${e.id} ${aspect}`),output:output(e.sceneId,locale,aspect,e.sceneIds)});
  for(const locale of ['en-US','ja-JP'])for(const aspect of ['landscape','portrait'])deliverables.push({id:`probe-${locale}-${aspect}`,title:words('语言适配短片','Localized probe','言語別ショート'),output:output(probe.id,locale,aspect)});
  deliverables.push({id:'research-extras',title:title('变式、听牌、抽水与ICM'),output:output(turnVariant.id,'zh-CN','landscape',[turnVariant.id,outs.id,rake.id,tournament.id])});
  const short=structuredClone(first);short.id='full-short';short.title=title('竖版短课 · 少一个诈唬就能改变判断');short.beats=short.beats.filter(b=>b.actions?.length&&['preflop','flop','flop-bet','turn','river-bet'].includes(b.id)||['question','thinking-pause','weighted','missing-bluff'].includes(b.id));delete short.branches;short.analysis=short.analysis.filter(a=>['weighted','low-bluff'].includes(a.id));all.push(short);deliverables.push({id:'decision-short',title:title('独立竖版短课'),output:output(short.id,'zh-CN','portrait')});
  const input=localizeFullCourse({lesson:{scenes:all,course,session:session.session,practice},deliverables,sound:{effects:{enabled:true,volume:.24},ducking:{enabled:true,reductionDB:12,attack:.08,release:.25},loudness:{integrated:-18,truePeak:-1.5,range:9}}});
  for(const scene of all)estimate(scene);
  // Translating an observation changes its authored text, so explicitly review that note again.
  input.lesson.session=reviewSession(input,input.lesson.session);
  return input;
}

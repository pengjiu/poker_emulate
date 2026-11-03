import {clone,hash} from '../util.mjs';

// A chapter is one selected route entry. Only timing is rebased; game snapshots
// and speech bindings remain the same objects of fact as the complete plan.
export function chapterPlans(plan){
  const groups=[];
  for(const frame of plan.frames){const key=JSON.stringify([frame.entryId,frame.sceneId,frame.branchId]);if(groups.at(-1)?.key!==key)groups.push({key,frames:[]});groups.at(-1).frames.push(frame);}
  return groups.map((group,index)=>{
    const startFrame=group.frames[0].startFrame,endFrame=group.frames.at(-1).endFrame,start=startFrame/plan.fps;
    const frames=clone(group.frames);
    for(const frame of frames){frame.startFrame-=startFrame;frame.endFrame-=startFrame;frame.start=frame.startFrame/plan.fps;frame.end=frame.endFrame/plan.fps;frame.stateStart=(Math.round(frame.stateStart*plan.fps)-startFrame)/plan.fps;if(frame.narrationStart!==undefined)frame.narrationStart=(Math.round(frame.narrationStart*plan.fps)-startFrame)/plan.fps;if(frame.presentation?.cameraStart!==undefined)frame.presentation.cameraStart=(Math.round(frame.presentation.cameraStart*plan.fps)-startFrame)/plan.fps;}
    // Only fields actually consumed by the shared renderer belong to a video
    // chapter's identity. A different first lesson/title or output selection
    // cannot invalidate another entry with identical pictures and timing.
    const local={format:plan.format,version:plan.version,locale:plan.locale,aspect:plan.aspect,captions:plan.captions,fps:plan.fps,width:plan.width,height:plan.height,dictionary:plan.dictionary,appearance:frames[0].appearance??plan.appearance,totalFrames:endFrame-startFrame,duration:(endFrame-startFrame)/plan.fps,frames,...(plan.rehearsal?{rehearsal:true}:{})};
    return {index,startFrame,endFrame,title:frames[0].label,plan:local,hash:hash(local)};
  });
}

export function chapterMetadata(plan){
  return chapterPlans(plan).map(chapter=>({index:chapter.index,sceneId:chapter.plan.frames[0].sceneId,entryId:chapter.plan.frames[0].entryId,title:chapter.title,start:chapter.startFrame/plan.fps,end:chapter.endFrame/plan.fps}));
}

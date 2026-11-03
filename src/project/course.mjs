export function courseAdvisories(project,entries){
  const course=project.lesson.course;if(!course)return [];const issues=[],introduced=new Set(),episodes=[];
  for(const entry of entries){const episode=course.episodes.find(e=>(e.sceneIds??[e.sceneId]).includes(entry.scene.id));if(episode&&episode!==episodes.at(-1))episodes.push(episode);}
  const note=(episode,code,message)=>issues.push({code,path:'lesson/course/episodes/'+episode.id,message,target:{sceneId:episode.sceneId}});
  for(const episode of episodes){
    for(const concept of episode.requires??[])if(!introduced.has(concept))note(episode,'COURSE_PREREQUISITE',`Review the assumed prerequisite: ${concept}. It has not been introduced in this selected programme.`);
    for(const concept of episode.introduces??[]){if(introduced.has(concept))note(episode,'COURSE_REPETITION',`Concept ${concept} is introduced again. Confirm that this is a useful variation or recap.`);introduced.add(concept);}
    for(const concept of episode.recaps??[])if(!introduced.has(concept))note(episode,'COURSE_RECAP',`Concept ${concept} is marked as a recap before it is introduced.`);
  }
  return issues;
}

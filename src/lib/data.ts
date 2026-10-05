export const WORDS=['rocket','pizza','guitar','castle','rainbow','dinosaur','laptop','coffee','football','banana','robot','elephant','volcano','camera','astronaut','ice cream','dragon','airplane','sunflower','superhero','penguin','tree','hamburger','crown','skateboard','trophy','mountain','butterfly','pirate','headphones'];
export const COLORS=['#15151f','#ffffff','#ff4d67','#ff9f43','#ffd43b','#20c997','#38bdf8','#5b6cff','#9b5de5','#f15bb5'];
export const AVATARS=['🦊','🐼','🐸','🐙','🦄','🐯','🐨','🦁'];
export const PLAYER_COLORS=['#7c5cfc','#ff5c8a','#22b8a7','#ffb648','#4da3ff','#9b78ff'];
export const id=(p='id')=>`${p}_${Math.random().toString(36).slice(2,9)}`;
export const mask=(w:string)=>w.split('').map(c=>c===' '?' ':'_').join(' ');

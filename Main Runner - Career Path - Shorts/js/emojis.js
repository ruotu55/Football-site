// js/emojis.js

export const EMOJI_IMAGES = [
  "./emojies/active-character-dribbling-removebg-preview.png",
  "./emojies/positive-character-with-ball-removebg-preview.png",
  "./emojies/round-characters-playing-football-removebg-preview.png",
  "./emojies/_Pngtree_soccer_ball_in_goal_net_3581900-removebg-preview.png",
  "./emojies/5842fe18a6515b1e0ad75b3d-removebg-preview.png",
  "./emojies/5842fe21a6515b1e0ad75b3e-removebg-preview.png",
  "./emojies/_Pngtree_mens_sports_red_football_shoes_9097428-removebg-preview.png",
];

export function initFloatingEmojis() {
  const container = document.getElementById("floating-background");
  if (!container) return;

  const numRows = 10;
  const itemsPerRow = 8;
  const duration = 90; 

  for (let r = 0; r < numRows; r++) {
    for (let i = 0; i < itemsPerRow; i++) {
      const img = document.createElement("img");
      
      const randomSrc = EMOJI_IMAGES[Math.floor(Math.random() * EMOJI_IMAGES.length)];
      img.src = randomSrc;
      img.className = "floating-emoji";

      img.style.width = `75px`;
      img.style.height = `75px`; 
      img.style.objectFit = 'contain';

      const verticalSpacing = 90 / (numRows - 1); 
      img.style.top = `${5 + (r * verticalSpacing)}vh`;

      img.style.animationDuration = `${duration}s`;

      const timeSlot = duration / itemsPerRow; 
      const baseDelay = i * timeSlot;

      const rowOffset = (r % 2 === 0) ? 0 : (timeSlot / 2);
      const safeJitter = Math.random() * 1.0; 

      const finalDelay = baseDelay + rowOffset + safeJitter;
      img.style.animationDelay = `-${finalDelay}s`;

      container.appendChild(img);
    }
  }
}
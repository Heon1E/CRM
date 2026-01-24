import fs from 'fs';

// Read the Dashboard.jsx file
let content = fs.readFileSync('b:\\\\CRM_Data\\\\src\\\\pages\\\\Dashboard.jsx', 'utf8');

// Replace the second kakaoCharacters (bottom-left) with multiple characters
const bottomLeftOld = `      {/* Decorative KakaoTalk Characters - Bottom Left */}
      <img 
        src={kakaoCharacters} 
        alt="" 
        className="absolute bottom-20 left-8 w-20 h-20 md:w-28 md:h-28 opacity-15 pointer-events-none z-0"
        style={{ transform: 'rotate(-15deg)' }}
      />`;

const bottomLeftNew = `      {/* Muzi - Top Left */}
      <img 
        src={kakaoMuzi} 
        alt="" 
        className="absolute top-20 left-8 w-14 h-14 md:w-16 md:h-16 opacity-20 pointer-events-none z-0"
        style={{ transform: 'rotate(-10deg)' }}
      />
      
      {/* Apeach - Middle Right */}
      <img 
        src={kakaoApeach} 
        alt="" 
        className="absolute top-1/3 right-4 w-12 h-12 md:w-14 md:h-14 opacity-15 pointer-events-none z-0"
        style={{ transform: 'rotate(15deg)' }}
      />
      
      {/* Chunsik - Bottom Left */}
      <img 
        src={kakaoChunsi} 
        alt="" 
        className="absolute bottom-32 left-12 w-16 h-16 md:w-18 md:h-18 opacity-20 pointer-events-none z-0"
        style={{ transform: 'rotate(-15deg)' }}
      />
      
      {/* Frodo - Bottom Right */}
      <img 
        src={kakaoFrodo} 
        alt="" 
        className="absolute bottom-20 right-20 w-14 h-14 md:w-16 md:h-16 opacity-18 pointer-events-none z-0"
        style={{ transform: 'rotate(8deg)' }}
      />`;

content = content.replace(bottomLeftOld, bottomLeftNew);

// Update comment for Ryan
content = content.replace('Decorative KakaoTalk Characters - Top Right', 'Ryan - Top Right');

// Write back
fs.writeFileSync('b:\\\\CRM_Data\\\\src\\\\pages\\\\Dashboard.jsx', content, 'utf8');

console.log('✅ Successfully updated Dashboard.jsx with individual characters!');

import fs from 'fs';

// Read the PipelineBoard.jsx file
let content = fs.readFileSync('b:\\\\CRM_Data\\\\src\\\\pages\\\\PipelineBoard.jsx', 'utf8');

// 1. Update Imports
const oldImport = "import kakaoCharacters from '../assets/kakao-characters.png'";
const newImports = `import kakaoRyan from '../assets/kakao-ryan.png'
import kakaoMuzi from '../assets/kakao-muzi.png'
import kakaoNeo from '../assets/kakao-neo.png'
import kakaoTube from '../assets/kakao-tube.png'
import kakaoJayG from '../assets/kakao-jayg.png'`;

content = content.replace(oldImport, newImports);

// 2. Replace Top Right Character (Ryan)
const topRightOld = `      {/* Decorative Characters - Floating */}
      <img
        src={kakaoCharacters}
        alt=""
        className="absolute top-0 right-4 w-20 h-20 md:w-24 md:h-24 opacity-15 pointer-events-none z-0"
        style={{ transform: 'rotate(15deg)' }}
      />`;

const topRightNew = `      {/* Ryan - Floating */}
      <img
        src={kakaoRyan}
        alt=""
        className="absolute top-0 right-4 w-20 h-20 md:w-24 md:h-24 opacity-20 pointer-events-none z-0 animate-bounce"
        style={{ animationDuration: '3s' }}
      />`;

content = content.replace(topRightOld, topRightNew);

// 3. Replace Win Zone Character (Neo)
const winZoneOld = `                {/* Character decoration in Win Zone */}
                <img
                  src={kakaoCharacters}
                  alt=""
                  className="absolute top-12 left-1/2 transform -translate-x-1/2 w-16 h-16 opacity-20 pointer-events-none"
                />`;

const winZoneNew = `                {/* Neo in Win Zone */}
                <img
                  src={kakaoNeo}
                  alt=""
                  className="absolute top-12 left-1/2 transform -translate-x-1/2 w-16 h-16 opacity-25 pointer-events-none"
                />`;

content = content.replace(winZoneOld, winZoneNew);

// 4. Replace Bottom Left Character (Tube)
const bottomLeftOld = `      {/* Bottom decorative character */}
      <img
        src={kakaoCharacters}
        alt=""
        className="absolute bottom-10 left-10 w-24 h-24 opacity-10 pointer-events-none"
        style={{ transform: 'rotate(-20deg)' }}
      />`;

const bottomLeftNew = `      {/* Tube - Bottom Left */}
      <img
        src={kakaoTube}
        alt=""
        className="absolute bottom-10 left-10 w-24 h-24 opacity-15 pointer-events-none"
        style={{ transform: 'rotate(-20deg)' }}
      />`;

content = content.replace(bottomLeftOld, bottomLeftNew);

// Write back
fs.writeFileSync('b:\\\\CRM_Data\\\\src\\\\pages\\\\PipelineBoard.jsx', content, 'utf8');

console.log('✅ Successfully updated PipelineBoard.jsx with individual characters!');

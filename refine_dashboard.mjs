import fs from 'fs';

const dashboardPath = 'b:\\\\CRM_Data\\\\src\\\\pages\\\\Dashboard.jsx';
let content = fs.readFileSync(dashboardPath, 'utf8');

// 1. Imports Update
if (!content.includes('import kakaoGroup')) {
    content = content.replace(
        "import kakaoBgRyan from '../assets/kakao-bg-revenue-ryan.png'",
        "import kakaoGroup from '../assets/kakao-group.png'"
    );
    // Remove unused imports if present
    content = content.replace("import kakaoBgMuzi from '../assets/kakao-bg-activities-muzi.png'", "");
}

// 2. Revenue Card (Ryan) Injection
// Target: <div className="h-[400px] bg-white rounded-3xl p-6 shadow-card flex flex-col relative overflow-hidden">
const revenueCardTarget = '<div className="h-[400px] bg-white rounded-3xl p-6 shadow-card flex flex-col relative overflow-hidden">';
const ryanOverlay = `
              {/* Authentic Character Background (Ryan) - Watermark Style */}
              <div 
                className="absolute bottom-[-20px] left-[-20px] w-64 h-64 pointer-events-none opacity-[0.1] mix-blend-multiply filter grayscale"
                style={{
                  backgroundImage: \`url(\${kakaoGroup})\`,
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: '5% 90%', // Coordinates for Ryan in group shot
                  backgroundSize: '350%' // Zoom in to isolate character
                }}
              />`;

if (content.includes(revenueCardTarget) && !content.includes('Authentic Character Background (Ryan)')) {
    content = content.replace(revenueCardTarget, `${revenueCardTarget}\n${ryanOverlay}`);
}

// 3. Activities Card (Muzi) Injection
// Target: <div className="bg-gradient-to-br from-amber-50/40 to-white rounded-3xl shadow-card overflow-hidden h-full relative">
const activityCardTarget = '<div className="bg-gradient-to-br from-amber-50/40 to-white rounded-3xl shadow-card overflow-hidden h-full relative">';
const muziOverlay = `
              {/* Authentic Character Background (Muzi) - Watermark Style */}
              <div 
                className="absolute bottom-[-10px] right-[-30px] w-56 h-56 pointer-events-none opacity-[0.1] mix-blend-multiply filter grayscale"
                style={{
                  backgroundImage: \`url(\${kakaoGroup})\`,
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: '48% 55%', // Coordinates for Muzi in group shot
                  backgroundSize: '400%' // Zoom in
                }}
              />`;

if (content.includes(activityCardTarget) && !content.includes('Authentic Character Background (Muzi)')) {
    content = content.replace(activityCardTarget, `${activityCardTarget}\n${muziOverlay}`);
}

fs.writeFileSync(dashboardPath, content, 'utf8');
console.log('✅ Refined Dashboard.jsx with CSS Sprites');

import fs from 'fs';
import path from 'path';

const artifactsDir = 'C:\\Users\\hunir\\.gemini\\antigravity\\brain\\04bc180e-fc56-49bb-bf55-75aa0083c559';
const assetsDir = 'b:\\CRM_Data\\src\\assets';

const mapping = {
    'ui_bg_revenue_ryan_1768832420462.png': 'kakao-bg-revenue-ryan.png',
    'ui_bg_win_zone_neo_1768832519915.png': 'kakao-bg-win-neo.png',
    'ui_bg_activities_muzi_1768832640251.png': 'kakao-bg-activities-muzi.png',
    'ui_bg_empty_tube_1768832753420.png': 'kakao-empty-tube.png'
};

// Ensure assets dir exists
if (!fs.existsSync(assetsDir)) {
    fs.mkdirSync(assetsDir, { recursive: true });
}

Object.entries(mapping).forEach(([srcName, destName]) => {
    const srcPath = path.join(artifactsDir, srcName);
    const destPath = path.join(assetsDir, destName);

    if (fs.existsSync(srcPath)) {
        fs.copyFileSync(srcPath, destPath);
        console.log(`✅ Copied ${srcName} -> ${destName}`);
    } else {
        console.error(`❌ Source file not found: ${srcName}`);
    }
});

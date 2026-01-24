import fs from 'fs';
import path from 'path';

const artifactsDir = 'C:\\Users\\hunir\\.gemini\\antigravity\\brain\\04bc180e-fc56-49bb-bf55-75aa0083c559';
const assetsDir = 'b:\\CRM_Data\\src\\assets';

// Use the group image provided by user
const srcPath = path.join(artifactsDir, 'uploaded_image_1_1768833981011.png');
const destPath = path.join(assetsDir, 'kakao-group.png');

if (fs.existsSync(srcPath)) {
    fs.copyFileSync(srcPath, destPath);
    console.log(`✅ Copied Group Image -> ${destPath}`);
} else {
    console.error(`❌ Source file not found: ${srcPath}`);
}

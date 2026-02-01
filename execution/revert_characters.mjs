import fs from 'fs';

// 1. Revert Dashboard.jsx
let dashboardContent = fs.readFileSync('b:\\\\CRM_Data\\\\src\\\\pages\\\\Dashboard.jsx', 'utf8');

// Remove imports
dashboardContent = dashboardContent.replace(/import kakao.*possible.*\n/g, ''); // Remove regex match if possible, or line by line
// Better to just remove lines containing 'import kakao'
const dashboardLines = dashboardContent.split('\n');
const startImportIndex = dashboardLines.findIndex(line => line.includes('import kakao'));

if (startImportIndex !== -1) {
    // imports seem to be grouped. let's remove all lines with 'import kakao'
}

let newDashboardContent = dashboardLines.filter(line => !line.includes('import kakao')).join('\n');

// Remove img tags with kakao characters
// We can use a regex to verify, but simple string replacement is safer if we know the blocks.
// The blocks are:
// {/* Ryan - Top Right */} ... <img ... />
// {/* Muzi - Top Left */} ... <img ... />
// and so on.
// And simpler: remove any <img> tag that has src={kakao...}

// Logic: Remove entire <img ... /> block if it contains src={kakao
// This requires parsing matching braces or knowing the specific lines.
// Since we generated the previous script, we know the structure.
// But simpler: Remove sections based on comments we added.

const commentsToRemove = [
    '{/* Ryan - Top Right */}',
    '{/* Muzi - Top Left */}',
    '{/* Apeach - Middle Right */}',
    '{/* Chunsik - Bottom Left */}',
    '{/* Frodo - Bottom Right */}',
    '{/* Character decoration in chart */}', // This might have been replaced or kept
    '{/* Neo in chart */}',
    '{/* Tube in top clients */}',
    '{/* Jay-G in activities */}',
    '{/* Decorative KakaoTalk Characters - Top Right */}', // legacy just in case
    '{/* Decorative KakaoTalk Characters - Bottom Left */}'
];

// We will iterate and remove the comment line AND the following <img ... /> block (usually 7-8 lines)
// A safer way: Use regex to remove <img [^>]*src={kakao[^>]*/> 
// But JSX <img /> spans multiple lines.

newDashboardContent = newDashboardContent.replace(/{[^}]*Ryan - Top Right[^}]*}\s*<img[^>]*src={kakao[^>]*\/>/gs, '');
// The regex above is tricky with nested braces and multiline.
// Let's use a simpler approach: Read file -> Identify lines with src={kakao -> Remove that line and X lines before/after (the <img tag structure)

// Actually, we can just replace the KNOWN character blocks with empty string.
const ryanBlockRegex = /\{\/\* Ryan - Top Right \*\/\}[\s\S]*?duration: '3s' }}\s*\/>/g;
newDashboardContent = newDashboardContent.replace(ryanBlockRegex, '');

const muziBlockRegex = /\{\/\* Muzi - Top Left \*\/\}[\s\S]*?transform: 'rotate\(-10deg\)' }}\s*\/>/g;
newDashboardContent = newDashboardContent.replace(muziBlockRegex, '');

const apeachBlockRegex = /\{\/\* Apeach - Middle Right \*\/\}[\s\S]*?transform: 'rotate\(15deg\)' }}\s*\/>/g;
newDashboardContent = newDashboardContent.replace(apeachBlockRegex, '');

const chunsikBlockRegex = /\{\/\* Chunsik - Bottom Left \*\/\}[\s\S]*?transform: 'rotate\(-15deg\)' }}\s*\/>/g;
newDashboardContent = newDashboardContent.replace(chunsikBlockRegex, '');

const frodoBlockRegex = /\{\/\* Frodo - Bottom Right \*\/\}[\s\S]*?transform: 'rotate\(8deg\)' }}\s*\/>/g;
newDashboardContent = newDashboardContent.replace(frodoBlockRegex, '');

// Card characters
// Neo in chart
// Note: The previous replacement might have left comments like {/* Neo in chart */}
const neoBlockRegex = /\{\/\* Neo .* \*\/\}[\s\S]*?pointer-events-none"\s*\/>/g; // Simplified
// More robust:
// <img ... src={kakao...} ... />
// We'll search for <img ... src={kakao...} ... /> and remove it.

let resultDashboard = newDashboardContent.replace(/<img[^>]*src=\{kakao[^>]*\/>/gs, '');
// The above regex handles self-closing tags, but in JSX params are strictly braced.
// Let's try to match strictly the <img ... src={kakao...} ... /> pattern including newlines.
// ResultDashboard might still assume single line.
// Let's go line by line logic which is safer for multiline removal if we identify start/end of img tag.

// Actually, the simplest way is to restore from backup if possible.
// But we made many edits.
// Let's try the regex replacement for the <img ... src={kakao...} ... /> block.

resultDashboard = resultDashboard.replace(/<img[\s\S]*?src=\{kakao[\s\S]*?\/>/g, '');

// Also remove the specific comments we added if they are standalone
resultDashboard = resultDashboard.replace(/\{\/\* Ryan - Top Right \*\/\}/g, '');
resultDashboard = resultDashboard.replace(/\{\/\* Muzi - Top Left \*\/\}/g, '');
resultDashboard = resultDashboard.replace(/\{\/\* Apeach - Middle Right \*\/\}/g, '');
resultDashboard = resultDashboard.replace(/\{\/\* Chunsik - Bottom Left \*\/\}/g, '');
resultDashboard = resultDashboard.replace(/\{\/\* Frodo - Bottom Right \*\/\}/g, '');
resultDashboard = resultDashboard.replace(/\{\/\* Neo in chart \*\/\}/g, '');
resultDashboard = resultDashboard.replace(/\{\/\* Tube in top clients \*\/\}/g, '');
resultDashboard = resultDashboard.replace(/\{\/\* Jay-G in activities \*\/\}/g, '');
resultDashboard = resultDashboard.replace(/\{\/\* Character decoration in .* \*\/\}/g, '');


fs.writeFileSync('b:\\\\CRM_Data\\\\src\\\\pages\\\\Dashboard.jsx', resultDashboard, 'utf8');


// 2. Revert PipelineBoard.jsx
let pipelineContent = fs.readFileSync('b:\\\\CRM_Data\\\\src\\\\pages\\\\PipelineBoard.jsx', 'utf8');
const pipelineLines = pipelineContent.split('\n');
let newPipelineContent = pipelineLines.filter(line => !line.includes('import kakao')).join('\n');

// Valid regex for PipelineBoard removals
// Ryan floating
newPipelineContent = newPipelineContent.replace(/\{\/\* Ryan - Floating \*\/\}[\s\S]*?animationDuration: '3s' }}\s*\/>/g, '');
// Neo Win Zone
newPipelineContent = newPipelineContent.replace(/\{\/\* Neo in Win Zone \*\/\}[\s\S]*?pointer-events-none"\s*\/>/g, '');
// Tube Bottom Left
newPipelineContent = newPipelineContent.replace(/\{\/\* Tube - Bottom Left \*\/\}[\s\S]*?transform: 'rotate\(-20deg\)' }}\s*\/>/g, '');

// Generic cleanup for any remaining kakao images
newPipelineContent = newPipelineContent.replace(/<img[\s\S]*?src=\{kakao[\s\S]*?\/>/g, '');
newPipelineContent = newPipelineContent.replace(/\{\/\* Decorative Characters - Floating \*\/\}/g, '');
newPipelineContent = newPipelineContent.replace(/\{\/\* Character decoration in Win Zone \*\/\}/g, '');
newPipelineContent = newPipelineContent.replace(/\{\/\* Bottom decorative character \*\/\}/g, '');


fs.writeFileSync('b:\\\\CRM_Data\\\\src\\\\pages\\\\PipelineBoard.jsx', newPipelineContent, 'utf8');

console.log('✅ Successfully removed all Kakao character codes.');

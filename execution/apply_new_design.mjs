import fs from 'fs';

// --- Dashboard.jsx ---
const dashboardPath = 'b:\\\\CRM_Data\\\\src\\\\pages\\\\Dashboard.jsx';
let dashboardContent = fs.readFileSync(dashboardPath, 'utf8');

// 1. Imports
// Replace emptyStateIllustration and add new ones
if (!dashboardContent.includes('kakaoBgRyan')) {
    const importTarget = "import emptyStateIllustration from '../assets/illustrations/empty-state.svg'";
    const newImports = `import kakaoBgRyan from '../assets/kakao-bg-revenue-ryan.png'
import kakaoBgMuzi from '../assets/kakao-bg-activities-muzi.png'
import kakaoEmptyTube from '../assets/kakao-empty-tube.png'
// import emptyStateIllustration from '../assets/illustrations/empty-state.svg' // Replaced`;

    if (dashboardContent.includes(importTarget)) {
        dashboardContent = dashboardContent.replace(importTarget, newImports);
    } else {
        // Fallback: add to top
        dashboardContent = newImports + '\n' + dashboardContent;
    }
}

// 2. Replace emptyStateIllustration usages with kakaoEmptyTube
dashboardContent = dashboardContent.split('emptyStateIllustration').join('kakaoEmptyTube');

// 3. Revenue Trend Card Style
// Search for the specific className used (approx line 520)
// className="h-[400px] bg-white rounded-3xl p-6 shadow-card flex flex-col relative overflow-hidden"
// We will replace this line to include style
const revenueCardClass = 'h-[400px] bg-white rounded-3xl p-6 shadow-card flex flex-col relative overflow-hidden';
const revenueCardStyle = `style={{ backgroundImage: \`url(\${kakaoBgRyan})\`, backgroundRepeat: 'no-repeat', backgroundPosition: 'bottom right', backgroundSize: 'contain', backgroundBlendMode: 'multiply' }}`;

if (dashboardContent.includes(revenueCardClass) && !dashboardContent.includes('backgroundImage: `url(${kakaoBgRyan})`')) {
    // Check if style prop exists (it shouldn't based on view_file)
    dashboardContent = dashboardContent.replace(revenueCardClass, `${revenueCardClass} ${revenueCardStyle}`);
    // Wait, replacing className string with className+style string is wrong syntax.
    // We need to inject the style attribute inside the div tag.

    // Strategy: Replace `className="..."` with `className="..." style={{...}}"`
    const target = `className="${revenueCardClass}"`;
    const replacement = `className="${revenueCardClass}" ${revenueCardStyle}`;
    dashboardContent = dashboardContent.replace(target, replacement);
}

// 4. Activities Card Style
// className="bg-gradient-to-br from-amber-50/40 to-white rounded-3xl shadow-card overflow-hidden h-full relative"
const activityCardClass = 'bg-gradient-to-br from-amber-50/40 to-white rounded-3xl shadow-card overflow-hidden h-full relative';
const activityCardStyle = `style={{ backgroundImage: \`url(\${kakaoBgMuzi})\`, backgroundRepeat: 'no-repeat', backgroundPosition: 'bottom right', backgroundSize: '120px' }}`;

if (dashboardContent.includes(activityCardClass) && !dashboardContent.includes('backgroundImage: `url(${kakaoBgMuzi})`')) {
    const target = `className="${activityCardClass}"`;
    const replacement = `className="${activityCardClass}" ${activityCardStyle}`;
    dashboardContent = dashboardContent.replace(target, replacement);
}

fs.writeFileSync(dashboardPath, dashboardContent, 'utf8');
console.log('✅ Updated Dashboard.jsx');

// --- PipelineBoard.jsx ---
const pipelinePath = 'b:\\\\CRM_Data\\\\src\\\\pages\\\\PipelineBoard.jsx';
let pipelineContent = fs.readFileSync(pipelinePath, 'utf8');

// 1. Imports
if (!pipelineContent.includes('kakaoBgWinNeo')) {
    const importTarget = "import { PIPELINE_STATUSES, isPipelineCandidate, normalizeStatus, coerceClientStatus } from '../utils/clientStatus'";
    const newImport = `import kakaoBgWinNeo from '../assets/kakao-bg-win-neo.png'`;
    pipelineContent = pipelineContent.replace(importTarget, `${importTarget}\n${newImport}`);
}

// 2. Win Zone Style
// className="h-[500px] rounded-2xl border-2 border-dashed flex flex-col items-center justify-center p-6 transition-all ${snapshot.isDraggingOver
// This is inside a template literal, so simple replacement is tricky.
// We can target the Droppable div start.
/*
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className={`h-[500px] rounded-2xl border-2 border-dashed flex flex-col items-center justify-center p-6 transition-all ${snapshot.isDraggingOver
                        ? 'border-indigo-500 bg-indigo-50 scale-105 shadow-xl'
                        : 'border-slate-300 bg-slate-50/50 hover:border-indigo-300'
                        }`}
*/

// We will inject the style prop after {...provided.droppableProps}
const winZoneTarget = '{...provided.droppableProps}';
const winZoneStyle = `style={{ backgroundImage: \`url(\${kakaoBgWinNeo})\`, backgroundRepeat: 'no-repeat', backgroundPosition: 'center', backgroundSize: 'contain' }}`;

// To avoid duplicate injection
if (!pipelineContent.includes('kakaoBgWinNeo})`')) {
    // We only want to inject this into the win-zone droppable.
    // The win-zone droppableId is "win-zone".
    // Let's find the specific block.
    // simpler: search for the class string partially or the droppableId

    // The code structure:
    // <Droppable droppableId="win-zone">
    //   {(provided, snapshot) => (
    //     <div ...

    // We can replace `<Droppable droppableId="win-zone">` with something unique if needed, but the div inside needs the style.

    // Let's use a unique string from the className: "h-[500px] rounded-2xl border-2 border-dashed"

    const uniqueClassPart = "h-[500px] rounded-2xl border-2 border-dashed";
    // We want to add style prop to this div.
    // It's inside a className attribute which is a template literal.
    // So we can just add `style={{...}}` after `className={...}` block? 
    // No, it's easier to put it before className.

    const targetDivStart = `className={\`h-[500px] rounded-2xl border-2 border-dashed`;
    const replacementDivStart = `${winZoneStyle} className={\`h-[500px] rounded-2xl border-2 border-dashed`;

    pipelineContent = pipelineContent.replace(targetDivStart, replacementDivStart);
}

fs.writeFileSync(pipelinePath, pipelineContent, 'utf8');
console.log('✅ Updated PipelineBoard.jsx');

import fs from 'fs';

// Read the Dashboard.jsx file
let content = fs.readFileSync('b:\\\\CRM_Data\\\\src\\\\pages\\\\Dashboard.jsx', 'utf8');

// Replace ALL remaining kakaoCharacters references
// These are likely in the card sections (chart, top clients, activities)

// Replace all instances of src={kakaoCharacters} with specific characters
const replacements = [
    { old: 'src={kakaoCharacters}', new: 'src={kakaoNeo}', count: 1 },  // First one - chart
    { old: 'src={kakaoCharacters}', new: 'src={kakaoTube}', count: 1 }, // Second one - top clients
    { old: 'src={kakaoCharacters}', new: 'src={kakaoJayG}', count: 1 }, // Third one - activities
];

// Replace each occurrence one by one
for (const replacement of replacements) {
    const index = content.indexOf(replacement.old);
    if (index !== -1) {
        content = content.substring(0, index) + replacement.new + content.substring(index + replacement.old.length);
        console.log(`✅ Replaced ${replacement.old} with ${replacement.new}`);
    }
}

// Write back
fs.writeFileSync('b:\\\\CRM_Data\\\\src\\\\pages\\\\Dashboard.jsx', content, 'utf8');

console.log('✅ Successfully updated all remaining kakaoCharacters references!');

const fs = require('fs');
const path = require('path');

// Files to update
const files = [
  'src/app/api/accumulation/route.ts',
  'src/app/api/fs-date/route.ts',
  'src/app/api/fs-broker/route.ts',
  'src/app/api/fs-stock/route.ts'
];

files.forEach(file => {
  if (!fs.existsSync(file)) {
    console.log(`Skipping ${file} - not found`);
    return;
  }
  
  let content = fs.readFileSync(file, 'utf8');
  
  // Add import for getTargetDateWithFallback after db import
  content = content.replace(
    /(import \{[^}]+\} from ["']@\/lib\/db["'];)/,
    `$1\nimport { getTargetDateWithFallback } from "@/lib/date-utils";`
  );
  
  // Replace date handling logic
  const patterns = [
    {
      regex: /const sp = req\.nextUrl\.searchParams;\r?\n\s+const date = sp\.get\("date"\) \|\| todayStr\(\);/,
      replacement: 'const sp = req.nextUrl.searchParams;\n    const dateParam = sp.get("date");\n    \n    // Auto-fallback to latest available date\n    const { date } = await getTargetDateWithFallback(dateParam || undefined);'
    },
    {
      regex: /const date = sp\.get\("date"\) \|\| todayStr\(\);/,
      replacement: 'const dateParam = sp.get("date");\n    \n    // Auto-fallback to latest available date\n    const { date } = await getTargetDateWithFallback(dateParam || undefined);'
    },
    {
      regex: /const date = req\.nextUrl\.searchParams\.get\("date"\) \|\| todayStr\(\);/,
      replacement: 'const dateParam = req.nextUrl.searchParams.get("date");\n    \n    // Auto-fallback to latest available date\n    const { date } = await getTargetDateWithFallback(dateParam || undefined);'
    }
  ];
  
  for (const pattern of patterns) {
    if (content.match(pattern.regex)) {
      content = content.replace(pattern.regex, pattern.replacement);
      console.log(`? Updated date handling in ${file}`);
      break;
    }
  }
  
  fs.writeFileSync(file, content, 'utf8');
});

console.log('\n? All files updated successfully!');

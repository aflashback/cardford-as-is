import { readFile,readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const seen=new Set();
async function walk(file) {
  if(seen.has(file))return;seen.add(file);
  const text=await readFile(file,'utf8');
  if(file.includes(`${path.sep}server${path.sep}`)||['game.ts','coach.ts','storage.ts'].includes(path.basename(file)))throw new Error(`Private/prototype module reaches browser: ${path.relative(root,file)}`);
  for(const match of text.matchAll(/(?:from\s*|import\s*)['"]([^'"]+)['"]/g)) {
    if(!match[1].startsWith('.'))continue;
    const base=path.resolve(path.dirname(file),match[1]);
    let found=false;
    for(const candidate of [base,...['.ts','.tsx','.mjs','.js','.json'].map(ext=>base+ext),path.join(base,'index.ts')]) {
      try {if(/\.(tsx?|m?js)$/.test(candidate)){await readFile(candidate);await walk(candidate);}else await readFile(candidate);found=true;break;}catch(error){if(error.code!=='ENOENT'&&error.code!=='EISDIR')throw error;}
    }
    if(!found)throw new Error(`Unresolved browser import: ${match[1]}`);
  }
}
await walk(path.join(root,'src','main.tsx'));
if(!process.argv.includes('--source')) {
  async function scan(directory) {for(const entry of await readdir(directory,{withFileTypes:true})) {
    const filename=path.join(directory,entry.name);
    if(entry.isDirectory())await scan(filename);
    else {if(/\.map$|\.env|token|secret/i.test(entry.name))throw new Error('Private artifact filename found.');const text=await readFile(filename,'utf8');if(/OPENROUTER_API_KEY|TYPESAFE_API_KEY|DATABASE_URL|sk-or-v1-[A-Za-z0-9]{20}|BEGIN PRIVATE KEY|new Function\(/.test(text))throw new Error(`Sensitive/dynamic-code artifact: ${entry.name}`);}
  }}
  await scan(path.join(root,'dist'));
}
console.log(`Browser boundary passed (${seen.size} reachable source modules); artifacts contain no forbidden server identifiers or source maps.`);

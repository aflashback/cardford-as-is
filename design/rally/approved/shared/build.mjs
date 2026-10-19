import {fileURLToPath, pathToFileURL} from 'node:url';
import {dirname,resolve} from 'node:path';
const directory=dirname(fileURLToPath(import.meta.url));
// The ready-to-review bundle is shipped. Rebuild only when editing this snapshot.
const dependencies=process.env.RALLY_NODE_MODULES||resolve(directory,'../../../../web/node_modules');
const {build}=await import(pathToFileURL(resolve(dependencies,'esbuild/lib/main.js')).href);
await build({entryPoints:[resolve(directory,'board.tsx')],outfile:resolve(directory,'board.js'),nodePaths:[dependencies],bundle:true,minify:true,format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},legalComments:'eof'});
console.log('Approved Rally design bundle rebuilt.');

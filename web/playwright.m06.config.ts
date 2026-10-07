import { defineConfig } from '@playwright/test';
const origin=process.env.M06_TOKEN_ORIGIN;
if(!origin||new URL(origin).protocol!=='http:'||new URL(origin).hostname!=='127.0.0.1'||new URL(origin).origin!==origin)
 throw Error('Run the isolated M06 token browser fixture harness.');
export default defineConfig({testDir:'./e2e',testMatch:/token-conformance\.spec\.ts/,workers:1,timeout:60000,globalTimeout:120000,
 use:{baseURL:origin,browserName:'chromium',channel:'chrome',trace:'retain-on-failure'},
 outputDir:process.env.M06_BROWSER_OUTPUT,reporter:[['list']],
});

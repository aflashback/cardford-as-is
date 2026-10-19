/* Representative CSS classes only; no device emulation. Primary registry checked 2026-10-13. */
(function (root) {
  'use strict';
  const registry = 'https://github.com/microsoft/playwright/blob/main/packages/isomorphic/deviceDescriptorsSource.json';
  const profiles = [
    {id:'se1',label:'iPhone SE 1 class',group:'Phones · representative',width:568,height:320,basis:'Matches Playwright iPhone SE landscape viewport; review does not emulate WebKit.',descriptor:'iPhone SE landscape',source:registry},
    {id:'se2-3',label:'iPhone SE 2 / 3 class',group:'Phones · representative',width:667,height:375,basis:'Matches the registry SE (3rd gen) landscape viewport. SE 2 is a shared requested CSS class, not a separately verified descriptor.',descriptor:'iPhone SE (3rd gen) landscape',source:registry},
    {id:'iphone12',label:'iPhone 12 class',group:'Phones · representative',width:844,height:390,basis:'Rotated registry screen dimensions. Its registry landscape viewport is 750 × 340; browser controls and safe areas reduce space.',descriptor:'iPhone 12',source:registry},
    {id:'iphone15-pro',label:'iPhone 15 Pro class',group:'Phones · representative',width:852,height:393,basis:'Rotated registry screen dimensions. Its registry landscape viewport is 734 × 343.',descriptor:'iPhone 15 Pro',source:registry},
    {id:'iphone-pro-max',label:'iPhone Pro Max class',group:'Phones · representative',width:932,height:430,basis:'Uses rotated iPhone 15 Pro Max registry screen dimensions. Registry landscape viewport: 814 × 380; Pro Max generations differ.',descriptor:'iPhone 15 Pro Max',source:registry},
    {id:'pixel7',label:'Pixel 7 class',group:'Phones · representative',width:915,height:412,basis:'Matches registry landscape screen dimensions. Its browser viewport is 863 × 360 in that descriptor.',descriptor:'Pixel 7 landscape',source:registry},
    {id:'galaxy-s20',label:'Galaxy S20 class',group:'Phones · representative',width:800,height:360,basis:'Requested compact Android CSS class. No exact Galaxy S20 descriptor was verified; this is not a hardware-size claim.',source:null},
    {id:'ipad-mini',label:'iPad Mini class',group:'Tablets · representative',width:1024,height:768,basis:'Matches the legacy iPad Mini landscape descriptor; newer generations and browser chrome differ.',descriptor:'iPad Mini landscape',source:registry},
    {id:'ipad-mini-compact',label:'iPad mini compact tablet class',group:'Tablets · representative',width:1133,height:744,basis:'Authored compact-tablet CSS class for a wider aspect ratio. This is not a verified physical-device descriptor.',source:null},
    {id:'ipad-air',label:'iPad Air class',group:'Tablets · representative',width:1180,height:820,basis:'Requested tablet CSS class. No exact iPad Air descriptor was verified; generation and browser UI vary.',source:null},
    {id:'ipad-pro',label:'iPad Pro class',group:'Tablets · representative',width:1366,height:1024,basis:'Requested large-tablet CSS class, not a generation-specific device descriptor.',source:null},
    {id:'desktop',label:'Desktop',group:'Desktop · CSS viewports',width:1440,height:900,basis:'Authored desktop CSS viewport. Browser zoom and window chrome are outside this frame.',source:null},
    {id:'desktop-wide',label:'Large desktop',group:'Desktop · CSS viewports',width:1920,height:1080,basis:'Authored large desktop CSS viewport, not physical monitor resolution.',source:null},
    {id:'desktop-ultrawide',label:'Ultrawide desktop',group:'Desktop · CSS viewports',width:2560,height:1080,basis:'Authored ultrawide desktop CSS class. The browser keeps its current DPR and display settings.',source:null},
    {id:'iphone12-browser',label:'iPhone 12 · registry viewport',group:'Tighter browser examples',width:750,height:340,basis:'Playwright landscape viewport, separate from 844 × 390 rotated screen dimensions. Still no device emulation.',descriptor:'iPhone 12 landscape',source:registry},
    {id:'iphone15-browser',label:'iPhone 15 Pro · registry viewport',group:'Tighter browser examples',width:734,height:343,basis:'Playwright landscape viewport, separate from 852 × 393 rotated screen dimensions.',descriptor:'iPhone 15 Pro landscape',source:registry},
    {id:'pixel7-browser',label:'Pixel 7 · registry viewport',group:'Tighter browser examples',width:863,height:360,basis:'Playwright landscape browser viewport, separate from its 915 × 412 screen.',descriptor:'Pixel 7 landscape',source:registry},
    {id:'compact',label:'Compact landscape',group:'Tighter browser examples',width:756,height:352,basis:'Retained compact CSS regression class. It does not identify a specific physical device.',source:null}
  ];
  const dimensions=(profile,portrait)=>portrait?{width:profile.height,height:profile.width}:{width:profile.width,height:profile.height};
  function fitScale(width,height,availableWidth,availableHeight,mode='fit') {
    if(![width,height,availableWidth,availableHeight].every(Number.isFinite)||width<=0||height<=0)return 1;
    return mode==='actual'?1:Math.max(.01,Math.min(1,Math.max(1,availableWidth)/width,Math.max(1,availableHeight)/height));
  }
  const api={profiles,dimensions,fitScale,checked:'2026-10-13',source:registry};
  if(typeof module==='object'&&module.exports)module.exports=api;else root.RallyDeviceProfiles=api;
})(typeof window==='undefined'?globalThis:window);

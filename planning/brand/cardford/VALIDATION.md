# Cardford asset validation — 28 September 2026

## Passed

- `node planning/brand/cardford/build-assets.mjs` produced ten SVG assets without a runtime dependency beyond Node and the repository's already installed Manrope package.
- Python standard-library `xml.etree.ElementTree.parse` parsed all ten SVGs. Text checks found no “Stay for another hand.” in any asset and no final period after `Card games. Your way`. Seven text-bearing SVGs include an embedded WOFF2 font; the symbol-only assets do not.
- All ten SVGs rendered to PNG buffers with the bundled Sharp/libvips renderer. The output dimensions matched their declared view boxes: 160×160 symbols, 180×180 app icon, 460×140 wordmark, 630×170 horizontal/reverse logos, 630×207 tagline lockup, 550×160 stamp, 1440×230 banner and 1440×110 header example.
- Visually inspected the tagline lockup, reverse logo, stamp, app icon, header example and banner after rendering. The banner contains the motto only. Also inspected the symbol and app icon at 16 px and 32 px; the app tile remains recognizable at those sizes.
- Navy `#13304D` on ivory `#F6F4ED` has a calculated contrast ratio of **12.25:1**; cobalt `#2B57E6` on ivory has **5.29:1**. The red diamond is a graphic accent, not a text or state signal.

The Sharp run emitted a local Fontconfig cache warning but returned successful PNG buffers. Sharp rendered identical wordmark pixels with and without the SVG-embedded font definition, so **that renderer did not prove embedded-font use**. The vector geometry and text are valid SVG; browser rendering and path-only print export need separate checks before publishing these as final vendor files.

## Not run / not claimed

- No app UI integration, responsive header implementation, browser visual regression, domain registration/DNS/Vercel check, trademark or app-store clearance was performed by this asset change.
- The SVG geometry is a manual vector interpretation of the selected raster board, not a pixel-perfect trace or a guaranteed match to every SVG viewer's text rendering.
- The current app display spelling and selected-artwork spelling differ in capitalization; final wordmark alignment is pending the owner's clarification.

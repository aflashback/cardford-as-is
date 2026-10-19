# The Regular — Rally sticker assets

Five approved poses, supplied as exact PNG copies and automated multicolor SVG traces. **The owner has reviewed and approved the PNG and SVG versions; the design phase is closed. PNG remains canonical for the interactive mock.** The SVGs are derivatives, not pixel-identical replacements or newly generated artwork.

Open [index.html](index.html) directly or through the Rally package. The offline gallery offers five pose choices, PNG/SVG/side-by-side views, four backgrounds, three display sizes and downloads. It needs no server, build or network. Arrow keys switch the focused pose selector; all controls retain standard keyboard interaction.

| Pose | Approved source | Native dimensions | SVG paths | SVG bytes |
| --- | --- | --- | ---: | ---: |
| Whistle | `regular-whistle-v3.png` | 1145 × 1374 | 4,849 | 1,126,321 |
| Thinking | `regular-thinking-v2.png` | 1254 × 1254 | 4,110 | 935,016 |
| Explaining | `regular-explaining-v2.png` | 1254 × 1254 | 5,424 | 1,211,835 |
| Waiting | `regular-waiting-v2.png` | 1254 × 1254 | 3,667 | 837,577 |
| Reading | `regular-reading-v8.png` | 1254 × 1254 | 5,258 | 1,364,999 |

`png/` holds the originals; `svg/` holds matching basenames. [manifest.json](manifest.json) records SHA-256 hashes, dimensions, bytes, separate color/alpha path counts, control-point bounds, provenance and all conversion parameters. `asset-data.js` is the generated data companion that lets the gallery work from a local file without fetching JSON.

## Approved character and style

- Keep **The Regular**, an experienced adult human with dark hair, a silver forelock and restrained stubble. Preserve the approved face, anatomy, poses and props.
- Use the vermilion shirt, chalk tee, sage details and dark ink outlines of the selected originals. The source palette references are chalk `#EEE9DC`, vermilion `#BD442D`, sage `#D8DDCC`, forest `#293B30`, coral `#EE7659` and ink `#242820`; tracing retains the source image colors rather than recoloring to these six tokens.
- Keep the editorial illustration style and transparent background. Do not substitute an emoji, robot, animal or a new character.
- Whistle **v3** preserves the corrected pinch and whistle position. Reading **v8** preserves a single full-width curled notebook leaf, CardFord watermark, tucked free edge beneath the supporting index finger and a separate blank base page.
- Thinking, Explaining and Waiting are the approved **v2** files. Discarded concepts and earlier revisions are not in this asset set.

The original artwork was generated and iteratively revised through the built-in image tool, then selected by the owner. The frozen input set lives at [`../../approved/coach-stickers/assets/`](../../approved/coach-stickers/assets/). The [approved source notes](../../approved/coach-stickers/README.md) retain the original provenance and exact generation prompts. Historical `design/studio/` paths identify the artwork's origin, not a required working directory. Conversion copied source PNG bytes unchanged and did not regenerate or raster-edit the character.

## How the vectors work

Every painted shape is an SVG `<path>`. There are no embedded images, raster data URLs, scripts, foreign objects, fonts or external references.

VTracer produces stacked color splines at native resolution. Because it treats any nonzero input alpha as opaque, a second grayscale path trace provides a **luminance mask**. Source alpha is quantized in steps of 8/255 before tracing; quantization alone changes a pixel alpha by at most 4/255. The mask itself contains only paths and scales with the artwork. Empty paths emitted for tiny untraceable islands are removed; they paint nothing.

Curve fitting, color clustering and tiny-speckle filtering approximate fine texture, gradients and edges. The SVGs are useful editable vector derivatives, but they are not hand-authored clean illustrations or lossless conversions. Mask support is required when importing them into another editor.

## Reproduce

The converter reads the **frozen approved PNGs inside this Rally package**, not the working Studio directory. No game, mock-runtime or product dependency changes are required.

From the Rally package root, with Python and Pillow available:

```powershell
python -m pip install --target tools/.vector-deps vtracer==0.6.15
python tools/vectorize-stickers.py
python tools/vectorize-stickers.py --validate-only
```

Tested with Python **3.12.14**, Pillow **12.3.0** and VTracer Python distribution **0.6.15** on Windows. VTracer's generated comment reports underlying engine **0.6.12**. The isolated `.vector-deps` directory is a local tool installation and should not be shipped as a runtime dependency. Install the appropriate wheel on the reproduction machine. If Pillow is absent, install it in the chosen Python environment.

Color tracing: `colormode=color`, `hierarchical=stacked`, `mode=spline`, `filter_speckle=2`, `color_precision=6`, `layer_difference=8`, `corner_threshold=60`, `length_threshold=3.5`, `max_iterations=10`, `splice_threshold=45`, `path_precision=3`.

Alpha tracing uses the same values except `filter_speckle=0`, `color_precision=8` and `layer_difference=1`. Exact settings are also machine-readable in the manifest. VTracer is MIT-licensed; its [upstream license notice](licenses/vtracer-MIT.txt) is included. That software license does not assign a new license to the artwork.

## Verification and limits

- All five PNG copies match their frozen sources byte-for-byte by SHA-256.
- All five SVGs passed XML, permitted-element/resource checks, explicit path-command parsing, finite control-point checks, dimension/bounds checks and transparent-corner geometry checks. The set contains **23,308 nonempty paths** and **5,475,748 SVG bytes**.
- Asset-only SVG rasterizations were inspected with Sharp **0.35.5**. Face and pose identity, Whistle grip, and Reading's curl/watermark/fingers remained recognizable. Fine texture and edge simplification are visible at native size. Rasterized corners remained fully transparent. [asset-inspection.json](asset-inspection.json) records this limited inspection and numeric comparisons.
- The agent's inspection was **standalone asset inspection**, not browser or interactive gallery testing. No HTML or website was rendered by the agent; gallery controls received source/syntax checks only. The owner subsequently completed the design review and approved the SVG derivatives. PNG remains canonical for the current mock runtime.

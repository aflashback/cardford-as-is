"""Reproduce Rally's approved PNG copies and true path-based SVG derivatives.

Requires Pillow and vtracer==0.6.15. The optional isolated dependency folder is
tools/.vector-deps; no runtime/product dependency is added by this script.
Run from any directory with Python 3.12. Use --validate-only to check the pack.
"""
from __future__ import annotations

import argparse
import hashlib
import importlib.metadata
import json
import math
from pathlib import Path
import re
import shutil
import sys
import xml.etree.ElementTree as ET

TOOLS = Path(__file__).resolve().parent
PACKAGE = TOOLS.parent
OUT = TOOLS.parent / "assets" / "stickers"
SOURCE = PACKAGE / "approved" / "coach-stickers" / "assets"
NAMES = (
    ("regular-whistle-v3", "Whistle"),
    ("regular-thinking-v2", "Thinking"),
    ("regular-explaining-v2", "Explaining"),
    ("regular-waiting-v2", "Waiting"),
    ("regular-reading-v8", "Reading"),
)
COLOR = dict(colormode="color", hierarchical="stacked", mode="spline",
             filter_speckle=2, color_precision=6, layer_difference=8,
             corner_threshold=60, length_threshold=3.5, max_iterations=10,
             splice_threshold=45, path_precision=3)
ALPHA = dict(COLOR, filter_speckle=0, color_precision=8, layer_difference=1)
NS = "http://www.w3.org/2000/svg"
ET.register_namespace("", NS)
NUMBER = r"[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?"
TOKEN = re.compile(rf"[MLCZ]|{NUMBER}")


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def read_paths(svg: str) -> list[ET.Element]:
    root = ET.fromstring(svg)
    assert all(n.tag == f"{{{NS}}}path" for n in root), "Unexpected tracer element"
    # Spline tracing can emit empty paths for subpixel islands. They paint
    # nothing; omit them without changing visible output.
    return [path for path in root if path.get("d", "").strip()]


def path_geometry(element: ET.Element):
    """Validate VTracer's M/L/C/Z grammar and flatten only for corner coverage.

    This is a geometric source check, not an SVG renderer or visual acceptance.
    All curve control points and endpoints are checked for finite coordinates.
    """
    d = element.attrib["d"]
    assert not TOKEN.sub("", d).strip(" ,\t\r\n"), "Unsupported path token"
    tokens = TOKEN.findall(d)
    transform = element.get("transform", "translate(0,0)")
    match = re.fullmatch(rf"translate\(\s*({NUMBER})[ ,]+({NUMBER})\s*\)", transform)
    assert match, f"Unexpected transform: {transform}"
    tx, ty = map(float, match.groups())
    assert math.isfinite(tx) and math.isfinite(ty)
    i, current, start = 0, (0.0, 0.0), (0.0, 0.0)
    contours, contour, points = [], [], []
    while i < len(tokens):
        command = tokens[i]
        i += 1
        assert command in "MLCZ", "Commands must be explicit and absolute"
        count = {"M": 2, "L": 2, "C": 6, "Z": 0}[command]
        values = list(map(float, tokens[i:i + count]))
        assert len(values) == count and all(math.isfinite(v) for v in values)
        i += count
        pairs = [(values[k] + tx, values[k + 1] + ty) for k in range(0, count, 2)]
        points.extend(pairs)
        if command == "M":
            if contour:
                contours.append(contour)
            current = start = pairs[0]
            contour = [current]
        elif command == "L":
            current = pairs[0]
            contour.append(current)
        elif command == "C":
            p0, p1, p2, p3 = current, *pairs
            for step in range(1, 17):
                t, u = step / 16, 1 - step / 16
                contour.append(tuple(u**3 * p0[a] + 3*u*u*t*p1[a] +
                                     3*u*t*t*p2[a] + t**3*p3[a] for a in (0, 1)))
            current = p3
        else:
            contour.append(start)
            contours.append(contour)
            contour = []
            current = start
    if contour:
        contours.append(contour)
    assert points and contours, "Empty geometry"
    return points, contours


def winding_at(contours, x, y):
    winding = 0
    for contour in contours:
        for (x1, y1), (x2, y2) in zip(contour, contour[1:] + contour[:1]):
            cross = (x2-x1)*(y-y1) - (x-x1)*(y2-y1)
            if y1 <= y < y2 and cross > 0:
                winding += 1
            elif y2 <= y < y1 and cross < 0:
                winding -= 1
    return winding != 0


def validate_svg(path: Path, width: int, height: int) -> dict:
    raw = path.read_text(encoding="utf-8")
    root = ET.fromstring(raw)
    assert root.tag == f"{{{NS}}}svg"
    assert root.get("viewBox") == f"0 0 {width} {height}"
    allowed = {"svg", "title", "desc", "defs", "mask", "g", "path"}
    all_points, color_paths, mask_paths, colors = [], [], [], set()
    for element in root.iter():
        tag = element.tag.split("}")[-1]
        assert tag in allowed, f"Forbidden SVG element: {tag}"
        for key, value in element.attrib.items():
            assert not key.lower().startswith("on") and "href" not in key.lower()
            assert "data:" not in value.lower() and "javascript:" not in value.lower()
            if "url(" in value:
                assert re.fullmatch(r"url\(#[A-Za-z0-9-]+\)", value)
        if tag == "path":
            assert re.fullmatch(r"#[0-9A-Fa-f]{6}", element.get("fill", ""))
            points, contours = path_geometry(element)
            all_points.extend(points)
            # Control points may extend slightly beyond an edge while the curve stays inside.
            assert all(-0.08*width <= x <= 1.08*width and
                       -0.08*height <= y <= 1.08*height for x, y in points)
            if element in root.find(f"{{{NS}}}g"):
                color_paths.append(element)
                colors.add(element.get("fill"))
            else:
                mask_paths.append((element, contours))
    assert len(color_paths) > 100 and len(colors) >= 12, "Not a detailed multicolor trace"
    assert mask_paths, "Missing vector alpha mask"
    corners = ((.5, .5), (width-.5, .5), (.5, height-.5), (width-.5, height-.5))
    corner_alpha = []
    for x, y in corners:
        value = 0
        for element, contours in mask_paths:
            if winding_at(contours, x, y):
                fill = element.get("fill")
                assert fill[1:3] == fill[3:5] == fill[5:7], "Mask must be grayscale"
                value = int(fill[1:3], 16)
        corner_alpha.append(value)
    assert corner_alpha == [0, 0, 0, 0], "Opaque SVG corner"
    return dict(color_path_count=len(color_paths), alpha_path_count=len(mask_paths),
                total_path_count=len(color_paths)+len(mask_paths), distinct_colors=len(colors),
                finite_control_point_pairs=len(all_points),
                control_point_bounds=[round(min(p[a] for p in all_points), 3) for a in (0, 1)] +
                                     [round(max(p[a] for p in all_points), 3) for a in (0, 1)],
                transparent_corner_alpha=corner_alpha, embedded_raster=False,
                external_resources=False, xml_and_path_validation="passed")


def convert():
    sys.path.insert(0, str(TOOLS / ".vector-deps"))
    import vtracer
    from PIL import Image
    version = importlib.metadata.version("vtracer")
    assert version == "0.6.15", f"Review settings before using vtracer {version}"
    for folder in ("png", "svg", "licenses"):
        (OUT / folder).mkdir(parents=True, exist_ok=True)
    license_source = TOOLS / ".vector-deps" / "vtracer-0.6.15.dist-info" / "licenses" / "LICENSE"
    shutil.copyfile(license_source, OUT / "licenses" / "vtracer-MIT.txt")
    entries = []
    for basename, label in NAMES:
        source, png, svg = SOURCE / f"{basename}.png", OUT / "png" / f"{basename}.png", OUT / "svg" / f"{basename}.svg"
        shutil.copyfile(source, png)
        assert sha(source) == sha(png)
        with Image.open(source) as opened:
            im = opened.convert("RGBA")
            width, height = im.size
            pixels = list(im.get_flattened_data() if hasattr(im, "get_flattened_data") else im.getdata())
        print(f"Tracing {basename}: colors", flush=True)
        color_paths = read_paths(vtracer.convert_pixels_to_svg(pixels, (width, height), **COLOR))
        print(f"Tracing {basename}: vector alpha", flush=True)
        # VTracer ignores nonzero alpha magnitude. A second *path-only* luminance
        # mask preserves the original antialiasing/translucency in 8/255 steps.
        alpha_pixels = [(min(255, round(a/8)*8),)*3 + (255,) for *_, a in pixels]
        alpha_paths = read_paths(vtracer.convert_pixels_to_svg(alpha_pixels, (width, height), **ALPHA))
        root = ET.Element(f"{{{NS}}}svg", {"version": "1.1", "width": str(width), "height": str(height),
                                                "viewBox": f"0 0 {width} {height}", "role": "img", "aria-labelledby": "title description"})
        ET.SubElement(root, f"{{{NS}}}title", id="title").text = f"The Regular — {label}"
        ET.SubElement(root, f"{{{NS}}}desc", id="description").text = (
            f"Automated multicolor vector trace of the approved {basename}.png. "
            "All artwork and transparency use SVG paths. PNG remains canonical; this derivative is not pixel-identical.")
        defs = ET.SubElement(root, f"{{{NS}}}defs")
        mask_id = f"alpha-{basename}"
        mask = ET.SubElement(defs, f"{{{NS}}}mask", id=mask_id, x="0", y="0", width=str(width), height=str(height),
                             maskUnits="userSpaceOnUse", maskContentUnits="userSpaceOnUse", **{"mask-type": "luminance"})
        mask.extend(alpha_paths)
        group = ET.SubElement(root, f"{{{NS}}}g", mask=f"url(#{mask_id})")
        group.extend(color_paths)
        ET.indent(root)
        ET.ElementTree(root).write(svg, encoding="utf-8", xml_declaration=True)
        stats = validate_svg(svg, width, height)
        alphas = [p[3] for p in pixels]
        entries.append(dict(id=basename, label=label, source=str(source.relative_to(PACKAGE)).replace("\\", "/"),
                            original_repo_source=f"design/studio/coach-stickers/assets/{basename}.png",
                            png=f"png/{basename}.png", svg=f"svg/{basename}.svg", width=width, height=height,
                            png_bytes=png.stat().st_size, svg_bytes=svg.stat().st_size,
                            source_sha256=sha(source), png_sha256=sha(png), svg_sha256=sha(svg),
                            source_alpha_range=[min(alphas), max(alphas)], source_nonzero_alpha_pixels=sum(a>0 for a in alphas),
                            source_partial_alpha_pixels=sum(0<a<255 for a in alphas), **stats))
        print(f"Validated {basename}: {stats['total_path_count']} paths; {svg.stat().st_size:,} bytes", flush=True)
    manifest = dict(schema_version=1, collection="The Regular — approved Rally sticker set", date="2026-10-13",
                    canonical_format="PNG", derivative_status="Automated vector traces; not pixel-identical; PNG remains canonical until visual approval.",
                    provenance="Frozen approved originals: approved/coach-stickers/assets/. Generation notes: approved/coach-stickers/README.md; original_repo_source fields are historical provenance",
                    source_path_base="Rally package root", artwork_rules=["The Regular: experienced adult human, dark hair with silver forelock, subtle stubble.",
                    "Vermilion shirt, chalk tee, sage accents; restrained editorial illustration.", "Preserve approved pose, face, hands, props and transparent background.",
                    "Whistle v3 corrected grip. Reading v8 one full-width curled leaf, CardFord watermark, separate blank base page."],
                    tool=dict(name="vtracer", python_distribution_version=version, embedded_engine_version="0.6.12", license="MIT",
                              license_file="licenses/vtracer-MIT.txt", color_parameters=COLOR, alpha_parameters=ALPHA),
                    transparency=dict(strategy="Separate path-only grayscale luminance mask; no embedded raster.",
                                      alpha_quantization_step=8, maximum_pixel_quantization_error=4,
                                      caveat="Curve fitting and speckle filtering also change edges; fine texture and gradients are approximated."),
                    reproduction="design/rally/tools/vectorize-stickers.py", assets=entries)
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    # A plain script companion keeps the gallery working from file:// without fetch.
    (OUT / "asset-data.js").write_text("window.RALLY_STICKER_MANIFEST = " + json.dumps(manifest, indent=2) + ";\n", encoding="utf-8")


def validate_pack():
    from PIL import Image
    manifest = json.loads((OUT / "manifest.json").read_text(encoding="utf-8"))
    assert len(manifest["assets"]) == 5
    for asset in manifest["assets"]:
        png, svg = OUT / asset["png"], OUT / asset["svg"]
        assert sha(PACKAGE / asset["source"]) == sha(png) == asset["source_sha256"] == asset["png_sha256"]
        assert sha(svg) == asset["svg_sha256"]
        with Image.open(png) as im:
            assert list(im.size) == [asset["width"], asset["height"]]
        assert validate_svg(svg, asset["width"], asset["height"])["total_path_count"] == asset["total_path_count"]
        print(f"PASS {asset['id']}: exact PNG, standalone vector SVG, finite paths, transparent corners")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--validate-only", action="store_true")
    options = parser.parse_args()
    if not options.validate_only:
        convert()
    validate_pack()

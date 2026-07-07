from __future__ import annotations

import json
import math
from pathlib import Path
from textwrap import wrap

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "public" / "test-labels" / "generated"
OUT_DIR.mkdir(parents=True, exist_ok=True)

STANDARD_WARNING = (
    "GOVERNMENT WARNING: (1) According to the Surgeon General, women should not "
    "drink alcoholic beverages during pregnancy because of the risk of birth "
    "defects. (2) Consumption of alcoholic beverages impairs your ability to "
    "drive a car or operate machinery, and may cause health problems."
)


def font(size: int, bold: bool = False, serif: bool = False) -> ImageFont.FreeTypeFont:
    candidates = []
    if serif:
        candidates.extend(
            [
                "C:/Windows/Fonts/georgiab.ttf" if bold else "C:/Windows/Fonts/georgia.ttf",
                "C:/Windows/Fonts/timesbd.ttf" if bold else "C:/Windows/Fonts/times.ttf",
            ]
        )
    candidates.extend(
        [
            "C:/Windows/Fonts/arialbd.ttf" if bold else "C:/Windows/Fonts/arial.ttf",
            "C:/Windows/Fonts/calibrib.ttf" if bold else "C:/Windows/Fonts/calibri.ttf",
        ]
    )

    for candidate in candidates:
        path = Path(candidate)
        if path.exists():
            return ImageFont.truetype(str(path), size)

    return ImageFont.load_default()


def centered(draw: ImageDraw.ImageDraw, y: int, text: str, face: ImageFont.ImageFont, fill: str) -> int:
    bbox = draw.textbbox((0, 0), text, font=face)
    x = (900 - (bbox[2] - bbox[0])) // 2
    draw.text((x, y), text, font=face, fill=fill)
    return y + (bbox[3] - bbox[1])


def wrapped_lines(
    draw: ImageDraw.ImageDraw,
    xy: tuple[int, int],
    text: str,
    face: ImageFont.ImageFont,
    width: int,
    fill: str,
    line_height: int,
) -> int:
    x, y = xy
    words = text.split()
    line = ""
    for word in words:
        candidate = f"{line} {word}".strip()
        if draw.textlength(candidate, font=face) <= width:
            line = candidate
            continue
        draw.text((x, y), line, font=face, fill=fill)
        y += line_height
        line = word
    if line:
        draw.text((x, y), line, font=face, fill=fill)
        y += line_height
    return y


def draw_label(case: dict) -> Image.Image:
    palette = case.get("palette", {})
    bg = palette.get("bg", "#f8f7f0")
    ink = palette.get("ink", "#202124")
    accent = palette.get("accent", "#8b6f30")

    image = Image.new("RGB", (900, 1200), "#eef1f4")
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((92, 64, 808, 1138), radius=16, fill="#ffffff", outline=ink, width=8)
    draw.rounded_rectangle((132, 104, 768, 1098), radius=8, fill=bg, outline=accent, width=4)

    y = 174
    brand_lines = case["label"]["brandName"].split("|")
    for line in brand_lines:
        y = centered(draw, y, line, font(54, bold=True, serif=True), ink) + 10

    draw.line((198, y + 22, 702, y + 22), fill=accent, width=4)
    y += 70

    for line in wrap(case["label"]["classType"], 34):
        y = centered(draw, y, line, font(32, bold=True), ink) + 8

    y += 46
    centered(draw, y, case["label"]["alcoholContent"], font(36, bold=True), ink)
    y += 84
    centered(draw, y, case["label"]["netContents"], font(32), ink)
    y += 86

    centered(draw, y, case["label"]["bottler"], font(24), ink)
    y += 46
    if case["label"].get("countryOfOrigin"):
        centered(draw, y, case["label"]["countryOfOrigin"], font(24), ink)
        y += 52

    warning = case["label"].get("warningText")
    if warning:
        warning_font = font(case.get("warningSize", 18))
        warning_bold_font = font(case.get("warningSize", 18), bold=True)
        warning_fill = case.get("warningFill", ink)
        box_y = 842
        draw.rectangle((178, box_y, 722, 1026), fill="#ffffff", outline=ink, width=3)
        if warning.startswith("GOVERNMENT WARNING:"):
            draw.text(
                (204, box_y + 28),
                "GOVERNMENT WARNING:",
                font=warning_bold_font,
                fill=warning_fill,
            )
            warning_body = warning.replace("GOVERNMENT WARNING:", "", 1).strip()
            wrapped_lines(draw, (204, box_y + 54), warning_body, warning_font, 492, warning_fill, 24)
        else:
            wrapped_lines(draw, (204, box_y + 28), warning, warning_font, 492, warning_fill, 24)

    if case.get("glare"):
        glare = Image.new("RGBA", image.size, (255, 255, 255, 0))
        glare_draw = ImageDraw.Draw(glare)
        glare_draw.ellipse((420, 260, 1000, 900), fill=(255, 255, 255, 92))
        image = Image.alpha_composite(image.convert("RGBA"), glare).convert("RGB")
        image = ImageEnhance.Contrast(image).enhance(0.88)

    if case.get("blur"):
        image = image.filter(ImageFilter.GaussianBlur(0.7))

    if case.get("rotate"):
        angle = case["rotate"]
        rotated = image.rotate(angle, resample=Image.Resampling.BICUBIC, expand=True, fillcolor="#eef1f4")
        canvas = Image.new("RGB", (900, 1200), "#eef1f4")
        scale = min(860 / rotated.width, 1160 / rotated.height)
        resized = rotated.resize((math.floor(rotated.width * scale), math.floor(rotated.height * scale)))
        canvas.paste(resized, ((900 - resized.width) // 2, (1200 - resized.height) // 2))
        image = canvas

    return image


CASES = [
    {
        "id": "01-compliant-bourbon",
        "expectedStatus": "ready",
        "application": {
            "brandName": "OLD TOM DISTILLERY",
            "classType": "Kentucky Straight Bourbon Whiskey",
            "alcoholContent": "45% Alc./Vol. (90 Proof)",
            "netContents": "750 mL",
            "bottlerName": "Old Tom Distillery",
            "bottlerAddress": "Louisville, KY",
            "countryOfOrigin": "United States",
        },
        "label": {
            "brandName": "OLD TOM|DISTILLERY",
            "classType": "Kentucky Straight Bourbon Whiskey",
            "alcoholContent": "45% Alc./Vol. (90 Proof)",
            "netContents": "750 mL",
            "bottler": "Bottled by: Old Tom Distillery, Louisville, KY",
            "countryOfOrigin": "Product of United States",
            "warningText": STANDARD_WARNING,
        },
    },
    {
        "id": "02-brand-punctuation-case",
        "expectedStatus": "ready",
        "application": {
            "brandName": "Stone's Throw",
            "classType": "American Single Malt Whiskey",
            "alcoholContent": "48% Alc./Vol. (96 Proof)",
            "netContents": "750 mL",
            "bottlerName": "Stone's Throw Spirits",
            "bottlerAddress": "Denver, CO",
            "countryOfOrigin": "United States",
        },
        "label": {
            "brandName": "STONE'S THROW",
            "classType": "American Single Malt Whiskey",
            "alcoholContent": "48% Alc./Vol. (96 Proof)",
            "netContents": "750 mL",
            "bottler": "Bottled by: Stone's Throw Spirits, Denver, CO",
            "countryOfOrigin": "Product of United States",
            "warningText": STANDARD_WARNING,
        },
        "palette": {"accent": "#396a84"},
    },
    {
        "id": "03-title-case-warning",
        "expectedStatus": "review",
        "labelPatch": "warning prefix title case",
        "label": {
            "brandName": "OLD TOM|DISTILLERY",
            "classType": "Kentucky Straight Bourbon Whiskey",
            "alcoholContent": "45% Alc./Vol. (90 Proof)",
            "netContents": "750 mL",
            "bottler": "Bottled by: Old Tom Distillery, Louisville, KY",
            "countryOfOrigin": "Product of United States",
            "warningText": STANDARD_WARNING.replace("GOVERNMENT WARNING:", "Government Warning:"),
        },
    },
    {
        "id": "04-wrong-abv",
        "expectedStatus": "review",
        "label": {
            "brandName": "OLD TOM|DISTILLERY",
            "classType": "Kentucky Straight Bourbon Whiskey",
            "alcoholContent": "43% Alc./Vol. (86 Proof)",
            "netContents": "750 mL",
            "bottler": "Bottled by: Old Tom Distillery, Louisville, KY",
            "countryOfOrigin": "Product of United States",
            "warningText": STANDARD_WARNING,
        },
    },
    {
        "id": "05-wrong-net-contents",
        "expectedStatus": "review",
        "label": {
            "brandName": "OLD TOM|DISTILLERY",
            "classType": "Kentucky Straight Bourbon Whiskey",
            "alcoholContent": "45% Alc./Vol. (90 Proof)",
            "netContents": "700 mL",
            "bottler": "Bottled by: Old Tom Distillery, Louisville, KY",
            "countryOfOrigin": "Product of United States",
            "warningText": STANDARD_WARNING,
        },
    },
    {
        "id": "06-missing-warning",
        "expectedStatus": "missing",
        "label": {
            "brandName": "OLD TOM|DISTILLERY",
            "classType": "Kentucky Straight Bourbon Whiskey",
            "alcoholContent": "45% Alc./Vol. (90 Proof)",
            "netContents": "750 mL",
            "bottler": "Bottled by: Old Tom Distillery, Louisville, KY",
            "countryOfOrigin": "Product of United States",
            "warningText": "",
        },
    },
    {
        "id": "07-low-contrast-glare",
        "expectedStatus": "ready",
        "glare": True,
        "blur": True,
        "warningFill": "#454545",
        "label": {
            "brandName": "OLD TOM|DISTILLERY",
            "classType": "Kentucky Straight Bourbon Whiskey",
            "alcoholContent": "45% Alc./Vol. (90 Proof)",
            "netContents": "750 mL",
            "bottler": "Bottled by: Old Tom Distillery, Louisville, KY",
            "countryOfOrigin": "Product of United States",
            "warningText": STANDARD_WARNING,
        },
    },
    {
        "id": "08-angled-photo",
        "expectedStatus": "ready",
        "rotate": -7,
        "label": {
            "brandName": "OLD TOM|DISTILLERY",
            "classType": "Kentucky Straight Bourbon Whiskey",
            "alcoholContent": "45% Alc./Vol. (90 Proof)",
            "netContents": "750 mL",
            "bottler": "Bottled by: Old Tom Distillery, Louisville, KY",
            "countryOfOrigin": "Product of United States",
            "warningText": STANDARD_WARNING,
        },
    },
    {
        "id": "09-imported-tequila",
        "expectedStatus": "ready",
        "application": {
            "brandName": "Sierra Norte",
            "classType": "Tequila Blanco",
            "alcoholContent": "40% Alc./Vol. (80 Proof)",
            "netContents": "750 mL",
            "bottlerName": "Borderline Imports",
            "bottlerAddress": "Austin, TX",
            "countryOfOrigin": "Mexico",
        },
        "label": {
            "brandName": "SIERRA NORTE",
            "classType": "Tequila Blanco",
            "alcoholContent": "40% Alc./Vol. (80 Proof)",
            "netContents": "750 mL",
            "bottler": "Imported by: Borderline Imports, Austin, TX",
            "countryOfOrigin": "Product of Mexico",
            "warningText": STANDARD_WARNING,
        },
        "palette": {"accent": "#2f7d54"},
    },
    {
        "id": "10-wine-with-sulfites",
        "expectedStatus": "ready",
        "application": {
            "brandName": "Downriver Cellars",
            "classType": "California Cabernet Sauvignon",
            "alcoholContent": "13.8% Alc. by Vol.",
            "netContents": "750 mL",
            "bottlerName": "Downriver Cellars",
            "bottlerAddress": "Napa, CA",
            "countryOfOrigin": "United States",
        },
        "label": {
            "brandName": "DOWNRIVER|CELLARS",
            "classType": "California Cabernet Sauvignon",
            "alcoholContent": "13.8% Alc. by Vol.",
            "netContents": "750 mL",
            "bottler": "Produced and bottled by Downriver Cellars, Napa, CA",
            "countryOfOrigin": "Product of United States",
            "warningText": f"{STANDARD_WARNING} Contains sulfites.",
        },
        "palette": {"accent": "#783a46"},
    },
    {
        "id": "11-tiny-warning",
        "expectedStatus": "review",
        "warningSize": 13,
        "label": {
            "brandName": "OLD TOM|DISTILLERY",
            "classType": "Kentucky Straight Bourbon Whiskey",
            "alcoholContent": "45% Alc./Vol. (90 Proof)",
            "netContents": "750 mL",
            "bottler": "Bottled by: Old Tom Distillery, Louisville, KY",
            "countryOfOrigin": "Product of United States",
            "warningText": STANDARD_WARNING,
        },
    },
    {
        "id": "12-bad-warning-wording",
        "expectedStatus": "review",
        "label": {
            "brandName": "OLD TOM|DISTILLERY",
            "classType": "Kentucky Straight Bourbon Whiskey",
            "alcoholContent": "45% Alc./Vol. (90 Proof)",
            "netContents": "750 mL",
            "bottler": "Bottled by: Old Tom Distillery, Louisville, KY",
            "countryOfOrigin": "Product of United States",
            "warningText": STANDARD_WARNING.replace("drive a car or operate machinery", "drive or use machinery"),
        },
    },
]


def with_default_application(case: dict) -> dict:
    default_application = CASES[0]["application"]
    return {**case, "application": case.get("application", default_application)}


def main() -> None:
    metadata = []
    for raw_case in CASES:
        case = with_default_application(raw_case)
        image = draw_label(case)
        output = OUT_DIR / f"{case['id']}.png"
        image.save(output, optimize=True)
        metadata.append(
            {
                "id": case["id"],
                "file": f"/test-labels/generated/{output.name}",
                "expectedStatus": case["expectedStatus"],
                "application": case["application"],
            }
        )

    (OUT_DIR / "manifest.json").write_text(json.dumps(metadata, indent=2), encoding="utf-8")
    print(f"Generated {len(metadata)} labels in {OUT_DIR}")


if __name__ == "__main__":
    main()

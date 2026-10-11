# OutLap brand

**Logo:** `OUT` + three touching sector slashes + `LAP`, set in Barlow Condensed
ExtraBold Italic and converted to outlines (no font needed to display the SVGs).

| File | Use |
|---|---|
| `outlap-wordmark.svg` | Main logo on light backgrounds |
| `outlap-wordmark-white.svg` | Main logo on dark backgrounds |
| `outlap-mark.svg` | The three sector slashes on their own (small spaces, loaders, favicons) |
| `outlap-icon.svg`, `icon-512.png` | App icon (rounded dark tile) |
| `outlap-icon-apple.svg` | iPhone home-screen icon source: the same dark tile as a full square, because iOS rounds icons itself and turns transparent corners black. Rendered to `web/icons/icon-180.png` |
| `outlap-favicon.svg` | Browser-tab icon: white tile in light mode, dark tile in dark mode (copied to `web/icons/favicon.svg`) |
| `outlap-icon-maskable.svg`, `icon-maskable-512.png` | Android adaptive icon (full-bleed, safe zone) |
| `social-card.png` | Link previews (1200 × 630) |
| `build_logo.py` | Regenerates the SVGs from the typeface (needs `fonttools` and the Barlow Condensed ExtraBold Italic TTF) |

**Colours**

| Name | Hex | Role |
|---|---|---|
| Ink | `#0F1218` | Letters, dark backgrounds |
| Sector 1 (purple) | `#7A3FD1` | First slash, fastest-sector colour |
| Sector 2 (green) | `#1D9A5B` | Second slash |
| Sector 3 (yellow) | `#F2B01E` | Third slash |

**Rules**
- Keep the slashes in purple, green, yellow order, left to right, always touching.
- Clear space around the logo: at least the width of one slash on every side.
- Don't recolour the letters other than ink or white, stretch, add effects, or re-set
  the word in another typeface.
- Smallest size: 80 px wide for the wordmark, 16 px for the mark.

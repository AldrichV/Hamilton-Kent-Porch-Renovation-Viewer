# 77 Carlingview Dr. — porch alteration viewer

A static Three.js site that shows the existing porch and the proposed steel stair
(Nassar Engineering drawings A1.0–S2.0, Aug 02 2026, job 110-26) placed on the
TRCA 2023 LiDAR survey of the site.

## Deploy to Vercel

Either:

- **Drag and drop:** go to https://vercel.com/new, choose to deploy without Git,
  and drop this whole folder in. No build settings are needed (framework: Other,
  no build command, output directory = the folder root).
- **CLI:** from this folder run `npx vercel` (first time it links a project),
  then `npx vercel --prod`.
- **Git:** push this folder to a GitHub repo and import the repo in Vercel.
  Every push redeploys.

## What is in it

| Path | Contents |
| --- | --- |
| `index.html` | Page, controls and styling |
| `app.js` | Viewer: site loading, existing/proposed toggle, stair options, layers, camera views |
| `model.js` | Porch, stair and framing geometry from the drawings (dimensions in feet) |
| `treads.js` | Revised stair from the Carlingview Stair Treads study, shop dwgs SD-01/02: TF-1 tread frames, Trex treads and risers, glass guard (inches) |
| `solids.js` | Builds the building solids: squared-up walls with panel facade, parapets, photo-textured roofs, rooftop units, the fabric storage tent |
| `data/solids.json` | Building outlines, roof levels, rooftop units and the tent, derived from the LiDAR (`tools/solids.py`) |
| `data/terrain_*.bin` | 0.25 m bare-ground model of the 77 Carlingview property, about 166 m × 110 m |
| `trees3d.js` | Builds 3D trees (trunk, limbs, lumpy crown) and site light poles from `data/trees.json` |
| `data/trees.json` | 25 trees and light poles detected in the LiDAR canopy: position, height, crown spread, crown base, photo colour (`tools/trees.py`) |
| `data/ortho.jpg` | SCOOP 2023 aerial photo resampled to the property in the drawing-north frame (6.25 cm/px), colour-corrected and sharpened (`tools/ortho_tex.py`) |
| `vendor/` | three.js r180 and OrbitControls |

## Sources and assumptions

- LiDAR: `ON_TRCA2023_20230511_NAD83CSRS_UTMZ17_1km_E6130_N48360_CLASS` (Ontario
  Classified Point Cloud, flown May 11 2023), NAD83(CSRS) UTM 17N.
  Scene origin = E 613 659, N 4 836 777. The scene is rotated 18° so drawing
  north points up the screen; true north is 18° clockwise from it.
- Imagery: South Central Ontario Orthophotography Project (SCOOP) 2023, exported from
  the Ontario Imagery Web Map Service for E 613459–613859, N 4836577–4836977
  (NAD83(CSRS) UTM 17N). Contains information licensed under the Open Government
  Licence – Ontario. Building edges from the LiDAR line up with the photo to about 1 m.
- Property crop (drawing-north frame, metres from the origin): x −14 to 152, y −64 to 46,
  from the Carlingview Dr sidewalk to the east yard and from the north fence to the south
  tree line, read off the aerial photo and site plan A1.0. It is not a surveyed boundary.
- Revised stair (default in Proposed): shop drawings SD-01/02 from the Carlingview Stair
  Treads study. 12R @ 6⅞", 11T @ 11⅛" (OBC 2024 Part 3) between MC12 stringers, welded
  TF-1 frame per tread with 3/16" riser plate, two Trex Select 2×6 boards per tread,
  9/16" Trex fascia risers, 42½" glass guard, 36" handrails both sides with 12" extensions.
  The same glass guard (HSS 2×2 posts ≤ 48" o.c., top and bottom rails, clamped tempered glass)
  continues around the open west and south edges of the landing to the vestibule wall and the
  building face, so the landing has no unguarded edge. The top riser is held at the landing edge, so the foot lands about 1'-10⅜" further south
  than the S2.0 stair; the new walk is carried to it. Clear width defaults to 44"
  (not dimensioned on the drawings). "As drawn (S2.0)" switches back to Nassar's stair.
- Building solids: LiDAR building points were split into roof levels (+6.45, +7.65, +10.85,
  +12.35 m above datum), each traced, simplified and squared to the building's own grid
  (about 1° off drawing north), then extruded from grade. Small blobs standing above a roof
  became rooftop units; the arched tent in the east yard became a vault. Parapet height
  (0.45 m) and the facade panel pattern are generic, not surveyed. The porch recess is cut
  out of the solid so the porch, glazing and overhang from model.js show through.
- Trees: a 0.5 m canopy height model from the LiDAR vegetation points was split into
  individual crowns (local-maximum treetops + watershed). Each tree keeps its measured
  position, height, crown radius and crown base; the foliage tint comes from the photo over
  that crown. Crown shape and branching are procedural. Tall, narrow returns along the road
  and parking lot were read as light poles. Species are not identified.
- Project datum 0'-0" is taken as 159.0 m survey height. With that datum the
  LiDAR reads the existing stair landing at +5'-7½" and the porch deck at about
  +8'-9", matching A1.1.
- The model was placed by fitting the existing stair landing seen in the LiDAR.
  Expect roughly ±0.5 m horizontal accuracy.
- The porch sits in a recess under the roof edge (LiDAR roof edge is about 6'
  west of the facade shown on A1.1). The facade and glazing behind the porch are
  schematic.
- Existing porch is shown as solid concrete, as labelled on A1.1. Existing stair
  rails are schematic.
- Proposed: 11R @ 7½", 10T @ 10" steel stair with MC stringers, ¼" diamond-plate
  treads and risers, 42" guard (HSS 2×2 posts and top rail, HSS 1½ bottom rail,
  ½" balusters), HSS 6×6 column on Ø24" × 4'-0" pier, 12" pier footing at the
  stair base, new 6'-2¼" walk at +1'-10½", existing W14×61 / W16×57 / W8×21
  framing per S1.0 / S2.0.

## Rebuilding the LiDAR files

`tools/crop.cpp` decodes the LAZ tile with laz-perf (https://github.com/hobuinc/laz-perf)
and writes the points within ±220 m of the site. `tools/build_data.py` (NumPy, SciPy)
turns that crop into the files in `data/`, including the walk footprints flattened into
the terrain and the roof carved back over the porch. Both scripts expect the paths used
when they were run; adjust them before re-running. The `tools/` folder is not needed
for deployment.

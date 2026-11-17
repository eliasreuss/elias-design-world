# Graph Report - 3D-world  (2026-11-13)

## Corpus Check
- Corpus is ~12,287 words - fits in a single context window. You may not need a graph.

## Summary
- 177 nodes · 365 edges · 8 communities (7 shown, 1 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 5 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Project Config & Deps
- Interaction System
- Geometry Builders
- Character & Materials
- Main Loop & Scene
- Asset Library & Characters
- TypeScript Config
- Asset Catalog

## God Nodes (most connected - your core abstractions)
1. `buildWorld()` - 20 edges
2. `Player` - 16 edges
3. `box()` - 16 edges
4. `three` - 13 edges
5. `outline()` - 12 edges
6. `start()` - 11 edges
7. `Character` - 11 edges
8. `fill()` - 11 edges
9. `Interactions` - 10 edges
10. `compilerOptions` - 10 edges

## Surprising Connections (you probably didn't know these)
- `start()` --calls--> `Interactions`  [EXTRACTED]
  src/main.ts → src/interact/interactions.ts
- `start()` --calls--> `Player`  [EXTRACTED]
  src/main.ts → src/player/controls.ts
- `start()` --calls--> `buildWorld()`  [EXTRACTED]
  src/main.ts → src/world/scene.ts
- `crate()` --calls--> `inkLines()`  [EXTRACTED]
  src/world/builders.ts → src/style/materials.ts
- `stylize()` --calls--> `outline()`  [EXTRACTED]
  src/style/stylize.ts → src/style/materials.ts

## Import Cycles
- None detected.

## Communities (8 total, 1 thin omitted)

### Community 0 - "Project Config & Deps"
Cohesion: 0.07
Nodes (30): author, dependencies, @fontsource-variable/besley@^5.3.0, @fontsource-variable/hanken-grotesk@^5.3.0, three@^0.187.0, description, devDependencies, @gltf-transform/core@^4.5.1 (+22 more)

### Community 1 - "Interaction System"
Cohesion: 0.10
Nodes (10): Interactable, Interactions, KEYS, Player, Route, findPath(), Point, PathGuide (+2 more)

### Community 2 - "Geometry Builders"
Cohesion: 0.22
Nodes (27): footprint(), fill(), hull(), outline(), ball(), block(), box(), BoxOptions (+19 more)

### Community 3 - "Character & Materials"
Cohesion: 0.11
Nodes (21): PART_COLORS, addGrain(), fillCache, grain, hullMaterial, hullWidth, ink(), inkCache (+13 more)

### Community 4 - "Main Loop & Scene"
Cohesion: 0.15
Nodes (13): three, calm, canvas, enter, leave, say(), start(), frame() (+5 more)

### Community 6 - "TypeScript Config"
Cohesion: 0.17
Nodes (11): compilerOptions, isolatedModules, lib, module, moduleResolution, noEmit, skipLibCheck, strict (+3 more)

### Community 7 - "Asset Catalog"
Cohesion: 0.22
Nodes (9): ANIMATION_FILES, AssetName, FURNITURE, FURNITURE_SCALE, PlaceOptions, PROP_SCALE, PROPS, TREES (+1 more)

## Knowledge Gaps
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `three` connect `Main Loop & Scene` to `Project Config & Deps`, `Interaction System`, `Geometry Builders`, `Character & Materials`, `Asset Catalog`?**
  _High betweenness centrality (0.320) - this node is a cross-community bridge._
- **Should `Project Config & Deps` be split into smaller, more focused modules?**
  _Cohesion score 0.07308377896613191 - nodes in this community are weakly interconnected._
- **Why does `Player` connect `Interaction System` to `Character & Materials`, `Main Loop & Scene`?**
  _High betweenness centrality (0.096) - this node is a cross-community bridge._
- **Should `Interaction System` be split into smaller, more focused modules?**
  _Cohesion score 0.09848484848484848 - nodes in this community are weakly interconnected._
- **Why does `Interactions` connect `Interaction System` to `Main Loop & Scene`?**
  _High betweenness centrality (0.060) - this node is a cross-community bridge._
- **Should `Character & Materials` be split into smaller, more focused modules?**
  _Cohesion score 0.10582010582010581 - nodes in this community are weakly interconnected._
Stylized Cozy Home Props (Free) v1.0
by Nickben12

17 free stylized cozy home props with baked PBR textures: teapot, plants, candles, books, baskets and a side table. Game ready for Unity, Unreal and Godot.

CONTENTS (17 models)
  Kitchen & Tea (3)
    Teapot_01                  694 tris    0.27 x  0.17 x  0.18 m   512 px
    Teacup_01                  474 tris    0.16 x  0.16 x  0.07 m   512 px
    Bread_Basket_01           1016 tris    0.40 x  0.32 x  0.16 m   1024 px
  Plants (4)
    Plant_Cactus_01            454 tris    0.15 x  0.14 x  0.30 m   512 px
    Plant_Fern_01             1392 tris    0.52 x  0.56 x  0.27 m   1024 px
    Flower_Vase_01            1152 tris    0.29 x  0.30 x  0.45 m   1024 px
    Watering_Can_01            532 tris    0.38 x  0.16 x  0.28 m   1024 px
  Lighting (3)
    Candle_01                  432 tris    0.14 x  0.11 x  0.14 m   512 px
    Candles_Group_01           520 tris    0.26 x  0.26 x  0.21 m   512 px
    Oil_Lamp_01                592 tris    0.16 x  0.12 x  0.30 m   512 px
  Shelf Decor (2)
    Books_Row_01                84 tris    0.30 x  0.18 x  0.24 m   1024 px
    Clock_Alarm_01             548 tris    0.14 x  0.07 x  0.17 m   512 px
  Storage & Furniture (5)
    Basket_Wicker_01           604 tris    0.45 x  0.38 x  0.30 m   1024 px
    Hat_Boxes_01               616 tris    0.41 x  0.41 x  0.45 m   1024 px
    Broom_01                   198 tris    0.32 x  0.10 x  1.34 m   1024 px
    Side_Table_01              252 tris    0.50 x  0.50 x  0.56 m   1024 px
    Doormat_01                  12 tris    0.70 x  0.45 x  0.02 m   1024 px

MORE
  This is the free version. The Extra version has all 50 models (33 more) and the Blender source file: https://nickben12.itch.io/stylized-cozy-home-props

FOLDERS
  FBX/                  one .fbx per model (Unity, Unreal, most engines)
  GLB/                  one .glb per model, PBR material and textures embedded (Godot, three.js...)
  Textures/             PBR textures of every model (metallic / roughness workflow):
                          <Model>_BaseColor.png           albedo (sRGB)
                          <Model>_Normal.png              tangent-space normal map, OpenGL (Y+)
                          <Model>_Roughness.png           roughness (linear)
                          <Model>_Metallic.png            metallic (linear)
                          <Model>_MetallicSmoothness.png  Unity mask: metallic RGB, smoothness alpha
  Previews/             a preview image of every model

TECHNICAL NOTES
  - Real-world scale: 1 unit = 1 metre.
  - Pivot at the bottom centre of every model: it sits on the ground at height 0.
  - Front of every model faces -Y in Blender (-Z in Unity / Godot after import).
  - Wall pieces (String_Lights_01, Wall_Hooks_01): their back is at Y = 0, against the wall.
  - Plant_Hanging_01 hangs from its ring: the top of the ring is at height 0.
  - Flames, bulbs, lamp glass and shades are painted warm: add an emissive map or a
    point light in your engine for a glowing look.
  - Every model: one mesh, one material, one texture set (1024 px, 512 px for small
    props). Detail (glaze speckles, weave, grain, stitches, wear) is baked from
    high-poly sources into the normal and colour maps: light meshes, rich look.

IMPORT TIPS
  Unity   : drag the FBX and Textures folders into Assets. In the material, use BaseColor
            as Albedo / Base Map, Normal as Normal Map (set its texture type to Normal map)
            and MetallicSmoothness as Metallic map (smoothness source: Metallic alpha).
  Unreal  : import the FBX files, then the textures. Normal maps are OpenGL style: tick
            'Flip Green Channel' on the *_Normal textures.
  Godot 4 : drop the GLB files into your project, materials are set up automatically.

LICENSE
  See LICENSE.txt. Thank you for downloading!

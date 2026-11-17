// Every colour in the world lives here. Swap values to change the whole mood.
export const palette = {
  paper: '#f0dfbf',
  ink: '#2a1c16',

  // building
  wall: '#f6e3a4',
  plaster: '#f3e7d0',
  wallCut: '#e08a6c',
  floor: '#e2d3b8',
  red: '#c8402c',
  blue: '#5b8fd1',
  blueLight: '#a9c6ea',
  glass: '#4c5560',
  metal: '#6b6560',

  // ground
  earth: '#b98f62',
  earthDeep: '#96704a',
  grass: '#a8ab6e',
  pavement: '#d8c9a8',
  road: '#3e3833',
  water: '#5f7a93',
  waterMark: '#a7b7bd',
  quay: '#cdb685',

  // plants
  leaf: '#4f7b4c',
  leafLight: '#7f9f58',
  trunk: '#8a6342',

  // props
  wood: '#d39f5f',
  woodDark: '#a8723f',
  yellow: '#f2bf36',
  lampOff: '#efe2c4',
  /** The museum's rug: a faded burgundy field, a darker border. Kept muted: the sun warms it up a good deal. */
  rug: '#7d4f4c',
  rugDeep: '#5c393a',
  /** Turned soil in a planting bed. */
  soil: '#9a7450',

  // character
  skin: '#f6d2ae',
  jacket: '#e7ad38',
  trousers: '#4d6d8f',
} as const;

// Imported textures are pulled towards this set so they sit in the same world.
export const textureSwatches = [
  palette.paper, palette.ink, palette.wall, palette.wallCut, palette.floor, palette.red,
  palette.blue, palette.blueLight, palette.glass, palette.metal, palette.earth, palette.grass,
  palette.pavement, palette.quay, palette.plaster, palette.leaf, palette.leafLight, palette.trunk, palette.wood,
  palette.woodDark, palette.yellow, palette.lampOff, palette.rug, palette.rugDeep, palette.jacket, palette.trousers,
  '#fbf3e2', '#8f3a2a', '#6d4a33', '#3f5f7c', '#c9b79a', '#9c8e7c', '#e9c98f', '#b45d3a',
];

export const light = {
  /** Golden-hour key light. */
  sun: '#ffcf96',
  sunIntensity: 2.15,
  /** Direction the sun shines from. */
  sunFrom: [-0.55, 1, 0.62] as const,
  sky: '#ffe2bc',
  ground: '#8c75a3',
  ambientIntensity: 1.35,
  lamp: '#ffab52',
  /** Lamplight where it lands on a wall or a floor. */
  wash: '#ffd08a',
  lampIntensity: 9,
};

export const lineWidth = 1.6; // CSS pixels

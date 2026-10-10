// Parts lists for Brick Talk mini builds, rendered by render.js.
// Each part: { part, ...size, color, at: [x, y, z], rot: [degX, degY, degZ] }.
// y = 0 is the top of the pedestal tile. Units are studs (brick 1.2, plate 0.4).
// Colors are the same standard LEGO palette the original 64 builds use.

export const COLORS = {
  'Bright Yellow': '#F2CD37', 'Bright Red': '#C91A09', 'White': '#F4F4F4', 'Black': '#1B2A34',
  'Dark Stone Grey': '#6C6E68', 'Dark Green': '#237841', 'Bright Orange': '#FE8A18', 'Bright Blue': '#0055BF',
  'Medium Stone Grey': '#A0A5A9', 'Reddish Brown': '#582A12', 'Transparent Light Blue': '#AEEFEC',
  'Bright Green': '#4B9F4A', 'Medium Azur': '#36AEBF', 'Transparent Yellow': '#F5CD2F',
  'Bright Reddish Violet': '#923978', 'Earth Blue': '#0A3463', 'Warm Gold': '#D9AE3A', 'Light Purple': '#E4ADC8',
  'Medium Lilac': '#3F3691', 'Bright Yellowish Green': '#BBE90B', 'Brick Yellow': '#E4CD9E',
  'Transparent Red': '#E0342A', 'Transparent': '#EEF4F8', 'Dark Azur': '#078BC9', 'Nougat': '#D09168',
};

export const BUILDS = {
  // Calibration only: a recreation of the original "go" build, used to line up
  // camera, light and scale with the existing images. Not exported to the app.
  go: {
    cat: 'action', calibration: true,
    parts: [
      { part: 'cylinder', r: 0.24, h: 2.4, color: 'Dark Stone Grey', at: [0, 1.2, 0] },
      { part: 'shape', color: 'Bright Blue', depth: 1.1, at: [0, 3.4, 0], rot: [0, 0, -12],
        pts: [[-3, -0.55], [0.6, -0.55], [0.6, -1.3], [2.6, 0], [0.6, 1.3], [0.6, 0.55], [-3, 0.55]] },
      { part: 'box', w: 0.5, h: 1.1, d: 1.1, color: 'White', at: [-3.2, 4.05, 0], rot: [0, 0, -12] },
    ],
  },

  // play: a gamepad, face tilted toward the viewer. Revised because the first
  // version (white box between two big white balls) didn't read as a controller.
  play: {
    cat: 'action',
    parts: [
      { part: 'cylinder', r: 0.26, h: 2.7, color: 'Dark Stone Grey', at: [0.1, 1.35, -0.2] },
      { group: gamepad(), at: [0.1, 4.0, 0], rot: [-26, 14, 0], scale: 0.86 },
    ],
  },
};

function gamepad() {
  const body = (THREE) => {
    const s = new THREE.Shape();
    // right half, clockwise from top centre: shoulder, grip lobe, inner curve
    s.moveTo(0, 1.25);
    s.lineTo(2.1, 1.25);
    s.quadraticCurveTo(3.25, 1.25, 3.3, 0.15);
    s.quadraticCurveTo(3.45, -1.75, 2.45, -2.2);
    s.quadraticCurveTo(1.6, -2.5, 1.25, -1.45);
    s.quadraticCurveTo(0.95, -0.75, 0, -0.75);
    // left half, mirrored
    s.quadraticCurveTo(-0.95, -0.75, -1.25, -1.45);
    s.quadraticCurveTo(-1.6, -2.5, -2.45, -2.2);
    s.quadraticCurveTo(-3.45, -1.75, -3.3, 0.15);
    s.quadraticCurveTo(-3.25, 1.25, -2.1, 1.25);
    s.lineTo(0, 1.25);
    const geo = new THREE.ExtrudeGeometry(s, { depth: 0.8, bevelEnabled: true, bevelThickness: 0.22, bevelSize: 0.22, bevelSegments: 5, curveSegments: 32 });
    geo.translate(0, 0, -0.4);
    return new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: new THREE.Color(COLORS.Black), roughness: 0.42 }));
  };
  const face = 0.62; // just proud of the front face
  const button = (x, y, color) => ({ part: 'cylinder', r: 0.34, h: 0.3, color, at: [x, y, face], rot: [90, 0, 0] });
  const [bx, by, o] = [1.95, 0.2, 0.58];
  return [
    { part: body },
    // d-pad: a white "+" (two tiles crossed)
    { part: 'box', w: 1.6, h: 0.5, d: 0.3, color: 'White', at: [-1.95, 0.2, face], r: 0.05 },
    { part: 'box', w: 0.5, h: 1.6, d: 0.3, color: 'White', at: [-1.95, 0.2, face], r: 0.05 },
    // four round buttons in a diamond
    button(bx, by + o, 'Bright Yellow'),
    button(bx + o, by, 'Bright Red'),
    button(bx, by - o, 'Bright Green'),
    button(bx - o, by, 'Bright Blue'),
    // thumbsticks
    { part: 'cylinder', r: 0.36, h: 0.22, color: 'Medium Stone Grey', at: [-0.8, -0.55, face], rot: [90, 0, 0] },
    { part: 'cylinder', r: 0.36, h: 0.22, color: 'Medium Stone Grey', at: [0.8, -0.55, face], rot: [90, 0, 0] },
  ];
}


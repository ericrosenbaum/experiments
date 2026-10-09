// Does a thing ({id, name, kind, color}) match a kid-style filter?
// Shared by the host (touch events, nearest, goTo) and the sandbox (is()).
// filter: null (anything but the ground) | "red" | "tree" | "trees" | an id |
//         {color, kind} | thing("id") reference
const COLOR_NAMES = new Set(['red', 'blue', 'yellow', 'green', 'black', 'white', 'orange', 'purple', 'pink', 'brown', 'gray', 'darkgray', 'tan', 'lime', 'cyan', 'grass']);
const BRICKISH = new Set(['brick', 'tower', 'house']);

export function matchFilter(filter, desc) {
  if (!desc) return false;
  if (filter == null || filter === '' || filter === 'anything' || filter === 'something') return desc.kind !== 'ground';
  if (typeof filter === 'object') {
    if (filter.__ref === 'thing') return desc.id === filter.id;
    if (filter.__ref) return false;
    return Object.entries(filter).every(([k, v]) => (k === 'kind' ? matchFilter(String(v), { ...desc, color: null })
      : String(desc[k] ?? '').toLowerCase() === String(v).toLowerCase()));
  }
  let f = String(filter).toLowerCase().trim();
  if (f === 'grey') f = 'gray';
  if (f.endsWith('s') && !COLOR_NAMES.has(f)) f = f.replace(/(es|s)$/, (m) => (f.endsWith('ches') || f.endsWith('xes') ? '' : m === 'es' ? 'e' : ''));
  if (f === desc.color || f === desc.kind || f === desc.id || f === String(desc.name ?? '').toLowerCase()) return true;
  if (f === 'brick' && BRICKISH.has(desc.kind)) return true;
  if (['car', 'robot', 'creation', 'friend', 'model', 'player'].includes(f) && desc.kind === 'model') return true;
  return false;
}

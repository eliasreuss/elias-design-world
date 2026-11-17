// Drops normal / roughness / metalness maps from the prop GLBs. The stylized
// toon material only uses base colour, so the extra maps are dead weight.
import { NodeIO } from '@gltf-transform/core';
import { prune } from '@gltf-transform/functions';
import fs from 'node:fs';
import path from 'node:path';

const dir = process.argv[2] ?? 'public/models/props';
const io = new NodeIO();
for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.glb'))) {
  const p = path.join(dir, file);
  const before = fs.statSync(p).size;
  const doc = await io.read(p);
  for (const mat of doc.getRoot().listMaterials()) {
    mat.setNormalTexture(null);
    mat.setMetallicRoughnessTexture(null);
    mat.setOcclusionTexture(null);
  }
  await doc.transform(prune());
  await io.write(p, doc);
  console.log(file, (before / 1e6).toFixed(2), '->', (fs.statSync(p).size / 1e6).toFixed(2), 'MB');
}

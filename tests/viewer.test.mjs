import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';

import { viewerDirectory } from '../src/server.mjs';

async function readAsset(name) {
  return readFile(join(viewerDirectory(), name), 'utf8');
}

test('browser viewer is packaged with the simulation', async () => {
  const html = await readAsset('viewer.html');
  const javascript = await readAsset('gpu_viewer.js');
  const solver = await readAsset('wave_solver.mjs');

  assert.match(html, /id="incident-canvas"/);
  assert.match(html, /id="scattered-canvas"/);
  assert.match(html, /id="total-canvas"/);
  assert.match(html, /2\. Result: wave in the material/);
  assert.match(html, /3\. Scattered field = panel 2 − panel 1/);
  assert.match(html, /id="frame-gallery"/);
  assert.match(html, /id="reset"/);
  assert.match(html, /src="\/gpu_viewer\.js\?v=4"/);

  assert.match(javascript, /WaveSimulation\.create\(canvases\)/);
  assert.match(javascript, /maximumFrames = 24/);
  assert.match(javascript, /captureFrame\(simulation\)/);
  assert.match(javascript, /Math\.floor\(simulation\.step \/ 60\)/);
  assert.match(javascript, /event\.key\.toLowerCase\(\) === 'r'/);

  assert.match(solver, /update_dipoles/);
  assert.match(solver, /update_vacuum/);
  assert.match(solver, /update_medium/);
  assert.match(solver, /transmitted - incident/);
  assert.match(solver, /createComputePipelineAsync/);
  assert.match(solver, /fn boundary_damping\(x: u32, y: u32\) -> f32/);
  assert.match(solver, /if \(right_distance < 56u\)/);
  assert.match(solver, /if \(vertical_distance < 32u\)/);
  assert.doesNotMatch(solver, /let atom_x/);
  assert.doesNotMatch(solver, /let atom_y/);
  assert.match(solver, /reset\(\)/);
  assert.match(solver, /x \+= 4/);
  assert.match(solver, /y \+= 4/);
});

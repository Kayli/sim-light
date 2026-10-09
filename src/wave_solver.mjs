const SIMULATION_SHADER = `
struct Parameters {
  width: u32,
  height: u32,
  step: f32,
  wave_speed: f32,
  drive_frequency: f32,
  resonance: f32,
  damping: f32,
  polarizability: f32,
  coupling: f32,
  lattice_enabled: u32,
};

@group(0) @binding(0) var<storage, read> medium_previous: array<f32>;
@group(0) @binding(1) var<storage, read> medium_current: array<f32>;
@group(0) @binding(2) var<storage, read_write> medium_next: array<f32>;
@group(0) @binding(3) var<storage, read> vacuum_previous: array<f32>;
@group(0) @binding(4) var<storage, read> vacuum_current: array<f32>;
@group(0) @binding(5) var<storage, read_write> vacuum_next: array<f32>;
@group(0) @binding(6) var<storage, read> dipole_previous: array<f32>;
@group(0) @binding(7) var<storage, read> dipole_current: array<f32>;
@group(0) @binding(8) var<storage, read_write> dipole_next: array<f32>;
@group(0) @binding(9) var<storage, read> atom_sites: array<f32>;
@group(0) @binding(10) var<uniform> params: Parameters;

@compute @workgroup_size(256)
fn update_dipoles(@builtin(global_invocation_id) id: vec3<u32>) {
  let index = id.x;
  let count = params.width * params.height;
  if (index >= count) { return; }
  if (params.lattice_enabled == 0u || atom_sites[index] < 0.5) {
    dipole_next[index] = 0.0;
    return;
  }

  let previous = dipole_previous[index];
  let current = dipole_current[index];
  let frequency_squared = params.resonance * params.resonance;
  let field = medium_current[index];
  dipole_next[index] = (
    2.0 * current
    - (1.0 - 0.5 * params.damping) * previous
    - frequency_squared * current
    + frequency_squared * params.polarizability * field
  ) / (1.0 + 0.5 * params.damping);
}

fn boundary_damping(x: u32, y: u32) -> f32 {
  let right_distance = params.width - 1u - x;
  let vertical_distance = min(y, params.height - 1u - y);
  var right_depth = 0.0;
  var vertical_depth = 0.0;
  if (right_distance < 56u) {
    right_depth = f32(56u - right_distance) / 56.0;
  }
  if (vertical_distance < 32u) {
    vertical_depth = f32(32u - vertical_distance) / 32.0;
  }
  return 2.0 * (right_depth * right_depth * right_depth
    + vertical_depth * vertical_depth * vertical_depth);
}

fn laplacian(field: ptr<storage, array<f32>, read>, x: u32, y: u32, index: u32) -> f32 {
  let left = select(index - 1u, index, x == 0u);
  let right = select(index + 1u, index, x + 1u == params.width);
  let up = select(index - params.width, index, y == 0u);
  let down = select(index + params.width, index, y + 1u == params.height);
  return (*field)[left] + (*field)[right] + (*field)[up] + (*field)[down] - 4.0 * (*field)[index];
}

@compute @workgroup_size(256)
fn update_vacuum(@builtin(global_invocation_id) id: vec3<u32>) {
  let index = id.x;
  let count = params.width * params.height;
  if (index >= count) { return; }
  let x = index % params.width;
  let y = index / params.width;

  if (x == 0u) {
    let incoming = sin(params.drive_frequency * params.step);
    vacuum_next[index] = incoming;
    return;
  }

  let damping = boundary_damping(x, y);
  let vacuum_lap = laplacian(&vacuum_current, x, y, index);
  vacuum_next[index] = (
    2.0 * vacuum_current[index] - (1.0 - 0.5 * damping) * vacuum_previous[index]
    + params.wave_speed * params.wave_speed * vacuum_lap
  ) / (1.0 + 0.5 * damping);
}

@compute @workgroup_size(256)
fn update_medium(@builtin(global_invocation_id) id: vec3<u32>) {
  let index = id.x;
  let count = params.width * params.height;
  if (index >= count) { return; }
  let x = index % params.width;
  let y = index / params.width;

  if (x == 0u) {
    medium_next[index] = sin(params.drive_frequency * params.step);
    return;
  }

  let damping = boundary_damping(x, y);
  var polarization_acceleration = 0.0;
  if (params.lattice_enabled == 1u && atom_sites[index] > 0.5) {
    polarization_acceleration = dipole_next[index]
      - 2.0 * dipole_current[index] + dipole_previous[index];
  }
  let medium_lap = laplacian(&medium_current, x, y, index);
  medium_next[index] = (
    2.0 * medium_current[index] - (1.0 - 0.5 * damping) * medium_previous[index]
    + params.wave_speed * params.wave_speed * medium_lap
    - params.coupling * polarization_acceleration
  ) / (1.0 + 0.5 * damping);
}
`;

const DISPLAY_SHADER = `
struct DisplayParameters {
  canvas_width: f32,
  canvas_height: f32,
  view: u32,
  grid_width: u32,
  grid_height: u32,
  view_width: u32,
  view_height: u32,
  view_offset_x: u32,
  view_offset_y: u32,
  slab_start: u32,
  slab_end: u32,
  lattice_enabled: u32,
};

@group(0) @binding(0) var<storage, read> vacuum_field: array<f32>;
@group(0) @binding(1) var<storage, read> medium_field: array<f32>;
@group(0) @binding(2) var<uniform> display: DisplayParameters;
@group(0) @binding(3) var<storage, read> atom_sites: array<f32>;

@vertex
fn vertex_main(@builtin(vertex_index) vertex_index: u32) -> @builtin(position) vec4<f32> {
  let positions = array<vec2<f32>, 3>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>(3.0, -1.0),
    vec2<f32>(-1.0, 3.0),
  );
  return vec4<f32>(positions[vertex_index], 0.0, 1.0);
}

fn field_color(value: f32, scale: f32) -> vec3<f32> {
  let value_normalized = clamp(value / scale, -1.0, 1.0);
  let positive = max(value_normalized, 0.0);
  let negative = max(-value_normalized, 0.0);
  let neutral = 1.0 - max(positive, negative);
  return vec3<f32>(
    38.0 * negative + 249.0 * neutral + 231.0 * positive,
    89.0 * negative + 243.0 * neutral + 111.0 * positive,
    128.0 * negative + 229.0 * neutral + 82.0 * positive,
  ) / 255.0;
}

@fragment
fn fragment_main(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
  let view_x = min(u32(position.x / display.canvas_width * f32(display.view_width)), display.view_width - 1u);
  let view_y = min(u32(position.y / display.canvas_height * f32(display.view_height)), display.view_height - 1u);
  let x = view_x + display.view_offset_x;
  let y = view_y + display.view_offset_y;
  let index = y * display.grid_width + x;
  let incident = vacuum_field[index];
  let transmitted = medium_field[index];
  var value = transmitted;
  var scale = 1.0;
  if (display.view == 0u) { value = incident; }
  if (display.view == 1u) { value = transmitted - incident; scale = 2.0; }
  var color = field_color(value, scale);
  if (display.lattice_enabled == 1u && x >= display.slab_start && x <= display.slab_end) {
    color = mix(color, vec3<f32>(0.10, 0.34, 0.27), 0.11);
  }
  if (display.lattice_enabled == 1u && (x == display.slab_start || x == display.slab_end)) {
    color = vec3<f32>(0.94, 0.97, 0.86);
  }
  if (display.lattice_enabled == 1u && display.view != 0u
    && x >= display.slab_start + 2u && x <= display.slab_end
    && y >= 3u && y < display.grid_height - 3u) {
    let grid_position = vec2<f32>(
      position.x * f32(display.view_width) / display.canvas_width + f32(display.view_offset_x),
      position.y * f32(display.view_height) / display.canvas_height + f32(display.view_offset_y),
    );
    let first_atom_x = f32(display.slab_start + 3u);
    let atom_x = first_atom_x + 4.0 * floor((grid_position.x - 0.5 - first_atom_x + 2.0) / 4.0);
    let atom_y = 4.0 + 4.0 * floor((grid_position.y - 0.5 - 4.0 + 2.0) / 4.0);
    if (atom_x >= first_atom_x && atom_x < f32(display.slab_end)
      && atom_y >= 4.0 && atom_y < f32(display.grid_height - 4u)) {
      let atom_index = u32(atom_y) * display.grid_width + u32(atom_x);
      if (atom_sites[atom_index] > 0.5) {
        let pixel_scale = vec2<f32>(
          display.canvas_width / f32(display.view_width),
          display.canvas_height / f32(display.view_height),
        );
        let offset = (grid_position - vec2<f32>(atom_x + 0.5, atom_y + 0.5)) * pixel_scale;
        let distance = length(offset);
        if (distance <= 4.0) {
          color = vec3<f32>(0.08, 0.20, 0.21);
        }
        if (distance <= 2.2) {
          color = vec3<f32>(1.0, 0.68, 0.28);
        }
      }
    }
  }
  return vec4<f32>(color, 1.0);
}
`;

function createBuffer(device, size, usage, label) {
  return device.createBuffer({ label, size, usage });
}

function createBufferSet(device, size, label) {
  const usage = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST;
  return [0, 1, 2].map((index) => createBuffer(device, size, usage, `${label} ${index}`));
}

function rotate(buffers) {
  buffers.push(buffers.shift());
}

export class WaveSimulation {
  static async create(canvases) {
    if (!navigator.gpu) throw new Error('This browser does not expose the WebGPU API.');
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) throw new Error('WebGPU is present, but no GPU adapter is available.');
    const device = await adapter.requestDevice();
    const simulation = new WaveSimulation(device, canvases);
    await simulation.initialize();
    return simulation;
  }

  constructor(device, canvases) {
    this.device = device;
    this.canvases = canvases;
    this.viewWidth = 320;
    this.viewHeight = 180;
    this.waveSpeed = 0.62;
    this.driveFrequency = 0.24;
    this.resonance = 0.33;
    this.damping = 0.015;
    this.polarizability = 1.2;
    this.coupling = 2;
    this.latticeEnabled = true;
    this.step = 0;
    this.slabStart = 104;
    this.slabEnd = 216;
    this.paddingWavelengths = 8;
    this.paddingCells = this.calculatePaddingCells(this.paddingWavelengths);
    this.configureGrid();
    this.allocateStateBuffers();
    this.parameters = createBuffer(device, 48, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST, 'simulation parameters');
    this.displayBuffers = canvases.map((canvas, index) => {
      const buffer = createBuffer(device, 48, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST, `display parameters ${index}`);
      const context = canvas.getContext('webgpu');
      context.configure({ device, format: navigator.gpu.getPreferredCanvasFormat(), alphaMode: 'opaque' });
      return { canvas, context, buffer, view: index };
    });
    this.format = navigator.gpu.getPreferredCanvasFormat();
  }

  calculatePaddingCells(wavelengths) {
    const waveNumber = 2 * Math.asin(Math.sin(this.driveFrequency / 2) / this.waveSpeed);
    const cellsPerWavelength = 2 * Math.PI / waveNumber;
    return Math.ceil((wavelengths * cellsPerWavelength) / 4) * 4;
  }

  configureGrid() {
    this.width = this.viewWidth + this.paddingCells;
    this.height = this.viewHeight + 2 * this.paddingCells;
    this.count = this.width * this.height;
  }

  allocateStateBuffers() {
    this.medium = createBufferSet(this.device, this.count * 4, 'medium field');
    this.vacuum = createBufferSet(this.device, this.count * 4, 'vacuum field');
    this.dipoles = createBufferSet(this.device, this.count * 4, 'atomic dipoles');
    this.atomSites = createBuffer(
      this.device,
      this.count * 4,
      GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      'atomic lattice sites',
    );
    this.initializeAtoms();
  }

  setPaddingWavelengths(wavelengths) {
    const nextPadding = Math.max(0, Math.min(30, Math.round(wavelengths)));
    if (nextPadding === this.paddingWavelengths) return false;

    const oldBuffers = [...this.medium, ...this.vacuum, ...this.dipoles, this.atomSites];
    this.paddingWavelengths = nextPadding;
    this.paddingCells = this.calculatePaddingCells(nextPadding);
    this.configureGrid();
    this.allocateStateBuffers();
    this.step = 0;
    this.device.queue.onSubmittedWorkDone().then(() => {
      for (const buffer of oldBuffers) buffer.destroy();
    });
    return true;
  }

  initializeAtoms() {
    const occupancy = new Float32Array(this.count);
    for (let x = this.slabStart + 3; x < this.slabEnd; x += 4) {
      for (let y = 4; y < this.height - 4; y += 4) {
        occupancy[y * this.width + x] = 1;
      }
    }
    this.device.queue.writeBuffer(this.atomSites, 0, occupancy);
  }

  async initialize() {
    const module = this.device.createShaderModule({ code: SIMULATION_SHADER });
    const diagnostics = await module.getCompilationInfo();
    const errors = diagnostics.messages.filter((message) => message.type === 'error');
    if (errors.length) throw new Error(errors.map((message) => message.message).join('\n'));
    this.polarizationPipeline = await this.device.createComputePipelineAsync({
      layout: 'auto',
      compute: { module, entryPoint: 'update_dipoles' },
    });
    this.wavePipeline = await this.device.createComputePipelineAsync({
      layout: 'auto',
      compute: { module, entryPoint: 'update_vacuum' },
    });
    this.mediumPipeline = await this.device.createComputePipelineAsync({
      layout: 'auto',
      compute: { module, entryPoint: 'update_medium' },
    });
    const displayModule = this.device.createShaderModule({ code: DISPLAY_SHADER });
    const displayDiagnostics = await displayModule.getCompilationInfo();
    const displayErrors = displayDiagnostics.messages.filter((message) => message.type === 'error');
    if (displayErrors.length) throw new Error(displayErrors.map((message) => message.message).join('\n'));
    this.displayPipeline = await this.device.createRenderPipelineAsync({
      layout: 'auto',
      vertex: { module: displayModule, entryPoint: 'vertex_main' },
      fragment: {
        module: displayModule,
        entryPoint: 'fragment_main',
        targets: [{ format: this.format }],
      },
      primitive: { topology: 'triangle-list' },
    });
  }

  writeSimulationParameters() {
    const bytes = new ArrayBuffer(48);
    const view = new DataView(bytes);
    view.setUint32(0, this.width, true);
    view.setUint32(4, this.height, true);
    view.setFloat32(8, this.step, true);
    view.setFloat32(12, this.waveSpeed, true);
    view.setFloat32(16, this.driveFrequency, true);
    view.setFloat32(20, this.resonance, true);
    view.setFloat32(24, this.damping, true);
    view.setFloat32(28, this.polarizability, true);
    view.setFloat32(32, this.coupling, true);
    view.setUint32(36, this.latticeEnabled ? 1 : 0, true);
    this.device.queue.writeBuffer(this.parameters, 0, bytes);
  }

  dispatch(encoder, pipeline, entries) {
    const pass = encoder.beginComputePass();
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, this.device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: entries.map(([binding, buffer]) => ({ binding, resource: { buffer } })),
    }));
    pass.dispatchWorkgroups(Math.ceil(this.count / 256));
    pass.end();
  }

  advance() {
    this.step += 1;
    this.writeSimulationParameters();
    const encoder = this.device.createCommandEncoder();
    this.dispatch(encoder, this.polarizationPipeline, [
      [1, this.medium[1]],
      [6, this.dipoles[0]],
      [7, this.dipoles[1]],
      [8, this.dipoles[2]],
      [9, this.atomSites],
      [10, this.parameters],
    ]);
    this.dispatch(encoder, this.wavePipeline, [
      ...this.vacuum.map((buffer, index) => [index + 3, buffer]),
      [10, this.parameters],
    ]);
    this.dispatch(encoder, this.mediumPipeline, [
      ...this.medium.map((buffer, index) => [index, buffer]),
      ...this.dipoles.map((buffer, index) => [index + 6, buffer]),
      [9, this.atomSites],
      [10, this.parameters],
    ]);
    this.device.queue.submit([encoder.finish()]);
    rotate(this.medium);
    rotate(this.vacuum);
    rotate(this.dipoles);
  }

  setLatticeEnabled(enabled) {
    if (this.latticeEnabled === enabled) return;
    this.latticeEnabled = enabled;
  }

  reset() {
    const encoder = this.device.createCommandEncoder();
    for (const buffer of [...this.medium, ...this.vacuum, ...this.dipoles]) {
      encoder.clearBuffer(buffer);
    }
    this.device.queue.submit([encoder.finish()]);
    this.step = 0;
  }

  render() {
    const encoder = this.device.createCommandEncoder();
    for (const display of this.displayBuffers) {
      const { width, height } = display.canvas;
      const bytes = new ArrayBuffer(48);
      const params = new DataView(bytes);
      params.setFloat32(0, width, true);
      params.setFloat32(4, height, true);
      params.setUint32(8, display.view, true);
      params.setUint32(12, this.width, true);
      params.setUint32(16, this.height, true);
      params.setUint32(20, this.viewWidth, true);
      params.setUint32(24, this.viewHeight, true);
      params.setUint32(28, 0, true);
      params.setUint32(32, this.paddingCells, true);
      params.setUint32(36, this.slabStart, true);
      params.setUint32(40, this.slabEnd, true);
      params.setUint32(44, this.latticeEnabled ? 1 : 0, true);
      this.device.queue.writeBuffer(display.buffer, 0, bytes);
      const bindGroup = this.device.createBindGroup({
        layout: this.displayPipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: this.vacuum[1] } },
          { binding: 1, resource: { buffer: this.medium[1] } },
          { binding: 2, resource: { buffer: display.buffer } },
          { binding: 3, resource: { buffer: this.atomSites } },
        ],
      });
      const pass = encoder.beginRenderPass({
        colorAttachments: [{
          view: display.context.getCurrentTexture().createView(),
          clearValue: { r: 0.97, g: 0.95, b: 0.90, a: 1 },
          loadOp: 'clear',
          storeOp: 'store',
        }],
      });
      pass.setPipeline(this.displayPipeline);
      pass.setBindGroup(0, bindGroup);
      pass.draw(3);
      pass.end();
    }
    this.device.queue.submit([encoder.finish()]);
  }
}
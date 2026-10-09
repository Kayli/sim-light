import { WaveSimulation } from './wave_solver.mjs?v=7';

const canvases = [
  document.querySelector('#incident-canvas'),
  document.querySelector('#scattered-canvas'),
  document.querySelector('#total-canvas'),
];
const status = document.querySelector('#simulation-status');
const speedInput = document.querySelector('#speed');
const speedLabel = document.querySelector('#speed-label');
const paddingInput = document.querySelector('#padding');
const paddingLabel = document.querySelector('#padding-label');
const pauseButton = document.querySelector('#pause');
const resetButton = document.querySelector('#reset');
const latticeToggle = document.querySelector('#lattice-toggle');
const frameGallery = document.querySelector('#frame-gallery');
let paused = false;
let simulationRate = Number(speedInput.value);
let lastFrame = performance.now();
let pendingSteps = 0;
let frameNumber = 0;
let lastCapturedSecond = 0;
let simulationEpoch = 0;
const capturedFrames = [];
const maximumFrames = 24;

function resizeCanvases() {
  const ratio = window.devicePixelRatio || 1;
  for (const canvas of canvases) {
    const bounds = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.round(bounds.width * ratio));
    canvas.height = Math.max(1, Math.round(bounds.height * ratio));
  }
}

function showError(error) {
  status.textContent = `GPU simulation unavailable: ${error.message}`;
  status.classList.add('error');
  console.error(error);
}

function captureFrame(simulation) {
  const captureEpoch = simulationEpoch;
  const latticeEnabled = simulation.latticeEnabled;
  const pixelRatio = window.devicePixelRatio || 1;
  const frameCanvas = document.createElement('canvas');
  const headingHeight = Math.round(28 * pixelRatio);
  const gap = Math.round(3 * pixelRatio);
  frameCanvas.width = canvases[0].width;
  const captureCanvases = [canvases[0], canvases[2], canvases[1]];
  frameCanvas.height = captureCanvases.reduce((height, canvas) => height + headingHeight + canvas.height + gap, 0);
  const context = frameCanvas.getContext('2d');
  const titles = [
    'Vacuum reference',
    latticeEnabled ? 'With atomic lattice' : 'No lattice: wave only',
    latticeEnabled ? 'Scattered difference' : 'No lattice: zero difference',
  ];
  let y = 0;
  context.fillStyle = '#f6f3eb';
  context.fillRect(0, 0, frameCanvas.width, frameCanvas.height);
  context.font = `${Math.round(14 * pixelRatio)}px system-ui`;
  context.fillStyle = '#123c4a';
  for (let index = 0; index < captureCanvases.length; index += 1) {
    context.fillText(titles[index], 8 * pixelRatio, y + headingHeight * 0.72);
    y += headingHeight;
    context.drawImage(captureCanvases[index], 0, y, frameCanvas.width, captureCanvases[index].height);
    y += captureCanvases[index].height + gap;
  }
  frameCanvas.toBlob((blob) => {
    if (!blob || captureEpoch !== simulationEpoch) return;
    const url = URL.createObjectURL(blob);
    const elapsed = (simulation.step / 60).toFixed(1);
    const link = document.createElement('a');
    link.className = 'frame-link';
    link.href = url;
    link.download = `ewald-oseen-${String(frameNumber).padStart(3, '0')}.png`;
    link.title = 'Click to download this three-panel PNG frame';
    const image = document.createElement('img');
    image.src = url;
    image.alt = `Simulation at ${elapsed} seconds`;
    const label = document.createElement('span');
    label.textContent = `Frame ${frameNumber} · t = ${elapsed} s · lattice ${latticeEnabled ? 'on' : 'off'}`;
    link.append(image, label);
    frameGallery.append(link);
    capturedFrames.push({ link, url });
    frameNumber += 1;
    while (capturedFrames.length > maximumFrames) {
      const oldFrame = capturedFrames.shift();
      oldFrame.link.remove();
      URL.revokeObjectURL(oldFrame.url);
    }
  }, 'image/png');
}

function clearCapturedFrames() {
  simulationEpoch += 1;
  for (const frame of capturedFrames) URL.revokeObjectURL(frame.url);
  capturedFrames.length = 0;
  frameGallery.replaceChildren();
  frameNumber = 0;
  lastCapturedSecond = 0;
}

async function start() {
  if (!navigator.gpu) {
    throw new Error('WebGPU is not available in this browser. Use a current Chromium-based browser.');
  }
  resizeCanvases();
  const simulation = await WaveSimulation.create(canvases);
  status.textContent = 'WebGPU: Lorentz dipoles + 2D wave equation';

  function frame(now) {
    const elapsed = Math.min((now - lastFrame) / 1000, 0.05);
    lastFrame = now;
    if (!paused) pendingSteps += elapsed * 60 * simulationRate;
    let steps = 0;
    while (pendingSteps >= 1 && steps < 3) {
      simulation.advance();
      pendingSteps -= 1;
      steps += 1;
    }
    simulation.render();
    const simulationSecond = Math.floor(simulation.step / 60);
    if (!paused && simulationSecond > lastCapturedSecond) {
      lastCapturedSecond = simulationSecond;
      captureFrame(simulation);
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  new ResizeObserver(() => {
    resizeCanvases();
  }).observe(document.querySelector('.fields'));
  return simulation;
}

speedInput.addEventListener('input', () => {
  simulationRate = Number(speedInput.value);
  speedLabel.value = `${simulationRate.toFixed(1)}×`;
});

paddingInput.addEventListener('input', () => {
  paddingLabel.value = `${paddingInput.value} λ`;
});

paddingInput.addEventListener('change', () => {
  const simulation = window.waveSimulation;
  if (!simulation || !simulation.setPaddingWavelengths(Number(paddingInput.value))) return;
  pendingSteps = 0;
  lastFrame = performance.now();
  clearCapturedFrames();
});

function togglePause() {
  paused = !paused;
  pauseButton.firstChild.textContent = paused ? 'Resume ' : 'Pause ';
}

function resetSimulation() {
  if (!window.waveSimulation) return;
  window.waveSimulation.reset();
  pendingSteps = 0;
  lastFrame = performance.now();
  paused = false;
  pauseButton.firstChild.textContent = 'Pause ';
  clearCapturedFrames();
}

pauseButton.addEventListener('click', togglePause);
resetButton.addEventListener('click', resetSimulation);
latticeToggle.addEventListener('change', () => {
  if (!window.waveSimulation) return;
  window.waveSimulation.setLatticeEnabled(latticeToggle.checked);
});
document.addEventListener('keydown', (event) => {
  if (event.code === 'Space' && !['INPUT', 'BUTTON'].includes(document.activeElement.tagName)) {
    event.preventDefault();
    togglePause();
  }
  if (event.key.toLowerCase() === 'r' && !['INPUT', 'BUTTON', 'A'].includes(document.activeElement.tagName)) {
    resetSimulation();
  }
});

start()
  .then((simulation) => {
    window.waveSimulation = simulation;
  })
  .catch(showError);
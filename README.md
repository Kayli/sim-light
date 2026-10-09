# sim-light

An animated WebGPU simulation of a 2D scalar wave coupled to a lattice of
Lorentz oscillators. The atom response and propagating field are advanced
together in time, rather than drawing preselected wavefronts.

## Run

```bash
make install
make run
```

`make run` starts a local server at `http://localhost:8000/viewer.html`. In VS
Code, open the **Ports** panel, select port `8000`, and open its forwarded URL.
This works in a devcontainer without X11 or Wayland.

```bash
node src/cli.mjs --port 8080
```

The browser viewer compares three synchronized runs: the incident wave with no
atoms, the difference caused by the atoms (the scattered field), and the total
field with the atomic lattice present. The atoms are driven by the local field;
their polarization feeds back into the 2D wave equation each time step. Use the
rate slider or space to pause. Press `R` to reset the fields, restart the wave,
and clear the capture timeline. The page saves a composite PNG frame once per
second; click a thumbnail to download it. It keeps the latest 24 frames.

The solver uses a scalar 2D Maxwell-wave analogue with discrete classical
Lorentz dipoles, not vector Maxwell equations or quantum electrons. It omits
atomic-scale structure, vector polarization, and perfectly matched layers. A
smooth sponge at the far and side edges absorbs outgoing waves to approximate
open space, so they do not bounce back from the edge of the display. The atomic
radiators and their interference are computed rather than drawn as rings. The
lattice spacing is kept smaller than the wavelength to limit artificial
diffraction from the coarse grid.

For a fuller description of the panels, controls, captures, and model limits,
see [Simulation Overview](docs/simulation-overview.md).
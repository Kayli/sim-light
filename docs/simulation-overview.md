# Simulation Overview

## Purpose

This project visualizes the Ewald–Oseen extinction idea with a time-evolving,
two-dimensional scalar wave model. A plane wave enters from the left and
interacts with a slab of classical Lorentz oscillators. Each oscillator
responds to the local field and radiates back into the wave equation. The
interference of the incident field and the radiation produces the transmitted,
reflected, and scattered fields.

The field and oscillator states are advanced together on the GPU using WebGPU
compute shaders. The animation is calculated from the solver; wavefront rings
are not drawn as a visual effect.

## Panels

The three panels are synchronized in time:

1. **Vacuum wave** shows the source wave in the reference run without atoms.
2. **Result: wave in the material** shows the total field with the lattice
   enabled.
3. **Scattered field = panel 2 − panel 1** shows the signed difference between
   the total field and the vacuum reference. The subtraction happens on field
   values before they are mapped to colors.

Thus, $E_{\text{with lattice}} = E_{\text{vacuum}} + E_{\text{scattered}}$.
The difference panel includes radiation traveling both forward and backward.

## Controls

- **Atomic lattice** enables or disables the oscillator response and its
  feedback into the wave equation. Switching it does not reset simulation
  time, erase existing fields, or clear the capture timeline. Waves already
  in flight continue propagating after the lattice is switched off; switching
  it back on makes the oscillators respond to the field then present.
- **Simulation rate** changes how quickly simulation steps advance.
- **Hidden edge padding** adds simulation space above, below, and to the right
  of the displayed region, measured in wavelengths. The default is 8
  wavelengths (132 grid cells after lattice alignment); changing it resets the
  simulation. Absorbing layers remain at the outer edge of this enlarged
  domain.
- **Pause / space** pauses or resumes the animation.
- **Reset simulation / R** clears the wave and oscillator buffers, restarts
  the source from the beginning, and clears captured frames.

When the lattice is enabled, small atom-site markers are drawn over panels 2
and 3. The markers come from the solver's lattice occupancy data, are only a
visual aid, and do not replace or alter the computed field. They are hidden
when the lattice is disabled. Panel 1 remains the vacuum reference either way.

## Captures

The viewer creates a downloadable composite PNG about once per simulated
second. It contains the three panels in their displayed order. The gallery
retains only the latest 24 frames and labels each frame with the lattice state
that was active when it was captured. Toggling the lattice leaves older frames
in place so the change can be compared over the same timeline.

## Numerical Model and Limits

The solver is a two-dimensional scalar wave equation coupled to discrete
classical Lorentz dipoles. It is a useful qualitative model of how a material's
polarization can modify an incident wave, but it is not a full electromagnetic
simulation:

- It does not solve the full vector Maxwell equations or represent quantum
  electrons.
- The lattice, oscillator constants, and coupling are illustrative rather
  than calibrated to a particular material, so the model should not be used
  for quantitative reflectance or refractive-index predictions.
- Smooth damping layers reduce outgoing waves at the outer edges of the
  enlarged domain. Hidden padding keeps these layers away from the displayed
  region. They approximate open boundaries but are not perfectly matched
  layers, so the finite grid is not perfectly reflection-free.
- The lattice is coarse compared with atomic-scale structure. Its spacing is
  chosen relative to the simulated wavelength to limit grid diffraction.

## Validation

The project test suite is run with `make test` (`node --test`). `make check`
runs the lint check. The GPU viewer also checks shader compilation during
startup; a running status indicates that the WebGPU solver initialized.
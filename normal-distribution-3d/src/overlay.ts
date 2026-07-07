import { STD_RANGE, type FitResult } from './types';

import { formatValue as fmt } from './format';

/**
 * DOM legend layered above the canvas (pointer-events: none, so it never
 * blocks dragging). Built with textContent — column names are user data
 * and must not be interpreted as HTML.
 */
export type SurfaceInfo = { kind: 'fit' } | { kind: 'kde'; h: number };

export class Overlay {
  constructor(private readonly el: HTMLElement) {}

  update(fit: FitResult, xName: string, yName: string, surface: SurfaceInfo = { kind: 'fit' }): void {
    this.el.replaceChildren();

    const add = (cls: string, text: string) => {
      const div = document.createElement('div');
      div.className = cls;
      div.textContent = text;
      this.el.appendChild(div);
    };

    if (fit.kind === 'fit') {
      add('title', surface.kind === 'kde' ? 'Empirical density (KDE)' : 'Bivariate normal fit');
      add('row', `X · ${xName}: μ = ${fmt(fit.muX)}, σ = ${fmt(fit.sigmaX)}`);
      add('row', `Y · ${yName}: μ = ${fmt(fit.muY)}, σ = ${fmt(fit.sigmaY)}`);
      add('row', `ρ = ${fmt(fit.rho)} · n = ${fit.n.toLocaleString()} rows`);
      if (surface.kind === 'kde') add('range', `Bandwidth: ${fmt(surface.h)}σ (Scott's rule)`);
      add('range', `Plotted range: μ ± ${STD_RANGE}σ per axis`);
      if (fit.note) add('note', fit.note);
    } else {
      add('title', 'Standard normal (sample)');
      add('row', 'X: μ = 0, σ = 1 · Y: μ = 0, σ = 1 · ρ = 0');
      add('range', `Plotted range: μ ± ${STD_RANGE}σ per axis`);
      add('note', fit.reason);
    }
  }
}

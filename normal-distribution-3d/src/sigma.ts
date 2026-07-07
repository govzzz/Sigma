import { client } from '@sigmacomputing/plugin';
import type { ColumnMap, ElementData } from './types';

// Must run at module load, before anything renders. Outside Sigma this is a
// harmless postMessage into the void — the standalone fallback still works.
client.config.configureEditorPanel([
  { name: 'source', type: 'element' },
  {
    name: 'xColumn',
    type: 'column',
    source: 'source',
    allowMultiple: false,
    allowedTypes: ['number', 'integer'],
    label: 'X Column',
  },
  {
    name: 'yColumn',
    type: 'column',
    source: 'source',
    allowMultiple: false,
    allowedTypes: ['number', 'integer'],
    label: 'Y Column',
  },
  { name: 'showPoints', type: 'toggle', label: 'Show data points', defaultValue: true },
  { name: 'showAxes', type: 'toggle', label: 'Show axes', defaultValue: true },
  {
    name: 'surfaceMode',
    type: 'radio',
    values: ['Empirical density', 'Normal fit'],
    defaultValue: 'Empirical density',
    label: 'Surface',
  },
]);

export interface PluginConfig {
  source?: string;
  xColumn?: string;
  yColumn?: string;
  showPoints?: boolean;
  showAxes?: boolean;
  surfaceMode?: string;
}

/**
 * Sigma delivers element data in chunks of 25k points and the subscription
 * callback carries no "more available" flag; completeness must be inferred
 * from the row count. 'loading' = at a chunk boundary, more requested;
 * 'capped' = auto-fetch stopped at MAX_AUTO_FETCH_ROWS.
 */
export type PartialState = 'loading' | 'capped' | null;

const CHUNK = 25_000;
const MAX_AUTO_FETCH_ROWS = 500_000;

export interface SigmaHandlers {
  onConfig(config: PluginConfig): void;
  onData(data: ElementData, partial: PartialState): void;
  onColumns(columns: ColumnMap): void;
}

/**
 * Subscription lifecycle. Config changes fire for every editor-panel edit
 * (column picks included), so element subscriptions are torn down and
 * recreated ONLY when the source element actually changes — column-only
 * changes recompute against cached data upstream.
 */
export function initSigma(handlers: SigmaHandlers): void {
  let currentSource: string | undefined;
  let unsubs: Array<() => void> = [];

  client.config.subscribe((config) => {
    const cfg = (config ?? {}) as PluginConfig;
    handlers.onConfig(cfg);

    const source = typeof cfg.source === 'string' && cfg.source ? cfg.source : undefined;
    if (source === currentSource) return;

    for (const unsub of unsubs) {
      try {
        unsub();
      } catch (err) {
        console.warn('normal-distribution-3d: unsubscribe failed', err);
      }
    }
    unsubs = [];
    currentSource = source;
    if (!source) return;

    unsubs.push(
      client.elements.subscribeToElementColumns(source, (columns) => {
        handlers.onColumns((columns ?? {}) as ColumnMap);
      }),
    );

    // Auto-paginate: whenever a payload lands exactly on a chunk boundary and
    // has grown since the last fetch request, ask for the next chunk. Sigma
    // re-delivers the enlarged payload through this same callback, so the
    // loop terminates as soon as the length stops growing.
    let fetchedLen = 0;
    unsubs.push(
      client.elements.subscribeToElementData(source, (data) => {
        const d = (data ?? {}) as ElementData;
        let len = 0;
        for (const arr of Object.values(d)) if (arr && arr.length > len) len = arr.length;

        let partial: PartialState = null;
        if (len > 0 && len % CHUNK === 0) {
          if (len >= MAX_AUTO_FETCH_ROWS) {
            partial = 'capped';
          } else {
            partial = 'loading';
            if (len > fetchedLen) {
              fetchedLen = len;
              client.elements.fetchMoreElementData(source);
            }
          }
        }
        handlers.onData(d, partial);
      }),
    );
  });
}

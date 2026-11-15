import React, { useEffect, useMemo, useState } from 'react';
import { useMap } from '@vis.gl/react-google-maps';
import { HeatmapLayer } from '@deck.gl/aggregation-layers';
import { GoogleMapsOverlay } from '@deck.gl/google-maps';
import type { Color } from '@deck.gl/core';
import { HeatmapMetricMode, HeatmapPoint } from '../lib/marketHeatmap';

interface ProspectHeatmapOverlayProps {
  visible: boolean;
  points: HeatmapPoint[];
  mode: HeatmapMetricMode;
  radiusPixels: number;
  intensity: number;
}

const HEATMAP_COLOR_RANGE: Color[] = [
  [106, 228, 192, 165], // Teal - Lower density / Moderate comp
  [217, 241, 84, 205],  // Electric Lime - Rising opportunity
  [255, 205, 66, 225],  // Solar Amber - Strong sweet spot
  [255, 132, 66, 240],  // Vivid Orange - High density + low comp
  [255, 76, 91, 255],   // Hot Coral - Top priority hotspot
];

function detectWebGL2(): boolean {
  if (typeof document === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    return Boolean(gl);
  } catch {
    return false;
  }
}

function colorForRatio(ratio: number): string {
  const t = Math.max(0, Math.min(1, ratio));
  if (t < 0.25) return 'rgba(106, 228, 192, 0.55)';
  if (t < 0.5) return 'rgba(217, 241, 84, 0.72)';
  if (t < 0.75) return 'rgba(255, 205, 66, 0.85)';
  return 'rgba(255, 76, 91, 0.92)';
}

export const ProspectHeatmapOverlay: React.FC<ProspectHeatmapOverlayProps> = ({
  visible,
  points,
  mode,
  radiusPixels,
  intensity,
}) => {
  const map = useMap();
  const [webglAvailable, setWebglAvailable] = useState<boolean>(() => detectWebGL2());

  // Primary WebGL2 deck.gl GoogleMapsOverlay (official HeatmapLayer replacement)
  const deckOverlay = useMemo(() => {
    if (!webglAvailable) return null;
    try {
      return new GoogleMapsOverlay({ interleaved: false });
    } catch {
      return null;
    }
  }, [webglAvailable]);

  useEffect(() => {
    if (!deckOverlay || !map || !webglAvailable) return;
    try {
      deckOverlay.setMap(map);
    } catch {
      setWebglAvailable(false);
    }
    return () => {
      try {
        deckOverlay.setMap(null);
      } catch {
        // Ignore teardown errors if map instance already unmounted
      }
    };
  }, [deckOverlay, map, webglAvailable]);

  useEffect(() => {
    return () => {
      if (deckOverlay) {
        try {
          deckOverlay.finalize();
        } catch {
          // Safe cleanup
        }
      }
    };
  }, [deckOverlay]);

  const deckLayers = useMemo(() => {
    if (!visible || points.length === 0 || !webglAvailable) return [];
    return [
      new HeatmapLayer<HeatmapPoint>({
        id: `clientsology-crm-heatmap-${mode}`,
        data: points,
        pickable: false,
        aggregation: 'SUM',
        getPosition: (d: HeatmapPoint) => [d.lng, d.lat],
        getWeight: (d: HeatmapPoint) => d.weight,
        radiusPixels,
        intensity,
        threshold: 0.04,
        colorRange: HEATMAP_COLOR_RANGE,
        updateTriggers: {
          getWeight: [mode],
        },
      }),
    ];
  }, [visible, points, mode, radiusPixels, intensity, webglAvailable]);

  useEffect(() => {
    if (!deckOverlay || !webglAvailable) return;
    try {
      deckOverlay.setProps({ layers: deckLayers });
    } catch {
      setWebglAvailable(false);
    }
  }, [deckOverlay, deckLayers, webglAvailable]);

  // Fallback 2D Canvas OverlayView for environments without WebGL2 (CF3 safety)
  useEffect(() => {
    if (webglAvailable || !map || !visible || points.length === 0) return;

    interface GoogleProjection {
      fromLatLngToDivPixel: (latLng: unknown) => { x: number; y: number } | null;
    }

    interface GoogleOverlayViewBase {
      getPanes: () => { overlayLayer?: HTMLElement } | null;
      getProjection: () => GoogleProjection | null;
      setMap: (targetMap: unknown) => void;
    }

    interface GoogleMapsNamespace {
      OverlayView: new () => GoogleOverlayViewBase;
      LatLng: new (lat: number, lng: number) => unknown;
    }

    const googleMaps = (
      window as unknown as { google?: { maps?: GoogleMapsNamespace } }
    ).google?.maps;
    if (!googleMaps?.OverlayView || !googleMaps?.LatLng) return;

    const OverlayViewCtor = googleMaps.OverlayView;
    const LatLngCtor = googleMaps.LatLng;
    const maxWeight = Math.max(1, ...points.map((p) => p.weight));

    class CanvasHeatmapOverlay extends OverlayViewCtor {
      private canvas: HTMLCanvasElement | null = null;

      onAdd(): void {
        const canvas = document.createElement('canvas');
        canvas.style.position = 'absolute';
        canvas.style.pointerEvents = 'none';
        this.canvas = canvas;
        const panes = this.getPanes();
        panes?.overlayLayer?.appendChild(canvas);
      }

      draw(): void {
        if (!this.canvas || !map) return;
        const projection = this.getProjection();
        const div = map.getDiv();
        if (!projection || !div) return;

        const width = div.clientWidth || 640;
        const height = div.clientHeight || 480;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);

        if (this.canvas.width !== width * dpr || this.canvas.height !== height * dpr) {
          this.canvas.width = width * dpr;
          this.canvas.height = height * dpr;
          this.canvas.style.width = `${width}px`;
          this.canvas.style.height = `${height}px`;
        }

        const bounds = map.getBounds();
        if (bounds) {
          const ne = projection.fromLatLngToDivPixel(bounds.getNorthEast());
          const sw = projection.fromLatLngToDivPixel(bounds.getSouthWest());
          if (ne && sw) {
            this.canvas.style.left = `${Math.round(sw.x)}px`;
            this.canvas.style.top = `${Math.round(ne.y)}px`;
          }
        }

        const ctx = this.canvas.getContext('2d');
        if (!ctx) return;

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, width, height);

        const offsetLeft = parseFloat(this.canvas.style.left || '0') || 0;
        const offsetTop = parseFloat(this.canvas.style.top || '0') || 0;

        ctx.globalCompositeOperation = 'screen';
        points.forEach((pt) => {
          const px = projection.fromLatLngToDivPixel(new LatLngCtor(pt.lat, pt.lng));
          if (!px) return;
          const x = px.x - offsetLeft;
          const y = px.y - offsetTop;
          const r = Math.max(24, radiusPixels);
          if (x < -r || y < -r || x > width + r || y > height + r) return;

          const ratio = Math.min(1, (pt.weight / maxWeight) * Math.min(1.8, intensity));
          const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
          grad.addColorStop(0, colorForRatio(ratio));
          grad.addColorStop(0.55, colorForRatio(ratio * 0.6));
          grad.addColorStop(1, 'rgba(106, 228, 192, 0)');
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fill();
        });
      }

      onRemove(): void {
        if (this.canvas?.parentNode) {
          this.canvas.parentNode.removeChild(this.canvas);
        }
        this.canvas = null;
      }
    }

    const overlay = new CanvasHeatmapOverlay();
    overlay.setMap(map);
    const boundsListener = map.addListener('bounds_changed', () => {
      overlay.draw();
    });

    return () => {
      boundsListener.remove();
      overlay.setMap(null);
    };
  }, [webglAvailable, map, visible, points, radiusPixels, intensity]);

  return null;
};

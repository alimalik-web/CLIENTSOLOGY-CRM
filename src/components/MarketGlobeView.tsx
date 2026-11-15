import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import {
  ArrowUpRight,
  ChevronDown,
  ChevronUp,
  Compass,
  Globe2,
  Layers,
  MapPin,
  Search,
  Send,
  Sparkles,
  TrendingUp,
  X,
} from 'lucide-react';
import { formatMoney, formatMoneyRange } from '../data/currency';
import { GLOBAL_COUNTRIES } from '../data/globalMarkets';
import { OPERATING_NICHES } from '../data/operatingNiches';
import { AgencyTier, CountryMarket, CurrencyCode, MacroRegion, Prospect } from '../types/crm';

interface GlobePinMeta {
  id: string;
  label: string;
  country: CountryMarket;
  tier: AgencyTier;
  lat: number;
  lng: number;
  isCountryCenter: boolean;
  cityIncomeUsd?: number;
  cityCompetition?: string;
}

const TIER_COLORS: Record<AgencyTier, string> = {
  'Tier 1': '#D9F154',
  'Tier 2A': '#6AE4C0',
  'Tier 2B': '#C8B6FF',
  'Tier 3': '#FBBF24',
  'Tier 4': '#FF786C',
};

function latLngToVec3(lat: number, lng: number, radius: number): THREE.Vector3 {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lng + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -(radius * Math.sin(phi) * Math.cos(theta)),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  );
}

function vec3ToLatLng(vec: THREE.Vector3): { lat: number; lng: number } {
  const n = vec.clone().normalize();
  const lat = 90 - Math.acos(THREE.MathUtils.clamp(n.y, -1, 1)) * (180 / Math.PI);
  const theta = Math.atan2(n.z, -n.x);
  let lng = theta * (180 / Math.PI) - 180;
  if (lng < -180) lng += 360;
  if (lng > 180) lng -= 360;
  return { lat, lng };
}

function greatCircleDeg(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = Math.PI / 180;
  const p1 = lat1 * toRad;
  const p2 = lat2 * toRad;
  const dLat = (lat2 - lat1) * toRad;
  const dLng = (lng2 - lng1) * toRad;
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return c * (180 / Math.PI);
}

function matchOperatingNiche(nicheName: string) {
  const q = nicheName.toLowerCase();
  return OPERATING_NICHES.find((n) => {
    const nl = n.name.toLowerCase();
    return (
      nl.includes(q) ||
      q.includes(nl) ||
      ((q.includes('hvac') || q.includes('plumb') || q.includes('heat pump') || q.includes('boiler')) &&
        n.id === 'hvac-plumbing') ||
      (q.includes('roof') && n.id === 'roofing-restoration') ||
      ((q.includes('med-spa') || q.includes('aesthetic') || q.includes('laser')) && n.id === 'med-spas') ||
      ((q.includes('dent') || q.includes('zahnarzt') || q.includes('implant')) &&
        n.id === 'cosmetic-dentistry') ||
      ((q.includes('law') || q.includes('solicitor') || q.includes('legal')) && n.id === 'law-firms') ||
      ((q.includes('builder') || q.includes('remodel')) && n.id === 'custom-builders') ||
      ((q.includes('cpa') || q.includes('wealth') || q.includes('tax') || q.includes('account')) &&
        n.id === 'wealth-cpas') ||
      ((q.includes('manufact') || q.includes('mittelstand') || q.includes('logistics') || q.includes('b2b')) &&
        n.id === 'b2b-industrial')
    );
  });
}

function createProceduralEarthTexture(): THREE.CanvasTexture {
  const w = 1024;
  const h = 512;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#0f141c');
  grad.addColorStop(0.5, '#121822');
  grad.addColorStop(1, '#0d1118');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = 'rgba(217, 241, 84, 0.08)';
  ctx.lineWidth = 1;
  for (let x = 0; x <= w; x += w / 24) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  for (let y = 0; y <= h; y += h / 12) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }

  const landClusters: [number, number, number, number][] = [
    [-100, 42, 130, 72],
    [-60, -15, 70, 82],
    [12, 50, 82, 42],
    [20, 4, 72, 74],
    [48, 28, 42, 34],
    [72, 30, 52, 42],
    [104, 36, 90, 55],
    [134, -24, 52, 34],
  ];

  landClusters.forEach(([lng, lat, rw, rh]) => {
    const cx = ((lng + 180) / 360) * w;
    const cy = ((90 - lat) / 180) * h;
    ctx.fillStyle = '#1d2532';
    ctx.beginPath();
    ctx.ellipse(cx, cy, rw, rh, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(200, 182, 255, 0.22)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  });

  GLOBAL_COUNTRIES.forEach((c) => {
    const cx = ((c.lng + 180) / 360) * w;
    const cy = ((90 - c.lat) / 180) * h;
    const rg = ctx.createRadialGradient(cx, cy, 1, cx, cy, 16);
    rg.addColorStop(0, 'rgba(217, 241, 84, 0.35)');
    rg.addColorStop(1, 'rgba(217, 241, 84, 0)');
    ctx.fillStyle = rg;
    ctx.beginPath();
    ctx.arc(cx, cy, 16, 0, Math.PI * 2);
    ctx.fill();
  });

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

interface Props {
  currency: CurrencyCode;
  existingProspects?: Prospect[];
  onInspectCountryInMatrix: (countryId: string) => void;
  onOpenPricingForCountry: (countryId: string) => void;
  onProspectNicheInCountry?: (countryId: string, nicheId?: string, nicheLabel?: string) => void;
}

export const MarketGlobeView: React.FC<Props> = ({
  currency,
  existingProspects = [],
  onInspectCountryInMatrix,
  onOpenPricingForCountry,
  onProspectNicheInCountry,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [regionFilter, setRegionFilter] = useState<'All' | MacroRegion>('All');
  const [selectedPin, setSelectedPin] = useState<GlobePinMeta | null>(null);
  const [countryQuickSearch, setCountryQuickSearch] = useState<string>('');
  const [dockCollapsed, setDockCollapsed] = useState(false);
  const [webglError, setWebglError] = useState<string | null>(null);
  const [isHoveringPin, setIsHoveringPin] = useState<boolean>(false);

  const targetCameraPosRef = useRef<THREE.Vector3 | null>(null);
  const selectionRingRef = useRef<THREE.Mesh | null>(null);

  const pins = useMemo<GlobePinMeta[]>(() => {
    const list: GlobePinMeta[] = [];
    GLOBAL_COUNTRIES.forEach((country) => {
      if (regionFilter !== 'All' && country.macroRegion !== regionFilter) return;
      list.push({
        id: `country-${country.id}`,
        label: country.name,
        country,
        tier: country.tier,
        lat: country.lat,
        lng: country.lng,
        isCountryCenter: true,
      });
      country.statesOrRegions.slice(0, 8).forEach((st) => {
        st.cities.slice(0, 2).forEach((city) => {
          list.push({
            id: `city-${country.id}-${city.name}`,
            label: `${city.name}, ${country.isoCode}`,
            country,
            tier: city.tier,
            lat: city.lat,
            lng: city.lng,
            isCountryCenter: false,
            cityIncomeUsd: city.medianIncomeUsd,
            cityCompetition: city.competition,
          });
        });
      });
    });
    return list;
  }, [regionFilter]);

  const pinsRef = useRef<GlobePinMeta[]>(pins);
  pinsRef.current = pins;
  const instancedPinsRef = useRef<THREE.InstancedMesh | null>(null);
  const earthRadius = 2.15;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const isSoftwareGl = (() => {
      try {
        const gl = document.createElement('canvas').getContext('webgl2');
        if (!gl) return true;
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
        const gpu = String(gl.getParameter(param));
        gl.getExtension('WEBGL_lose_context')?.loseContext();
        return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
      } catch {
        return true;
      }
    })();

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        powerPreference: 'high-performance',
      });
    } catch {
      setWebglError(
        'WebGL is unavailable in this browser context. Use the Global Markets + Maps tab to inspect all 41 countries.'
      );
      return;
    }

    const width = container.clientWidth || 900;
    const height = container.clientHeight || 600;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#0c0e12');

    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;

    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 100);
    camera.position.set(0.8, 2.2, 6.2);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.06;
    controls.minDistance = 3.1;
    controls.maxDistance = 10.5;
    controls.enablePan = false;
    controls.autoRotate = !isSoftwareGl;
    controls.autoRotateSpeed = 0.35;

    const hemi = new THREE.HemisphereLight('#c8b6ff', '#111214', 0.9);
    scene.add(hemi);
    const keyLight = new THREE.DirectionalLight('#fff4e0', 2.2);
    keyLight.position.set(6, 5, 6);
    scene.add(keyLight);
    const rimLight = new THREE.DirectionalLight('#6ae4c0', 1.1);
    rimLight.position.set(-6, -3, -5);
    scene.add(rimLight);

    const earthGeo = new THREE.SphereGeometry(earthRadius, 64, 64);
    const earthTex = createProceduralEarthTexture();
    const earthMat = new THREE.MeshStandardMaterial({
      map: earthTex,
      roughness: 0.58,
      metalness: 0.22,
    });
    const earthMesh = new THREE.Mesh(earthGeo, earthMat);
    scene.add(earthMesh);

    const haloGeo = new THREE.SphereGeometry(earthRadius * 1.018, 40, 24);
    const haloMat = new THREE.MeshBasicMaterial({
      color: '#D9F154',
      wireframe: true,
      transparent: true,
      opacity: 0.05,
    });
    const haloMesh = new THREE.Mesh(haloGeo, haloMat);
    scene.add(haloMesh);

    // Selection beacon ring on surface when a country/city is focused
    const ringGeo = new THREE.RingGeometry(0.08, 0.125, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: '#D9F154',
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.9,
    });
    const selectionRing = new THREE.Mesh(ringGeo, ringMat);
    selectionRing.visible = false;
    scene.add(selectionRing);
    selectionRingRef.current = selectionRing;

    const starCount = 550;
    const starPos = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const r = 18 + Math.random() * 20;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      starPos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      starPos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      starPos[i * 3 + 2] = r * Math.cos(phi);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    const starMat = new THREE.PointsMaterial({
      color: '#8f96a3',
      size: 0.07,
      transparent: true,
      opacity: 0.7,
    });
    const stars = new THREE.Points(starGeo, starMat);
    scene.add(stars);

    const maxPins = Math.max(1000, pinsRef.current.length);
    const pinGeo = new THREE.SphereGeometry(0.044, 14, 14);
    const pinMat = new THREE.MeshStandardMaterial({
      roughness: 0.25,
      metalness: 0.35,
      emissive: new THREE.Color('#111214'),
      emissiveIntensity: 0.25,
    });
    const instancedPins = new THREE.InstancedMesh(pinGeo, pinMat, maxPins);
    instancedPinsRef.current = instancedPins;
    const dummy = new THREE.Object3D();
    const color = new THREE.Color('#D9F154');
    instancedPins.setColorAt(0, color);
    const initialPins = pinsRef.current;
    instancedPins.count = Math.min(initialPins.length, maxPins);
    initialPins.slice(0, maxPins).forEach((pin, idx) => {
      const pos = latLngToVec3(
        pin.lat,
        pin.lng,
        earthRadius + (pin.isCountryCenter ? 0.045 : 0.025)
      );
      dummy.position.copy(pos);
      const scale = pin.isCountryCenter ? 1.28 : 0.74;
      dummy.scale.setScalar(scale);
      dummy.updateMatrix();
      instancedPins.setMatrixAt(idx, dummy.matrix);
      color.set(TIER_COLORS[pin.tier]);
      instancedPins.setColorAt(idx, color);
    });
    instancedPins.instanceMatrix.needsUpdate = true;
    if (instancedPins.instanceColor) instancedPins.instanceColor.needsUpdate = true;
    scene.add(instancedPins);

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let pointerDown = { x: 0, y: 0 };
    let lastHoverCheck = 0;

    const onPointerDown = (e: PointerEvent) => {
      pointerDown = { x: e.clientX, y: e.clientY };
      controls.autoRotate = false;
      targetCameraPosRef.current = null;
    };

    const onPointerMove = (e: PointerEvent) => {
      const now = Date.now();
      if (now - lastHoverCheck < 50) return;
      lastHoverCheck = now;
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObject(instancedPins);
      setIsHoveringPin(hits.length > 0);
    };

    const onPointerUp = (e: PointerEvent) => {
      const dist = Math.hypot(e.clientX - pointerDown.x, e.clientY - pointerDown.y);
      if (dist > 6) return;
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);

      // 1. Direct pin intersection
      const pinHits = raycaster.intersectObject(instancedPins);
      if (pinHits.length > 0 && pinHits[0].instanceId !== undefined) {
        const hitPin = pinsRef.current[pinHits[0].instanceId];
        if (hitPin) {
          setSelectedPin(hitPin);
          targetCameraPosRef.current = latLngToVec3(hitPin.lat, hitPin.lng, 4.7);
          return;
        }
      }

      // 2. Fallback: click on Earth surface snaps to nearest country node within 14°
      const earthHits = raycaster.intersectObject(earthMesh);
      if (earthHits.length > 0) {
        const { lat, lng } = vec3ToLatLng(earthHits[0].point);
        let nearest: GlobePinMeta | null = null;
        let bestDist = 14;
        for (const p of pinsRef.current) {
          const d = greatCircleDeg(lat, lng, p.lat, p.lng);
          if (d < bestDist) {
            bestDist = d;
            nearest = p;
          }
        }
        if (nearest) {
          setSelectedPin(nearest);
          targetCameraPosRef.current = latLngToVec3(nearest.lat, nearest.lng, 4.7);
        }
      }
    };

    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('pointerup', onPointerUp);

    const resizeObserver = new ResizeObserver(() => {
      if (!container) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w > 0 && h > 0) {
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
      }
    });
    resizeObserver.observe(container);

    let rafId = 0;
    const clock = new THREE.Clock();
    const animate = () => {
      rafId = requestAnimationFrame(animate);
      const dt = Math.min(clock.getDelta(), 0.05);

      if (targetCameraPosRef.current) {
        camera.position.x = THREE.MathUtils.damp(
          camera.position.x,
          targetCameraPosRef.current.x,
          4.5,
          dt
        );
        camera.position.y = THREE.MathUtils.damp(
          camera.position.y,
          targetCameraPosRef.current.y,
          4.5,
          dt
        );
        camera.position.z = THREE.MathUtils.damp(
          camera.position.z,
          targetCameraPosRef.current.z,
          4.5,
          dt
        );
        if (camera.position.distanceTo(targetCameraPosRef.current) < 0.05) {
          targetCameraPosRef.current = null;
        }
      }

      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      controls.dispose();
      earthGeo.dispose();
      earthMat.dispose();
      earthTex.dispose();
      haloGeo.dispose();
      haloMat.dispose();
      ringGeo.dispose();
      ringMat.dispose();
      starGeo.dispose();
      starMat.dispose();
      pinGeo.dispose();
      pinMat.dispose();
      instancedPins.dispose();
      instancedPinsRef.current = null;
      selectionRingRef.current = null;
      envTex.dispose();
      pmrem.dispose();
      renderer.dispose();
    };
  }, []);

  // Update instanced pin matrices & colors smoothly when regionFilter changes
  useEffect(() => {
    const instancedPins = instancedPinsRef.current;
    if (!instancedPins) return;
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    const visibleCount = Math.min(pins.length, instancedPins.instanceMatrix.count);
    instancedPins.count = visibleCount;
    for (let idx = 0; idx < visibleCount; idx++) {
      const pin = pins[idx];
      const pos = latLngToVec3(
        pin.lat,
        pin.lng,
        earthRadius + (pin.isCountryCenter ? 0.045 : 0.025)
      );
      dummy.position.copy(pos);
      const scale = pin.isCountryCenter ? 1.28 : 0.74;
      dummy.scale.setScalar(scale);
      dummy.updateMatrix();
      instancedPins.setMatrixAt(idx, dummy.matrix);
      color.set(TIER_COLORS[pin.tier]);
      instancedPins.setColorAt(idx, color);
    }
    instancedPins.instanceMatrix.needsUpdate = true;
    if (instancedPins.instanceColor) instancedPins.instanceColor.needsUpdate = true;
  }, [pins]);

  // Align 3D selection ring on globe surface whenever selectedPin updates
  useEffect(() => {
    const ring = selectionRingRef.current;
    if (!ring) return;
    if (!selectedPin) {
      ring.visible = false;
      return;
    }
    const surfacePos = latLngToVec3(selectedPin.lat, selectedPin.lng, earthRadius + 0.055);
    ring.position.copy(surfacePos);
    ring.lookAt(surfacePos.clone().multiplyScalar(2));
    ring.visible = true;
  }, [selectedPin]);

  const handleFocusRegion = (region: 'All' | MacroRegion) => {
    setRegionFilter(region);
    const focusCoords: Record<'All' | MacroRegion, [number, number]> = {
      All: [28, -10],
      'North America': [39, -98],
      'UK & Western Europe': [49, 6],
      'Nordics & Baltics': [58, 18],
      'Southern & Central Europe': [45, 16],
      'Balkans & Eastern Europe': [43, 25],
      'Middle East & South Asia': [26, 56],
    };
    const [lat, lng] = focusCoords[region];
    targetCameraPosRef.current = latLngToVec3(lat, lng, 5.4);
  };

  const handleSelectCountryFromList = (country: CountryMarket) => {
    const matchingPin =
      pins.find((p) => p.country.id === country.id && p.isCountryCenter) || {
        id: `country-${country.id}`,
        label: country.name,
        country,
        tier: country.tier,
        lat: country.lat,
        lng: country.lng,
        isCountryCenter: true,
      };
    setSelectedPin(matchingPin);
    targetCameraPosRef.current = latLngToVec3(country.lat, country.lng, 4.7);
    setCountryQuickSearch('');
  };

  const filteredQuickCountries = useMemo(() => {
    const q = countryQuickSearch.trim().toLowerCase();
    if (!q) return [];
    return GLOBAL_COUNTRIES.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.isoCode.toLowerCase().includes(q) ||
        c.macroRegion.toLowerCase().includes(q)
    ).slice(0, 6);
  }, [countryQuickSearch]);

  const selectedCountryCrmStats = useMemo(() => {
    if (!selectedPin) return { total: 0, won: 0 };
    const countryNameLower = selectedPin.country.name.toLowerCase();
    const matches = existingProspects.filter(
      (p) => p.country.toLowerCase() === countryNameLower
    );
    return {
      total: matches.length,
      won: matches.filter((p) => p.stage === 'Closed Won').length,
    };
  }, [selectedPin, existingProspects]);

  const selectedCountryHighPotentialNiches = useMemo(() => {
    if (!selectedPin) return [];
    const c = selectedPin.country;
    const combined = [
      ...c.topOperatingNiches.map((name) => ({ name, category: 'Core High-Ticket' as const })),
      ...c.futureNicheOpportunities.map((name) => ({
        name,
        category: 'Emerging Opportunity' as const,
      })),
    ];
    return combined.map((item) => {
      const matched = matchOperatingNiche(item.name);
      return {
        name: item.name,
        category: item.category,
        matchedNicheId: matched?.id,
        jobValue: matched?.clientJobValue || 'High-Ticket B2B / Local',
        hook: matched?.trojanHorseHook || c.businessPotentialSummary,
      };
    });
  }, [selectedPin]);

  return (
    <div
      className={`relative w-full h-full bg-[#0c0e12] text-white overflow-hidden ${
        isHoveringPin ? 'cursor-pointer' : ''
      }`}
    >
      {/* FULL-BLEED THREE.JS CANVAS */}
      {webglError ? (
        <div className="h-full flex items-center justify-center p-8 text-center text-sm text-[#9A9FA8]">
          {webglError}
        </div>
      ) : (
        <div ref={containerRef} className="w-full h-full" />
      )}

      {/* TOP LEFT COMPACT HEADER + QUICK COUNTRY JUMP + LEGEND */}
      <div className="absolute top-4 left-4 right-4 flex flex-wrap items-start justify-between gap-3 pointer-events-none">
        <div className="bg-[#14161A]/95 backdrop-blur-sm border border-[#262930] rounded-2xl px-4 py-3 pointer-events-auto w-full sm:w-[360px] space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-[#D9F154]">
              <Compass className="w-4 h-4 shrink-0" />
              <span>3D Market Tier Globe · 41 Countries</span>
            </div>
          </div>
          <p className="text-[11px] text-[#9A9FA8] leading-relaxed">
            Click any country or city node to open the Global Intelligence Overlay with business
            tiers, median household income, and prospecting niches.
          </p>

          {/* QUICK COUNTRY SEARCH */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-[#8E94A2] absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              value={countryQuickSearch}
              onChange={(e) => setCountryQuickSearch(e.target.value)}
              placeholder="Jump to country (e.g. Germany, UAE, UK)..."
              className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-[#1B1E25] border border-[#2C303A] text-xs text-white placeholder-[#7A7E87] focus:outline-none focus:border-[#D9F154]"
            />
            {filteredQuickCountries.length > 0 && (
              <div className="absolute left-0 right-0 top-full mt-1 z-30 bg-[#181B22] border border-[#2F3440] rounded-xl overflow-hidden shadow-2xl">
                {filteredQuickCountries.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => handleSelectCountryFromList(c)}
                    className="w-full text-left px-3 py-2 text-xs hover:bg-[#232732] flex items-center justify-between gap-2 cursor-pointer"
                  >
                    <span className="font-semibold text-white">{c.name}</span>
                    <span className="text-[11px] text-[#9A9FA8]">
                      {c.tier} · {formatMoney(c.medianIncomeUsd, currency)}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3 text-[11px] pt-0.5">
            {(Object.keys(TIER_COLORS) as AgencyTier[]).map((t) => (
              <span key={t} className="flex items-center gap-1.5 text-[#C9CDD4]">
                <span
                  className="w-2.5 h-2.5 rounded-full inline-block"
                  style={{ backgroundColor: TIER_COLORS[t] }}
                />
                {t}
              </span>
            ))}
          </div>
        </div>

        {/* GLOBAL INTELLIGENCE OVERLAY PANEL (ON COUNTRY/NODE CLICK) */}
        {selectedPin && (
          <aside className="bg-[#14161A]/95 backdrop-blur-md border border-[#D9F154]/45 rounded-2xl w-full sm:w-[440px] max-h-[calc(100vh-170px)] flex flex-col pointer-events-auto shadow-2xl overflow-hidden">
            {/* OVERLAY HEADER */}
            <div className="p-4 border-b border-[#242832] flex items-start justify-between gap-3 shrink-0">
              <div className="min-w-0">
                <div className="text-[11px] font-semibold text-[#D9F154] flex items-center gap-1.5">
                  <Globe2 className="w-3.5 h-3.5 shrink-0" />
                  <span>Global Intelligence Overlay</span>
                </div>
                <h2 className="text-lg font-display font-bold text-white mt-0.5 truncate">
                  {selectedPin.country.name}
                  {!selectedPin.isCountryCenter && ` · ${selectedPin.label}`}
                </h2>
                <div className="text-[11px] text-[#9A9FA8] mt-0.5">
                  {selectedPin.country.macroRegion} · {selectedPin.country.tierLabel} ·{' '}
                  {selectedCountryCrmStats.total} CRM Prospects
                  {selectedCountryCrmStats.won > 0 ? ` (${selectedCountryCrmStats.won} Won)` : ''}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedPin(null)}
                className="p-1.5 rounded-lg text-[#9A9FA8] hover:text-white hover:bg-[#232732] cursor-pointer shrink-0"
                title="Close Global Intelligence Overlay"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* SCROLLABLE INTELLIGENCE BODY */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* MEDIAN HOUSEHOLD INCOME & RETAINER BENCHMARK */}
              <div className="grid grid-cols-2 gap-2.5">
                <div className="bg-[#1B1E26] border border-[#282C37] rounded-xl p-3">
                  <div className="text-[11px] text-[#9A9FA8]">Median Household Income</div>
                  <div className="text-base font-display font-bold font-mono-tabular text-[#6AE4C0] mt-0.5">
                    {formatMoney(
                      selectedPin.cityIncomeUsd || selectedPin.country.medianIncomeUsd,
                      currency
                    )}
                    <span className="text-[11px] font-normal text-[#9A9FA8]"> / yr</span>
                  </div>
                  {selectedPin.cityIncomeUsd && (
                    <div className="text-[10px] text-[#9A9FA8] font-mono-tabular mt-0.5">
                      National Avg: {formatMoney(selectedPin.country.medianIncomeUsd, currency)}
                    </div>
                  )}
                </div>

                <div className="bg-[#1B1E26] border border-[#282C37] rounded-xl p-3">
                  <div className="text-[11px] text-[#9A9FA8]">Agency Retainer Range</div>
                  <div className="text-base font-display font-bold font-mono-tabular text-[#D9F154] mt-0.5">
                    {formatMoneyRange(
                      selectedPin.country.retainerRangeUsd[0],
                      selectedPin.country.retainerRangeUsd[1],
                      currency
                    )}
                  </div>
                  <div className="text-[10px] text-[#C9CDD4] mt-0.5">
                    Competition: {selectedPin.cityCompetition || selectedPin.country.competition}
                  </div>
                </div>
              </div>

              <p className="text-xs text-[#C9CDD4] leading-relaxed">
                {selectedPin.country.purchasingPowerNote}
              </p>

              {/* SERVICE SUITABILITY SCORES */}
              <div className="grid grid-cols-3 gap-2 text-center bg-[#1B1E26] border border-[#282C37] rounded-xl p-2.5">
                <div>
                  <div className="text-[10px] text-[#9A9FA8]">Local SEO Fit</div>
                  <div className="text-sm font-bold font-mono-tabular text-white mt-0.5">
                    {selectedPin.country.serviceSuitability.seo.score}/100
                  </div>
                </div>
                <div className="border-x border-[#2A2F3B]">
                  <div className="text-[10px] text-[#9A9FA8]">Web CRO Fit</div>
                  <div className="text-sm font-bold font-mono-tabular text-white mt-0.5">
                    {selectedPin.country.serviceSuitability.webDev.score}/100
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-[#9A9FA8]">AI Setter Fit</div>
                  <div className="text-sm font-bold font-mono-tabular text-[#D9F154] mt-0.5">
                    {selectedPin.country.serviceSuitability.automation.score}/100
                  </div>
                </div>
              </div>

              {/* PRIMARY BUSINESS TIERS */}
              <div className="space-y-2 pt-1 border-t border-[#242832]">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold text-white flex items-center gap-1.5">
                    <TrendingUp className="w-3.5 h-3.5 text-[#C8B6FF]" />
                    Primary Business Tiers ({selectedPin.country.statesOrRegions.length} Regions)
                  </h3>
                  <span className="text-[11px] font-mono-tabular text-[#9A9FA8]">
                    {selectedPin.country.tier} Lead Market
                  </span>
                </div>

                <div className="space-y-2">
                  {selectedPin.country.statesOrRegions.slice(0, 6).map((region) => {
                    const anchorCity = region.cities[0];
                    return (
                      <div
                        key={region.code}
                        className="bg-[#1B1E26] border border-[#282C37] rounded-xl p-2.5 space-y-1"
                      >
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <span className="font-semibold text-white truncate">{region.name}</span>
                          <span className="font-mono-tabular text-[11px] text-[#D9F154] shrink-0">
                            {region.tier} · {region.retainerRangeUsd}
                          </span>
                        </div>
                        <div className="text-[11px] text-[#9A9FA8] flex flex-wrap items-center justify-between gap-1">
                          <span>
                            Income:{' '}
                            <strong className="font-mono-tabular text-[#C9CDD4]">
                              {formatMoney(region.medianIncomeUsd, currency)}
                            </strong>{' '}
                            · {region.estSmallBusinesses.toLocaleString()} SMBs
                          </span>
                          {anchorCity && (
                            <button
                              type="button"
                              onClick={() => {
                                targetCameraPosRef.current = latLngToVec3(
                                  anchorCity.lat,
                                  anchorCity.lng,
                                  4.2
                                );
                              }}
                              className="text-[11px] text-[#6AE4C0] hover:underline inline-flex items-center gap-0.5 cursor-pointer"
                            >
                              <MapPin className="w-3 h-3" />
                              Focus {anchorCity.name}
                            </button>
                          )}
                        </div>
                        <div className="text-[11px] text-[#C9CDD4] truncate">
                          Best Offer: {region.bestOfferSummary}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* HIGH-POTENTIAL NICHES FOR IMMEDIATE PROSPECTING */}
              <div className="space-y-2 pt-1 border-t border-[#242832]">
                <h3 className="text-xs font-semibold text-white flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-[#D9F154]" />
                  High-Potential Niches for Immediate Prospecting
                </h3>

                <div className="space-y-2">
                  {selectedCountryHighPotentialNiches.map((niche, idx) => (
                    <div
                      key={`${niche.name}-${idx}`}
                      className="bg-[#1B1E26] border border-[#282C37] rounded-xl p-2.5 space-y-1.5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-white truncate">
                            {niche.name}
                          </div>
                          <div className="text-[11px] text-[#9A9FA8]">
                            {niche.category} · {niche.jobValue}
                          </div>
                        </div>
                        {onProspectNicheInCountry && (
                          <button
                            type="button"
                            onClick={() =>
                              onProspectNicheInCountry(
                                selectedPin.country.id,
                                niche.matchedNicheId,
                                niche.name
                              )
                            }
                            className="px-2.5 py-1 rounded-lg bg-[#D9F154] text-[#111214] text-[11px] font-semibold inline-flex items-center gap-1 shrink-0 cursor-pointer hover:bg-[#e5f876]"
                          >
                            Prospect
                            <ArrowUpRight className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                      <div className="text-[11px] text-[#C9CDD4] line-clamp-2">{niche.hook}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* FOOTER ACTIONS */}
            <div className="p-3.5 border-t border-[#242832] bg-[#111318] grid grid-cols-2 gap-2 shrink-0">
              <button
                type="button"
                onClick={() => onInspectCountryInMatrix(selectedPin.country.id)}
                className="py-2 px-3 rounded-xl bg-[#23262E] hover:bg-[#2F333D] text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Layers className="w-3.5 h-3.5" />
                Maps + Matrix
              </button>
              <button
                type="button"
                onClick={() => onOpenPricingForCountry(selectedPin.country.id)}
                className="py-2 px-3 rounded-xl bg-[#D9F154] text-[#111214] text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer hover:bg-[#e5f876]"
              >
                <Send className="w-3.5 h-3.5" />
                Build Pricing Offer
              </button>
            </div>
          </aside>
        )}
      </div>

      {/* COMPACT COLLAPSIBLE BOTTOM CONTROL DOCK (<= 15% height, solid surface) */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 max-w-[95vw]">
        <div className="bg-[#14161A] border border-[#262930] rounded-2xl px-3 py-2">
          <div className="flex items-center justify-between gap-3">
            {!dockCollapsed && (
              <div className="flex items-center gap-1.5 overflow-x-auto">
                {(
                  [
                    'All',
                    'North America',
                    'UK & Western Europe',
                    'Nordics & Baltics',
                    'Southern & Central Europe',
                    'Balkans & Eastern Europe',
                    'Middle East & South Asia',
                  ] as const
                ).map((reg) => (
                  <button
                    key={reg}
                    type="button"
                    onClick={() => handleFocusRegion(reg)}
                    className={`px-2.5 py-1 rounded-xl text-[11px] font-semibold whitespace-nowrap cursor-pointer ${
                      regionFilter === reg
                        ? 'bg-[#D9F154] text-[#111214]'
                        : 'text-[#9A9FA8] hover:text-white hover:bg-[#1E2128]'
                    }`}
                  >
                    {reg}
                  </button>
                ))}
              </div>
            )}
            <button
              type="button"
              onClick={() => setDockCollapsed(!dockCollapsed)}
              className="px-2 py-1 text-[11px] font-semibold text-[#C9CDD4] hover:text-white flex items-center gap-1 whitespace-nowrap cursor-pointer"
            >
              {dockCollapsed ? (
                <>
                  Regions <ChevronUp className="w-3.5 h-3.5" />
                </>
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

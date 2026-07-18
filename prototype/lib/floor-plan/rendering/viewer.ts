import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import { FloorPlanModel, Ring, WallFootprint } from "../model";

export interface ViewerMarker {
  id: string;
  x: number;
  y?: number;
  z: number;
  color: number;
}

export interface ViewerOptions {
  wallColor?: number;
  floorColor?: number;
  backgroundColor?: number;
  showGrid?: boolean;
  markers?: ViewerMarker[];
  /** Fired when the user clicks the model while placement mode is active. */
  onPlace?: (point: { x: number; y: number; z: number }) => void;
  /** Fired when the user picks a marker (or empty space, giving undefined). */
  onSelect?: (id: string | undefined) => void;
  /** Fired continuously while a marker is dragged by its transform gizmo. */
  onMove?: (id: string, point: { x: number; y: number; z: number }) => void;
}

export interface FloorPlanViewer {
  setModel(model: FloorPlanModel): void;
  setMarkers(markers: ViewerMarker[]): void;
  setSelection(id: string | undefined): void;
  setPlacementMode(active: boolean): void;
  resetView(): void;
  dispose(): void;
}

const DEFAULTS = {
  wallColor: 0xf2ede4,
  floorColor: 0xffffff,
  backgroundColor: 0x1a1c22,
};

const MARKER_RADIUS = 0.14;
const MARKER_MIN_Y = MARKER_RADIUS;

function planSizeMeters(model: FloorPlanModel): { width: number; depth: number } {
  return {
    width: model.imageWidth / model.pixelsPerMeter,
    depth: model.imageHeight / model.pixelsPerMeter,
  };
}

function ringToPoints(ring: Ring, model: FloorPlanModel): THREE.Vector2[] {
  const ppm = model.pixelsPerMeter;
  const cx = model.imageWidth / 2;
  const cy = model.imageHeight / 2;
  return ring.map((p) => new THREE.Vector2((p.x - cx) / ppm, -(p.y - cy) / ppm));
}

function footprintToShape(footprint: WallFootprint, model: FloorPlanModel): THREE.Shape {
  const shape = new THREE.Shape(ringToPoints(footprint.outer, model));
  for (const hole of footprint.holes) {
    shape.holes.push(new THREE.Path(ringToPoints(hole, model)));
  }
  return shape;
}

function buildWalls(model: FloorPlanModel, color: number): THREE.Mesh {
  const shapes = model.walls
    .filter((f) => f.outer.length >= 3)
    .map((f) => footprintToShape(f, model));

  const geometry = new THREE.ExtrudeGeometry(shapes, {
    depth: model.wallHeightMeters,
    bevelEnabled: false,
    steps: 1,
  });
  // Shapes extrude along +Z; rotate so the extrusion stands up along +Y.
  geometry.rotateX(-Math.PI / 2);
  geometry.computeVertexNormals();

  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({
      color,
      roughness: 0.9,
      metalness: 0,
      side: THREE.DoubleSide,
    }),
  );
  mesh.name = "walls";
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function buildFloor(
  model: FloorPlanModel,
  color: number,
  onTexture: () => void,
): THREE.Mesh {
  const { width, depth } = planSizeMeters(model);
  const geometry = new THREE.PlaneGeometry(width, depth);
  geometry.rotateX(-Math.PI / 2);

  const material = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.95,
    metalness: 0,
    side: THREE.DoubleSide,
  });

  if (model.floor.textureDataUrl) {
    new THREE.TextureLoader().load(model.floor.textureDataUrl, (texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = 4;
      material.map = texture;
      material.needsUpdate = true;
      onTexture();
    });
  }

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = "floor";
  mesh.receiveShadow = true;
  mesh.position.y = -0.002;
  return mesh;
}

function buildGrid(model: FloorPlanModel): THREE.GridHelper {
  const { width, depth } = planSizeMeters(model);
  const span = Math.max(width, depth) * 2;
  const grid = new THREE.GridHelper(span, Math.max(10, Math.round(span)), 0x555b66, 0x33373f);
  const material = grid.material as THREE.Material;
  material.transparent = true;
  material.opacity = 0.35;
  grid.position.y = -0.01;
  return grid;
}

function buildMarker(marker: ViewerMarker): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(MARKER_RADIUS, 20, 20),
    new THREE.MeshStandardMaterial({
      color: marker.color,
      emissive: marker.color,
      emissiveIntensity: 0.25,
      roughness: 0.4,
    }),
  );
  mesh.name = "marker";
  mesh.position.set(marker.x, marker.y ?? MARKER_MIN_Y, marker.z);
  mesh.userData.id = marker.id;
  mesh.castShadow = true;

  // A soft halo ring, hidden until the marker is selected.
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(MARKER_RADIUS * 1.6, MARKER_RADIUS * 2.1, 32),
    new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      depthTest: false,
    }),
  );
  ring.name = "halo";
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = -MARKER_RADIUS + 0.01;
  ring.visible = false;
  ring.renderOrder = 2;
  ring.raycast = () => {}; // never intercept picking
  mesh.add(ring);

  return mesh;
}

function setMarkerSelected(mesh: THREE.Mesh, selected: boolean): void {
  const material = mesh.material as THREE.MeshStandardMaterial;
  material.emissiveIntensity = selected ? 0.6 : 0.25;
  mesh.scale.setScalar(selected ? 1.25 : 1);
  const halo = mesh.getObjectByName("halo");
  if (halo) halo.visible = selected;
}

function disposeObject(root: THREE.Object3D): void {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const material = mesh.material;
    const materials = Array.isArray(material) ? material : material ? [material] : [];
    for (const m of materials) {
      const standard = m as THREE.MeshStandardMaterial;
      if (standard.map) standard.map.dispose();
      m.dispose();
    }
  });
}

export function createFloorPlanViewer(
  container: HTMLElement,
  model: FloorPlanModel,
  options: ViewerOptions = {},
): FloorPlanViewer {
  const wallColor = options.wallColor ?? DEFAULTS.wallColor;
  const floorColor = options.floorColor ?? DEFAULTS.floorColor;
  const showGrid = options.showGrid ?? true;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(options.backgroundColor ?? DEFAULTS.backgroundColor);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.domElement.style.display = "block";
  renderer.domElement.style.width = "100%";
  renderer.domElement.style.height = "100%";
  renderer.domElement.style.touchAction = "none";
  container.appendChild(renderer.domElement);

  const camera = new THREE.PerspectiveCamera(50, 1, 0.01, 10000);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.maxPolarAngle = Math.PI / 2.05;

  scene.add(new THREE.HemisphereLight(0xffffff, 0x444455, 1.1));
  const keyLight = new THREE.DirectionalLight(0xffffff, 1.6);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(2048, 2048);
  keyLight.shadow.bias = -0.0005;
  scene.add(keyLight);

  let content = new THREE.Group();
  scene.add(content);

  // Markers and the transform gizmo live outside `content` so they survive
  // model rebuilds and keep their identity across React updates.
  const markerLayer = new THREE.Group();
  scene.add(markerLayer);
  const markerMeshes = new Map<string, THREE.Mesh>();

  let floorMesh: THREE.Mesh | undefined;
  let wallMesh: THREE.Mesh | undefined;
  let currentModel = model;

  let selectedMesh: THREE.Mesh | undefined;
  let placementMode = false;
  let draggingGizmo = false;

  const transform = new TransformControls(camera, renderer.domElement);
  transform.setMode("translate");
  transform.setSpace("world");
  transform.setSize(0.9);
  scene.add(transform.getHelper());
  transform.addEventListener("change", () => requestRender());
  transform.addEventListener("dragging-changed", (event) => {
    draggingGizmo = event.value as boolean;
    controls.enabled = !draggingGizmo;
  });
  transform.addEventListener("objectChange", () => {
    if (!selectedMesh) return;
    if (selectedMesh.position.y < MARKER_MIN_Y) selectedMesh.position.y = MARKER_MIN_Y;
    const id = selectedMesh.userData.id as string;
    const p = selectedMesh.position;
    options.onMove?.(id, { x: p.x, y: p.y, z: p.z });
  });

  let disposed = false;
  let frameId = 0;

  const render = () => {
    frameId = 0;
    if (disposed) return;
    const moving = controls.update();
    renderer.render(scene, camera);
    if (moving) requestRender();
  };

  const requestRender = () => {
    if (disposed || frameId !== 0) return;
    frameId = requestAnimationFrame(render);
  };

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  const toPointer = (event: PointerEvent) => {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    raycaster.setFromCamera(pointer, camera);
  };

  const pickMarker = (event: PointerEvent): string | undefined => {
    toPointer(event);
    const hits = raycaster.intersectObjects(markerLayer.children, true);
    for (const hit of hits) {
      let obj: THREE.Object3D | null = hit.object;
      while (obj && obj.userData.id === undefined) obj = obj.parent;
      if (obj) return obj.userData.id as string;
    }
    return undefined;
  };

  const pickSurface = (event: PointerEvent): THREE.Vector3 | undefined => {
    toPointer(event);
    const targets = [floorMesh, wallMesh].filter(Boolean) as THREE.Object3D[];
    const hit = raycaster.intersectObjects(targets, false)[0];
    return hit?.point.clone();
  };

  // Distinguish a click from an orbit drag using pointer travel distance.
  let downX = 0;
  let downY = 0;
  let downButton = 0;

  const onPointerDown = (event: PointerEvent) => {
    downX = event.clientX;
    downY = event.clientY;
    downButton = event.button;
  };

  const onPointerUp = (event: PointerEvent) => {
    // Ignore synthetic clicks that follow a gizmo drag or an orbit move.
    if (draggingGizmo) return;
    if (event.button !== 0 || downButton !== 0) return;
    const travel = Math.hypot(event.clientX - downX, event.clientY - downY);
    if (travel > 5) return;

    if (placementMode) {
      const point = pickSurface(event);
      if (point) {
        options.onPlace?.({
          x: point.x,
          y: Math.max(MARKER_MIN_Y, point.y + MARKER_RADIUS),
          z: point.z,
        });
      }
      return;
    }

    const id = pickMarker(event);
    options.onSelect?.(id);
  };

  renderer.domElement.addEventListener("pointerdown", onPointerDown);
  renderer.domElement.addEventListener("pointerup", onPointerUp);

  const frameCamera = (m: FloorPlanModel) => {
    const { width, depth } = planSizeMeters(m);
    const span = Math.max(width, depth);
    const height = m.wallHeightMeters;

    controls.target.set(0, height / 2, 0);
    camera.position.set(span * 0.7, span * 0.6 + height, span * 0.85);
    camera.near = Math.max(0.01, span / 1000);
    camera.far = span * 50 + 100;
    camera.updateProjectionMatrix();

    keyLight.position.set(span, span * 1.5 + height * 2, span * 0.6);
    const shadowCam = keyLight.shadow.camera;
    const r = span * 0.9;
    shadowCam.left = -r;
    shadowCam.right = r;
    shadowCam.top = r;
    shadowCam.bottom = -r;
    shadowCam.near = 0.1;
    shadowCam.far = span * 6 + 100;
    shadowCam.updateProjectionMatrix();

    controls.update();
  };

  const populate = (m: FloorPlanModel) => {
    currentModel = m;
    disposeObject(content);
    scene.remove(content);

    content = new THREE.Group();
    floorMesh = buildFloor(m, floorColor, requestRender);
    wallMesh = buildWalls(m, wallColor);
    content.add(floorMesh);
    content.add(wallMesh);
    if (showGrid) content.add(buildGrid(m));
    scene.add(content);

    frameCamera(m);
    requestRender();
  };

  const applyMarkers = (markers: ViewerMarker[]) => {
    const seen = new Set<string>();
    for (const marker of markers) {
      seen.add(marker.id);
      let mesh = markerMeshes.get(marker.id);
      if (!mesh) {
        mesh = buildMarker(marker);
        markerLayer.add(mesh);
        markerMeshes.set(marker.id, mesh);
      } else if (!(draggingGizmo && mesh === selectedMesh)) {
        mesh.position.set(marker.x, marker.y ?? MARKER_MIN_Y, marker.z);
      }
      const material = mesh.material as THREE.MeshStandardMaterial;
      if (material.color.getHex() !== marker.color) {
        material.color.setHex(marker.color);
        material.emissive.setHex(marker.color);
      }
    }
    for (const [id, mesh] of markerMeshes) {
      if (seen.has(id)) continue;
      if (mesh === selectedMesh) {
        transform.detach();
        selectedMesh = undefined;
      }
      markerLayer.remove(mesh);
      disposeObject(mesh);
      markerMeshes.delete(id);
    }
    requestRender();
  };

  const setSelection = (id: string | undefined) => {
    const next = id ? markerMeshes.get(id) : undefined;
    if (next === selectedMesh) return;
    if (selectedMesh) setMarkerSelected(selectedMesh, false);
    selectedMesh = next;
    if (selectedMesh) {
      setMarkerSelected(selectedMesh, true);
      transform.attach(selectedMesh);
    } else {
      transform.detach();
    }
    requestRender();
  };

  const setPlacementMode = (active: boolean) => {
    placementMode = active;
    container.style.cursor = active ? "crosshair" : "";
  };

  const resize = () => {
    const w = container.clientWidth || 1;
    const h = container.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    requestRender();
  };

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);
  controls.addEventListener("change", requestRender);

  populate(model);
  applyMarkers(options.markers ?? []);
  resize();

  return {
    setModel(next: FloorPlanModel) {
      populate(next);
    },
    setMarkers(markers) {
      applyMarkers(markers);
    },
    setSelection(id) {
      setSelection(id);
    },
    setPlacementMode(active) {
      setPlacementMode(active);
    },
    resetView() {
      frameCamera(currentModel);
      requestRender();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      controls.removeEventListener("change", requestRender);
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointerup", onPointerUp);
      transform.detach();
      transform.dispose();
      controls.dispose();
      disposeObject(content);
      disposeObject(markerLayer);
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    },
  };
}

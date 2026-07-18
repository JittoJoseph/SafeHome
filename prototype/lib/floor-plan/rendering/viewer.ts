import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { FloorPlanModel, Ring, WallFootprint } from "../model";

export interface ViewerOptions {
  wallColor?: number;
  floorColor?: number;
  backgroundColor?: number;
  showGrid?: boolean;
  markers?: Array<{ x: number; z: number; color: number }>;
}

export interface FloorPlanViewer {
  setModel(model: FloorPlanModel): void;
  resetView(): void;
  dispose(): void;
}

const DEFAULTS = {
  wallColor: 0xf2ede4,
  floorColor: 0xffffff,
  backgroundColor: 0x1a1c22,
};

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

function buildMarkers(markers: ViewerOptions["markers"]): THREE.Group {
  const group = new THREE.Group();
  for (const marker of markers ?? []) {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 16, 16),
      new THREE.MeshStandardMaterial({ color: marker.color, emissive: marker.color, emissiveIntensity: 0.2 }),
    );
    mesh.position.set(marker.x, 0.15, marker.z);
    group.add(mesh);
  }
  return group;
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
  let currentModel = model;

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
    content.add(buildFloor(m, floorColor, requestRender));
    content.add(buildWalls(m, wallColor));
    content.add(buildMarkers(options.markers));
    if (showGrid) content.add(buildGrid(m));
    scene.add(content);

    frameCamera(m);
    requestRender();
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
  resize();

  return {
    setModel(next: FloorPlanModel) {
      populate(next);
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
      controls.dispose();
      disposeObject(content);
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    },
  };
}

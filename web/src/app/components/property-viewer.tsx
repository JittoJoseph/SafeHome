"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

type Poi = { id: string; type: string; label: string; position_x: number; position_y: number; position_z: number; creator_role: string };

export function PropertyViewer({ propertyId, pois }: { propertyId: string; pois: Poi[] }) {
	const mount = useRef<HTMLDivElement>(null);
	useEffect(() => {
		const element = mount.current;
		if (!element) return;
		const scene = new THREE.Scene();
		scene.background = new THREE.Color("#f2f5f5");
		const camera = new THREE.PerspectiveCamera(48, element.clientWidth / 430, 0.1, 100);
		camera.position.set(7, 8, 8);
		camera.lookAt(0, 0, 0);
		const renderer = new THREE.WebGLRenderer({ antialias: true });
		renderer.setSize(element.clientWidth, 430);
		element.appendChild(renderer.domElement);
		scene.add(new THREE.HemisphereLight(0xffffff, 0x61726b, 2));
		const floor = new THREE.Mesh(new THREE.PlaneGeometry(8, 6), new THREE.MeshStandardMaterial({ color: 0xe4e0d5 }));
		floor.rotation.x = -Math.PI / 2;
		scene.add(floor);
		const wallMaterial = new THREE.MeshStandardMaterial({ color: 0x35454c });
		[[0, 3, 8, 0.2], [0, -3, 8, 0.2], [4, 0, 0.2, 6], [-4, 0, 0.2, 6], [0, 0.7, 5, 0.16]].forEach(([x, z, width, depth]) => {
			const wall = new THREE.Mesh(new THREE.BoxGeometry(width, 2.4, depth), wallMaterial);
			wall.position.set(x, 1.2, z);
			scene.add(wall);
		});
		pois.forEach((poi) => {
			const marker = new THREE.Mesh(new THREE.SphereGeometry(0.16, 18, 18), new THREE.MeshStandardMaterial({ color: poi.creator_role === "operator" ? 0xd74a4a : 0x2f7d6b }));
			marker.position.set(poi.position_x, Math.max(poi.position_y, 0.18), poi.position_z);
			scene.add(marker);
		});
		new THREE.TextureLoader().load(`/floor-plans/${propertyId}`, (texture) => { (floor.material as THREE.MeshStandardMaterial).map = texture; (floor.material as THREE.MeshStandardMaterial).needsUpdate = true; });
		let frame = 0;
		const render = () => { frame = requestAnimationFrame(render); renderer.render(scene, camera); };
		render();
		return () => { cancelAnimationFrame(frame); renderer.dispose(); element.replaceChildren(); };
	}, [propertyId, pois]);
	return <div className="viewer" ref={mount} aria-label="Interactive 3D property model" />;
}

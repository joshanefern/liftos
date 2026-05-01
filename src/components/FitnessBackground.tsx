import { useEffect, useRef } from "react";
import * as THREE from "three";

export const FitnessBackground = () => {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    // ─── Renderer ───────────────────────────────────────────────────────────
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    mount.appendChild(renderer.domElement);

    // ─── Scene & Camera ─────────────────────────────────────────────────────
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x07080d, 0.038);

    const camera = new THREE.PerspectiveCamera(52, window.innerWidth / window.innerHeight, 0.1, 80);
    camera.position.set(0, 0, 11);

    // ─── Lighting ────────────────────────────────────────────────────────────
    scene.add(new THREE.AmbientLight(0x06080f, 2.0));

    const keyLight = new THREE.PointLight(0xd4962e, 5.0, 22);
    keyLight.position.set(0, 2, 6);
    scene.add(keyLight);

    const fillLight = new THREE.PointLight(0xc07820, 2.2, 26);
    fillLight.position.set(-6, -2, 3);
    scene.add(fillLight);

    const rimLight = new THREE.PointLight(0x2e5080, 2.0, 28);
    rimLight.position.set(7, 4, -5);
    scene.add(rimLight);

    const backLight = new THREE.PointLight(0x8a6020, 1.4, 30);
    backLight.position.set(0, -6, -8);
    scene.add(backLight);

    // ─── Materials ───────────────────────────────────────────────────────────
    const ironMat = new THREE.MeshStandardMaterial({
      color: 0x3c3628,
      metalness: 0.92,
      roughness: 0.28,
      emissive: 0x120d04,
      emissiveIntensity: 0.35,
    });

    const steelMat = new THREE.MeshStandardMaterial({
      color: 0x7a8090,
      metalness: 0.96,
      roughness: 0.14,
      emissive: 0x04050a,
      emissiveIntensity: 0.2,
    });

    // ─── Weight plates ───────────────────────────────────────────────────────
    type PlateConfig = {
      r: number; tube: number;
      pos: [number, number, number];
      rot: [number, number, number];
      op: number; sp: number;
    };

    const plateConfigs: PlateConfig[] = [
      { r: 2.9, tube: 0.30, pos: [-5.8,  1.8, -3.0], rot: [0.40,  0.28,  0.55], op: 0.62, sp: 0.0016 },
      { r: 2.2, tube: 0.23, pos: [ 5.2, -1.2, -2.0], rot: [-0.28, 0.72,  0.18], op: 0.68, sp: 0.0022 },
      { r: 3.5, tube: 0.34, pos: [-3.0, -3.5, -7.0], rot: [0.88, -0.18,  0.72], op: 0.38, sp: 0.0010 },
      { r: 1.7, tube: 0.19, pos: [ 4.2,  3.8, -4.5], rot: [0.18,  0.62, -0.38], op: 0.52, sp: 0.0028 },
      { r: 2.6, tube: 0.26, pos: [ 0.5, -4.8, -8.0], rot: [1.28,  0.22,  0.48], op: 0.32, sp: 0.0013 },
      { r: 2.0, tube: 0.21, pos: [-4.2,  4.2, -5.5], rot: [0.52,  0.82, -0.28], op: 0.44, sp: 0.0019 },
      { r: 1.3, tube: 0.15, pos: [ 3.8,  0.8, -1.8], rot: [0.12,  0.44,  0.82], op: 0.56, sp: 0.0034 },
      { r: 4.2, tube: 0.40, pos: [-0.5, -0.5,-11.0], rot: [0.62,  0.12,  0.32], op: 0.22, sp: 0.0007 },
      { r: 1.5, tube: 0.17, pos: [-2.8,  2.5, -2.5], rot: [-0.44, 0.36,  0.60], op: 0.48, sp: 0.0026 },
      { r: 2.3, tube: 0.24, pos: [ 2.0, -2.5, -4.0], rot: [0.70, -0.50,  0.20], op: 0.40, sp: 0.0018 },
    ];

    const plates: { mesh: THREE.Mesh; sp: number; fi: number }[] = [];
    plateConfigs.forEach((cfg, i) => {
      const geo = new THREE.TorusGeometry(cfg.r, cfg.tube, 16, 100);
      const mat = (i % 3 === 0 ? steelMat : ironMat).clone() as THREE.MeshStandardMaterial;
      mat.transparent = true;
      mat.opacity = cfg.op;
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(...cfg.pos);
      mesh.rotation.set(...cfg.rot);
      scene.add(mesh);
      plates.push({ mesh, sp: cfg.sp, fi: i * 1.4 });
    });

    // ─── Barbell shafts ──────────────────────────────────────────────────────
    const shaftGeo = new THREE.CylinderGeometry(0.038, 0.038, 11, 10);
    const shaftConfigs = [
      { pos: [-1.5, -1.8, -4.5] as [number,number,number], rot: [0.18, 0.08, 1.48] as [number,number,number], op: 0.45 },
      { pos: [ 2.0,  2.5, -6.5] as [number,number,number], rot: [0.12, 0.22, 1.62] as [number,number,number], op: 0.32 },
    ];
    shaftConfigs.forEach(cfg => {
      const mat = steelMat.clone() as THREE.MeshStandardMaterial;
      mat.transparent = true;
      mat.opacity = cfg.op;
      const mesh = new THREE.Mesh(shaftGeo, mat);
      mesh.position.set(...cfg.pos);
      mesh.rotation.set(...cfg.rot);
      scene.add(mesh);
    });

    // ─── Central sphere ───────────────────────────────────────────────────────
    const sphereGeo = new THREE.SphereGeometry(1.08, 80, 80);
    const sphereMat = new THREE.MeshStandardMaterial({
      color: 0xc88c38,
      metalness: 0.45,
      roughness: 0.12,
      emissive: 0x5a2e00,
      emissiveIntensity: 0.9,
    });
    const sphere = new THREE.Mesh(sphereGeo, sphereMat);
    scene.add(sphere);

    // Outer halo shell
    const haloMat = new THREE.MeshStandardMaterial({
      color: 0xe09828,
      emissive: 0xe09828,
      emissiveIntensity: 0.12,
      transparent: true,
      opacity: 0.07,
      side: THREE.BackSide,
    });
    const halo = new THREE.Mesh(new THREE.SphereGeometry(1.28, 32, 32), haloMat);
    scene.add(halo);

    // ─── Particles ───────────────────────────────────────────────────────────
    const mkParticles = (count: number, spread: [number,number,number], zOffset: number, color: number, size: number, opacity: number) => {
      const pos = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        pos[i * 3]     = (Math.random() - 0.5) * spread[0];
        pos[i * 3 + 1] = (Math.random() - 0.5) * spread[1];
        pos[i * 3 + 2] = (Math.random() - 0.5) * spread[2] + zOffset;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      const mat = new THREE.PointsMaterial({ color, size, transparent: true, opacity, sizeAttenuation: true });
      const pts = new THREE.Points(geo, mat);
      scene.add(pts);
      return pts;
    };

    const particles1 = mkParticles(2000, [38, 26, 20], -4, 0xc89040, 0.042, 0.48);
    const particles2 = mkParticles(700,  [28, 20, 14], -2, 0xfff0c8, 0.026, 0.28);
    const particles3 = mkParticles(400,  [18, 14, 10],  0, 0xffdd88, 0.058, 0.18);

    // ─── Animation ────────────────────────────────────────────────────────────
    let animId: number;
    const clock = new THREE.Clock();

    const animate = () => {
      animId = requestAnimationFrame(animate);
      const t = clock.getElapsedTime();

      plates.forEach(({ mesh, sp, fi }) => {
        mesh.rotation.z += sp;
        mesh.rotation.x += sp * 0.38;
        mesh.position.y += Math.sin(t * 0.22 + fi) * 0.0008;
        mesh.position.x += Math.cos(t * 0.18 + fi) * 0.0004;
      });

      const breathe = 1 + Math.sin(t * 0.65) * 0.022;
      sphere.scale.setScalar(breathe);
      sphere.rotation.y  = t * 0.07;
      sphere.rotation.x  = Math.sin(t * 0.28) * 0.035;
      halo.scale.setScalar(breathe * 1.015);

      keyLight.intensity  = 4.8 + Math.sin(t * 0.9) * 0.7;
      keyLight.position.x = Math.sin(t * 0.35) * 1.8;
      keyLight.position.y = 2.0 + Math.cos(t * 0.28) * 0.9;

      fillLight.intensity = 2.0 + Math.sin(t * 0.55 + 1.2) * 0.4;

      particles1.rotation.y  =  t * 0.010;
      particles1.rotation.x  =  t * 0.006;
      particles2.rotation.y  = -t * 0.008;
      particles2.rotation.x  =  t * 0.004;
      particles3.rotation.y  =  t * 0.014;
      particles3.rotation.z  = -t * 0.005;

      renderer.render(scene, camera);
    };
    animate();

    // ─── Resize ───────────────────────────────────────────────────────────────
    const onResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", onResize);
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
      renderer.dispose();
    };
  }, []);

  return (
    <div
      ref={mountRef}
      className="pointer-events-none fixed inset-0"
      style={{ zIndex: -1 }}
    />
  );
};

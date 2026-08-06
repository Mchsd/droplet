// 三体·水滴降临 v2 —— 战舰升级 + 密集编队 + 撞击爆炸特效
import * as THREE from './vendor/three.module.js';
import { RoomEnvironment } from './vendor/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from './vendor/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from './vendor/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from './vendor/jsm/postprocessing/UnrealBloomPass.js';

// ============ 基础 ============
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x020408);
const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 5000);
camera.position.set(60, 18, 90);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
document.body.appendChild(renderer.domElement);

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

// ============ 星空 ============
function makeStars(count, radius, size, color) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const r = radius * (0.7 + Math.random() * 0.3);
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    pos[i*3]   = r * Math.sin(phi) * Math.cos(theta);
    pos[i*3+1] = r * Math.cos(phi);
    pos[i*3+2] = r * Math.sin(phi) * Math.sin(theta);
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({ size, color, transparent: true, opacity: 0.9, sizeAttenuation: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const pts = new THREE.Points(geo, mat);
  scene.add(pts);
  return pts;
}
makeStars(6000, 1800, 2.2, 0xaaccff);
makeStars(1500, 700, 3.2, 0xffffff);

// ============ Canvas 纹理工厂（金属面板 + 舷窗灯带 + 磨损） ============
function makePanelTexture() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 512;
  const ctx = c.getContext('2d');
  // 金属底
  ctx.fillStyle = '#2c3542';
  ctx.fillRect(0, 0, 512, 512);
  // 面板分块（不同明暗的装甲板）
  for (let y = 0; y < 512; y += 128) {
    for (let x = 0; x < 512; x += 128) {
      const shade = 40 + Math.random() * 30;
      ctx.fillStyle = `rgb(${shade + 8},${shade + 16},${shade + 26})`;
      ctx.fillRect(x + 4, y + 4, 120, 120);
    }
  }
  // 面板接缝线
  ctx.strokeStyle = 'rgba(10,14,20,0.9)';
  ctx.lineWidth = 3;
  for (let i = 0; i <= 512; i += 128) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 512); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(512, i); ctx.stroke();
  }
  // 铆钉
  ctx.fillStyle = 'rgba(160,175,195,0.5)';
  for (let y = 64; y < 512; y += 128) {
    for (let x = 64; x < 512; x += 128) {
      ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill();
    }
  }
  // 磨损划痕
  ctx.strokeStyle = 'rgba(20,28,38,0.4)';
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 30; i++) {
    const x = Math.random() * 512, y = Math.random() * 512;
    ctx.beginPath(); ctx.moveTo(x, y);
    ctx.lineTo(x + (Math.random() - 0.5) * 60, y + (Math.random() - 0.5) * 60);
    ctx.stroke();
  }
  // 战损焦痕（少数暗斑）
  for (let i = 0; i < 8; i++) {
    const x = Math.random() * 512, y = Math.random() * 512, r = 8 + Math.random() * 22;
    const g = ctx.createRadialGradient(x, y, 1, x, y, r);
    g.addColorStop(0, 'rgba(8,10,12,0.55)');
    g.addColorStop(1, 'rgba(8,10,12,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 1);
  tex.anisotropy = 4;
  return tex;
}

function makeWindowTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#1a2230';
  ctx.fillRect(0, 0, 256, 64);
  // 舷窗灯列
  for (let x = 12; x < 256; x += 28) {
    ctx.fillStyle = Math.random() > 0.25 ? 'rgba(120,200,255,0.9)' : 'rgba(60,90,120,0.6)';
    ctx.fillRect(x, 16, 10, 30);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.repeat.set(3, 1);
  return tex;
}

// ============ 战舰（v2 升级造型） ============
const panelTex = makePanelTexture();
const windowTex = makeWindowTexture();

function buildWarship(scaleFactor) {
  const ship = new THREE.Group();
  const rng = Math.random;
  const hullMat = new THREE.MeshStandardMaterial({
    map: panelTex, color: 0x8a9bb0, metalness: 0.9, roughness: 0.32
  });
  const hullMat2 = new THREE.MeshStandardMaterial({
    color: 0x5a6a7c, metalness: 0.95, roughness: 0.4
  });
  const darkMat = new THREE.MeshStandardMaterial({
    color: 0x2a3440, metalness: 0.85, roughness: 0.5
  });
  const glowMat = new THREE.MeshStandardMaterial({
    color: 0x66ccff, emissive: 0x2277bb, emissiveIntensity: 1.4, metalness: 0.3, roughness: 0.4
  });
  const windowMat = new THREE.MeshStandardMaterial({
    map: windowTex, color: 0xffffff,
    emissive: 0xffffff, emissiveMap: windowTex, emissiveIntensity: 1.6,
    metalness: 0.5, roughness: 0.3
  });

  // 主舰体（分段式：后粗前细）
  const seg1 = new THREE.Mesh(new THREE.CylinderGeometry(2.0, 2.6, 7, 12), hullMat);
  seg1.rotation.x = Math.PI / 2; seg1.position.z = -4.5;
  ship.add(seg1);
  const seg2 = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 2.0, 6, 12), hullMat2);
  seg2.rotation.x = Math.PI / 2; seg2.position.z = 2.5;
  ship.add(seg2);
  const seg3 = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.5, 5, 10), hullMat);
  seg3.rotation.x = Math.PI / 2; seg3.position.z = 8;
  ship.add(seg3);

  // 船首（锥形尖头）
  const bow = new THREE.Mesh(new THREE.ConeGeometry(1.0, 6, 10), darkMat);
  bow.rotation.x = -Math.PI / 2; bow.position.z = 13.2;
  ship.add(bow);

  // 装甲环（3 道）
  for (let z = -6; z <= 6; z += 6) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.5, 0.35, 8, 24), hullMat2);
    ring.rotation.x = Math.PI / 2; ring.position.z = z;
    ship.add(ring);
  }

  // 舷窗灯带（两侧 + 舰桥区）
  for (const side of [-1, 1]) {
    const win = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.7, 9), windowMat);
    win.position.set(side * 1.75, 0.6, 1.5);
    ship.add(win);
  }

  // 舰桥塔 + 天线
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.8, 2.2), darkMat);
  bridge.position.set(0, 2.4, -1.5);
  ship.add(bridge);
  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.4, 6), hullMat2);
  antenna.position.set(0.5, 3.6, -1.5);
  ship.add(antenna);
  const dish = new THREE.Mesh(new THREE.SphereGeometry(0.25, 10, 10), glowMat);
  dish.position.set(0.5, 4.8, -1.5);
  ship.add(dish);

  // 推进器阵列（3 喷口）
  for (const dx of [-1.2, 0, 1.2]) {
    const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 1.4, 8), darkMat);
    nozzle.rotation.x = Math.PI / 2; nozzle.position.set(dx, -0.4, -8.6);
    ship.add(nozzle);
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.42, 1.1, 8), glowMat);
    flame.rotation.x = Math.PI / 2; flame.position.set(dx, -0.4, -9.5);
    ship.add(flame);
  }

  // 侧翼 + 翼尖灯
  for (const side of [-1, 1]) {
    const wing = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.2, 6), hullMat2);
    wing.position.set(side * 3.0, -0.2, 2.5);
    ship.add(wing);
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.35, 1.6), glowMat);
    tip.position.set(side * 3.6, -0.2, 5.8);
    ship.add(tip);
    // 翼下挂载
    const pod = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 2.2, 8), darkMat);
    pod.rotation.x = Math.PI / 2; pod.position.set(side * 2.6, -1.1, 1);
    ship.add(pod);
  }

  // 腹部主炮
  const gun = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.45, 4.5, 8), darkMat);
  gun.rotation.x = Math.PI / 2; gun.position.set(0, -2.1, 2);
  ship.add(gun);

  // 随机侧倾/朝向
  ship.rotation.z = (rng() - 0.5) * 0.25;
  const s = scaleFactor * (0.85 + rng() * 0.35);
  ship.scale.setScalar(s);
  return ship;
}

// ============ 密集舰队编队（24 艘） ============
const fleet = new THREE.Group();
scene.add(fleet);
const warships = [];   // {mesh, pos}
const fleetPos = [];
// 主阵列：4 列 x 5 行（x,z 网格，y 有起伏）
const cols = [-30, -10, 10, 30];
const rows = [-14, -7, 0, 7, 14];
let wid = 0;
for (const x of cols) {
  for (const z of rows) {
    if (wid >= 20) break;
    const y = (Math.random() - 0.5) * 6;
    fleetPos.push([x + (Math.random() - 0.5) * 3, y, z + (Math.random() - 0.5) * 2]);
    wid++;
  }
}
// 先锋编队（前排 4 艘，朝向水滴来袭方向）
for (let i = 0; i < 4; i++) {
  fleetPos.push([-22 + i * 14, -3 + (i % 2) * 5, -24 - i * 4]);
}
// 贯穿靶船（6 艘排成一线，水滴将依次贯穿它们）
const targetLine = [];
for (let i = 0; i < 6; i++) {
  targetLine.push([-30 + i * 12, -2.5, -6 + (i % 2) * 0.8]);
}
fleetPos.push(...targetLine);

fleetPos.forEach(p => {
  const s = buildWarship(1 + Math.random() * 0.4);
  s.position.set(p[0], p[1], p[2]);
  s.rotation.y = (Math.random() - 0.5) * 0.35;
  fleet.add(s);
  warships.push({ mesh: s, pos: p, destroyed: false });
});
// 靶船朝水滴来的方向排齐
for (let i = 0; i < targetLine.length; i++) {
  const t = warships[fleetPos.length - 6 + i];
  if (t) { t.mesh.rotation.y = Math.PI / 2; t.destroyable = true; }
}
const TARGETS = warships.filter(w => w.destroyable);
console.log('fleet total:', warships.length, 'targets:', TARGETS.length);

// ============ 水滴 ============
const droplet = new THREE.Mesh(
  new THREE.SphereGeometry(1.0, 128, 128),
  new THREE.MeshPhysicalMaterial({
    color: 0xffffff, metalness: 1.0, roughness: 0.015,
    clearcoat: 1.0, clearcoatRoughness: 0.02,
    envMapIntensity: 1.6, emissive: 0x88ccff, emissiveIntensity: 0.06
  })
);
droplet.position.set(0, 0, -120);
scene.add(droplet);

const trailLight = new THREE.PointLight(0x88ccff, 4, 50);
scene.add(trailLight);
const halo = new THREE.Mesh(
  new THREE.RingGeometry(1.35, 1.5, 64),
  new THREE.MeshBasicMaterial({ color: 0x66bbff, transparent: true, opacity: 0.35, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false })
);
scene.add(halo);

// ============ 爆炸特效系统 ============
const FX = [];
const debris = new THREE.Group();
scene.add(debris);

function explode(pos, intensity) {
  const P = new THREE.Vector3(pos[0], pos[1], pos[2]);
  // 1. 闪光灯
  const light = new THREE.PointLight(0xffaa55, 25 * intensity, 90);
  light.position.copy(P);
  scene.add(light);
  FX.push({ type: 'light', obj: light, life: 0, max: 0.9, intensity });
  // 2. 冲击波环
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.6, 0.9, 48),
    new THREE.MeshBasicMaterial({ color: 0xffcc88, transparent: true, opacity: 0.9, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  ring.position.copy(P);
  ring.lookAt(camera.position);
  scene.add(ring);
  FX.push({ type: 'ring', obj: ring, life: 0, max: 1.6, intensity });
  // 3. 火球
  const fire = new THREE.Mesh(
    new THREE.SphereGeometry(0.8 * intensity, 16, 16),
    new THREE.MeshBasicMaterial({ color: 0xff8844, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  fire.position.copy(P);
  scene.add(fire);
  FX.push({ type: 'fire', obj: fire, life: 0, max: 1.5, intensity });
  // 4. 碎片粒子（三角形棱片）
  const n = Math.floor(30 * intensity);
  for (let i = 0; i < n; i++) {
    const frag = new THREE.Mesh(
      new THREE.TetrahedronGeometry(0.25 + Math.random() * 0.55, 0),
      new THREE.MeshStandardMaterial({
        color: 0x8899aa, metalness: 0.9, roughness: 0.35,
        emissive: i % 3 === 0 ? 0xff6622 : 0x000000, emissiveIntensity: 0.8
      })
    );
    frag.position.copy(P);
    const v = new THREE.Vector3(
      (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2
    ).normalize().multiplyScalar(6 + Math.random() * 14);
    frag.userData = {
      vel: v,
      rot: new THREE.Vector3((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8),
      life: 0, max: 2.2 + Math.random() * 1.5,
      drag: 0.96
    };
    debris.add(frag);
    FX.push({ type: 'debris', obj: frag, life: 0, max: frag.userData.max, intensity });
  }
  // 5. 余烬粒子（additive 小点）
  const ember = new THREE.BufferGeometry();
  const ep = new Float32Array(30 * 3);
  for (let i = 0; i < 30; i++) {
    ep[i*3] = P.x; ep[i*3+1] = P.y; ep[i*3+2] = P.z;
  }
  ember.setAttribute('position', new THREE.BufferAttribute(ep, 3));
  const emberMat = new THREE.PointsMaterial({
    color: 0xffaa44, size: 0.5, transparent: true, opacity: 1,
    blending: THREE.AdditiveBlending, depthWrite: false
  });
  const pts = new THREE.Points(ember, emberMat);
  scene.add(pts);
  FX.push({ type: 'embers', obj: pts, geo: ember, mat: emberMat, life: 0, max: 1.6, intensity, P });
}

function updateFX(dt) {
  for (let i = FX.length - 1; i >= 0; i--) {
    const f = FX[i];
    f.life += dt;
    const k = f.life / f.max;
    if (k >= 1) {
      if (f.type === 'debris') debris.remove(f.obj);
      scene.remove(f.obj);
      if (f.geo) f.geo.dispose();
      if (f.mat) f.mat.dispose();
      FX.splice(i, 1);
      continue;
    }
    switch (f.type) {
      case 'light':
        f.obj.intensity = 25 * f.intensity * (1 - k);
        break;
      case 'ring': {
        const s = 1 + k * 14 * f.intensity;
        f.obj.scale.set(s, s, s);
        f.obj.material.opacity = 0.9 * (1 - k);
        f.obj.lookAt(camera.position);
        break;
      }
      case 'fire':
        f.obj.scale.setScalar(1 + k * 5 * f.intensity);
        f.obj.material.opacity = 0.95 * (1 - k * k);
        break;
      case 'debris': {
        f.obj.position.addScaledVector(f.obj.userData.vel, dt);
        f.obj.userData.vel.multiplyScalar(f.obj.userData.drag);
        f.obj.rotation.x += f.obj.userData.rot.x * dt;
        f.obj.rotation.y += f.obj.userData.rot.y * dt;
        f.obj.scale.multiplyScalar(0.985);
        break;
      }
      case 'embers': {
        const arr = f.geo.attributes.position.array;
        for (let j = 0; j < arr.length; j += 3) {
          arr[j] += (Math.random() - 0.5) * 0.5;
          arr[j+1] += (Math.random() - 0.5) * 0.5 + 0.3;
          arr[j+2] += (Math.random() - 0.5) * 0.5;
        }
        f.geo.attributes.position.needsUpdate = true;
        f.mat.opacity = 1 - k;
        break;
      }
    }
  }
}

// ============ 灯光 ============
scene.add(new THREE.AmbientLight(0x223344, 0.6));
const keyLight = new THREE.DirectionalLight(0x88bbff, 1.2);
keyLight.position.set(40, 60, 80);
scene.add(keyLight);
const rimLight = new THREE.DirectionalLight(0x4466aa, 0.8);
rimLight.position.set(-50, -20, -60);
scene.add(rimLight);

// ============ 后期 ============
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
composer.addPass(new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.55, 0.4, 0.85));

// ============ 时间轴 ============
const clock = new THREE.Clock();
const DURATION = 30; // 秒
const shots = [
  [0,  5,  [46, 18, 95], [34, 10, 68],  [0, 0, 10]],    // 远景：密集舰队
  [5,  10, [34, 10, 68], [-10, 6, 40],  [0, 0, 0]],     // 推近
  [10, 14, [-10, 6, 40], [6, 4, 26],    [-24, -2, -6]], // 水滴逼近靶线
  [14, 22, [6, 4, 26],   [18, 10, 44],  [0, -2, -6]],   // 贯穿爆炸
  [22, 30, [18, 10, 44], [44, 22, 88],  [0, 0, 0]]      // 拉远看残骸
];

function getShot(tt) {
  for (const [t0, t1, p0, p1, look] of shots) {
    if (tt >= t0 && tt <= t1) {
      const k = Math.min(1, Math.max(0, (tt - t0) / (t1 - t0)));
      const e = k * k * (3 - 2 * k);
      return {
        pos: [p0[0] + (p1[0]-p0[0])*e, p0[1] + (p1[1]-p0[1])*e, p0[2] + (p1[2]-p0[2])*e],
        look
      };
    }
  }
  const last = shots[shots.length - 1];
  return { pos: last[3], look: last[4] };
}

// 贯穿爆炸调度
function checkImpacts(tt) {
  if (tt < 14.5 || tt > 24) return;
  // 水滴沿靶线推进
  const prog = Math.min(1, (tt - 14.5) / 8);
  const cx = -30 + prog * 60;
  for (const t of TARGETS) {
    if (!t.destroyed && Math.abs(t.mesh.position.x - cx) < 7) {
      t.destroyed = true;
      t.mesh.visible = false;
      explode([t.mesh.position.x, t.mesh.position.y, t.mesh.position.z], 1.2);
      // 相机震动
      camera.position.x += (Math.random() - 0.5) * 0.8;
      camera.position.y += (Math.random() - 0.5) * 0.8;
    }
  }
}

// ===== 调试钩子 =====
window.__fleetDebug = () => JSON.stringify({
  total: warships.length,
  destroyed: warships.filter(w => w.destroyed).length,
  targetsDestroyed: TARGETS.filter(t => t.destroyed).length,
  fxAlive: FX.length,
  debrisChildren: debris.children.length,
  tt: (clock.getElapsedTime() % DURATION).toFixed(1)
});

// ============ 渲染循环（双驱动） ============
let lastT = -1;
function renderFrame() {
  const t = clock.getElapsedTime();
  const tt = t % DURATION;
  const dt = Math.min(0.1, t - lastT);
  lastT = t;

  // 水滴运动
  if (tt < 14.5) {
    const k = tt / 14.5;
    droplet.position.set(
      40 * (1 - k) * 0.55,
      -10 + 9 * k * k,
      -120 + 115 * k
    );
  } else {
    // 贯穿阶段：沿靶线高速飞掠
    const prog = Math.min(1, (tt - 14.5) / 8);
    droplet.position.set(
      -36 + prog * 78,
      -2.5 + Math.sin(prog * 6) * 0.3,
      -6
    );
    droplet.rotation.y = tt * 0.5;
    trailLight.intensity = 4 + 8 * prog;
    keyLight.intensity = 1.2 + 2.5 * Math.sin(prog * Math.PI);
  }
  droplet.rotation.x = tt * 0.3;
  halo.position.copy(droplet.position);
  halo.lookAt(camera.position);
  trailLight.position.copy(droplet.position);

  // 贯穿爆炸判定
  checkImpacts(tt);

  // 特效更新
  updateFX(dt);

  // 镜头
  const { pos, look } = getShot(tt);
  camera.position.set(
    pos[0] + Math.sin(tt * 0.2) * 1.2,
    pos[1] + Math.sin(tt * 0.35) * 0.8,
    pos[2]
  );
  camera.lookAt(look[0], look[1], look[2]);

  // 舰队轻微漂移
  fleet.rotation.y = Math.sin(tt * 0.05) * 0.008;

  document.getElementById('progress').style.width = (tt / DURATION * 100) + '%';

  composer.render();
}

setTimeout(() => document.getElementById('title').classList.add('fade-in'), 1500);
function animate() {
  renderFrame();
  requestAnimationFrame(animate);
}
requestAnimationFrame(animate);
setInterval(() => { if (document.hidden) renderFrame(); }, 100);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
});

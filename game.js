import * as THREE from 'three';

const $ = (id) => document.getElementById(id);
const storageKey = 'ritmo-de-rua-save-v1';
const venues = [
  { name: 'BAIRRO DO CAIS', kicker: 'BAIRRO DO CAIS · DESAFIO 01', title: 'Ritmo de chegada', rival: 'DJ MARÉ', crew: 'CREW DO CAIS', hp: 100, reward: 80 },
  { name: 'PÁTIO 13', kicker: 'ESCOLA MUNICIPAL · DESAFIO 02', title: 'Batalha do intervalo', rival: 'LUNA LOOP', crew: 'CLUBE DO PÁTIO', hp: 135, reward: 125 },
  { name: 'GALPÃO 9', kicker: 'ZONA INDUSTRIAL · DESAFIO 03', title: 'Noite de amplificadores', rival: 'TONI RUÍDO', crew: 'OS SUBGRAVES', hp: 180, reward: 190 },
  { name: 'GRANDE AUDITÓRIO', kicker: 'SELETIVA PROFISSIONAL · FINAL', title: 'O palco é seu', rival: 'MAESTRO ZERO', crew: 'BANCA DE MESTRES', hp: 230, reward: 350 }
];
const instruments = {
  guitar: { label: 'GUITARRA', color: 0xff4e91, base: 22, special: 'POWER CHORD', badge: '〽' },
  flute: { label: 'FLAUTA', color: 0x62e8dd, base: 15, special: 'ECO MÁGICO', badge: '〰' },
  keys: { label: 'TECLAS', color: 0xf6cb74, base: 13, special: 'NOTAS EM CASCATA', badge: '▥' }
};
let save = loadSave();
let selectedStyle = save.style || 'guitar';
let scene, camera, renderer, clock, playerModel, rivalModel, particles = [], audioCtx = null;
let active = false, exploring = false, soundOn = true, startedAt = 0, lastBeat = -1, lastInput = 0, enemyBeat = 0, lastBattleWon = false;
let playerHP = 100, rivalHP = 100, combo = 0, score = 0, runDamage = 0, currentVenue = 0;
let toastTimer, nearestStation = -1;
const moveKeys = new Set();
const playerWorldPosition = new THREE.Vector3(-1, 0, 9);
const battleReturnPosition = new THREE.Vector3(-1, 0, 9);
const venueStations = [];
const districtNames = ['RUA DAS LANTERNAS', 'PÁTIO 13 · DISTRITO ESCOLAR', 'GALPÃO 9 · ZONA INDUSTRIAL', 'GRANDE AUDITÓRIO · CENTRO'];

function loadSave() {
  try { return { style: 'guitar', cash: 120, level: 1, upgrade: 0, unlocked: 0, ...JSON.parse(localStorage.getItem(storageKey) || '{}') }; }
  catch { return { style: 'guitar', cash: 120, level: 1, upgrade: 0, unlocked: 0 }; }
}
function persist() { localStorage.setItem(storageKey, JSON.stringify(save)); }
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

function initScene() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b0d13);
  scene.fog = new THREE.Fog(0x0b0d13, 18, 72);
  camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, .1, 120);
  camera.position.set(0, 7.2, 19.5);
  camera.lookAt(0, 2.4, -1.5);
  renderer = new THREE.WebGLRenderer({ canvas: $('world'), antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.7));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.18;
  clock = new THREE.Clock();
  scene.add(new THREE.HemisphereLight(0x9ca9d0, 0x17121c, 2.1));
  const keyLight = new THREE.DirectionalLight(0xffd5c0, 3.5);
  keyLight.position.set(-7, 10, 9); keyLight.castShadow = true; keyLight.shadow.mapSize.set(1024, 1024); scene.add(keyLight);
  const pinkLight = new THREE.PointLight(0xff4b7d, 34, 26); pinkLight.position.set(4.5, 5, -2); scene.add(pinkLight);
  const cyanLight = new THREE.PointLight(0x36e0d2, 32, 18); cyanLight.position.set(-5, 4.5, 4); scene.add(cyanLight);
  const warmLight = new THREE.PointLight(0xf8c978, 18, 28); warmLight.position.set(0, 7, 10); scene.add(warmLight);
  buildCity();
  buildVenueStations();
  playerModel = buildFighter(-2.2, 0x263e52, instruments[selectedStyle].color, false);
  rivalModel = buildFighter(2.2, 0x4b2339, 0xff4e91, true);
  rivalModel.visible = false;
  scene.add(playerModel, rivalModel);
  window.addEventListener('resize', resizeScene);
  animate();
}
function material(color, roughness = .8, metalness = 0) { return new THREE.MeshStandardMaterial({ color, roughness, metalness }); }
function box(parent, size, pos, mat, cast = true) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(...size), mat);
  m.position.set(...pos); m.castShadow = cast; m.receiveShadow = true; parent.add(m); return m;
}
function cylinder(parent, rt, rb, h, pos, mat, radial = 10) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, radial), mat);
  m.position.set(...pos); m.castShadow = true; parent.add(m); return m;
}
function buildCity() {
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), material(0x11161e, .96));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -.08; ground.receiveShadow = true; scene.add(ground);

  const plaza = new THREE.Mesh(new THREE.BoxGeometry(26, .08, 11), material(0x1a1f2b));
  plaza.position.set(0, 0.02, 0.8); plaza.receiveShadow = true; scene.add(plaza);

  for (let i = -8; i <= 8; i++) {
    const line = new THREE.Mesh(new THREE.BoxGeometry(.05, .015, 28), new THREE.MeshBasicMaterial({ color: i % 2 ? 0x433b4c : 0x2b3740, transparent: true, opacity: .8 }));
    line.position.set(i * 1.55, .03, -1.3); scene.add(line);
  }

  const facadeColors = [0x1a1d28, 0x2a1f2d, 0x1d2a31, 0x31272f, 0x222938, 0x242a39];
  for (let side of [-1, 1]) {
    for (let i = 0; i < 6; i++) {
      const x = side * (7.8 + i * 2.25), z = -5.5 - (i % 3) * 2.8;
      const w = 3.8 + (i % 2) * 1.3, h = 7.2 + (i % 3) * 2.4;
      const building = box(scene, [w, h, 5.2], [x, h / 2 - .1, z], material(facadeColors[(i + (side > 0 ? 2 : 0)) % facadeColors.length]), false);
      building.receiveShadow = true;
      for (let row = 0; row < 3; row++) for (let col = 0; col < 2; col++) {
        const lit = (row * 3 + col * 2 + i) % 4 === 1;
        box(scene, [.52, .78, .04], [x - w * .26 + col * w * .48, 1.4 + row * 1.5, z + 2.56], new THREE.MeshBasicMaterial({ color: lit ? (i % 2 ? 0xffd88b : 0x68e6de) : 0x35394c, transparent: true, opacity: lit ? .92 : .7 }), false);
      }
      if (i < 4) {
        const signColor = i % 2 ? 0x62e8dd : 0xff4e91;
        box(scene, [1.4, .62, .12], [x + side * .16, 3.8, z + 2.68], new THREE.MeshBasicMaterial({ color: signColor }), false);
      }
    }
  }

  for (let i = -2; i <= 2; i++) {
    const pillar = box(scene, [.26, 4.1, .28], [i * 6.4, 2.1, -8.5], material(0x453b4b), false);
    box(scene, [7, .18, .28], [i * 6.4, 4.12, -8.5], material(0x54454c), false);
  }

  const alleyWallLeft = box(scene, [14, 5.5, .4], [-10.5, 2.7, -11.5], material(0x241f2a), false);
  const alleyWallRight = box(scene, [14, 5.5, .4], [10.5, 2.7, -11.5], material(0x241f2a), false);

  const mural = new THREE.Mesh(new THREE.PlaneGeometry(6.2, 2.8), new THREE.MeshBasicMaterial({ color: 0x171b22, side: THREE.DoubleSide }));
  mural.position.set(0, 4.4, -9.6); scene.add(mural);
  const muralText = makeNeon('SÃO LUME', 0x62e8dd); muralText.position.set(0, 4.48, -9.35); scene.add(muralText);

  const sideSignA = makeNeon('KAI', 0xff5ea8); sideSignA.position.set(-8.8, 4.8, -8.2); scene.add(sideSignA);
  const sideSignB = makeNeon('RYU', 0x70f0df); sideSignB.position.set(8.8, 4.9, -8.1); scene.add(sideSignB);

  for (const x of [-6.8, 6.8]) {
    cylinder(scene, .048, .07, 4.2, [x, 2.1, -2], material(0x4d4957), 8);
    const lamp = new THREE.PointLight(x < 0 ? 0x62e8dd : 0xff4e91, 28, 16); lamp.position.set(x, 4.2, -2); scene.add(lamp);
    const orb = new THREE.Mesh(new THREE.SphereGeometry(.13, 14, 8), new THREE.MeshBasicMaterial({ color: x < 0 ? 0x62e8dd : 0xff4e91 })); orb.position.copy(lamp.position); scene.add(orb);
  }

  for (let i = 0; i < 10; i++) {
    const vending = new THREE.Group();
    const body = box(vending, [1.1, 2.2, 1.1], [0, 1.1, 0], material(i % 2 ? 0x3a4d63 : 0x5a2f44), true);
    const glass = new THREE.Mesh(new THREE.BoxGeometry(.88, 1.5, .06), new THREE.MeshBasicMaterial({ color: i % 2 ? 0x69e4dc : 0xff7db6, transparent: true, opacity: .82 }));
    glass.position.set(0, 1.3, .57); vending.add(glass);
    vending.position.set(-11 + i * 2.3, 0, 3.4 + (i % 3) * 0.9);
    vending.rotation.y = i % 2 ? 0.25 : -0.22;
    scene.add(vending);
  }

  for (let i = 0; i < 22; i++) {
    const x = -12 + Math.random() * 24, z = -12 + Math.random() * 24;
    const m = new THREE.Mesh(new THREE.BoxGeometry(.7 + Math.random() * .8, .12, .55), material(i % 2 ? 0x3a303c : 0x2a3742));
    m.position.set(x, .06, z); m.rotation.y = Math.random() * Math.PI; scene.add(m);
  }

  const road = new THREE.Mesh(new THREE.BoxGeometry(26, .02, 11), material(0x1a1d26));
  road.position.set(0, 0.01, 0.8); road.receiveShadow = true; scene.add(road);
  const curb1 = box(scene, [30, .12, .18], [0, .08, 6.1], material(0x2b303c), false);
  const curb2 = box(scene, [30, .12, .18], [0, .08, -4.5], material(0x2b303c), false);
  const laneMark = new THREE.Mesh(new THREE.BoxGeometry(20.5, .012, .12), new THREE.MeshBasicMaterial({ color: 0xf0d89d, transparent: true, opacity: .9 }));
  laneMark.position.set(0, .04, 0.8); scene.add(laneMark);
}
function makeNeon(text, color) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 120;
  const ctx = c.getContext('2d'); ctx.font = 'bold 68px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.shadowColor = `#${color.toString(16).padStart(6, '0')}`; ctx.shadowBlur = 22; ctx.fillStyle = '#d8fff9'; ctx.fillText(text, 256, 61);
  const tex = new THREE.CanvasTexture(c); const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 1.03), mat); return mesh;
}
function buildVenueStations() {
  const spots = [
    { x: -9, z: 1, color: 0xff4e91, sign: '港 · CAIS', marker: 'BAIRRO DO CAIS' },
    { x: 19, z: -17, color: 0x62e8dd, sign: '音楽 · PÁTIO', marker: 'PÁTIO 13' },
    { x: -19, z: 18, color: 0xf6cb74, sign: '地下 · LIVE', marker: 'GALPÃO 9' },
    { x: 19, z: 18, color: 0xff4e91, sign: '舞台 · FINAL', marker: 'AUDITÓRIO' }
  ];
  spots.forEach((spot, index) => {
    const group = new THREE.Group();
    group.position.set(spot.x, 0, spot.z);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.45, .055, 8, 48), new THREE.MeshBasicMaterial({ color: spot.color, transparent: true, opacity: .8 }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = .08; group.add(ring);
    const beacon = new THREE.Mesh(new THREE.CylinderGeometry(.035, .12, 2.1, 8, 1, true), new THREE.MeshBasicMaterial({ color: spot.color, transparent: true, opacity: .22, side: THREE.DoubleSide }));
    beacon.position.y = 1.15; group.add(beacon);
    const postMat = material(index === 0 ? 0x672b43 : 0x30303d, .72, .12);
    for (const x of [-1.6, 1.6]) {
      box(group, [.14, 2.5, .15], [x, 1.25, -.55], postMat);
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(.37, .44, .36), new THREE.MeshBasicMaterial({ color: spot.color }));
      lamp.position.set(x, 2.25, -.5); group.add(lamp);
    }
    box(group, [3.45, .14, .18], [0, 2.52, -.55], postMat);
    const sign = makeNeon(spot.sign, spot.color); sign.scale.set(.64, .64, .64); sign.position.set(0, 2.95, -.42); group.add(sign);
    const labelCanvas = document.createElement('canvas'); labelCanvas.width = 512; labelCanvas.height = 96;
    const ctx = labelCanvas.getContext('2d'); ctx.font = 'bold 34px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff'; ctx.shadowColor = `#${spot.color.toString(16).padStart(6, '0')}`; ctx.shadowBlur = 18; ctx.fillText(`${String(index + 1).padStart(2, '0')}  ${spot.marker}`, 256, 48);
    const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(labelCanvas), transparent: true, depthWrite: false }));
    label.position.set(0, 4.1, 0); label.scale.set(4.3, .8, 1); group.add(label);
    const npc = buildFighter(0, [0x493047, 0x243b43, 0x453b2b, 0x382a43][index], spot.color, true);
    npc.scale.setScalar(.78); npc.position.set(0, 0, 1.7); npc.rotation.y = Math.PI; group.add(npc);
    const light = new THREE.PointLight(spot.color, 16, 8); light.position.set(0, 2.8, 0); group.add(light);
    scene.add(group);
    venueStations.push({ group, npc, x: spot.x, z: spot.z, color: spot.color, label: spot.marker, ring });
  });
}
function buildFighter(x, clothes, accent, rival) {
  const root = new THREE.Group(); root.position.set(x, 0, rival ? -.45 : .25); root.rotation.y = rival ? -.12 : .12;
  const skin = material(rival ? 0x9b6959 : 0xb98168), outfit = material(clothes), accentMat = new THREE.MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: .12 });
  const dark = material(0x15151e), pants = material(rival ? 0x27232d : 0x1d3039);
  box(root, [.78, 1.05, .43], [0, 1.62, 0], outfit);
  box(root, [.82, .18, .45], [0, 1.12, 0], accentMat);
  const head = new THREE.Mesh(new THREE.SphereGeometry(.34, 16, 12), skin); head.position.set(0, 2.48, 0); head.castShadow = true; root.add(head);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(.355, 14, 8, 0, Math.PI * 2, 0, Math.PI * .48), dark); hair.position.set(0, 2.58, -.02); root.add(hair);
  box(root, [.75, .14, .48], [0, 2.79, 0], accentMat);
  const face = box(root, [.28, .13, .055], [0, 2.46, .318], material(0xf0c7ac, .8), false);
  const armL = cylinder(root, .12, .14, .82, [-.56, 1.67, .02], skin, 8); armL.rotation.z = -.25;
  const armR = cylinder(root, .12, .14, .82, [.56, 1.72, .03], skin, 8); armR.rotation.z = .35;
  box(root, [.32, .91, .35], [-.23, .53, 0], pants); box(root, [.32, .91, .35], [.23, .53, 0], pants);
  box(root, [.38, .2, .53], [-.23, .12, .05], dark); box(root, [.38, .2, .53], [.23, .12, .05], dark);

  const instrument = new THREE.Group(); instrument.position.set(rival ? .54 : -.5, 1.4, .45); instrument.rotation.z = rival ? -.42 : .42; root.add(instrument);

  if (!rival && selectedStyle === 'flute') {
    const tube = cylinder(instrument, .075, .075, 1.25, [0, 0, 0], material(0x9fe5dc, .3, .7), 12); tube.rotation.z = Math.PI / 2;
    for (let i = -2; i <= 2; i++) { const key = new THREE.Mesh(new THREE.SphereGeometry(.035, 8, 6), accentMat); key.position.set(i * .19, .07, .02); instrument.add(key); }
  } else if (!rival && selectedStyle === 'keys') {
    box(instrument, [.95, .3, .3], [0, 0, 0], material(0x22232c, .35));
    for (let i = 0; i < 7; i++) box(instrument, [.1, .05, .25], [-.39 + i * .13, .17, .01], material(0xecebf1, .3), false);
  } else {
    const body = new THREE.Mesh(new THREE.SphereGeometry(.42, 12, 10), material(rival ? 0x632941 : 0x422a50, .3, .25)); body.scale.set(.74, 1.12, .26); body.position.set(0, -.18, 0); instrument.add(body);
    box(instrument, [.13, 1.0, .13], [0, .53, 0], material(0x97766a, .3, .35));
    const strings = new THREE.Mesh(new THREE.BoxGeometry(.035, 1.18, .012), new THREE.MeshBasicMaterial({ color: 0xe9d9c6 })); strings.position.set(0, .2, .14); instrument.add(strings);
  }

  root.userData = { armL, armR, instrument, rival, accent: accentMat };
  return root;
}

function resizeScene() {
  if (!renderer) return;
  camera.aspect = innerWidth / innerHeight;
  camera.fov = innerWidth < 620 ? 52 : 42;
  camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.7));
}
function updateExploration(dt) {
  if (!$('garage-modal').classList.contains('hidden')) return;
  let x = 0, z = 0;
  if (moveKeys.has('forward')) z -= 1;
  if (moveKeys.has('back')) z += 1;
  if (moveKeys.has('left')) x -= 1;
  if (moveKeys.has('right')) x += 1;
  const moving = x !== 0 || z !== 0;
  if (moving) {
    const length = Math.hypot(x, z); x /= length; z /= length;
    const speed = moveKeys.has('sprint') ? 8.2 : 5.2;
    const nextX = clamp(playerWorldPosition.x + x * speed * dt, -25, 25);
    const nextZ = clamp(playerWorldPosition.z + z * speed * dt, -24, 28);
    playerWorldPosition.set(nextX, 0, nextZ);
    playerModel.rotation.y = Math.atan2(x, z);
    playerModel.userData.instrument.rotation.z = .42 + Math.sin(clock.elapsedTime * 10) * .06;
  } else {
    playerModel.userData.instrument.rotation.z = .42;
  }
  const yaw = playerModel.rotation.y;
  const behindX = -Math.sin(yaw), behindZ = -Math.cos(yaw);
  const desiredCamera = new THREE.Vector3(playerWorldPosition.x + behindX * 10, 7.5, playerWorldPosition.z + behindZ * 10);
  camera.position.lerp(desiredCamera, 1 - Math.exp(-dt * 4));
  const lookTarget = new THREE.Vector3(playerWorldPosition.x + Math.sin(yaw) * 5, 1.1, playerWorldPosition.z + Math.cos(yaw) * 5);
  camera.lookAt(lookTarget);

  let closest = Infinity, nearest = -1;
  venueStations.forEach((station, index) => {
    const distance = Math.hypot(playerWorldPosition.x - station.x, playerWorldPosition.z - station.z);
    station.ring.material.opacity = .55 + Math.sin(clock.elapsedTime * 2.4 + index) * .22;
    if (distance < closest) { closest = distance; nearest = index; }
  });
  nearestStation = closest < 3.8 ? nearest : -1;
  const prompt = $('nearby-prompt');
  prompt.classList.toggle('hidden', nearestStation < 0);
  if (nearestStation >= 0) {
    const unlocked = nearestStation <= save.unlocked;
    $('nearby-text').textContent = unlocked ? `${String(nearestStation + 1).padStart(2, '0')} · ${venues[nearestStation].name}` : `DESAFIO ${String(nearestStation + 1).padStart(2, '0')} · BLOQUEADO`;
    $('interact-venue').textContent = unlocked ? '[ E ] ENTRAR' : 'BLOQUEADO';
    $('interact-venue').disabled = !unlocked;
  }
  const district = nearestStation >= 0 ? districtNames[nearestStation] : playerWorldPosition.z < -8 ? districtNames[1] : playerWorldPosition.x < -10 ? districtNames[2] : playerWorldPosition.x > 10 ? districtNames[3] : districtNames[0];
  $('district-name').textContent = district;
  $('district-copy').textContent = nearestStation >= 0 ? (nearestStation <= save.unlocked ? 'A crew espera por você. Pressione E para começar.' : 'Conquiste os desafios anteriores para liberar este palco.') : 'Explore São Lume e encontre os palcos marcados no mapa.';
}
function enterExploration(message = '') {
  active = false; exploring = true;
  $('game-screen').classList.add('exploring');
  $('welcome-screen').classList.add('hidden');
  $('game-screen').classList.remove('hidden');
  $('result-modal').classList.add('hidden');
  $('venue-label').textContent = 'CIDADE DE SÃO LUME';
  $('venue-progress').textContent = `PRÓXIMO PALCO · ${venues[Math.min(save.unlocked, venues.length - 1)].name}`;
  playerModel.position.set(playerWorldPosition.x, 0, playerWorldPosition.z);
  playerModel.visible = true; rivalModel.visible = false;
  if (message) notify(message);
}
function enterBattle(index) {
  if (index > save.unlocked) { notify('ESTE PALCO AINDA ESTÁ BLOQUEADO'); return; }
  battleReturnPosition.copy(playerWorldPosition);
  exploring = false;
  $('game-screen').classList.remove('exploring');
  camera.position.set(0, 7.2, 19.5); camera.lookAt(0, 2.4, -1.5);
  playerModel.rotation.y = .12;
  swapPlayerModel(); showVenue(index);
  playTone(440, .15, 'sine');
}
function interactWithStation() {
  if (!exploring || nearestStation < 0) return;
  enterBattle(nearestStation);
}
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), .04), now = clock.elapsedTime;
  if (exploring) updateExploration(dt);
  if (playerModel && rivalModel) {
    if (exploring) {
      playerModel.position.x = playerWorldPosition.x;
      playerModel.position.z = playerWorldPosition.z;
      playerModel.position.y = Math.sin(now * 2.5) * .035;
      playerModel.visible = true; rivalModel.visible = false;
    } else if (active) {
      playerModel.position.y = Math.sin(now * 2.5) * .035;
      rivalModel.position.y = Math.sin(now * 2.5 + 1) * .035;
      playerModel.visible = true; rivalModel.visible = true;
    }
    playerModel.rotation.z = Math.sin(now * 1.7) * .025;
    rivalModel.rotation.z = Math.sin(now * 1.9 + 1) * .025;
    playerModel.userData.armR.rotation.z = .35 + Math.sin(now * 3.2) * .07;
    rivalModel.userData.armR.rotation.z = .35 + Math.sin(now * 3.5 + 1.3) * .12;
  }
  if (active) updateBattle();
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i]; p.life -= dt; p.mesh.position.addScaledVector(p.velocity, dt); p.velocity.y -= dt * 1.6;
    p.mesh.material.opacity = Math.max(0, p.life / p.maxLife);
    if (p.life <= 0) { scene.remove(p.mesh); p.mesh.geometry.dispose(); p.mesh.material.dispose(); particles.splice(i, 1); }
  }
  renderer.render(scene, camera);
}
function updateBattle() {
  const elapsed = performance.now() - startedAt;
  const beatDuration = 980;
  const beat = Math.floor(elapsed / beatDuration);
  const phase = (elapsed % beatDuration) / beatDuration;
  $('beat-fill').style.width = `${phase * 100}%`;
  $('beat-pulse').style.transform = `translateX(${phase * 100}%)`;
  $('beat-count').textContent = String(beat % 4 + 1).padStart(2, '0');
  if (beat !== lastBeat) {
    lastBeat = beat;
    if (beat > 0) playTone(beat % 4 === 0 ? 110 : 160 + (beat % 3) * 25, beat % 4 === 0 ? .09 : .045, 'triangle');
    if (beat > 0 && beat % 4 === 0) enemyTurn(phase);
  }
}
function enemyTurn() {
  enemyBeat++;
  if (!active) return;
  // An accurate note on the enemy's downbeat disrupts their phrase.
  const recent = performance.now() - lastInput < 190;
  if (recent) { notify('CONTRATEMPO! ATAQUE RIVAL BLOQUEADO'); return; }
  const damage = 8 + Math.floor(currentVenue * 2.5);
  playerHP = Math.max(0, playerHP - damage); combo = 0;
  updateBars(); notify('NOTA RIVAL! NÃO PERCA O TEMPO');
  burst(-2.2, 1.8, 0x62e8dd, 7);
  if (playerModel) playerModel.position.x = -2.02;
  setTimeout(() => { if (playerModel) playerModel.position.x = -2.2; }, 150);
  if (playerHP <= 0) finishBattle(false);
}
function pressAttack() {
  if (!active) return;
  const now = performance.now();
  const style = instruments[selectedStyle];
  const minGap = selectedStyle === 'keys' ? 230 : 340;
  if (now - lastInput < minGap) return;
  lastInput = now;
  const phase = ((now - startedAt) % 980) / 980;
  const distance = Math.min(Math.abs(phase - .82), 1 - Math.abs(phase - .82));
  const perfect = distance < .09, good = distance < .18;
  const levelDamage = style.base + save.upgrade * 12 + Math.floor((save.level - 1) * 1.5);
  let damage = perfect ? levelDamage * 1.55 : good ? levelDamage * 1.15 : levelDamage * .42;
  if (selectedStyle === 'keys' && combo >= 3) damage *= 1.2;
  damage = Math.round(damage);
  rivalHP = Math.max(0, rivalHP - damage);
  runDamage += damage; score += damage * (perfect ? 14 : good ? 9 : 3); combo = good ? combo + 1 : 0;
  updateBars();
  const result = perfect ? (selectedStyle === 'flute' ? 'ENCANTO!' : 'PERFEITO!') : good ? 'NO TEMPO!' : 'FORA DO BEAT';
  $('feedback-text').textContent = `${result} · -${damage}`;
  $('feedback-text').style.color = perfect ? '#62e8dd' : good ? '#f6cb74' : '#ff789f';
  $('combo-caption').textContent = combo >= 3 && selectedStyle === 'keys' ? 'CASCATA DE NOTAS!' : combo >= 3 ? 'RITMO CRESCENTE' : 'ACERTE NO TEMPO';
  playTone(perfect ? 540 : 360, .12, selectedStyle === 'flute' ? 'sine' : 'sawtooth');
  burst(2.2, 1.7, style.color, perfect ? 15 : 8);
  if (rivalModel) { rivalModel.position.x = 2.42; setTimeout(() => { if (rivalModel) rivalModel.position.x = 2.2; }, 140); }
  if (perfect && selectedStyle === 'flute') { playerHP = Math.min(100, playerHP + 3); updateBars(); }
  if (rivalHP <= 0) finishBattle(true);
}
function updateBars() {
  $('player-health').style.width = `${playerHP}%`; $('rival-health').style.width = `${Math.max(0, rivalHP / venues[currentVenue].hp * 100)}%`;
  $('player-hp-text').textContent = `${playerHP} / 100`; $('rival-hp-text').textContent = `${rivalHP} / ${venues[currentVenue].hp}`;
  $('combo-count').innerHTML = `${combo}<span>x</span>`; $('score-count').textContent = String(score).padStart(4, '0');
}
function finishBattle(won) {
  if (!active) return;
  active = false; lastBattleWon = won;
  const venue = venues[currentVenue];
  if (won) {
    save.cash += venue.reward; save.level = Math.max(save.level, currentVenue + 2); save.unlocked = Math.max(save.unlocked, currentVenue + 1); persist();
    $('result-stamp').textContent = '✦'; $('result-stamp').style.color = '#62e8dd'; $('result-stamp').style.borderColor = '#62e8dd';
    $('result-kicker').textContent = currentVenue === venues.length - 1 ? 'VOCÊ CONSEGUIU · ARTISTA PROFISSIONAL' : 'BATALHA CONCLUÍDA · VITÓRIA';
    $('result-title').textContent = currentVenue === venues.length - 1 ? 'O palco é seu.' : 'Seu som venceu.';
    $('result-copy').textContent = currentVenue === venues.length - 1 ? 'São Lume agora conhece seu nome. A jornada é só o começo.' : `${venue.rival} ficou sem resposta. A próxima crew já ouviu falar de você.`;
    $('reward-amount').textContent = venue.reward;
    $('result-next').innerHTML = 'VOLTAR À CIDADE <span>↗</span>';
  } else {
    $('result-stamp').textContent = '↺'; $('result-stamp').style.color = '#ff4e91'; $('result-stamp').style.borderColor = '#ff4e91';
    $('result-kicker').textContent = 'FIM DA RODADA'; $('result-title').textContent = 'O ritmo continua.';
    $('result-copy').textContent = 'Respire fundo, ouça a batida e tente mais uma vez.'; $('reward-amount').textContent = '0'; $('result-next').innerHTML = 'TENTAR DE NOVO <span>↻</span>';
  }
  $('cash').textContent = save.cash; $('result-modal').classList.remove('hidden');
}
function burst(x, y, color, amount) {
  for (let i = 0; i < amount; i++) {
    const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(.035 + Math.random() * .055, 0), new THREE.MeshBasicMaterial({ color, transparent: true }));
    mesh.position.set(x + (Math.random() - .5) * .6, y + (Math.random() - .5) * .5, .8);
    scene.add(mesh); particles.push({ mesh, velocity: new THREE.Vector3((Math.random() - .5) * 3, Math.random() * 2.4 + .4, (Math.random() - .5) * 1), life: .35 + Math.random() * .55, maxLife: .9 });
  }
}
function playTone(freq, duration, type = 'sine') {
  if (!soundOn) return;
  try {
    audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
    osc.type = type; osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    gain.gain.setValueAtTime(.0001, audioCtx.currentTime); gain.gain.exponentialRampToValueAtTime(.055, audioCtx.currentTime + .012); gain.gain.exponentialRampToValueAtTime(.0001, audioCtx.currentTime + duration);
    osc.connect(gain); gain.connect(audioCtx.destination); osc.start(); osc.stop(audioCtx.currentTime + duration + .02);
  } catch { /* Audio is an enhancement; gameplay still works silently. */ }
}
function notify(message) {
  const toast = $('toast'); toast.textContent = message; toast.classList.add('show'); clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 1200);
}

function swapPlayerModel() {
  if (!scene || !playerModel) return;
  scene.remove(playerModel);
  playerModel = buildFighter(-2.2, 0x263e52, instruments[selectedStyle].color, false);
  scene.add(playerModel);
}
function showVenue(index) {
  currentVenue = index;
  const venue = venues[index];
  playerHP = 100; rivalHP = venue.hp; combo = 0; score = 0; runDamage = 0; enemyBeat = 0; lastInput = -99999; lastBeat = -1;
  $('venue-label').textContent = venue.name;
  $('battle-kicker').textContent = venue.kicker; $('battle-name').textContent = venue.title;
  $('battle-round').textContent = `RODADA ${String(index + 1).padStart(2, '0')}`;
  $('rival-name').textContent = venue.rival; $('rival-label').textContent = venue.crew;
  $('player-level').textContent = `LV. ${String(save.level).padStart(2, '0')}`;
  $('player-style-name').textContent = instruments[selectedStyle].label;
  $('player-badge').textContent = instruments[selectedStyle].badge;
  $('venue-progress').textContent = `${String(index + 1).padStart(2, '0')} / 04 · ${venue.name}`;
  $('upgrade-label').textContent = `NÍVEL ${save.upgrade} · MELHORAR`;
  updateBars();
  $('feedback-text').textContent = 'SINTA A BATIDA'; $('feedback-text').style.color = '';
  $('welcome-screen').classList.add('hidden'); $('game-screen').classList.remove('hidden');
  $('result-modal').classList.add('hidden');
  startedAt = performance.now(); lastBeat = -1; active = true;
}
function startCareer() {
  $('game-screen').classList.add('exploring');
  enterExploration('BEM-VINDA À SÃO LUME · ENCONTRE UM PALCO');
  playTone(440, .15, 'sine');
}
function nextChallenge() {
  $('result-modal').classList.add('hidden');
  exploring = true; active = false;
  playerWorldPosition.copy(battleReturnPosition);
  if (lastBattleWon) {
    currentVenue = Math.min(save.unlocked, venues.length - 1);
    if (save.unlocked >= venues.length) {
      playerWorldPosition.set(0, 0, 9);
      enterExploration('VOCÊ CONQUISTOU A SELETIVA! A cidade inteira celebra seu som.');
      return;
    }
    enterExploration(`VITÓRIA! NOVO PALCO LIBERADO: ${venues[currentVenue].name}`);
  } else {
    currentVenue = Math.min(currentVenue, save.unlocked);
    enterExploration('RECUPERE O FÔLEGO E TENTE NOVAMENTE.');
  }
}
function openGarage() {
  const wasActive = active;
  active = false; $('garage-modal').classList.remove('hidden');
  $('garage-modal').dataset.resume = wasActive ? 'yes' : 'no';
  refreshGarage();
}
function closeGarage() {
  $('garage-modal').classList.add('hidden');
  if ($('garage-modal').dataset.resume === 'yes') {
    startedAt += performance.now() - Number($('garage-modal').dataset.opened || performance.now()); active = true;
  }
  $('garage-modal').dataset.resume = 'no';
}
function refreshGarage() {
  const cost = 80 * (save.upgrade + 1);
  $('upgrade-cost').textContent = cost; $('garage-level').textContent = `AMPLIFICADOR NÍVEL ${save.upgrade} · ${save.upgrade ? '+' + save.upgrade * 12 + ' POTÊNCIA' : 'POTÊNCIA BASE'}`;
  $('buy-upgrade').disabled = save.cash < cost || save.upgrade >= 5;
  $('buy-upgrade').style.opacity = $('buy-upgrade').disabled ? '.5' : '1';
  $('buy-upgrade').innerHTML = save.upgrade >= 5 ? 'AMPLIFICADOR NO MÁXIMO' : save.cash < cost ? 'CRÉDITOS INSUFICIENTES' : 'COMPRAR UPGRADE <span>↗</span>';
  $('cash').textContent = save.cash;
}
function buyUpgrade() {
  const cost = 80 * (save.upgrade + 1);
  if (save.cash < cost || save.upgrade >= 5) { notify('CRÉDITOS INSUFICIENTES'); return; }
  save.cash -= cost; save.upgrade++; persist(); refreshGarage();
  $('upgrade-label').textContent = `NÍVEL ${save.upgrade} · MELHORAR`;
  $('player-level').textContent = `LV. ${String(save.level).padStart(2, '0')}`;
  playTone(620, .2, 'triangle'); notify('AMPLIFICADOR APRIMORADO!');
}

for (const card of document.querySelectorAll('.style-card')) {
  card.addEventListener('click', () => {
    document.querySelectorAll('.style-card').forEach((el) => el.classList.remove('selected'));
    card.classList.add('selected'); selectedStyle = card.dataset.style; save.style = selectedStyle; persist();
    swapPlayerModel();
  });
}
$('start-career').addEventListener('click', startCareer);
$('attack-button').addEventListener('pointerdown', (event) => { event.preventDefault(); pressAttack(); });
$('interact-venue').addEventListener('click', interactWithStation);
$('city-garage').addEventListener('click', openGarage);
for (const button of document.querySelectorAll('[data-move]')) {
  const direction = button.dataset.move;
  const press = (event) => {
    event.preventDefault();
    if ('pointerId' in event && event.pointerId != null) {
      try { button.setPointerCapture?.(event.pointerId); } catch { /* some browsers reject pointer capture on touch buttons */ }
    }
    moveKeys.add(direction);
  };
  const release = (event) => {
    if (event) event.preventDefault();
    if ('pointerId' in event && event.pointerId != null) {
      try { button.releasePointerCapture?.(event.pointerId); } catch { /* pointer capture may already be released */ }
    }
    moveKeys.delete(direction);
  };
  button.addEventListener('pointerdown', press);
  button.addEventListener('pointerup', release);
  button.addEventListener('pointerleave', release);
  button.addEventListener('pointercancel', release);
  button.addEventListener('lostpointercapture', () => moveKeys.delete(direction));
  button.addEventListener('touchstart', (event) => {
    if (event.touches && event.touches.length > 0) {
      event.preventDefault();
      moveKeys.add(direction);
    }
  }, { passive: false });
  button.addEventListener('touchend', (event) => {
    event.preventDefault();
    moveKeys.delete(direction);
  }, { passive: false });
  button.addEventListener('touchcancel', (event) => {
    event.preventDefault();
    moveKeys.delete(direction);
  }, { passive: false });
}
window.addEventListener('keydown', (event) => {
  const key = event.key.toLowerCase();
  const directions = { w: 'forward', arrowup: 'forward', s: 'back', arrowdown: 'back', a: 'left', arrowleft: 'left', d: 'right', arrowright: 'right' };
  if (exploring && directions[key]) { event.preventDefault(); moveKeys.add(directions[key]); }
  if (exploring && key === 'shift') moveKeys.add('sprint');
  if (key === 'e' && exploring) { event.preventDefault(); interactWithStation(); }
  if (event.code === 'Space' && !event.repeat) { event.preventDefault(); pressAttack(); }
  if (event.key === 'Escape') {
    if (!$('garage-modal').classList.contains('hidden')) closeGarage();
    else if (!$('result-modal').classList.contains('hidden')) nextChallenge();
  }
});
window.addEventListener('keyup', (event) => {
  const key = event.key.toLowerCase();
  const directions = { w: 'forward', arrowup: 'forward', s: 'back', arrowdown: 'back', a: 'left', arrowleft: 'left', d: 'right', arrowright: 'right' };
  if (directions[key]) moveKeys.delete(directions[key]);
  if (key === 'shift') moveKeys.delete('sprint');
});
window.addEventListener('blur', () => moveKeys.clear());
$('result-next').addEventListener('click', nextChallenge);
$('open-garage').addEventListener('click', openGarage);
$('result-garage').addEventListener('click', openGarage);
$('close-garage').addEventListener('click', closeGarage);
$('buy-upgrade').addEventListener('click', buyUpgrade);
$('exit-career').addEventListener('click', () => {
  active = false; $('game-screen').classList.add('hidden'); $('result-modal').classList.add('hidden'); $('garage-modal').classList.add('hidden');
  $('welcome-screen').classList.remove('hidden'); $('venue-label').textContent = 'CIDADE DE SÃO LUME'; $('cash').textContent = save.cash;
});
$('sound-toggle').addEventListener('click', () => {
  soundOn = !soundOn; $('sound-toggle').innerHTML = soundOn ? '♫ <span>SOM ON</span>' : '♫ <span>SOM OFF</span>';
  if (soundOn) playTone(440, .1);
});
$('garage-modal').addEventListener('transitionend', () => { $('garage-modal').dataset.opened = performance.now(); });
// Record pause time immediately (the modal itself is intentionally animation-free).
const originalOpenGarage = openGarage;
$('open-garage').addEventListener('click', () => { $('garage-modal').dataset.opened = performance.now(); }, { capture: true });
$('result-garage').addEventListener('click', () => { $('garage-modal').dataset.opened = performance.now(); }, { capture: true });

// Restore the chosen instrument and credits, then bring the city to life.
document.querySelectorAll('.style-card').forEach((el) => el.classList.toggle('selected', el.dataset.style === selectedStyle));
$('cash').textContent = save.cash;
initScene();

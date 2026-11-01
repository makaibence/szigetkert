import { actorPalette } from './avatar-style.js';
import * as THREE from './lib/three/three.module.js';
import { GLTFLoader } from './lib/three/addons/loaders/GLTFLoader.js';
import { clone } from './lib/three/addons/utils/SkeletonUtils.js';

/** GPU-rendered skinned character; the world compositor draws this transparent surface at its depth. */
export class AvatarView {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      alpha: true,
      antialias: true,
      powerPreference: 'low-power',
      preserveDrawingBuffer: true,
    });
    this.renderer.setSize(256, 256, false);
    this.renderer.setPixelRatio(1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.28;
    this.scene = new THREE.Scene();
    this.scene.add(new THREE.HemisphereLight(0xffefda, 0x93734f, 2.1));
    const sun = new THREE.DirectionalLight(0xffe4b6, 3.2);
    sun.position.set(-3, 6, 5);
    this.scene.add(sun);
    const fill = new THREE.DirectionalLight(0xc5e7e5, 0.9);
    fill.position.set(4, 3, -3);
    this.scene.add(fill);
    this.camera = new THREE.OrthographicCamera(-1.45, 1.45, 1.45, -1.45, 0.1, 50);
    this.camera.position.set(7, 6.3, 7);
    this.camera.lookAt(0, 1, 0);
    this.root = new THREE.Group();
    this.scene.add(this.root);
    this.mixers = [];
    this.actions = [];
    this.loaded = false;
    this.state = 'idle';
    this.actors = new Map();
    this.lastTime = null;
    this.ready = this.load();
  }
  async load() {
    const loader = new GLTFLoader(),
      base = './assets/character/';
    const [body, outfit, hair, clips, work] = await Promise.all([
      loader.loadAsync(base + 'base/base.gltf'),
      loader.loadAsync(base + 'outfit/outfit.gltf'),
      loader.loadAsync(base + 'hair/hair.gltf'),
      loader.loadAsync(base + 'animations.glb'),
      loader.loadAsync(base + 'animations-harvest.glb'),
    ]);
    body.scene.traverse((mesh) => {
      if (!mesh.isMesh) return;
      if (mesh.name === 'SuperHero_Male') {
        const g = mesh.geometry.clone(),
          position = g.attributes.position,
          indices = g.index;
        const kept = [];
        for (let i = 0; i < indices.count; i += 3) {
          const triangle = [indices.getX(i), indices.getX(i + 1), indices.getX(i + 2)];
          if (
            triangle.every(
              (n) =>
                position.getY(n) > 1.545 ||
                (Math.abs(position.getX(n)) > 0.755 && position.getY(n) > 1.29),
            )
          )
            kept.push(...triangle);
        }
        g.setIndex(kept);
        g.computeBoundingSphere();
        mesh.geometry = g;
      }
    });
    const sharedClips = [...clips.animations, ...work.animations].map((clip) => {
      const c = clip.clone();
      c.tracks = c.tracks.filter((t) => !/^root\.(position|quaternion)$/.test(t.name));
      return c;
    });
    this.clipDuration =
      sharedClips.find((c) => c.name === 'TreeChopping_Loop')?.duration || 0.966667;
    this.clips = sharedClips;
    for (const model of [body.scene, outfit.scene, hair.scene]) {
      model.traverse((mesh) => {
        if (!mesh.isMesh) return;
        mesh.frustumCulled = false;
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const material of materials) {
          material.metalness = 0;
          material.roughness = 0.85;
          if (material.name.includes('Hair')) {
            material.map = null;
            material.color.set('#d2ae5c');
            material.roughness = 0.7;
          }
          if (material.name.includes('Regular_Male')) {
            material.map = null;
            material.color.set('#edc09a');
          }
          if (material.map) this.fitTexture(material.map, 1024);
          material.needsUpdate = true;
        }
      });
      this.root.add(model);
      const mixer = new THREE.AnimationMixer(model),
        actions = {};
      for (const clip of sharedClips) actions[clip.name] = mixer.clipAction(clip);
      this.mixers.push(mixer);
      this.actions.push(actions);
    }
    outfit.scene.traverse((mesh) => {
      if (!mesh.isMesh || mesh.material.name !== 'MI_Peasant') return;
      mesh.material = mesh.material.clone();
      if (mesh.name.includes('Body')) mesh.material.color.set('#87b6c2');
    });
    this.makeTools(outfit.scene);
    this.switchAction('idle', 0);
    this.loaded = true;
    this.draw({ angle: 0, action: 'idle' }, 0);
    return this;
  }
  setResolution(size) {
    const resolution = size > 320 ? 512 : 256;
    if (this.canvas.width !== resolution) this.renderer.setSize(resolution, resolution, false);
  }
  fitTexture(texture, maxSize) {
    const image = texture.image;
    if (!image || Math.max(image.width, image.height) <= maxSize) return;
    const ratio = maxSize / Math.max(image.width, image.height),
      c = document.createElement('canvas');
    c.width = Math.round(image.width * ratio);
    c.height = Math.round(image.height * ratio);
    c.getContext('2d').drawImage(image, 0, 0, c.width, c.height);
    texture.image = c;
    texture.needsUpdate = true;
  }
  makeTools(model) {
    const hand = model.getObjectByName('hand_r');
    if (!hand) throw Error('A karakter kézcsontja hiányzik.');
    const wood = new THREE.MeshStandardMaterial({ color: 0x936b40, roughness: 0.9 });
    const metal = new THREE.MeshStandardMaterial({
      color: 0x9eb5b6,
      roughness: 0.45,
      metalness: 0.3,
    });
    const mallet = new THREE.Group();
    mallet.name = 'SzigetMallet';
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.018, 0.3, 8), wood);
    shaft.position.y = 0.1;
    mallet.add(shaft);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.08, 0.09), metal);
    head.position.y = 0.26;
    mallet.add(head);
    mallet.visible = false;
    hand.add(mallet);
    this.mallet = mallet;
    const build = (pick) => {
      const group = new THREE.Group();
      const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.019, 0.53, 9), wood);
      handle.position.y = 0.18;
      group.add(handle);
      if (pick) {
        const head = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.36, 6), metal);
        head.rotation.z = Math.PI / 2;
        head.position.set(0.03, 0.42, 0);
        group.add(head);
      } else {
        const head = new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.115, 0.045), metal);
        head.position.set(0.075, 0.4, 0);
        group.add(head);
        const edge = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.045, 0.045, 5), metal);
        edge.rotation.x = Math.PI / 2;
        edge.position.set(0.17, 0.4, 0);
        group.add(edge);
      }
      group.rotation.set(Math.PI / 2, 0, Math.PI * 0.1);
      group.name = pick ? 'SzigetPick' : 'SzigetAxe';
      group.position.set(0.025, 0.025, -0.01);
      group.visible = false;
      hand.add(group);
      return group;
    };
    this.axe = build(false);
    this.pick = build(true);
    const carried = new THREE.Group();
    carried.name = 'SzigetCarried';
    for (let i = 0; i < 3; i++) {
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.37, 7), wood);
      log.rotation.z = Math.PI / 2;
      log.position.set(0, (i - 1) * 0.085, 0);
      carried.add(log);
    }
    carried.position.set(0, 0.06, -0.17);
    carried.visible = false;
    model.getObjectByName('spine_02').add(carried);
    this.carried = carried;
    const stones = new THREE.Group();
    stones.name = 'SzigetStones';
    for (let i = 0; i < 3; i++) {
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.085, 0), metal);
      rock.scale.set(1.2, 0.8, 1);
      rock.position.set((i - 1) * 0.1, 0, 0);
      stones.add(rock);
    }
    stones.position.set(0, 0.06, -0.17);
    stones.visible = false;
    model.getObjectByName('spine_02').add(stones);
    this.stones = stones;
  }
  getActor(id) {
    if (id === 'hero') return this;
    if (this.actors.has(id)) return this.actors.get(id);
    const palette = actorPalette(id);
    const root = clone(this.root),
      actor = { root, mixers: [], actions: [], lastTime: null, activeClip: null };
    for (const model of root.children) {
      const mixer = new THREE.AnimationMixer(model),
        actions = {};
      for (const clip of this.clips) actions[clip.name] = mixer.clipAction(clip);
      actor.mixers.push(mixer);
      actor.actions.push(actions);
      model.traverse((mesh) => {
        if (!mesh.isMesh) return;
        if (mesh.material.name === 'MI_Peasant') {
          mesh.material = mesh.material.clone();
          mesh.material.color.set(mesh.name.includes('Body') ? palette.shirt : palette.trousers);
        }
        if (mesh.material.name.includes('Hair')) {
          mesh.material = mesh.material.clone();
          mesh.material.color.set(palette.hair);
        }
      });
    }
    actor.mallet = root.getObjectByName('SzigetMallet');
    actor.axe = root.getObjectByName('SzigetAxe');
    actor.pick = root.getObjectByName('SzigetPick');
    actor.carried = root.getObjectByName('SzigetCarried');
    actor.stones = root.getObjectByName('SzigetStones');
    root.visible = false;
    this.scene.add(root);
    this.actors.set(id, actor);
    return actor;
  }
  switchAction(state, phase = 0, actor = this) {
    const clip =
      state === 'run'
        ? 'Sprint_Loop'
        : state === 'walk'
          ? 'Walk_Loop'
          : state === 'chop' || state === 'mine' || state === 'craft'
            ? 'TreeChopping_Loop'
            : 'Idle_Loop';
    for (const actions of actor.actions) {
      const next = actions[clip] || actions.Idle_Loop;
      if (actor.activeClip !== clip) {
        for (const action of Object.values(actions)) if (action !== next) action.fadeOut(0.12);
        next.reset().setEffectiveWeight(1).fadeIn(0.12).play();
      }
      next.setEffectiveTimeScale(state === 'idle' ? 1 : 0);
      if (state === 'walk' || state === 'run')
        next.time =
          ((phase / (state === 'run' ? 0.76 : 0.46)) * next.getClip().duration) %
          next.getClip().duration;
      if (state === 'chop' || state === 'mine' || state === 'craft')
        next.time = phase % this.clipDuration;
    }
    actor.activeClip = clip;
    actor.state = state;
  }
  draw(hero, time, id = 'hero') {
    if (!this.loaded) return false;
    const actor = this.getActor(id);
    const dt = actor.lastTime === null ? 0 : Math.max(0, Math.min(0.1, time - actor.lastTime));
    actor.lastTime = time;
    this.root.visible = actor === this;
    for (const a of this.actors.values()) a.root.visible = a === actor;
    actor.root.rotation.y = -(Number.isFinite(hero.angle) ? hero.angle : 0);
    this.switchAction(
      hero.action || 'idle',
      ['walk', 'run'].includes(hero.action) ? hero.walkPhase || 0 : hero.workTime || 0,
      actor,
    );
    if (actor.mallet) actor.mallet.visible = hero.action === 'craft';
    actor.axe.visible = hero.action === 'chop';
    actor.pick.visible = hero.action === 'mine';
    const carrying = !!hero.carried && hero.action !== 'chop' && hero.action !== 'mine';
    actor.carried.visible = carrying && hero.resourceKind !== 'stone';
    actor.stones.visible = carrying && hero.resourceKind === 'stone';
    for (const mixer of actor.mixers) mixer.update(dt);
    this.renderer.render(this.scene, this.camera);
    return true;
  }
  dispose() {
    this.renderer.dispose();
  }
}

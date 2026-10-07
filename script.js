/* ============================================================
   BRAND PARTNERS — RONALD ABI
   script.js

   Modules (each is an independent init function, called at the
   bottom of this file):

   1.  env()          environment flags: mobile, reduced motion, touch
   2.  initCursor()   custom cinematic cursor
   3.  initIntro()    3D camera -> lens push-in -> click -> flash -> title card
   4.  initNav()      sticky nav + fullscreen mobile menu
   5.  initScene()    Three.js ambient camera environment
   6.  initHero()     portrait parallax / depth-of-field
   7.  initCareer()   horizontal film-reel timeline (GSAP ScrollTrigger)
   8.  initGallery()  floating collage parallax + 3D tilt
   9.  initViewer()   fullscreen cinematic image viewer
   10. initHud()      running timecode + misc reveals
   ============================================================ */

(function () {
  'use strict';

  /* Safety net: if the GSAP CDN is blocked, show the site unanimated
     rather than a black screen. */
  if (!window.gsap || !window.ScrollTrigger) {
    document.documentElement.classList.add('no-anim');
    document.body.classList.remove('is-loading');
    return;
  }

  gsap.registerPlugin(ScrollTrigger);

  /* ---------- 1. ENVIRONMENT ---------- */
  var REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var FINE_POINTER = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  var isMobile = function () { return window.innerWidth <= 820; };

  var $ = function (sel, ctx) { return (ctx || document).querySelector(sel); };
  var $$ = function (sel, ctx) {
    return Array.prototype.slice.call((ctx || document).querySelectorAll(sel));
  };

  /* lerp helper used by every mouse-driven effect */
  function lerp(a, b, n) { return a + (b - a) * n; }

  /* normalised pointer position, shared by hero / gallery / 3D scene */
  var pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  if (FINE_POINTER) {
    window.addEventListener('mousemove', function (e) {
      pointer.tx = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.ty = (e.clientY / window.innerHeight) * 2 - 1;
    }, { passive: true });
  }

  /* one shared rAF loop so we never stack multiple render loops */
  var rafTasks = [];
  function onFrame(fn) { rafTasks.push(fn); }
  function tick() {
    pointer.x = lerp(pointer.x, pointer.tx, 0.06);
    pointer.y = lerp(pointer.y, pointer.ty, 0.06);
    for (var i = 0; i < rafTasks.length; i++) rafTasks[i]();
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  /* ---------- 2. CUSTOM CURSOR ---------- */
  function initCursor() {
    if (!FINE_POINTER || REDUCED) return;

    var cursor = $('.cursor');
    var dot = $('.cursor__dot');
    var ring = $('.cursor__ring');
    var label = $('.cursor__label');
    document.body.classList.add('cursor-on');

    var pos = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    var target = { x: pos.x, y: pos.y };

    window.addEventListener('mousemove', function (e) {
      target.x = e.clientX; target.y = e.clientY;
      gsap.set(dot, { x: e.clientX, y: e.clientY });
    }, { passive: true });

    onFrame(function () {
      pos.x = lerp(pos.x, target.x, 0.16);
      pos.y = lerp(pos.y, target.y, 0.16);
      gsap.set([ring, label], { x: pos.x, y: pos.y });
    });

    /* state changes on interactive elements */
    function setState(text) {
      gsap.to(ring, { opacity: text === null ? 0 : 1, scale: text ? 1.25 : 1, duration: .35 });
      label.textContent = text || '';
      gsap.to(label, { opacity: text ? 1 : 0, duration: .3 });
    }

    $$('[data-cursor]').forEach(function (el) {
      var type = el.getAttribute('data-cursor');
      el.addEventListener('mouseenter', function () {
        setState(type === 'view' ? 'View' : '');
        gsap.to(ring, { opacity: 1, scale: type === 'view' ? 1.5 : 1, duration: .35 });
      });
      el.addEventListener('mouseleave', function () { setState(null); });
    });

    document.addEventListener('mouseleave', function () {
      gsap.to(cursor, { opacity: 0, duration: .3 });
    });
    document.addEventListener('mouseenter', function () {
      gsap.to(cursor, { opacity: 1, duration: .3 });
    });
  }

  /* ---------- 3. OPENING SEQUENCE ----------
     A 3D cinema camera (built from Three.js primitives) emerges from
     darkness, turns to face the viewer, pulls focus, then the view
     pushes into the lens. The iris snaps shut (CLICK), a white flash
     fills the screen, and the movie title card resolves before the
     site is revealed.

       CAMERA  →  FOCUS PULL  →  PUSH INTO LENS  →  CLICK  →  FLASH
               →  TITLE CARD  →  WEBSITE

     Everything the 3D scene needs lives inside this module and is
     disposed when the intro ends, so it costs nothing afterwards.   */

  /* Build a small texture of vertical ribs (focus / iris ring grip). */
  function makeRibTexture() {
    var c = document.createElement('canvas');
    c.width = 256; c.height = 16;
    var x = c.getContext('2d');
    x.fillStyle = '#0c0c0c'; x.fillRect(0, 0, 256, 16);
    for (var i = 0; i < 256; i += 4) {
      x.fillStyle = i % 8 ? '#1a1a1a' : '#262626';
      x.fillRect(i, 0, 2, 16);
    }
    /* a few white focus-scale ticks + one red index */
    x.fillStyle = 'rgba(255,255,255,.85)';
    for (var t = 20; t < 256; t += 36) x.fillRect(t, 2, 1, 5);
    x.fillStyle = '#C8102E'; x.fillRect(128, 0, 2, 16);
    var tex = new THREE.CanvasTexture(c);
    tex.wrapS = THREE.RepeatWrapping;
    tex.repeat.set(2, 1);
    return tex;
  }

  /* The lens glass is a live canvas: dark glass, a 6-blade iris whose
     opening we animate, and faint coating reflections. */
  function makeGlass(size) {
    var c = document.createElement('canvas');
    c.width = c.height = size;
    var ctx = c.getContext('2d');
    var tex = new THREE.CanvasTexture(c);

    function draw(iris, spin) {
      var s = size, h = s / 2;
      ctx.clearRect(0, 0, s, s);

      /* glass body */
      var g = ctx.createRadialGradient(h, h, 0, h, h, h);
      g.addColorStop(0, '#050507');
      g.addColorStop(0.7, '#0b0b0f');
      g.addColorStop(1, '#1a1a1e');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(h, h, h, 0, Math.PI * 2); ctx.fill();

      /* element edges */
      ctx.strokeStyle = 'rgba(255,255,255,.06)';
      ctx.lineWidth = s * 0.004;
      [0.93, 0.8, 0.62].forEach(function (r) {
        ctx.beginPath(); ctx.arc(h, h, h * r, 0, Math.PI * 2); ctx.stroke();
      });

      /* iris blades: grey field with a black hexagonal opening */
      var rb = h * 0.56;
      ctx.fillStyle = '#141417';
      ctx.beginPath(); ctx.arc(h, h, rb, 0, Math.PI * 2); ctx.fill();

      var ri = Math.max(0.001, rb * iris);
      var rot = spin + (1 - iris) * 0.9;
      ctx.fillStyle = '#000';
      ctx.beginPath();
      for (var i = 0; i < 6; i++) {
        var a = rot + i * Math.PI / 3;
        var px = h + Math.cos(a) * ri, py = h + Math.sin(a) * ri;
        if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
      }
      ctx.closePath(); ctx.fill();

      /* blade seams */
      ctx.strokeStyle = 'rgba(255,255,255,.09)';
      ctx.lineWidth = s * 0.003;
      for (var j = 0; j < 6; j++) {
        var b = rot + j * Math.PI / 3;
        ctx.beginPath();
        ctx.moveTo(h + Math.cos(b) * ri, h + Math.sin(b) * ri);
        ctx.lineTo(h + Math.cos(b + 0.9) * rb, h + Math.sin(b + 0.9) * rb);
        ctx.stroke();
      }

      /* coating reflections — kept faint on purpose */
      ctx.lineCap = 'round';
      ctx.lineWidth = s * 0.012;
      ctx.strokeStyle = 'rgba(200,16,46,.45)';
      ctx.beginPath(); ctx.arc(h, h, h * 0.74, -2.5 + spin * 0.4, -1.7 + spin * 0.4); ctx.stroke();
      ctx.strokeStyle = 'rgba(150,160,255,.16)';
      ctx.beginPath(); ctx.arc(h, h, h * 0.86, 0.4 - spin * 0.3, 1.1 - spin * 0.3); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,.55)';
      ctx.beginPath(); ctx.arc(h * 0.7, h * 0.66, s * 0.012, 0, Math.PI * 2); ctx.fill();

      tex.needsUpdate = true;
    }

    draw(1, 0);
    return { texture: tex, draw: draw };
  }

  /* Assemble the cinema camera. Lens axis points at +Z (toward us). */
  function buildCinemaCamera() {
    var group = new THREE.Group();

    var mBody  = new THREE.MeshStandardMaterial({ color: 0x141414, metalness: .55, roughness: .42 });
    var mDark  = new THREE.MeshStandardMaterial({ color: 0x090909, metalness: .4,  roughness: .65 });
    var mMetal = new THREE.MeshStandardMaterial({ color: 0x2c2c2c, metalness: .9,  roughness: .28 });
    var mRed   = new THREE.MeshStandardMaterial({ color: 0xC8102E, emissive: 0xC8102E, emissiveIntensity: .35, metalness: .3, roughness: .4 });
    var ribTex = makeRibTexture();
    var mRib   = new THREE.MeshStandardMaterial({ map: ribTex, metalness: .5, roughness: .5 });

    function box(w, h, d, x, y, z, m) {
      var mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      mesh.position.set(x, y, z);
      group.add(mesh);
      return mesh;
    }
    /* cylinders along Z: wrap in a group rotated onto the lens axis,
       so mesh.rotation.y spins the part around that axis */
    function cyl(rt, rb, len, z, m, parent, open) {
      var wrap = new THREE.Group();
      wrap.rotation.x = Math.PI / 2;
      wrap.position.z = z;
      var mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, len, 64, 1, !!open), m);
      wrap.add(mesh);
      (parent || group).add(wrap);
      return mesh;
    }

    /* body + accessories */
    box(2.0, 1.7, 2.8, 0, 0, -0.6, mBody);                 /* main body       */
    box(2.02, 0.035, 2.82, 0, -0.52, -0.6, mRed);          /* red accent band */
    box(1.7, 1.45, 0.5, 0, -0.05, -2.25, mDark);           /* battery plate   */
    box(1.62, 1.62, 0.12, 0, 0, 0.86, mMetal);             /* lens mount plate*/
    box(0.28, 0.2, 2.5, 0, 1.36, -0.55, mDark);            /* top handle      */
    box(0.22, 0.5, 0.22, 0, 1.08, 0.45, mMetal);           /* handle posts    */
    box(0.22, 0.5, 0.22, 0, 1.08, -1.55, mMetal);
    box(0.08, 0.95, 1.35, 1.06, 0.1, -0.5, mDark);         /* side monitor    */
    var screen = box(0.01, 0.78, 1.18, 1.105, 0.1, -0.5,
      new THREE.MeshBasicMaterial({ color: 0x1a0306 }));
    box(0.5, 0.45, 0.95, -1.2, 0.55, -1.65, mBody);        /* EVF             */
    var eye = cyl(0.2, 0.24, 0.35, -2.3, mDark);           /* EVF eyecup      */
    eye.parent.position.set(-1.2, 0.55, -2.3);
    box(1.2, 0.18, 1.8, 0, -0.95, -0.6, mMetal);           /* base plate      */

    /* red tally light */
    var tally = new THREE.Mesh(new THREE.SphereGeometry(0.05, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xC8102E }));
    tally.position.set(0.72, 0.68, 0.84);
    group.add(tally);

    /* lens */
    var lens = new THREE.Group();
    lens.position.z = 0.92;
    group.add(lens);

    cyl(0.8, 0.8, 0.18, 0.09, mMetal, lens);               /* mount ring      */
    var irisRing  = cyl(0.7, 0.7, 0.32, 0.42, mRib, lens); /* iris ring       */
    cyl(0.64, 0.7, 1.9, 1.1, mBody, lens);                 /* barrel          */
    var focusRing = cyl(0.73, 0.73, 0.55, 1.05, mRib, lens); /* focus ring    */
    cyl(0.705, 0.705, 0.04, 1.47, mRed, lens);             /* red index ring  */
    var hoodMat = mDark.clone(); hoodMat.side = THREE.DoubleSide;
    cyl(0.8, 0.69, 0.36, 2.2, hoodMat, lens, true);        /* front hood      */

    /* glass */
    var glass = makeGlass(isMobile() ? 384 : 768);
    var glassMesh = new THREE.Mesh(new THREE.CircleGeometry(0.64, 64),
      new THREE.MeshBasicMaterial({ map: glass.texture }));
    glassMesh.position.z = 2.06;
    lens.add(glassMesh);

    /* re-centre the model on its own middle so it turns in place */
    var OFFSET_Z = -0.4, OFFSET_Y = -0.25;
    group.children.forEach(function (c) { c.position.z += OFFSET_Z; c.position.y += OFFSET_Y; });

    return {
      group: group, tally: tally, screen: screen,
      focusRing: focusRing, irisRing: irisRing,
      glass: glass,
      glassZ: 0.92 + 2.06 + OFFSET_Z,
      glassY: OFFSET_Y
    };
  }

  function initIntro() {
    var intro = $('#intro');
    var canvas = $('#introScene');
    var blades = $$('#blades .blade');
    var bladeGroup = $('#blades');
    var flash = $('#flash');
    var lines = $$('[data-line]');
    var skip = $('#introSkip');
    var done = false;

    /* Hands over to the website. Safe to call more than once. */
    function revealSite() {
      if (done) return;
      done = true;
      document.body.classList.remove('is-loading');
      intro.style.display = 'none';
      if (stopScene) stopScene();
      gsap.to(['#nav', '.hud-rec'], { opacity: 1, duration: 1.2, stagger: .1, ease: 'power2.out' });
      gsap.to('.scene', { opacity: .9, duration: 1.6, ease: 'power2.out' });
      gsap.to('[data-reveal]', { opacity: 1, y: 0, duration: 1.1, stagger: .09, ease: 'power3.out' });
      ScrollTrigger.refresh();
    }

    var stopScene = null;

    if (REDUCED) { revealSite(); return; }

    /* ---- 3D camera stage ---- */
    var S = {                 /* every animated 3D value lives here  */
      light: 0,               /* 0 = darkness, 1 = fully lit          */
      rotY: -1.15,            /* camera body yaw (3/4 side view)      */
      rotX: 0.2,
      dolly: 0,               /* 0 = wide, 1 = mid, 2 = inside lens   */
      look: 0,                /* 0 = look at body, 1 = look at glass  */
      focus: 0,               /* focus ring rotation                  */
      iris: 1                 /* 1 = open, 0 = closed                 */
    };
    var has3D = !!window.THREE;

    if (has3D) {
      var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: !isMobile(), alpha: false });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, isMobile() ? 1.5 : 2));
      renderer.setSize(window.innerWidth, window.innerHeight);
      renderer.setClearColor(0x000000, 1);

      var scene = new THREE.Scene();
      var cam = new THREE.PerspectiveCamera(35, 1, 0.02, 60);
      var rig = buildCinemaCamera();
      scene.add(rig.group);

      var ambient = new THREE.AmbientLight(0xffffff, 0);
      var key = new THREE.DirectionalLight(0xffffff, 0);
      key.position.set(4, 5, 6);
      var rimRed = new THREE.DirectionalLight(0xC8102E, 0);
      rimRed.position.set(-5, 2, -4);
      var rimWhite = new THREE.DirectionalLight(0xffffff, 0);
      rimWhite.position.set(5, 1.5, -5);
      var under = new THREE.PointLight(0xC8102E, 0, 6);
      under.position.set(0, -2.2, 2.2);
      scene.add(ambient, key, rimRed, rimWhite, under);

      /* dust floating in the key light */
      var DUST = isMobile() ? 120 : 360;
      var dp = new Float32Array(DUST * 3);
      for (var d = 0; d < DUST; d++) {
        dp[d * 3] = (Math.random() - .5) * 12;
        dp[d * 3 + 1] = (Math.random() - .5) * 7;
        dp[d * 3 + 2] = (Math.random() - .5) * 10;
      }
      var dustGeo = new THREE.BufferGeometry();
      dustGeo.setAttribute('position', new THREE.BufferAttribute(dp, 3));
      var dustMat = new THREE.PointsMaterial({ color: 0xffffff, size: .018, transparent: true, opacity: 0, depthWrite: false });
      var dust = new THREE.Points(dustGeo, dustMat);
      scene.add(dust);

      /* framing adapts to screen shape so the camera always fits */
      var framing = {};
      function fit() {
        var w = window.innerWidth, h = window.innerHeight, aspect = w / h;
        cam.aspect = aspect;
        cam.fov = aspect < 1 ? 52 : 35;
        cam.updateProjectionMatrix();
        renderer.setSize(w, h);
        framing.wide = aspect < 1 ? 17 : 11;
        framing.mid = aspect < 1 ? 13 : 7.8;
        framing.lens = rig.glassZ + 0.42;           /* glass fills the frame */
      }
      fit();
      window.addEventListener('resize', fit);

      var target = new THREE.Vector3();
      var bodyLook = new THREE.Vector3(0, 0.05, 0);
      var glassLook = new THREE.Vector3(0, rig.glassY, rig.glassZ);
      var running = true;
      var t0 = performance.now();

      var render = function () {
        if (!running) return;
        var t = (performance.now() - t0) / 1000;

        /* lights */
        ambient.intensity = 0.08 * S.light;
        key.intensity = 1.15 * S.light;
        rimRed.intensity = 2.4 * S.light;
        rimWhite.intensity = 0.7 * S.light;
        under.intensity = 0.4 * S.light;
        dustMat.opacity = 0.5 * S.light;

        /* camera body pose + a little hand-held breathing */
        rig.group.rotation.y = S.rotY + Math.sin(t * 0.6) * 0.015 * (1 - S.look);
        rig.group.rotation.x = S.rotX + Math.sin(t * 0.8) * 0.01 * (1 - S.look);
        rig.focusRing.rotation.y = S.focus;
        rig.irisRing.rotation.y = -S.iris * 0.6;
        rig.tally.visible = S.light > 0.2 && (Math.floor(t * 1.6) % 2 === 0);
        rig.screen.material.color.setHex(S.light > 0.5 ? 0x2a0509 : 0x0a0203);

        /* dolly: wide -> mid -> inside the lens */
        var z = S.dolly <= 1
          ? lerp(framing.wide, framing.mid, S.dolly)
          : lerp(framing.mid, framing.lens, S.dolly - 1);
        cam.position.set(
          Math.sin(t * 0.35) * 0.12 * (1 - S.look),
          lerp(0.55, rig.glassY, S.look),
          z
        );
        target.copy(bodyLook).lerp(glassLook, S.look);
        cam.lookAt(target);

        dust.rotation.y = t * 0.02;
        rig.glass.draw(S.iris, t * 0.25 + S.rotY);
        renderer.render(scene, cam);
      };
      onFrame(render);

      stopScene = function () {
        running = false;
        window.removeEventListener('resize', fit);
        scene.traverse(function (o) {
          if (o.geometry) o.geometry.dispose();
          if (o.material) {
            if (o.material.map) o.material.map.dispose();
            o.material.dispose();
          }
        });
        renderer.dispose();
      };
    } else {
      canvas.style.display = 'none';
    }

    /* ---- the sequence ---- */
    gsap.set(blades, { y: -1500 });                      /* iris fully open  */
    gsap.set('[data-reveal]', { y: 26 });
    gsap.set(lines, { y: 22, filter: 'blur(14px)' });

    var tl = gsap.timeline({ onComplete: revealSite });
    window.__introTimeline = tl;   /* handy for tweaking timing in DevTools */
    var C = has3D ? 0 : -3.4;   /* without WebGL, jump straight to the click */

    /* (a) tiny camera details wake up on black */
    tl.to('.ihud, .focus-mark, .intro__skip', {
      opacity: 1, duration: .9, stagger: .07, ease: 'power2.out'
    }, 0.2);

    if (has3D) {
      /* (b) the camera emerges from darkness and turns toward us */
      tl.to(S, { light: 1, duration: 2.0, ease: 'power2.out' }, 0.4)
        .to(S, { rotY: -0.5, rotX: 0.08, dolly: 1, duration: 3.1, ease: 'power2.inOut' }, 0.4)

        /* (c) focus pull: ring turns, iris stops down and back */
        .to(S, { focus: 2.4, duration: 1.6, ease: 'power2.inOut' }, 1.7)
        .to('.focus-mark', { scale: .7, duration: 1.2, ease: 'power2.inOut' }, 1.7)
        .to('.ihud__bar', { width: 26, duration: .6, ease: 'power2.in' }, 1.9)
        .to('.ihud__bar', { width: 70, duration: .8, ease: 'power2.out' }, 2.5)
        .to(S, { iris: .5, duration: .7, ease: 'power2.inOut' }, 2.1)
        .to(S, { iris: .85, duration: .6, ease: 'power2.inOut' }, 2.9)

        /* (d) push into the lens */
        .to('.ihud, .focus-mark, .intro__skip', { opacity: 0, duration: .4 }, 3.5)
        .to(S, { rotY: 0, rotX: 0, look: 1, dolly: 1.35, duration: .55, ease: 'power2.inOut' }, 3.5)
        .to(S, { dolly: 2, duration: .42, ease: 'power3.in' }, 4.05)

        /* (e) iris snaps shut inside the lens */
        .to(S, { iris: 0, duration: .16, ease: 'power4.in' }, 4.42);
    }

    /* (f) CLICK — shutter blades close over the frame */
    tl.to(blades, { y: 0, duration: .12, ease: 'power4.in' }, 4.46 + C)
      .to(bladeGroup, { rotation: 18, duration: .12, ease: 'power4.in', transformOrigin: '50% 50%' }, 4.46 + C)

      /* (g) FLASH */
      .to(flash, { opacity: 1, duration: .05, ease: 'none' }, 4.6 + C)
      .set(canvas, { opacity: 0 }, 4.66 + C)
      .set(bladeGroup, { rotation: 0 }, 4.66 + C)
      .to(flash, { opacity: 0, duration: .8, ease: 'power2.out' }, 4.7 + C)
      .to(blades, { y: -1500, duration: 1.0, ease: 'power3.out' }, 4.7 + C)

      /* (h) movie title card resolves, line by line */
      .to(lines, {
        opacity: 1, y: 0, filter: 'blur(0px)',
        duration: 1.1, stagger: .18, ease: 'power3.out'
      }, 4.95 + C)
      .to('.intro__skip', { opacity: 1, duration: .4 }, 5.2 + C)

      /* (i) hold, then out to the site */
      .to(lines, { opacity: 0, y: -10, filter: 'blur(8px)', duration: .6, stagger: .05, ease: 'power2.in' }, 8.4 + C)
      .to(intro, { opacity: 0, duration: .7, ease: 'power2.inOut' }, 8.9 + C);

    skip.addEventListener('click', function () {
      tl.kill();
      gsap.set(flash, { opacity: 0 });
      revealSite();
    });
  }

  /* ---------- 4. NAVIGATION ---------- */
  function initNav() {
    var nav = $('#nav');
    var toggle = $('#navToggle');
    var menu = $('#menu');

    ScrollTrigger.create({
      start: 'top -80',
      end: 99999,
      onUpdate: function (self) {
        nav.classList.toggle('is-stuck', self.scroll() > 80);
      }
    });

    function closeMenu() {
      menu.classList.remove('is-open');
      toggle.classList.remove('is-open');
      toggle.setAttribute('aria-expanded', 'false');
      menu.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('no-scroll');
    }

    toggle.addEventListener('click', function () {
      var open = !menu.classList.contains('is-open');
      menu.classList.toggle('is-open', open);
      toggle.classList.toggle('is-open', open);
      toggle.setAttribute('aria-expanded', String(open));
      menu.setAttribute('aria-hidden', String(!open));
      document.body.classList.toggle('no-scroll', open);
    });

    $$('#menu a').forEach(function (a) { a.addEventListener('click', closeMenu); });
    window.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeMenu();
    });
  }

  /* ---------- 5. THREE.JS AMBIENT CAMERA ENVIRONMENT ----------
     Deliberately subtle: dust motes, thin red light lines and a few
     floating film frames. Scroll pushes the camera forward, the
     pointer nudges it sideways. Counts drop hard on small screens. */
  function initScene() {
    var canvas = $('#scene');
    if (REDUCED || !window.THREE) { canvas.style.display = 'none'; return; }

    var small = isMobile();
    var DUST = small ? 220 : 900;
    var FRAMES = small ? 4 : 10;

    var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: !small, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, small ? 1.25 : 1.6));
    renderer.setSize(window.innerWidth, window.innerHeight);

    var scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x000000, 0.045);

    var camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 120);
    camera.position.set(0, 0, 16);

    /* --- dust motes --- */
    var dustGeo = new THREE.BufferGeometry();
    var pos = new Float32Array(DUST * 3);
    for (var i = 0; i < DUST; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 46;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 30;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 60;
    }
    dustGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    var dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({
      color: 0xffffff, size: 0.055, transparent: true, opacity: 0.5, depthWrite: false
    }));
    scene.add(dust);

    /* --- thin red light lines --- */
    var lineMat = new THREE.LineBasicMaterial({ color: 0xC8102E, transparent: true, opacity: 0.35 });
    var lineGroup = new THREE.Group();
    for (var l = 0; l < (small ? 4 : 12); l++) {
      var g = new THREE.BufferGeometry();
      var x = (Math.random() - 0.5) * 40;
      var y = (Math.random() - 0.5) * 26;
      var z = (Math.random() - 0.5) * 50;
      var len = 2 + Math.random() * 9;
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
        x, y, z, x + len, y, z
      ]), 3));
      lineGroup.add(new THREE.Line(g, lineMat));
    }
    scene.add(lineGroup);

    /* --- floating film frames (wireframe rectangles) --- */
    var frameMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.14 });
    var frames = [];
    for (var f = 0; f < FRAMES; f++) {
      var edges = new THREE.EdgesGeometry(new THREE.PlaneGeometry(4.4, 2.6));
      var mesh = new THREE.LineSegments(edges, frameMat);
      mesh.position.set((Math.random() - 0.5) * 34, (Math.random() - 0.5) * 22, (Math.random() - 0.5) * 50);
      mesh.rotation.set(Math.random() * 0.4, Math.random() * 0.8, (Math.random() - 0.5) * 0.3);
      mesh.userData.spin = (Math.random() - 0.5) * 0.0016;
      scene.add(mesh);
      frames.push(mesh);
    }

    /* scroll drives camera depth */
    var scrollZ = 0;
    ScrollTrigger.create({
      start: 0, end: 'max',
      onUpdate: function (self) { scrollZ = self.progress * 34; }
    });

    var visible = true;
    document.addEventListener('visibilitychange', function () { visible = !document.hidden; });

    onFrame(function () {
      if (!visible) return;
      dust.rotation.y += 0.00035;
      lineGroup.rotation.y -= 0.0002;
      for (var i = 0; i < frames.length; i++) frames[i].rotation.z += frames[i].userData.spin;

      camera.position.x = lerp(camera.position.x, pointer.x * 1.6, 0.04);
      camera.position.y = lerp(camera.position.y, -pointer.y * 1.1, 0.04);
      camera.position.z = lerp(camera.position.z, 16 - scrollZ, 0.06);
      camera.lookAt(0, 0, camera.position.z - 12);
      renderer.render(scene, camera);
    });

    var resizeTO;
    window.addEventListener('resize', function () {
      clearTimeout(resizeTO);
      resizeTO = setTimeout(function () {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
      }, 180);
    });
  }

  /* ---------- 6. HERO PORTRAIT PARALLAX ---------- */
  function initHero() {
    var visual = $('#heroVisual');
    var portrait = $('.frame--hero');
    if (!visual || !portrait) return;

    if (FINE_POINTER && !REDUCED) {
      onFrame(function () {
        gsap.set(portrait, {
          rotationY: pointer.x * 5,
          rotationX: -pointer.y * 4,
          x: pointer.x * 16,
          y: pointer.y * 10,
          transformPerspective: 1200
        });
        gsap.set('.hero__mark--a', { x: pointer.x * -26, y: pointer.y * -18 });
        gsap.set('.hero__mark--b', { x: pointer.x * 30, y: pointer.y * 20 });
        gsap.set('.streak', { x: pointer.x * -40 });
      });
    }

    if (REDUCED) return;

    /* portrait drifts back and softens as the viewer scrolls past */
    gsap.to(portrait, {
      yPercent: -8, scale: 1.04, filter: 'blur(3px)', opacity: .55,
      ease: 'none',
      scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true }
    });
  }

  /* ---------- 7. CAREER TIMELINE ---------- */
  function initCareer() {
    var section = $('#career');
    var track = $('#careerTrack');
    var bar = $('#careerBar');
    var yearOut = $('#careerYear');
    var miles = $$('.mile', track);
    if (!section || !miles.length) return;

    function setActive(index) {
      miles.forEach(function (m, i) { m.classList.toggle('is-active', i === index); });
      var y = miles[index].querySelector('.mile__year');
      if (y) yearOut.textContent = y.textContent;
    }
    setActive(0);

    /* Mobile / reduced motion: plain vertical reveal, no pinning. */
    if (REDUCED || isMobile()) {
      bar.style.width = '100%';
      miles.forEach(function (m) { m.classList.add('is-active'); });
      return;
    }

    var mm = gsap.matchMedia();

    mm.add('(min-width: 821px)', function () {
      var distance = function () {
        return Math.max(0, track.scrollWidth - window.innerWidth + 120);
      };

      var tween = gsap.to(track, {
        x: function () { return -distance(); },
        ease: 'none',
        scrollTrigger: {
          trigger: section,
          start: 'top top',
          end: function () { return '+=' + (distance() + window.innerHeight * 0.6); },
          pin: true,
          scrub: 0.8,
          invalidateOnRefresh: true,
          onUpdate: function (self) {
            bar.style.width = (self.progress * 100).toFixed(2) + '%';
            var idx = Math.min(miles.length - 1, Math.round(self.progress * (miles.length - 1)));
            setActive(idx);
          }
        }
      });

      /* each milestone lifts forward in 3D as it becomes the active frame */
      miles.forEach(function (m) {
        gsap.fromTo(m,
          { z: -180, rotationY: 8 },
          {
            z: 0, rotationY: 0, ease: 'none',
            scrollTrigger: {
              trigger: m,
              containerAnimation: tween,
              start: 'left right',
              end: 'center center',
              scrub: true
            }
          });
      });

      return function () { tween.scrollTrigger && tween.scrollTrigger.kill(); };
    });
  }

  /* ---------- 8. FLOATING GALLERY ---------- */
  function initGallery() {
    var stage = $('#galleryStage');
    var shots = $$('.shot', stage);
    var words = $$('.word', stage);
    if (!stage) return;

    if (REDUCED || isMobile()) return;

    /* (a) vertical parallax — each shot travels at its own speed  */
    shots.concat(words).forEach(function (el) {
      var speed = parseFloat(el.getAttribute('data-speed') || '0.16');
      gsap.fromTo(el,
        { y: 0 },
        {
          y: function () { return -window.innerHeight * speed * 3.2; },
          ease: 'none',
          scrollTrigger: {
            trigger: stage,
            start: 'top bottom',
            end: 'bottom top',
            scrub: true,
            invalidateOnRefresh: true
          }
        });
    });

    /* (b) shots come into focus as they cross the middle of the screen */
    shots.forEach(function (shot) {
      gsap.fromTo(shot,
        { opacity: .35, scale: .94 },
        {
          opacity: 1, scale: 1, duration: 1.1, ease: 'power2.out',
          scrollTrigger: { trigger: shot, start: 'top 88%', once: true }
        });
    });

    /* (c) 3D tilt + depth driven by the pointer */
    if (FINE_POINTER) {
      onFrame(function () {
        for (var i = 0; i < shots.length; i++) {
          var depth = parseFloat(shots[i].getAttribute('data-depth') || '0');
          gsap.set(shots[i], {
            x: pointer.x * depth,
            rotationY: pointer.x * (depth > 0 ? 3.5 : -3.5),
            rotationX: -pointer.y * 2,
            transformPerspective: 1400
          });
        }
        for (var w = 0; w < words.length; w++) {
          gsap.set(words[w], { x: pointer.x * -34 });
        }
      });
    }
  }

  /* ---------- 9. FULLSCREEN VIEWER ---------- */
  function initViewer() {
    var viewer = $('#viewer');
    var img = $('#viewerImg');
    var titleOut = $('#viewerTitle');
    var metaOut = $('#viewerMeta');
    var countOut = $('#viewerCount');
    var shots = $$('.shot');
    var index = 0;

    if (!viewer || !shots.length) return;

    function render(i) {
      index = (i + shots.length) % shots.length;
      var shot = shots[index];
      var source = shot.querySelector('img');
      var title = shot.getAttribute('data-title') || '';
      var year = shot.getAttribute('data-year') || '';
      var tag = shot.getAttribute('data-tag') || '';

      gsap.to(img, {
        opacity: 0, duration: .18, onComplete: function () {
          img.src = source.getAttribute('src');
          img.alt = source.alt || title;
          titleOut.textContent = title;
          metaOut.textContent = [year, tag].filter(Boolean).join(' — ');
          countOut.textContent = (index + 1) + ' / ' + shots.length;
          gsap.to(img, { opacity: 1, duration: .35 });
        }
      });
    }

    function open(i) {
      viewer.classList.add('is-open');
      viewer.setAttribute('aria-hidden', 'false');
      document.body.classList.add('no-scroll');
      render(i);
      gsap.fromTo(viewer, { opacity: 0 }, { opacity: 1, duration: .45, ease: 'power2.out' });
      gsap.fromTo('.viewer__figure', { scale: .94, y: 20 }, { scale: 1, y: 0, duration: .7, ease: 'power3.out' });
      $('#viewerClose').focus();
    }

    function close() {
      gsap.to(viewer, {
        opacity: 0, duration: .35, onComplete: function () {
          viewer.classList.remove('is-open');
          viewer.setAttribute('aria-hidden', 'true');
          document.body.classList.remove('no-scroll');
        }
      });
    }

    shots.forEach(function (shot, i) {
      shot.setAttribute('tabindex', '0');
      shot.setAttribute('role', 'button');
      shot.addEventListener('click', function () { open(i); });
      shot.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(i); }
      });
    });

    $('#viewerClose').addEventListener('click', close);
    $('#viewerNext').addEventListener('click', function () { render(index + 1); });
    $('#viewerPrev').addEventListener('click', function () { render(index - 1); });
    viewer.addEventListener('click', function (e) { if (e.target === viewer) close(); });

    window.addEventListener('keydown', function (e) {
      if (!viewer.classList.contains('is-open')) return;
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowRight') render(index + 1);
      if (e.key === 'ArrowLeft') render(index - 1);
    });
  }

  /* ---------- 10. HUD: TIMECODE + SECTION REVEALS ---------- */
  function initHud() {
    var tc = $('#timecode');
    var start = Date.now();
    var pad = function (n) { return String(n).padStart(2, '0'); };

    if (tc) {
      setInterval(function () {
        var t = (Date.now() - start) / 1000;
        var h = Math.floor(t / 3600);
        var m = Math.floor(t / 60) % 60;
        var s = Math.floor(t) % 60;
        var f = Math.floor((t % 1) * 24);
        tc.textContent = pad(h) + ':' + pad(m) + ':' + pad(s) + ':' + pad(f);
      }, 1000 / 12);
    }

    var y = $('#year');
    if (y) y.textContent = new Date().getFullYear();

    if (REDUCED) return;

    /* one controlled reveal per section — not everything, everywhere */
    [
      '.gallery__title', '.craft__copy', '.brand__type span',
      '.brand__copy > *', '.contact__list div'
    ].forEach(function (sel) {
      var els = $$(sel);
      if (!els.length) return;
      gsap.from(els, {
        y: 34, opacity: 0, duration: 1, stagger: .08, ease: 'power3.out',
        scrollTrigger: { trigger: els[0].closest('section'), start: 'top 72%', once: true }
      });
    });

    /* camera HUD labels tick on one after another */
    gsap.to('.hud-tag', {
      opacity: 1, duration: .5, stagger: .12, ease: 'power2.out',
      scrollTrigger: { trigger: '.craft', start: 'top 65%', once: true }
    });

    /* Brand Partners headline slides in from opposite sides */
    gsap.from('.brand__type span:first-child', {
      x: -60, opacity: 0, duration: 1.2, ease: 'power3.out',
      scrollTrigger: { trigger: '.brand', start: 'top 75%', once: true }
    });
    gsap.from('.brand__type span:last-child', {
      x: 60, opacity: 0, duration: 1.2, ease: 'power3.out',
      scrollTrigger: { trigger: '.brand', start: 'top 75%', once: true }
    });

    /* final frame: slow push-in */
    gsap.to('.frame--final img', {
      scale: 1.12, ease: 'none',
      scrollTrigger: { trigger: '.final', start: 'top bottom', end: 'bottom top', scrub: true }
    });
  }

  /* ---------- BOOT ---------- */
  function boot() {
    initCursor();
    initNav();
    initScene();
    initHero();
    initCareer();
    initGallery();
    initViewer();
    initHud();
    initIntro();          /* last: it reveals the page when finished */

    window.addEventListener('load', function () { ScrollTrigger.refresh(); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();

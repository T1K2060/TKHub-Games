// TKHub Games — Full Featured app.js
(function () {
  'use strict';

  // ─────────────────────────────────────────────────────────────────────────────
  // STATE
  // ─────────────────────────────────────────────────────────────────────────────
  const state = {
    games: [],
    currentGame: null,
    fpsLimit: 0,          // 0 = unlimited
    fpsActual: 0,
    shaderPreset: 'none',
    shaderEnabled: false,
    customShaderSource: null,
    persistMod: false,
    persistModCode: '',
    fpsHistory: new Array(60).fill(0),
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // ELEMENTS
  // ─────────────────────────────────────────────────────────────────────────────
  const el = {
    gamesList:         document.getElementById('gamesList'),
    gameFrame:         document.getElementById('gameFrame'),
    playerPlaceholder: document.getElementById('playerPlaceholder'),
    gameSearch:        document.getElementById('gameSearch'),

    // toolbar
    fullscreenBtn:     document.getElementById('fullscreenGame'),
    refreshBtn:        document.getElementById('refreshGame'),
    closeBtn:          document.getElementById('closeGame'),
    fpsBtnToggle:      document.getElementById('fpsBtnToggle'),
    shaderBtnToggle:   document.getElementById('shaderBtnToggle'),
    modBtnToggle:      document.getElementById('modBtnToggle'),
    devBtnToggle:      document.getElementById('devBtnToggle'),
    fpsDisplay:        document.getElementById('fpsDisplay'),

    // fps panel
    fpsPanel:          document.getElementById('fpsPanel'),
    fpsSlider:         document.getElementById('fpsSlider'),
    fpsLimitLabel:     document.getElementById('fpsLimitLabel'),

    // shader panel
    shaderPanel:       document.getElementById('shaderPanel'),
    shaderIntensity:   document.getElementById('shaderIntensity'),
    shaderIntensityLabel: document.getElementById('shaderIntensityLabel'),
    shaderParam2:      document.getElementById('shaderParam2'),
    shaderParam2Label: document.getElementById('shaderParam2Label'),
    shaderEditor:      document.getElementById('shaderEditor'),
    shaderEditorWrap:  document.getElementById('shaderEditorWrap'),
    shaderCanvas:      document.getElementById('shaderCanvas'),

    // mod panel
    modPanel:          document.getElementById('modPanel'),
    modEditor:         document.getElementById('modEditor'),
    modLogInline:      document.getElementById('modLogInline'),
    modLog:            document.getElementById('modLog'),

    // dev panel
    devPanel:          document.getElementById('devPanel'),
    devConsoleOutput:  document.getElementById('devConsoleOutput'),
    devConsoleInput:   document.getElementById('devConsoleInput'),
    devNetworkBody:    document.getElementById('devNetworkBody'),
    perfFps:           document.getElementById('perfFps'),
    perfFrameTime:     document.getElementById('perfFrameTime'),
    perfHeap:          document.getElementById('perfHeap'),
    perfDom:           document.getElementById('perfDom'),
    perfChart:         document.getElementById('perfChart'),
    devStorageOutput:  document.getElementById('devStorageOutput'),
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // SCRIPT LOADER (file:// compatible)
  // ─────────────────────────────────────────────────────────────────────────────
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      document.querySelectorAll(`script[data-tkhub]`).forEach(s => {
        if (s.dataset.tkhub === src) s.remove();
      });
      const s = document.createElement('script');
      s.dataset.tkhub = src;
      s.src = src;
      s.onload  = () => { s.remove(); resolve(); };
      s.onerror = () => { s.remove(); reject(new Error(`Failed to load: ${src}`)); };
      document.head.appendChild(s);
    });
  }

  function takeGlobal(name) {
    const val = window[name];
    try { delete window[name]; } catch(e) { window[name] = undefined; }
    return val;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // GAME LOADING
  // ─────────────────────────────────────────────────────────────────────────────
  async function loadIndex() {
    el.gamesList.innerHTML = '<div class="loading-games">Loading game list...</div>';
    try {
      await loadScript('./GamesIndex.js');
    } catch {
      el.gamesList.innerHTML =
        '<div class="loading-games">Could not load GamesIndex.js.<br>Run build_games.py first.</div>';
      return;
    }
    const index = takeGlobal('GamesIndex');
    if (!Array.isArray(index) || index.length === 0) {
      el.gamesList.innerHTML =
        '<div class="loading-games">GamesIndex.js is empty or invalid.<br>Re-run build_games.py.</div>';
      return;
    }
    state.games = index.sort((a, b) => a.name.localeCompare(b.name));
    renderGamesList(state.games);
  }

  async function fetchGameCode(sourceFile, filename) {
    const varName = `Games${sourceFile}`;
    await loadScript(`./Games/Games${sourceFile}.js`);
    const data = takeGlobal(varName);
    if (!data || !data[filename] || !data[filename].code) {
      throw new Error(`"${filename}" not found in Games${sourceFile}.js`);
    }
    return data[filename].code;
  }

  function base64ToHtml(b64) {
    const binary = atob(b64);
    const bytes  = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder('utf-8').decode(bytes);
  }

  async function loadGame(filename, sourceFile) {
    const game = state.games.find(g => g.filename === filename && g.sourceFile === sourceFile);
    if (!game) return;
    state.currentGame = game;

    el.playerPlaceholder.style.display = 'none';
    el.gameFrame.style.display         = 'block';
    el.gameFrame.src                   = 'about:blank';

    el.gamesList.querySelectorAll('.game-item').forEach(item => {
      item.classList.toggle('active', item.dataset.filename === filename);
    });

    try {
      const code = await fetchGameCode(sourceFile, filename);
      const html = base64ToHtml(code);
      const blob = new Blob([html], { type: 'text/html' });
      const url  = URL.createObjectURL(blob);

      if (el.gameFrame.dataset.blobUrl) URL.revokeObjectURL(el.gameFrame.dataset.blobUrl);
      el.gameFrame.src             = url;
      el.gameFrame.dataset.blobUrl = url;

      // Inject persist mod + console bridge after load
      el.gameFrame.addEventListener('load', onFrameLoad, { once: true });

    } catch (e) {
      console.error('Failed to load game:', e);
      alert(`Could not load "${game.name}".\n\n${e.message}`);
      closeGame();
    }
  }

  function onFrameLoad() {
    injectConsoleBridge();
    if (state.persistMod && state.persistModCode) {
      setTimeout(() => injectModCode(state.persistModCode), 300);
    }
    // apply shader if active
    if (state.shaderEnabled && state.shaderPreset !== 'none') {
      setTimeout(() => startShader(), 100);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER LIST
  // ─────────────────────────────────────────────────────────────────────────────
  function escapeHtml(text) {
    const d = document.createElement('div');
    d.textContent = text;
    return d.innerHTML;
  }

  function renderGamesList(games) {
    if (!games.length) {
      el.gamesList.innerHTML = '<div class="loading-games">No games found</div>';
      return;
    }
    el.gamesList.innerHTML = games.map(g => `
      <div class="game-item"
           data-filename="${escapeHtml(g.filename)}"
           data-source="${g.sourceFile}">
        <i class="fas fa-gamepad"></i>
        <span class="game-name">${escapeHtml(g.name)}</span>
      </div>
    `).join('');
    el.gamesList.querySelectorAll('.game-item').forEach(item => {
      item.addEventListener('click', () => {
        loadGame(item.dataset.filename, parseInt(item.dataset.source, 10));
      });
    });
  }

  function searchGames(query) {
    const q = query.toLowerCase();
    renderGamesList(state.games.filter(g => g.name.toLowerCase().includes(q)));
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // CLOSE / REFRESH
  // ─────────────────────────────────────────────────────────────────────────────
  function closeGame() {
    stopShader();
    if (el.gameFrame.dataset.blobUrl) {
      URL.revokeObjectURL(el.gameFrame.dataset.blobUrl);
      delete el.gameFrame.dataset.blobUrl;
    }
    el.gameFrame.src                   = 'about:blank';
    el.gameFrame.style.display         = 'none';
    el.playerPlaceholder.style.display = 'flex';
    state.currentGame                  = null;
    el.gamesList.querySelectorAll('.game-item').forEach(i => i.classList.remove('active'));
  }

  function refreshGame() {
    if (state.currentGame) loadGame(state.currentGame.filename, state.currentGame.sourceFile);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // FULLSCREEN — hide toolbar + sidebar via CSS :fullscreen
  // ─────────────────────────────────────────────────────────────────────────────
  function toggleFullscreen() {
    const target = document.getElementById('mainArea');
    if (!document.fullscreenElement) {
      target.requestFullscreen().catch(console.error);
    } else {
      document.exitFullscreen();
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // FPS COUNTER (real measurement)
  // ─────────────────────────────────────────────────────────────────────────────
  let _fpsFrames = 0, _fpsLast = performance.now();
  function fpsLoop() {
    _fpsFrames++;
    const now = performance.now();
    const dt  = now - _fpsLast;
    if (dt >= 500) {
      state.fpsActual = Math.round((_fpsFrames * 1000) / dt);
      el.fpsDisplay.textContent = `${state.fpsActual} FPS`;
      _fpsFrames = 0;
      _fpsLast   = now;
      // push to history
      state.fpsHistory.push(state.fpsActual);
      if (state.fpsHistory.length > 60) state.fpsHistory.shift();
      updatePerfPanel();
    }
    requestAnimationFrame(fpsLoop);
  }

  function updatePerfPanel() {
    el.perfFps.textContent       = state.fpsActual;
    el.perfFrameTime.textContent = state.fpsActual > 0 ? `${(1000/state.fpsActual).toFixed(1)} ms` : '-- ms';
    if (performance.memory) {
      el.perfHeap.textContent = `${(performance.memory.usedJSHeapSize/1048576).toFixed(1)} MB`;
    }
    try {
      const fw = el.gameFrame.contentDocument;
      if (fw) el.perfDom.textContent = fw.querySelectorAll('*').length;
    } catch(e) { el.perfDom.textContent = '--'; }
    drawPerfChart();
  }

  function drawPerfChart() {
    const canvas = el.perfChart;
    const ctx    = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0,0,w,h);
    const max = Math.max(...state.fpsHistory, 60);
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth   = 1.5;
    ctx.beginPath();
    state.fpsHistory.forEach((v, i) => {
      const x = (i / (state.fpsHistory.length - 1)) * w;
      const y = h - (v / max) * h;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke();
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // FPS LIMITER PANEL
  // ─────────────────────────────────────────────────────────────────────────────
  function initFpsPanel() {
    el.fpsBtnToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      const vis = el.fpsPanel.classList.toggle('visible');
      el.fpsBtnToggle.classList.toggle('active', vis);
    });

    el.fpsSlider.addEventListener('input', () => {
      const v = parseInt(el.fpsSlider.value);
      state.fpsLimit = v;
      el.fpsLimitLabel.textContent = v === 0 ? 'UNLIMITED' : `${v} FPS`;
      applyFpsLimit(v);
    });

    // Allow 0 = unlimited at min edge
    el.fpsSlider.addEventListener('change', () => {
      if (parseInt(el.fpsSlider.value) <= 15) {
        el.fpsSlider.value = 0;
        state.fpsLimit     = 0;
        el.fpsLimitLabel.textContent = 'UNLIMITED';
        applyFpsLimit(0);
      }
    });
  }

  let _fpsLimitInterval = null;
  function applyFpsLimit(fps) {
    // Inject rAF throttle into game iframe if possible
    try {
      const cw = el.gameFrame.contentWindow;
      if (!cw) return;
      if (fps === 0) {
        // Restore original rAF
        if (cw.__origRAF) {
          cw.requestAnimationFrame = cw.__origRAF;
          delete cw.__origRAF;
        }
      } else {
        if (!cw.__origRAF) cw.__origRAF = cw.requestAnimationFrame.bind(cw);
        const interval = 1000 / fps;
        let lastTime = 0;
        cw.requestAnimationFrame = function(cb) {
          return cw.__origRAF(function(timestamp) {
            if (timestamp - lastTime >= interval) {
              lastTime = timestamp;
              cb(timestamp);
            } else {
              cw.requestAnimationFrame(cb);
            }
          });
        };
      }
    } catch(e) {
      // Cross-origin or not yet loaded — silent fail
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // SHADERS (WebGL canvas overlay — captures iframe via drawImage)
  // ─────────────────────────────────────────────────────────────────────────────

  const SHADER_PRESETS = {
    none: null,
    crt: `
      void main() {
        vec2 uv = vUv;
        float scanline = sin(uv.y * uResolution.y * 2.0) * 0.04 * uIntensity;
        vec4 color = texture2D(uTexture, uv);
        color.rgb -= scanline;
        float vignette = uv.x * uv.y * (1.0 - uv.x) * (1.0 - uv.y) * 16.0;
        color.rgb *= pow(vignette, 0.3 * uParam2);
        gl_FragColor = color;
      }
    `,
    bloom: `
      void main() {
        vec2 uv = vUv;
        vec4 color = texture2D(uTexture, uv);
        vec4 blur = vec4(0.0);
        float spread = 0.003 * uIntensity;
        for(int x = -3; x <= 3; x++) {
          for(int y = -3; y <= 3; y++) {
            vec2 offset = vec2(float(x), float(y)) * spread;
            blur += texture2D(uTexture, uv + offset);
          }
        }
        blur /= 49.0;
        gl_FragColor = color + blur * uParam2 * uIntensity;
      }
    `,
    film: `
      float rand(vec2 co) { return fract(sin(dot(co, vec2(12.9898,78.233))) * 43758.5453); }
      void main() {
        vec2 uv = vUv;
        vec4 color = texture2D(uTexture, uv);
        float grain = rand(uv + vec2(uTime * 0.1)) * 0.15 * uIntensity;
        color.rgb += grain - 0.075;
        color.rgb = mix(color.rgb, vec3(dot(color.rgb, vec3(0.299,0.587,0.114))), uParam2 * 0.5);
        gl_FragColor = color;
      }
    `,
    vignette: `
      void main() {
        vec2 uv = vUv;
        vec4 color = texture2D(uTexture, uv);
        vec2 d = uv - 0.5;
        float vignette = 1.0 - dot(d, d) * 3.0 * uIntensity;
        color.rgb *= max(vignette, uParam2 * 0.2);
        gl_FragColor = color;
      }
    `,
    chromab: `
      void main() {
        vec2 uv = vUv;
        float amount = 0.005 * uIntensity;
        vec2 dir = (uv - 0.5) * amount * uParam2 * 2.0;
        float r = texture2D(uTexture, uv + dir).r;
        float g = texture2D(uTexture, uv).g;
        float b = texture2D(uTexture, uv - dir).b;
        gl_FragColor = vec4(r, g, b, 1.0);
      }
    `,
    retro: `
      void main() {
        vec2 uv = vUv;
        vec2 pixelated = floor(uv * vec2(320.0, 200.0) * uParam2) / (vec2(320.0, 200.0) * uParam2);
        vec4 color = texture2D(uTexture, pixelated);
        // CGA palette approximation
        vec3 c = floor(color.rgb * 4.0 * uIntensity) / (4.0 * uIntensity);
        gl_FragColor = vec4(c, 1.0);
      }
    `,
    custom: null
  };

  const VS_SRC = `
    attribute vec2 aPosition;
    varying vec2 vUv;
    void main() {
      vUv = aPosition * 0.5 + 0.5;
      gl_Position = vec4(aPosition, 0.0, 1.0);
    }
  `;

  const FS_HEADER = `
    precision mediump float;
    uniform sampler2D uTexture;
    uniform float uTime;
    uniform vec2 uResolution;
    uniform float uIntensity;
    uniform float uParam2;
    varying vec2 vUv;
  `;

  let _gl = null, _glProgram = null, _glTexture = null, _glStarted = false;
  let _shaderRAF = null;

  function initGL() {
    const canvas = el.shaderCanvas;
    _gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (!_gl) { console.warn('WebGL not available'); return false; }
    return true;
  }

  function compileShader(gl, type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      console.error('Shader error:', gl.getShaderInfoLog(sh));
      return null;
    }
    return sh;
  }

  function buildProgram(fsSrc) {
    const gl = _gl;
    if (_glProgram) { gl.deleteProgram(_glProgram); _glProgram = null; }
    const vs = compileShader(gl, gl.VERTEX_SHADER, VS_SRC);
    const fs = compileShader(gl, gl.FRAGMENT_SHADER, FS_HEADER + fsSrc);
    if (!vs || !fs) return false;
    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error('Program link error:', gl.getProgramInfoLog(prog));
      return false;
    }
    _glProgram = prog;

    // quad
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'aPosition');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    _glTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, _glTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);

    return true;
  }

  function startShader() {
    if (!_gl && !initGL()) return;
    const preset  = state.shaderPreset;
    const fsSrc   = preset === 'custom' ? state.customShaderSource : SHADER_PRESETS[preset];
    if (!fsSrc) { stopShader(); return; }
    if (!buildProgram(fsSrc)) return;

    el.shaderCanvas.style.display = 'block';
    state.shaderEnabled = true;
    _glStarted = true;
    renderShaderLoop();
  }

  function stopShader() {
    el.shaderCanvas.style.display = 'none';
    state.shaderEnabled = false;
    _glStarted = false;
    if (_shaderRAF) { cancelAnimationFrame(_shaderRAF); _shaderRAF = null; }
  }

  const _tempCanvas = document.createElement('canvas');
  const _tempCtx    = _tempCanvas.getContext('2d');

  function renderShaderLoop(ts = 0) {
    if (!_glStarted) return;
    _shaderRAF = requestAnimationFrame(renderShaderLoop);

    const gl     = _gl;
    const canvas = el.shaderCanvas;
    const wrap   = canvas.parentElement;
    const w = wrap.clientWidth, h = wrap.clientHeight;

    if (canvas.width !== w || canvas.height !== h) {
      canvas.width  = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
    }

    // Capture iframe content via canvas
    let imgSrc = null;
    try {
      const fw = el.gameFrame.contentDocument;
      if (!fw) return;
      _tempCanvas.width  = w;
      _tempCanvas.height = h;
      _tempCtx.drawImage(el.gameFrame, 0, 0, w, h);
      imgSrc = _tempCanvas;
    } catch(e) {
      // Same-origin required for drawImage — use fallback solid colour
      _tempCanvas.width  = 2;
      _tempCanvas.height = 2;
      imgSrc = _tempCanvas;
    }

    gl.useProgram(_glProgram);

    // Upload texture
    gl.bindTexture(gl.TEXTURE_2D, _glTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, imgSrc);

    // Uniforms
    const prog = _glProgram;
    gl.uniform1i (gl.getUniformLocation(prog, 'uTexture'),    0);
    gl.uniform1f (gl.getUniformLocation(prog, 'uTime'),       ts * 0.001);
    gl.uniform2f (gl.getUniformLocation(prog, 'uResolution'), w, h);
    gl.uniform1f (gl.getUniformLocation(prog, 'uIntensity'),  parseFloat(el.shaderIntensity.value));
    gl.uniform1f (gl.getUniformLocation(prog, 'uParam2'),     parseFloat(el.shaderParam2.value));

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  function initShaderPanel() {
    // toggle
    el.shaderBtnToggle.addEventListener('click', () => {
      const vis = el.shaderPanel.classList.toggle('visible');
      el.shaderBtnToggle.classList.toggle('active', vis);
    });

    // presets
    document.querySelectorAll('.preset-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.shaderPreset = btn.dataset.preset;
        el.shaderEditorWrap.style.display = state.shaderPreset === 'custom' ? 'block' : 'none';

        if (state.shaderPreset === 'none') {
          stopShader();
        } else if (state.shaderPreset !== 'custom') {
          startShader();
        }
      });
    });

    // intensity
    el.shaderIntensity.addEventListener('input', () => {
      el.shaderIntensityLabel.textContent = parseFloat(el.shaderIntensity.value).toFixed(2);
    });
    el.shaderParam2.addEventListener('input', () => {
      el.shaderParam2Label.textContent = parseFloat(el.shaderParam2.value).toFixed(2);
    });

    // custom shader apply
    document.getElementById('applyCustomShader').addEventListener('click', () => {
      state.customShaderSource = el.shaderEditor.value;
      startShader();
    });

    document.getElementById('resetCustomShader').addEventListener('click', () => {
      el.shaderEditor.value = `void main() {
  vec4 color = texture2D(uTexture, vUv);
  gl_FragColor = color;
}`;
    });

    makeDraggable(el.shaderPanel, document.getElementById('shaderPanelHeader'));
    document.getElementById('shaderPanelClose').addEventListener('click', () => {
      el.shaderPanel.classList.remove('visible');
      el.shaderBtnToggle.classList.remove('active');
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // MOD MAKER
  // ─────────────────────────────────────────────────────────────────────────────
  const MOD_TEMPLATES = {
    godmode: `// GOD MODE - attempt to override health/lives
(function() {
  const win = window;
  const props = ['health', 'lives', 'hp', 'life', 'hearts'];
  props.forEach(p => {
    try {
      Object.defineProperty(win, p, {
        get: () => Infinity,
        set: () => {},
        configurable: true
      });
    } catch(e) {}
  });
  console.log('[MOD] God mode applied');
})();`,

    speed: `// SPEED HACK - 2x game speed
(function() {
  const origRAF = window.requestAnimationFrame;
  let lastTime = 0;
  const MULTIPLIER = 2.0;
  window.requestAnimationFrame = function(cb) {
    return origRAF(function(ts) {
      const delta = ts - lastTime;
      lastTime = ts;
      cb(ts + delta * (MULTIPLIER - 1));
    });
  };
  console.log('[MOD] Speed hack active: ' + MULTIPLIER + 'x');
})();`,

    noclip: `// SCREENSHOT - capture game canvas
(function() {
  const canvas = document.querySelector('canvas');
  if (!canvas) { console.warn('[MOD] No canvas found'); return; }
  const link = document.createElement('a');
  link.download = 'game_screenshot.png';
  link.href = canvas.toDataURL('image/png');
  link.click();
  console.log('[MOD] Screenshot saved');
})();`,

    inspector: `// DOM INSPECTOR - log all elements
(function() {
  const all = document.querySelectorAll('*');
  console.log('[MOD] DOM has ' + all.length + ' elements');
  ['canvas', 'script', '[id]', '[class]'].forEach(sel => {
    const els = document.querySelectorAll(sel);
    if (els.length) console.log('[MOD] ' + sel + ':', els.length + ' found');
  });
  const scripts = Array.from(document.scripts).map(s => s.src || 'inline');
  console.log('[MOD] Scripts:', scripts);
})();`,

    storage: `// SAVE EDITOR - dump localStorage
(function() {
  console.log('[MOD] localStorage keys:', Object.keys(localStorage).length);
  Object.keys(localStorage).forEach(k => {
    let v = localStorage.getItem(k);
    try { v = JSON.stringify(JSON.parse(v), null, 2); } catch(e) {}
    console.log('[MOD]', k, '=', v);
  });
})();`
  };

  function logMod(msg, type = '') {
    const line = document.createElement('div');
    line.className = type;
    line.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
    [el.modLogInline, el.modLog].forEach(logEl => {
      logEl.appendChild(line.cloneNode(true));
      logEl.scrollTop = logEl.scrollHeight;
    });
  }

  function injectModCode(code) {
    try {
      const cw = el.gameFrame.contentWindow;
      if (!cw) throw new Error('No game loaded');
      cw.eval(code);
      logMod('Mod executed successfully', 'log-ok');
    } catch(e) {
      logMod('Error: ' + e.message, 'log-err');
    }
  }

  function initModPanel() {
    el.modBtnToggle.addEventListener('click', () => {
      const vis = el.modPanel.classList.toggle('visible');
      el.modBtnToggle.classList.toggle('active', vis);
    });

    // tabs
    document.querySelectorAll('#modPanel .mod-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('#modPanel .mod-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.mod-section').forEach(s => s.classList.remove('visible'));
        tab.classList.add('active');
        document.getElementById(`modSection-${tab.dataset.tab}`).classList.add('visible');
      });
    });

    document.getElementById('runMod').addEventListener('click', () => {
      injectModCode(el.modEditor.value);
    });

    document.getElementById('injectModPersist').addEventListener('click', () => {
      state.persistMod     = !state.persistMod;
      state.persistModCode = el.modEditor.value;
      const btn = document.getElementById('injectModPersist');
      btn.style.borderColor = state.persistMod ? 'var(--text-1)' : '';
      btn.style.color       = state.persistMod ? 'var(--text-0)' : '';
      logMod(`Persist mod ${state.persistMod ? 'ENABLED' : 'DISABLED'}`);
    });

    document.getElementById('clearMods').addEventListener('click', () => {
      state.persistMod = false;
      state.persistModCode = '';
      el.modEditor.value = '';
      logMod('Cleared');
    });

    document.getElementById('clearModLog').addEventListener('click', () => {
      el.modLog.innerHTML = '';
      el.modLogInline.innerHTML = '';
    });

    // templates
    document.querySelectorAll('.mod-template-item').forEach(item => {
      item.addEventListener('click', () => {
        el.modEditor.value = MOD_TEMPLATES[item.dataset.template] || '// template not found';
        // Switch to editor tab
        document.querySelectorAll('#modPanel .mod-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.mod-section').forEach(s => s.classList.remove('visible'));
        document.querySelector('#modPanel .mod-tab[data-tab="editor"]').classList.add('active');
        document.getElementById('modSection-editor').classList.add('visible');
        logMod(`Template loaded: ${item.querySelector('h4').textContent}`);
      });
    });

    makeDraggable(el.modPanel, document.getElementById('modPanelHeader'));
    document.getElementById('modPanelClose').addEventListener('click', () => {
      el.modPanel.classList.remove('visible');
      el.modBtnToggle.classList.remove('active');
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // CONSOLE BRIDGE — relay iframe console to DevTools
  // ─────────────────────────────────────────────────────────────────────────────
  function injectConsoleBridge() {
    try {
      const cw = el.gameFrame.contentWindow;
      if (!cw) return;
      ['log', 'warn', 'error', 'info'].forEach(method => {
        const orig = cw.console[method].bind(cw.console);
        cw.console[method] = function(...args) {
          orig(...args);
          const msg = args.map(a => {
            try { return typeof a === 'object' ? JSON.stringify(a) : String(a); } catch(e) { return String(a); }
          }).join(' ');
          appendDevLog(msg, method === 'warn' ? 'log-warn' : method === 'error' ? 'log-err' : method === 'info' ? 'log-info' : 'log-line');
        };
      });
    } catch(e) {}
  }

  function appendDevLog(msg, cls = 'log-line') {
    const line = document.createElement('div');
    line.className = cls;
    line.textContent = `> ${msg}`;
    el.devConsoleOutput.appendChild(line);
    el.devConsoleOutput.scrollTop = el.devConsoleOutput.scrollHeight;
    // cap at 500 lines
    while (el.devConsoleOutput.children.length > 500) {
      el.devConsoleOutput.removeChild(el.devConsoleOutput.firstChild);
    }
  }

  function initDevPanel() {
    el.devBtnToggle.addEventListener('click', () => {
      const vis = el.devPanel.classList.toggle('visible');
      el.devBtnToggle.classList.toggle('active', vis);
    });

    // tabs
    document.querySelectorAll('.devtools-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.devtools-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.dev-section').forEach(s => s.classList.remove('visible'));
        tab.classList.add('active');
        document.getElementById(`devSection-${tab.dataset.tab}`).classList.add('visible');
      });
    });

    // console execute
    function runDevConsole() {
      const code = el.devConsoleInput.value.trim();
      if (!code) return;
      appendDevLog(code, 'log-info');
      el.devConsoleInput.value = '';
      try {
        const cw = el.gameFrame.contentWindow;
        if (!cw) throw new Error('No game loaded');
        const result = cw.eval(code);
        if (result !== undefined) appendDevLog(String(result), 'log-line');
      } catch(e) {
        appendDevLog(e.message, 'log-err');
      }
    }

    document.getElementById('devConsoleRun').addEventListener('click', runDevConsole);
    el.devConsoleInput.addEventListener('keydown', e => { if (e.key === 'Enter') runDevConsole(); });
    document.getElementById('devConsoleClear').addEventListener('click', () => { el.devConsoleOutput.innerHTML = ''; });

    // storage tab
    document.getElementById('devStorageRefresh').addEventListener('click', refreshStorage);
    document.getElementById('devStorageClear').addEventListener('click', () => {
      try {
        el.gameFrame.contentWindow.localStorage.clear();
        refreshStorage();
        appendDevLog('localStorage cleared', 'log-ok');
      } catch(e) { appendDevLog(e.message, 'log-err'); }
    });

    makeDraggable(el.devPanel, document.getElementById('devPanelHeader'));
    document.getElementById('devPanelClose').addEventListener('click', () => {
      el.devPanel.classList.remove('visible');
      el.devBtnToggle.classList.remove('active');
    });
  }

  function refreshStorage() {
    el.devStorageOutput.innerHTML = '';
    try {
      const ls = el.gameFrame.contentWindow.localStorage;
      if (!ls || Object.keys(ls).length === 0) {
        el.devStorageOutput.textContent = 'localStorage is empty';
        return;
      }
      Object.keys(ls).forEach(k => {
        const line = document.createElement('div');
        line.className = 'log-line';
        line.textContent = `${k}: ${ls.getItem(k)}`;
        el.devStorageOutput.appendChild(line);
      });
    } catch(e) {
      el.devStorageOutput.textContent = 'Cannot access storage: ' + e.message;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // DRAGGABLE PANELS
  // ─────────────────────────────────────────────────────────────────────────────
  function makeDraggable(panel, handle) {
    let dragging = false, ox = 0, oy = 0;
    handle.addEventListener('mousedown', e => {
      dragging = true;
      const rect = panel.getBoundingClientRect();
      ox = e.clientX - rect.left;
      oy = e.clientY - rect.top;
      panel.style.right = 'auto';
      panel.style.bottom = 'auto';
      e.preventDefault();
    });
    document.addEventListener('mousemove', e => {
      if (!dragging) return;
      panel.style.left = `${e.clientX - ox}px`;
      panel.style.top  = `${e.clientY - oy}px`;
    });
    document.addEventListener('mouseup', () => { dragging = false; });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // GLOBAL CLICK — close fps panel on outside click
  // ─────────────────────────────────────────────────────────────────────────────
  document.addEventListener('click', e => {
    if (!el.fpsPanel.contains(e.target) && e.target !== el.fpsBtnToggle) {
      el.fpsPanel.classList.remove('visible');
      el.fpsBtnToggle.classList.remove('active');
    }
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // EVENT LISTENERS
  // ─────────────────────────────────────────────────────────────────────────────
  function initEventListeners() {
    el.gameSearch.addEventListener('input', e => searchGames(e.target.value));
    el.fullscreenBtn.addEventListener('click', toggleFullscreen);
    el.refreshBtn.addEventListener('click', refreshGame);
    el.closeBtn.addEventListener('click', closeGame);

    document.getElementById('refreshAllGames')?.addEventListener('click', async () => {
      if (!confirm('Reload game list from GamesIndex.js?')) return;
      state.games = [];
      await loadIndex();
    });

    document.addEventListener('keydown', e => {
      if (e.key === 'F5') { e.preventDefault(); refreshGame(); }
      if (e.key === 'Escape' && document.fullscreenElement) document.exitFullscreen();
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // INIT
  // ─────────────────────────────────────────────────────────────────────────────
  async function init() {
    initEventListeners();
    initFpsPanel();
    initShaderPanel();
    initModPanel();
    initDevPanel();
    requestAnimationFrame(fpsLoop);
    await loadIndex();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
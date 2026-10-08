// Inicializador del cliente: conecta lobby, red, renderizado, controles y HUD.

import { Renderer, createGlassCharacter, setCharacterLabel, setCharacterWeapon, updateCharacter } from './js/renderer.js';
import { buildMap } from './js/map.js';
import { Network } from './js/network.js';
import { LocalPlayer } from './js/player.js';
import { Weapons } from './js/weapons.js';
import { HUD } from './js/hud.js';
import { Lobby } from './js/lobby.js';

const WEAPON_FOV = { sniper: 25, smg: null, knife: null };

// ---------------------------------------------------------------- referencias
const hud = new HUD();

if (hud.isMobile()) {
  document.getElementById('mobile-warning').classList.remove('hidden');
  document.getElementById('lobby').classList.add('hidden');
} else {
  boot();
}

function boot() {
  const canvas = document.getElementById('game-canvas');
  const renderer = new Renderer(canvas);
  const player = new LocalPlayer(renderer.camera, canvas);
  const weapons = new Weapons(renderer.camera, renderer.gameScene);

  const characters = new Map();
  weapons.characters = characters;

  // ------------------------------------------------------- escena de preview
  const previewChar = createGlassCharacter('#4fc3f7');
  previewChar.label.visible = false;
  previewChar.hpBar.visible = false;
  previewChar.hpBg.visible = false;
  previewChar.group.position.y = 0.18;
  renderer.previewScene.add(previewChar.group);

  function applyPreviewColor(color) {
    previewChar.material.color.set(color);
    previewChar.material.emissive.set(color);
    previewChar.material.attenuationColor.set(color);
  }

  // -------------------------------------------------------------- variables
  const V = {
    joined: false,
    selfId: null,
    constants: null,
    state: 'waiting',
    round: 0,
    weapon: null,
    timeLeft: 0,
    scoreboardVisible: false,
    bannerRoundTimeout: null,
  };

  // ------------------------------------------------------------------ lobby
  const lobby = new Lobby({
    onPlay: (nick, color) => network.join(nick, color),
    onColorChange: applyPreviewColor,
  });

  // ------------------------------------------------------------------- red
  const handlers = {
    onConnect() {
      lobby.setStatus('');
    },
    onDisconnect() {
      V.joined = false;
      player.playing = false;
      hud.fatal('Se perdió la conexión con el servidor. Recarga la página.');
    },
    onInit(data) {
      V.selfId = data.selfId;
      window.__selfId = data.selfId;
      V.constants = data.constants;
      V.joined = true;
      V.round = data.round;
      V.weapon = data.weapon;
      V.state = data.state;
      V.timeLeft = Math.max(0, data.endsAt - Date.now());

      network.clear();
      player.network = network;
      player.reset(data.constants);
      player.playing = true;

      const { solids } = buildMap(renderer.gameScene, data.map);
      weapons.setSolids(solids);
      renderer.gameScene.add(renderer.camera);

      characters.clear();
      for (const p of data.players) {
        if (p.id !== data.selfId) createCharacter(p);
      }

      setWeapon(data.weapon);
      lobby.hide();
      hud.show();
      hud.setRound(data.round, data.weapon);
      renderer.setMode('game');
      refreshBanner();
      player.requestLock();
    },
    onUpdate(snap) {
      V.state = snap.state;
      V.round = snap.round;
      V.weapon = snap.weapon;
      V.timeLeft = snap.timeLeft;

      const self = snap.players.find((p) => p.id === V.selfId);
      if (self) {
        hud.setHealth(self.hp);
        hud.setAmmo(self.mag, snap.weapon);
        hud.setReloading(self.reloading);
        hud.setRespawn(self.alive ? null : self.respawnIn);
      }

      for (const p of snap.players) {
        if (p.id === V.selfId) continue;
        let char = characters.get(p.id);
        if (!char) char = createCharacter(p);
        char.snapshot = p;
      }

      if (V.scoreboardVisible) {
        hud.showScoreboard(true, snap.players, V.selfId, snap.round);
      }
    },
    onShot(evt) {
      if (evt.id === V.selfId) weapons.onOwnShot();
      weapons.handleShot(evt);
    },
    onHit(e) {
      if (e.targetId === V.selfId) {
        hud.damage();
        const attacker = characters.get(e.byId);
        if (attacker && player.renderPos) {
          const dx = attacker.group.position.x - player.renderPos.x;
          const dz = attacker.group.position.z - player.renderPos.z;
          let angleDeg = Math.atan2(dx, dz) * (180 / Math.PI);
          let relativeAngle = angleDeg - (player.yaw * (180 / Math.PI));
          hud.showDirectionalDamage(relativeAngle);
        }
      }
      if (e.byId === V.selfId) {
        hud.hitmarker();
        weapons.onHit(false);
      }
    },
    onKill(e) {
      hud.killfeed(e);
      if (e.killerId === V.selfId) weapons.onHit(true);
      if (e.victimId === V.selfId) {
        weapons.audio.death();
        player.shooting = false;
      }
    },
    onRespawn(e) {
      if (e.id === V.selfId) {
        hud.setRespawn(null);
        hud.setHealth(100);
      }
      const char = characters.get(e.id);
      if (char) char.deadT = 0;
    },
    onJoined(p) {
      if (p.id !== V.selfId) createCharacter(p);
    },
    onLeft(e) {
      removeCharacter(e.id);
    },
    onRoundStart(e) {
      V.round = e.round;
      V.weapon = e.weapon;
      hud.hideRoundEnd();
      hud.hideMatchEnd();
      hud.setRound(e.round, e.weapon);
      hud.setAmmo(e.weapon === 'knife' ? -1 : 0, e.weapon);
      setWeapon(e.weapon);
      player.zooming = false;
      weapons.setZoom(false);
      hud.setZoom(false);

      hud.setBanner(`RONDA ${e.round} / 3<small>${e.weaponName}</small>`);
      clearTimeout(V.bannerRoundTimeout);
      V.bannerRoundTimeout = setTimeout(() => refreshBanner(), 2500);
    },
    onRoundEnd(e) {
      hud.showRoundEnd({ round: e.round, top3: e.top3 });
    },
    onMatchEnd(e) {
      hud.hideRoundEnd();
      hud.showMatchEnd(e);
    },
    onState(e) {
      V.state = e.state;
      V.timeLeft = Math.max(0, e.endsAt - Date.now());
      refreshBanner();
    },
    onReload() {
      weapons.onReload();
    },
    onSystem(msg) {
      hud.systemMsg(msg);
    },
    onError(e) {
      if (!V.joined) {
        lobby.setStatus(e.message || 'Error al entrar');
        lobby.setBusy(false);
      } else {
        hud.fatal(e.message || 'Error del servidor');
      }
    },
  };

  const network = new Network(handlers);
  network.connect();

  // --------------------------------------------------------------- utilidades
  function createCharacter(p) {
    const pos = p.pos || p;               // player:joined envía { pos: {...} }
    const char = createGlassCharacter(p.color);
    setCharacterLabel(char, p.nick, '#ffffff');
    setCharacterWeapon(char, V.weapon);
    char.group.position.set(pos.x || 0, pos.y || 0, pos.z || 0);
    renderer.gameScene.add(char.group);
    characters.set(p.id, char);
    return char;
  }

  function removeCharacter(id) {
    const char = characters.get(id);
    if (!char) return;
    renderer.gameScene.remove(char.group);
    char.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose();
    });
    characters.delete(id);
  }

  function setWeapon(weaponId) {
    V.weapon = weaponId;
    weapons.setWeapon(weaponId, WEAPON_FOV[weaponId] ?? null);
    for (const char of characters.values()) setCharacterWeapon(char, weaponId);
  }

  function refreshBanner() {
    if (!V.joined) return;
    if (!player.locked && player.playing) {
      hud.setBanner('CLIC PARA JUGAR<small>ESC libera el ratón</small>');
      return;
    }
    clearTimeout(V.bannerRoundTimeout);
    if (V.state === 'countdown') {
      hud.setBanner('LA PARTIDA EMPIEZA EN<small>…</small>');
    } else if (V.state === 'waiting') {
      hud.setBanner('ESPERANDO JUGADORES<small>la ronda empieza con el primero</small>');
    } else {
      hud.setBanner(null);
    }
  }

  // ------------------------------------------------------------- interacción
  player.onScoreboard = (show) => {
    V.scoreboardVisible = show;
    const snap = network.latest();
    hud.showScoreboard(show, snap ? snap.players : [], V.selfId, V.round);
  };
  
  player.onLockChange = (locked) => {
    refreshBanner();
    if (!locked && player.playing && V.joined && V.state !== 'waiting') {
      hud.toggleSettings(true);
    } else {
      hud.toggleSettings(false);
    }
  };

  hud.el.sensSlider.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    player.sensitivity = val;
    hud.el.sensValDisplay.textContent = val.toFixed(4);
  });

  hud.el.resumeBtn.addEventListener('click', () => {
    player.requestLock();
  });

  player.onZoomChange = (active) => {
    weapons.setZoom(active);
    hud.setZoom(weapons.zoomed);
  };

  // entradas al servidor a 30 Hz
  setInterval(() => {
    if (V.joined && player.playing) network.sendInput(player.buildInput());
  }, 33);

  // ------------------------------------------------------------ bucle visual
  renderer.onFrame = (dt) => {
    if (renderer.mode === 'preview') {
      previewChar.group.rotation.y += dt * 0.7;
      return;
    }
    if (!V.joined) return;

    V.timeLeft -= dt * 1000;
    hud.setTime(Math.max(0, V.timeLeft), V.state);
    hud.tickCountdowns(Math.max(0, V.timeLeft));

    player.update(dt);
    weapons.update(dt, player);
    updateRemotes(dt);
  };

  function updateRemotes(dt) {
    const pair = network.snapshotsAt(100);
    const latest = network.latest();
    if (!latest) return;

    for (const [id, char] of characters) {
      let p;
      if (pair) {
        const a = pair.a.players.find((x) => x.id === id);
        const b = pair.b.players.find((x) => x.id === id);
        if (a && b) p = blend(a, b, pair.alpha);
        else p = b || a;
      } else {
        p = latest.players.find((x) => x.id === id);
      }
      if (!p) continue;
      updateCharacter(char, p, dt);
    }
  }

  function blend(a, b, t) {
    const dy = shortestAngle(a.yaw, b.yaw);
    return {
      ...b,
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t,
      z: a.z + (b.z - a.z) * t,
      yaw: a.yaw + dy * t,
    };
  }

  function shortestAngle(from, to) {
    let d = (to - from) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return d;
  }

  renderer.start();

  // gancho de diagnóstico para pruebas E2E
  window.__debug = { V, characters, renderer, network, player, weapons };
}

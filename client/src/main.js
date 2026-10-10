// Inicializador del cliente: conecta lobby, red, renderizado, controles y HUD.

import { Renderer, createGlassCharacter, setCharacterLabel, setCharacterWeapon, updateCharacter } from './js/renderer.js';
import { buildMap } from './js/map.js';
import { Network } from './js/network.js';
import { LocalPlayer } from './js/player.js';
import { Weapons } from './js/weapons.js';
import { HUD } from './js/hud.js';
import { Lobby } from './js/lobby.js';

const WEAPON_FOV = { sniper: 25, smg: null, knife: null };
const WEAPON_SPEED = { sniper: 0.75, smg: 1.0, knife: 1.15 };

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
    deadline: 0,            // fecha límite local para contar de forma estable
    waitForReady: false,    // la sala espera a que todos marquen listo
    selfReady: false,
    inputAcc: 0,
    scoreboardVisible: false,
    bannerRoundTimeout: null,
  };

  // sincroniza el contador con la fecha límite enviada por el servidor
  function syncDeadline(endsAt) {
    const t = Number(endsAt) || 0;
    V.timeLeft = Math.max(0, t - Date.now());
    V.deadline = performance.now() + V.timeLeft;
  }

  // ------------------------------------------------------------------ lobby
  const lobby = new Lobby({
    onPlay: (nick, color) => network.join(nick, color),
    onColorChange: applyPreviewColor,
    onJoinRoom: (roomId, nick, color, password) => network.joinRoom(roomId, nick, color, password),
    onCreateRoom: (config, nick, color) => network.createRoom({ config, nick, color }),
  });

  lobby.onRefreshRooms = () => {
    network.listRooms();
  };

  // ------------------------------------------------------------------- red
  const handlers = {
    onConnect() {
      lobby.setStatus('');
      network.listRooms();
    },
    onRoomsList(list) {
      lobby.setRooms(list);
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
      V.waitForReady = !!(data.config && data.config.waitForReady);
      V.selfReady = false;
      syncDeadline(data.endsAt);

      network.clear();
      player.network = network;
      player.reset(data.constants);
      player.map = data.map;
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
      hud.setRound(data.round, data.weapon, data.totalRounds);
      renderer.setMode('game');
      refreshBanner();
      player.requestLock();
    },
    onUpdate(snap) {
      V.state = snap.state;
      V.round = snap.round;
      V.weapon = snap.weapon;

      // El contador se deriva de la fecha límite local (marcada en los eventos
      // game:state / round:start / init). No se pisa con snap.timeLeft para
      // evitar que el timer "se vuelva loco" saltando entre segundos.
      if (!V.deadline && snap.timeLeft > 0) {
        syncDeadline(Date.now() + snap.timeLeft);
      }

      const self = snap.players.find((p) => p.id === V.selfId);
      if (self) {
        hud.setHealth(self.hp);
        hud.setAmmo(self.mag, snap.weapon);
        hud.setReloading(self.reloading);
        hud.setRespawn(self.alive ? null : self.respawnIn);
        if (self.ready !== V.selfReady) {
          V.selfReady = !!self.ready;
          refreshBanner();
        }
      }

      for (const p of snap.players) {
        if (p.id === V.selfId) continue;
        let char = characters.get(p.id);
        if (!char) char = createCharacter(p);
        char.snapshot = p;
      }

      // mantener al día el contador de "listos" mientras se espera
      if (V.waitForReady && V.state === 'waiting') refreshBanner();

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
      syncDeadline(e.endsAt);
      hud.hideRoundEnd();
      hud.hideMatchEnd();
      hud.setRound(e.round, e.weapon, e.totalRounds);
      hud.setAmmo(e.weapon === 'knife' ? -1 : 0, e.weapon);
      setWeapon(e.weapon);
      player.zooming = false;
      weapons.setZoom(false);
      hud.setZoom(false);

      hud.setBanner(`RONDA ${e.round} / ${e.totalRounds}<small>${e.weaponName}</small>`);
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
      syncDeadline(e.endsAt);
      refreshBanner();
    },
    onReload() {
      weapons.onReload();
    },
    onSystem(msg) {
      hud.systemMsg(msg);
    },
    onLobbyBack() {
      leaveToLobby();
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

  function clearGameScene() {
    for (const obj of [...renderer.gameScene.children]) {
      if (obj === renderer.camera) continue;
      renderer.gameScene.remove(obj);
      obj.traverse?.((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
          else o.material.dispose();
        }
      });
    }
  }

  function leaveToLobby() {
    V.joined = false;
    V.state = 'waiting';
    V.selfId = null;
    player.playing = false;
    player.releaseLock();
    player.network = null;
    player.reset({ player: { eyeHeight: 1.62, crouchEyeHeight: 1.0 } }); // solo para no romper update()
    hud.toggleSettings(false);
    hud.hide();
    hud.hideRoundEnd();
    hud.hideMatchEnd();

    weapons.setWeapon(null);
    weapons.solids = [];
    weapons.effects = [];
    weapons.setZoom(false);
    hud.setZoom(false);

    for (const id of [...characters.keys()]) removeCharacter(id);
    clearGameScene();
    network.clear();

    lobby.show();
    renderer.setMode('preview');
  }

  function setWeapon(weaponId) {
    V.weapon = weaponId;
    weapons.setWeapon(weaponId, WEAPON_FOV[weaponId] ?? null);
    player.weaponSpeedMult = WEAPON_SPEED[weaponId] ?? 1;
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
      if (V.waitForReady) {
        const snap = network.latest();
        const players = snap ? snap.players : [];
        const humans = players.filter((p) => !p.bot);
        const ready = humans.filter((p) => p.ready).length;
        const fold = V.selfReady ? 'Esperando al resto…' : 'Pulsa F para estar listo';
        hud.setBanner(`ESPERANDO JUGADORES<small>${ready}/${humans.length} listos · ${fold}</small>`);
      } else {
        hud.setBanner('ESPERANDO JUGADORES<small>la ronda empieza con el primero</small>');
      }
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
    if (!locked && player.playing && V.joined) {
      hud.toggleSettings(true);
    } else {
      hud.toggleSettings(false);
    }
  };

  hud.el.sensSlider.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    player.sensitivity = val;
    hud.el.sensValDisplay.textContent = val.toFixed(4);
    localStorage.setItem('fps.sens', String(val));
  });

  hud.el.invertYInput.addEventListener('change', (e) => {
    player.invertY = e.target.checked;
    localStorage.setItem('fps.invertY', e.target.checked ? '1' : '0');
  });

  hud.el.volumeSlider.addEventListener('input', (e) => {
    const val = parseInt(e.target.value, 10);
    weapons.audio.setVolume(val / 100);
    hud.el.volumeValDisplay.textContent = val + '%';
    localStorage.setItem('fps.volume', String(val));
  });

  (function loadSettings() {
    const sens = parseFloat(localStorage.getItem('fps.sens'));
    if (Number.isFinite(sens)) {
      player.sensitivity = sens;
      hud.el.sensSlider.value = String(sens);
      hud.el.sensValDisplay.textContent = sens.toFixed(4);
    }
    const iv = localStorage.getItem('fps.invertY') === '1';
    player.invertY = iv;
    hud.el.invertYInput.checked = iv;
    const vol = parseInt(localStorage.getItem('fps.volume'), 10);
    if (Number.isFinite(vol)) {
      weapons.audio.setVolume(vol / 100);
      hud.el.volumeSlider.value = String(vol);
      hud.el.volumeValDisplay.textContent = vol + '%';
    }
  })();

  hud.el.resumeBtn.addEventListener('click', () => {
    player.requestLock();
  });

  hud.el.exitBtn.addEventListener('click', () => {
    network.leaveRoom();
  });

  player.onZoomChange = (active) => {
    weapons.setZoom(active);
    hud.setZoom(weapons.zoomed);
  };

  // ------------------------------------------------------------ bucle visual
  renderer.onFrame = (dt) => {
    if (renderer.mode === 'preview') {
      previewChar.group.rotation.y += dt * 0.7;
      return;
    }
    if (!V.joined) return;

    // cuenta atrás derivada de la fecha límite (estable, sin parpadeos)
    V.timeLeft = Math.max(0, V.deadline - performance.now());
    hud.setTime(V.timeLeft, V.state);
    hud.tickCountdowns(V.timeLeft);

    // entradas al servidor a 30 Hz con acumulador: cadencia regular aunque la
    // tasa de frames varíe (antes con setInterval el envío se desincronizaba
    // y contribuía a los tirones de movimiento)
    V.inputAcc += dt;
    if (V.inputAcc >= 1 / 30) {
      V.inputAcc -= 1 / 30;
      if (player.playing) network.sendInput(player.buildInput());
    }

    // el servidor solo procesa movimiento durante la ronda
    player.movementAllowed = V.state === 'round';
    player.update(dt);
    weapons.update(dt, player);
    updateRemotes(dt);
  };

  // en salas con espera de jugadores: pulsa F para marcar listo
  document.addEventListener('keydown', (e) => {
    if (e.code === 'KeyF' && V.joined && player.playing &&
        V.waitForReady && V.state === 'waiting' && !V.selfReady) {
      V.selfReady = true;
      network.setReady(true);
      refreshBanner();
    }
  });

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

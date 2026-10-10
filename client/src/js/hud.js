// HUD: vida, munición, temporizador, killfeed, marcador y pantallas.

const $ = (id) => document.getElementById(id);

function fmt(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

const WEAPON_LABELS = {
  sniper: 'FRANCOTIRADOR',
  smg: 'SUBFUSIL',
  knife: 'CUCHILLO',
};

export class HUD {
  constructor() {
    this.el = {
      hud: $('hud'),
      roundNum: $('round-num'),
      roundTotal: $('round-total'),
      weaponName: $('weapon-name'),
      timer: $('timer'),
      banner: $('state-banner'),
      killfeed: $('killfeed'),
      hitmarker: $('hitmarker'),
      crosshair: $('crosshair'),
      healthVal: $('health-val'),
      healthBar: $('health-bar'),
      ammoVal: $('ammo-val'),
      ammoLabel: $('ammo-label'),
      reloadHint: $('reload-hint'),
      vignette: $('damage-vignette'),
      respawn: $('respawn-overlay'),
      respawnCount: $('respawn-count'),
      zoom: $('zoom-overlay'),
      scoreboard: $('scoreboard'),
      sbBody: $('sb-body'),
      sbTitle: $('sb-title'),
      sysMsgs: $('system-msgs'),
      roundScreen: $('round-screen'),
      roundTitle: $('round-screen-title'),
      roundTop3: $('round-top3'),
      roundNextCount: $('round-next-count'),
      matchScreen: $('match-screen'),
      podium: $('podium'),
      matchRest: $('match-rest'),
      matchSaved: $('match-saved'),
      matchNextCount: $('match-next-count'),
      lobby: $('lobby'),
      fatalError: $('fatal-error'),
      fatalErrorMsg: $('fatal-error-msg'),
      mobileWarning: $('mobile-warning'),
      damageIndicators: $('damage-indicators'),
      settingsScreen: $('settings-screen'),
      sensSlider: $('sens-slider'),
      sensValDisplay: $('sens-val-display'),
      invertYInput: $('invert-y-input'),
      volumeSlider: $('volume-slider'),
      volumeValDisplay: $('volume-val-display'),
      resumeBtn: $('resume-btn'),
      exitBtn: $('exit-btn'),
    };
    this.hitTimer = null;
    this.dmgTimer = null;
    this.settingsOpen = false;
    this.countdownEndsAt = 0;

    // Ajustes
    this.el.resumeBtn.addEventListener('click', () => this.toggleSettings(false));
  }

  toggleSettings(open) {
    this.settingsOpen = open;
    if (open) this.el.settingsScreen.classList.remove('hidden');
    else this.el.settingsScreen.classList.add('hidden');
  }

  showDirectionalDamage(angleDeg) {
    const arc = document.createElement('div');
    arc.className = 'dmg-arc';
    arc.style.transform = `rotate(${angleDeg}deg)`;
    this.el.damageIndicators.appendChild(arc);
    
    // Animar
    requestAnimationFrame(() => {
      arc.style.opacity = '1';
      setTimeout(() => {
        arc.style.opacity = '0';
        setTimeout(() => arc.remove(), 500);
      }, 1000);
    });
  }

  show() { this.el.hud.classList.remove('hidden'); }
  hide() { this.el.hud.classList.add('hidden'); }

  setRound(n, weaponId, totalRounds) {
    this.el.roundNum.textContent = n || '–';
    this.el.roundTotal.textContent = totalRounds || '3';
    this.el.weaponName.textContent = WEAPON_LABELS[weaponId] || '–';
  }

  setTime(ms, state) {
    this.el.timer.textContent = fmt(ms);
    this.el.timer.classList.toggle('low', state === 'round' && ms < 30000);
  }

  setBanner(html) {
    if (!html) {
      this.el.banner.classList.add('hidden');
      return;
    }
    this.el.banner.innerHTML = html;
    this.el.banner.classList.remove('hidden');
  }

  setHealth(hp) {
    this.el.healthVal.textContent = Math.max(0, hp);
    const frac = Math.max(0, Math.min(1, hp / 100));
    this.el.healthBar.style.width = `${frac * 100}%`;
    this.el.healthBar.classList.toggle('low', frac <= 0.35);
  }

  setAmmo(mag, weaponId) {
    if (weaponId === 'knife') {
      this.el.ammoVal.textContent = '∞';
      this.el.ammoLabel.textContent = 'CUCHILLO';
      return;
    }
    this.el.ammoVal.textContent = mag < 0 ? '∞' : mag;
    this.el.ammoLabel.textContent = WEAPON_LABELS[weaponId] || '';
  }

  setReloading(active) {
    this.el.reloadHint.classList.toggle('hidden', !active);
  }

  setZoom(active) {
    this.el.zoom.classList.toggle('hidden', !active);
    this.el.crosshair.classList.toggle('zoomed', active);
  }

  hitmarker() {
    this.el.hitmarker.classList.remove('hidden');
    clearTimeout(this.hitTimer);
    this.hitTimer = setTimeout(() => this.el.hitmarker.classList.add('hidden'), 130);
  }

  damage() {
    this.el.vignette.classList.add('show');
    clearTimeout(this.dmgTimer);
    this.dmgTimer = setTimeout(() => this.el.vignette.classList.remove('show'), 240);
  }

  setRespawn(ms) {
    if (ms == null) {
      this.el.respawn.classList.add('hidden');
      return;
    }
    this.el.respawn.classList.remove('hidden');
    this.el.respawnCount.textContent = Math.max(0, Math.ceil(ms / 1000));
  }

  killfeed({ killerNick, victimNick, weapon }) {
    const div = document.createElement('div');
    div.className = 'kf';
    div.innerHTML = `<span class="k">${esc(killerNick)}</span>` +
      `<span class="w">[${WEAPON_LABELS[weapon] || weapon}]</span>` +
      `<span class="v">${esc(victimNick)}</span>`;
    this.el.killfeed.appendChild(div);
    while (this.el.killfeed.children.length > 5) {
      this.el.killfeed.removeChild(this.el.killfeed.firstChild);
    }
    setTimeout(() => div.remove(), 6000);
  }

  systemMsg(text) {
    const div = document.createElement('div');
    div.className = 'sys-msg';
    div.textContent = text;
    this.el.sysMsgs.appendChild(div);
    while (this.el.sysMsgs.children.length > 4) {
      this.el.sysMsgs.removeChild(this.el.sysMsgs.firstChild);
    }
    setTimeout(() => div.remove(), 7000);
  }

  showScoreboard(show, players, selfId, round) {
    this.el.scoreboard.classList.toggle('hidden', !show);
    if (!show || !players) return;
    this.el.sbTitle.textContent = `MARCADOR · RONDA ${round}`;

    const sorted = [...players].sort(
      (a, b) => b.kills - a.kills || a.deaths - b.deaths,
    );
    this.el.sbBody.innerHTML = sorted.map((p, i) => `
      <tr class="${p.id === selfId ? 'me' : ''}">
        <td class="pos">${i + 1}</td>
        <td>${esc(p.nick)}</td>
        <td>${p.kills}</td>
        <td>${p.deaths}</td>
        <td>${p.roundKills}</td>
      </tr>`).join('');
  }

  showRoundEnd({ round, top3, endsAt }) {
    this.el.roundTitle.textContent = `RONDA ${round} · TERMINADA`;
    this.el.roundTop3.innerHTML = top3.map((s, i) => `
      <li>
        <span class="place">${i + 1}</span>
        <span class="dot" style="background:${s.color}"></span>
        <span>${esc(s.nick)}</span>
        <span class="kills">${s.kills} kills</span>
        <span class="deaths">${s.deaths} muertes</span>
      </li>`).join('');
    this.countdownEndsAt = endsAt || 0;
    this.el.roundScreen.classList.remove('hidden');
  }

  hideRoundEnd() { this.el.roundScreen.classList.add('hidden'); }

  showMatchEnd({ podium, standings, saved, endsAt }) {
    const medals = ['🥇', '🥈', '🥉'];
    const cls = ['first', 'second', 'third'];
    const order = [podium[1], podium[0], podium[2]].filter(Boolean);
    this.el.podium.innerHTML = order.map((p) => {
      const i = p.rank - 1;
      return `
        <div class="col ${cls[i]}">
          <div class="medal">${medals[i]}</div>
          <div class="name">${esc(p.nick)}</div>
          <div class="stat">${p.kills} kills · ${p.deaths} muertes</div>
        </div>`;
    }).join('');

    const rest = standings.slice(3);
    this.el.matchRest.innerHTML = rest.map((s, i) => `
      <li>
        <span class="place">${i + 4}</span>
        <span class="dot" style="background:${s.color}"></span>
        <span>${esc(s.nick)}</span>
        <span class="kills">${s.kills} kills</span>
        <span class="deaths">${s.deaths} muertes</span>
      </li>`).join('');

    this.el.matchSaved.textContent = saved
      ? 'Resultado guardado en la tabla del torneo (MySQL).'
      : 'No se pudo guardar el resultado en la base de datos.';
    this.countdownEndsAt = endsAt || 0;
    this.el.matchScreen.classList.remove('hidden');
  }

  hideMatchEnd() { this.el.matchScreen.classList.add('hidden'); }

  tickCountdowns(timeLeftMs) {
    const secs = Math.max(0, Math.ceil(timeLeftMs / 1000));
    if (!this.el.roundScreen.classList.contains('hidden')) {
      this.el.roundNextCount.textContent = secs;
    }
    if (!this.el.matchScreen.classList.contains('hidden')) {
      this.el.matchNextCount.textContent = secs;
    }
  }

  fatal(msg) {
    this.el.fatalErrorMsg.textContent = msg;
    this.el.fatalError.classList.remove('hidden');
  }

  isMobile() {
    return (('ontouchstart' in window) && window.matchMedia('(max-width: 900px)').matches);
  }
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

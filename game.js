(() => {
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");

  const WORLD = 1600;
  const PLAYER_SPEED = 220;
  const BOT_SPEED = 145;
  const BULLET_SPEED = 700;

  const keys = {};
  const pointer = { x: 0, y: 0, down: false };
  let shotQueued = false;
  const cam = { x: 0, y: 0 };
  const view = { w: 800, h: 600 };

  let state = "play";
  let matchTime = 0;
  let player;
  let bots;
  let builds;
  let bullets;
  const storm = { x: WORLD / 2, y: WORLD / 2, r: 720 };

  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    view.w = canvas.clientWidth || window.innerWidth;
    view.h = canvas.clientHeight || window.innerHeight;
    canvas.width = Math.floor(view.w * dpr);
    canvas.height = Math.floor(view.h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function makePlayer(x, y) {
    return {
      id: 0,
      x,
      y,
      r: 16,
      hp: 100,
      speed: PLAYER_SPEED,
      cooldown: 0,
      alive: true,
      angle: 0,
      color: "#2ec4b6",
    };
  }

  function reset() {
    state = "play";
    matchTime = 0;
    storm.r = 720;
    player = makePlayer(WORLD / 2, WORLD / 2);
    const angles = [0.5, 2.1, 3.7, 5.3];
    const colors = ["#e07a5f", "#e09f3e", "#c44536", "#f2cc8f"];
    bots = angles.map((angle, i) => ({
      id: i + 1,
      x: WORLD / 2 + Math.cos(angle) * 460,
      y: WORLD / 2 + Math.sin(angle) * 460,
      r: 16,
      hp: 100,
      speed: BOT_SPEED,
      cooldown: 0.3 + i * 0.15,
      alive: true,
      angle: angle + Math.PI,
      wander: 0,
      wangle: angle,
      color: colors[i],
    }));
    builds = [
      [WORLD / 2 - 220, WORLD / 2 - 30],
      [WORLD / 2 + 150, WORLD / 2 - 180],
      [WORLD / 2 - 50, WORLD / 2 + 190],
      [WORLD / 2 + 230, WORLD / 2 + 70],
      [WORLD / 2 - 340, WORLD / 2 + 250],
      [WORLD / 2 + 360, WORLD / 2 - 280],
    ].map(([x, y]) => ({ x, y, w: 72, h: 72, type: "wall", dir: 0, fixed: true }));
    bullets = [];
    pointer.x = view.w / 2 + 80;
    pointer.y = view.h / 2;
  }

  function stormRadius() {
    const grace = 8;
    const duration = 70;
    if (matchTime < grace) return 720;
    const k = Math.min(1, (matchTime - grace) / duration);
    return 720 + (64 - 720) * k;
  }

  function stormDps() {
    const k = 1 - (storm.r - 64) / (720 - 64);
    return 10 + k * 30;
  }

  function clamp(e) {
    e.x = Math.max(e.r, Math.min(WORLD - e.r, e.x));
    e.y = Math.max(e.r, Math.min(WORLD - e.r, e.y));
  }

  function walls() {
    return builds.filter((b) => b.type === "wall");
  }

  function resolveWalls(e) {
    for (const w of walls()) {
      const nx = Math.max(w.x, Math.min(e.x, w.x + w.w));
      const ny = Math.max(w.y, Math.min(e.y, w.y + w.h));
      let dx = e.x - nx;
      let dy = e.y - ny;
      const d2 = dx * dx + dy * dy;
      if (d2 >= e.r * e.r) continue;
      if (d2 === 0) {
        const left = e.x - w.x;
        const right = w.x + w.w - e.x;
        const top = e.y - w.y;
        const bottom = w.y + w.h - e.y;
        const m = Math.min(left, right, top, bottom);
        if (m === left) e.x = w.x - e.r;
        else if (m === right) e.x = w.x + w.w + e.r;
        else if (m === top) e.y = w.y - e.r;
        else e.y = w.y + w.h + e.r;
        continue;
      }
      const d = Math.sqrt(d2);
      e.x += (dx / d) * (e.r - d);
      e.y += (dy / d) * (e.r - d);
    }
  }

  function separate(a, b) {
    if (!a.alive || !b.alive) return;
    let dx = b.x - a.x;
    let dy = b.y - a.y;
    const d = Math.hypot(dx, dy);
    const min = a.r + b.r;
    if (d <= 0 || d >= min) return;
    const push = (min - d) / 2;
    dx /= d;
    dy /= d;
    a.x -= dx * push;
    a.y -= dy * push;
    b.x += dx * push;
    b.y += dy * push;
  }

  function segHitsRect(x1, y1, x2, y2, r) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const p = [-dx, dx, -dy, dy];
    const q = [x1 - r.x, r.x + r.w - x1, y1 - r.y, r.y + r.h - y1];
    let t0 = 0;
    let t1 = 1;
    for (let i = 0; i < 4; i++) {
      if (p[i] === 0) {
        if (q[i] < 0) return false;
      } else {
        const t = q[i] / p[i];
        if (p[i] < 0) {
          if (t > t1) return false;
          if (t > t0) t0 = t;
        } else {
          if (t < t0) return false;
          if (t < t1) t1 = t;
        }
      }
    }
    return true;
  }

  function segHitsCircle(x1, y1, x2, y2, c, rad) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const fx = x1 - c.x;
    const fy = y1 - c.y;
    const a = dx * dx + dy * dy || 1;
    let t = -(fx * dx + fy * dy) / a;
    t = Math.max(0, Math.min(1, t));
    const px = x1 + dx * t - c.x;
    const py = y1 + dy * t - c.y;
    return px * px + py * py <= rad * rad;
  }

  function lineBlocked(x1, y1, x2, y2) {
    return walls().some((w) => segHitsRect(x1, y1, x2, y2, w));
  }

  function applyStorm(e, dt) {
    if (!e.alive) return;
    if (Math.hypot(e.x - storm.x, e.y - storm.y) > storm.r) {
      e.hp -= stormDps() * dt;
      if (e.hp <= 0) e.alive = false;
    }
  }

  function move(e, dx, dy, dt) {
    const len = Math.hypot(dx, dy) || 1;
    e.x += (dx / len) * e.speed * dt;
    e.y += (dy / len) * e.speed * dt;
    for (const b of builds) {
      if (b.type !== "ramp") continue;
      if (e.x < b.x || e.x > b.x + b.w || e.y < b.y || e.y > b.y + b.h) continue;
      e.x += Math.cos(b.dir) * 160 * dt;
      e.y += Math.sin(b.dir) * 160 * dt;
    }
    resolveWalls(e);
    clamp(e);
  }

  function shoot(owner) {
    if (!owner.alive || owner.cooldown > 0) return;
    owner.cooldown = owner === player ? 0.22 : 0.7;
    const a = owner.angle;
    const spawn = owner.r + 8;
    bullets.push({
      x: owner.x + Math.cos(a) * spawn,
      y: owner.y + Math.sin(a) * spawn,
      vx: Math.cos(a) * BULLET_SPEED,
      vy: Math.sin(a) * BULLET_SPEED,
      life: 0.85,
      dmg: owner === player ? 20 : 12,
      ownerId: owner.id,
    });
  }

  function rectsOverlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function place(type) {
    if (state !== "play") return;
    const a = player.angle;
    const px = player.x + Math.cos(a) * 58;
    const py = player.y + Math.sin(a) * 58;
    const g = 48;
    const piece = {
      x: Math.floor(px / g) * g,
      y: Math.floor(py / g) * g,
      w: g,
      h: g,
      type,
      dir: Math.round(a / (Math.PI / 2)) * (Math.PI / 2),
      fixed: false,
    };
    if (piece.x < 0 || piece.y < 0 || piece.x + g > WORLD || piece.y + g > WORLD) return;
    if (builds.some((b) => rectsOverlap(b, piece))) return;
    const actors = [player, ...bots.filter((b) => b.alive)];
    if (actors.some((e) => circleHitsRect(e, piece))) return;
    builds.push(piece);
  }

  function circleHitsRect(e, r) {
    const nx = Math.max(r.x, Math.min(e.x, r.x + r.w));
    const ny = Math.max(r.y, Math.min(e.y, r.y + r.h));
    const dx = e.x - nx;
    const dy = e.y - ny;
    return dx * dx + dy * dy < e.r * e.r;
  }

  function updateBot(bot, dt) {
    if (!bot.alive) return;
    bot.cooldown -= dt;
    const toStormX = storm.x - bot.x;
    const toStormY = storm.y - bot.y;
    const distStorm = Math.hypot(toStormX, toStormY);
    const toPX = player.x - bot.x;
    const toPY = player.y - bot.y;
    const distP = Math.hypot(toPX, toPY);
    let mx = 0;
    let my = 0;
    if (distStorm > storm.r - 36) {
      mx = toStormX;
      my = toStormY;
      bot.angle = Math.atan2(my, mx);
    } else if (player.alive && distP < 420 && !lineBlocked(bot.x, bot.y, player.x, player.y)) {
      bot.angle = Math.atan2(toPY, toPX) + (Math.random() - 0.5) * 0.12;
      if (distP > 150) {
        mx = toPX;
        my = toPY;
      } else if (distP < 100) {
        mx = -toPX;
        my = -toPY;
      }
      if (bot.cooldown <= 0) shoot(bot);
    } else {
      bot.wander -= dt;
      if (bot.wander <= 0) {
        bot.wander = 1 + Math.random() * 1.8;
        bot.wangle = player.alive && Math.random() < 0.65
          ? Math.atan2(toPY, toPX)
          : Math.random() * Math.PI * 2;
      }
      mx = Math.cos(bot.wangle);
      my = Math.sin(bot.wangle);
      bot.angle = bot.wangle;
    }
    move(bot, mx, my, dt);
    applyStorm(bot, dt);
  }

  function updateBullets(dt) {
    const actors = [player, ...bots];
    bullets = bullets.filter((b) => {
      const x0 = b.x;
      const y0 = b.y;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      if (b.life <= 0) return false;
      if (b.x < 0 || b.y < 0 || b.x > WORLD || b.y > WORLD) return false;
      if (walls().some((w) => segHitsRect(x0, y0, b.x, b.y, w))) return false;
      for (const e of actors) {
        if (!e.alive || e.id === b.ownerId) continue;
        if (!segHitsCircle(x0, y0, b.x, b.y, e, e.r)) continue;
        e.hp -= b.dmg;
        if (e.hp <= 0) e.alive = false;
        return false;
      }
      return true;
    });
  }

  function update(dt) {
    if (state !== "play") return;
    matchTime += dt;
    storm.r = stormRadius();
    player.cooldown -= dt;
    const dx = (keys.d ? 1 : 0) - (keys.a ? 1 : 0);
    const dy = (keys.s ? 1 : 0) - (keys.w ? 1 : 0);
    if (dx || dy) move(player, dx, dy, dt);
    else {
      resolveWalls(player);
      clamp(player);
    }
    cam.x = player.x - view.w / 2;
    cam.y = player.y - view.h / 2;
    player.angle = Math.atan2(pointer.y + cam.y - player.y, pointer.x + cam.x - player.x);
    if (pointer.down || shotQueued) shoot(player);
    shotQueued = false;
    for (const bot of bots) updateBot(bot, dt);
    for (const bot of bots) separate(player, bot);
    for (let i = 0; i < bots.length; i++) {
      for (let j = i + 1; j < bots.length; j++) separate(bots[i], bots[j]);
    }
    resolveWalls(player);
    for (const bot of bots) resolveWalls(bot);
    updateBullets(dt);
    applyStorm(player, dt);
    if (!player.alive) state = "lose";
    else if (bots.every((b) => !b.alive)) state = "win";
  }

  function drawGround() {
    ctx.fillStyle = "#17202b";
    ctx.fillRect(-cam.x, -cam.y, WORLD, WORLD);
    ctx.strokeStyle = "rgba(255,255,255,0.04)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= WORLD; x += 48) {
      ctx.moveTo(x - cam.x, -cam.y);
      ctx.lineTo(x - cam.x, WORLD - cam.y);
    }
    for (let y = 0; y <= WORLD; y += 48) {
      ctx.moveTo(-cam.x, y - cam.y);
      ctx.lineTo(WORLD - cam.x, y - cam.y);
    }
    ctx.stroke();
  }

  function drawBuilds() {
    for (const b of builds) {
      const x = b.x - cam.x;
      const y = b.y - cam.y;
      if (b.type === "wall") {
        ctx.fillStyle = b.fixed ? "#3d4c5e" : "#b7c4d4";
        ctx.fillRect(x, y, b.w, b.h);
        ctx.strokeStyle = "rgba(0,0,0,0.35)";
        ctx.strokeRect(x + 0.5, y + 0.5, b.w - 1, b.h - 1);
      } else {
        const cx = x + b.w / 2;
        const cy = y + b.h / 2;
        const a = b.dir;
        ctx.fillStyle = "#e0a106";
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * 20, cy + Math.sin(a) * 20);
        ctx.lineTo(cx + Math.cos(a + 2.5) * 22, cy + Math.sin(a + 2.5) * 22);
        ctx.lineTo(cx + Math.cos(a - 2.5) * 22, cy + Math.sin(a - 2.5) * 22);
        ctx.closePath();
        ctx.fill();
      }
    }
  }

  function drawActor(e) {
    if (!e.alive) return;
    const x = e.x - cam.x;
    const y = e.y - cam.y;
    ctx.strokeStyle = "#f4f1de";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(e.angle) * 22, y + Math.sin(e.angle) * 22);
    ctx.stroke();
    ctx.fillStyle = e.color;
    ctx.beginPath();
    ctx.arc(x, y, e.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#1b1f27";
    ctx.fillRect(x - 16, y - e.r - 12, 32, 4);
    ctx.fillStyle = e.hp > 30 ? "#7dce82" : "#e85d4c";
    ctx.fillRect(x - 16, y - e.r - 12, 32 * Math.max(0, e.hp) / 100, 4);
  }

  function drawStorm() {
    const sx = storm.x - cam.x;
    const sy = storm.y - cam.y;
    ctx.fillStyle = "rgba(76, 29, 149, 0.42)";
    ctx.beginPath();
    ctx.rect(0, 0, view.w, view.h);
    ctx.moveTo(sx + storm.r, sy);
    ctx.arc(sx, sy, storm.r, 0, Math.PI * 2, true);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(sx, sy, storm.r, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(216, 180, 254, 0.95)";
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  function drawHud() {
    ctx.fillStyle = "#f4f1de";
    ctx.font = "16px system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("HP " + Math.max(0, Math.ceil(player.hp)), 16, 28);
    const alive = (player.alive ? 1 : 0) + bots.filter((b) => b.alive).length;
    ctx.fillText("Alive " + alive, 16, 50);
    const outside = Math.hypot(player.x - storm.x, player.y - storm.y) > storm.r;
    ctx.fillStyle = outside ? "#ff8b8b" : "#d8b4fe";
    ctx.fillText(outside ? "IN THE STORM" : "Storm " + Math.ceil(storm.r), 16, 72);
    ctx.fillStyle = "#9aa4b2";
    ctx.font = "14px system-ui, sans-serif";
    ctx.fillText("WASD move    mouse aim    click shoot    1 wall    2 ramp", 16, view.h - 18);
    if (state === "play") return;
    ctx.fillStyle = "rgba(6, 8, 12, 0.55)";
    ctx.fillRect(0, 0, view.w, view.h);
    ctx.fillStyle = "#f4f1de";
    ctx.textAlign = "center";
    ctx.font = "64px system-ui, sans-serif";
    ctx.fillText(state === "win" ? "YOU WIN" : "YOU LOSE", view.w / 2, view.h / 2);
    ctx.font = "20px system-ui, sans-serif";
    ctx.fillText("R to drop again", view.w / 2, view.h / 2 + 42);
    ctx.textAlign = "left";
  }

  function draw() {
    ctx.setTransform(canvas.width / view.w, 0, 0, canvas.height / view.h, 0, 0);
    ctx.clearRect(0, 0, view.w, view.h);
    ctx.fillStyle = "#0e1116";
    ctx.fillRect(0, 0, view.w, view.h);
    drawGround();
    drawBuilds();
    for (const b of bullets) {
      ctx.fillStyle = "#f4f1de";
      ctx.beginPath();
      ctx.arc(b.x - cam.x, b.y - cam.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const bot of bots) drawActor(bot);
    drawActor(player);
    drawStorm();
    if (Math.hypot(player.x - storm.x, player.y - storm.y) > storm.r && player.alive) {
      ctx.fillStyle = "rgba(180, 30, 50, 0.22)";
      ctx.fillRect(0, 0, view.w, view.h);
    }
    drawHud();
  }

  let last = 0;
  function frame(t) {
    const dt = Math.min(0.033, (t - last) / 1000 || 0);
    last = t;
    if (!view.w) resize();
    update(dt);
    cam.x = player.x - view.w / 2;
    cam.y = player.y - view.h / 2;
    draw();
    requestAnimationFrame(frame);
  }

  window.addEventListener("resize", resize);
  window.addEventListener("keydown", (e) => {
    keys[e.key.toLowerCase()] = true;
    if (e.repeat) return;
    if (e.key === "1") place("wall");
    if (e.key === "2") place("ramp");
    if (e.key.toLowerCase() === "r" && state !== "play") reset();
    if (["arrowup", "arrowdown", " "].includes(e.key.toLowerCase())) e.preventDefault();
  });
  window.addEventListener("keyup", (e) => {
    keys[e.key.toLowerCase()] = false;
  });
  function trackPointer(e) {
    const rect = canvas.getBoundingClientRect();
    pointer.x = e.clientX - rect.left;
    pointer.y = e.clientY - rect.top;
  }
  canvas.addEventListener("mousemove", trackPointer);
  canvas.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    trackPointer(e);
    pointer.down = true;
    shotQueued = true;
  });
  window.addEventListener("mouseup", () => {
    pointer.down = false;
  });
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());

  resize();
  reset();
  requestAnimationFrame(frame);
})();

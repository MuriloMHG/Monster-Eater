(function () {
  "use strict";

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");

  const ui = {
    timer: document.getElementById("timer"),
    score: document.getElementById("score"),
    power: document.getElementById("power"),
    healthFill: document.getElementById("healthFill"),
    energyFill: document.getElementById("energyFill"),
    nitroFill: document.getElementById("nitroFill"),
    bossPanel: document.getElementById("bossPanel"),
    bossFill: document.getElementById("bossFill"),
    toast: document.getElementById("toast"),
    toastTitle: document.getElementById("toastTitle"),
    toastText: document.getElementById("toastText"),
    restartButton: document.getElementById("restartButton"),
  };

  const ASSETS = {
    background: "assets/background/background.png",
    player: {
      normal: "assets/player/player_padrao.png",
      damage: "assets/player/player_dano.png",
    },
    boss: {
      normal: "assets/enemy/boss_padrao.png",
      damage: "assets/enemy/boss_dano.png",
    },
    foods: {
      peixe: {
        normal: "assets/foods/peixe_padrao.png",
        damage: "assets/foods/peixe_dano.png",
      },
      tartaruga: {
        normal: "assets/foods/tartaruga_padrao.png",
        damage: "assets/foods/tartarua_dano.png",
      },
      polvo: {
        normal: "assets/foods/polvo_padrao.png",
        damage: "assets/foods/polvo_dano.png",
      },
      jellyfish: {
        normal: "assets/foods/jellyfish_padrao.png",
        damage: "assets/foods/jellyfish_dano.png",
      },
      cobra: {
        normal: "assets/foods/cobra_padrao.png",
        damage: "assets/foods/cobra_dano.png",
      },
    },
  };

  const FOOD_TYPES = [
    { id: "peixe", size: 72, speed: 92, value: 12, heal: 5, power: 0.08, weight: 36 },
    { id: "jellyfish", size: 76, speed: 62, value: 15, heal: 3, power: 0.1, sting: 4, weight: 18 },
    { id: "cobra", size: 88, speed: 112, value: 18, heal: 4, power: 0.12, sting: 5, weight: 16 },
    { id: "tartaruga", size: 96, speed: 54, value: 28, heal: 10, power: 0.18, weight: 14 },
    { id: "polvo", size: 104, speed: 78, value: 34, heal: 8, power: 0.22, weight: 10 },
  ];

  const WORLD = { width: 4300, height: 2200 };
  const FEEDING_SECONDS = 120;
  const keys = new Set();
  const pointer = { active: false, x: 0, y: 0 };
  const camera = { x: 0, y: 0 };
  const particles = [];
  const floaters = [];

  let images = {};
  let state;
  let lastTime = 0;
  let spawnTimer = 0;
  let waveTimer = 0;
  let toastTimer = 0;
  let animationFrame = 0;

  function resetGame() {
    state = {
      phase: "feeding",
      elapsed: 0,
      score: 0,
      meals: 0,
      gameOver: false,
      victory: false,
      player: {
        x: WORLD.width * 0.5,
        y: WORLD.height * 0.5,
        vx: 0,
        vy: 0,
        facing: 1,
        size: 132,
        baseSize: 132,
        maxHealth: 100,
        health: 100,
        maxEnergy: 100,
        energy: 100,
        maxNitro: 100,
        nitro: 78,
        power: 1,
        damageTimer: 0,
        hurtCooldown: 0,
        biteCooldown: 0,
      },
      foods: [],
      boss: null,
    };

    spawnTimer = 0;
    waveTimer = 2.6;
    toastTimer = 3.2;
    ui.toastTitle.textContent = "Monster Eater";
    ui.toastText.textContent = "Coma o maximo que puder antes do chefe aparecer.";
    ui.restartButton.classList.remove("is-visible");
    ui.toast.classList.add("is-visible");

    for (let i = 0; i < 12; i += 1) {
      spawnFood(true);
    }
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Falha ao carregar " + src));
      image.src = src;
    });
  }

  async function loadAssets() {
    const foodEntries = Object.entries(ASSETS.foods);
    const loadedFoods = {};

    const loaded = await Promise.all([
      loadImage(ASSETS.background),
      loadImage(ASSETS.player.normal),
      loadImage(ASSETS.player.damage),
      loadImage(ASSETS.boss.normal),
      loadImage(ASSETS.boss.damage),
      ...foodEntries.flatMap(([, item]) => [loadImage(item.normal), loadImage(item.damage)]),
    ]);

    let cursor = 5;
    foodEntries.forEach(([id]) => {
      loadedFoods[id] = {
        normal: loaded[cursor],
        damage: loaded[cursor + 1],
      };
      cursor += 2;
    });

    images = {
      background: loaded[0],
      player: { normal: loaded[1], damage: loaded[2] },
      boss: { normal: loaded[3], damage: loaded[4] },
      foods: loadedFoods,
    };
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(320, window.innerWidth);
    const height = Math.max(240, window.innerHeight);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function rand(min, max) {
    return min + Math.random() * (max - min);
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function distance(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.hypot(dx, dy);
  }

  function chooseFoodType() {
    const total = FOOD_TYPES.reduce((sum, type) => sum + type.weight, 0);
    let roll = rand(0, total);
    for (const type of FOOD_TYPES) {
      roll -= type.weight;
      if (roll <= 0) return type;
    }
    return FOOD_TYPES[0];
  }

  function spawnFood(initial) {
    if (!state) return;

    const type = chooseFoodType();
    const margin = 260;
    let x;
    let y;

    if (initial) {
      x = rand(280, WORLD.width - 280);
      y = rand(260, WORLD.height - 260);
    } else {
      const side = Math.floor(rand(0, 4));
      const viewLeft = camera.x;
      const viewRight = camera.x + window.innerWidth;
      const viewTop = camera.y;
      const viewBottom = camera.y + window.innerHeight;

      if (side === 0) {
        x = viewLeft - margin;
        y = rand(viewTop - 120, viewBottom + 120);
      } else if (side === 1) {
        x = viewRight + margin;
        y = rand(viewTop - 120, viewBottom + 120);
      } else if (side === 2) {
        x = rand(viewLeft - 120, viewRight + 120);
        y = viewTop - margin;
      } else {
        x = rand(viewLeft - 120, viewRight + 120);
        y = viewBottom + margin;
      }

      x = clamp(x, 120, WORLD.width - 120);
      y = clamp(y, 140, WORLD.height - 140);
    }

    const angle = rand(0, Math.PI * 2);
    state.foods.push({
      id: type.id,
      type,
      x,
      y,
      vx: Math.cos(angle) * type.speed * rand(0.25, 0.7),
      vy: Math.sin(angle) * type.speed * rand(0.2, 0.55),
      facing: Math.cos(angle) < 0 ? -1 : 1,
      size: type.size * rand(0.88, 1.12),
      wobble: rand(0, Math.PI * 2),
      turnTimer: rand(0.5, 2.2),
      dying: false,
      deadTimer: 0,
      stingCooldown: 0,
      rewardGiven: false,
    });
  }

  function spawnBoss() {
    const player = state.player;
    const fromLeft = player.x > WORLD.width * 0.5;
    state.boss = {
      x: fromLeft ? 180 : WORLD.width - 180,
      y: clamp(player.y + rand(-260, 260), 260, WORLD.height - 260),
      vx: 0,
      vy: 0,
      facing: fromLeft ? 1 : -1,
      size: 292,
      maxHealth: 920 + state.player.power * 75,
      health: 920 + state.player.power * 75,
      damageTimer: 0,
      attackCooldown: 1.3,
      chargeCooldown: 2.2,
      chargeTimer: 0,
      defeated: false,
    };
    state.phase = "boss";
    showToast("Chefe final", "Agora e sobreviver, atacar e terminar a caca.", 3.4);
  }

  function showToast(title, text, seconds) {
    ui.toastTitle.textContent = title;
    ui.toastText.textContent = text;
    ui.restartButton.classList.remove("is-visible");
    ui.toast.classList.add("is-visible");
    toastTimer = seconds;
  }

  function update(dt) {
    if (!state || state.gameOver || state.victory) return;

    toastTimer -= dt;
    if (toastTimer <= 0) {
      ui.toast.classList.remove("is-visible");
    }

    if (state.phase === "feeding") {
      state.elapsed += dt;
      if (state.elapsed >= FEEDING_SECONDS) {
        spawnBoss();
      }
    }

    updatePlayer(dt);
    updateCamera(dt);
    updateFoodSpawns(dt);
    updateFoods(dt);
    updateBoss(dt);
    updateParticles(dt);
    updateHud();
  }

  function updatePlayer(dt) {
    const player = state.player;
    let ax = 0;
    let ay = 0;

    if (keys.has("ArrowLeft") || keys.has("KeyA")) ax -= 1;
    if (keys.has("ArrowRight") || keys.has("KeyD")) ax += 1;
    if (keys.has("ArrowUp") || keys.has("KeyW")) ay -= 1;
    if (keys.has("ArrowDown") || keys.has("KeyS")) ay += 1;

    if (pointer.active) {
      const target = screenToWorld(pointer.x, pointer.y);
      const dx = target.x - player.x;
      const dy = target.y - player.y;
      const len = Math.hypot(dx, dy);
      if (len > 18) {
        ax += dx / len;
        ay += dy / len;
      }
    }

    const inputLength = Math.hypot(ax, ay);
    if (inputLength > 0) {
      ax /= inputLength;
      ay /= inputLength;
    }

    const wantsNitro = keys.has("ShiftLeft") || keys.has("ShiftRight") || keys.has("Space");
    const canNitro = wantsNitro && player.nitro > 1 && player.energy > 5 && inputLength > 0;
    const boost = canNitro ? 1.82 : 1;
    const speed = (265 + player.power * 12) * boost;
    const accel = speed * 4.8;

    player.vx += ax * accel * dt;
    player.vy += ay * accel * dt;

    const maxSpeed = speed * (canNitro ? 1.08 : 1);
    const currentSpeed = Math.hypot(player.vx, player.vy);
    if (currentSpeed > maxSpeed) {
      player.vx = (player.vx / currentSpeed) * maxSpeed;
      player.vy = (player.vy / currentSpeed) * maxSpeed;
    }

    const drag = Math.pow(0.035, dt);
    player.vx *= drag;
    player.vy *= drag;
    player.x += player.vx * dt;
    player.y += player.vy * dt;

    player.x = clamp(player.x, 76, WORLD.width - 76);
    player.y = clamp(player.y, 90, WORLD.height - 90);

    if (Math.abs(player.vx) > 8) {
      player.facing = player.vx < 0 ? -1 : 1;
    }

    player.nitro += (canNitro ? -42 : 10) * dt;
    player.energy += (canNitro ? -12 : 2.6) * dt;
    player.nitro = clamp(player.nitro, 0, player.maxNitro);
    player.energy = clamp(player.energy, 0, player.maxEnergy);
    player.damageTimer = Math.max(0, player.damageTimer - dt);
    player.hurtCooldown = Math.max(0, player.hurtCooldown - dt);
    player.biteCooldown = Math.max(0, player.biteCooldown - dt);
    player.size = player.baseSize * clamp(1 + state.meals * 0.014 + player.power * 0.025, 1, 1.62);

    if (canNitro) {
      addBubbleTrail(player.x - player.facing * player.size * 0.45, player.y, player.facing);
    }
  }

  function updateCamera(dt) {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const targetX = clamp(state.player.x - width * 0.5, 0, WORLD.width - width);
    const targetY = clamp(state.player.y - height * 0.5, 0, WORLD.height - height);
    const follow = 1 - Math.pow(0.001, dt);
    camera.x += (targetX - camera.x) * follow;
    camera.y += (targetY - camera.y) * follow;
  }

  function updateFoodSpawns(dt) {
    const cap = state.phase === "feeding"
      ? clamp(14 + Math.floor(state.score / 160), 14, 24)
      : 9;

    spawnTimer -= dt;
    waveTimer -= dt;

    if (state.foods.length < cap && spawnTimer <= 0) {
      spawnFood(false);
      const urgency = state.phase === "feeding" ? 1 : 1.35;
      spawnTimer = rand(0.44, 1.55) * urgency;
    }

    if (state.phase === "feeding" && waveTimer <= 0) {
      const amount = Math.floor(rand(2, 5));
      for (let i = 0; i < amount && state.foods.length < cap + 3; i += 1) {
        spawnFood(false);
      }
      waveTimer = rand(5.5, 11);
    }
  }

  function updateFoods(dt) {
    const player = state.player;

    for (const food of state.foods) {
      if (food.dying) {
        food.deadTimer -= dt;
        food.x += food.vx * dt * 0.25;
        food.y += food.vy * dt * 0.25;
        if (food.deadTimer <= 0 && !food.rewardGiven) {
          food.rewardGiven = true;
          rewardPlayer(food);
        }
        continue;
      }

      food.turnTimer -= dt;
      food.wobble += dt * rand(1.6, 2.8);
      food.stingCooldown = Math.max(0, food.stingCooldown - dt);

      const dx = food.x - player.x;
      const dy = food.y - player.y;
      const dist = Math.hypot(dx, dy) || 1;

      if (dist < 260) {
        const flee = (260 - dist) / 260;
        food.vx += (dx / dist) * food.type.speed * flee * 3.4 * dt;
        food.vy += (dy / dist) * food.type.speed * flee * 2.8 * dt;
      }

      if (food.turnTimer <= 0) {
        const angle = rand(0, Math.PI * 2);
        food.vx += Math.cos(angle) * food.type.speed * rand(0.4, 1.1);
        food.vy += Math.sin(angle) * food.type.speed * rand(0.25, 0.8);
        food.turnTimer = rand(0.7, 2.5);
      }

      food.vy += Math.sin(food.wobble) * 18 * dt;
      const maxSpeed = food.type.speed;
      const speed = Math.hypot(food.vx, food.vy);
      if (speed > maxSpeed) {
        food.vx = (food.vx / speed) * maxSpeed;
        food.vy = (food.vy / speed) * maxSpeed;
      }

      food.vx *= Math.pow(0.12, dt);
      food.vy *= Math.pow(0.16, dt);
      food.x += food.vx * dt;
      food.y += food.vy * dt;

      if (food.x < 80 || food.x > WORLD.width - 80) food.vx *= -1;
      if (food.y < 110 || food.y > WORLD.height - 110) food.vy *= -1;
      food.x = clamp(food.x, 80, WORLD.width - 80);
      food.y = clamp(food.y, 110, WORLD.height - 110);

      if (Math.abs(food.vx) > 4) {
        food.facing = food.vx < 0 ? -1 : 1;
      }

      const biteRange = player.size * 0.34 + food.size * 0.32;
      if (dist < biteRange) {
        consumeFood(food);
      } else if (food.type.sting && dist < biteRange + 16 && food.stingCooldown <= 0) {
        damagePlayer(food.type.sting, -dx / dist, -dy / dist);
        food.stingCooldown = 1.2;
      }
    }

    state.foods = state.foods.filter((food) => !(food.dying && food.deadTimer <= -0.08));
  }

  function consumeFood(food) {
    food.dying = true;
    food.deadTimer = 0.22;
    food.vx *= 0.2;
    food.vy *= 0.2;
    makeSplash(food.x, food.y, 10, "#c7f6ff");
  }

  function rewardPlayer(food) {
    const player = state.player;
    state.score += food.type.value;
    state.meals += 1;
    player.power += food.type.power;
    player.maxHealth = clamp(player.maxHealth + food.type.value * 0.12, 100, 170);
    player.health = clamp(player.health + food.type.heal, 0, player.maxHealth);
    player.energy = clamp(player.energy + 14, 0, player.maxEnergy);
    player.nitro = clamp(player.nitro + 7, 0, player.maxNitro);
    floaters.push({ x: food.x, y: food.y, text: "+" + food.type.value, life: 0.9, color: "#fff0a6" });
  }

  function updateBoss(dt) {
    const boss = state.boss;
    if (!boss || boss.defeated) return;

    const player = state.player;
    const dx = player.x - boss.x;
    const dy = player.y - boss.y;
    const dist = Math.hypot(dx, dy) || 1;
    const nx = dx / dist;
    const ny = dy / dist;

    boss.damageTimer = Math.max(0, boss.damageTimer - dt);
    boss.attackCooldown = Math.max(0, boss.attackCooldown - dt);
    boss.chargeCooldown -= dt;
    boss.chargeTimer = Math.max(0, boss.chargeTimer - dt);

    if (boss.chargeCooldown <= 0 && dist < 980) {
      boss.chargeTimer = 0.72;
      boss.chargeCooldown = rand(2.4, 4.2);
      makeSplash(boss.x, boss.y, 18, "#ffb0a9");
    }

    const speed = boss.chargeTimer > 0 ? 410 : 185;
    boss.vx += nx * speed * 2.4 * dt;
    boss.vy += ny * speed * 2.1 * dt;

    const maxSpeed = boss.chargeTimer > 0 ? 430 : 205;
    const currentSpeed = Math.hypot(boss.vx, boss.vy);
    if (currentSpeed > maxSpeed) {
      boss.vx = (boss.vx / currentSpeed) * maxSpeed;
      boss.vy = (boss.vy / currentSpeed) * maxSpeed;
    }

    boss.vx *= Math.pow(0.06, dt);
    boss.vy *= Math.pow(0.08, dt);
    boss.x += boss.vx * dt;
    boss.y += boss.vy * dt;
    boss.x = clamp(boss.x, 160, WORLD.width - 160);
    boss.y = clamp(boss.y, 180, WORLD.height - 180);

    if (Math.abs(boss.vx) > 5) {
      boss.facing = boss.vx < 0 ? -1 : 1;
    }

    const hitRange = player.size * 0.36 + boss.size * 0.34;
    if (dist < hitRange) {
      if (boss.attackCooldown <= 0) {
        damagePlayer(boss.chargeTimer > 0 ? 24 : 17, nx, ny);
        boss.attackCooldown = boss.chargeTimer > 0 ? 1.05 : 0.78;
      }

      if (player.biteCooldown <= 0) {
        const damage = 20 + player.power * 6.4 + (player.nitro > 20 ? 6 : 0);
        boss.health -= damage;
        boss.damageTimer = 0.18;
        boss.vx -= nx * 180;
        boss.vy -= ny * 120;
        player.biteCooldown = keys.has("Space") || keys.has("ShiftLeft") || keys.has("ShiftRight") ? 0.27 : 0.38;
        state.score += 4;
        makeSplash(boss.x + nx * boss.size * 0.15, boss.y + ny * boss.size * 0.12, 14, "#ff777b");
        floaters.push({ x: boss.x, y: boss.y - boss.size * 0.25, text: "-" + Math.round(damage), life: 0.75, color: "#ffb0a9" });
      }
    }

    if (boss.health <= 0) {
      boss.defeated = true;
      boss.damageTimer = 0.5;
      state.victory = true;
      state.score += 500;
      showEnd("Vitoria", "Voce devorou o chefe final e dominou o oceano.");
    }
  }

  function damagePlayer(amount, nx, ny) {
    const player = state.player;
    if (player.hurtCooldown > 0) return;

    player.health = clamp(player.health - amount, 0, player.maxHealth);
    player.damageTimer = 0.38;
    player.hurtCooldown = 0.44;
    player.vx += nx * 360;
    player.vy += ny * 260;
    makeSplash(player.x, player.y, 12, "#ff8090");
    floaters.push({ x: player.x, y: player.y - player.size * 0.35, text: "-" + Math.round(amount), life: 0.72, color: "#ff9aa8" });

    if (player.health <= 0) {
      state.gameOver = true;
      showEnd("Fim de jogo", "Seu tubarao ficou sem vida antes de vencer a caca.");
    }
  }

  function showEnd(title, text) {
    ui.toastTitle.textContent = title;
    ui.toastText.textContent = text;
    ui.restartButton.classList.add("is-visible");
    ui.toast.classList.add("is-visible");
    updateHud();
  }

  function updateParticles(dt) {
    for (const particle of particles) {
      particle.life -= dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vy -= 8 * dt;
      particle.size *= Math.pow(0.55, dt);
    }

    for (const floater of floaters) {
      floater.life -= dt;
      floater.y -= 44 * dt;
    }

    for (let i = particles.length - 1; i >= 0; i -= 1) {
      if (particles[i].life <= 0 || particles[i].size <= 0.6) particles.splice(i, 1);
    }

    for (let i = floaters.length - 1; i >= 0; i -= 1) {
      if (floaters[i].life <= 0) floaters.splice(i, 1);
    }
  }

  function addBubbleTrail(x, y, facing) {
    if (Math.random() > 0.55) return;
    particles.push({
      x,
      y: y + rand(-18, 18),
      vx: -facing * rand(36, 110),
      vy: rand(-30, 22),
      size: rand(4, 10),
      life: rand(0.45, 0.95),
      color: "rgba(205, 247, 255, 0.72)",
    });
  }

  function makeSplash(x, y, amount, color) {
    for (let i = 0; i < amount; i += 1) {
      const angle = rand(0, Math.PI * 2);
      const speed = rand(45, 170);
      particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: rand(3, 8),
        life: rand(0.28, 0.72),
        color,
      });
    }
  }

  function draw() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    ctx.clearRect(0, 0, width, height);
    drawBackground(width, height);
    drawWorldLimits(width, height);

    const drawables = [
      ...state.foods,
      state.boss,
      state.player,
    ].filter(Boolean).sort((a, b) => a.y - b.y);

    for (const entity of drawables) {
      if (entity === state.player) drawPlayer(entity);
      else if (entity === state.boss) drawBoss(entity);
      else drawFood(entity);
    }

    drawParticles();
    drawFloaters();
  }

  function drawBackground(width, height) {
    const bg = images.background;
    const scale = WORLD.height / bg.height;
    const tileWidth = bg.width * scale;
    const start = Math.floor(camera.x / tileWidth) - 1;

    ctx.fillStyle = "#071b2d";
    ctx.fillRect(0, 0, width, height);

    for (let i = start; i < start + 4; i += 1) {
      const x = i * tileWidth - camera.x;
      ctx.drawImage(bg, x, -camera.y, tileWidth, WORLD.height);
    }

    const surface = -camera.y;
    const floor = WORLD.height - camera.y;
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, "rgba(167, 236, 255, 0.18)");
    gradient.addColorStop(0.44, "rgba(6, 26, 42, 0.02)");
    gradient.addColorStop(1, "rgba(0, 8, 18, 0.46)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    if (surface > -130 && surface < height) {
      ctx.fillStyle = "rgba(211, 251, 255, 0.24)";
      ctx.fillRect(0, surface, width, 4);
    }

    if (floor > 0 && floor < height + 160) {
      const floorGradient = ctx.createLinearGradient(0, floor - 150, 0, floor);
      floorGradient.addColorStop(0, "rgba(5, 18, 24, 0)");
      floorGradient.addColorStop(1, "rgba(6, 12, 16, 0.72)");
      ctx.fillStyle = floorGradient;
      ctx.fillRect(0, floor - 150, width, 170);
    }
  }

  function drawWorldLimits(width, height) {
    ctx.save();
    ctx.strokeStyle = "rgba(184, 244, 255, 0.2)";
    ctx.lineWidth = 2;
    ctx.strokeRect(-camera.x, -camera.y, WORLD.width, WORLD.height);
    ctx.restore();
  }

  function drawFood(food) {
    const sprite = images.foods[food.id][food.dying ? "damage" : "normal"];
    const bob = Math.sin(food.wobble) * 4;
    drawSprite(sprite, food.x - camera.x, food.y - camera.y + bob, food.size, food.facing < 0, 0);
  }

  function drawPlayer(player) {
    const sprite = images.player[player.damageTimer > 0 ? "damage" : "normal"];
    const angle = clamp(player.vy / 700, -0.22, 0.22) * player.facing;
    const pulse = player.damageTimer > 0 ? Math.sin(performance.now() * 0.06) * 5 : 0;
    drawSprite(sprite, player.x - camera.x, player.y - camera.y, player.size + pulse, player.facing < 0, angle);
  }

  function drawBoss(boss) {
    const sprite = images.boss[boss.damageTimer > 0 ? "damage" : "normal"];
    const shake = boss.chargeTimer > 0 ? Math.sin(performance.now() * 0.05) * 4 : 0;
    const angle = clamp(boss.vy / 780, -0.18, 0.18) * boss.facing;
    drawSprite(sprite, boss.x - camera.x + shake, boss.y - camera.y, boss.size, boss.facing < 0, angle);
  }

  function drawSprite(image, x, y, targetWidth, flip, rotation) {
    const aspect = image.height / image.width;
    const width = targetWidth;
    const height = targetWidth * aspect;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation || 0);
    if (flip) ctx.scale(-1, 1);
    ctx.drawImage(image, -width * 0.5, -height * 0.5, width, height);
    ctx.restore();
  }

  function drawParticles() {
    for (const particle of particles) {
      const alpha = clamp(particle.life, 0, 1);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = particle.color;
      ctx.beginPath();
      ctx.arc(particle.x - camera.x, particle.y - camera.y, particle.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawFloaters() {
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "800 18px Inter, system-ui, sans-serif";
    for (const floater of floaters) {
      ctx.globalAlpha = clamp(floater.life, 0, 1);
      ctx.fillStyle = floater.color;
      ctx.fillText(floater.text, floater.x - camera.x, floater.y - camera.y);
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  function updateHud() {
    const player = state.player;
    const remaining = state.phase === "feeding"
      ? Math.max(0, FEEDING_SECONDS - state.elapsed)
      : 0;
    const minutes = Math.floor(remaining / 60).toString().padStart(2, "0");
    const seconds = Math.floor(remaining % 60).toString().padStart(2, "0");

    ui.timer.textContent = minutes + ":" + seconds;
    ui.score.textContent = Math.round(state.score).toString();
    ui.power.textContent = player.power.toFixed(1);
    ui.healthFill.style.transform = "scaleX(" + clamp(player.health / player.maxHealth, 0, 1) + ")";
    ui.energyFill.style.transform = "scaleX(" + clamp(player.energy / player.maxEnergy, 0, 1) + ")";
    ui.nitroFill.style.transform = "scaleX(" + clamp(player.nitro / player.maxNitro, 0, 1) + ")";

    if (state.boss && state.phase === "boss") {
      ui.bossPanel.classList.add("is-visible");
      ui.bossFill.style.transform = "scaleX(" + clamp(state.boss.health / state.boss.maxHealth, 0, 1) + ")";
    } else {
      ui.bossPanel.classList.remove("is-visible");
    }
  }

  function screenToWorld(x, y) {
    return {
      x: x + camera.x,
      y: y + camera.y,
    };
  }

  function loop(time) {
    const dt = Math.min(0.033, (time - lastTime) / 1000 || 0);
    lastTime = time;
    animationFrame = requestAnimationFrame(loop);
    update(dt);
    draw();
  }

  function bindEvents() {
    window.addEventListener("resize", resize);
    window.addEventListener("keydown", (event) => {
      keys.add(event.code);
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(event.code)) {
        event.preventDefault();
      }
    }, { passive: false });

    window.addEventListener("keyup", (event) => {
      keys.delete(event.code);
    });

    canvas.addEventListener("pointerdown", (event) => {
      pointer.active = true;
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      canvas.setPointerCapture(event.pointerId);
    });

    canvas.addEventListener("pointermove", (event) => {
      pointer.x = event.clientX;
      pointer.y = event.clientY;
    });

    canvas.addEventListener("pointerup", (event) => {
      pointer.active = false;
      canvas.releasePointerCapture(event.pointerId);
    });

    canvas.addEventListener("pointercancel", () => {
      pointer.active = false;
    });

    ui.restartButton.addEventListener("click", () => {
      resetGame();
      updateHud();
    });
  }

  async function boot() {
    resize();
    bindEvents();
    await loadAssets();
    resetGame();
    updateHud();
    lastTime = performance.now();
    cancelAnimationFrame(animationFrame);
    animationFrame = requestAnimationFrame(loop);
  }

  boot().catch((error) => {
    ui.toastTitle.textContent = "Erro ao carregar";
    ui.toastText.textContent = error.message;
    ui.toast.classList.add("is-visible");
  });
}());

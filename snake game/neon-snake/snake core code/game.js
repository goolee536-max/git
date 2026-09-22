(() => {
  "use strict";

  const GRID_SIZE = 24;
  const BOARD_SIZE = 640;
  const START_INTERVAL = 138;
  const MIN_INTERVAL = 68;
  const SCORE_PER_FOOD = 10;

  const canvas = document.querySelector("#gameCanvas");
  const ctx = canvas.getContext("2d");
  const boardFrame = document.querySelector("#boardFrame");
  const overlay = document.querySelector("#gameOverlay");
  const overlayKicker = document.querySelector("#overlayKicker");
  const overlayTitle = document.querySelector("#overlayTitle");
  const overlayCopy = document.querySelector("#overlayCopy");
  const startButton = document.querySelector("#startButton");
  const startButtonText = document.querySelector("#startButtonText");
  const pauseButton = document.querySelector("#pauseButton");
  const restartButton = document.querySelector("#restartButton");
  const mobilePause = document.querySelector("#mobilePause");
  const scoreNode = document.querySelector("#score");
  const bestScoreNode = document.querySelector("#bestScore");
  const speedNode = document.querySelector("#speedLevel");
  const statusLine = document.querySelector(".status-line");
  const statusText = document.querySelector("#statusText");

  const directions = {
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 },
  };

  const keyDirections = {
    ArrowUp: "up",
    ArrowDown: "down",
    ArrowLeft: "left",
    ArrowRight: "right",
    w: "up",
    W: "up",
    s: "down",
    S: "down",
    a: "left",
    A: "left",
    d: "right",
    D: "right",
  };

  let state = "idle";
  let snake = [];
  let food = { x: 17, y: 12 };
  let direction = directions.right;
  let queuedDirection = directions.right;
  let score = 0;
  let bestScore = Number.parseInt(localStorage.getItem("neon-snake-best") || "0", 10);
  let foodsEaten = 0;
  let tickInterval = START_INTERVAL;
  let lastTick = 0;
  let touchStart = null;

  const formatScore = (value) => String(value).padStart(3, "0");

  function resetGame() {
    const center = Math.floor(GRID_SIZE / 2);
    snake = [
      { x: center + 2, y: center },
      { x: center + 1, y: center },
      { x: center, y: center },
      { x: center - 1, y: center },
      { x: center - 2, y: center },
    ];
    direction = directions.right;
    queuedDirection = directions.right;
    score = 0;
    foodsEaten = 0;
    tickInterval = START_INTERVAL;
    food = findFoodPosition();
    lastTick = performance.now();
    updateMetrics();
    draw();
  }

  function findFoodPosition() {
    const openCells = [];
    for (let y = 0; y < GRID_SIZE; y += 1) {
      for (let x = 0; x < GRID_SIZE; x += 1) {
        if (!snake.some((part) => part.x === x && part.y === y)) {
          openCells.push({ x, y });
        }
      }
    }
    return openCells[Math.floor(Math.random() * openCells.length)] || null;
  }

  function setState(nextState) {
    state = nextState;
    statusLine.dataset.state = nextState;
    const copy = {
      idle: "等待开始",
      running: "游戏进行中",
      paused: "已暂停",
      over: "本局结束",
      won: "完美通关",
    };
    statusText.textContent = copy[nextState];
    pauseButton.disabled = nextState === "idle" || nextState === "over" || nextState === "won";
    pauseButton.textContent = nextState === "paused" ? "继续" : "暂停";
    mobilePause.textContent = nextState === "paused" ? "▶" : "Ⅱ";
    overlay.hidden = nextState === "running";
  }

  function showOverlay(type) {
    const content = {
      idle: {
        kicker: "准备好了吗？",
        title: "吃掉光点<br>别撞上自己",
        copy: "方向键或 WASD 控制方向",
        button: "开始游戏",
      },
      paused: {
        kicker: "暂停中",
        title: "喘口气<br>再继续",
        copy: `当前分数 ${formatScore(score)} · 保持节奏`,
        button: "继续游戏",
      },
      over: {
        kicker: "信号中断",
        title: "撞到了<br>再来一局",
        copy: `本局得分 ${formatScore(score)} · 最高 ${formatScore(bestScore)}`,
        button: "重新开始",
      },
      won: {
        kicker: "全域清空",
        title: "你填满了<br>整个棋盘",
        copy: `最终得分 ${formatScore(score)}`,
        button: "再玩一次",
      },
    }[type];
    overlayKicker.textContent = content.kicker;
    overlayTitle.innerHTML = content.title;
    overlayCopy.textContent = content.copy;
    startButtonText.textContent = content.button;
    overlay.hidden = false;
  }

  function startGame({ restart = false } = {}) {
    if (restart || state === "idle" || state === "over" || state === "won") {
      resetGame();
    }
    setState("running");
    lastTick = performance.now();
  }

  function pauseGame() {
    if (state === "running") {
      setState("paused");
      showOverlay("paused");
    } else if (state === "paused") {
      startGame();
    }
  }

  function endGame(type = "over") {
    if (score > bestScore) {
      bestScore = score;
      localStorage.setItem("neon-snake-best", String(bestScore));
    }
    updateMetrics();
    setState(type);
    showOverlay(type);
    if (type === "over") {
      boardFrame.dataset.flash = "true";
      window.setTimeout(() => {
        boardFrame.dataset.flash = "false";
      }, 450);
    }
  }

  function requestDirection(name) {
    const next = directions[name];
    if (!next) return false;
    const reverses = next.x + direction.x === 0 && next.y + direction.y === 0;
    if (reverses) return false;
    queuedDirection = next;
    if (state === "idle") startGame();
    return true;
  }

  function tick() {
    direction = queuedDirection;
    const head = snake[0];
    const nextHead = { x: head.x + direction.x, y: head.y + direction.y };
    const hitWall =
      nextHead.x < 0 ||
      nextHead.x >= GRID_SIZE ||
      nextHead.y < 0 ||
      nextHead.y >= GRID_SIZE;
    const willEat = food && nextHead.x === food.x && nextHead.y === food.y;
    const collisionBody = willEat ? snake : snake.slice(0, -1);
    const hitSelf = collisionBody.some((part) => part.x === nextHead.x && part.y === nextHead.y);

    if (hitWall || hitSelf) {
      endGame("over");
      return;
    }

    snake.unshift(nextHead);
    if (willEat) {
      score += SCORE_PER_FOOD;
      foodsEaten += 1;
      tickInterval = Math.max(MIN_INTERVAL, START_INTERVAL - foodsEaten * 4);
      food = findFoodPosition();
      updateMetrics();
      if (!food) endGame("won");
    } else {
      snake.pop();
    }
  }

  function updateMetrics() {
    scoreNode.textContent = formatScore(score);
    bestScoreNode.textContent = formatScore(bestScore);
    speedNode.textContent = String(Math.min(99, Math.floor(foodsEaten / 3) + 1)).padStart(2, "0");
  }

  function roundedRect(x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, r);
  }

  function drawGrid() {
    const cell = BOARD_SIZE / GRID_SIZE;
    ctx.fillStyle = "#090b0f";
    ctx.fillRect(0, 0, BOARD_SIZE, BOARD_SIZE);
    ctx.strokeStyle = "rgba(255,255,255,0.045)";
    ctx.lineWidth = 1;
    for (let i = 1; i < GRID_SIZE; i += 1) {
      const p = Math.round(i * cell) + 0.5;
      ctx.beginPath();
      ctx.moveTo(p, 0);
      ctx.lineTo(p, BOARD_SIZE);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, p);
      ctx.lineTo(BOARD_SIZE, p);
      ctx.stroke();
    }
  }

  function drawFood(time) {
    if (!food) return;
    const cell = BOARD_SIZE / GRID_SIZE;
    const centerX = food.x * cell + cell / 2;
    const centerY = food.y * cell + cell / 2;
    const pulse = 0.92 + Math.sin(time / 180) * 0.08;
    ctx.save();
    ctx.shadowColor = "#ff4d6d";
    ctx.shadowBlur = 22;
    ctx.fillStyle = "#ff4d6d";
    ctx.beginPath();
    ctx.arc(centerX, centerY, cell * 0.27 * pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "rgba(255,77,109,0.45)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(centerX, centerY, cell * 0.42 * pulse, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function drawSnake() {
    const cell = BOARD_SIZE / GRID_SIZE;
    const gap = 2.8;
    snake.forEach((part, index) => {
      const x = part.x * cell + gap;
      const y = part.y * cell + gap;
      const size = cell - gap * 2;
      const fade = Math.max(0.34, 1 - index / Math.max(10, snake.length * 1.35));
      ctx.save();
      ctx.fillStyle = index === 0 ? "#e4ff82" : `rgba(199,255,26,${fade})`;
      if (index === 0) {
        ctx.shadowColor = "rgba(199,255,26,.75)";
        ctx.shadowBlur = 14;
      }
      roundedRect(x, y, size, size, index === 0 ? 6 : 4);
      ctx.fill();
      ctx.restore();
    });

    const head = snake[0];
    if (!head) return;
    const eyeOffset = cell * 0.19;
    const centerX = head.x * cell + cell / 2;
    const centerY = head.y * cell + cell / 2;
    const perpendicular = { x: -direction.y, y: direction.x };
    const forward = { x: direction.x * cell * 0.16, y: direction.y * cell * 0.16 };
    ctx.fillStyle = "#090b0f";
    [-1, 1].forEach((side) => {
      ctx.beginPath();
      ctx.arc(
        centerX + forward.x + perpendicular.x * eyeOffset * side,
        centerY + forward.y + perpendicular.y * eyeOffset * side,
        2.2,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    });
  }

  function draw(time = performance.now()) {
    ctx.clearRect(0, 0, BOARD_SIZE, BOARD_SIZE);
    drawGrid();
    drawFood(time);
    drawSnake();
  }

  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(rect.width * pixelRatio));
    canvas.height = Math.max(1, Math.round(rect.height * pixelRatio));
    ctx.setTransform(canvas.width / BOARD_SIZE, 0, 0, canvas.height / BOARD_SIZE, 0, 0);
    draw();
  }

  function loop(time) {
    if (state === "running" && time - lastTick >= tickInterval) {
      tick();
      lastTick = time;
    }
    draw(time);
    window.requestAnimationFrame(loop);
  }

  function handleKeydown(event) {
    const directionName = keyDirections[event.key];
    if (directionName) {
      event.preventDefault();
      requestDirection(directionName);
      return;
    }
    if (event.code === "Space") {
      event.preventDefault();
      if (state === "idle" || state === "over" || state === "won") startGame({ restart: true });
      else pauseGame();
    }
    if (event.key === "Enter" && overlay.hidden === false) {
      event.preventDefault();
      startGame({ restart: state !== "paused" });
    }
  }

  function handleTouchStart(event) {
    const touch = event.changedTouches[0];
    touchStart = { x: touch.clientX, y: touch.clientY };
  }

  function handleTouchEnd(event) {
    if (!touchStart) return;
    const touch = event.changedTouches[0];
    const dx = touch.clientX - touchStart.x;
    const dy = touch.clientY - touchStart.y;
    touchStart = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
    requestDirection(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up");
  }

  function registerWebMcpTools() {
    const modelContext = document.modelContext;
    if (!modelContext?.registerTool) return;
    const safeRegister = (tool) => {
      try {
        void Promise.resolve(modelContext.registerTool(tool)).catch(() => {});
      } catch {
        // WebMCP is optional; visible controls remain available.
      }
    };

    safeRegister({
      name: "get_game_state",
      title: "读取游戏状态",
      description: "读取当前贪吃蛇的分数、速度、方向和运行状态。",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true, untrustedContentHint: false },
      execute() {
        return { state, score, bestScore, speedLevel: Math.floor(foodsEaten / 3) + 1 };
      },
    });

    safeRegister({
      name: "start_snake_game",
      title: "开始贪吃蛇",
      description: "开始新一局游戏，或继续当前暂停的游戏。",
      inputSchema: {
        type: "object",
        properties: { restart: { type: "boolean", description: "是否从零分重新开始" } },
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute(input = {}) {
        if (typeof input.restart !== "undefined" && typeof input.restart !== "boolean") {
          throw new TypeError("restart 必须是 boolean");
        }
        startGame({ restart: Boolean(input.restart) });
        return { state, score };
      },
    });

    safeRegister({
      name: "set_snake_direction",
      title: "改变蛇的方向",
      description: "将蛇转向上、下、左或右；不能直接反向。",
      inputSchema: {
        type: "object",
        properties: { direction: { type: "string", enum: ["up", "down", "left", "right"] } },
        required: ["direction"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute(input) {
        if (!input || !Object.hasOwn(directions, input.direction)) {
          throw new TypeError("direction 必须是 up、down、left 或 right");
        }
        const changed = requestDirection(input.direction);
        if (!changed) throw new Error("该方向会让蛇直接反向");
        return { state, direction: input.direction };
      },
    });
  }

  startButton.addEventListener("click", () => startGame({ restart: state !== "paused" }));
  pauseButton.addEventListener("click", pauseGame);
  mobilePause.addEventListener("click", () => {
    if (state === "idle" || state === "over" || state === "won") startGame({ restart: true });
    else pauseGame();
  });
  restartButton.addEventListener("click", () => startGame({ restart: true }));
  document.querySelectorAll("[data-direction]").forEach((button) => {
    button.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      requestDirection(button.dataset.direction);
    });
  });
  document.addEventListener("keydown", handleKeydown);
  canvas.addEventListener("touchstart", handleTouchStart, { passive: true });
  canvas.addEventListener("touchend", handleTouchEnd, { passive: true });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && state === "running") pauseGame();
  });
  window.addEventListener("resize", resizeCanvas);

  bestScoreNode.textContent = formatScore(bestScore);
  resetGame();
  setState("idle");
  showOverlay("idle");
  resizeCanvas();
  registerWebMcpTools();
  window.requestAnimationFrame(loop);
})();

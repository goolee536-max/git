(() => {
  "use strict";

  const GRID_SIZE = 24;
  const BOARD_SIZE = 640;
  const SCORE_PER_FOOD = 10;
  const HISTORY_KEY = "neon-snake-history-v1";
  const DIFFICULTY_KEY = "neon-snake-difficulty";
  const difficulties = {
    relaxed: { label: "轻松", startInterval: 172, minInterval: 92, acceleration: 3, multiplier: 1, wallBase: 4, wallGrowth: 0.8, wallMax: 28 },
    normal: { label: "标准", startInterval: 138, minInterval: 68, acceleration: 4, multiplier: 1.2, wallBase: 7, wallGrowth: 1.4, wallMax: 44 },
    turbo: { label: "极速", startInterval: 106, minInterval: 52, acceleration: 5, multiplier: 1.5, wallBase: 10, wallGrowth: 2, wallMax: 64 },
  };

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
  const historyButton = document.querySelector("#historyButton");
  const mobileHistoryButton = document.querySelector("#mobileHistoryButton");
  const historyDialog = document.querySelector("#historyDialog");
  const closeHistoryButton = document.querySelector("#closeHistoryButton");
  const clearHistoryButton = document.querySelector("#clearHistoryButton");
  const historyRows = document.querySelector("#historyRows");
  const historyEmpty = document.querySelector("#historyEmpty");
  const totalGamesNode = document.querySelector("#totalGames");
  const averageScoreNode = document.querySelector("#averageScore");
  const totalFoodNode = document.querySelector("#totalFood");
  const difficultyPicker = document.querySelector("#difficultyPicker");
  const mobilePause = document.querySelector("#mobilePause");
  const scoreNode = document.querySelector("#score");
  const bestScoreNode = document.querySelector("#bestScore");
  const speedNode = document.querySelector("#speedLevel");
  const wallCountNode = document.querySelector("#wallCount");
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
  let walls = [];
  let direction = directions.right;
  let queuedDirection = directions.right;
  let score = 0;
  let bestScore = Number.parseInt(localStorage.getItem("neon-snake-best") || "0", 10);
  let foodsEaten = 0;
  let tickInterval = difficulties.normal.startInterval;
  let lastTick = 0;
  let lastFrame = performance.now();
  let runDurationMs = 0;
  let selectedDifficulty = localStorage.getItem(DIFFICULTY_KEY) || "normal";
  let history = loadHistory();
  let touchStart = null;

  const formatScore = (value) => String(value).padStart(3, "0");

  function loadHistory() {
    try {
      const parsed = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((record) => Number.isFinite(record.score) && Number.isFinite(record.endedAt)).slice(0, 50);
    } catch {
      return [];
    }
  }

  function formatDuration(milliseconds) {
    const totalSeconds = Math.max(0, Math.round(milliseconds / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    return `${minutes}:${String(totalSeconds % 60).padStart(2, "0")}`;
  }

  function formatDate(timestamp) {
    return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit" }).format(timestamp);
  }

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
    tickInterval = difficulties[selectedDifficulty].startInterval;
    runDurationMs = 0;
    walls = generateWalls();
    food = findFoodPosition();
    lastTick = performance.now();
    updateMetrics();
    draw();
  }

  function findFoodPosition() {
    const blocked = new Set([
      ...walls.map((wall) => `${wall.x},${wall.y}`),
      ...snake.slice(1).map((part) => `${part.x},${part.y}`),
    ]);
    const visited = new Set();
    const queue = [{ ...snake[0] }];
    const openCells = [];
    while (queue.length) {
      const cell = queue.shift();
      const key = `${cell.x},${cell.y}`;
      if (visited.has(key) || blocked.has(key)) continue;
      if (cell.x < 0 || cell.x >= GRID_SIZE || cell.y < 0 || cell.y >= GRID_SIZE) continue;
      visited.add(key);
      if (cell.x !== snake[0].x || cell.y !== snake[0].y) openCells.push(cell);
      queue.push(
        { x: cell.x + 1, y: cell.y },
        { x: cell.x - 1, y: cell.y },
        { x: cell.x, y: cell.y + 1 },
        { x: cell.x, y: cell.y - 1 },
      );
    }
    return openCells[Math.floor(Math.random() * openCells.length)] || null;
  }

  function generateWalls() {
    const config = difficulties[selectedDifficulty];
    const target = Math.min(config.wallMax, Math.round(config.wallBase + foodsEaten * config.wallGrowth));
    const nextWalls = [];
    const occupied = new Set(snake.map((part) => `${part.x},${part.y}`));
    const head = snake[0];
    let attempts = 0;

    while (nextWalls.length < target && attempts < target * 20) {
      attempts += 1;
      const horizontal = Math.random() > 0.5;
      const length = 2 + Math.floor(Math.random() * 3);
      const start = {
        x: 1 + Math.floor(Math.random() * (GRID_SIZE - 2)),
        y: 1 + Math.floor(Math.random() * (GRID_SIZE - 2)),
      };
      const segment = [];
      for (let offset = 0; offset < length; offset += 1) {
        const cell = {
          x: start.x + (horizontal ? offset : 0),
          y: start.y + (horizontal ? 0 : offset),
        };
        const key = `${cell.x},${cell.y}`;
        const nearHead = Math.abs(cell.x - head.x) + Math.abs(cell.y - head.y) <= 3;
        const outsideSafeArea = cell.x < 1 || cell.x >= GRID_SIZE - 1 || cell.y < 1 || cell.y >= GRID_SIZE - 1;
        const alreadyUsed = occupied.has(key) || nextWalls.some((wall) => wall.x === cell.x && wall.y === cell.y);
        if (nearHead || outsideSafeArea || alreadyUsed) {
          segment.length = 0;
          break;
        }
        segment.push(cell);
      }
      nextWalls.push(...segment.slice(0, target - nextWalls.length));
    }
    return nextWalls;
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
        title: "吃掉光点<br>躲开墙壁",
        copy: "每吃一个光点，墙壁都会重新排列",
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
    difficultyPicker.hidden = type === "paused";
    overlay.hidden = false;
  }

  function startGame({ restart = false } = {}) {
    if (restart || state === "idle" || state === "over" || state === "won") {
      resetGame();
    }
    setState("running");
    lastTick = performance.now();
    canvas.focus({ preventScroll: true });
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
    saveRun(type);
    setState(type);
    showOverlay(type);
    if (type === "over") {
      boardFrame.dataset.flash = "true";
      window.setTimeout(() => {
        boardFrame.dataset.flash = "false";
      }, 450);
    }
  }

  function saveRun(result) {
    const record = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      score,
      foods: foodsEaten,
      duration: Math.round(runDurationMs),
      difficulty: selectedDifficulty,
      endedAt: Date.now(),
      result,
    };
    history.unshift(record);
    history = history.slice(0, 50);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    renderHistory();
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
    const hitObstacle = walls.some((wall) => wall.x === nextHead.x && wall.y === nextHead.y);
    const willEat = food && nextHead.x === food.x && nextHead.y === food.y;
    const collisionBody = willEat ? snake : snake.slice(0, -1);
    const hitSelf = collisionBody.some((part) => part.x === nextHead.x && part.y === nextHead.y);

    if (hitWall || hitObstacle || hitSelf) {
      endGame("over");
      return;
    }

    snake.unshift(nextHead);
    if (willEat) {
      score += Math.round(SCORE_PER_FOOD * difficulties[selectedDifficulty].multiplier);
      foodsEaten += 1;
      const difficulty = difficulties[selectedDifficulty];
      tickInterval = Math.max(difficulty.minInterval, difficulty.startInterval - foodsEaten * difficulty.acceleration);
      walls = generateWalls();
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
    wallCountNode.textContent = String(walls.length).padStart(2, "0");
  }

  function renderHistory() {
    const ranked = [...history]
      .sort((a, b) => b.score - a.score || a.duration - b.duration || b.endedAt - a.endedAt)
      .slice(0, 10);
    historyRows.replaceChildren();
    ranked.forEach((record, index) => {
      const row = document.createElement("tr");
      const rank = document.createElement("td");
      rank.className = index < 3 ? "rank-medal" : "";
      rank.textContent = `#${String(index + 1).padStart(2, "0")}`;
      const values = [
        formatScore(record.score),
        difficulties[record.difficulty]?.label || "标准",
        String(record.foods),
        formatDuration(record.duration),
        formatDate(record.endedAt),
      ];
      row.append(rank, ...values.map((value) => {
        const cell = document.createElement("td");
        cell.textContent = value;
        return cell;
      }));
      historyRows.append(row);
    });
    historyEmpty.hidden = ranked.length > 0;
    totalGamesNode.textContent = String(history.length);
    averageScoreNode.textContent = formatScore(
      history.length ? Math.round(history.reduce((sum, record) => sum + record.score, 0) / history.length) : 0,
    );
    totalFoodNode.textContent = String(history.reduce((sum, record) => sum + (record.foods || 0), 0));
  }

  function openHistory() {
    if (state === "running") pauseGame();
    renderHistory();
    historyDialog.showModal();
  }

  function setDifficulty(value) {
    if (!Object.hasOwn(difficulties, value)) return false;
    if (state === "running" || state === "paused") return false;
    selectedDifficulty = value;
    localStorage.setItem(DIFFICULTY_KEY, value);
    const input = document.querySelector(`input[name="difficulty"][value="${value}"]`);
    if (input) input.checked = true;
    return true;
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

  function drawWalls() {
    const cell = BOARD_SIZE / GRID_SIZE;
    const gap = 2.4;
    walls.forEach((wall) => {
      const x = wall.x * cell + gap;
      const y = wall.y * cell + gap;
      const size = cell - gap * 2;
      ctx.save();
      ctx.shadowColor = "rgba(113, 95, 255, .42)";
      ctx.shadowBlur = 10;
      ctx.fillStyle = "#6558c9";
      roundedRect(x, y, size, size, 3);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = "rgba(222, 219, 255, .42)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + 5, y + size - 4);
      ctx.lineTo(x + size - 4, y + 5);
      ctx.stroke();
      ctx.restore();
    });
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
    drawWalls();
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
    if (state === "running") runDurationMs += Math.min(time - lastFrame, 250);
    lastFrame = time;
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
        return { state, score, bestScore, speedLevel: Math.floor(foodsEaten / 3) + 1, wallCount: walls.length };
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

    safeRegister({
      name: "get_snake_leaderboard",
      title: "读取历史排行榜",
      description: "读取本机保存的前十名贪吃蛇成绩和生涯统计。",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true, untrustedContentHint: false },
      execute() {
        const ranked = [...history].sort((a, b) => b.score - a.score || a.duration - b.duration).slice(0, 10);
        return {
          totalGames: history.length,
          averageScore: history.length ? Math.round(history.reduce((sum, record) => sum + record.score, 0) / history.length) : 0,
          records: ranked,
        };
      },
    });

    safeRegister({
      name: "set_snake_difficulty",
      title: "设置游戏难度",
      description: "在新一局开始前选择轻松、标准或极速难度。",
      inputSchema: {
        type: "object",
        properties: { difficulty: { type: "string", enum: ["relaxed", "normal", "turbo"] } },
        required: ["difficulty"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute(input) {
        if (!input || !setDifficulty(input.difficulty)) throw new Error("只能在游戏开始前设置有效难度");
        return { difficulty: selectedDifficulty, label: difficulties[selectedDifficulty].label };
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
  historyButton.addEventListener("click", openHistory);
  mobileHistoryButton.addEventListener("click", openHistory);
  closeHistoryButton.addEventListener("click", () => historyDialog.close());
  historyDialog.addEventListener("click", (event) => {
    if (event.target === historyDialog) historyDialog.close();
  });
  clearHistoryButton.addEventListener("click", () => {
    if (!window.confirm("确定清空全部比赛记录和最高分吗？此操作无法撤销。")) return;
    history = [];
    bestScore = 0;
    localStorage.removeItem(HISTORY_KEY);
    localStorage.removeItem("neon-snake-best");
    updateMetrics();
    renderHistory();
  });
  document.querySelectorAll('input[name="difficulty"]').forEach((input) => {
    input.addEventListener("change", () => setDifficulty(input.value));
  });
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

  if (!Object.hasOwn(difficulties, selectedDifficulty)) selectedDifficulty = "normal";
  bestScore = Math.max(bestScore, ...history.map((record) => record.score), 0);
  setDifficulty(selectedDifficulty);
  bestScoreNode.textContent = formatScore(bestScore);
  renderHistory();
  resetGame();
  setState("idle");
  showOverlay("idle");
  resizeCanvas();
  registerWebMcpTools();
  window.requestAnimationFrame(loop);
})();

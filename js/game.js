/**
 * Flappy Pushups - Web Edition
 * Main Game Controller
 *
 * Background: LIVE CAMERA FEED (giống code Python gốc)
 * Face Detection: MediaPipe Face Mesh (chạy local trên GPU/CPU)
 * Rendering: HTML5 Canvas
 */

// Game Constants (from Python - 240 FPS -> 60 FPS)
const GameConstants = {
  ENEMY_UNLOCK_SCORE: 1, // LGBT enemy appears at score >= 2 (score > 1)
  PINK_ENEMY_UNLOCK_SCORE: 3, // Pink enemy appears at score >= 4 (score > 3)
  BOSS_TRIGGER_SCORE: 3, // Boss battle - CHANGE THIS TO TEST (mặc định: 12)
  BOSS_WARNING_DURATION_FRAMES: Math.floor(60 * 1.4), // 1.4 seconds
  BOSS_ATTACK_WARNING_FRAMES: 60, // 1 second
  BOSS_BOMB_TOTAL: 10,
  BOSS_BOMB_CHAIN_INTERVAL_FRAMES: Math.floor(60 * 0.3),
  BOSS_LASER_TOTAL: 10,
  BOSS_LASER_CHAIN_INTERVAL_FRAMES: Math.floor(60 * 0.3),
  BOSS_POST_ATTACK_DELAY_FRAMES: 60,
  BOSS_LOW_BATTERY_BLINK_PERIOD: Math.max(1, Math.floor(60 * 0.15)),
};

class Game {
  constructor() {
    // Canvas setup
    this.canvas = document.getElementById("gameCanvas");
    this.ctx = this.canvas.getContext("2d");
    this.videoElement = document.getElementById("camera");

    // Game constants (from Python)
    this.VICTORY_SCORE = 100; // High value so boss is the real goal
    this.ENEMY_SPAWN_SCORE = GameConstants.ENEMY_UNLOCK_SCORE + 1; // Score > 1 = appear at score 2+
    this.PINK_ENEMY_SPAWN_SCORE = GameConstants.PINK_ENEMY_UNLOCK_SCORE + 1; // Score > 5 = appear at score 6+
    this.BOSS_TRIGGER_SCORE = GameConstants.BOSS_TRIGGER_SCORE; // Boss appears at score 12

    // Resize canvas
    this.resizeCanvas();
    window.addEventListener("resize", () => this.resizeCanvas());

    // Game state
    this.state = "loading"; // loading, start, playing, falling, gameover, victory
    this.score = 0;
    this.highScore = parseInt(localStorage.getItem("flappyHighScore") || "0");

    // Fall animation (giống Python)
    this.fallVelocity = 0;
    this.fallRotation = 0;
    this.GRAVITY = 0.5;

    // FPS tracking
    this.fps = 0;
    this.frameCount = 0;
    this.lastFpsUpdate = 0;
    this.lastFrameTime = 0;

    // UI Scale (giống Python)
    this.uiScale = 1;

    // UI Elements
    this.ui = {
      score: document.getElementById("score"),
      speed: document.getElementById("speed-indicator"),
      fps: document.getElementById("fps-counter"),
      backend: document.getElementById("backend-info"),
      startScreen: document.getElementById("start-screen"),
      gameoverScreen: document.getElementById("gameover-screen"),
      victoryScreen: document.getElementById("victory-screen"),
      loadingScreen: document.getElementById("loading-screen"),
      loadingStatus: document.getElementById("loading-status"),
      finalScore: document.getElementById("final-score"),
      victoryScore: document.getElementById("victory-score"),
      highScoreDisplay: document.getElementById("high-score"),
    };

    // Game objects (sẽ khởi tạo sau khi load)
    this.faceDetector = null;
    this.bird = null;
    this.pipeManager = null;
    this.bulletManager = null;
    this.enemy = null; // LGBT enemy
    this.pinkEnemy = null; // Pink bird enemy
    this.boss = null; // Boss battle
    this.bossActivated = false; // Track if boss was triggered this game

    // Ground scrolling (giống Python)
    this.groundImage = new Image();
    this.groundImage.src = "assets/base.png";
    this.groundX = 0;

    // Last enemy score tracking
    this.lastEnemyScore = 0;
    this.lastPinkEnemyScore = 0;

    // Bind events
    this.bindEvents();

    // Start initialization
    this.init();
  }

  resizeCanvas() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;

    // Calculate UI scale ĐÚNG GIỐNG PYTHON
    // Get ACTUAL camera resolution from video element
    let camWidth = 640,
      camHeight = 480; // fallback
    if (this.videoElement && this.videoElement.videoWidth > 0) {
      camWidth = this.videoElement.videoWidth;
      camHeight = this.videoElement.videoHeight;
    }

    const baseSize = Math.min(camWidth, camHeight);
    const currentSize = Math.min(this.canvas.width, this.canvas.height);
    this.uiScale = currentSize / baseSize;

    // Update scale for all game objects
    if (this.bird) this.bird.setScale(this.uiScale);
    if (this.pipeManager) this.pipeManager.setScale(this.uiScale);
    if (this.enemy) this.enemy.setScale(this.uiScale);
    if (this.pinkEnemy) this.pinkEnemy.setScale(this.uiScale);
    if (this.boss) this.boss.resize(this.canvas.width, this.canvas.height);
  }

  bindEvents() {
    // Start button
    document.getElementById("startBtn").addEventListener("click", () => {
      this.startGame();
    });

    // Restart buttons
    document.getElementById("restartBtn").addEventListener("click", () => {
      this.restartGame();
    });

    document
      .getElementById("victoryRestartBtn")
      ?.addEventListener("click", () => {
        this.restartGame();
      });

    // Quit button
    document.getElementById("quitBtn")?.addEventListener("click", () => {
      window.close();
    });

    // Keyboard controls
    document.addEventListener("keydown", (e) => {
      if (e.key === "F11") {
        e.preventDefault();
        this.toggleFullscreen();
      }
      if (e.key === "r" || e.key === "R") {
        if (this.state === "gameover" || this.state === "victory") {
          this.restartGame();
        }
      }
      if (e.key === "q" || e.key === "Q") {
        if (this.state === "gameover" || this.state === "victory") {
          window.close();
        }
      }
      if (e.key === "Escape") {
        if (document.fullscreenElement) {
          document.exitFullscreen();
        }
      }
    });
  }

  async init() {
    try {
      this.updateLoadingStatus("Đang khởi tạo AI nhận diện khuôn mặt...");
      console.log("🎮 Game initialization started");

      // Initialize face detector
      this.faceDetector = new FaceDetector();

      this.faceDetector.onReady = () => {
        console.log("🎉 Face detector ready!");
        this.ui.backend.textContent = "AI: MediaPipe (WebGL GPU)";
      };

      this.faceDetector.onError = (error) => {
        console.error("❌ Face detection error:", error);

        // Show specific error message
        let errorMsg = "Lỗi AI: ";
        if (error.message.includes("Camera access denied")) {
          errorMsg += "Cần cho phép truy cập camera để chơi game";
        } else if (error.message.includes("MediaPipe")) {
          errorMsg += "Không thể tải MediaPipe. Kiểm tra kết nối internet";
        } else if (error.message.includes("timeout")) {
          errorMsg += "Quá thời gian. Thử refresh trang";
        } else {
          errorMsg += error.message;
        }

        this.updateLoadingStatus(errorMsg);

        // Show retry button after 3 seconds
        setTimeout(() => {
          const retryHTML = `
            <div style="text-align: center; color: white;">
              <p>${errorMsg}</p>
              <button onclick="location.reload()" style="padding: 10px 20px; font-size: 16px;">
                🔄 Thử lại
              </button>
            </div>
          `;
          document.body.innerHTML += retryHTML;
        }, 3000);
      };

      console.log("🤖 Starting face detector initialization...");
      const success = await this.faceDetector.init(this.videoElement);

      if (!success) {
        throw new Error("Face detector initialization failed");
      }

      this.updateLoadingStatus("Đang tải game assets...");

      // Initialize game objects
      this.bird = new Bird(this.canvas);
      this.pipeManager = new PipeManager(this.canvas);
      this.bulletManager = new BulletManager(this.canvas);
      this.enemy = new Enemy(this.canvas, this.bulletManager);
      this.pinkEnemy = new PinkEnemy(this.canvas);
      this.boss = new BossBattle(
        this.bird,
        this.canvas.width,
        this.canvas.height,
      );

      // Set initial scale
      this.bird.setScale(this.uiScale);
      this.pipeManager.setScale(this.uiScale);
      this.enemy.setScale(this.uiScale);
      this.pinkEnemy.setScale(this.uiScale);

      // Wait for assets
      await this.waitForAssets();

      this.updateLoadingStatus("Sẵn sàng!");

      // Hide loading, show start screen
      setTimeout(() => {
        this.ui.loadingScreen.classList.add("hidden");
        this.ui.startScreen.classList.remove("hidden");
        this.state = "start";

        // Start render loop to show camera background
        this.renderLoop();
      }, 500);
    } catch (error) {
      console.error("Initialization error:", error);
      this.updateLoadingStatus("Lỗi khởi tạo: " + error.message);
    }
  }

  updateLoadingStatus(message) {
    this.ui.loadingStatus.textContent = message;
  }

  async waitForAssets() {
    const images = [this.groundImage];
    await Promise.all(
      images.map((img) => {
        return new Promise((resolve) => {
          if (img.complete) resolve();
          else {
            img.onload = resolve;
            img.onerror = resolve;
          }
        });
      }),
    );
  }

  startGame() {
    this.state = "playing";
    this.score = 0;
    this.bossActivated = false;

    this.ui.startScreen.classList.add("hidden");
    this.ui.gameoverScreen.classList.add("hidden");
    this.ui.victoryScreen.classList.add("hidden");

    // Start background music when game starts
    if (window.startBackgroundMusic) {
      window.startBackgroundMusic();
    }

    // Reset all game objects
    this.bird.reset();
    this.pipeManager.reset();
    this.bulletManager.reset();
    this.enemy.reset();
    this.pinkEnemy.reset();
    this.boss.reset();

    this.updateUI();

    // Start game loop
    this.lastFrameTime = performance.now();
  }

  restartGame() {
    this.startGame();
  }

  /**
   * Main render loop (always running)
   * CRITICAL: Locked to 60 FPS to match Python (240 FPS / 4 = 60 FPS)
   */
  renderLoop() {
    const currentTime = performance.now();
    const deltaTime = currentTime - this.lastFrameTime;

    // Lock to 60 FPS (16.67ms per frame)
    // Python runs at 240 FPS, speeds multiplied by 4 for 60 FPS
    const targetFrameTime = 1000 / 60; // 16.67ms

    if (deltaTime < targetFrameTime) {
      requestAnimationFrame(() => this.renderLoop());
      return; // Skip this frame
    }

    this.lastFrameTime = currentTime;

    // Update FPS
    this.updateFPS(currentTime);

    // Always render camera background
    this.renderCameraBackground();

    // Game logic based on state
    if (this.state === "playing") {
      this.updateGame();
      this.renderGame();
    } else if (this.state === "falling") {
      this.updateFalling();
      this.renderGame();
    } else if (
      this.state === "start" ||
      this.state === "gameover" ||
      this.state === "victory"
    ) {
      // Still render game elements behind UI
      this.renderGame();
    }

    requestAnimationFrame(() => this.renderLoop());
  }

  /**
   * Vẽ camera feed làm background (GIỐNG CODE PYTHON)
   */
  renderCameraBackground() {
    const video = this.videoElement;

    if (video.readyState >= 2) {
      // HAVE_CURRENT_DATA
      // Clear canvas
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

      // Save context
      this.ctx.save();

      // Mirror camera (giống Python: mirrored X)
      this.ctx.translate(this.canvas.width, 0);
      this.ctx.scale(-1, 1);

      // Calculate aspect ratio to cover screen
      const videoAspect = video.videoWidth / video.videoHeight;
      const canvasAspect = this.canvas.width / this.canvas.height;

      let drawWidth, drawHeight, drawX, drawY;

      if (canvasAspect > videoAspect) {
        // Canvas wider than video
        drawWidth = this.canvas.width;
        drawHeight = this.canvas.width / videoAspect;
        drawX = 0;
        drawY = (this.canvas.height - drawHeight) / 2;
      } else {
        // Canvas taller than video
        drawHeight = this.canvas.height;
        drawWidth = this.canvas.height * videoAspect;
        drawX = (this.canvas.width - drawWidth) / 2;
        drawY = 0;
      }

      // Draw video frame as background
      this.ctx.drawImage(video, drawX, drawY, drawWidth, drawHeight);

      // Restore context
      this.ctx.restore();
    }
  }

  updateGame() {
    // Get face tracking data
    const faceData = this.faceDetector.getData();
    faceData.speedMultiplier = this.faceDetector.getSpeedMultiplier();

    // Calculate ground position (solid barrier)
    const groundHeight = 80 * this.uiScale;
    const groundY = this.canvas.height - groundHeight;

    // Update bird with ground as solid barrier
    this.bird.update(faceData, this.canvas.width, this.canvas.height, groundY);

    // Boss battle takes over when active
    if (this.boss.isActive()) {
      // Update boss
      const bossResult = this.boss.update(false);

      if (bossResult.hit) {
        this.startFalling();
        return;
      }

      if (bossResult.defeated) {
        this.victory();
        return;
      }

      // Check boss body collision
      if (this.boss.collide(this.bird)) {
        this.startFalling();
        return;
      }

      // Update enemies during boss battle (special boss mode)
      // LGBT enemy - shoots 5 bullets, 1 second apart
      if (!this.enemy.isActive()) {
        this.enemy.activateBossMode(this.bird.x, this.bird.y);
      }
      this.enemy.update(this.bird.x, this.bird.y);
      
      // Check LGBT enemy collision
      if (this.enemy.checkCollision(this.bird.getHitbox())) {
        this.startFalling();
        return;
      }

      // Pink enemy during boss
      if (!this.pinkEnemy.isActive()) {
        this.pinkEnemy.activate(
          this.score,
          this.bird.x,
          this.bird.y,
          this.canvas.width,
          this.canvas.height,
        );
      }
      this.pinkEnemy.update(this.bird.x, this.bird.y);
      
      // Check Pink enemy collision
      if (this.pinkEnemy.checkCollision(this.bird.getHitbox())) {
        this.startFalling();
        return;
      }

      // Update bullets
      this.bulletManager.update();
      
      // Check bullet collision
      const bulletHit = this.bulletManager.checkCollision(this.bird.getHitbox());
      if (bulletHit) {
        this.startFalling();
        return;
      }

      // Still check ground/ceiling during boss battle
      this.checkBoundaryCollision();

      // Đã xóa speed indicator
      return;
    }

    // Update pipes (only when boss not active)
    this.pipeManager.update(performance.now(), this.score, this.uiScale);

    // Check pipe passing (scoring)
    const passed = this.pipeManager.checkPassed(this.bird.x);
    if (passed > 0) {
      this.score += passed;
      this.updateUI();

      // Check if should trigger boss battle
      if (this.score >= this.BOSS_TRIGGER_SCORE && !this.bossActivated) {
        console.log("🔥 BOSS BATTLE TRIGGERED!");
        this.bossActivated = true;
        this.boss.activate();
        // Stop spawning pipes and clear existing pipes (giống Python)
        this.pipeManager.stopSpawning();
        this.pipeManager.clearAllPipes(); // Clear all pipes for boss battle
        // Không reset enemy và pinkEnemy - chúng sẽ xuất hiện trong boss battle
        // this.enemy.reset();
        // this.pinkEnemy.reset();
        return;
      }
    }

    // Activate LGBT enemy (score > 1, respawn continuously when not active)
    if (
      this.score > GameConstants.ENEMY_UNLOCK_SCORE &&
      !this.enemy.isActive() &&
      !this.bossActivated
    ) {
      this.enemy.activate(this.score, this.bird.x, this.bird.y);
    }

    // Activate Pink enemy (score >= 4, appears every 2 scores when inactive)
    if (
      this.score > GameConstants.PINK_ENEMY_UNLOCK_SCORE &&
      this.score % 2 === 0 &&
      !this.pinkEnemy.isActive() &&
      !this.bossActivated
    ) {
      this.pinkEnemy.activate(
        this.score,
        this.bird.x,
        this.bird.y,
        this.canvas.width,
        this.canvas.height,
      );
    }

    // Update enemies
    this.enemy.update(this.bird.x, this.bird.y);
    this.pinkEnemy.update();

    // Update bullets
    this.bulletManager.update();

    // Check collisions
    this.checkCollisions();

    // Đã xóa speed indicator vì chức năng tăng tốc đã bị tắt
  }

  checkBoundaryCollision() {
    // Chỉ check ceiling - chạm đất không game over
    if (this.bird.y < this.bird.height / 2) {
      this.startFalling();
    }
  }

  checkCollisions() {
    const hitbox = this.bird.getHitbox();

    // Check pipe collision
    if (this.pipeManager.checkCollision(hitbox)) {
      this.startFalling();
      return;
    }

    // Check LGBT enemy collision
    if (this.enemy.checkCollision(hitbox)) {
      this.startFalling();
      return;
    }

    // Check Pink enemy collision
    if (this.pinkEnemy.checkCollision(hitbox)) {
      this.startFalling();
      return;
    }

    // Check bullet collision (chỉ khi không mở miệng)
    if (!this.bird.mouthActive) {
      const bulletHit = this.bulletManager.checkCollision(hitbox);
      if (bulletHit) {
        this.startFalling();
        return;
      }
    }

    // Chỉ check ceiling collision - chạm đất không game over nữa
    if (this.bird.y < this.bird.height / 2) {
      this.startFalling();
      return;
    }
  }

  /**
   * Start falling animation (giống Python)
   */
  startFalling() {
    // Chỉ xử lý nếu chưa đang falling
    if (this.state === "falling") return;
    
    this.state = "falling";
    this.fallVelocity = -8 * this.uiScale; // Initial upward bump
    this.fallRotation = this.bird.rotation;

    // Stop background music IMMEDIATELY
    if (window.stopBackgroundMusic) {
      window.stopBackgroundMusic();
    }

    // Play game over sound IMMEDIATELY when hit
    const gameOverSound = document.getElementById("gameOverSound");
    if (gameOverSound) {
      gameOverSound.currentTime = 0; // Reset sound
      gameOverSound.play().catch(e => console.log("Cannot play sound:", e));
    }
  }

  /**
   * Update falling animation (giống Python)
   */
  updateFalling() {
    // Apply gravity
    this.fallVelocity += this.GRAVITY * this.uiScale;
    this.bird.y += this.fallVelocity;

    // Rotate while falling
    this.fallRotation = Math.min(90, this.fallRotation + 3);
    this.bird.rotation = (-this.fallRotation * Math.PI) / 180;

    // Check if hit ground
    const groundHeight = 80 * this.uiScale;
    if (this.bird.y > this.canvas.height - groundHeight) {
      this.bird.y = this.canvas.height - groundHeight;
      this.gameOver();
    }
  }

  renderGame() {
    // Draw pipes
    this.pipeManager.draw();

    // Draw enemies
    this.enemy.draw();
    this.pinkEnemy.draw();

    // Draw boss
    this.boss.draw(this.ctx);

    // Draw bullets
    this.bulletManager.draw();

    // Draw bird
    this.bird.draw();

    // Draw ground
    this.drawGround();
  }

  drawGround() {
    const groundHeight = 80 * this.uiScale;
    const y = this.canvas.height - groundHeight;

    if (this.groundImage.complete) {
      // Scroll ground (giống Python)
      if (this.state === "playing") {
        this.groundX -= this.pipeManager.getCurrentSpeed();
        if (this.groundX <= -this.canvas.width) {
          this.groundX = 0;
        }
      }

      // Draw tiled ground
      this.ctx.drawImage(
        this.groundImage,
        this.groundX,
        y,
        this.canvas.width,
        groundHeight,
      );
      this.ctx.drawImage(
        this.groundImage,
        this.groundX + this.canvas.width,
        y,
        this.canvas.width,
        groundHeight,
      );
    } else {
      // Fallback: brown rectangle
      this.ctx.fillStyle = "#DED895";
      this.ctx.fillRect(0, y, this.canvas.width, groundHeight);
      this.ctx.fillStyle = "#73BF2E";
      this.ctx.fillRect(0, y, this.canvas.width, 15 * this.uiScale);
    }
  }

  victory() {
    this.state = "victory";

    // Update high score
    if (this.score > this.highScore) {
      this.highScore = this.score;
      localStorage.setItem("flappyHighScore", this.highScore.toString());
    }

    // Show victory screen
    this.ui.victoryScore.textContent = this.score;
    this.ui.victoryScreen.classList.remove("hidden");
  }

  gameOver() {
    this.state = "gameover";

    // Update high score
    if (this.score > this.highScore) {
      this.highScore = this.score;
      localStorage.setItem("flappyHighScore", this.highScore.toString());
    }

    // Show game over screen with replay button (như cũ)
    this.ui.finalScore.textContent = this.score;
    this.ui.highScoreDisplay.textContent = this.highScore;
    this.ui.gameoverScreen.classList.remove("hidden");
  }

  returnToStart() {
    // Hide game over screen
    this.ui.gameoverScreen.classList.add("hidden");
    
    // Show start screen
    this.ui.startScreen.classList.remove("hidden");
    
    // Reset game state for next play
    this.state = "start";
  }

  updateUI() {
    this.ui.score.textContent = this.score;
  }

  updateFPS(currentTime) {
    this.frameCount++;

    if (currentTime - this.lastFpsUpdate >= 1000) {
      this.fps = this.frameCount;
      this.frameCount = 0;
      this.lastFpsUpdate = currentTime;
      this.ui.fps.textContent = `FPS: ${this.fps}`;
    }
  }

  toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  }
}

// Start game when DOM is loaded
document.addEventListener("DOMContentLoaded", () => {
  window.game = new Game();
});

/**
 * Pipe Class (giống code Python)
 */

class Pipe {
  constructor(canvas, x, height, uiScale) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");

    this.x = x;
    this.height = height; // Top pipe bottom Y position
    this.scored = false;

    // Pipe dimensions
    this.baseWidth = 50;
    this.width = this.baseWidth * uiScale;
    this.uiScale = uiScale;

    // Load pipe image
    this.image = new Image();
    this.image.src = "assets/pipe-green.png";

    // Gap size (4.5 * bird height, giống Python)
    this.gapMultiplier = 4.5;
    this.birdHeightPercent = 0.05; // BIRD_HEIGHT_PERCENT_TO_SCREEN
  }

  getGapSize() {
    return this.gapMultiplier * this.birdHeightPercent * this.canvas.height;
  }

  update(speed) {
    this.x -= speed;
  }

  draw() {
    const gapSize = this.getGapSize();
    const topPipeBottom = this.height;
    const bottomPipeTop = this.height + gapSize;

    if (this.image.complete) {
      // Draw top pipe (flipped)
      this.ctx.save();
      this.ctx.translate(this.x, topPipeBottom);
      this.ctx.scale(1, -1);
      this.ctx.drawImage(this.image, 0, 0, this.width, topPipeBottom);
      this.ctx.restore();

      // Draw bottom pipe
      const bottomHeight = this.canvas.height - bottomPipeTop;
      this.ctx.drawImage(
        this.image,
        this.x,
        bottomPipeTop,
        this.width,
        bottomHeight,
      );
    } else {
      // Fallback: draw colored rectangles
      this.ctx.fillStyle = "#73BF2E";

      // Top pipe
      this.ctx.fillRect(this.x, 0, this.width, topPipeBottom);

      // Bottom pipe
      this.ctx.fillRect(
        this.x,
        bottomPipeTop,
        this.width,
        this.canvas.height - bottomPipeTop,
      );

      // Pipe caps
      this.ctx.fillStyle = "#558B2F";
      this.ctx.fillRect(this.x - 5, topPipeBottom - 30, this.width + 10, 30);
      this.ctx.fillRect(this.x - 5, bottomPipeTop, this.width + 10, 30);
    }
  }

  /**
   * Check collision with bird hitbox (giống Python)
   */
  checkCollision(hitbox) {
    const gapSize = this.getGapSize();
    const topPipeBottom = this.height;
    const bottomPipeTop = this.height + gapSize;

    // Top pipe collision
    if (
      this.rectIntersect(hitbox, {
        x: this.x,
        y: 0,
        width: this.width,
        height: topPipeBottom,
      })
    ) {
      return true;
    }

    // Bottom pipe collision
    if (
      this.rectIntersect(hitbox, {
        x: this.x,
        y: bottomPipeTop,
        width: this.width,
        height: this.canvas.height - bottomPipeTop,
      })
    ) {
      return true;
    }

    return false;
  }

  rectIntersect(r1, r2) {
    return !(
      r1.x + r1.width < r2.x ||
      r2.x + r2.width < r1.x ||
      r1.y + r1.height < r2.y ||
      r2.y + r2.height < r1.y
    );
  }

  /**
   * Check if bird has passed pipe center (for scoring)
   */
  checkPassed(birdX, birdWidth) {
    const pipeCenter = this.x + this.width / 2;
    const birdCenter = birdX;

    if (!this.scored && birdCenter > pipeCenter) {
      this.scored = true;
      return true;
    }
    return false;
  }

  isOffScreen() {
    return this.x < -this.width;
  }

  setScale(scale) {
    this.width = this.baseWidth * scale;
    this.uiScale = scale;
  }
}

/**
 * Pipe Manager (giống code Python)
 */
class PipeManager {
  constructor(canvas) {
    this.canvas = canvas;
    this.pipes = [];

    // Speed settings (giống Python, adjusted for 60fps instead of 240fps)
    this.baseSpeed = 2.5 * 4; // 2.5 was for 240fps, multiply by 4 for 60fps
    this.maxSpeed = 6 * 4;
    this.speedIncrement = 0.125 * 4;
    this.currentSpeed = this.baseSpeed;

    // Spawn settings (giống Python)
    this.spawnThreshold = -0.15; // Spawn when last pipe X position < this * screenWidth
    this.spawningEnabled = true;

    this.uiScale = 1;
  }

  getCurrentSpeed() {
    return this.currentSpeed;
  }

  update(currentTime, score, uiScale) {
    this.uiScale = uiScale;

    // Calculate current speed based on score (giống Python)
    this.currentSpeed = Math.min(
      (this.baseSpeed + score * this.speedIncrement) * uiScale,
      this.maxSpeed * uiScale,
    );

    // Check if need to spawn new pipe
    this.checkSpawn();

    // Update pipe positions
    for (const pipe of this.pipes) {
      pipe.update(this.currentSpeed);
    }

    // Remove off-screen pipes
    this.pipes = this.pipes.filter((pipe) => !pipe.isOffScreen());
  }

  checkSpawn() {
    // Don't spawn if disabled (e.g., during boss battle)
    if (!this.spawningEnabled) return;
    
    // Spawn first pipe (delay để người chơi chuẩn bị)
    if (this.pipes.length === 0) {
      this.spawnPipe();
      return;
    }

    // Check last pipe position (ĐÚNG logic Python)
    // Python: if self.pipes[-1].x < SCREEN_WIDTH * PIPE_SPAWN_THRESHOLD
    // PIPE_SPAWN_THRESHOLD = -0.15 nghĩa là spawn khi pipe.x < -0.15 * screenWidth
    // Tức là pipe đã đi qua khỏi cạnh trái màn hình 15%
    // Giá trị càng âm = spawn càng muộn = khoảng cách càng xa
    const lastPipe = this.pipes[this.pipes.length - 1];
    const thresholdX = this.canvas.width * this.spawnThreshold; // = -0.15 * width

    if (lastPipe.x < thresholdX) {
      this.spawnPipe();
    }
  }

  spawnPipe() {
    // Random height (giống Python: 20% to 60% of screen height)
    const minHeight = this.canvas.height * 0.2;
    const maxHeight = this.canvas.height * 0.6;
    const height = minHeight + Math.random() * (maxHeight - minHeight);

    const pipe = new Pipe(this.canvas, this.canvas.width, height, this.uiScale);
    this.pipes.push(pipe);
  }

  draw() {
    for (const pipe of this.pipes) {
      pipe.draw();
    }
  }

  checkCollision(hitbox) {
    for (const pipe of this.pipes) {
      if (pipe.checkCollision(hitbox)) {
        return true;
      }
    }
    return false;
  }

  checkPassed(birdX) {
    let passed = 0;
    for (const pipe of this.pipes) {
      if (pipe.checkPassed(birdX, 65 * this.uiScale)) {
        passed++;
      }
    }
    return passed;
  }

  setScale(scale) {
    this.uiScale = scale;
    for (const pipe of this.pipes) {
      pipe.setScale(scale);
    }
  }

  stopSpawning() {
    this.spawningEnabled = false;
  }

  startSpawning() {
    this.spawningEnabled = true;
  }

  reset() {
    this.pipes = [];
    this.currentSpeed = this.baseSpeed;
    this.spawningEnabled = true;
  }
}

// Export
window.Pipe = Pipe;
window.PipeManager = PipeManager;

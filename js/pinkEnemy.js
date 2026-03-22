/**
 * Pink Bird Enemy Class
 * Diagonal attack enemy (appears when score > 6)
 * HOÀN TOÀN GIỐNG PYTHON - với size 0.45 scale
 */

class PinkEnemy {
  // States
  static STATE_IDLE = 0;
  static STATE_ENTERING = 1;
  static STATE_WARNING = 2;
  static STATE_ATTACK = 3;

  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");

    // Position
    this.x = -100;
    this.y = -100;
    this.enterTargetX = 0;
    this.enterTargetY = 0;

    // Size - GIỐNG PYTHON: 0.45 * original sprite size
    // Will be calculated when sprites load
    this.baseScale = 0.45; // Python: PINK_ENEMY_BASE_SCALE = 0.45
    this.baseWidth = 0; // Will be set after sprite loads
    this.baseHeight = 0; // Will be set after sprite loads
    this.width = 0;
    this.height = 0;

    // State machine
    this.state = PinkEnemy.STATE_IDLE;
    this.stateTimer = 0;
    this.active = false;

    // Movement (từ Python @ 240 FPS)
    this.velocityX = 0;
    this.velocityY = 0;
    this.enterSpeed = 16; // Python: 4 @ 240 FPS → 4 * 4 = 16 @ 60 FPS
    this.diagonalSpeed = 20; // Python: 5 @ 240 FPS → 5 * 4 = 20 @ 60 FPS
    this.fromLeft = true;

    // Warning (từ Python)
    this.warningDuration = 70; // frames (giống Python)
    this.warningFlash = 0;
    this.warningStart = { x: 0, y: 0 };
    this.warningEnd = { x: 0, y: 0 };
    this.redFlashSpeedMultiplier = 2.16; // Python: RED_FLASH_SPEED_MULTIPLIER = 2.16

    // Spawn patterns (giống Python)
    this.spawnPatterns = ["bottom_left", "top_right", "bottom_right"];
    this.spawnIndex = 0;

    // Animation
    this.sprites = [];
    this.currentFrame = 0;
    this.animationSpeed = 8;
    this.frameCount = 0;

    // Scale
    this.scale = 1;

    // Narrow screen adjustments
    this.isNarrowScreen = false;
    this.narrowSpeedMultiplier = 1.0;

    // Load sprites and calculate size
    this.loadSprites();
  }

  loadSprites() {
    const sprite1 = new Image();
    sprite1.src = "assets/pinkbird-upflap.png";

    const sprite2 = new Image();
    sprite2.src = "assets/pinkbird-upflap_2.png";

    // Set size when first sprite loads (GIỐNG PYTHON)
    sprite1.onload = () => {
      this.baseWidth = Math.max(1, Math.floor(sprite1.width * this.baseScale));
      this.baseHeight = Math.max(
        1,
        Math.floor(sprite1.height * this.baseScale),
      );
      this.width = this.baseWidth;
      this.height = this.baseHeight;
    };

    this.sprites = [sprite1, sprite2];
  }

  setScale(scale) {
    this.scale = scale;
    if (this.baseWidth > 0) {
      // Only if sprites loaded
      this.width = Math.max(1, Math.floor(this.baseWidth * scale));
      this.height = Math.max(1, Math.floor(this.baseHeight * scale));
    }
    this.enterSpeed = 16 * scale * this.narrowSpeedMultiplier;
    this.diagonalSpeed = 20 * scale * this.narrowSpeedMultiplier;
  }

  /**
   * Điều chỉnh cho màn hình hẹp
   */
  setNarrowScreenMode(isNarrow) {
    this.isNarrowScreen = isNarrow;
    // Giảm tốc độ trên màn hình hẹp
    this.narrowSpeedMultiplier = isNarrow ? 0.75 : 1.0;
    // Re-apply scale
    if (this.scale) {
      this.enterSpeed = 16 * this.scale * this.narrowSpeedMultiplier;
      this.diagonalSpeed = 20 * this.scale * this.narrowSpeedMultiplier;
    }
  }

  _setupSpawn(screenWidth, screenHeight) {
    const margin = 15 * this.scale;
    const leftX = margin;
    const rightX = screenWidth - this.width - margin;
    const topY = margin;
    let bottomY = Math.min(
      screenHeight - this.height - 80 * this.scale,
      screenHeight * 0.72,
    );
    bottomY = Math.max(topY + 40 * this.scale, bottomY);

    const pattern = this.spawnPatterns[this.spawnIndex];
    let holdX, holdY, targetX, targetY;

    if (pattern === "bottom_left") {
      holdX = leftX;
      holdY = bottomY;
      this.x = -this.width - 20 * this.scale;
      this.y = holdY;
      targetX = screenWidth + this.width;
      targetY = -this.height;
      this.fromLeft = true;
    } else if (pattern === "top_right") {
      holdX = rightX;
      holdY = topY;
      this.x = screenWidth + 20 * this.scale;
      this.y = holdY;
      targetX = -this.width;
      targetY = screenHeight + this.height;
      this.fromLeft = false;
    } else {
      // bottom_right
      holdX = rightX;
      holdY = bottomY;
      this.x = screenWidth + 20 * this.scale;
      this.y = holdY;
      targetX = -this.width;
      targetY = -this.height;
      this.fromLeft = false;
    }

    this.enterTargetX = holdX;
    this.enterTargetY = holdY;

    // Calculate velocity direction
    const dx = targetX - holdX;
    const dy = targetY - holdY;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    this.velocityX = (dx / dist) * this.diagonalSpeed;
    this.velocityY = (dy / dist) * this.diagonalSpeed;

    // Warning line
    const startX = holdX + this.width / 2;
    const startY = holdY + this.height / 2;
    const lineLen = Math.max(screenWidth, screenHeight) * 1.25;
    const endX = Math.max(
      0,
      Math.min(
        screenWidth,
        startX + (this.velocityX / this.diagonalSpeed) * lineLen,
      ),
    );
    const endY = Math.max(
      0,
      Math.min(
        screenHeight,
        startY + (this.velocityY / this.diagonalSpeed) * lineLen,
      ),
    );
    this.warningStart = { x: startX, y: startY };
    this.warningEnd = { x: endX, y: endY };

    // Next pattern
    this.spawnIndex = (this.spawnIndex + 1) % this.spawnPatterns.length;
  }

  activate(score, birdX, birdY, screenWidth, screenHeight) {
    this.active = true;
    this.state = PinkEnemy.STATE_ENTERING;
    this.stateTimer = 0;
    this._setupSpawn(screenWidth, screenHeight);
  }

  update() {
    if (!this.active) return;

    // Animation
    this.frameCount++;
    if (this.frameCount >= this.animationSpeed) {
      this.frameCount = 0;
      this.currentFrame = (this.currentFrame + 1) % this.sprites.length;
    }

    this.stateTimer++;

    switch (this.state) {
      case PinkEnemy.STATE_ENTERING:
        this.updateEntering();
        break;
      case PinkEnemy.STATE_WARNING:
        this.updateWarning();
        break;
      case PinkEnemy.STATE_ATTACK:
        this.updateAttack();
        break;
    }
  }

  updateEntering() {
    const dx = this.enterTargetX - this.x;
    const dy = this.enterTargetY - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist <= this.enterSpeed || dist === 0) {
      this.x = this.enterTargetX;
      this.y = this.enterTargetY;
      this.state = PinkEnemy.STATE_WARNING;
      this.stateTimer = 0;
    } else {
      this.x += (dx / dist) * this.enterSpeed;
      this.y += (dy / dist) * this.enterSpeed;
    }
  }

  updateWarning() {
    // Warning flash GIỐNG PYTHON với RED_FLASH_SPEED_MULTIPLIER
    this.warningFlash =
      Math.floor(
        this.stateTimer /
          Math.max(1, Math.floor(4 / this.redFlashSpeedMultiplier)),
      ) % 2;

    if (this.stateTimer >= this.warningDuration) {
      this.state = PinkEnemy.STATE_ATTACK;
      this.stateTimer = 0;
    }
  }

  updateAttack() {
    this.x += this.velocityX;
    this.y += this.velocityY;

    // Deactivate when off screen
    if (
      this.y > this.canvas.height + this.height ||
      this.y < -this.height ||
      this.x < -this.width ||
      this.x > this.canvas.width + this.width
    ) {
      this.active = false;
      this.state = PinkEnemy.STATE_IDLE;
      this.stateTimer = 0;
    }
  }

  draw() {
    if (!this.active) return;

    // Draw warning line
    if (this.state === PinkEnemy.STATE_WARNING && this.warningFlash) {
      this.ctx.save();
      this.ctx.strokeStyle = "rgba(255, 90, 90, 0.9)";
      this.ctx.lineWidth = 3;
      this.ctx.setLineDash([18 * this.scale, 18 * this.scale]);

      this.ctx.beginPath();
      this.ctx.moveTo(this.warningStart.x, this.warningStart.y);
      this.ctx.lineTo(this.warningEnd.x, this.warningEnd.y);
      this.ctx.stroke();

      // Arrow at end
      const dx = this.warningEnd.x - this.warningStart.x;
      const dy = this.warningEnd.y - this.warningStart.y;
      const angle = Math.atan2(dy, dx);
      const arrowSize = 10 * this.scale;

      this.ctx.setLineDash([]);
      this.ctx.fillStyle = "rgba(255, 90, 90, 0.9)";
      this.ctx.beginPath();
      this.ctx.moveTo(this.warningEnd.x, this.warningEnd.y);
      this.ctx.lineTo(
        this.warningEnd.x - arrowSize * Math.cos(angle - 0.5),
        this.warningEnd.y - arrowSize * Math.sin(angle - 0.5),
      );
      this.ctx.lineTo(
        this.warningEnd.x - arrowSize * Math.cos(angle + 0.5),
        this.warningEnd.y - arrowSize * Math.sin(angle + 0.5),
      );
      this.ctx.closePath();
      this.ctx.fill();

      this.ctx.restore();
    }

    // Draw enemy sprite
    const sprite = this.sprites[this.currentFrame];
    if (!sprite || !sprite.complete) return;

    this.ctx.save();

    // Flip if coming from right
    if (!this.fromLeft) {
      this.ctx.translate(this.x + this.width / 2, this.y + this.height / 2);
      this.ctx.scale(-1, 1);
      this.ctx.drawImage(
        sprite,
        -this.width / 2,
        -this.height / 2,
        this.width,
        this.height,
      );
    } else {
      this.ctx.drawImage(sprite, this.x, this.y, this.width, this.height);
    }

    this.ctx.restore();
  }

  checkCollision(hitbox) {
    if (!this.active) {
      return false;
    }

    // Chỉ không check collision khi đang entering hoặc exiting
    if (
      this.state === PinkEnemy.STATE_ENTERING ||
      this.state === PinkEnemy.STATE_IDLE
    ) {
      return false;
    }

    // Rectangle collision
    const enemyBox = {
      x: this.x,
      y: this.y,
      width: this.width,
      height: this.height,
    };

    const hit = this.rectIntersect(hitbox, enemyBox);
    if (hit) {
      console.log(`💥 Pink Enemy HIT! State: ${this.state}`);
    }
    
    return hit;
  }

  rectIntersect(r1, r2) {
    return !(
      r1.x + r1.width < r2.x ||
      r2.x + r2.width < r1.x ||
      r1.y + r1.height < r2.y ||
      r2.y + r2.height < r1.y
    );
  }

  isActive() {
    return this.active;
  }

  reset() {
    this.active = false;
    this.state = PinkEnemy.STATE_IDLE;
    this.stateTimer = 0;
    this.x = -100;
    this.y = -100;
    this.spawnIndex = 0;
  }
}

// Export
window.PinkEnemy = PinkEnemy;

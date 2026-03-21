/**
 * LGBT Enemy Fly Class (HOÀN TOÀN GIỐNG PYTHON)
 * Appears when score > 2
 * Even scores: Charge attack
 * Odd scores (if score > 3): Bullet attack
 */

class Enemy {
  // States (giống Python)
  static STATE_IDLE = 0;
  static STATE_ENTERING = 1;
  static STATE_WARNING = 2;
  static STATE_WINDUP = 3;
  static STATE_CHARGING = 4;
  static STATE_SHOOTING = 5;
  static STATE_EXITING = 6;

  // Attack modes (giống Python)
  static MODE_CHARGE = 0; // Even score - charge at player
  static MODE_SHOOT = 1; // Odd score - shoot bullets
  static SHOOT_UNLOCK_SCORE = 3; // Shoot mode only when score > 3

  constructor(canvas, bulletManager) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.bulletManager = bulletManager;

    // Position
    this.x = -100;
    this.y = canvas.height / 2;
    this.targetX = 0;
    this.targetY = 0;

    // Size - tăng 20% so với trước
    this.baseWidth = 66;  // 55 * 1.2 = 66
    this.baseHeight = 66; // 55 * 1.2 = 66
    this.width = this.baseWidth;
    this.height = this.baseHeight;

    // State machine
    this.state = Enemy.STATE_IDLE;
    this.stateTimer = 0;
    this.active = false;
    this.fromLeft = true; // First time from left

    // Attack mode (giống Python)
    this.attackMode = Enemy.MODE_CHARGE;
    this.shootingUnlocked = false;

    // Speeds (từ Python @ 240 FPS)
    this.chargeSpeed = 24; // Python: 6 @ 240 FPS → 6 * 4 = 24 @ 60 FPS
    this.enterSpeed = 16; // Python: 4 @ 240 FPS → 4 * 4 = 16 @ 60 FPS
    this.exitSpeed = 12; // Python: 3 @ 240 FPS → 3 * 4 = 12 @ 60 FPS

    // Charge attack
    this.chargeTargetX = 0;
    this.chargeTargetY = 0;
    this.windupDistance = 50;
    this.pullBackDistance = 80; // Python: 80

    // Shooting mode (giống Python)
    this.shootTimer = 0;
    this.shootInterval = 15; // Python: 60 @ 240 FPS → 15 @ 60 FPS
    this.shotsFired = 0;
    this.maxShots = 5; // Tăng từ 3 lên 5 đạn
    this.hoverAngle = 0;

    // Heart pattern (giống Python)
    this.heartT = 0;
    this.heartCenterX = 0;
    this.heartCenterY = 0;
    this.heartScale = 80;
    this.heartSpeed = 0.025; // Python: 0.025

    // Warning
    this.warningAlpha = 0;
    this.warningDuration = 30; // Python: 120 @ 240 FPS → 30 @ 60 FPS
    this.windupDuration = 20; // Python: 80 @ 240 FPS → 20 @ 60 FPS
    this.windupStartX = 0;
    this.windupShake = 0;

    // Animation
    this.sprites = [];
    this.currentFrame = 0;
    this.animationSpeed = 8;
    this.frameCount = 0;

    // Scale
    this.scale = 1;

    // Load sprites
    this.loadSprites();
  }

  loadSprites() {
    const sprite1 = new Image();
    sprite1.src = "assets/lgbtbase_1.png";

    const sprite2 = new Image();
    sprite2.src = "assets/lgbtbase_2.png";

    this.sprites = [sprite1, sprite2];
  }

  setScale(scale) {
    this.scale = scale;
    this.width = this.baseWidth * scale;
    this.height = this.baseHeight * scale;
    this.chargeSpeed = 24 * scale;
    this.enterSpeed = 16 * scale;
    this.exitSpeed = 12 * scale;
    this.windupDistance = 50 * scale;
    this.pullBackDistance = 80 * scale;
    this.heartScale = 80 * scale;
  }

  /**
   * Activate enemy with attack mode based on score (GIỐNG PYTHON)
   */
  activate(score = 0, birdX = 0, birdY = 0) {
    console.log(`🎯 LGBT Enemy activating - Score: ${score}`);

    this.active = true;
    this.shootingUnlocked = score > Enemy.SHOOT_UNLOCK_SCORE;

    // Determine attack mode based on score (giống Python logic)
    if (this.shootingUnlocked && score % 2 === 1) {
      this.attackMode = Enemy.MODE_SHOOT;
      this.shotsFired = 0;
      this.shootTimer = 0;
      if (score >= 10) {
        this.maxShots = 7; // Tăng từ 5 lên 7 khi score cao
        this.shootInterval = 8; // Python: 30 @ 240 FPS → 8 @ 60 FPS
      } else {
        this.maxShots = 5; // Tăng từ 3 lên 5 đạn
        this.shootInterval = 15; // Python: 60 @ 240 FPS → 15 @ 60 FPS
      }
      console.log(
        `🔫 SHOOT mode activated - ${this.maxShots} shots, interval: ${this.shootInterval}`,
      );
    } else {
      this.attackMode = Enemy.MODE_CHARGE;
      this.maxShots = 5; // Tăng từ 3 lên 5
      this.shootInterval = 15;
      console.log(`⚡ CHARGE mode activated`);
    }

    // Set charge target ONCE - LOCKED position when spawned (giống Python)
    this.chargeTargetY = birdY || this.canvas.height / 2;
    this.chargeTargetX = birdX || this.canvas.width / 2; // For diagonal charges

    // Start position (giống Python)
    if (this.fromLeft) {
      this.x = -this.width - 20;
    } else {
      this.x = this.canvas.width + 20;
    }

    this.y = this.chargeTargetY - this.height / 2;
    this.state = Enemy.STATE_ENTERING;
    this.stateTimer = 0;
    this.hoverAngle = 0;

    console.log(
      `📍 Enemy spawned at (${this.x}, ${this.y}) targeting Y: ${this.chargeTargetY}`,
    );
  }

  update(birdX, birdY) {
    if (!this.active) return;

    // DON'T continuously update charge target - only set once in activate()!
    // This was the bug - enemy should charge to LOCKED position, not chase player

    // Animation
    this.frameCount++;
    if (this.frameCount >= this.animationSpeed) {
      this.frameCount = 0;
      this.currentFrame = (this.currentFrame + 1) % this.sprites.length;
    }

    this.stateTimer++;

    switch (this.state) {
      case Enemy.STATE_ENTERING:
        this.updateEntering();
        break;
      case Enemy.STATE_WARNING:
        this.updateWarning();
        break;
      case Enemy.STATE_WINDUP:
        this.updateWindup();
        break;
      case Enemy.STATE_CHARGING:
        this.updateCharging();
        break;
      case Enemy.STATE_SHOOTING:
        this.updateShooting(birdX, birdY);
        break;
      case Enemy.STATE_EXITING:
        this.updateExiting();
        break;
    }
  }

  updateEntering() {
    // Entry logic GIỐNG PYTHON
    if (this.fromLeft) {
      // Stay further away when shooting mode (giống Python)
      const targetX =
        this.attackMode === Enemy.MODE_SHOOT
          ? this.canvas.width * 0.03 // 3% for shooting
          : this.canvas.width * 0.08; // 8% for charging

      this.x += this.enterSpeed;
      if (this.x >= targetX) {
        this.x = targetX;
        this.transitionAfterEntering();
      }
    } else {
      // Right side
      const targetX =
        this.attackMode === Enemy.MODE_SHOOT
          ? this.canvas.width * 0.97 // 97% for shooting
          : this.canvas.width * 0.92; // 92% for charging

      this.x -= this.enterSpeed;
      if (this.x <= targetX) {
        this.x = targetX;
        this.transitionAfterEntering();
      }
    }

    this.y = this.chargeTargetY - this.height / 2;
  }

  transitionAfterEntering() {
    // Choose next state based on attack mode (giống Python)
    if (this.attackMode === Enemy.MODE_SHOOT) {
      console.log(`🔫 Transitioning to SHOOTING state`);
      this.state = Enemy.STATE_SHOOTING;
      this.shotsFired = 0;
      this.shootTimer = 0;
    } else {
      console.log(`⚡ Transitioning to WARNING state (charge mode)`);
      this.state = Enemy.STATE_WARNING;
    }
    this.stateTimer = 0;
  }

  updateWarning() {
    // Flash warning line (giống Python)
    this.warningAlpha = 0.5 + Math.sin(this.stateTimer * 0.1) * 0.5;

    // After warning duration, start windup
    if (this.stateTimer > this.warningDuration) {
      this.state = Enemy.STATE_WINDUP;
      this.stateTimer = 0;
      this.windupStartX = this.x;
    }
  }

  updateWindup() {
    // Pull back before charge (giống Python)
    const progress = this.stateTimer / this.windupDuration;
    const pullAmount = Math.sin(progress * Math.PI) * this.pullBackDistance;
    this.windupShake = (Math.random() - 0.5) * 4; // Shake effect

    if (this.fromLeft) {
      this.x = this.windupStartX - pullAmount;
    } else {
      this.x = this.windupStartX + pullAmount;
    }

    // After windup, charge!
    if (this.stateTimer > this.windupDuration) {
      this.state = Enemy.STATE_CHARGING;
      this.stateTimer = 0;
      // chargeTarget already being updated in update() method
    }
  }

  updateCharging() {
    // Charge HORIZONTALLY in straight line (giống Python)
    // Y position is LOCKED, only X moves
    if (this.fromLeft) {
      this.x += this.chargeSpeed;
      // Exit when off screen on the right
      if (this.x > this.canvas.width + this.width + 50) {
        this.state = Enemy.STATE_EXITING;
        this.stateTimer = 0;
      }
    } else {
      this.x -= this.chargeSpeed;
      // Exit when off screen on the left
      if (this.x < -this.width - 50) {
        this.state = Enemy.STATE_EXITING;
        this.stateTimer = 0;
      }
    }

    // Y position stays LOCKED at target Y (giống Python)
    this.y = this.chargeTargetY - this.height / 2;
  }

  updateShooting(birdX, birdY) {
    // Hover up and down while shooting (giống Python)
    this.hoverAngle += 0.05;
    const hoverOffset = Math.sin(this.hoverAngle) * 30 * this.scale;
    this.y = this.canvas.height / 2 + hoverOffset - this.height / 2;

    // Shooting logic
    this.shootTimer++;
    if (
      this.shootTimer >= this.shootInterval &&
      this.shotsFired < this.maxShots
    ) {
      console.log(`💥 Firing bullet ${this.shotsFired + 1}/${this.maxShots}`);
      this.fireBullet(birdX, birdY);
      this.shotsFired++;
      this.shootTimer = 0;
    }

    // Exit after shooting all bullets + delay
    if (this.shotsFired >= this.maxShots && this.stateTimer > 60) {
      // 1 second delay
      console.log(`🚪 All bullets fired, exiting...`);
      this.startExit();
    }
  }

  updateExiting() {
    // Exit at constant speed (giống Python)
    if (this.fromLeft) {
      this.x += this.exitSpeed;
    } else {
      this.x -= this.exitSpeed;
    }

    // Check if completely exited (giống Python thresholds)
    if (
      (this.fromLeft && this.x > this.canvas.width + this.width + 50) ||
      (!this.fromLeft && this.x < -this.width - 50)
    ) {
      console.log(`🔄 Enemy exited, respawning from opposite side`);

      this.state = Enemy.STATE_IDLE;
      this.active = false;
      this.fromLeft = !this.fromLeft; // Alternate side for next attack

      // Reset state for next spawn
      this.stateTimer = 0;
      this.shotsFired = 0;
      this.shootTimer = 0;
    }
  }

  startExit() {
    this.state = Enemy.STATE_EXITING;
    this.stateTimer = 0;
  }

  fireBullet(targetX, targetY) {
    // Fire rainbow bullet toward player (giống Python)
    const bulletSpeed = 8 * this.scale;
    this.bulletManager.spawnBullet(
      this.x + this.width / 2,
      this.y + this.height / 2,
      targetX,
      targetY,
      bulletSpeed,
    );
  }

  draw() {
    if (!this.active) return;

    // Draw warning line during warning state - FULL SCREEN (giống Python)
    if (this.state === Enemy.STATE_WARNING) {
      this.ctx.save();
      this.ctx.strokeStyle = `rgba(255, 0, 0, ${this.warningAlpha})`;
      this.ctx.lineWidth = 4 * this.scale;
      this.ctx.setLineDash([10 * this.scale, 10 * this.scale]);

      // Draw line from enemy to opposite edge (FULL SCREEN)
      const startX = this.x + this.width / 2;
      const startY = this.y + this.height / 2;

      // Line goes to opposite edge of screen (giống Python)
      const endX = this.fromLeft ? this.canvas.width : 0;
      const endY = startY;

      this.ctx.beginPath();
      this.ctx.moveTo(startX, startY);
      this.ctx.lineTo(endX, endY);
      this.ctx.stroke();
      this.ctx.restore();
    }

    // Draw enemy sprite
    const sprite = this.sprites[this.currentFrame];
    if (!sprite || !sprite.complete) return;

    this.ctx.save();

    // Add windup shake effect
    const shakeX = this.state === Enemy.STATE_WINDUP ? this.windupShake : 0;

    // Flip sprite based on direction (giống Python)
    if (!this.fromLeft) {
      this.ctx.translate(this.x + shakeX, this.y);
      this.ctx.scale(-1, 1);
      this.ctx.drawImage(
        sprite,
        -this.width / 2,
        -this.height / 2,
        this.width,
        this.height,
      );
    } else {
      this.ctx.drawImage(
        sprite,
        this.x - this.width / 2 + shakeX,
        this.y - this.height / 2,
        this.width,
        this.height,
      );
    }

    this.ctx.restore();
  }

  /**
   * Check collision with bird (giống Python)
   */
  checkCollision(hitbox) {
    if (!this.active) return false;

    // No collision during entering/exiting
    if (
      this.state === Enemy.STATE_ENTERING ||
      this.state === Enemy.STATE_EXITING ||
      this.state === Enemy.STATE_IDLE
    ) {
      return false;
    }

    // Circle-rectangle collision
    const centerX = hitbox.x + hitbox.width / 2;
    const centerY = hitbox.y + hitbox.height / 2;

    const dx = centerX - this.x;
    const dy = centerY - this.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    const combinedRadius = (this.width / 2 + hitbox.width / 2) * 0.7;

    return distance < combinedRadius;
  }

  isActive() {
    return this.active && this.state !== Enemy.STATE_IDLE;
  }

  reset() {
    this.state = Enemy.STATE_IDLE;
    this.active = false;
    this.stateTimer = 0;
    this.shotsFired = 0;
    this.hoverAngle = 0;
    this.x = -100;
  }
}

// Export
window.Enemy = Enemy;

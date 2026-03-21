/**
 * Bird (Bug) Class
 * Face-controlled player character (giống code Python)
 */

class Bird {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");

    // Position
    this.x = canvas.width / 4;
    this.y = canvas.height / 2;
    this.targetX = this.x;
    this.targetY = this.y;

    // Position history for smoothing (giống Python: 5 elements)
    this.xHistory = [this.x, this.x, this.x, this.x, this.x];
    this.yHistory = [this.y, this.y, this.y, this.y, this.y];

    // Last detected position
    this.lastDetectedX = this.x;
    this.lastDetectedY = this.y;

    // Size
    this.baseWidth = 65;
    this.baseHeight = 65;
    this.width = this.baseWidth;
    this.height = this.baseHeight;

    // Movement (từ Python @ 240 FPS: maxSpeed = 50)
    // Web @ 60 FPS: 50 * 4 = 200, nhưng sau smoothing cần ~67 cho cùng tốc độ thực
    this.deadZone = 1;
    this.maxSpeed = 67; // Converted from Python 50 @ 240 FPS
    this.velocityX = 0;
    this.velocityY = 0;

    // Rotation
    this.rotation = 0; // radians
    this.targetRotation = 0;

    // Animation
    this.sprites = [];
    this.currentFrame = 0;
    this.animationSpeed = 8; // Frames between changes
    this.frameCount = 0;

    // Hitbox (50% of sprite size for fairness, giống Python)
    this.hitboxScale = 0.5;

    // Mouth detection
    this.mouthRadius = 40;
    this.mouthActive = false;
    this.speedMultiplier = 1.0;

    // Scale
    this.scale = 1;

    // Offset (bird appears to left of face, giống Python: 15% offset)
    this.xOffset = 0.15;

    // Load sprites
    this.loadSprites();
  }

  loadSprites() {
    const sprite1 = new Image();
    sprite1.src = "assets/bug_1.png";

    const sprite2 = new Image();
    sprite2.src = "assets/bug_2.png";

    this.sprites = [sprite1, sprite2];
  }

  setScale(scale) {
    this.scale = scale;
    this.width = this.baseWidth * scale;
    this.height = this.baseHeight * scale;
    this.mouthRadius = 40 * scale;
    this.maxSpeed = 67 * scale; // Scaled movement speed
    this.deadZone = 1 * scale;
  }

  /**
   * Update bird position based on face tracking data (giống Python)
   */
  update(faceData, screenWidth, screenHeight) {
    if (faceData && faceData.faceDetected) {
      // Map face position to screen (face position is 0-1)
      // Mirror X đã được xử lý trong faceDetection.js
      let screenX = faceData.x * screenWidth;
      let screenY = faceData.y * screenHeight;

      // Offset bird to the left of face (giống Python: 15% offset)
      screenX = screenX - screenWidth * this.xOffset;

      // Clamp to screen bounds
      screenX = Math.max(
        this.width / 2,
        Math.min(screenWidth - this.width / 2, screenX),
      );
      screenY = Math.max(
        this.height / 2,
        Math.min(screenHeight - this.height / 2, screenY),
      );

      this.lastDetectedX = screenX;
      this.lastDetectedY = screenY;
      this.targetX = screenX;
      this.targetY = screenY;

      // Get speed multiplier from mouth
      this.speedMultiplier = faceData.speedMultiplier || 1.0;
      this.mouthActive = faceData.isMouthOpen;
    } else {
      this.targetX = this.lastDetectedX;
      this.targetY = this.lastDetectedY;
    }

    // Store old position for velocity calculation
    const oldX = this.x;
    const oldY = this.y;

    // Update X position with weighted smoothing (giống Python)
    if (Math.abs(this.targetX - this.x) > this.deadZone) {
      const direction = this.targetX > this.x ? 1 : -1;
      // Apply speed multiplier for mouth open boost (giống Python)
      const effectiveMaxSpeed = this.maxSpeed * this.speedMultiplier;
      const moveAmount = Math.min(
        Math.abs(this.targetX - this.x),
        effectiveMaxSpeed,
      );
      const newX = this.x + direction * moveAmount;

      // Add to history
      this.xHistory.shift();
      this.xHistory.push(newX);

      // Weighted average: newer values have more weight (giống Python: 1,2,3,4,5 weights)
      this.x =
        (this.xHistory[0] +
          2 * this.xHistory[1] +
          3 * this.xHistory[2] +
          4 * this.xHistory[3] +
          5 * this.xHistory[4]) /
        15;
    }

    // Update Y position with weighted smoothing
    if (Math.abs(this.targetY - this.y) > this.deadZone) {
      const direction = this.targetY > this.y ? 1 : -1;
      // Apply speed multiplier for mouth open boost
      const effectiveMaxSpeed = this.maxSpeed * this.speedMultiplier;
      const moveAmount = Math.min(
        Math.abs(this.targetY - this.y),
        effectiveMaxSpeed,
      );
      const newY = this.y + direction * moveAmount;

      this.yHistory.shift();
      this.yHistory.push(newY);

      this.y =
        (this.yHistory[0] +
          2 * this.yHistory[1] +
          3 * this.yHistory[2] +
          4 * this.yHistory[3] +
          5 * this.yHistory[4]) /
        15;
    }

    // Calculate velocity for rotation
    this.velocityX = this.x - oldX;
    this.velocityY = this.y - oldY;

    // Update rotation based on velocity (giống Python: up = 45°, down = -45°)
    const velocityThreshold = 1.5 * this.scale;
    if (this.velocityY < -velocityThreshold) {
      // Moving up
      this.targetRotation = (45 * Math.PI) / 180;
    } else if (this.velocityY > velocityThreshold) {
      // Moving down
      this.targetRotation = (-45 * Math.PI) / 180;
    } else {
      this.targetRotation = 0;
    }

    // Smooth rotation transition
    const rotationSpeed = (4 * Math.PI) / 180;
    if (this.rotation < this.targetRotation) {
      this.rotation = Math.min(
        this.rotation + rotationSpeed,
        this.targetRotation,
      );
    } else if (this.rotation > this.targetRotation) {
      this.rotation = Math.max(
        this.rotation - rotationSpeed,
        this.targetRotation,
      );
    }

    // Update wing flapping animation
    this.frameCount++;
    if (this.frameCount >= this.animationSpeed) {
      this.frameCount = 0;
      this.currentFrame = (this.currentFrame + 1) % this.sprites.length;
    }
  }

  draw() {
    const sprite = this.sprites[this.currentFrame];
    if (!sprite || !sprite.complete) return;

    this.ctx.save();

    // Move to bird center and rotate
    this.ctx.translate(this.x, this.y);
    this.ctx.rotate(this.rotation);

    // Draw sprite centered
    this.ctx.drawImage(
      sprite,
      -this.width / 2,
      -this.height / 2,
      this.width,
      this.height,
    );

    // Draw mouth indicator when active (giống Python)
    if (this.mouthActive) {
      this.ctx.beginPath();
      this.ctx.arc(0, this.height * 0.2, this.mouthRadius, 0, Math.PI * 2);
      this.ctx.strokeStyle = "rgba(0, 255, 136, 0.7)";
      this.ctx.lineWidth = 3;
      this.ctx.stroke();
    }

    this.ctx.restore();
  }

  /**
   * Get hitbox for collision detection (50% of sprite, giống Python)
   */
  getHitbox() {
    const hitWidth = this.width * this.hitboxScale;
    const hitHeight = this.height * this.hitboxScale;

    return {
      x: this.x - hitWidth / 2,
      y: this.y - hitHeight / 2,
      width: hitWidth,
      height: hitHeight,
    };
  }

  /**
   * Get mouth area for bullet eating
   */
  getMouthArea() {
    return {
      x: this.x,
      y: this.y + this.height * 0.2,
      radius: this.mouthRadius * 1.2, // Generous detection
      active: this.mouthActive,
    };
  }

  reset() {
    this.x = this.canvas.width / 4;
    this.y = this.canvas.height / 2;
    this.targetX = this.x;
    this.targetY = this.y;
    this.lastDetectedX = this.x;
    this.lastDetectedY = this.y;
    this.xHistory = [this.x, this.x, this.x, this.x, this.x];
    this.yHistory = [this.y, this.y, this.y, this.y, this.y];
    this.rotation = 0;
    this.targetRotation = 0;
    this.velocityX = 0;
    this.velocityY = 0;
    this.speedMultiplier = 1.0;
    this.mouthActive = false;
  }
}

// Export
window.Bird = Bird;

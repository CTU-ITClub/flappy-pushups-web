/**
 * Rainbow Bullet Class
 * Physics-based bouncing projectiles
 */

class Bullet {
  constructor(canvas, x, y, velocityX, velocityY) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");

    this.x = x;
    this.y = y;
    this.velocityX = velocityX;
    this.velocityY = velocityY;

    this.radius = 12;
    this.maxBounces = 2;
    this.bounceCount = 0;

    // Rainbow color cycling
    this.hue = Math.random() * 360;
    this.hueSpeed = 3; // Degrees per frame

    // Trail effect
    this.trail = [];
    this.maxTrailLength = 10;

    // Hitbox scale (bullet radius for collision)
    this.hitboxScale = 0.8;

    this.active = true;
  }

  update() {
    if (!this.active) return;

    // Store position for trail
    this.trail.push({ x: this.x, y: this.y, hue: this.hue });
    if (this.trail.length > this.maxTrailLength) {
      this.trail.shift();
    }

    // Update position
    this.x += this.velocityX;
    this.y += this.velocityY;

    // Update rainbow color
    this.hue = (this.hue + this.hueSpeed) % 360;

    // Bounce off walls
    if (this.y - this.radius < 0 || this.y + this.radius > this.canvas.height) {
      this.velocityY = -this.velocityY;
      this.bounceCount++;
      this.y = Math.max(
        this.radius,
        Math.min(this.canvas.height - this.radius, this.y),
      );
    }

    // Deactivate after max bounces or off screen
    if (
      this.bounceCount >= this.maxBounces ||
      this.x < -this.radius * 2 ||
      this.x > this.canvas.width + this.radius * 2
    ) {
      this.active = false;
    }
  }

  draw() {
    if (!this.active) return;

    // Draw trail
    for (let i = 0; i < this.trail.length; i++) {
      const point = this.trail[i];
      const alpha = (i / this.trail.length) * 0.5;
      const size = this.radius * 0.5 * (i / this.trail.length);

      this.ctx.beginPath();
      this.ctx.arc(point.x, point.y, size, 0, Math.PI * 2);
      this.ctx.fillStyle = `hsla(${point.hue}, 100%, 50%, ${alpha})`;
      this.ctx.fill();
    }

    // Draw bullet with glow
    this.ctx.save();

    // Glow effect
    this.ctx.shadowColor = `hsl(${this.hue}, 100%, 50%)`;
    this.ctx.shadowBlur = 15;

    // Main bullet
    this.ctx.beginPath();
    this.ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);

    // Gradient fill
    const gradient = this.ctx.createRadialGradient(
      this.x,
      this.y,
      0,
      this.x,
      this.y,
      this.radius,
    );
    gradient.addColorStop(0, `hsl(${this.hue}, 100%, 80%)`);
    gradient.addColorStop(0.5, `hsl(${this.hue}, 100%, 50%)`);
    gradient.addColorStop(1, `hsl(${(this.hue + 30) % 360}, 100%, 40%)`);

    this.ctx.fillStyle = gradient;
    this.ctx.fill();

    // White center highlight
    this.ctx.beginPath();
    this.ctx.arc(this.x - 3, this.y - 3, this.radius * 0.3, 0, Math.PI * 2);
    this.ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
    this.ctx.fill();

    this.ctx.restore();
  }

  /**
   * Check collision with bird hitbox
   */
  checkCollision(hitbox) {
    if (!this.active) return false;

    // Circle-rectangle collision
    const closestX = Math.max(
      hitbox.x,
      Math.min(this.x, hitbox.x + hitbox.width),
    );
    const closestY = Math.max(
      hitbox.y,
      Math.min(this.y, hitbox.y + hitbox.height),
    );

    const dx = this.x - closestX;
    const dy = this.y - closestY;
    const distance = Math.sqrt(dx * dx + dy * dy);

    return distance < this.radius * this.hitboxScale;
  }

  /**
   * Check if bullet can be eaten by mouth
   */
  checkEaten(mouthArea) {
    if (!this.active || !mouthArea.active) return false;

    const dx = this.x - mouthArea.x;
    const dy = this.y - mouthArea.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    return distance < mouthArea.radius * 1.2;
  }

  getPosition() {
    return { x: this.x, y: this.y };
  }
}

/**
 * Bullet Manager
 * Handles bullet spawning and management
 */
class BulletManager {
  constructor(canvas) {
    this.canvas = canvas;
    this.bullets = [];
  }

  /**
   * Spawn a bullet from enemy position towards target
   */
  spawnBullet(fromX, fromY, targetX, targetY, speed = 8) {
    const dx = targetX - fromX;
    const dy = targetY - fromY;
    const distance = Math.sqrt(dx * dx + dy * dy);

    const velocityX = (dx / distance) * speed;
    const velocityY = (dy / distance) * speed;

    const bullet = new Bullet(this.canvas, fromX, fromY, velocityX, velocityY);
    this.bullets.push(bullet);

    return bullet;
  }

  /**
   * Spawn bullet in a specific direction
   */
  spawnBulletDirectional(x, y, angle, speed = 8) {
    const velocityX = Math.cos(angle) * speed;
    const velocityY = Math.sin(angle) * speed;

    const bullet = new Bullet(this.canvas, x, y, velocityX, velocityY);
    this.bullets.push(bullet);

    return bullet;
  }

  update() {
    for (const bullet of this.bullets) {
      bullet.update();
    }

    // Remove inactive bullets
    this.bullets = this.bullets.filter((bullet) => bullet.active);
  }

  draw() {
    for (const bullet of this.bullets) {
      bullet.draw();
    }
  }

  /**
   * Check collision with bird hitbox
   */
  checkCollision(hitbox) {
    for (const bullet of this.bullets) {
      if (bullet.checkCollision(hitbox)) {
        console.log(`💥 Bullet HIT! Bullet(${bullet.x.toFixed(0)}, ${bullet.y.toFixed(0)}), Hitbox scale: ${bullet.hitboxScale}`);
        return bullet;
      }
    }
    return null;
  }

  /**
   * Check if any bullet can be eaten
   */
  checkEaten(mouthArea) {
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      if (this.bullets[i].checkEaten(mouthArea)) {
        this.bullets[i].active = false;
        return true;
      }
    }
    return false;
  }

  reset() {
    this.bullets = [];
  }
}

// Export
window.Bullet = Bullet;
window.BulletManager = BulletManager;

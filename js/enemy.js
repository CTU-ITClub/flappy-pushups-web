/**
 * LGBT Enemy Fly Class (giống code Python)
 * Appears when score > 2
 * Even scores: Charge attack
 * Odd scores: Bullet attack
 */

class Enemy {
    // States (giống Python)
    static STATE_IDLE = 0;
    static STATE_ENTERING = 1;
    static STATE_WARNING = 2;
    static STATE_WINDUP = 3;
    static STATE_CHARGING = 4;
    static STATE_SHOOTING = 5;
    static STATE_HEART = 6;
    static STATE_EXITING = 7;
    
    constructor(canvas, bulletManager) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.bulletManager = bulletManager;
        
        // Position
        this.x = -100;
        this.y = canvas.height / 2;
        this.targetX = 0;
        this.targetY = 0;
        
        // Size
        this.baseWidth = 55;
        this.baseHeight = 55;
        this.width = this.baseWidth;
        this.height = this.baseHeight;
        
        // State machine
        this.state = Enemy.STATE_IDLE;
        this.stateTimer = 0;
        this.active = false;
        this.fromLeft = true;
        this.attackType = 'charge';  // 'charge' or 'bullet'
        
        // Charge attack (từ Python @ 240 FPS)
        this.chargeTargetX = 0;
        this.chargeTargetY = 0;
        this.chargeSpeed = 24;  // Python: 6 @ 240 FPS → 6 * 4 = 24 @ 60 FPS
        this.enterSpeed = 16;   // Python: 4 @ 240 FPS → 4 * 4 = 16 @ 60 FPS
        this.windupDistance = 50;
        
        // Heart pattern (giống Python)
        this.heartT = 0;
        this.heartCenterX = 0;
        this.heartCenterY = 0;
        this.heartScale = 80;
        
        // Warning
        this.warningAlpha = 0;
        
        // Animation
        this.sprites = [];
        this.currentFrame = 0;
        this.animationSpeed = 8;
        this.frameCount = 0;
        
        // Scale
        this.scale = 1;
        
        // Bullet fired flag
        this.bulletFired = false;
        
        // Load sprites
        this.loadSprites();
    }
    
    loadSprites() {
        const sprite1 = new Image();
        sprite1.src = 'assets/lgbtbase_1.png';
        
        const sprite2 = new Image();
        sprite2.src = 'assets/lgbtbase_2.png';
        
        this.sprites = [sprite1, sprite2];
    }
    
    setScale(scale) {
        this.scale = scale;
        this.width = this.baseWidth * scale;
        this.height = this.baseHeight * scale;
        this.chargeSpeed = 24 * scale;
        this.enterSpeed = 16 * scale;
        this.windupDistance = 50 * scale;
        this.heartScale = 80 * scale;
    }
    
    /**
     * Activate enemy (giống Python logic)
     * Even scores: Charge attack
     * Odd scores: Bullet attack
     */
    activate(score, birdY) {
        if (this.state !== Enemy.STATE_IDLE) return;
        
        this.active = true;
        this.fromLeft = score % 2 === 0;  // Alternate sides
        this.state = Enemy.STATE_ENTERING;
        this.stateTimer = 0;
        this.bulletFired = false;
        
        // Set entry position
        if (this.fromLeft) {
            this.x = -this.width;
        } else {
            this.x = this.canvas.width + this.width;
        }
        this.y = birdY;
        this.targetY = birdY;
        
        // Determine attack type based on score (giống Python)
        // Even scores (2, 4, 6...): charge attack
        // Odd scores (3, 5, 7...): bullet attack
        this.attackType = (score % 2 === 0) ? 'charge' : 'bullet';
    }
    
    update(birdX, birdY) {
        if (!this.active) return;
        
        // Animation
        this.frameCount++;
        if (this.frameCount >= this.animationSpeed) {
            this.frameCount = 0;
            this.currentFrame = (this.currentFrame + 1) % this.sprites.length;
        }
        
        this.stateTimer++; // Count frames, not milliseconds
        
        switch (this.state) {
            case Enemy.STATE_ENTERING:
                this.updateEntering(birdX, birdY);
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
            case Enemy.STATE_HEART:
                this.updateHeartPattern();
                break;
            case Enemy.STATE_EXITING:
                this.updateExiting();
                break;
        }
    }
    
    updateEntering(birdX, birdY) {
        // Entry position (giống Python)
        const entryX = this.fromLeft ? 100 * this.scale : this.canvas.width - 100 * this.scale;
        
        // Smooth approach
        this.x += (entryX - this.x) * 0.08;
        this.y += (birdY - this.y) * 0.05;
        
        // Check if in position
        if (Math.abs(this.x - entryX) < 10) {
            if (this.attackType === 'charge') {
                this.state = Enemy.STATE_WARNING;
                this.chargeTargetX = birdX;
                this.chargeTargetY = birdY;
            } else {
                this.state = Enemy.STATE_SHOOTING;
            }
            this.stateTimer = 0;
        }
    }
    
    updateWarning() {
        // Flash warning line (giống Python)
        this.warningAlpha = 0.5 + Math.sin(this.stateTimer * 0.1) * 0.5;
        
        // After 60 frames (~1 second at 60fps), start windup
        if (this.stateTimer > 60) {
            this.state = Enemy.STATE_WINDUP;
            this.stateTimer = 0;
        }
    }
    
    updateWindup() {
        // Pull back before charge (giống Python)
        const pullbackX = this.fromLeft ? -this.windupDistance : this.windupDistance;
        this.x += pullbackX * 0.05;
        
        // After 18 frames (~0.3 second), charge
        if (this.stateTimer > 18) {
            this.state = Enemy.STATE_CHARGING;
            this.stateTimer = 0;
        }
    }
    
    updateCharging() {
        // Charge towards locked target (giống Python)
        const dx = this.chargeTargetX - this.x;
        const dy = this.chargeTargetY - this.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance > 5) {
            this.x += (dx / distance) * this.chargeSpeed;
            this.y += (dy / distance) * this.chargeSpeed;
        } else {
            // Start heart pattern after reaching target
            this.state = Enemy.STATE_HEART;
            this.stateTimer = 0;
            this.heartT = 0;
            this.heartCenterX = this.x;
            this.heartCenterY = this.y;
        }
    }
    
    updateShooting(birdX, birdY) {
        // Follow bird Y position smoothly
        this.y += (birdY - this.y) * 0.05;
        
        // Fire bullet after 30 frames (~0.5 second at 60fps)
        if (this.stateTimer > 30 && !this.bulletFired) {
            this.bulletManager.spawnBullet(this.x, this.y, birdX, birdY, 8 * this.scale);
            this.bulletFired = true;
        }
        
        // Exit after 90 frames (~1.5 seconds)
        if (this.stateTimer > 90) {
            this.state = Enemy.STATE_EXITING;
            this.stateTimer = 0;
        }
    }
    
    updateHeartPattern() {
        // Heart parametric equations (giống Python)
        this.heartT += 0.05;
        
        const t = this.heartT;
        const heartX = 16 * Math.pow(Math.sin(t), 3);
        const heartY = -(13 * Math.cos(t) - 5 * Math.cos(2*t) - 2 * Math.cos(3*t) - Math.cos(4*t));
        
        this.x = this.heartCenterX + heartX * (this.heartScale / 16);
        this.y = this.heartCenterY + heartY * (this.heartScale / 16);
        
        // Complete heart pattern (2π)
        if (this.heartT > Math.PI * 2) {
            this.state = Enemy.STATE_EXITING;
            this.stateTimer = 0;
        }
    }
    
    updateExiting() {
        // Exit to opposite side (giống Python)
        const exitX = this.fromLeft ? this.canvas.width + this.width : -this.width;
        this.x += (exitX - this.x) * 0.03;
        
        // Check if exited
        if (this.x < -this.width * 2 || this.x > this.canvas.width + this.width * 2) {
            this.state = Enemy.STATE_IDLE;
            this.active = false;
            this.fromLeft = !this.fromLeft;  // Alternate side for next attack
        }
    }
    
    draw() {
        if (!this.active) return;
        
        // Draw warning line during warning state (giống Python)
        if (this.state === Enemy.STATE_WARNING) {
            this.ctx.save();
            this.ctx.strokeStyle = `rgba(255, 0, 0, ${this.warningAlpha})`;
            this.ctx.lineWidth = 3;
            this.ctx.setLineDash([10, 10]);
            
            this.ctx.beginPath();
            this.ctx.moveTo(this.x, this.y);
            this.ctx.lineTo(this.chargeTargetX, this.chargeTargetY);
            this.ctx.stroke();
            
            this.ctx.restore();
        }
        
        // Draw enemy sprite
        const sprite = this.sprites[this.currentFrame];
        if (!sprite || !sprite.complete) return;
        
        this.ctx.save();
        
        // Flip sprite based on direction (giống Python)
        if (!this.fromLeft) {
            this.ctx.translate(this.x, this.y);
            this.ctx.scale(-1, 1);
            this.ctx.drawImage(sprite, -this.width / 2, -this.height / 2, this.width, this.height);
        } else {
            this.ctx.drawImage(
                sprite,
                this.x - this.width / 2,
                this.y - this.height / 2,
                this.width,
                this.height
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
        if (this.state === Enemy.STATE_ENTERING ||
            this.state === Enemy.STATE_EXITING ||
            this.state === Enemy.STATE_IDLE) {
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
        this.x = -100;
        this.bulletFired = false;
    }
}

// Export
window.Enemy = Enemy;

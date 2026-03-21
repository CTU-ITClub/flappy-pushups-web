// Boss Battle System - Converted from Python

// Constants for Boss Battle
const BossConstants = {
  BOSS_WIDTH_BASE: 220,
  BOSS_HEIGHT_BASE: 170,
  BOMB_HEIGHT_SCALE: 0.32, // 0.8 * 0.4 = 0.32 (giảm 0.4 lần)
  BOMB_HEIGHT_ORIGINAL: 258,
  LASER_BEAM_HEIGHT_BASE: 360,
  WARNING_SIGN_SIZE_BASE: 150,
  // Speed values @ 60 FPS (converted from Python 240 FPS)
  // Python uses: speed * UI_SCALE where UI_SCALE is based on screen size
  // For consistent feel, we use base speed (Python 240 FPS speed * 4 for 60 FPS)
  // BUT the uiScale multiplication should be separate
  BOSS_ENTER_SPEED: 2.2, // Python: 2.2 * UI_SCALE @ 240 FPS
  BOSS_EXIT_SPEED: 3.0, // Python: 3.0 * UI_SCALE @ 240 FPS
  BOSS_BOMB_FALL_SPEED: 7.5, // Python: 7.5 * UI_SCALE @ 240 FPS - NOT x4 because screen moves same
  FPS_MULTIPLIER: 4, // 240/60 = 4
  BOSS_WARNING_DURATION_FRAMES: Math.floor(60 * 1.4), // 1.4 seconds
  BOSS_ATTACK_WARNING_FRAMES: 60, // 1 second
  BOSS_BOMB_TOTAL: 10,
  BOSS_BOMB_CHAIN_INTERVAL_FRAMES: Math.floor(60 * 0.5), // 0.5 seconds (increased from 0.3 for better gameplay)
  BOSS_LASER_TOTAL: 10,
  BOSS_LASER_CHAIN_INTERVAL_FRAMES: Math.floor(60 * 0.5), // 0.5 seconds (increased from 0.3 for better gameplay)
  BOSS_POST_ATTACK_DELAY_FRAMES: 60,
  BOSS_LOW_BATTERY_BLINK_PERIOD: Math.max(1, Math.floor(60 * 0.15)),
};

function getBossUIScale(screenWidth, screenHeight, baseSize = 480) {
  return Math.min(screenWidth, screenHeight) / baseSize;
}

function scaleBossValue(value, uiScale) {
  return Math.max(1, Math.floor(value * uiScale));
}

class BossBattle {
  // States
  static STATE_INACTIVE = 0;
  static STATE_SCREEN_WARNING = 1;
  static STATE_ENTERING = 2;
  static STATE_BOMB_WARNING = 3;
  static STATE_BOMB_DROP = 4;
  static STATE_LASER_WARNING = 5;
  static STATE_LASER_FIRE = 6;
  static STATE_EXITING = 7;
  static STATE_DONE = 8;
  static STATE_COMBO_ASSAULT = 9;
  static STATE_POST_ATTACK_DELAY = 10;
  static STATE_LOW_BATTERY = 11;
  static STATE_DYING = 12;
  static STATE_DEATH_EXPLOSION = 13;

  constructor(targetBird, screenWidth, screenHeight) {
    this.target = targetBird;
    this.screenWidth = screenWidth;
    this.screenHeight = screenHeight;
    this.state = BossBattle.STATE_INACTIVE;
    this.timer = 0;
    this.animationFrame = 0;
    this.animationSpeed = 2; // Adjusted for 60 FPS (10 at 240 FPS / 4)
    this.currentSpriteIndex = 0;

    // Assets
    this.bossSprites = [];
    this.bombImage = null;
    this.explosionImages = [];
    this.laserBeamImage = null;
    this.warningSignImage = null;
    this.lowBatteryImage = null;

    this.assetsLoaded = false;
    this.loadAssets();
    this.syncScaledAssets();
  }

  loadAssets() {
    const assetPromises = [];

    // Boss sprites
    for (let i = 1; i <= 2; i++) {
      const img = new Image();
      img.src = `assets/boss_${i}.png`;
      assetPromises.push(
        new Promise((resolve) => {
          img.onload = () => resolve(img);
        }),
      );
      this.bossSprites.push(img);
    }

    // Bomb
    this.bombImage = new Image();
    this.bombImage.src = "assets/boom.png";
    assetPromises.push(
      new Promise((resolve) => {
        this.bombImage.onload = () => resolve(this.bombImage);
      }),
    );

    // Explosions
    for (let i = 1; i <= 2; i++) {
      const img = new Image();
      img.src = `assets/explosion_${i}.png`;
      assetPromises.push(
        new Promise((resolve) => {
          img.onload = () => resolve(img);
        }),
      );
      this.explosionImages.push(img);
    }

    // Laser beam
    this.laserBeamImage = new Image();
    this.laserBeamImage.src = "assets/lazer_beam.png";
    assetPromises.push(
      new Promise((resolve) => {
        this.laserBeamImage.onload = () => resolve(this.laserBeamImage);
      }),
    );

    // Warning sign
    this.warningSignImage = new Image();
    this.warningSignImage.src = "assets/warning_sign.png";
    assetPromises.push(
      new Promise((resolve) => {
        this.warningSignImage.onload = () => resolve(this.warningSignImage);
      }),
    );

    // Low battery
    this.lowBatteryImage = new Image();
    this.lowBatteryImage.src = "assets/low_battery.png";
    assetPromises.push(
      new Promise((resolve) => {
        this.lowBatteryImage.onload = () => resolve(this.lowBatteryImage);
      }),
    );

    Promise.all(assetPromises).then(() => {
      this.assetsLoaded = true;
    });
  }

  syncScaledAssets() {
    const uiScale = getBossUIScale(this.screenWidth, this.screenHeight);

    this.width = scaleBossValue(BossConstants.BOSS_WIDTH_BASE, uiScale);
    this.height = scaleBossValue(BossConstants.BOSS_HEIGHT_BASE, uiScale);
    this.bombHeight = scaleBossValue(
      BossConstants.BOMB_HEIGHT_ORIGINAL * BossConstants.BOMB_HEIGHT_SCALE,
      uiScale,
    );
    this.laserHeight = scaleBossValue(
      BossConstants.LASER_BEAM_HEIGHT_BASE,
      uiScale,
    );
    this.warningSignSize = scaleBossValue(
      BossConstants.WARNING_SIGN_SIZE_BASE,
      uiScale,
    );

    // Speed values converted from Python 240 FPS to Web 60 FPS
    // FPS_MULTIPLIER = 4 (240/60)
    const fpsMult = BossConstants.FPS_MULTIPLIER;
    this.enterSpeed = BossConstants.BOSS_ENTER_SPEED * fpsMult * uiScale;
    this.exitSpeed = BossConstants.BOSS_EXIT_SPEED * fpsMult * uiScale;
    // Bomb speed: Use 1.5x multiplier for slower, fairer gameplay
    this.bombFallSpeed = BossConstants.BOSS_BOMB_FALL_SPEED * 1.5 * uiScale;
    this.explosionStageFrames = Math.max(1, Math.floor(60 * 0.08));
    this.laserFireDuration = Math.max(1, Math.floor(60 * 0.65));
    this.deathFallGravity = 0.5 * fpsMult * uiScale;

    this.targetStopX = this.screenWidth - this.width - 24 * uiScale;
    this.y = this.screenHeight * 0.12;

    if (
      this.state >= BossBattle.STATE_ENTERING &&
      this.state <= BossBattle.STATE_EXITING
    ) {
      this.x = Math.max(
        this.targetStopX,
        Math.min(
          this.x || this.screenWidth + this.width,
          this.screenWidth + this.width + 30 * uiScale,
        ),
      );
    } else {
      this.x = this.screenWidth + this.width;
    }
  }

  resize(screenWidth, screenHeight) {
    this.screenWidth = screenWidth;
    this.screenHeight = screenHeight;
    this.syncScaledAssets();
  }

  activate() {
    console.log("👹 BOSS BATTLE ACTIVATED!");
    console.log("  Phase 1: 10 BOMBS");
    console.log("  Phase 2: 10 LASERS");
    console.log("  Phase 3: COMBO (10 BOMBS + 10 LASERS)");

    this.state = BossBattle.STATE_SCREEN_WARNING;
    this.timer = 0;
    this.bombsSpawned = 0;
    this.bombsDropped = 0;
    this.bombsWarningStarted = 0;
    this.activeBombs = [];
    this.pendingBombWarnings = [];
    this.chainSpawnTimer = 0;
    this.lasersSpawned = 0;
    this.lasersFired = 0;
    this.lasersWarningStarted = 0;
    this.activeLasers = [];
    this.pendingLaserWarnings = [];
    this.laserChainSpawnTimer = 0;
    this.markerX = this.screenWidth / 2;
    this.markerY = this.screenHeight / 2;
    this.currentBomb = null;
    this.currentLaser = null;
    this.pendingLaser = null;
    this.lockedLaserTarget = null;
    this.lowBatteryTimer = 0;
    this.deathVelocity = 0;
    this.deathRotation = 0;
    this.deathExplosion = null;
    const uiScale = getBossUIScale(this.screenWidth, this.screenHeight);
    this.x = this.screenWidth + this.width + 30 * uiScale;
  }

  _getBirdRect() {
    const birdLeft = this.target.x;
    const birdTop = this.target.y;
    return {
      x: birdLeft,
      y: birdTop,
      width: this.target.width,
      height: this.target.height,
      centerX: birdLeft + this.target.width / 2,
      centerY: birdTop + this.target.height / 2,
    };
  }

  _rectCollision(rect1, rect2) {
    return (
      rect1.x < rect2.x + rect2.width &&
      rect1.x + rect1.width > rect2.x &&
      rect1.y < rect2.y + rect2.height &&
      rect1.y + rect1.height > rect2.y
    );
  }

  _pickBombMarker() {
    const birdRect = this._getBirdRect();
    this.markerX = birdRect.centerX;
  }

  _pickLaserMarker() {
    const birdRect = this._getBirdRect();
    const randomOffset = (Math.random() - 0.5) * this.screenHeight * 0.14;
    let centerY = birdRect.centerY + randomOffset;
    const uiScale = getUIScale(this.screenWidth, this.screenHeight);
    const margin = this.laserHeight / 2 + 20 * uiScale;
    this.markerY = Math.max(
      margin,
      Math.min(this.screenHeight - margin, centerY),
    );
  }

  _buildLaserFromTarget(targetPoint) {
    if (!targetPoint) return null;

    const originX = this.x + this.width * 0.2;
    const originY = this.y + this.height * 0.55;
    const [targetX, targetY] = targetPoint;

    const dx = targetX - originX;
    const dy = targetY - originY;
    const baseDistance = Math.hypot(dx, dy);
    let ux, uy;
    if (baseDistance <= 1e-6) {
      ux = -1.0;
      uy = 0.0;
    } else {
      ux = dx / baseDistance;
      uy = dy / baseDistance;
    }

    // Extend beam to exit screen
    const xmin = -10,
      xmax = this.screenWidth + 10;
    const ymin = -10,
      ymax = this.screenHeight + 10;

    let txMin = -Infinity,
      txMax = Infinity;
    if (Math.abs(ux) >= 1e-6) {
      const tx1 = (xmin - originX) / ux;
      const tx2 = (xmax - originX) / ux;
      txMin = Math.min(tx1, tx2);
      txMax = Math.max(tx1, tx2);
    }

    let tyMin = -Infinity,
      tyMax = Infinity;
    if (Math.abs(uy) >= 1e-6) {
      const ty1 = (ymin - originY) / uy;
      const ty2 = (ymax - originY) / uy;
      tyMin = Math.min(ty1, ty2);
      tyMax = Math.max(ty1, ty2);
    }

    let tExit = Math.min(txMax, tyMax);
    if (tExit <= 1.0) tExit = Math.max(1.0, baseDistance);

    const endX = originX + ux * tExit;
    const endY = originY + uy * tExit;
    const distance = Math.max(1, Math.hypot(endX - originX, endY - originY));
    const angleDeg = (Math.atan2(uy, ux) * 180) / Math.PI;

    return {
      originX,
      originY,
      endX,
      endY,
      distance,
      angle: angleDeg,
      width: distance,
      height: this.laserHeight,
      fireTimer: 0,
    };
  }

  _startBombWarning() {
    this._pickBombMarker();
    this.bombsWarningStarted++;
    console.log(
      `💣 Bomb warning #${this.bombsWarningStarted}/${BossConstants.BOSS_BOMB_TOTAL} at X=${Math.round(this.markerX)}`,
    );
    this.timer = 0;
    this.state = BossBattle.STATE_BOMB_WARNING;
  }

  _enqueueChainBombWarning() {
    this._pickBombMarker();
    this.pendingBombWarnings.push({ markerX: this.markerX, timer: 0 });
    this.bombsWarningStarted++;
    console.log(
      `💣 Chain bomb warning #${this.bombsWarningStarted}/${BossConstants.BOSS_BOMB_TOTAL} at X=${Math.round(this.markerX)}`,
    );
  }

  _createBomb(markerX = null) {
    const spawnX = markerX !== null ? markerX : this.markerX;
    // Calculate bomb width based on aspect ratio
    const aspectRatio = this.bombImage.width / this.bombImage.height;
    const bombWidth = this.bombHeight * aspectRatio;

    return {
      x: spawnX - bombWidth / 2,
      y: -this.bombHeight,
      width: bombWidth,
      height: this.bombHeight,
      isExploding: false,
      explosionStage: 0,
      explosionTimer: 0,
      explosionHitsPlayer: false,
    };
  }

  _startLaserWarning() {
    const birdRect = this._getBirdRect();
    this.lockedLaserTarget = [birdRect.centerX, birdRect.centerY];
    this.pendingLaser = this._buildLaserFromTarget(this.lockedLaserTarget);
    if (this.pendingLaser) {
      this.lasersWarningStarted++;
      console.log(
        `⚡ Laser warning #${this.lasersWarningStarted}/${BossConstants.BOSS_LASER_TOTAL} at Y=${Math.round(birdRect.centerY)}`,
      );
    }
    this.currentLaser = null;
    this.timer = 0;
    this.state = BossBattle.STATE_LASER_WARNING;
  }

  _enqueueLaserWarning() {
    const birdRect = this._getBirdRect();
    const targetPoint = [birdRect.centerX, birdRect.centerY];
    const queuedLaser = this._buildLaserFromTarget(targetPoint);
    if (!queuedLaser) return;
    this.pendingLaserWarnings.push({ frame: queuedLaser, timer: 0 });
    this.lasersWarningStarted++;
    console.log(
      `⚡ Chain laser warning #${this.lasersWarningStarted}/${BossConstants.BOSS_LASER_TOTAL} at Y=${Math.round(birdRect.centerY)}`,
    );
  }

  _startComboAssault() {
    this.timer = 0;
    this.bombsSpawned = 0;
    this.bombsDropped = 0;
    this.bombsWarningStarted = 0;
    this.activeBombs = [];
    this.pendingBombWarnings = [];
    this.chainSpawnTimer = 0;

    this.lasersSpawned = 0;
    this.lasersFired = 0;
    this.lasersWarningStarted = 0;
    this.activeLasers = [];
    this.pendingLaserWarnings = [];
    this.laserChainSpawnTimer = 0;
    this.currentLaser = null;
    this.pendingLaser = null;

    this._enqueueChainBombWarning();
    this._enqueueLaserWarning();
    this.state = BossBattle.STATE_COMBO_ASSAULT;
  }

  _startShutdownSequence() {
    this.timer = 0;
    this.lowBatteryTimer = 0;
    this.deathVelocity = 0;
    this.deathRotation = 0;
    this.deathExplosion = null;
    this.state = BossBattle.STATE_POST_ATTACK_DELAY;
  }

  _updateBombs(ignoreDamage = false) {
    const groundY = this.screenHeight - this.screenHeight * 0.1;
    const birdRect = this._getBirdRect();

    for (let i = this.activeBombs.length - 1; i >= 0; i--) {
      const bomb = this.activeBombs[i];

      if (!bomb.isExploding) {
        bomb.y += this.bombFallSpeed;

        // Check collision with bird
        const bombRect = {
          x: bomb.x,
          y: bomb.y,
          width: bomb.width,
          height: bomb.height,
        };
        if (this._rectCollision(bombRect, birdRect)) {
          bomb.isExploding = true;
          bomb.explosionHitsPlayer = true;
          bomb.explosionStage = 0;
          bomb.explosionTimer = 0;
          continue;
        }

        // Check if hit ground
        if (bomb.y + bomb.height >= groundY + 30) {
          bomb.isExploding = true;
          bomb.explosionHitsPlayer = false;
          bomb.explosionStage = 0;
          bomb.explosionTimer = 0;
        }
      } else {
        bomb.explosionTimer++;
        if (
          bomb.explosionStage === 0 &&
          bomb.explosionTimer >= this.explosionStageFrames
        ) {
          bomb.explosionStage = 1;
          bomb.explosionTimer = 0;
        } else if (
          bomb.explosionStage === 1 &&
          bomb.explosionTimer >= this.explosionStageFrames
        ) {
          const shouldDamage = bomb.explosionHitsPlayer;
          this.bombsDropped++;
          this.activeBombs.splice(i, 1);

          if (shouldDamage && !ignoreDamage) {
            return true; // Player hit
          }
        }
      }
    }
    return false;
  }

  _updateLasers(ignoreDamage = false) {
    const birdRect = this._getBirdRect();

    for (let i = this.activeLasers.length - 1; i >= 0; i--) {
      const laser = this.activeLasers[i];

      // Simple line collision check
      const laserRect = {
        x: Math.min(laser.originX, laser.endX) - this.laserHeight / 2,
        y: Math.min(laser.originY, laser.endY) - this.laserHeight / 2,
        width: Math.abs(laser.endX - laser.originX) + this.laserHeight,
        height: Math.abs(laser.endY - laser.originY) + this.laserHeight,
      };

      if (this._rectCollision(laserRect, birdRect) && !ignoreDamage) {
        return true; // Player hit
      }

      laser.fireTimer++;
      if (laser.fireTimer >= this.laserFireDuration) {
        this.activeLasers.splice(i, 1);
        this.lasersFired++;
      }
    }
    return false;
  }

  update(ignoreDamage = false) {
    if (this.state === BossBattle.STATE_INACTIVE) {
      return { hit: false, defeated: false };
    }

    // Wing flapping animation
    if (
      this.state !== BossBattle.STATE_DYING &&
      this.state !== BossBattle.STATE_DEATH_EXPLOSION &&
      this.state !== BossBattle.STATE_DONE
    ) {
      this.animationFrame++;
      if (this.animationFrame >= this.animationSpeed) {
        this.animationFrame = 0;
        this.currentSpriteIndex = 1 - this.currentSpriteIndex;
      }
    }

    // State machine
    switch (this.state) {
      case BossBattle.STATE_SCREEN_WARNING:
        this.timer++;
        if (this.timer >= BossConstants.BOSS_WARNING_DURATION_FRAMES) {
          this.timer = 0;
          this.state = BossBattle.STATE_ENTERING;
        }
        break;

      case BossBattle.STATE_ENTERING:
        this.x -= this.enterSpeed;
        if (this.x <= this.targetStopX) {
          this.x = this.targetStopX;
          this._startBombWarning();
        }
        break;

      case BossBattle.STATE_BOMB_WARNING:
        this.timer++;
        if (this.timer >= BossConstants.BOSS_ATTACK_WARNING_FRAMES) {
          this.activeBombs.push(this._createBomb());
          this.bombsSpawned++;

          if (
            this.bombsSpawned >= 2 &&
            this.bombsWarningStarted < BossConstants.BOSS_BOMB_TOTAL
          ) {
            this._enqueueChainBombWarning();
            this.chainSpawnTimer = 0;
          }
          this.state = BossBattle.STATE_BOMB_DROP;
        }
        break;

      case BossBattle.STATE_BOMB_DROP:
        // Chain spawn more bombs
        if (
          this.bombsWarningStarted >= 3 &&
          this.bombsWarningStarted < BossConstants.BOSS_BOMB_TOTAL
        ) {
          this.chainSpawnTimer++;
          if (
            this.chainSpawnTimer >=
            BossConstants.BOSS_BOMB_CHAIN_INTERVAL_FRAMES
          ) {
            this.chainSpawnTimer = 0;
            this._enqueueChainBombWarning();
          }
        }

        // Process pending warnings
        for (let i = this.pendingBombWarnings.length - 1; i >= 0; i--) {
          this.pendingBombWarnings[i].timer++;
          if (
            this.pendingBombWarnings[i].timer >=
            BossConstants.BOSS_ATTACK_WARNING_FRAMES
          ) {
            this.activeBombs.push(
              this._createBomb(this.pendingBombWarnings[i].markerX),
            );
            this.bombsSpawned++;
            this.pendingBombWarnings.splice(i, 1);
          }
        }

        // Update bombs
        if (this._updateBombs(ignoreDamage)) {
          return { hit: true, defeated: false };
        }

        // Check if done with bombs → start lasers
        if (
          this.bombsDropped >= BossConstants.BOSS_BOMB_TOTAL &&
          this.activeBombs.length === 0 &&
          this.pendingBombWarnings.length === 0
        ) {
          console.log("💣 Phase 1 COMPLETE: All 10 bombs dropped");
          console.log("⚡ Starting Phase 2: 10 LASERS");
          this._startLaserWarning();
        } else if (
          this.bombsWarningStarted < 2 &&
          this.activeBombs.length === 0 &&
          this.pendingBombWarnings.length === 0
        ) {
          this._startBombWarning();
        }
        break;

      case BossBattle.STATE_LASER_WARNING:
        this.timer++;
        if (this.timer >= BossConstants.BOSS_ATTACK_WARNING_FRAMES) {
          this.currentLaser =
            this.pendingLaser ||
            this._buildLaserFromTarget(this.lockedLaserTarget);
          if (this.currentLaser) {
            this.currentLaser.fireTimer = 0;
            this.activeLasers.push(this.currentLaser);
            this.lasersSpawned++;
          }
          this.pendingLaser = null;
          this.timer = 0;
          this.state = BossBattle.STATE_LASER_FIRE;
        }
        break;

      case BossBattle.STATE_LASER_FIRE:
        // Chain spawn more lasers
        if (
          this.lasersWarningStarted >= 3 &&
          this.lasersWarningStarted < BossConstants.BOSS_LASER_TOTAL
        ) {
          this.laserChainSpawnTimer++;
          if (
            this.laserChainSpawnTimer >=
            BossConstants.BOSS_LASER_CHAIN_INTERVAL_FRAMES
          ) {
            this.laserChainSpawnTimer = 0;
            this._enqueueLaserWarning();
          }
        }

        // Process pending warnings
        for (let i = this.pendingLaserWarnings.length - 1; i >= 0; i--) {
          this.pendingLaserWarnings[i].timer++;
          if (
            this.pendingLaserWarnings[i].timer >=
            BossConstants.BOSS_ATTACK_WARNING_FRAMES
          ) {
            const nextLaser = this.pendingLaserWarnings[i].frame;
            nextLaser.fireTimer = 0;
            this.activeLasers.push(nextLaser);
            this.lasersSpawned++;
            this.pendingLaserWarnings.splice(i, 1);
          }
        }

        // Update lasers
        if (this._updateLasers(ignoreDamage)) {
          return { hit: true, defeated: false };
        }

        this.currentLaser = this.activeLasers[0] || null;

        // Chain more lasers
        if (
          this.lasersWarningStarted < 2 &&
          this.lasersSpawned < 2 &&
          this.activeLasers.length === 0 &&
          this.pendingLaserWarnings.length === 0
        ) {
          this._startLaserWarning();
        } else if (
          this.lasersWarningStarted < 3 &&
          this.lasersFired >= 2 &&
          this.activeLasers.length === 0 &&
          this.pendingLaserWarnings.length === 0
        ) {
          this._enqueueLaserWarning();
          this.laserChainSpawnTimer = 0;
        }

        // Check if done with lasers → start combo
        if (
          this.lasersFired >= BossConstants.BOSS_LASER_TOTAL &&
          this.activeLasers.length === 0 &&
          this.pendingLaserWarnings.length === 0
        ) {
          console.log("⚡ Phase 2 COMPLETE: All 10 lasers fired");
          console.log(
            "🔥 Starting Phase 3: COMBO ASSAULT (10 bombs + 10 lasers)",
          );
          this._startComboAssault();
        }
        break;

      case BossBattle.STATE_COMBO_ASSAULT:
        // Chain spawn bombs
        if (this.bombsWarningStarted < BossConstants.BOSS_BOMB_TOTAL) {
          this.chainSpawnTimer++;
          if (
            this.chainSpawnTimer >=
            BossConstants.BOSS_BOMB_CHAIN_INTERVAL_FRAMES
          ) {
            this.chainSpawnTimer = 0;
            this._enqueueChainBombWarning();
          }
        }

        // Chain spawn lasers
        if (this.lasersWarningStarted < BossConstants.BOSS_LASER_TOTAL) {
          this.laserChainSpawnTimer++;
          if (
            this.laserChainSpawnTimer >=
            BossConstants.BOSS_LASER_CHAIN_INTERVAL_FRAMES
          ) {
            this.laserChainSpawnTimer = 0;
            this._enqueueLaserWarning();
          }
        }

        // Process pending bomb warnings
        for (let i = this.pendingBombWarnings.length - 1; i >= 0; i--) {
          this.pendingBombWarnings[i].timer++;
          if (
            this.pendingBombWarnings[i].timer >=
            BossConstants.BOSS_ATTACK_WARNING_FRAMES
          ) {
            this.activeBombs.push(
              this._createBomb(this.pendingBombWarnings[i].markerX),
            );
            this.bombsSpawned++;
            this.pendingBombWarnings.splice(i, 1);
          }
        }

        // Process pending laser warnings
        for (let i = this.pendingLaserWarnings.length - 1; i >= 0; i--) {
          this.pendingLaserWarnings[i].timer++;
          if (
            this.pendingLaserWarnings[i].timer >=
            BossConstants.BOSS_ATTACK_WARNING_FRAMES
          ) {
            const nextLaser = this.pendingLaserWarnings[i].frame;
            nextLaser.fireTimer = 0;
            this.activeLasers.push(nextLaser);
            this.lasersSpawned++;
            this.pendingLaserWarnings.splice(i, 1);
          }
        }

        // Update bombs and lasers
        if (this._updateBombs(ignoreDamage)) {
          return { hit: true, defeated: false };
        }
        if (this._updateLasers(ignoreDamage)) {
          return { hit: true, defeated: false };
        }

        this.currentLaser = this.activeLasers[0] || null;

        // Check if combo assault is done
        if (
          this.bombsDropped >= BossConstants.BOSS_BOMB_TOTAL &&
          this.lasersFired >= BossConstants.BOSS_LASER_TOTAL &&
          this.activeBombs.length === 0 &&
          this.pendingBombWarnings.length === 0 &&
          this.activeLasers.length === 0 &&
          this.pendingLaserWarnings.length === 0
        ) {
          this._startShutdownSequence();
        }
        break;

      case BossBattle.STATE_POST_ATTACK_DELAY:
        this.timer++;
        if (this.timer >= BossConstants.BOSS_POST_ATTACK_DELAY_FRAMES) {
          this.lowBatteryTimer = 0;
          this.state = BossBattle.STATE_LOW_BATTERY;
        }
        break;

      case BossBattle.STATE_LOW_BATTERY:
        this.lowBatteryTimer++;
        if (
          this.lowBatteryTimer >=
          BossConstants.BOSS_LOW_BATTERY_BLINK_PERIOD * 6
        ) {
          this.deathVelocity = 0;
          this.deathRotation = 0;
          this.state = BossBattle.STATE_DYING;
        }
        break;

      case BossBattle.STATE_DYING:
        this.deathVelocity += this.deathFallGravity;
        this.y += this.deathVelocity;
        if (this.deathRotation > -90) {
          this.deathRotation -= 3;
        }

        const groundY = this.screenHeight - this.screenHeight * 0.1;
        if (this.y + this.height >= groundY + 30) {
          this.y = groundY + 30 - this.height;
          this.deathExplosion = {
            stage: 0,
            timer: 0,
            x: this.x + this.width / 2,
            y: this.y + this.height / 2,
          };
          this.state = BossBattle.STATE_DEATH_EXPLOSION;
        }
        break;

      case BossBattle.STATE_DEATH_EXPLOSION:
        if (this.deathExplosion) {
          this.deathExplosion.timer++;
          if (
            this.deathExplosion.stage === 0 &&
            this.deathExplosion.timer >= this.explosionStageFrames
          ) {
            this.deathExplosion.stage = 1;
            this.deathExplosion.timer = 0;
          } else if (
            this.deathExplosion.stage === 1 &&
            this.deathExplosion.timer >= this.explosionStageFrames
          ) {
            this.state = BossBattle.STATE_DONE;
            return { hit: false, defeated: true };
          }
        }
        break;

      case BossBattle.STATE_EXITING:
        this.x += this.exitSpeed;
        const exitUIScale = getBossUIScale(this.screenWidth, this.screenHeight);
        if (this.x > this.screenWidth + this.width + 40 * exitUIScale) {
          this.state = BossBattle.STATE_DONE;
          return { hit: false, defeated: true };
        }
        break;
    }

    return { hit: false, defeated: false };
  }

  draw(ctx) {
    if (this.state === BossBattle.STATE_INACTIVE || !this.assetsLoaded) {
      return;
    }

    // Draw screen warning
    if (this.state === BossBattle.STATE_SCREEN_WARNING) {
      // Flash red overlay
      const flashOn = Math.floor(this.timer / 10) % 2 === 0;
      if (flashOn) {
        ctx.fillStyle = "rgba(255, 0, 0, 0.3)";
        ctx.fillRect(0, 0, this.screenWidth, this.screenHeight);
      }

      // Draw warning sign in center
      const signWidth =
        this.warningSignSize *
        (this.warningSignImage.width / this.warningSignImage.height);
      const signHeight = this.warningSignSize;
      ctx.drawImage(
        this.warningSignImage,
        (this.screenWidth - signWidth) / 2,
        (this.screenHeight - signHeight) / 2,
        signWidth,
        signHeight,
      );
      return;
    }

    // Draw pending bomb warnings (markers)
    for (const warning of this.pendingBombWarnings) {
      const flashOn = Math.floor(warning.timer / 5) % 2 === 0;
      if (flashOn) {
        ctx.strokeStyle = "rgba(255, 100, 100, 0.8)";
        ctx.lineWidth = 3;
        ctx.setLineDash([10, 10]);
        ctx.beginPath();
        ctx.moveTo(warning.markerX, 0);
        ctx.lineTo(warning.markerX, this.screenHeight);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // Draw bomb warning marker
    if (this.state === BossBattle.STATE_BOMB_WARNING) {
      const flashOn = Math.floor(this.timer / 5) % 2 === 0;
      if (flashOn) {
        ctx.strokeStyle = "rgba(255, 100, 100, 0.8)";
        ctx.lineWidth = 3;
        ctx.setLineDash([10, 10]);
        ctx.beginPath();
        ctx.moveTo(this.markerX, 0);
        ctx.lineTo(this.markerX, this.screenHeight);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // Draw pending laser warnings
    for (const warning of this.pendingLaserWarnings) {
      const flashOn = Math.floor(warning.timer / 5) % 2 === 0;
      if (flashOn && warning.frame) {
        ctx.strokeStyle = "rgba(255, 100, 100, 0.6)";
        ctx.lineWidth = 3;
        ctx.setLineDash([15, 10]);
        ctx.beginPath();
        ctx.moveTo(warning.frame.originX, warning.frame.originY);
        ctx.lineTo(warning.frame.endX, warning.frame.endY);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // Draw laser warning
    if (this.state === BossBattle.STATE_LASER_WARNING && this.pendingLaser) {
      const flashOn = Math.floor(this.timer / 5) % 2 === 0;
      if (flashOn) {
        ctx.strokeStyle = "rgba(255, 100, 100, 0.6)";
        ctx.lineWidth = 3;
        ctx.setLineDash([15, 10]);
        ctx.beginPath();
        ctx.moveTo(this.pendingLaser.originX, this.pendingLaser.originY);
        ctx.lineTo(this.pendingLaser.endX, this.pendingLaser.endY);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // Draw active lasers
    for (const laser of this.activeLasers) {
      ctx.save();
      ctx.translate(laser.originX, laser.originY);
      ctx.rotate((laser.angle * Math.PI) / 180);
      ctx.drawImage(
        this.laserBeamImage,
        0,
        -this.laserHeight / 2,
        laser.distance,
        this.laserHeight,
      );
      ctx.restore();
    }

    // Draw active bombs
    for (const bomb of this.activeBombs) {
      if (!bomb.isExploding) {
        ctx.drawImage(this.bombImage, bomb.x, bomb.y, bomb.width, bomb.height);
      } else {
        const explosionImg = this.explosionImages[bomb.explosionStage];
        if (explosionImg) {
          const aspectRatio = explosionImg.width / explosionImg.height;
          const expWidth = bomb.height * aspectRatio;
          ctx.drawImage(
            explosionImg,
            bomb.x + bomb.width / 2 - expWidth / 2,
            bomb.y,
            expWidth,
            bomb.height,
          );
        }
      }
    }

    // Draw boss (flipped horizontally to face left)
    if (this.state !== BossBattle.STATE_DONE) {
      ctx.save();

      if (this.state === BossBattle.STATE_DYING) {
        ctx.translate(this.x + this.width / 2, this.y + this.height / 2);
        ctx.rotate((this.deathRotation * Math.PI) / 180);
        ctx.scale(-1, 1);
        ctx.drawImage(
          this.bossSprites[this.currentSpriteIndex],
          -this.width / 2,
          -this.height / 2,
          this.width,
          this.height,
        );
      } else {
        ctx.translate(this.x + this.width, this.y);
        ctx.scale(-1, 1);
        ctx.drawImage(
          this.bossSprites[this.currentSpriteIndex],
          0,
          0,
          this.width,
          this.height,
        );
      }
      ctx.restore();

      // Draw low battery indicator
      if (this.state === BossBattle.STATE_LOW_BATTERY) {
        const blinkOn =
          Math.floor(
            this.lowBatteryTimer / BossConstants.BOSS_LOW_BATTERY_BLINK_PERIOD,
          ) %
            2 ===
          0;
        if (blinkOn) {
          const batterySize = this.height * 0.9;
          const batteryWidth =
            batterySize *
            (this.lowBatteryImage.width / this.lowBatteryImage.height);
          ctx.drawImage(
            this.lowBatteryImage,
            this.x + this.width / 2 - batteryWidth / 2,
            this.y - batterySize - 10,
            batteryWidth,
            batterySize,
          );
        }
      }
    }

    // Draw death explosion
    if (
      this.state === BossBattle.STATE_DEATH_EXPLOSION &&
      this.deathExplosion
    ) {
      const explosionImg = this.explosionImages[this.deathExplosion.stage];
      if (explosionImg) {
        const expHeight = this.bombHeight * 1.5;
        const aspectRatio = explosionImg.width / explosionImg.height;
        const expWidth = expHeight * aspectRatio;
        ctx.drawImage(
          explosionImg,
          this.deathExplosion.x - expWidth / 2,
          this.deathExplosion.y - expHeight / 2,
          expWidth,
          expHeight,
        );
      }
    }
  }

  collide(bird) {
    if (
      this.state === BossBattle.STATE_INACTIVE ||
      this.state === BossBattle.STATE_SCREEN_WARNING ||
      this.state === BossBattle.STATE_DONE
    ) {
      return false;
    }

    const birdRect = {
      x: bird.x,
      y: bird.y,
      width: bird.width,
      height: bird.height,
    };

    const bossRect = {
      x: this.x,
      y: this.y,
      width: this.width,
      height: this.height,
    };

    return this._rectCollision(birdRect, bossRect);
  }

  reset() {
    this.state = BossBattle.STATE_INACTIVE;
    this.timer = 0;
    this.activeBombs = [];
    this.pendingBombWarnings = [];
    this.activeLasers = [];
    this.pendingLaserWarnings = [];
    this.currentLaser = null;
    this.pendingLaser = null;
    this.deathExplosion = null;
    this.syncScaledAssets();
  }

  isActive() {
    return (
      this.state !== BossBattle.STATE_INACTIVE &&
      this.state !== BossBattle.STATE_DONE
    );
  }

  isDone() {
    return this.state === BossBattle.STATE_DONE;
  }
}

// Export for global access
window.BossBattle = BossBattle;

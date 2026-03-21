/**
 * Face Detection Module using MediaPipe Face Mesh
 * Runs entirely on client device (CPU/GPU via WebGL)
 */

class FaceDetector {
  constructor() {
    this.faceMesh = null;
    this.camera = null;
    this.videoElement = null;
    this.isReady = false;
    this.lastResults = null;

    // Face tracking data
    this.faceX = 0.5; // Normalized 0-1 (0 = left, 1 = right)
    this.faceY = 0.5; // Normalized 0-1 (0 = top, 1 = bottom)
    this.mouthOpenness = 0; // 0-1 scale
    this.isMouthOpen = false;
    this.faceDetected = false;

    // Smoothing
    this.smoothingFactor = 0.3;
    this.positionHistory = [];
    this.historySize = 5;

    // Mouth landmarks indices (MediaPipe Face Mesh)
    // Upper lip: 13, Lower lip: 14
    // Outer upper: 82, Outer lower: 87
    this.UPPER_LIP = 13;
    this.LOWER_LIP = 14;
    this.NOSE_TIP = 1;
    this.LEFT_EYE = 33;
    this.RIGHT_EYE = 263;

    // Mouth open threshold
    this.mouthOpenThreshold = 0.03; // Normalized distance

    // Callbacks
    this.onReady = null;
    this.onFaceDetected = null;
    this.onError = null;
  }

  async init(videoElement) {
    this.videoElement = videoElement;

    try {
      // Initialize MediaPipe Face Mesh
      this.faceMesh = new FaceMesh({
        locateFile: (file) => {
          return `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`;
        },
      });

      // Configure Face Mesh
      this.faceMesh.setOptions({
        maxNumFaces: 1,
        refineLandmarks: true, // Better lip tracking
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });

      // Set up results callback
      this.faceMesh.onResults((results) => this.onResults(results));

      // Initialize camera
      await this.initCamera();

      this.isReady = true;
      if (this.onReady) this.onReady();

      return true;
    } catch (error) {
      console.error("Face detection init error:", error);
      if (this.onError) this.onError(error);
      return false;
    }
  }

  async initCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: "user",
          frameRate: { ideal: 30 },
        },
      });

      this.videoElement.srcObject = stream;

      return new Promise((resolve) => {
        this.videoElement.onloadedmetadata = () => {
          this.videoElement.play();

          // Start MediaPipe Camera utility
          this.camera = new Camera(this.videoElement, {
            onFrame: async () => {
              if (this.faceMesh) {
                await this.faceMesh.send({ image: this.videoElement });
              }
            },
            width: 640,
            height: 480,
          });

          this.camera.start();
          resolve();
        };
      });
    } catch (error) {
      throw new Error(`Camera access denied: ${error.message}`);
    }
  }

  onResults(results) {
    this.lastResults = results;

    if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
      const landmarks = results.multiFaceLandmarks[0];
      this.faceDetected = true;

      // Get nose tip for position tracking (more stable than bounding box)
      const noseTip = landmarks[this.NOSE_TIP];

      // Calculate face center using eye positions
      const leftEye = landmarks[this.LEFT_EYE];
      const rightEye = landmarks[this.RIGHT_EYE];
      const faceCenterX = (leftEye.x + rightEye.x) / 2;
      const faceCenterY = noseTip.y;

      // Update position with smoothing
      this.updatePosition(faceCenterX, faceCenterY);

      // Calculate mouth openness
      this.calculateMouthOpenness(landmarks);

      if (this.onFaceDetected) {
        this.onFaceDetected({
          x: this.faceX,
          y: this.faceY,
          mouthOpenness: this.mouthOpenness,
          isMouthOpen: this.isMouthOpen,
          landmarks: landmarks,
        });
      }
    } else {
      this.faceDetected = false;
    }
  }

  updatePosition(rawX, rawY) {
    // Mirror X (camera is mirrored)
    rawX = 1 - rawX;

    // Add to history for smoothing
    this.positionHistory.push({ x: rawX, y: rawY });
    if (this.positionHistory.length > this.historySize) {
      this.positionHistory.shift();
    }

    // Calculate smoothed position (moving average)
    let sumX = 0,
      sumY = 0;
    for (const pos of this.positionHistory) {
      sumX += pos.x;
      sumY += pos.y;
    }
    const avgX = sumX / this.positionHistory.length;
    const avgY = sumY / this.positionHistory.length;

    // Apply exponential smoothing
    this.faceX = this.faceX + this.smoothingFactor * (avgX - this.faceX);
    this.faceY = this.faceY + this.smoothingFactor * (avgY - this.faceY);
  }

  calculateMouthOpenness(landmarks) {
    // Get lip landmarks
    const upperLip = landmarks[this.UPPER_LIP];
    const lowerLip = landmarks[this.LOWER_LIP];

    // Calculate vertical distance between lips
    const mouthHeight = Math.abs(lowerLip.y - upperLip.y);

    // Get face height for normalization (use eye distance as reference)
    const leftEye = landmarks[this.LEFT_EYE];
    const rightEye = landmarks[this.RIGHT_EYE];
    const eyeDistance = Math.abs(rightEye.x - leftEye.x);

    // Normalize mouth openness relative to face size
    this.mouthOpenness = mouthHeight / eyeDistance;

    // Check if mouth is open enough
    this.isMouthOpen = this.mouthOpenness > this.mouthOpenThreshold;
  }

  /**
   * Get current face data
   */
  getData() {
    return {
      x: this.faceX,
      y: this.faceY,
      mouthOpenness: this.mouthOpenness,
      isMouthOpen: this.isMouthOpen,
      faceDetected: this.faceDetected,
    };
  }

  /**
   * Get speed multiplier based on mouth openness (1x - 3x)
   */
  getSpeedMultiplier() {
    if (!this.isMouthOpen) return 1.0;

    // Map mouth openness to speed (0.03 - 0.15 → 1.0 - 3.0)
    const minOpen = this.mouthOpenThreshold;
    const maxOpen = 0.15;
    const normalized = Math.min(
      1,
      (this.mouthOpenness - minOpen) / (maxOpen - minOpen),
    );

    return 1.0 + normalized * 2.0; // 1x to 3x
  }

  /**
   * Check if a point is near the mouth (for bullet eating)
   * @param {number} x - X position (0-1 normalized)
   * @param {number} y - Y position (0-1 normalized)
   * @param {number} radius - Detection radius
   */
  isNearMouth(x, y, radius = 0.1) {
    if (!this.faceDetected || !this.isMouthOpen) return false;

    const dx = x - this.faceX;
    const dy = y - this.faceY;
    const distance = Math.sqrt(dx * dx + dy * dy);

    return distance < radius;
  }

  /**
   * Clean up resources
   */
  destroy() {
    if (this.camera) {
      this.camera.stop();
    }
    if (this.videoElement && this.videoElement.srcObject) {
      this.videoElement.srcObject.getTracks().forEach((track) => track.stop());
    }
  }
}

// Export for use in other modules
window.FaceDetector = FaceDetector;

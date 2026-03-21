import pygame
import random
import cv2
import numpy as np
import math
import threading
import queue
import os

# Enable SDL2 hardware acceleration
os.environ['SDL_RENDER_DRIVER'] = 'direct3d11'  # Use Direct3D 11 for Windows
os.environ['SDL_VIDEO_ALLOW_SCREENSAVER'] = '0'

# Initialize Pygame with hardware acceleration
pygame.init()

# Initialize DNN face detector with GPU acceleration
modelFile = "src/res10_300x300_ssd_iter_140000.caffemodel"
configFile = "src/deploy.prototxt.txt"
net = cv2.dnn.readNetFromCaffe(configFile, modelFile)

# Try CUDA first (fastest for NVIDIA), then OpenCL, then CPU
# Must test with a dummy forward pass to verify backend works
gpu_backend = None

def test_dnn_backend():
    """Test if current DNN backend works with a dummy forward pass"""
    try:
        test_blob = cv2.dnn.blobFromImage(np.zeros((300, 300, 3), dtype=np.uint8), 1.0, (300, 300))
        net.setInput(test_blob)
        net.forward()
        return True
    except:
        return False

# Try CUDA first (NVIDIA GPUs with CUDA-enabled OpenCV build)
try:
    net.setPreferableBackend(cv2.dnn.DNN_BACKEND_CUDA)
    net.setPreferableTarget(cv2.dnn.DNN_TARGET_CUDA)
    if test_dnn_backend():
        gpu_backend = "CUDA"
        print("GPU acceleration enabled (CUDA - NVIDIA)")
    else:
        raise Exception("CUDA test failed")
except:
    try:
        # Fallback to OpenCL (AMD/Intel/NVIDIA GPUs)
        net.setPreferableBackend(cv2.dnn.DNN_BACKEND_OPENCV)
        net.setPreferableTarget(cv2.dnn.DNN_TARGET_OPENCL)
        if test_dnn_backend():
            gpu_backend = "OpenCL"
            print("GPU acceleration enabled (OpenCL)")
        else:
            raise Exception("OpenCL test failed")
    except:
        # Final fallback to CPU
        net.setPreferableBackend(cv2.dnn.DNN_BACKEND_OPENCV)
        net.setPreferableTarget(cv2.dnn.DNN_TARGET_CPU)
        gpu_backend = "CPU"
        print("Using CPU (GPU acceleration not available)")

# Camera setup with high FPS
video_cam = cv2.VideoCapture(0, cv2.CAP_DSHOW)
video_cam.set(cv2.CAP_PROP_BUFFERSIZE, 1)  # Reduce buffer to get latest frames
video_cam.set(cv2.CAP_PROP_FPS, 60)  # Request 60 FPS from camera
video_cam.set(cv2.CAP_PROP_FOURCC, cv2.VideoWriter_fourcc(*'MJPG'))  # Use MJPG for faster capture

# Threaded camera capture for non-blocking frame reads
class CameraThread:
    def __init__(self, camera):
        self.camera = camera
        self.frame = None
        self.ret = False
        self.running = True
        self.lock = threading.Lock()
        self.thread = threading.Thread(target=self._capture_loop, daemon=True)
        self.thread.start()
    
    def _capture_loop(self):
        while self.running:
            ret, frame = self.camera.read()
            with self.lock:
                self.ret = ret
                self.frame = frame
    
    def read(self):
        with self.lock:
            return self.ret, self.frame.copy() if self.frame is not None else None
    
    def stop(self):
        self.running = False
        self.thread.join()

cam_thread = CameraThread(video_cam)

if not video_cam.isOpened():
    print("Cannot access the camera")
    exit()

# Get camera resolution
CAM_WIDTH = int(video_cam.get(cv2.CAP_PROP_FRAME_WIDTH))
CAM_HEIGHT = int(video_cam.get(cv2.CAP_PROP_FRAME_HEIGHT))

# Get monitor resolution for fullscreen
infoObject = pygame.display.Info()
MONITOR_WIDTH = infoObject.current_w
MONITOR_HEIGHT = infoObject.current_h

# Start in windowed mode with camera resolution
is_fullscreen = False
SCREEN_WIDTH = CAM_WIDTH
SCREEN_HEIGHT = CAM_HEIGHT

# Scale factor for UI elements (will be updated on fullscreen toggle)
UI_SCALE = 1.0

# Enable resizable window with hardware acceleration and vsync
screen = pygame.display.set_mode((SCREEN_WIDTH, SCREEN_HEIGHT), pygame.RESIZABLE | pygame.DOUBLEBUF | pygame.HWSURFACE)
pygame.display.set_caption("Flappy Bird Pygame (F11: Fullscreen)")

# Pre-allocate surfaces for faster rendering
frame_surface_cache = None

def build_camera_surface_no_scale(frame_bgr):
    """Rotate camera frame and fill screen while preserving aspect ratio (center-crop)."""
    frame_rotated = cv2.rotate(frame_bgr, cv2.ROTATE_90_COUNTERCLOCKWISE)
    src_h, src_w = frame_rotated.shape[:2]
    if src_w <= 0 or src_h <= 0:
        return pygame.Surface((SCREEN_WIDTH, SCREEN_HEIGHT))

    scale = max(SCREEN_WIDTH / src_w, SCREEN_HEIGHT / src_h)
    scaled_w = max(1, int(src_w * scale))
    scaled_h = max(1, int(src_h * scale))
    frame_scaled = cv2.resize(frame_rotated, (scaled_w, scaled_h), interpolation=cv2.INTER_LINEAR)

    frame_rgb = cv2.cvtColor(frame_scaled, cv2.COLOR_BGR2RGB)
    camera_surface = pygame.surfarray.make_surface(frame_rgb)

    draw_x = (SCREEN_WIDTH - camera_surface.get_width()) // 2
    draw_y = (SCREEN_HEIGHT - camera_surface.get_height()) // 2
    canvas = pygame.Surface((SCREEN_WIDTH, SCREEN_HEIGHT))
    canvas.blit(camera_surface, (draw_x, draw_y))
    return canvas

def get_ui_scale():
    """Calculate UI scale based on current screen size vs base size"""
    base_size = min(CAM_WIDTH, CAM_HEIGHT)
    current_size = min(SCREEN_WIDTH, SCREEN_HEIGHT)
    return current_size / base_size

def toggle_fullscreen(game=None):
    global screen, SCREEN_WIDTH, SCREEN_HEIGHT, is_fullscreen, BIRD_X_POS, UI_SCALE
    global pipe_image, pipe_image_top, base_image, pipe_mask, pipe_mask_top
    global bug_image_1_original, bug_image_2_original, bird_image_original, BIRD_WIDTH, BIRD_HEIGHT, BUG_WIDTH, BUG_HEIGHT
    global lgbt_image_1_original, lgbt_image_2_original, ENEMY_WIDTH, ENEMY_HEIGHT
    global pinkbird_image_1_original, pinkbird_image_2_original, PINK_ENEMY_WIDTH, PINK_ENEMY_HEIGHT
    global PINK_ENEMY_BASE_WIDTH, PINK_ENEMY_BASE_HEIGHT
    global boss_image_1_original, boss_image_2_original, bomb_image_original, bomb_mask
    global explosion_image_1_original, explosion_image_2_original, laser_beam_image_original, warning_sign_image, low_battery_image_original
    global BOSS_WIDTH, BOSS_HEIGHT, BOMB_WIDTH, BOMB_HEIGHT, BOMB_CONTENT_RECT, LASER_BEAM_HEIGHT
    
    is_fullscreen = not is_fullscreen
    if is_fullscreen:
        SCREEN_WIDTH = MONITOR_WIDTH
        SCREEN_HEIGHT = MONITOR_HEIGHT
        screen = pygame.display.set_mode((SCREEN_WIDTH, SCREEN_HEIGHT), pygame.FULLSCREEN | pygame.DOUBLEBUF | pygame.HWSURFACE)
    else:
        SCREEN_WIDTH = CAM_WIDTH
        SCREEN_HEIGHT = CAM_HEIGHT
        screen = pygame.display.set_mode((SCREEN_WIDTH, SCREEN_HEIGHT), pygame.RESIZABLE | pygame.DOUBLEBUF | pygame.HWSURFACE)
    
    # Update UI scale
    UI_SCALE = get_ui_scale()
    
    # Update dependent values
    BIRD_X_POS = SCREEN_WIDTH // 4
    
    # Scale bug size
    BUG_WIDTH = int(65 * UI_SCALE)
    BUG_HEIGHT = int(65 * UI_SCALE)
    BIRD_WIDTH = BUG_WIDTH
    BIRD_HEIGHT = BUG_HEIGHT
    bug_image_1_original = pygame.transform.scale(pygame.image.load('./assests/bug_1.png').convert_alpha(), (BUG_WIDTH, BUG_HEIGHT))
    bug_image_2_original = pygame.transform.scale(pygame.image.load('./assests/bug_2.png').convert_alpha(), (BUG_WIDTH, BUG_HEIGHT))
    bird_image_original = bug_image_1_original
    
    # Scale LGBT enemy images
    ENEMY_WIDTH = int(55 * UI_SCALE)
    ENEMY_HEIGHT = int(55 * UI_SCALE)
    lgbt_image_1_original = pygame.transform.scale(pygame.image.load('./assests/lgbtbase_1.png').convert_alpha(), (ENEMY_WIDTH, ENEMY_HEIGHT))
    lgbt_image_2_original = pygame.transform.scale(pygame.image.load('./assests/lgbtbase_2.png').convert_alpha(), (ENEMY_WIDTH, ENEMY_HEIGHT))

    # Scale pinkbird enemy images
    PINK_ENEMY_WIDTH = max(1, int(PINK_ENEMY_BASE_WIDTH * UI_SCALE))
    PINK_ENEMY_HEIGHT = max(1, int(PINK_ENEMY_BASE_HEIGHT * UI_SCALE))
    pinkbird_image_1_original = pygame.transform.scale(pygame.image.load('./assests/pinkbird-upflap.png').convert_alpha(), (PINK_ENEMY_WIDTH, PINK_ENEMY_HEIGHT))
    pinkbird_image_2_original = pygame.transform.scale(pygame.image.load('./assests/pinkbird-upflap_2.png').convert_alpha(), (PINK_ENEMY_WIDTH, PINK_ENEMY_HEIGHT))
    
    # Scale pipe width
    pipe_width_scaled = int(50 * UI_SCALE)

    # Scale boss battle assets
    BOSS_WIDTH = max(1, int(220 * UI_SCALE))
    BOSS_HEIGHT = max(1, int(170 * UI_SCALE))
    BOMB_HEIGHT = max(1, int(258 * 0.8 * UI_SCALE))
    LASER_BEAM_HEIGHT = max(1, int(360 * UI_SCALE))
    boss_image_1_original = pygame.transform.scale(pygame.image.load('./assests/boss_1.png').convert_alpha(), (BOSS_WIDTH, BOSS_HEIGHT))
    boss_image_2_original = pygame.transform.scale(pygame.image.load('./assests/boss_2.png').convert_alpha(), (BOSS_WIDTH, BOSS_HEIGHT))
    bomb_image_original = scale_surface_keep_aspect(pygame.image.load('./assests/boom.png').convert_alpha(), BOMB_HEIGHT)
    explosion_image_1_original = scale_surface_keep_aspect(pygame.image.load('./assests/explosion_1.png').convert_alpha(), BOMB_HEIGHT)
    explosion_image_2_original = scale_surface_keep_aspect(pygame.image.load('./assests/explosion_2.png').convert_alpha(), BOMB_HEIGHT)
    BOMB_WIDTH = bomb_image_original.get_width()
    BOMB_HEIGHT = bomb_image_original.get_height()
    BOMB_CONTENT_RECT = bomb_image_original.get_bounding_rect()
    if BOMB_CONTENT_RECT.width <= 0 or BOMB_CONTENT_RECT.height <= 0:
        BOMB_CONTENT_RECT = bomb_image_original.get_rect()
    bomb_mask = pygame.mask.from_surface(bomb_image_original)
    laser_beam_image_original = pygame.transform.scale(pygame.image.load('./assests/lazer_beam.png').convert_alpha(), (SCREEN_WIDTH, LASER_BEAM_HEIGHT))
    warning_sign_size = max(1, int(150 * UI_SCALE))
    warning_sign_image = scale_surface_keep_aspect(pygame.image.load('./assests/warning_sign.png').convert_alpha(), warning_sign_size)
    low_battery_size = max(1, int(BOSS_HEIGHT * 0.9))
    low_battery_image_original = scale_surface_keep_aspect(pygame.image.load('./assests/low_battery.png').convert_alpha(), low_battery_size)
    
    # Rescale images for new resolution
    pipe_image = pygame.transform.scale(pygame.image.load('./assests/pipe-green.png').convert_alpha(), (pipe_width_scaled, SCREEN_HEIGHT))
    pipe_image_top = pygame.transform.flip(pipe_image, False, True)
    base_image = pygame.transform.scale(pygame.image.load('./assests/base.png').convert_alpha(), (SCREEN_WIDTH, int(SCREEN_HEIGHT * 0.1)))
    pipe_mask = pygame.mask.from_surface(pipe_image)
    pipe_mask_top = pygame.mask.from_surface(pipe_image_top)
    
    # Update bug image if game exists
    if game:
        game.bird.current_sprite = bug_image_1_original
        game.bird.image = game.bird.current_sprite
        game.bird.mask = pygame.mask.from_surface(game.bird.image)
        # Scale bug's position proportionally
        old_y_ratio = game.bird.y / (CAM_HEIGHT if not is_fullscreen else MONITOR_HEIGHT)
        old_x_ratio = game.bird.x / (CAM_WIDTH if not is_fullscreen else MONITOR_WIDTH)
        game.bird.y = int(old_y_ratio * SCREEN_HEIGHT)
        game.bird.x = int(old_x_ratio * SCREEN_WIDTH)
        game.bird.target_y = game.bird.y
        game.bird.target_x = game.bird.x
        game.bird.last_detected_y = game.bird.y
        game.bird.last_detected_x = game.bird.x
        game.bird.y_history = [game.bird.y] * 5
        game.bird.x_history = [game.bird.x] * 5
        # Update enemy size
        if hasattr(game, 'enemy'):
            game.enemy.width = ENEMY_WIDTH
            game.enemy.height = ENEMY_HEIGHT
            game.enemy.charge_speed = 6 * UI_SCALE
        if hasattr(game, 'pink_enemy'):
            game.pink_enemy.width = PINK_ENEMY_WIDTH
            game.pink_enemy.height = PINK_ENEMY_HEIGHT
            game.pink_enemy.diagonal_speed = 5 * UI_SCALE

        # Update boss size and placement helpers
        if hasattr(game, 'boss'):
            game.boss.sync_scaled_assets()
        # Update pipes positions
        for pipe in game.pipes:
            pipe.height = int(pipe.height * UI_SCALE) if is_fullscreen else int(pipe.height / (MONITOR_HEIGHT / CAM_HEIGHT))
    
    return BIRD_X_POS

def handle_resize(new_width, new_height, game=None):
    """Handle window resize event (including maximize)"""
    global screen, SCREEN_WIDTH, SCREEN_HEIGHT, BIRD_X_POS, UI_SCALE
    global pipe_image, pipe_image_top, base_image, pipe_mask, pipe_mask_top
    global bug_image_1_original, bug_image_2_original, bird_image_original, BIRD_WIDTH, BIRD_HEIGHT, BUG_WIDTH, BUG_HEIGHT
    global lgbt_image_1_original, lgbt_image_2_original, ENEMY_WIDTH, ENEMY_HEIGHT
    global pinkbird_image_1_original, pinkbird_image_2_original, PINK_ENEMY_WIDTH, PINK_ENEMY_HEIGHT
    global PINK_ENEMY_BASE_WIDTH, PINK_ENEMY_BASE_HEIGHT
    global boss_image_1_original, boss_image_2_original, bomb_image_original, bomb_mask
    global explosion_image_1_original, explosion_image_2_original, laser_beam_image_original, warning_sign_image, low_battery_image_original
    global BOSS_WIDTH, BOSS_HEIGHT, BOMB_WIDTH, BOMB_HEIGHT, BOMB_CONTENT_RECT, LASER_BEAM_HEIGHT
    
    old_height = SCREEN_HEIGHT
    SCREEN_WIDTH = new_width
    SCREEN_HEIGHT = new_height
    
    # Update UI scale
    UI_SCALE = get_ui_scale()
    
    # Update dependent values
    BIRD_X_POS = SCREEN_WIDTH // 4
    
    # Scale bug size
    BUG_WIDTH = int(65 * UI_SCALE)
    BUG_HEIGHT = int(65 * UI_SCALE)
    BIRD_WIDTH = BUG_WIDTH
    BIRD_HEIGHT = BUG_HEIGHT
    bug_image_1_original = pygame.transform.scale(pygame.image.load('./assests/bug_1.png').convert_alpha(), (BUG_WIDTH, BUG_HEIGHT))
    bug_image_2_original = pygame.transform.scale(pygame.image.load('./assests/bug_2.png').convert_alpha(), (BUG_WIDTH, BUG_HEIGHT))
    bird_image_original = bug_image_1_original
    
    # Scale LGBT enemy images
    ENEMY_WIDTH = int(55 * UI_SCALE)
    ENEMY_HEIGHT = int(55 * UI_SCALE)
    lgbt_image_1_original = pygame.transform.scale(pygame.image.load('./assests/lgbtbase_1.png').convert_alpha(), (ENEMY_WIDTH, ENEMY_HEIGHT))
    lgbt_image_2_original = pygame.transform.scale(pygame.image.load('./assests/lgbtbase_2.png').convert_alpha(), (ENEMY_WIDTH, ENEMY_HEIGHT))

    # Scale pinkbird enemy images
    PINK_ENEMY_WIDTH = max(1, int(PINK_ENEMY_BASE_WIDTH * UI_SCALE))
    PINK_ENEMY_HEIGHT = max(1, int(PINK_ENEMY_BASE_HEIGHT * UI_SCALE))
    pinkbird_image_1_original = pygame.transform.scale(pygame.image.load('./assests/pinkbird-upflap.png').convert_alpha(), (PINK_ENEMY_WIDTH, PINK_ENEMY_HEIGHT))
    pinkbird_image_2_original = pygame.transform.scale(pygame.image.load('./assests/pinkbird-upflap_2.png').convert_alpha(), (PINK_ENEMY_WIDTH, PINK_ENEMY_HEIGHT))
    
    # Scale pipe width
    pipe_width_scaled = int(50 * UI_SCALE)

    # Scale boss battle assets
    BOSS_WIDTH = max(1, int(220 * UI_SCALE))
    BOSS_HEIGHT = max(1, int(170 * UI_SCALE))
    BOMB_HEIGHT = max(1, int(258 * 0.8 * UI_SCALE))
    LASER_BEAM_HEIGHT = max(1, int(360 * UI_SCALE))
    boss_image_1_original = pygame.transform.scale(pygame.image.load('./assests/boss_1.png').convert_alpha(), (BOSS_WIDTH, BOSS_HEIGHT))
    boss_image_2_original = pygame.transform.scale(pygame.image.load('./assests/boss_2.png').convert_alpha(), (BOSS_WIDTH, BOSS_HEIGHT))
    bomb_image_original = scale_surface_keep_aspect(pygame.image.load('./assests/boom.png').convert_alpha(), BOMB_HEIGHT)
    explosion_image_1_original = scale_surface_keep_aspect(pygame.image.load('./assests/explosion_1.png').convert_alpha(), BOMB_HEIGHT)
    explosion_image_2_original = scale_surface_keep_aspect(pygame.image.load('./assests/explosion_2.png').convert_alpha(), BOMB_HEIGHT)
    BOMB_WIDTH = bomb_image_original.get_width()
    BOMB_HEIGHT = bomb_image_original.get_height()
    BOMB_CONTENT_RECT = bomb_image_original.get_bounding_rect()
    if BOMB_CONTENT_RECT.width <= 0 or BOMB_CONTENT_RECT.height <= 0:
        BOMB_CONTENT_RECT = bomb_image_original.get_rect()
    bomb_mask = pygame.mask.from_surface(bomb_image_original)
    laser_beam_image_original = pygame.transform.scale(pygame.image.load('./assests/lazer_beam.png').convert_alpha(), (SCREEN_WIDTH, LASER_BEAM_HEIGHT))
    warning_sign_size = max(1, int(150 * UI_SCALE))
    warning_sign_image = scale_surface_keep_aspect(pygame.image.load('./assests/warning_sign.png').convert_alpha(), warning_sign_size)
    low_battery_size = max(1, int(BOSS_HEIGHT * 0.9))
    low_battery_image_original = scale_surface_keep_aspect(pygame.image.load('./assests/low_battery.png').convert_alpha(), low_battery_size)
    
    # Rescale images for new resolution
    pipe_image = pygame.transform.scale(pygame.image.load('./assests/pipe-green.png').convert_alpha(), (pipe_width_scaled, SCREEN_HEIGHT))
    pipe_image_top = pygame.transform.flip(pipe_image, False, True)
    base_image = pygame.transform.scale(pygame.image.load('./assests/base.png').convert_alpha(), (SCREEN_WIDTH, int(SCREEN_HEIGHT * 0.1)))
    pipe_mask = pygame.mask.from_surface(pipe_image)
    pipe_mask_top = pygame.transform.flip(pipe_image, False, True)
    pipe_mask_top = pygame.mask.from_surface(pipe_image_top)
    
    # Update bug and pipes if game exists
    if game:
        game.bird.current_sprite = bug_image_1_original
        game.bird.image = game.bird.current_sprite
        game.bird.mask = pygame.mask.from_surface(game.bird.image)
        # Scale bug's position proportionally
        if old_height > 0:
            y_ratio = game.bird.y / old_height
            game.bird.y = int(y_ratio * SCREEN_HEIGHT)
            game.bird.target_y = game.bird.y
            game.bird.last_detected_y = game.bird.y
            game.bird.y_history = [game.bird.y] * 5
            # Also scale X
            x_ratio = game.bird.x / old_height * (old_height / SCREEN_WIDTH) if SCREEN_WIDTH > 0 else 0.25
            game.bird.x = int(x_ratio * SCREEN_WIDTH)
            game.bird.target_x = game.bird.x
            game.bird.last_detected_x = game.bird.x
            game.bird.x_history = [game.bird.x] * 5
        # Update enemy size
        if hasattr(game, 'enemy'):
            game.enemy.width = ENEMY_WIDTH
            game.enemy.height = ENEMY_HEIGHT
            game.enemy.charge_speed = 6 * UI_SCALE
        if hasattr(game, 'pink_enemy'):
            game.pink_enemy.width = PINK_ENEMY_WIDTH
            game.pink_enemy.height = PINK_ENEMY_HEIGHT
            game.pink_enemy.diagonal_speed = 5 * UI_SCALE

        # Update boss size and placement helpers
        if hasattr(game, 'boss'):
            game.boss.sync_scaled_assets()
        # Update pipes positions
        for pipe in game.pipes:
            if old_height > 0:
                pipe.height = int(pipe.height * SCREEN_HEIGHT / old_height)

# Constants
PIPE_WIDTH = 50
PIPE_SPEED_BASE = 2.5  # Adjusted for 240 FPS (8 * 60/240)
PIPE_SPEED_MAX = 6  # Adjusted for 240 FPS (20 * 60/240)
PIPE_SPEED_INCREMENT = 0.125  # Speed increase per pipe passed (adjusted for 240 FPS)
PIPE_MOTION_SUBSTEPS = 3  # Higher update rate for smoother pipe movement
BIRD_HEIGHT_PERCENT_TO_SCREEN = 0.05
BIRD_X_POS = SCREEN_WIDTH // 4
PROCESSING_SCALE = 1.0  # Full resolution for maximum accuracy (GPU can handle it)
DETECTION_INTERVAL = 2  # Detect every 2 frames (still 120Hz detection at 240 FPS)
FPS = 240  # High FPS for ultra-smooth gameplay with powerful GPU
BOSS_TRIGGER_SCORE = 12
BOSS_WARNING_DURATION_FRAMES = int(FPS * 1.4)
BOSS_ATTACK_WARNING_FRAMES = FPS * 1
BOSS_BOMB_TOTAL = 10
BOSS_BOMB_CHAIN_INTERVAL_FRAMES = int(FPS * 0.3)
BOSS_LASER_TOTAL = 10
BOSS_LASER_CHAIN_INTERVAL_FRAMES = int(FPS * 0.3)
BOSS_POST_ATTACK_DELAY_FRAMES = int(FPS * 1.0)
BOSS_LOW_BATTERY_BLINK_PERIOD = max(1, int(FPS * 0.15))
BOSS_TRANSITION_DELAY_FRAMES = int(FPS * 0.5)
RED_FLASH_SPEED_MULTIPLIER = 2.16
PIPE_SPAWN_THRESHOLD = -0.15  # Spawn new pipe when last pipe reaches this X position (fraction of screen)
                              # Lower/negative = spawn later = MORE space between pipes

# Colors
WHITE = (255, 255, 255)
BLACK = (0, 0, 0)
YELLOW = (255, 215, 0)
GREEN = (50, 205, 50)
RED = (220, 60, 60)
BUTTON_COLOR = (70, 130, 180)

# Rainbow colors for bullets
RAINBOW_COLORS = [
    (255, 0, 0),      # Red
    (255, 127, 0),    # Orange
    (255, 255, 0),    # Yellow
    (0, 255, 0),      # Green
    (0, 0, 255),      # Blue
    (75, 0, 130),     # Indigo
    (148, 0, 211),    # Violet
]
BUTTON_HOVER = (100, 160, 210)

# Helper function to draw text with black border
def draw_text_with_border(surface, text, font, color, x, y, border_color=BLACK, border_width=2):
    # Draw border (text in 8 directions)
    for dx in range(-border_width, border_width + 1):
        for dy in range(-border_width, border_width + 1):
            if dx != 0 or dy != 0:
                border_text = font.render(text, True, border_color)
                surface.blit(border_text, (x + dx, y + dy))
    # Draw main text
    main_text = font.render(text, True, color)
    surface.blit(main_text, (x, y))

def scale_surface_keep_aspect(surface, target_height):
    """Scale by height while preserving the original aspect ratio."""
    safe_height = max(1, int(target_height))
    aspect_ratio = surface.get_width() / max(1, surface.get_height())
    scaled_width = max(1, int(safe_height * aspect_ratio))
    return pygame.transform.smoothscale(surface, (scaled_width, safe_height))

# Button class
class Button:
    def __init__(self, x, y, width, height, text, font, text_color=WHITE, bg_color=BUTTON_COLOR, hover_color=BUTTON_HOVER):
        self.rect = pygame.Rect(x, y, width, height)
        self.text = text
        self.font = font
        self.text_color = text_color
        self.bg_color = bg_color
        self.hover_color = hover_color
        self.is_hovered = False
    
    def draw(self, surface):
        color = self.hover_color if self.is_hovered else self.bg_color
        pygame.draw.rect(surface, color, self.rect, border_radius=10)
        pygame.draw.rect(surface, BLACK, self.rect, 3, border_radius=10)
        
        text_surface = self.font.render(self.text, True, self.text_color)
        text_x = self.rect.centerx - text_surface.get_width() // 2
        text_y = self.rect.centery - text_surface.get_height() // 2
        draw_text_with_border(surface, self.text, self.font, self.text_color, text_x, text_y)
    
    def check_hover(self, mouse_pos):
        self.is_hovered = self.rect.collidepoint(mouse_pos)
        return self.is_hovered
    
    def is_clicked(self, mouse_pos, mouse_clicked):
        return self.rect.collidepoint(mouse_pos) and mouse_clicked

# Load images
bug_image_1 = pygame.image.load('./assests/bug_1.png').convert_alpha()
bug_image_2 = pygame.image.load('./assests/bug_2.png').convert_alpha()
pipe_image = pygame.image.load('./assests/pipe-green.png').convert_alpha()
base_image = pygame.image.load('./assests/base.png').convert_alpha()

# Load LGBT enemy fly images
lgbt_image_1 = pygame.image.load('./assests/lgbtbase_1.png').convert_alpha()
lgbt_image_2 = pygame.image.load('./assests/lgbtbase_2.png').convert_alpha()

# Load pinkbird enemy fly images
pinkbird_image_1 = pygame.image.load('./assests/pinkbird-upflap.png').convert_alpha()
pinkbird_image_2 = pygame.image.load('./assests/pinkbird-upflap_2.png').convert_alpha()

# Load boss battle images
boss_image_1 = pygame.image.load('./assests/boss_1.png').convert_alpha()
boss_image_2 = pygame.image.load('./assests/boss_2.png').convert_alpha()
bomb_image = pygame.image.load('./assests/boom.png').convert_alpha()
explosion_image_1 = pygame.image.load('./assests/explosion_1.png').convert_alpha()
explosion_image_2 = pygame.image.load('./assests/explosion_2.png').convert_alpha()
laser_beam_image = pygame.image.load('./assests/lazer_beam.png').convert_alpha()
warning_sign = pygame.image.load('./assests/warning_sign.png').convert_alpha()
low_battery_image = pygame.image.load('./assests/low_battery.png').convert_alpha()

# Scale images (bug size)
BUG_WIDTH = 65
BUG_HEIGHT = 65  # Square for bug
bug_image_1_original = pygame.transform.scale(bug_image_1, (BUG_WIDTH, BUG_HEIGHT))
bug_image_2_original = pygame.transform.scale(bug_image_2, (BUG_WIDTH, BUG_HEIGHT))

# Scale LGBT enemy images
ENEMY_WIDTH = 55
ENEMY_HEIGHT = 55
lgbt_image_1_original = pygame.transform.scale(lgbt_image_1, (ENEMY_WIDTH, ENEMY_HEIGHT))
lgbt_image_2_original = pygame.transform.scale(lgbt_image_2, (ENEMY_WIDTH, ENEMY_HEIGHT))

# Scale pinkbird enemy images (keep original ratio)
PINK_ENEMY_BASE_SCALE = 0.45
PINK_ENEMY_BASE_WIDTH = max(1, int(pinkbird_image_1.get_width() * PINK_ENEMY_BASE_SCALE))
PINK_ENEMY_BASE_HEIGHT = max(1, int(pinkbird_image_1.get_height() * PINK_ENEMY_BASE_SCALE))
PINK_ENEMY_WIDTH = PINK_ENEMY_BASE_WIDTH
PINK_ENEMY_HEIGHT = PINK_ENEMY_BASE_HEIGHT
pinkbird_image_1_original = pygame.transform.scale(pinkbird_image_1, (PINK_ENEMY_WIDTH, PINK_ENEMY_HEIGHT))
pinkbird_image_2_original = pygame.transform.scale(pinkbird_image_2, (PINK_ENEMY_WIDTH, PINK_ENEMY_HEIGHT))

# Scale boss battle assets
BOSS_WIDTH = 220
BOSS_HEIGHT = 170
BOMB_HEIGHT = int(258 * 0.8)
LASER_BEAM_HEIGHT = 360
boss_image_1_original = pygame.transform.scale(boss_image_1, (BOSS_WIDTH, BOSS_HEIGHT))
boss_image_2_original = pygame.transform.scale(boss_image_2, (BOSS_WIDTH, BOSS_HEIGHT))
bomb_image_original = scale_surface_keep_aspect(bomb_image, BOMB_HEIGHT)
explosion_image_1_original = scale_surface_keep_aspect(explosion_image_1, BOMB_HEIGHT)
explosion_image_2_original = scale_surface_keep_aspect(explosion_image_2, BOMB_HEIGHT)
BOMB_WIDTH = bomb_image_original.get_width()
BOMB_HEIGHT = bomb_image_original.get_height()
BOMB_CONTENT_RECT = bomb_image_original.get_bounding_rect()
if BOMB_CONTENT_RECT.width <= 0 or BOMB_CONTENT_RECT.height <= 0:
    BOMB_CONTENT_RECT = bomb_image_original.get_rect()
bomb_mask = pygame.mask.from_surface(bomb_image_original)
laser_beam_image_original = pygame.transform.scale(laser_beam_image, (SCREEN_WIDTH, LASER_BEAM_HEIGHT))
LASER_CONTENT_RATIO = laser_beam_image.get_bounding_rect().height / max(1, laser_beam_image.get_height())
warning_sign_image = scale_surface_keep_aspect(warning_sign, 150)
low_battery_image_original = scale_surface_keep_aspect(low_battery_image, int(BOSS_HEIGHT * 0.9))
# For compatibility with existing code
BIRD_WIDTH = BUG_WIDTH
BIRD_HEIGHT = BUG_HEIGHT
bird_image_original = bug_image_1_original  # Default to first frame
pipe_image = pygame.transform.scale(pipe_image, (PIPE_WIDTH, SCREEN_HEIGHT))
pipe_image_top = pygame.transform.flip(pipe_image, False, True)  # Flip vertically for top pipe
base_image = pygame.transform.scale(base_image, (SCREEN_WIDTH, int(SCREEN_HEIGHT * 0.1)))

# Animation settings
BUG_ANIMATION_SPEED = 8  # Change sprite every N frames (adjusted for 240 FPS)

# Create masks for pixel-perfect collision (will be updated dynamically for bug)
pipe_mask = pygame.mask.from_surface(pipe_image)
pipe_mask_top = pygame.mask.from_surface(pipe_image_top)

# Class Bug (renamed from Bird)

class Bird:
    def __init__(self):
        self.x = BIRD_X_POS
        self.y = SCREEN_HEIGHT // 2
        self.target_x = self.x
        self.target_y = self.y
        self.x_history = [self.x] * 5  # Increased smoothing buffer
        self.y_history = [self.y] * 5
        self.dead_zone = 1  # Reduced from 3 for higher sensitivity
        self.max_speed = 50  # Adjusted for 240 FPS (100 * 120/240)
        self.frame_counter = 0
        self.last_detected_x = self.x
        self.last_detected_y = self.y
        self.velocity_x = 0  # Track horizontal velocity
        self.velocity_y = 0  # Track vertical velocity for rotation
        self.rotation = 0  # Current rotation angle
        self.animation_frame = 0  # For wing flapping animation
        self.current_sprite = bug_image_1_original
        self.image = self.current_sprite
        self.mask = pygame.mask.from_surface(self.image)

    def _clamp_topleft_to_visible_content(self, x, y):
        content_rect = self.current_sprite.get_bounding_rect()
        if content_rect.width <= 0 or content_rect.height <= 0:
            content_rect = self.current_sprite.get_rect()

        min_x = -content_rect.x
        max_x = SCREEN_WIDTH - (content_rect.x + content_rect.width)
        min_y = -content_rect.y
        max_y = SCREEN_HEIGHT - (content_rect.y + content_rect.height)

        clamped_x = max(int(min_x), min(int(max_x), int(x)))
        clamped_y = max(int(min_y), min(int(max_y), int(y)))
        return clamped_x, clamped_y

    def _clamp_rotated_visible_content_to_screen(self):
        rotated_rect = self.image.get_rect(center=(self.x + BIRD_WIDTH // 2, self.y + BIRD_HEIGHT // 2))
        content_rect = self.image.get_bounding_rect()
        if content_rect.width <= 0 or content_rect.height <= 0:
            content_rect = self.image.get_rect()

        visible_left = rotated_rect.x + content_rect.x
        visible_top = rotated_rect.y + content_rect.y
        visible_right = visible_left + content_rect.width
        visible_bottom = visible_top + content_rect.height

        adjust_x = 0
        adjust_y = 0

        if visible_left < 0:
            adjust_x = -visible_left
        elif visible_right > SCREEN_WIDTH:
            adjust_x = SCREEN_WIDTH - visible_right

        if visible_top < 0:
            adjust_y = -visible_top
        elif visible_bottom > SCREEN_HEIGHT:
            adjust_y = SCREEN_HEIGHT - visible_bottom

        if adjust_x != 0 or adjust_y != 0:
            self.x += int(adjust_x)
            self.y += int(adjust_y)
            self.target_x = self.x
            self.target_y = self.y
            self.last_detected_x = self.x
            self.last_detected_y = self.y

    def update(self, frame):
        self.frame_counter += 1
        
        # Run face detection every frame for smoother tracking
        if self.frame_counter % DETECTION_INTERVAL == 0:
            # Resize frame for processing
            small_frame = cv2.resize(frame, (0, 0), fx=PROCESSING_SCALE, fy=PROCESSING_SCALE)
            
            # Prepare the frame for DNN (larger blob for better accuracy with powerful GPU)
            blob = cv2.dnn.blobFromImage(small_frame, 1.0, (300, 300), [104, 117, 123], False, False)
            
            # Run face detection on GPU
            net.setInput(blob)
            detections = net.forward()
            
            max_confidence = 0
            best_face = None
            
            h, w = small_frame.shape[:2]
            
            # Find face with highest confidence (higher threshold to avoid false positives)
            for i in range(detections.shape[2]):
                confidence = detections[0, 0, i, 2]
                if confidence > 0.7 and confidence > max_confidence:
                    box = detections[0, 0, i, 3:7] * np.array([w, h, w, h])
                    best_face = box.astype("int")
                    max_confidence = confidence

            if best_face is not None:
                (x1, y1, x2, y2) = best_face
                
                # Scale up coordinates
                x1 = int(x1 / PROCESSING_SCALE)
                y1 = int(y1 / PROCESSING_SCALE)
                x2 = int(x2 / PROCESSING_SCALE)
                y2 = int(y2 / PROCESSING_SCALE)
                
                # Estimate nose position inside the face box (better control anchor than face center).
                face_w = max(1, x2 - x1)
                face_h = max(1, y2 - y1)
                face_x = x1 + int(face_w * 0.5)
                face_y = y1 + int(face_h * 0.48)
                
                # Map to screen (mirror X for natural movement) and expand range
                # so users can still hit screen edges even if nose can't reach camera borders.
                nose_ratio_x = (CAM_WIDTH - face_x) / max(1, CAM_WIDTH)
                nose_ratio_y = face_y / max(1, CAM_HEIGHT)
                expanded_x = (nose_ratio_x - 0.5) * 1.35 + 0.5
                expanded_y = (nose_ratio_y - 0.5) * 1.25 + 0.5
                expanded_x = max(0.0, min(1.0, expanded_x))
                expanded_y = max(0.0, min(1.0, expanded_y))
                screen_x = int(expanded_x * SCREEN_WIDTH)
                screen_y = int(expanded_y * SCREEN_HEIGHT)
                
                # Convert face center target to bird top-left position.
                screen_x -= BIRD_WIDTH // 2
                screen_y -= BIRD_HEIGHT // 2
                
                # Clamp by visible sprite content so the bug can touch screen edges.
                screen_x, screen_y = self._clamp_topleft_to_visible_content(screen_x, screen_y)
                
                self.last_detected_x = screen_x
                self.last_detected_y = screen_y
                self.target_x = self.last_detected_x
                self.target_y = self.last_detected_y
        else:
            self.target_x = self.last_detected_x
            self.target_y = self.last_detected_y

        # Apply dead zone and movement
        old_x = self.x
        old_y = self.y
        scaled_dead_zone = self.dead_zone * UI_SCALE
        scaled_max_speed = self.max_speed * UI_SCALE
        
        # Update X position with 5-element weighted smoothing for 240 FPS
        if abs(self.target_x - self.x) > scaled_dead_zone:
            direction = 1 if self.target_x > self.x else -1
            move_amount = min(abs(self.target_x - self.x), scaled_max_speed)
            new_x = self.x + direction * move_amount
            
            self.x_history.pop(0)
            self.x_history.append(new_x)
            # Weighted average: newer values have more weight
            self.x = int((self.x_history[0] + 2*self.x_history[1] + 3*self.x_history[2] + 4*self.x_history[3] + 5*self.x_history[4]) / 15)
        
        # Update Y position with 5-element weighted smoothing for 240 FPS
        if abs(self.target_y - self.y) > scaled_dead_zone:
            direction = 1 if self.target_y > self.y else -1
            move_amount = min(abs(self.target_y - self.y), scaled_max_speed)
            new_y = self.y + direction * move_amount
            
            self.y_history.pop(0)
            self.y_history.append(new_y)
            # Weighted average: newer values have more weight
            self.y = int((self.y_history[0] + 2*self.y_history[1] + 3*self.y_history[2] + 4*self.y_history[3] + 5*self.y_history[4]) / 15)
        
        # Calculate velocity for rotation
        self.velocity_x = self.x - old_x
        self.velocity_y = self.y - old_y
        
        # Update rotation based on velocity (going up = tilt up 45°, going down = tilt down 45°)
        velocity_threshold = 1.5 * UI_SCALE  # Adjusted for 240 FPS
        if self.velocity_y < -velocity_threshold:  # Moving up
            target_rotation = 45
        elif self.velocity_y > velocity_threshold:  # Moving down
            target_rotation = -45
        else:  # Relatively stable
            target_rotation = 0
        
        # Smooth rotation transition (adjusted for 240 FPS)
        rotation_speed = 4  # Slower per-frame for same visual speed at 240 FPS
        if self.rotation < target_rotation:
            self.rotation = min(self.rotation + rotation_speed, target_rotation)
        elif self.rotation > target_rotation:
            self.rotation = max(self.rotation - rotation_speed, target_rotation)
        
        # Update wing flapping animation
        self.animation_frame += 1
        if self.animation_frame >= BUG_ANIMATION_SPEED:
            self.animation_frame = 0
            # Toggle between bug sprites
            if self.current_sprite == bug_image_1_original:
                self.current_sprite = bug_image_2_original
            else:
                self.current_sprite = bug_image_1_original
        
        # Rotate the bug image
        self.image = pygame.transform.rotate(self.current_sprite, self.rotation)
        self.mask = pygame.mask.from_surface(self.image)
        self._clamp_rotated_visible_content_to_screen()

    def get_collision_topleft(self):
        """Return the top-left of the rotated sprite used for both draw and collision."""
        rotated_rect = self.image.get_rect(center=(self.x + BIRD_WIDTH // 2, self.y + BIRD_HEIGHT // 2))
        return rotated_rect.topleft

    def draw(self, screen):
        # Use the same topleft as collision to avoid visual-vs-logic delay.
        rotated_rect = self.image.get_rect(topleft=self.get_collision_topleft())
        screen.blit(self.image, rotated_rect.topleft)

# Rainbow Bullet class - bouncing projectile
class RainbowBullet:
    def __init__(self, x, y, vx, vy):
        self.x = x
        self.y = y
        self.vx = vx * 0.5  # Velocity X (adjusted for 240 FPS)
        self.vy = vy * 0.5  # Velocity Y (adjusted for 240 FPS)
        self.radius = int(12 * UI_SCALE)
        self.bounce_count = 0
        self.max_bounces = 2
        self.active = True
        self.color_index = 0
        self.color_timer = 0
        self.color_speed = 6  # Change color every N frames (adjusted for 240 FPS)
    
    def update(self):
        if not self.active:
            return
        
        # Move bullet
        self.x += self.vx
        self.y += self.vy
        
        # Cycle through rainbow colors
        self.color_timer += 1
        if self.color_timer >= self.color_speed:
            self.color_timer = 0
            self.color_index = (self.color_index + 1) % len(RAINBOW_COLORS)
        
        # Check wall collision and bounce
        bounced = False
        
        # Left/Right walls
        if self.x - self.radius <= 0:
            self.x = self.radius
            self.vx = -self.vx
            bounced = True
        elif self.x + self.radius >= SCREEN_WIDTH:
            self.x = SCREEN_WIDTH - self.radius
            self.vx = -self.vx
            bounced = True
        
        # Top/Bottom walls
        if self.y - self.radius <= 0:
            self.y = self.radius
            self.vy = -self.vy
            bounced = True
        elif self.y + self.radius >= SCREEN_HEIGHT:
            self.y = SCREEN_HEIGHT - self.radius
            self.vy = -self.vy
            bounced = True
        
        if bounced:
            self.bounce_count += 1
            if self.bounce_count > self.max_bounces:
                self.active = False
    
    def draw(self, screen):
        if not self.active:
            return
        
        # Draw rainbow gradient circle
        color = RAINBOW_COLORS[self.color_index]
        pygame.draw.circle(screen, color, (int(self.x), int(self.y)), self.radius)
        # Draw inner glow
        inner_color = RAINBOW_COLORS[(self.color_index + 2) % len(RAINBOW_COLORS)]
        pygame.draw.circle(screen, inner_color, (int(self.x), int(self.y)), self.radius // 2)
    
    def collide(self, bird):
        """Check collision with player bird - very tight collision, bullet must touch sprite closely"""
        if not self.active:
            return False
        
        bird_left, bird_top = bird.get_collision_topleft()
        bird_center_x = bird_left + BIRD_WIDTH // 2
        bird_center_y = bird_top + BIRD_HEIGHT // 2
        
        # Use smaller hitbox for more forgiving collision (only inner 60% of bird)
        hitbox_width = BIRD_WIDTH * 0.5
        hitbox_height = BIRD_HEIGHT * 0.5
        
        # Also use smaller collision radius for bullet (inner part only)
        collision_radius = self.radius * 0.4
        
        dx = abs(self.x - bird_center_x)
        dy = abs(self.y - bird_center_y)
        
        # Check if bullet center is within the tight hitbox
        if dx > (hitbox_width // 2 + collision_radius):
            return False
        if dy > (hitbox_height // 2 + collision_radius):
            return False
        
        if dx <= hitbox_width // 2:
            return True
        if dy <= hitbox_height // 2:
            return True
        
        corner_dist = (dx - hitbox_width // 2) ** 2 + (dy - hitbox_height // 2) ** 2
        return corner_dist <= collision_radius ** 2

# Enemy LGBT Fly class - charges toward player or shoots bullets
class EnemyFly:
    # States
    STATE_IDLE = 0           # Waiting to spawn
    STATE_ENTERING = 1       # Flying in from side at target height
    STATE_WARNING = 2        # Showing warning line
    STATE_WINDUP = 3         # Pull back before charge
    STATE_CHARGING = 4       # Charging toward player
    STATE_HEART_PATTERN = 5  # Flying heart pattern after passing player
    STATE_EXITING = 6        # Flying off screen
    STATE_SHOOTING = 7       # Shooting bullets mode (odd score)
    
    # Attack modes
    MODE_CHARGE = 0  # Even score - charge at player
    MODE_SHOOT = 1   # Odd score - shoot bullets
    SHOOT_UNLOCK_SCORE = 3  # Shoot mode appears only when score > 3
    
    def __init__(self, target_bird):
        self.target = target_bird
        self.x = -100
        self.y = SCREEN_HEIGHT // 2
        self.animation_frame = 0
        self.animation_speed = 8  # Adjusted for 240 FPS
        self.current_sprite = lgbt_image_1_original
        self.image = self.current_sprite
        self.mask = pygame.mask.from_surface(self.image)
        self.active = False
        self.width = ENEMY_WIDTH
        self.height = ENEMY_HEIGHT
        
        # State machine
        self.state = self.STATE_IDLE
        self.state_timer = 0
        
        # Direction: 1 = from left, -1 = from right
        self.direction = 1
        self.from_left = True  # First time from left
        
        # Attack mode
        self.attack_mode = self.MODE_CHARGE
        self.shooting_unlocked = False
        
        # Charge attack (adjusted for 240 FPS)
        self.charge_target_y = 0
        self.charge_speed = 6 * UI_SCALE  # Slower charge for easier dodging
        self.enter_speed = 4 * UI_SCALE  # Speed when entering screen
        self.exit_speed = 3 * UI_SCALE  # Speed when exiting screen
        self.warning_duration = 120  # 0.5s at 240 FPS - more time to react
        self.windup_duration = 80  # Longer windup for more dramatic effect (0.33s at 240 FPS)
        self.warning_flash = 0
        self.windup_start_x = 0
        self.windup_shake = 0  # For shake effect during windup
        self.pull_back_distance = 80  # Deeper pull back distance
        
        # Heart pattern - larger heart = easier to dodge
        self.heart_angle = 0
        self.heart_center_x = 0
        self.heart_center_y = 0
        self.heart_size = 120 * UI_SCALE  # Bigger heart pattern (was 80)
        self.heart_speed = 0.025  # Slower heart movement for easier dodging
        self.passed_player = False
        
        # Shooting mode
        self.bullets = []
        self.shoot_timer = 0
        self.shoot_interval = 60  # Frames between shots (adjusted for 240 FPS = 0.25s)
        self.shots_fired = 0
        self.max_shots = 3  # Shoot 3 bullets per attack round
        self.deactivate_after_exit = False
        self.hover_angle = 0  # For hovering animation
    
    def activate(self, score=0):
        """Activate the enemy fly with attack mode based on score"""
        self.active = True
        self.passed_player = False
        self.shooting_unlocked = score > self.SHOOT_UNLOCK_SCORE
        self.deactivate_after_exit = False
        
        # Determine attack mode based on score (shoot only unlocked after score > 5)
        if self.shooting_unlocked and score % 2 == 1:
            self.attack_mode = self.MODE_SHOOT
            self.shots_fired = 0
            self.shoot_timer = 0
            if score >= 10:
                self.max_shots = 5
                self.shoot_interval = 30
            else:
                self.max_shots = 3
                self.shoot_interval = 60
        else:
            self.attack_mode = self.MODE_CHARGE
            self.max_shots = 3
            self.shoot_interval = 60
        
        self.charge_target_y = self.target.y + BIRD_HEIGHT // 2
        
        if self.from_left:
            self.direction = 1
            self.x = -self.width - 20
        else:
            self.direction = -1
            self.x = SCREEN_WIDTH + 20
        
        self.y = self.charge_target_y - self.height // 2
        self.state = self.STATE_ENTERING
        self.state_timer = 0
    
    def shoot_bullet(self):
        """Fire a rainbow bullet toward the player"""
        # Calculate direction to player
        start_x = self.x + self.width // 2
        start_y = self.y + self.height // 2
        target_x = self.target.x + BIRD_WIDTH // 2
        target_y = self.target.y + BIRD_HEIGHT // 2
        
        dx = target_x - start_x
        dy = target_y - start_y
        dist = math.sqrt(dx*dx + dy*dy) if dx*dx + dy*dy > 0 else 1
        
        bullet_speed = 8 * UI_SCALE
        vx = (dx / dist) * bullet_speed
        vy = (dy / dist) * bullet_speed
        
        bullet = RainbowBullet(start_x, start_y, vx, vy)
        self.bullets.append(bullet)
    
    def get_heart_position(self, t):
        """Get x,y offset for heart shape at parameter t (0 to 2*pi)"""
        # Heart parametric equation
        x = 16 * (math.sin(t) ** 3)
        y = 13 * math.cos(t) - 5 * math.cos(2*t) - 2 * math.cos(3*t) - math.cos(4*t)
        return x * self.heart_size / 16, -y * self.heart_size / 16  # Flip y for screen coords
    
    def update(self):
        if not self.active:
            return
        
        # Update all bullets
        for bullet in self.bullets:
            bullet.update()
        # Remove inactive bullets
        self.bullets = [b for b in self.bullets if b.active]
        
        # Animation
        self.animation_frame += 1
        if self.animation_frame >= self.animation_speed:
            self.animation_frame = 0
            if self.current_sprite == lgbt_image_1_original:
                self.current_sprite = lgbt_image_2_original
            else:
                self.current_sprite = lgbt_image_1_original
        
        if self.state == self.STATE_ENTERING:
            # Fly in from side at locked Y height
            if self.from_left:
                # Stay further away when shooting mode
                target_x = SCREEN_WIDTH * 0.03 if self.attack_mode == self.MODE_SHOOT else SCREEN_WIDTH * 0.08
                self.x += self.enter_speed
                if self.x >= target_x:
                    self.x = target_x
                    # Choose next state based on attack mode
                    if self.attack_mode == self.MODE_SHOOT:
                        self.state = self.STATE_SHOOTING
                        self.shots_fired = 0
                        self.shoot_timer = 0
                    else:
                        self.state = self.STATE_WARNING
                    self.state_timer = 0
            else:
                # Stay further away when shooting mode
                target_x = SCREEN_WIDTH * 0.97 if self.attack_mode == self.MODE_SHOOT else SCREEN_WIDTH * 0.92
                self.x -= self.enter_speed
                if self.x <= target_x:
                    self.x = target_x
                    if self.attack_mode == self.MODE_SHOOT:
                        self.state = self.STATE_SHOOTING
                        self.shots_fired = 0
                        self.shoot_timer = 0
                    else:
                        self.state = self.STATE_WARNING
                    self.state_timer = 0
            self.y = self.charge_target_y - self.height // 2
        
        elif self.state == self.STATE_SHOOTING:
            # Hover up and down while shooting
            self.hover_angle += 0.05
            hover_offset = math.sin(self.hover_angle) * 30 * UI_SCALE
            self.y = (SCREEN_HEIGHT // 2) + hover_offset - self.height // 2
            
            # Shoot bullets at interval
            self.shoot_timer += 1
            if self.shoot_timer >= self.shoot_interval and self.shots_fired < self.max_shots:
                self.shoot_bullet()
                self.shots_fired += 1
                self.shoot_timer = 0
            
            # After shooting all bullets, transition to exiting (fly to right to disappear)
            if self.shots_fired >= self.max_shots:
                self.state_timer += 1
                if self.state_timer >= FPS // 2:  # Wait 0.5 second
                    self.deactivate_after_exit = True
                    self.from_left = True  # Ensure exit direction is left -> right
                    self.state = self.STATE_EXITING
                    self.state_timer = 0
                    self.shots_fired = 0
                    self.shoot_timer = 0
                    self.bullets = []
        
        elif self.state == self.STATE_WARNING:
            self.state_timer += 1
            self.warning_flash = (self.state_timer // max(1, int(4 / RED_FLASH_SPEED_MULTIPLIER))) % 2
            self.y = self.charge_target_y - self.height // 2
            
            if self.state_timer >= self.warning_duration:
                self.state = self.STATE_WINDUP
                self.state_timer = 0
                self.windup_start_x = self.x
        
        elif self.state == self.STATE_WINDUP:
            self.state_timer += 1
            # Easing function for dramatic pull back (slow start, fast end)
            progress = self.state_timer / self.windup_duration
            eased_progress = progress * progress  # Quadratic ease-in
            pull_back = self.pull_back_distance * UI_SCALE * eased_progress
            
            # Add shake effect that intensifies as windup progresses
            shake_intensity = 3 * UI_SCALE * progress
            self.windup_shake = random.uniform(-shake_intensity, shake_intensity)
            
            if self.from_left:
                self.x = self.windup_start_x - pull_back
            else:
                self.x = self.windup_start_x + pull_back
            self.y = self.charge_target_y - self.height // 2 + self.windup_shake
            
            if self.state_timer >= self.windup_duration:
                self.state = self.STATE_CHARGING
                self.state_timer = 0
                self.passed_player = False
                self.windup_shake = 0
        
        elif self.state == self.STATE_CHARGING:
            # Charge horizontally in straight line
            if self.from_left:
                self.x += self.charge_speed
                # Exit when off screen on the right
                if self.x > SCREEN_WIDTH + self.width + 50:
                    self.state = self.STATE_EXITING
            else:
                self.x -= self.charge_speed
                # Exit when off screen on the left
                if self.x < -self.width - 50:
                    self.state = self.STATE_EXITING
            
            self.y = self.charge_target_y - self.height // 2
        
        elif self.state == self.STATE_EXITING:
            # Continue flying to the opposite side of screen (slowly)
            if self.from_left:
                # Came from left, exit to right
                self.x += self.exit_speed
                if self.x > SCREEN_WIDTH + self.width + 50:
                    if self.deactivate_after_exit:
                        self.active = False
                        self.state = self.STATE_IDLE
                        self.state_timer = 0
                        self.deactivate_after_exit = False
                        return
                    # Fully exited, prepare next attack from right
                    self.from_left = False
                    # Toggle attack mode for next round only when shoot mode is unlocked
                    if self.shooting_unlocked:
                        if self.attack_mode == self.MODE_SHOOT:
                            self.attack_mode = self.MODE_CHARGE
                        else:
                            self.attack_mode = self.MODE_SHOOT
                    else:
                        self.attack_mode = self.MODE_CHARGE
                    self.shots_fired = 0
                    self.shoot_timer = 0
                    self.charge_target_y = self.target.y + BIRD_HEIGHT // 2
                    self.x = SCREEN_WIDTH + 20
                    self.y = self.charge_target_y - self.height // 2
                    self.state = self.STATE_ENTERING
                    self.state_timer = 0
            else:
                # Came from right, exit to left
                self.x -= self.exit_speed
                if self.x < -self.width - 50:
                    # Fully exited, prepare next attack from left
                    self.from_left = True
                    # Toggle attack mode for next round only when shoot mode is unlocked
                    if self.shooting_unlocked:
                        if self.attack_mode == self.MODE_SHOOT:
                            self.attack_mode = self.MODE_CHARGE
                        else:
                            self.attack_mode = self.MODE_SHOOT
                    else:
                        self.attack_mode = self.MODE_CHARGE
                    self.shots_fired = 0
                    self.shoot_timer = 0
                    self.charge_target_y = self.target.y + BIRD_HEIGHT // 2
                    self.x = -self.width - 20
                    self.y = self.charge_target_y - self.height // 2
                    self.state = self.STATE_ENTERING
                    self.state_timer = 0
        
        # Scale sprite and update mask
        scaled_sprite = pygame.transform.scale(self.current_sprite, (self.width, self.height))
        # Flip sprite horizontally when coming from right (facing left)
        if not self.from_left:
            scaled_sprite = pygame.transform.flip(scaled_sprite, True, False)
        self.image = scaled_sprite
        self.mask = pygame.mask.from_surface(self.image)
    
    def draw(self, screen):
        if not self.active:
            return
        
        # Draw warning line during WARNING, WINDUP, and CHARGING states (for CHARGE mode only)
        if self.state in [self.STATE_WARNING, self.STATE_WINDUP, self.STATE_CHARGING] and self.attack_mode == self.MODE_CHARGE:
            # Always show during WINDUP/CHARGING, flash during WARNING
            should_draw = True
            if self.state == self.STATE_WARNING and not self.warning_flash:
                should_draw = False
            
            if should_draw:
                # Line color based on state (brighter during charging)
                if self.state == self.STATE_CHARGING:
                    line_color = (255, 80, 80)
                    line_width = 5
                elif self.state == self.STATE_WINDUP:
                    # Pulsing effect during windup
                    pulse = int(50 * abs(math.sin(self.state_timer * 0.15 * RED_FLASH_SPEED_MULTIPLIER)))
                    line_color = (255, 50 + pulse, 50 + pulse)
                    line_width = 4
                else:
                    line_color = (255, 50, 50)
                    line_width = 3
                
                # Draw straight line from enemy to opposite side of screen
                dash_length = 25
                target_y = int(self.charge_target_y)
                
                if self.from_left:
                    start_x = int(self.x + self.width)
                    end_x = SCREEN_WIDTH
                    for x in range(start_x, end_x, dash_length * 2):
                        x2 = min(x + dash_length, end_x)
                        pygame.draw.line(screen, line_color, (x, target_y), (x2, target_y), line_width)
                    # Arrow pointing right
                    arrow_x = int(self.x + self.width + 15)
                    pygame.draw.polygon(screen, line_color, [
                        (arrow_x, target_y),
                        (arrow_x - 15, target_y - 10),
                        (arrow_x - 15, target_y + 10)
                    ])
                else:
                    start_x = 0
                    end_x = int(self.x)
                    for x in range(start_x, end_x, dash_length * 2):
                        x2 = min(x + dash_length, end_x)
                        pygame.draw.line(screen, line_color, (x, target_y), (x2, target_y), line_width)
                    # Arrow pointing left
                    arrow_x = int(self.x - 15)
                    pygame.draw.polygon(screen, line_color, [
                        (arrow_x, target_y),
                        (arrow_x + 15, target_y - 10),
                        (arrow_x + 15, target_y + 10)
                    ])
        
        # Draw windup effect - energy gathering particles
        if self.state == self.STATE_WINDUP and self.attack_mode == self.MODE_CHARGE:
            progress = self.state_timer / self.windup_duration
            num_particles = int(8 * progress)
            for i in range(num_particles):
                angle = (self.state_timer * 0.1 + i * math.pi / 4) 
                radius = 25 * UI_SCALE * (1 - progress * 0.5)
                px = self.x + self.width // 2 + math.cos(angle) * radius
                py = self.y + self.height // 2 + math.sin(angle) * radius
                particle_size = int(4 * UI_SCALE * (0.5 + progress * 0.5))
                pygame.draw.circle(screen, (255, 200, 100), (int(px), int(py)), particle_size)
        
        # Draw the fly
        screen.blit(self.image, (int(self.x), int(self.y)))
        
        # Draw all bullets
        for bullet in self.bullets:
            bullet.draw(screen)
    
    def collide(self, bird):
        """Check collision with player bird"""
        if not self.active:
            return False
        
        # Check bullet collisions
        for bullet in self.bullets:
            if bullet.collide(bird):
                return True
        
        # Check collision during charging and exiting
        if self.state not in [self.STATE_CHARGING, self.STATE_EXITING]:
            return False
        
        bird_left, bird_top = bird.get_collision_topleft()
        offset = (int(bird_left - self.x), int(bird_top - self.y))
        
        collision = self.mask.overlap(bird.mask, offset)
        return collision is not None
    
    def reset(self):
        """Reset enemy state"""
        self.active = False
        self.state = self.STATE_IDLE
        self.x = -100
        self.y = SCREEN_HEIGHT // 2
        self.state_timer = 0
        self.from_left = True
        self.deactivate_after_exit = False
        self.bullets = []  # Clear all bullets


class PinkBirdEnemy:
    UNLOCK_SCORE = 5  # Appears starting at score 6
    STATE_IDLE = 0
    STATE_ENTERING = 1
    STATE_WARNING = 2
    STATE_ATTACK = 3

    def __init__(self, target_bird):
        self.target = target_bird
        self.x = -100
        self.y = -100
        self.animation_frame = 0
        self.animation_speed = 8
        self.current_sprite = pinkbird_image_1_original
        self.image = self.current_sprite
        self.mask = pygame.mask.from_surface(self.image)
        self.active = False
        self.width = PINK_ENEMY_WIDTH
        self.height = PINK_ENEMY_HEIGHT
        self.from_left = True
        self.diagonal_speed = 5 * UI_SCALE
        self.direction_x = 1
        self.direction_y = 1
        self.velocity_x = 0
        self.velocity_y = 0
        self.state = self.STATE_IDLE
        self.state_timer = 0
        self.enter_speed = 4 * UI_SCALE
        self.enter_target_x = 0
        self.enter_target_y = 0
        self.warning_duration = 70
        self.warning_flash = 0
        self.warning_start = (0, 0)
        self.warning_end = (0, 0)
        self.spawn_index = 0
        self.spawn_patterns = ["bottom_left", "top_right", "bottom_right"]

    def _setup_spawn(self):
        margin = int(15 * UI_SCALE)
        left_x = margin
        right_x = SCREEN_WIDTH - self.width - margin
        top_y = margin
        bottom_y = min(
            SCREEN_HEIGHT - self.height - int(80 * UI_SCALE),
            int(SCREEN_HEIGHT * 0.72)
        )
        bottom_y = max(top_y + int(40 * UI_SCALE), bottom_y)

        pattern = self.spawn_patterns[self.spawn_index]
        if pattern == "bottom_left":
            hold_x = left_x
            hold_y = bottom_y
            self.x = -self.width - int(20 * UI_SCALE)
            self.y = hold_y
            target_x = SCREEN_WIDTH + self.width
            target_y = -self.height
            self.from_left = True
        elif pattern == "top_right":
            hold_x = right_x
            hold_y = top_y
            self.x = SCREEN_WIDTH + int(20 * UI_SCALE)
            self.y = hold_y
            target_x = -self.width
            target_y = SCREEN_HEIGHT + self.height
            self.from_left = False
        else:  # bottom_right
            hold_x = right_x
            hold_y = bottom_y
            self.x = SCREEN_WIDTH + int(20 * UI_SCALE)
            self.y = hold_y
            target_x = -self.width
            target_y = -self.height
            self.from_left = False

        self.enter_target_x = hold_x
        self.enter_target_y = hold_y

        dx = target_x - hold_x
        dy = target_y - hold_y
        dist = math.sqrt(dx * dx + dy * dy) if (dx * dx + dy * dy) > 0 else 1
        self.velocity_x = (dx / dist) * self.diagonal_speed
        self.velocity_y = (dy / dist) * self.diagonal_speed
        self.direction_x = 1 if self.velocity_x >= 0 else -1
        self.direction_y = 1 if self.velocity_y >= 0 else -1

        start_x = int(hold_x + self.width // 2)
        start_y = int(hold_y + self.height // 2)
        line_len = int(max(SCREEN_WIDTH, SCREEN_HEIGHT) * 1.25)
        end_x = max(0, min(SCREEN_WIDTH, int(start_x + (self.velocity_x / self.diagonal_speed) * line_len)))
        end_y = max(0, min(SCREEN_HEIGHT, int(start_y + (self.velocity_y / self.diagonal_speed) * line_len)))
        self.warning_start = (start_x, start_y)
        self.warning_end = (end_x, end_y)

        self.spawn_index = (self.spawn_index + 1) % len(self.spawn_patterns)

    def activate(self):
        self.active = True
        self.state = self.STATE_ENTERING
        self.state_timer = 0
        self._setup_spawn()

    def update(self):
        if not self.active:
            return

        # Wing animation similar to LGBT fly
        self.animation_frame += 1
        if self.animation_frame >= self.animation_speed:
            self.animation_frame = 0
            if self.current_sprite == pinkbird_image_1_original:
                self.current_sprite = pinkbird_image_2_original
            else:
                self.current_sprite = pinkbird_image_1_original

        if self.state == self.STATE_ENTERING:
            dx = self.enter_target_x - self.x
            dy = self.enter_target_y - self.y
            dist = math.sqrt(dx * dx + dy * dy)
            if dist <= self.enter_speed or dist == 0:
                self.x = self.enter_target_x
                self.y = self.enter_target_y
                self.state = self.STATE_WARNING
                self.state_timer = 0
            else:
                self.x += (dx / dist) * self.enter_speed
                self.y += (dy / dist) * self.enter_speed

        elif self.state == self.STATE_WARNING:
            self.state_timer += 1
            self.warning_flash = (self.state_timer // max(1, int(4 / RED_FLASH_SPEED_MULTIPLIER))) % 2
            if self.state_timer >= self.warning_duration:
                self.state = self.STATE_ATTACK
                self.state_timer = 0

        elif self.state == self.STATE_ATTACK:
            # Fly diagonally in straight line across the screen
            self.x += self.velocity_x
            self.y += self.velocity_y

            # Finish this attack round after leaving view
            if self.y > SCREEN_HEIGHT + self.height or self.y < -self.height or self.x < -self.width or self.x > SCREEN_WIDTH + self.width:
                self.active = False
                self.state = self.STATE_IDLE
                self.state_timer = 0

        scaled_sprite = pygame.transform.scale(self.current_sprite, (self.width, self.height))
        if not self.from_left:
            scaled_sprite = pygame.transform.flip(scaled_sprite, True, False)
        self.image = scaled_sprite
        self.mask = pygame.mask.from_surface(self.image)

    def draw(self, screen):
        if not self.active:
            return

        # Draw warning line like LGBT before attack
        if self.state == self.STATE_WARNING and self.warning_flash:
            line_color = (255, 90, 90)
            line_width = 3
            start_x, start_y = self.warning_start
            end_x, end_y = self.warning_end
            dash_length = int(18 * UI_SCALE)

            dx = end_x - start_x
            dy = end_y - start_y
            dist = math.sqrt(dx * dx + dy * dy)
            if dist > 0:
                ux = dx / dist
                uy = dy / dist
                t = 0
                while t < dist:
                    x1 = int(start_x + ux * t)
                    y1 = int(start_y + uy * t)
                    t2 = min(t + dash_length, dist)
                    x2 = int(start_x + ux * t2)
                    y2 = int(start_y + uy * t2)
                    pygame.draw.line(screen, line_color, (x1, y1), (x2, y2), line_width)
                    t += dash_length * 2

                # Arrow at warning end
                arrow_size = int(10 * UI_SCALE)
                angle = math.atan2(dy, dx)
                tip = (end_x, end_y)
                left = (
                    int(end_x - arrow_size * math.cos(angle - 0.5)),
                    int(end_y - arrow_size * math.sin(angle - 0.5))
                )
                right = (
                    int(end_x - arrow_size * math.cos(angle + 0.5)),
                    int(end_y - arrow_size * math.sin(angle + 0.5))
                )
                pygame.draw.polygon(screen, line_color, [tip, left, right])

        screen.blit(self.image, (int(self.x), int(self.y)))

    def collide(self, bird):
        if not self.active:
            return False
        if self.state != self.STATE_ATTACK:
            return False
        bird_left, bird_top = bird.get_collision_topleft()
        offset = (int(bird_left - self.x), int(bird_top - self.y))
        return self.mask.overlap(bird.mask, offset) is not None

    def reset(self):
        self.active = False
        self.x = -100
        self.y = -100
        self.from_left = True
        self.state = self.STATE_IDLE
        self.state_timer = 0

# Pipe class
class Pipe:
    def __init__(self):
        self.x = SCREEN_WIDTH
        self.height = random.randint(int(SCREEN_HEIGHT * 0.2), int(SCREEN_HEIGHT * 0.6))
        self.scored = False  # Track if this pipe has been scored

    def update(self, current_speed):
        self.x -= current_speed
    
    def get_pipe_width(self):
        return int(PIPE_WIDTH * UI_SCALE)

    def draw(self, screen):
        # Draw top pipe
        # Draw top pipe (flipped)
        screen.blit(pipe_image_top, (self.x, self.height - SCREEN_HEIGHT))
        # Draw bottom pipe - increased gap for easier gameplay
        screen.blit(pipe_image, (self.x, self.height + int(4.5 * BIRD_HEIGHT_PERCENT_TO_SCREEN * SCREEN_HEIGHT)))

    def is_offscreen(self):
        return self.x < -self.get_pipe_width()
    
    def check_score(self, bird):
        """Check if bird has passed the middle of the pipe"""
        pipe_center = self.x + self.get_pipe_width() // 2
        bird_center = bird.x + BIRD_WIDTH // 2
        if not self.scored and bird_center > pipe_center:
            self.scored = True
            return True
        return False

    def collide(self, bird):
        # Top pipe position
        top_pipe_x = self.x
        top_pipe_y = self.height - SCREEN_HEIGHT
        
        # Bottom pipe position - increased gap for easier gameplay
        bottom_pipe_x = self.x
        bottom_pipe_y = self.height + int(4.5 * BIRD_HEIGHT_PERCENT_TO_SCREEN * SCREEN_HEIGHT)
        
        # Calculate offset for pixel-perfect collision using rotated sprite position.
        bird_left, bird_top = bird.get_collision_topleft()
        top_offset = (int(bird_left - top_pipe_x), int(bird_top - top_pipe_y))
        bottom_offset = (int(bird_left - bottom_pipe_x), int(bird_top - bottom_pipe_y))
        
        # Check pixel-perfect collision with masks (use bird's current rotated mask)
        top_collision = pipe_mask_top.overlap(bird.mask, top_offset)
        bottom_collision = pipe_mask.overlap(bird.mask, bottom_offset)
        
        return top_collision is not None or bottom_collision is not None

class BossBattle:
    STATE_INACTIVE = 0
    STATE_SCREEN_WARNING = 1
    STATE_ENTERING = 2
    STATE_BOMB_WARNING = 3
    STATE_BOMB_DROP = 4
    STATE_LASER_WARNING = 5
    STATE_LASER_FIRE = 6
    STATE_EXITING = 7
    STATE_DONE = 8
    STATE_COMBO_ASSAULT = 9
    STATE_POST_ATTACK_DELAY = 10
    STATE_LOW_BATTERY = 11
    STATE_DYING = 12
    STATE_DEATH_EXPLOSION = 13

    def __init__(self, target_bird):
        self.target = target_bird
        self.state = self.STATE_INACTIVE
        self.timer = 0
        self.animation_frame = 0
        self.animation_speed = 10
        self.current_sprite = boss_image_1_original
        self.image = self.current_sprite
        self.sync_scaled_assets()

    def sync_scaled_assets(self):
        self.width = BOSS_WIDTH
        self.height = BOSS_HEIGHT
        self.bomb_width = BOMB_WIDTH
        self.bomb_height = BOMB_HEIGHT
        self.bomb_content_rect = BOMB_CONTENT_RECT.copy()
        self.laser_height = LASER_BEAM_HEIGHT
        self.laser_content_ratio = LASER_CONTENT_RATIO
        self.enter_speed = 2.2 * UI_SCALE
        self.exit_speed = 3.0 * UI_SCALE
        self.bomb_fall_speed = 7.5 * UI_SCALE
        self.explosion_stage_frames = max(1, int(FPS * 0.08))
        self.laser_fire_duration = max(1, int(FPS * 0.65))
        self.death_fall_gravity = 0.5 * UI_SCALE
        self.target_stop_x = SCREEN_WIDTH - self.width - int(24 * UI_SCALE)
        self.y = int(SCREEN_HEIGHT * 0.12)
        if self.state in [self.STATE_ENTERING, self.STATE_BOMB_WARNING, self.STATE_BOMB_DROP, self.STATE_LASER_WARNING, self.STATE_LASER_FIRE, self.STATE_COMBO_ASSAULT, self.STATE_POST_ATTACK_DELAY, self.STATE_LOW_BATTERY, self.STATE_DYING, self.STATE_DEATH_EXPLOSION, self.STATE_EXITING]:
            self.x = max(self.target_stop_x, min(self.x, SCREEN_WIDTH + self.width + int(30 * UI_SCALE))) if hasattr(self, 'x') else SCREEN_WIDTH + self.width
        else:
            self.x = SCREEN_WIDTH + self.width

    def activate(self):
        self.state = self.STATE_SCREEN_WARNING
        self.timer = 0
        self.bombs_spawned = 0
        self.bombs_dropped = 0
        self.bombs_warning_started = 0
        self.active_bombs = []
        self.pending_bomb_warnings = []
        self.chain_spawn_timer = 0
        self.lasers_spawned = 0
        self.lasers_fired = 0
        self.lasers_warning_started = 0
        self.active_lasers = []
        self.pending_laser_warnings = []
        self.laser_chain_spawn_timer = 0
        self.marker_x = SCREEN_WIDTH // 2
        self.marker_y = SCREEN_HEIGHT // 2
        self.current_bomb = None
        self.current_laser = None
        self.pending_laser = None
        self.locked_laser_target = None
        self.low_battery_timer = 0
        self.death_velocity = 0
        self.death_rotation = 0
        self.death_explosion = None
        self.x = SCREEN_WIDTH + self.width + int(30 * UI_SCALE)

    def _bird_rect(self):
        bird_left, bird_top = self.target.get_collision_topleft()
        return pygame.Rect(int(bird_left), int(bird_top), BIRD_WIDTH, BIRD_HEIGHT)

    def _mask_collides_with_bird(self, source_mask, source_x, source_y):
        bird_left, bird_top = self.target.get_collision_topleft()
        offset = (int(bird_left - source_x), int(bird_top - source_y))
        return source_mask.overlap(self.target.mask, offset) is not None

    def _boss_body_collides_with_bird(self):
        boss_surface = pygame.transform.flip(self.image, True, False)
        boss_mask = pygame.mask.from_surface(boss_surface)
        bird_left, bird_top = self.target.get_collision_topleft()
        offset = (int(bird_left - self.x), int(bird_top - self.y))
        return boss_mask.overlap(self.target.mask, offset) is not None

    def _pick_bomb_marker(self):
        bird_rect = self._bird_rect()
        center_x = bird_rect.centerx
        content_center_offset = self.bomb_content_rect.x + (self.bomb_content_rect.width / 2.0)
        # Keep bomb content centered on the bug even when the bug is at the screen edge.
        self.marker_x = int(center_x - (content_center_offset - (self.bomb_width / 2.0)))

    def _pick_laser_marker(self):
        center_y = self.target.y + BIRD_HEIGHT // 2 + random.randint(-int(SCREEN_HEIGHT * 0.07), int(SCREEN_HEIGHT * 0.07))
        margin = self.laser_height // 2 + int(20 * UI_SCALE)
        self.marker_y = max(margin, min(SCREEN_HEIGHT - margin, int(center_y)))

    def _build_laser_from_target(self, target_point):
        if target_point is None:
            return None

        origin_x = int(self.x + self.width * 0.2)
        origin_y = int(self.y + self.height * 0.55)
        target_x, target_y = target_point

        dx = target_x - origin_x
        dy = target_y - origin_y
        base_distance = math.hypot(dx, dy)
        if base_distance <= 1e-6:
            ux, uy = -1.0, 0.0
        else:
            ux = dx / base_distance
            uy = dy / base_distance

        # Extend beam to exit the screen and continue 10px beyond bounds.
        xmin, xmax = -10.0, float(SCREEN_WIDTH + 10)
        ymin, ymax = -10.0, float(SCREEN_HEIGHT + 10)

        if abs(ux) < 1e-6:
            tx_min, tx_max = -float('inf'), float('inf')
        else:
            tx1 = (xmin - origin_x) / ux
            tx2 = (xmax - origin_x) / ux
            tx_min, tx_max = min(tx1, tx2), max(tx1, tx2)

        if abs(uy) < 1e-6:
            ty_min, ty_max = -float('inf'), float('inf')
        else:
            ty1 = (ymin - origin_y) / uy
            ty2 = (ymax - origin_y) / uy
            ty_min, ty_max = min(ty1, ty2), max(ty1, ty2)

        t_exit = min(tx_max, ty_max)
        if t_exit <= 1.0:
            t_exit = max(1.0, base_distance)

        end_x = origin_x + ux * t_exit
        end_y = origin_y + uy * t_exit
        distance = max(1, int(math.hypot(end_x - origin_x, end_y - origin_y)))
        angle_deg = math.degrees(math.atan2(uy, ux))

        beam_base = pygame.transform.scale(laser_beam_image_original, (distance, self.laser_height))
        beam_rotated = pygame.transform.rotate(beam_base, -angle_deg)
        beam_rect = beam_rotated.get_rect(center=(int(origin_x + (end_x - origin_x) * 0.5), int(origin_y + (end_y - origin_y) * 0.5)))
        beam_mask = pygame.mask.from_surface(beam_rotated)

        return {
            'rect': beam_rect,
            'surface': beam_rotated,
            'mask': beam_mask,
            'origin': (int(origin_x), int(origin_y)),
            'end': (int(end_x), int(end_y)),
        }

    def _build_laser_from_locked_target(self):
        return self._build_laser_from_target(self.locked_laser_target)

    def _start_bomb_warning(self):
        self._pick_bomb_marker()
        self.bombs_warning_started += 1
        self.timer = 0
        self.state = self.STATE_BOMB_WARNING

    def _enqueue_chain_bomb_warning(self):
        self._pick_bomb_marker()
        self.pending_bomb_warnings.append({'marker_x': int(self.marker_x), 'timer': 0})
        self.bombs_warning_started += 1

    def _create_bomb(self, marker_x=None):
        spawn_x = self.marker_x if marker_x is None else int(marker_x)
        return {
            'x': spawn_x - self.bomb_width // 2,
            'y': -self.bomb_height,
            'rect': pygame.Rect(spawn_x - self.bomb_width // 2, -self.bomb_height, self.bomb_width, self.bomb_height),
            'mask': bomb_mask,
            'sprite': bomb_image_original,
            'is_exploding': False,
            'explosion_stage': 0,
            'explosion_timer': 0,
        }

    def _start_laser_warning(self):
        bird_left, bird_top = self.target.get_collision_topleft()
        self.locked_laser_target = (
            int(bird_left + BIRD_WIDTH // 2),
            int(bird_top + BIRD_HEIGHT // 2),
        )
        self.pending_laser = self._build_laser_from_locked_target()
        if self.pending_laser is not None:
            self.lasers_warning_started += 1
        self.current_laser = None
        self.timer = 0
        self.state = self.STATE_LASER_WARNING

    def _start_combo_assault(self):
        self.timer = 0
        self.bombs_spawned = 0
        self.bombs_dropped = 0
        self.bombs_warning_started = 0
        self.active_bombs = []
        self.pending_bomb_warnings = []
        self.chain_spawn_timer = 0

        self.lasers_spawned = 0
        self.lasers_fired = 0
        self.lasers_warning_started = 0
        self.active_lasers = []
        self.pending_laser_warnings = []
        self.laser_chain_spawn_timer = 0
        self.current_laser = None
        self.pending_laser = None

        # Start both warning streams in parallel, then chain every 0.3s.
        self._enqueue_chain_bomb_warning()
        self._enqueue_laser_warning()
        self.state = self.STATE_COMBO_ASSAULT

    def _start_shutdown_sequence(self):
        self.timer = 0
        self.low_battery_timer = 0
        self.death_velocity = 0
        self.death_rotation = 0
        self.death_explosion = None
        self.state = self.STATE_POST_ATTACK_DELAY

    def _enqueue_laser_warning(self):
        bird_left, bird_top = self.target.get_collision_topleft()
        target_point = (int(bird_left + BIRD_WIDTH // 2), int(bird_top + BIRD_HEIGHT // 2))
        queued_laser = self._build_laser_from_target(target_point)
        if queued_laser is None:
            return
        self.pending_laser_warnings.append({'frame': queued_laser, 'timer': 0})
        self.lasers_warning_started += 1

    def _get_active_laser_frame(self):
        if self.current_laser is None:
            return None
        return self.current_laser

    def update(self, ignore_damage=False):
        if self.state == self.STATE_INACTIVE:
            return False, False

        # Boss wing flapping animation for active combat states.
        if self.state not in [self.STATE_DYING, self.STATE_DEATH_EXPLOSION, self.STATE_DONE, self.STATE_INACTIVE]:
            self.animation_frame += 1
            if self.animation_frame >= self.animation_speed:
                self.animation_frame = 0
                if self.current_sprite == boss_image_1_original:
                    self.current_sprite = boss_image_2_original
                else:
                    self.current_sprite = boss_image_1_original
        self.image = self.current_sprite

        if self.state == self.STATE_SCREEN_WARNING:
            self.timer += 1
            if self.timer >= BOSS_WARNING_DURATION_FRAMES:
                self.timer = 0
                self.state = self.STATE_ENTERING

        elif self.state == self.STATE_ENTERING:
            self.x -= self.enter_speed
            if self.x <= self.target_stop_x:
                self.x = self.target_stop_x
                self._start_bomb_warning()

        elif self.state == self.STATE_BOMB_WARNING:
            self.timer += 1
            if self.timer >= BOSS_ATTACK_WARNING_FRAMES:
                self.active_bombs.append(self._create_bomb())
                self.bombs_spawned += 1

                # Start chained warnings right after the second bomb is spawned.
                if self.bombs_spawned >= 2 and self.bombs_warning_started < BOSS_BOMB_TOTAL:
                    self._enqueue_chain_bomb_warning()
                    self.chain_spawn_timer = 0
                self.state = self.STATE_BOMB_DROP

        elif self.state == self.STATE_BOMB_DROP:
            if self.bombs_warning_started >= 3 and self.bombs_warning_started < BOSS_BOMB_TOTAL:
                self.chain_spawn_timer += 1
                if self.chain_spawn_timer >= BOSS_BOMB_CHAIN_INTERVAL_FRAMES:
                    self.chain_spawn_timer = 0
                    self._enqueue_chain_bomb_warning()

            for warning in self.pending_bomb_warnings[:]:
                warning['timer'] += 1
                if warning['timer'] >= BOSS_ATTACK_WARNING_FRAMES:
                    self.active_bombs.append(self._create_bomb(warning['marker_x']))
                    self.bombs_spawned += 1
                    self.pending_bomb_warnings.remove(warning)

            for bomb in self.active_bombs[:]:
                if not bomb['is_exploding']:
                    bomb['y'] += self.bomb_fall_speed
                    bomb['rect'].y = int(bomb['y'])
                    if self._mask_collides_with_bird(bomb['mask'], bomb['rect'].x, bomb['rect'].y):
                        bomb_center = bomb['rect'].center
                        bomb['is_exploding'] = True
                        bomb['explosion_hits_player'] = True
                        bomb['explosion_stage'] = 0
                        bomb['explosion_timer'] = 0
                        bomb['sprite'] = explosion_image_1_original
                        bomb['mask'] = pygame.mask.from_surface(explosion_image_1_original)
                        bomb['rect'] = explosion_image_1_original.get_rect(center=bomb_center)
                        bomb['x'] = bomb['rect'].x
                        bomb['y'] = bomb['rect'].y
                    else:
                        ground_y = SCREEN_HEIGHT - int(SCREEN_HEIGHT * 0.1)
                        content_bottom = bomb['rect'].y + self.bomb_content_rect.y + self.bomb_content_rect.height
                        if content_bottom >= ground_y + 30:
                            bomb_center = bomb['rect'].center
                            bomb['is_exploding'] = True
                            bomb['explosion_hits_player'] = False
                            bomb['explosion_stage'] = 0
                            bomb['explosion_timer'] = 0
                            bomb['sprite'] = explosion_image_1_original
                            bomb['mask'] = pygame.mask.from_surface(explosion_image_1_original)
                            bomb['rect'] = explosion_image_1_original.get_rect(center=bomb_center)
                            bomb['x'] = bomb['rect'].x
                            bomb['y'] = bomb['rect'].y
                else:
                    bomb['explosion_timer'] += 1
                    if bomb['explosion_stage'] == 0 and bomb['explosion_timer'] >= self.explosion_stage_frames:
                        bomb_center = bomb['rect'].center
                        bomb['explosion_stage'] = 1
                        bomb['explosion_timer'] = 0
                        bomb['sprite'] = explosion_image_2_original
                        bomb['mask'] = pygame.mask.from_surface(explosion_image_2_original)
                        bomb['rect'] = explosion_image_2_original.get_rect(center=bomb_center)
                        bomb['x'] = bomb['rect'].x
                        bomb['y'] = bomb['rect'].y
                    elif bomb['explosion_stage'] == 1 and bomb['explosion_timer'] >= self.explosion_stage_frames:
                        should_damage = bomb.get('explosion_hits_player', False)
                        self.bombs_dropped += 1
                        self.active_bombs.remove(bomb)

                        if should_damage and not ignore_damage:
                            return True, False

            if self.bombs_dropped >= BOSS_BOMB_TOTAL and not self.active_bombs and not self.pending_bomb_warnings:
                self._start_laser_warning()
            elif self.bombs_warning_started < 2 and not self.active_bombs and not self.pending_bomb_warnings:
                self._start_bomb_warning()

        elif self.state == self.STATE_LASER_WARNING:
            self.timer += 1
            if self.timer >= BOSS_ATTACK_WARNING_FRAMES:
                self.current_laser = self.pending_laser if self.pending_laser is not None else self._build_laser_from_locked_target()
                if self.current_laser is not None:
                    self.current_laser['fire_timer'] = 0
                    self.active_lasers.append(self.current_laser)
                    self.lasers_spawned += 1
                self.pending_laser = None
                self.timer = 0
                self.state = self.STATE_LASER_FIRE

        elif self.state == self.STATE_LASER_FIRE:
            if self.lasers_warning_started >= 3 and self.lasers_warning_started < BOSS_LASER_TOTAL:
                self.laser_chain_spawn_timer += 1
                if self.laser_chain_spawn_timer >= BOSS_LASER_CHAIN_INTERVAL_FRAMES:
                    self.laser_chain_spawn_timer = 0
                    self._enqueue_laser_warning()

            for warning in self.pending_laser_warnings[:]:
                warning['timer'] += 1
                if warning['timer'] >= BOSS_ATTACK_WARNING_FRAMES:
                    next_laser = warning['frame']
                    next_laser['fire_timer'] = 0
                    self.active_lasers.append(next_laser)
                    self.lasers_spawned += 1
                    self.pending_laser_warnings.remove(warning)

            for active_laser in self.active_lasers[:]:
                if self._mask_collides_with_bird(active_laser['mask'], active_laser['rect'].x, active_laser['rect'].y):
                    if not ignore_damage:
                        return True, False
                active_laser['fire_timer'] += 1
                if active_laser['fire_timer'] >= self.laser_fire_duration:
                    self.active_lasers.remove(active_laser)
                    self.lasers_fired += 1

            self.current_laser = self.active_lasers[0] if self.active_lasers else None

            if self.lasers_warning_started < 2 and self.lasers_spawned < 2 and not self.active_lasers and not self.pending_laser_warnings:
                self._start_laser_warning()
            elif self.lasers_warning_started < 3 and self.lasers_fired >= 2 and not self.active_lasers and not self.pending_laser_warnings:
                self._enqueue_laser_warning()
                self.laser_chain_spawn_timer = 0

            if self.lasers_fired >= BOSS_LASER_TOTAL and not self.active_lasers and not self.pending_laser_warnings:
                self._start_combo_assault()

        elif self.state == self.STATE_COMBO_ASSAULT:
            if self.bombs_warning_started < BOSS_BOMB_TOTAL:
                self.chain_spawn_timer += 1
                if self.chain_spawn_timer >= BOSS_BOMB_CHAIN_INTERVAL_FRAMES:
                    self.chain_spawn_timer = 0
                    self._enqueue_chain_bomb_warning()

            if self.lasers_warning_started < BOSS_LASER_TOTAL:
                self.laser_chain_spawn_timer += 1
                if self.laser_chain_spawn_timer >= BOSS_LASER_CHAIN_INTERVAL_FRAMES:
                    self.laser_chain_spawn_timer = 0
                    self._enqueue_laser_warning()

            for warning in self.pending_bomb_warnings[:]:
                warning['timer'] += 1
                if warning['timer'] >= BOSS_ATTACK_WARNING_FRAMES:
                    self.active_bombs.append(self._create_bomb(warning['marker_x']))
                    self.bombs_spawned += 1
                    self.pending_bomb_warnings.remove(warning)

            for warning in self.pending_laser_warnings[:]:
                warning['timer'] += 1
                if warning['timer'] >= BOSS_ATTACK_WARNING_FRAMES:
                    next_laser = warning['frame']
                    next_laser['fire_timer'] = 0
                    self.active_lasers.append(next_laser)
                    self.lasers_spawned += 1
                    self.pending_laser_warnings.remove(warning)

            for bomb in self.active_bombs[:]:
                if not bomb['is_exploding']:
                    bomb['y'] += self.bomb_fall_speed
                    bomb['rect'].y = int(bomb['y'])
                    if self._mask_collides_with_bird(bomb['mask'], bomb['rect'].x, bomb['rect'].y):
                        bomb_center = bomb['rect'].center
                        bomb['is_exploding'] = True
                        bomb['explosion_hits_player'] = True
                        bomb['explosion_stage'] = 0
                        bomb['explosion_timer'] = 0
                        bomb['sprite'] = explosion_image_1_original
                        bomb['mask'] = pygame.mask.from_surface(explosion_image_1_original)
                        bomb['rect'] = explosion_image_1_original.get_rect(center=bomb_center)
                        bomb['x'] = bomb['rect'].x
                        bomb['y'] = bomb['rect'].y
                    else:
                        ground_y = SCREEN_HEIGHT - int(SCREEN_HEIGHT * 0.1)
                        content_bottom = bomb['rect'].y + self.bomb_content_rect.y + self.bomb_content_rect.height
                        if content_bottom >= ground_y + 30:
                            bomb_center = bomb['rect'].center
                            bomb['is_exploding'] = True
                            bomb['explosion_hits_player'] = False
                            bomb['explosion_stage'] = 0
                            bomb['explosion_timer'] = 0
                            bomb['sprite'] = explosion_image_1_original
                            bomb['mask'] = pygame.mask.from_surface(explosion_image_1_original)
                            bomb['rect'] = explosion_image_1_original.get_rect(center=bomb_center)
                            bomb['x'] = bomb['rect'].x
                            bomb['y'] = bomb['rect'].y
                else:
                    bomb['explosion_timer'] += 1
                    if bomb['explosion_stage'] == 0 and bomb['explosion_timer'] >= self.explosion_stage_frames:
                        bomb_center = bomb['rect'].center
                        bomb['explosion_stage'] = 1
                        bomb['explosion_timer'] = 0
                        bomb['sprite'] = explosion_image_2_original
                        bomb['mask'] = pygame.mask.from_surface(explosion_image_2_original)
                        bomb['rect'] = explosion_image_2_original.get_rect(center=bomb_center)
                        bomb['x'] = bomb['rect'].x
                        bomb['y'] = bomb['rect'].y
                    elif bomb['explosion_stage'] == 1 and bomb['explosion_timer'] >= self.explosion_stage_frames:
                        should_damage = bomb.get('explosion_hits_player', False)
                        self.bombs_dropped += 1
                        self.active_bombs.remove(bomb)

                        if should_damage and not ignore_damage:
                            return True, False

            for active_laser in self.active_lasers[:]:
                if self._mask_collides_with_bird(active_laser['mask'], active_laser['rect'].x, active_laser['rect'].y):
                    if not ignore_damage:
                        return True, False
                active_laser['fire_timer'] += 1
                if active_laser['fire_timer'] >= self.laser_fire_duration:
                    self.active_lasers.remove(active_laser)
                    self.lasers_fired += 1

            self.current_laser = self.active_lasers[0] if self.active_lasers else None

            if (
                self.bombs_dropped >= BOSS_BOMB_TOTAL
                and self.lasers_fired >= BOSS_LASER_TOTAL
                and not self.active_bombs
                and not self.pending_bomb_warnings
                and not self.active_lasers
                and not self.pending_laser_warnings
            ):
                self._start_shutdown_sequence()

        elif self.state == self.STATE_POST_ATTACK_DELAY:
            self.timer += 1
            if self.timer >= BOSS_POST_ATTACK_DELAY_FRAMES:
                self.low_battery_timer = 0
                self.state = self.STATE_LOW_BATTERY

        elif self.state == self.STATE_LOW_BATTERY:
            self.low_battery_timer += 1
            if self.low_battery_timer >= (BOSS_LOW_BATTERY_BLINK_PERIOD * 6):
                self.death_velocity = 0
                self.death_rotation = 0
                self.state = self.STATE_DYING

        elif self.state == self.STATE_DYING:
            self.death_velocity += self.death_fall_gravity
            self.y += self.death_velocity
            if self.death_rotation > -90:
                self.death_rotation -= 3
            self.image = pygame.transform.rotate(self.current_sprite, self.death_rotation)

            ground_y = SCREEN_HEIGHT - int(SCREEN_HEIGHT * 0.1)
            boss_content_rect = self.image.get_bounding_rect()
            if boss_content_rect.width <= 0 or boss_content_rect.height <= 0:
                boss_content_rect = self.image.get_rect()
            content_bottom = self.y + boss_content_rect.y + boss_content_rect.height
            target_touch_bottom = ground_y + 30

            if content_bottom >= target_touch_bottom:
                # Snap by visible content (not image border) so boss visually touches ground correctly.
                self.y -= (content_bottom - target_touch_bottom)
                death_center = (int(self.x + self.image.get_width() // 2), int(self.y + self.image.get_height() // 2))
                self.death_explosion = {
                    'stage': 0,
                    'timer': 0,
                    'sprite': explosion_image_1_original,
                    'rect': explosion_image_1_original.get_rect(center=death_center),
                }
                self.state = self.STATE_DEATH_EXPLOSION

        elif self.state == self.STATE_DEATH_EXPLOSION:
            if self.death_explosion is not None:
                self.death_explosion['timer'] += 1
                if self.death_explosion['stage'] == 0 and self.death_explosion['timer'] >= self.explosion_stage_frames:
                    explosion_center = self.death_explosion['rect'].center
                    self.death_explosion['stage'] = 1
                    self.death_explosion['timer'] = 0
                    self.death_explosion['sprite'] = explosion_image_2_original
                    self.death_explosion['rect'] = explosion_image_2_original.get_rect(center=explosion_center)
                elif self.death_explosion['stage'] == 1 and self.death_explosion['timer'] >= self.explosion_stage_frames:
                    self.state = self.STATE_DONE
                    return False, True

        elif self.state == self.STATE_EXITING:
            self.x += self.exit_speed
            if self.x > SCREEN_WIDTH + self.width + int(40 * UI_SCALE):
                self.state = self.STATE_DONE
                return False, True

        if self.state in [self.STATE_ENTERING, self.STATE_BOMB_WARNING, self.STATE_BOMB_DROP, self.STATE_LASER_WARNING, self.STATE_LASER_FIRE, self.STATE_COMBO_ASSAULT]:
            if self._boss_body_collides_with_bird():
                return True, False

        return False, False

    def draw_screen_warning(self, surface):
        if self.state != self.STATE_SCREEN_WARNING:
            return

        progress = min(1.0, self.timer / max(1, BOSS_WARNING_DURATION_FRAMES))
        pulse_phase = progress * 3.0 * RED_FLASH_SPEED_MULTIPLIER
        pulse = 0.5 * (1.0 + math.sin((pulse_phase * 2.0 * math.pi) - (math.pi / 2.0)))
        alpha = int(65 + progress * 70 + pulse * 85)
        alpha = max(0, min(220, alpha))

        overlay = pygame.Surface((SCREEN_WIDTH, SCREEN_HEIGHT), pygame.SRCALPHA)
        overlay.fill((220, 30, 30, alpha))
        surface.blit(overlay, (0, 0))

        # Warning panel with icon and text.
        panel_w = int(520 * UI_SCALE)
        panel_h = int(280 * UI_SCALE)
        panel_x = SCREEN_WIDTH // 2 - panel_w // 2
        panel_y = SCREEN_HEIGHT // 2 - panel_h // 2
        panel = pygame.Surface((panel_w, panel_h), pygame.SRCALPHA)
        radius = int(18 * UI_SCALE)
        pygame.draw.rect(panel, (30, 0, 0, 180), panel.get_rect(), border_radius=radius)
        pygame.draw.rect(panel, (255, 70, 70), panel.get_rect(), max(2, int(5 * UI_SCALE)), border_radius=radius)
        surface.blit(panel, (panel_x, panel_y))

        icon_x = panel_x + panel_w // 2 - warning_sign_image.get_width() // 2
        icon_y = panel_y + int(16 * UI_SCALE)
        surface.blit(warning_sign_image, (icon_x, icon_y))

        font_warning = pygame.font.Font(None, int(78 * UI_SCALE))
        font_sub = pygame.font.Font(None, int(42 * UI_SCALE))
        warning_text = "WARNING"
        warning_surface = font_warning.render(warning_text, True, RED)
        warning_x = panel_x + panel_w // 2 - warning_surface.get_width() // 2
        warning_y = panel_y + int(170 * UI_SCALE)
        draw_text_with_border(surface, warning_text, font_warning, RED, warning_x, warning_y)

        sub_text = "Boss is coming..."
        sub_surface = font_sub.render(sub_text, True, WHITE)
        sub_x = panel_x + panel_w // 2 - sub_surface.get_width() // 2
        sub_y = panel_y + int(228 * UI_SCALE)
        draw_text_with_border(surface, sub_text, font_sub, WHITE, sub_x, sub_y)

    def draw(self, surface):
        if self.state in [self.STATE_INACTIVE, self.STATE_SCREEN_WARNING, self.STATE_DONE]:
            return

        # Draw warning columns/rows before each attack.
        if self.state == self.STATE_BOMB_WARNING:
            progress = min(1.0, self.timer / max(1, BOSS_ATTACK_WARNING_FRAMES))
            pulse_phase = progress * 3.0 * RED_FLASH_SPEED_MULTIPLIER
            pulse = 0.5 * (1.0 + math.sin((pulse_phase * 2.0 * math.pi) - (math.pi / 2.0)))
            alpha = int(65 + progress * 70 + pulse * 85)
            col_x = int(self.marker_x - self.bomb_width // 2 + self.bomb_content_rect.x)
            col_w = max(1, int(self.bomb_content_rect.width))
            col_rect = pygame.Rect(col_x, 0, col_w, SCREEN_HEIGHT)
            warning_col = pygame.Surface((col_rect.width, col_rect.height), pygame.SRCALPHA)
            warning_col.fill((255, 40, 40, alpha))
            surface.blit(warning_col, col_rect.topleft)

        if self.state in [self.STATE_BOMB_DROP, self.STATE_COMBO_ASSAULT]:
            for warning in self.pending_bomb_warnings:
                progress = min(1.0, warning['timer'] / max(1, BOSS_ATTACK_WARNING_FRAMES))
                pulse_phase = progress * 3.0 * RED_FLASH_SPEED_MULTIPLIER
                pulse = 0.5 * (1.0 + math.sin((pulse_phase * 2.0 * math.pi) - (math.pi / 2.0)))
                alpha = int(65 + progress * 70 + pulse * 85)
                col_x = int(warning['marker_x'] - self.bomb_width // 2 + self.bomb_content_rect.x)
                col_w = max(1, int(self.bomb_content_rect.width))
                col_rect = pygame.Rect(col_x, 0, col_w, SCREEN_HEIGHT)
                warning_col = pygame.Surface((col_rect.width, col_rect.height), pygame.SRCALPHA)
                warning_col.fill((255, 40, 40, alpha))
                surface.blit(warning_col, col_rect.topleft)

        if self.state == self.STATE_LASER_WARNING:
            progress = min(1.0, self.timer / max(1, BOSS_ATTACK_WARNING_FRAMES))
            pulse_phase = progress * 3.0 * RED_FLASH_SPEED_MULTIPLIER
            pulse = 0.5 * (1.0 + math.sin((pulse_phase * 2.0 * math.pi) - (math.pi / 2.0)))
            alpha = int(65 + progress * 70 + pulse * 85)
            if self.pending_laser is not None:
                start_x, start_y = self.pending_laser['origin']
                end_x, end_y = self.pending_laser['end']
                dx = end_x - start_x
                dy = end_y - start_y
                dist = math.hypot(dx, dy)
                if dist > 0:
                    warning_extension = 10
                    dir_x = dx / dist
                    dir_y = dy / dist
                    extended_start_x = start_x - dir_x * warning_extension
                    extended_start_y = start_y - dir_y * warning_extension
                    extended_dist = dist + warning_extension
                    warning_thickness = max(1, int(self.laser_height * self.laser_content_ratio * 0.5))
                    warning_rect = pygame.Surface((int(extended_dist), warning_thickness), pygame.SRCALPHA)
                    warning_rect.fill((255, 50, 50, alpha))
                    angle_deg = math.degrees(math.atan2(dy, dx))
                    warning_rotated = pygame.transform.rotate(warning_rect, -angle_deg)
                    warning_draw_rect = warning_rotated.get_rect(center=(int((extended_start_x + end_x) * 0.5), int((extended_start_y + end_y) * 0.5)))
                    surface.blit(warning_rotated, warning_draw_rect.topleft)

        if self.state in [self.STATE_LASER_FIRE, self.STATE_COMBO_ASSAULT]:
            for warning in self.pending_laser_warnings:
                progress = min(1.0, warning['timer'] / max(1, BOSS_ATTACK_WARNING_FRAMES))
                pulse_phase = progress * 3.0 * RED_FLASH_SPEED_MULTIPLIER
                pulse = 0.5 * (1.0 + math.sin((pulse_phase * 2.0 * math.pi) - (math.pi / 2.0)))
                alpha = int(65 + progress * 70 + pulse * 85)
                start_x, start_y = warning['frame']['origin']
                end_x, end_y = warning['frame']['end']
                dx = end_x - start_x
                dy = end_y - start_y
                dist = math.hypot(dx, dy)
                if dist > 0:
                    warning_extension = 10
                    dir_x = dx / dist
                    dir_y = dy / dist
                    extended_start_x = start_x - dir_x * warning_extension
                    extended_start_y = start_y - dir_y * warning_extension
                    extended_dist = dist + warning_extension
                    warning_thickness = max(1, int(self.laser_height * self.laser_content_ratio * 0.5))
                    warning_rect = pygame.Surface((int(extended_dist), warning_thickness), pygame.SRCALPHA)
                    warning_rect.fill((255, 50, 50, alpha))
                    angle_deg = math.degrees(math.atan2(dy, dx))
                    warning_rotated = pygame.transform.rotate(warning_rect, -angle_deg)
                    warning_draw_rect = warning_rotated.get_rect(center=(int((extended_start_x + end_x) * 0.5), int((extended_start_y + end_y) * 0.5)))
                    surface.blit(warning_rotated, warning_draw_rect.topleft)

        # Draw active bomb.
        for bomb in self.active_bombs:
            surface.blit(bomb['sprite'], (int(bomb['x']), int(bomb['y'])))

        # Draw active laser.
        if self.state in [self.STATE_LASER_FIRE, self.STATE_COMBO_ASSAULT]:
            for active_laser in self.active_lasers:
                surface.blit(active_laser['surface'], active_laser['rect'].topleft)

        if self.state != self.STATE_DEATH_EXPLOSION:
            surface.blit(pygame.transform.flip(self.image, True, False), (int(self.x), int(self.y)))

        if self.state == self.STATE_LOW_BATTERY:
            blink_phase = (self.low_battery_timer // max(1, BOSS_LOW_BATTERY_BLINK_PERIOD)) % 2
            if blink_phase == 0:
                icon_x = int(self.x + self.image.get_width() // 2 - low_battery_image_original.get_width() // 2)
                icon_y = int(self.y + self.image.get_height() // 2 - low_battery_image_original.get_height() // 2)
                surface.blit(low_battery_image_original, (icon_x, icon_y))

        if self.state == self.STATE_DEATH_EXPLOSION and self.death_explosion is not None:
            surface.blit(self.death_explosion['sprite'], self.death_explosion['rect'].topleft)


# Game Manager class
class GameManager:
    ENEMY_CHARGE_SPAWN_SCORE = 3  # Enemy appears only when score > 2

    def __init__(self):
        self.bird = Bird()
        self.pipes = []
        self.score = 0
        self.is_game_over = False
        self.is_victory = False
        self.is_falling = False
        self.fall_velocity = 0
        self.fall_rotation = 0
        self.enemy = EnemyFly(self.bird)
        self.pink_enemy = PinkBirdEnemy(self.bird)
        self.base_x = 0
        self.boss = BossBattle(self.bird)
        self.is_boss_phase = False
        self.is_boss_transition = False
        self.boss_transition_timer = 0

    def reset(self):
        self.bird = Bird()
        self.pipes = []
        self.score = 0
        self.is_game_over = False
        self.is_victory = False
        self.is_falling = False
        self.fall_velocity = 0
        self.fall_rotation = 0
        self.enemy = EnemyFly(self.bird)
        self.pink_enemy = PinkBirdEnemy(self.bird)
        self.base_x = 0
        self.boss = BossBattle(self.bird)
        self.is_boss_phase = False
        self.is_boss_transition = False
        self.boss_transition_timer = 0

    def start_falling(self):
        self.is_falling = True
        self.fall_velocity = 0
        self.fall_rotation = self.bird.rotation

    def get_current_speed(self):
        speed = (PIPE_SPEED_BASE + (self.score * PIPE_SPEED_INCREMENT)) * UI_SCALE
        return min(speed, PIPE_SPEED_MAX * UI_SCALE)

    def start_boss_phase(self):
        self.is_boss_phase = True
        self.is_boss_transition = False
        self.boss_transition_timer = 0
        self.score = BOSS_TRIGGER_SCORE
        self.pipes.clear()
        self.enemy.reset()
        self.pink_enemy.reset()
        self.boss.activate()

    def start_boss_transition(self):
        if self.is_boss_phase or self.is_boss_transition:
            return
        self.is_boss_transition = True
        self.boss_transition_timer = 0
        self.enemy.reset()
        self.pink_enemy.reset()

    def handle_score_progression(self):
        if self.score >= BOSS_TRIGGER_SCORE and not self.is_boss_phase and not self.is_boss_transition:
            self.start_boss_transition()
            return

        # Keep legacy enemy progression before boss trigger.
        self.enemy.shooting_unlocked = self.score > EnemyFly.SHOOT_UNLOCK_SCORE
        if self.score >= self.ENEMY_CHARGE_SPAWN_SCORE and not self.enemy.active:
            self.enemy.activate(self.score)
        if self.score >= PinkBirdEnemy.UNLOCK_SCORE and self.score % 3 == 0 and not self.pink_enemy.active:
            self.pink_enemy.activate()

    def update(self, frame):
        if self.is_falling:
            gravity = 0.5 * UI_SCALE
            self.fall_velocity += gravity
            self.bird.y += self.fall_velocity

            if self.fall_rotation > -90:
                self.fall_rotation -= 3
            self.bird.rotation = self.fall_rotation

            self.bird.image = pygame.transform.rotate(self.bird.current_sprite, self.bird.rotation)
            self.bird.mask = pygame.mask.from_surface(self.bird.image)

            ground_y = SCREEN_HEIGHT - int(SCREEN_HEIGHT * 0.1) - BIRD_HEIGHT
            if self.bird.y >= ground_y:
                self.bird.y = ground_y
                self.is_falling = False
                self.is_game_over = True
            return

        if self.is_game_over:
            return

        self.bird.update(frame)

        if self.is_boss_phase:
            boss_hit, boss_done = self.boss.update()
            if boss_hit:
                self.start_falling()
                return
            if boss_done:
                self.is_victory = True
                self.is_game_over = True
                self.is_falling = False
            return

        if self.is_boss_transition:
            self.boss_transition_timer += 1
            current_speed = self.get_current_speed()
            step_speed = current_speed / PIPE_MOTION_SUBSTEPS

            for _ in range(PIPE_MOTION_SUBSTEPS):
                self.base_x -= step_speed
                if self.base_x <= -SCREEN_WIDTH:
                    self.base_x += SCREEN_WIDTH

                for pipe in self.pipes[:]:
                    pipe.update(step_speed)
                    if pipe.collide(self.bird):
                        self.start_falling()
                        return
                    if pipe.is_offscreen():
                        self.pipes.remove(pipe)

            if self.boss_transition_timer >= BOSS_TRANSITION_DELAY_FRAMES and len(self.pipes) == 0:
                self.start_boss_phase()
            return

        current_speed = self.get_current_speed()
        step_speed = current_speed / PIPE_MOTION_SUBSTEPS

        if len(self.pipes) == 0 or self.pipes[-1].x < SCREEN_WIDTH * PIPE_SPAWN_THRESHOLD:
            self.pipes.append(Pipe())

        for _ in range(PIPE_MOTION_SUBSTEPS):
            self.base_x -= step_speed
            if self.base_x <= -SCREEN_WIDTH:
                self.base_x += SCREEN_WIDTH

            for pipe in self.pipes[:]:
                pipe.update(step_speed)
                if pipe.collide(self.bird):
                    self.start_falling()
                    return
                if pipe.check_score(self.bird):
                    self.score += 1
                    self.handle_score_progression()
                    if self.is_boss_phase:
                        return
                if pipe.is_offscreen():
                    self.pipes.remove(pipe)

        # Original enemy system remains active until boss starts.
        self.enemy.update()
        self.pink_enemy.update()

        if self.enemy.collide(self.bird):
            self.start_falling()
            return
        if self.pink_enemy.collide(self.bird):
            self.start_falling()
            return

    def draw(self, screen):
        self.bird.draw(screen)

        for pipe in self.pipes:
            pipe.draw(screen)

        self.enemy.draw(screen)
        self.pink_enemy.draw(screen)

        base_y = SCREEN_HEIGHT - int(SCREEN_HEIGHT * 0.1)
        screen.blit(base_image, (self.base_x, base_y))
        screen.blit(base_image, (self.base_x + SCREEN_WIDTH, base_y))

        self.boss.draw(screen)
        self.boss.draw_screen_warning(screen)

        font_score = pygame.font.Font(None, int(50 * UI_SCALE))
        score_text = f"Score: {self.score}"
        draw_text_with_border(screen, score_text, font_score, WHITE, int(10 * UI_SCALE), int(10 * UI_SCALE))

        font_small = pygame.font.Font(None, int(28 * UI_SCALE))

        btn_width = int(45 * UI_SCALE)
        btn_height = int(30 * UI_SCALE)
        fs_btn_x = SCREEN_WIDTH - btn_width - int(50 * UI_SCALE) if not is_fullscreen else SCREEN_WIDTH - btn_width - int(10 * UI_SCALE)
        self.fs_btn = Button(fs_btn_x, int(5 * UI_SCALE), btn_width, btn_height, "⛶", font_small, WHITE, (50, 50, 50, 180), (80, 80, 80, 200))
        self.fs_btn.draw(screen)
    
    def draw_game_over(self, screen):
        # Semi-transparent overlay
        overlay = pygame.Surface((SCREEN_WIDTH, SCREEN_HEIGHT), pygame.SRCALPHA)
        overlay.fill((0, 0, 0, 150))
        screen.blit(overlay, (0, 0))
        
        # Scale fonts based on UI_SCALE
        font_large = pygame.font.Font(None, int(100 * UI_SCALE))
        font_medium = pygame.font.Font(None, int(70 * UI_SCALE))
        font_button = pygame.font.Font(None, int(45 * UI_SCALE))
        
        # Draw "GAME OVER"
        game_over_text = "GAME OVER"
        go_surface = font_large.render(game_over_text, True, RED)
        go_x = SCREEN_WIDTH // 2 - go_surface.get_width() // 2
        go_y = SCREEN_HEIGHT // 2 - int(120 * UI_SCALE)
        draw_text_with_border(screen, game_over_text, font_large, RED, go_x, go_y)
        
        # Draw score
        score_text = f"Score: {self.score}"
        score_surface = font_medium.render(score_text, True, YELLOW)
        score_x = SCREEN_WIDTH // 2 - score_surface.get_width() // 2
        score_y = SCREEN_HEIGHT // 2 - int(30 * UI_SCALE)
        draw_text_with_border(screen, score_text, font_medium, YELLOW, score_x, score_y)
        
        # Create and draw buttons (scaled) - only Replay and Quit
        button_width = int(200 * UI_SCALE)
        button_height = int(55 * UI_SCALE)
        button_x = SCREEN_WIDTH // 2 - button_width // 2
        button_spacing = int(70 * UI_SCALE)
        
        self.replay_button = Button(button_x, SCREEN_HEIGHT // 2 + int(50 * UI_SCALE), button_width, button_height, "Replay (R)", font_button, WHITE, GREEN)
        self.quit_button = Button(button_x, SCREEN_HEIGHT // 2 + int(50 * UI_SCALE) + button_spacing, button_width, button_height, "Quit (Q)", font_button, WHITE, RED)
        
        mouse_pos = pygame.mouse.get_pos()
        self.replay_button.check_hover(mouse_pos)
        self.quit_button.check_hover(mouse_pos)
        
        self.replay_button.draw(screen)
        self.quit_button.draw(screen)

    def draw_victory(self, screen):
        # Semi-transparent celebratory overlay
        overlay = pygame.Surface((SCREEN_WIDTH, SCREEN_HEIGHT), pygame.SRCALPHA)
        overlay.fill((20, 70, 20, 170))
        screen.blit(overlay, (0, 0))

        font_large = pygame.font.Font(None, int(92 * UI_SCALE))
        font_medium = pygame.font.Font(None, int(58 * UI_SCALE))
        font_small = pygame.font.Font(None, int(44 * UI_SCALE))
        font_button = pygame.font.Font(None, int(45 * UI_SCALE))

        win_text = "YOU WIN!"
        score_text = f"Score: {self.score}"

        win_surface = font_large.render(win_text, True, YELLOW)
        win_x = SCREEN_WIDTH // 2 - win_surface.get_width() // 2
        win_y = SCREEN_HEIGHT // 2 - int(170 * UI_SCALE)
        draw_text_with_border(screen, win_text, font_large, YELLOW, win_x, win_y)
        draw_text_with_border(screen, "Boss defeated", font_medium, WHITE, SCREEN_WIDTH // 2 - int(150 * UI_SCALE), SCREEN_HEIGHT // 2 - int(108 * UI_SCALE))

        score_surface = font_small.render(score_text, True, WHITE)
        score_x = SCREEN_WIDTH // 2 - score_surface.get_width() // 2
        score_y = SCREEN_HEIGHT // 2 - int(55 * UI_SCALE)
        draw_text_with_border(screen, score_text, font_small, WHITE, score_x, score_y)

        button_width = int(200 * UI_SCALE)
        button_height = int(55 * UI_SCALE)
        button_x = SCREEN_WIDTH // 2 - button_width // 2
        button_spacing = int(70 * UI_SCALE)

        self.replay_button = Button(button_x, SCREEN_HEIGHT // 2 + int(55 * UI_SCALE), button_width, button_height, "Replay (R)", font_button, WHITE, GREEN)
        self.quit_button = Button(button_x, SCREEN_HEIGHT // 2 + int(55 * UI_SCALE) + button_spacing, button_width, button_height, "Quit (Q)", font_button, WHITE, RED)

        mouse_pos = pygame.mouse.get_pos()
        self.replay_button.check_hover(mouse_pos)
        self.quit_button.check_hover(mouse_pos)

        self.replay_button.draw(screen)
        self.quit_button.draw(screen)

# Game loop
game = GameManager()
clock = pygame.time.Clock()
FIXED_DT = 1.0 / FPS
MAX_UPDATES_PER_FRAME = 5
accumulator = 0.0

# Pre-allocate frame surface for faster rendering
last_frame_surface = None

running = True
while running:
    frame_time = clock.tick(FPS) / 1000.0
    accumulator += min(frame_time, 0.1)

    ret, frame = cam_thread.read()  # Non-blocking threaded read
    if not ret or frame is None:
        # Use last frame if camera hiccups
        if last_frame_surface is not None:
            screen.blit(last_frame_surface, (0, 0))
        else:
            continue
    else:
        frame_surface = build_camera_surface_no_scale(frame)
        last_frame_surface = frame_surface
        screen.blit(frame_surface, (0, 0))  # Draw the webcam feed as background

    mouse_clicked = False
    for event in pygame.event.get():
        if event.type == pygame.QUIT:
            running = False
        if event.type == pygame.KEYDOWN:
            if event.key == pygame.K_F11:
                new_bird_x = toggle_fullscreen(game)
                game.bird.x = new_bird_x
            elif event.key == pygame.K_ESCAPE and is_fullscreen:
                new_bird_x = toggle_fullscreen(game)
                game.bird.x = new_bird_x
        if event.type == pygame.VIDEORESIZE:
            screen = pygame.display.set_mode((event.w, event.h), pygame.RESIZABLE | pygame.DOUBLEBUF | pygame.HWSURFACE)
            handle_resize(event.w, event.h, game)
        if event.type == pygame.MOUSEBUTTONDOWN and event.button == 1:
            mouse_clicked = True
    
    # Check fullscreen button click during gameplay
    mouse_pos = pygame.mouse.get_pos()
    if hasattr(game, 'fs_btn') and game.fs_btn.is_clicked(mouse_pos, mouse_clicked):
        new_bird_x = toggle_fullscreen(game)
        game.bird.x = new_bird_x

    # Fixed timestep keeps simulation speed stable even when render FPS drops.
    updates = 0
    while accumulator >= FIXED_DT and updates < MAX_UPDATES_PER_FRAME:
        game.update(frame)  # Update game state with the current frame
        accumulator -= FIXED_DT
        updates += 1
    if updates == MAX_UPDATES_PER_FRAME:
        accumulator = 0.0

    game.draw(screen)  # Draw the game elements

    # Only show end screen after falling animation completes
    if game.is_game_over and not game.is_falling:
        if game.is_victory:
            game.draw_victory(screen)
        else:
            game.draw_game_over(screen)

    pygame.display.flip()  # Update the display

    # Only enter game over input loop after falling animation completes
    if game.is_game_over and not game.is_falling:
        # Handle game over input
        waiting_for_input = True
        while waiting_for_input:
            # Keep reading camera to show live background (threaded)
            ret_bg, frame_bg = cam_thread.read()
            if ret_bg and frame_bg is not None:
                frame_surface_bg = build_camera_surface_no_scale(frame_bg)
                screen.blit(frame_surface_bg, (0, 0))
                game.draw(screen)  # Draw game elements on top
            
            mouse_clicked = False
            for event in pygame.event.get():
                if event.type == pygame.QUIT:
                    waiting_for_input = False
                    running = False
                if event.type == pygame.KEYDOWN:
                    if event.key == pygame.K_r:
                        game.reset()
                        waiting_for_input = False
                    elif event.key == pygame.K_q:
                        waiting_for_input = False
                        running = False
                    elif event.key == pygame.K_F11:
                        new_bird_x = toggle_fullscreen(game)
                        game.bird.x = new_bird_x
                    elif event.key == pygame.K_ESCAPE and is_fullscreen:
                        new_bird_x = toggle_fullscreen(game)
                        game.bird.x = new_bird_x
                if event.type == pygame.VIDEORESIZE:
                    screen = pygame.display.set_mode((event.w, event.h), pygame.RESIZABLE | pygame.DOUBLEBUF | pygame.HWSURFACE)
                    handle_resize(event.w, event.h, game)
                if event.type == pygame.MOUSEBUTTONDOWN and event.button == 1:
                    mouse_clicked = True
            
            # Check button clicks
            mouse_pos = pygame.mouse.get_pos()
            if hasattr(game, 'replay_button') and game.replay_button.is_clicked(mouse_pos, mouse_clicked):
                game.reset()
                waiting_for_input = False
            elif hasattr(game, 'quit_button') and game.quit_button.is_clicked(mouse_pos, mouse_clicked):
                waiting_for_input = False
                running = False
            elif hasattr(game, 'fs_btn') and game.fs_btn.is_clicked(mouse_pos, mouse_clicked):
                new_bird_x = toggle_fullscreen(game)
                game.bird.x = new_bird_x
            
            # Redraw end screen to update button hover states
            if game.is_victory:
                game.draw_victory(screen)
            else:
                game.draw_game_over(screen)
            pygame.display.flip()
            clock.tick(60)  # 60 FPS for game over screen

# Cleanup
cam_thread.stop()
video_cam.release()
cv2.destroyAllWindows()
pygame.quit()

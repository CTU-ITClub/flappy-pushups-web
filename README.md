# 🐛 Flappy Pushups - IT Club

**Face-controlled Flappy Bird game với Boss Battle**

Điều khiển trò chơi bằng khuôn mặt của bạn! Di chuyển đầu để điều khiển nhân vật, mở miệng để tăng tốc độ.

## 🎮 Tính năng

- 📹 **Điều khiển bằng khuôn mặt**: MediaPipe Face Mesh (AI chạy local, không cần server)
- 👄 **Tăng tốc**: Mở miệng để tăng tốc lên đến 3x
- 🦟 **LGBT Enemy**: Xuất hiện từ điểm số 2+
- 🐦 **Pink Bird Enemy**: Xuất hiện từ điểm số 6+ với đường bay chéo
- 👹 **Boss Battle**: Trận chiến Boss với bomb và laser tại điểm số 12
- 🎓 **IT Club Branding**: Logo và theme màu IT Club

## 🚀 Chạy game

### Cách 1: Python HTTP Server

```bash
python -m http.server 8080
```

### Cách 2: VS Code Live Server

1. Cài extension "Live Server"
2. Right-click vào `index.html` → "Open with Live Server"

### Cách 3: Node.js HTTP Server

```bash
npm install -g http-server
http-server
```

Sau đó mở trình duyệt: **http://localhost:8080** (hoặc port được hiển thị)

**Yêu cầu:**
- Trình duyệt hiện đại (Chrome, Edge, Firefox)
- Camera
- Cho phép truy cập camera khi được hỏi

## 📁 Cấu trúc dự án

```
flappy-pushups/
├── assets/       # Game sprites & images (19 files)
│   ├── bug_1.png, bug_2.png       # Player sprites
│   ├── boss_1.png, boss_2.png     # Boss sprites
│   ├── boom.png, explosion_*.png  # Effects
│   ├── lgbtbase_*.png             # LGBT enemy
│   ├── pinkbird-*.png             # Pink enemy
│   ├── pipe-green.png             # Obstacles
│   └── ITClub.png                 # Logo
├── css/
│   └── style.css                  # Game styling
├── js/
│   ├── game.js                    # Main game controller
│   ├── faceDetection.js           # MediaPipe wrapper
│   ├── bird.js                    # Player (face-controlled)
│   ├── pipe.js                    # Obstacles
│   ├── enemy.js                   # LGBT enemy AI
│   ├── pinkEnemy.js               # Pink bird AI
│   ├── bullet.js                  # Projectile system
│   └── boss.js                    # Boss battle system
├── index.html                     # Main game page
└── README.md
```

## 🎯 Cách chơi

1. **Di chuyển**: Xoay đầu lên/xuống/trái/phải
2. **Tăng tốc**: Mở miệng (tốc độ tối đa 3x)
3. **Tránh**: Pipes (ống nước), enemies (kẻ thù)
4. **Mục tiêu**: Đạt điểm 12 để gặp Boss, đánh bại Boss để chiến thắng!

## 🛠️ Công nghệ

- **HTML5 Canvas**: Rendering engine
- **Vanilla JavaScript**: Game logic (no frameworks!)
- **MediaPipe Face Mesh**: AI face tracking (468 landmarks)
- **CSS3**: Modern UI styling

## 📝 Chi tiết kỹ thuật

### Performance
- Target FPS: ~60
- Collision: Pixel-perfect with masks
- Face detection: Real-time at ~30 FPS
- Smooth interpolation: 5-element weighted history

### Face Tracking
- **Landmarks**: 468 facial points
- **Nose position**: Estimated at face center
- **Range expansion**: 1.35x horizontal, 1.25x vertical
- **Smoothing**: Weighted average [1,2,3,4,5]/15

### Game Balance
- Pipe speed: 10-24 px/frame (scales with score)
- Bird size: 65x65 px base (auto-scales)
- Hitbox: 50% of sprite size
- Gap size: 4.5x bird height

## 🎨 Assets

All sprites custom-designed for IT Club theme.

## 👥 Credits

**IT Club** - Game Development Team

Developed for club activities and programming education.

## 📄 License

MIT License - Educational use encouraged!

---

**Enjoy playing! 🎮** *Remember: The boss is waiting at score 12!* 👹

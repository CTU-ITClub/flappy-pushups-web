<div align="center">

# 🐛 FLAPPY PUSHUPS

### _Điều khiển game bằng khuôn mặt - Không cần bàn phím!_

[![Play Now](https://img.shields.io/badge/🎮_CHƠI_NGAY-Click_Here-brightgreen?style=for-the-badge&logoColor=white)](https://ctu-itclub.github.io/flappy-pushups-web/)
[![Made with Love](https://img.shields.io/badge/Made_with-❤️-red?style=for-the-badge)](https://github.com/ctu-itclub)
[![IT Club](https://img.shields.io/badge/CTU-IT_Club-blue?style=for-the-badge)](https://github.com/ctu-itclub)

<img src="imgForReadMe.jpg" alt="Flappy Pushups Gameplay" width="600"/>

**🎯 Bạn nghĩ Flappy Bird khó? Thử điều khiển bằng MẶT xem!**

[🎮 Chơi Ngay](https://ctu-itclub.github.io/flappy-pushups-web/) • [📖 Hướng Dẫn](#-cách-chơi) • [🛠️ Cài Đặt](#-chạy-local)

</div>

---

## 🔥 Tại sao game này đặc biệt?

> _"Quên bàn phím đi. Quên chuột đi. Chỉ cần khuôn mặt của bạn."_

**Flappy Pushups** biến webcam của bạn thành controller! Sử dụng AI nhận diện khuôn mặt, game theo dõi chuyển động đầu của bạn để điều khiển nhân vật - hoàn toàn KHÔNG cần chạm vào bàn phím.

### ✨ Điểm nổi bật

| 🎯 Feature            | 📝 Mô tả                                         |
| --------------------- | ------------------------------------------------ |
| 📹 **Face Control**   | AI MediaPipe theo dõi 468 điểm trên khuôn mặt    |
| 🧠 **100% Local**     | AI chạy trên máy bạn - không gửi dữ liệu đi đâu! |
| 👹 **Boss Battle**    | Trận chiến epic với bom và laser tại level 12    |
| 🦟 **Kẻ thù đa dạng** | LGBT Bird, Pink Bird với AI hành vi riêng        |
| 📱 **Responsive**     | Chơi được trên mọi màn hình                      |
| 🎵 **Nhạc nền**       | Nhạc sôi động làm game thêm hấp dẫn              |

---

## 🎮 Cách chơi

```
     🙂 Ngẩng lên     → Bug bay LÊN
     😔 Cúi xuống     → Bug bay XUỐNG
     😏 Nghiêng trái  → Bug bay TRÁI
     😌 Nghiêng phải  → Bug bay PHẢI
```

### Mục tiêu

1. 🚫 **Né** các ống nước (pipes)
2. ⚡ **Tránh** kẻ thù và đạn
3. 👹 **Đánh bại** Boss ở điểm 12 để chiến thắng!

### Kẻ thù xuất hiện

- **Điểm 2+**: 🦟 LGBT Bird (lao thẳng/bắn đạn)
- **Điểm 4+**: 🐦 Pink Bird (bay chéo nguy hiểm)
- **Điểm 12**: 👹 **BOSS BATTLE** - 10 bom + 10 laser + combo cuối!

---

## 🚀 Chơi Online

### 👉 [**CLICK ĐÂY ĐỂ CHƠI NGAY!**](https://ctu-itclub.github.io/flappy-pushups-web/) 👈

_Không cần cài đặt. Không cần download. Chỉ cần webcam và trình duyệt!_

---

## 💻 Chạy Local

<details>
<summary><b>📌 Click để xem hướng dẫn</b></summary>

### Yêu cầu

- Trình duyệt hiện đại (Chrome/Edge/Firefox)
- Webcam
- Cho phép quyền truy cập camera

### Cách 1: Python

```bash
git clone https://github.com/ctu-itclub/flappy-pushups-web.git
cd flappy-pushups-web
python -m http.server 8080
# Mở http://localhost:8080
```

### Cách 2: VS Code Live Server

1. Cài extension "Live Server"
2. Right-click `index.html` → "Open with Live Server"

### Cách 3: Node.js

```bash
npx http-server
```

</details>

---

## 🛠️ Tech Stack

<div align="center">

| Technology                                                                                               | Purpose                             |
| -------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| ![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=flat&logo=html5&logoColor=white)                | Game canvas & structure             |
| ![CSS3](https://img.shields.io/badge/CSS3-1572B6?style=flat&logo=css3&logoColor=white)                   | Modern UI styling                   |
| ![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=flat&logo=javascript&logoColor=black) | Game logic (vanilla, no framework!) |
| ![MediaPipe](https://img.shields.io/badge/MediaPipe-4285F4?style=flat&logo=google&logoColor=white)       | AI Face Detection (468 landmarks)   |

</div>

---

## 📁 Cấu trúc Project

```
flappy-pushups/
├── 🎨 assets/          # Sprites & images
├── 🎭 css/style.css    # Game styling
├── ⚙️ js/
│   ├── game.js         # Main controller
│   ├── faceDetection.js# MediaPipe AI
│   ├── bird.js         # Player character
│   ├── boss.js         # Boss battle system
│   ├── enemy.js        # LGBT enemy AI
│   ├── pinkEnemy.js    # Pink bird AI
│   ├── bullet.js       # Projectile system
│   └── pipe.js         # Obstacles
├── 🎵 nhac_nen.mp3     # Background music
├── 📄 index.html       # Entry point
└── 📖 README.md
```

---

## 👥 Credits

<div align="center">

### 🎓 **CTU IT Club**

_Game được phát triển bởi IT Club - Đại học Cần Thơ_

Dự án giáo dục nhằm giới thiệu công nghệ AI/ML và lập trình game cho sinh viên.

---

**⭐ Star repo này nếu bạn thấy hay!**

[![GitHub stars](https://img.shields.io/github/stars/ctu-itclub/flappy-pushups-web?style=social)](https://github.com/ctu-itclub/flappy-pushups-web)

</div>

---

<div align="center">

### 🎮 Ready to play?

[![Play Now](https://img.shields.io/badge/🕹️_BẮT_ĐẦU_CHƠI-Click_Here-success?style=for-the-badge)](https://ctu-itclub.github.io/flappy-pushups-web/)

_Tip: Boss đang chờ bạn ở điểm 12... Bạn có đủ can đảm?_ 👹

</div>

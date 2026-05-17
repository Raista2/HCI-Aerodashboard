# AeroDashboard Website

AeroDashboard adalah dashboard adaptif berbasis tugas untuk UAV otonom. Proyek ini mengimplementasikan antarmuka Hi-Fi prototype untuk pemantauan dan kontrol misi drone dengan peta interaktif Leaflet.

## Fitur

- **Pre-Flight Mode**: Checklist pra-penerbangan dan perencana misi dengan peta
- **In-Flight Monitoring**: Pemantauan telemetri real-time dengan simulasi terbang
- **Post-Flight Review**: Tinjauan setelah misi selesai
- **AI Route Suggestions**: Saran rute dari AI
- **Alert System**: Notifikasi anomali dan peringatan
- **Interactive Map**: Peta interaktif Leaflet dengan waypoint dan animasi drone

## Teknologi

- HTML5
- CSS3 (Custom properties, Grid, Flexbox, Animations)
- Vanilla JavaScript
- Leaflet.js (peta interaktif)

## Installation

### Prerequisites
- Node.js (untuk npm)
-  modern (Chrome, Firefox, Safari, Edge)

### Langkah Install

```bash
cd aerodashboard_website
npm install
```

Ini akan menginstall dependencies:
- `leaflet` - Library peta interaktif
- `serve` - Development server

## Cara Menjalankan

### Development Server (Disarankan)

```bash
npm start
```

Atau dengan port berbeda:

```bash
npm run dev
```

Buka browser ke `http://localhost:3000`

### Langsung di Browser

Buka file `index.html` langsung di browser (map mungkin tidak berfungsi optimal karena CORS).

## Cara Penggunaan

### Pre-Flight Mode
1. Lengkapkan checklist dengan mengklik setiap item
2. Semua item harus tercentang untuk mengaktifkan tombol "Mulai Misi"
3. Peta menunjukkan waypoint A-E yang sudah ditentukan
4. Klik toolbar untuk menambah/mengatur waypoint
5. Klik "Minta Saran Rute AI" untuk mendapatkan saran

### In-Flight Mode
1. Drone akan start dari waypoint A
2. Animasi mengikuti rute ke setiap waypoint (B, C, D, E)
3. Monitor telemetri real-time (altitude, kecepatan, baterai, jarak ke WP)
4. Peta mengikuti posisi drone
5. Perhatikan alert overlay jika ada anomali

### Post-Flight Mode
1. Lihat statistik misi (waktu, jarak, baterai, waypoint)
2. Klik "Misi Baru" untuk reset dan mulai ulang

## Keyboard Shortcuts

- `Escape`: Tutup alert/modal
- `Tab`: Navigasi antar elemen

## Simulasi Terbang

Drone akan terbang dari waypoint ke waypoint:
- Waypoint A (start): -6.2001, 106.8456
- Waypoint B: -6.1900, 106.8600
- Waypoint C: -6.1750, 106.8750
- Waypoint D: -6.1650, 106.8850
- Waypoint E (end): -6.1550, 106.8950

Animasi menunjukkan drone bergerak sepanjang rute dengan:
- Pembaruan telemetri real-time
- Route line hijau menunjukkan jalur aktual
- Waypoint aktif berubah warna hijau saat didekati

## Catatan

- Peta menggunakan dark theme dari CARTO
- Data telemetri disimulasikan secara real-time
- Alert akan muncul setelah beberapa detik terbang
- Map requires internet untuk memuat tile peta

## Lisensi

Proyek ini untuk tujuan akademis - Kuliah HCI Semester 6
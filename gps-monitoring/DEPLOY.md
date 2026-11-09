# O'z serveringizga (VPS) joylashtirish

Ushbu yo'riqnoma GPS Monitoring saytini Ubuntu/Debian serverga doimiy
ishlaydigan qilib, HTTPS bilan o'rnatishni ko'rsatadi. Yakunda sayt
`https://sizning-domeningiz.uz` manzilida ishlaydi.

## 0. Kerakli narsalar
- Ubuntu 22.04+ (yoki Debian) bo'lgan VPS (Node.js uchun 1GB RAM yetarli).
- Domen nomi (ixtiyoriy, lekin HTTPS uchun tavsiya etiladi), A-yozuvi server IP'siga yo'naltirilgan.
- Serverga SSH orqali kira olish.

## 1. Node.js va git o'rnatish
```bash
sudo apt update
sudo apt install -y git curl
# Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node --version   # v20.x ko'rinishi kerak
```

## 2. Kodni olish
```bash
cd /opt
sudo git clone https://github.com/mustafaevilham/ilham-github.git
sudo chown -R $USER:$USER ilham-github
cd ilham-github/gps-monitoring
git checkout claude/gps-monitoring-app-hgz8sq
npm install --omit=dev
```

## 3. Muhit o'zgaruvchilari (`.env` o'rniga xizmat faylida)
Quyidagilar MAJBURIY:
- `ADMIN_PASSWORD` — kuchli admin paroli
- `SESSION_SECRET` — uzun tasodifiy satr: `openssl rand -hex 32`

Ixtiyoriy: `ADMIN_USERNAME` (standart `admin`), `PORT` (standart `3000`),
`DB_PATH` (standart `./data/app.db`).

## 4. systemd xizmati (doimiy ishlashi uchun)
`sudo nano /etc/systemd/system/gps-monitoring.service`:
```ini
[Unit]
Description=GPS Monitoring
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/ilham-github/gps-monitoring
ExecStart=/usr/bin/node server.js
Restart=on-failure
User=www-data
Environment=PORT=3000
Environment=ADMIN_USERNAME=admin
Environment=ADMIN_PASSWORD=BU_YERGA_KUCHLI_PAROL
Environment=SESSION_SECRET=BU_YERGA_OPENSSL_RAND_HEX_32
Environment=DB_PATH=/opt/ilham-github/gps-monitoring/data/app.db

[Install]
WantedBy=multi-user.target
```
So'ng:
```bash
sudo mkdir -p /opt/ilham-github/gps-monitoring/data
sudo chown -R www-data:www-data /opt/ilham-github/gps-monitoring/data
sudo systemctl daemon-reload
sudo systemctl enable --now gps-monitoring
sudo systemctl status gps-monitoring   # "active (running)" bo'lishi kerak
```

## 5. Nginx + HTTPS (reverse proxy)
```bash
sudo apt install -y nginx
```
`sudo nano /etc/nginx/sites-available/gps`:
```nginx
server {
    server_name sizning-domeningiz.uz;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```
```bash
sudo ln -s /etc/nginx/sites-available/gps /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# Bepul HTTPS sertifikat (Let's Encrypt)
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d sizning-domeningiz.uz
```
Certbot HTTPS'ni avtomatik sozlaydi va 80→443 yo'naltirishni qo'shadi.

> **Muhim:** GPS (`navigator.geolocation`) faqat HTTPS orqali ishlaydi.
> Shuning uchun xodim sahifasi albatta `https://` bo'lishi kerak — 5-qadam majburiy.

## 6. Xavfsizlik devori (firewall)
```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
```
Node (3000) portini tashqariga ochmang — faqat Nginx 80/443 ochiq bo'lsin.

## 7. Tekshirish
- `https://sizning-domeningiz.uz/admin/login` — admin kirishi.
- Xodim qo'shing; rozilik havolasi hozircha server loglarida (`journalctl -u gps-monitoring -f`) va admin panelda ko'rinadi.

## 8. Yangilanishni o'rnatish (keyinchalik)
```bash
cd /opt/ilham-github/gps-monitoring
git pull
npm install --omit=dev
sudo systemctl restart gps-monitoring
```

## Haqiqiy SMS (Eskiz.uz)
Eskiz integratsiyasi tayyor. systemd xizmat fayliga (4-qadam) quyidagilarni
qo'shsangiz, rozilik havolasi xodimga avtomatik SMS orqali boradi:
```ini
Environment=ESKIZ_EMAIL=eskiz-hisobingiz@email.uz
Environment=ESKIZ_PASSWORD=eskiz-paroli
Environment=ESKIZ_FROM=4546
```
So'ng `sudo systemctl restart gps-monitoring`. Bu o'zgaruvchilar bo'lmasa,
tizim havolani faqat loglarga yozadi (`journalctl -u gps-monitoring -f`).

> Server `notify.eskiz.uz` ga chiqa olishi kerak (odatda ochiq). Sender nomi
> (`ESKIZ_FROM`) Eskiz kabinetida tasdiqlangan bo'lishi shart; test uchun `4546`.

## Keyingi qadamlar (tavsiya)
- **Zaxira nusxa**: `data/app.db` faylini muntazam zaxiralang (bu butun baza).
- **Xavfsizlik yaxshilashlari**: session cookie'ga `secure: true`, `sameSite`,
  va admin formalariga CSRF himoyasi (hozir keyinga qoldirilgan).

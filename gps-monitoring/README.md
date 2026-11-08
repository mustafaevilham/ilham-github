# GPS Monitoring (rozilikka asoslangan)

Kompaniyaning dala xodimlarini (kuryer, haydovchi va h.k.) ish vaqtida GPS
orqali kuzatish uchun mo'ljallangan nazorat vositasi. Kuzatuv **faqat
xodimning ongли va qayd etilgan roziligi bilan** amalga oshiriladi: har bir
xodimga shaxsiy bir martalik rozilik havolasi beriladi, u havolani ochib
"Roziman" tugmasini bosgandan keyingina joylashuv yig'iladi. Kuzatuv sahifasi
ochiq bo'lganida ekranda doimo **"🛰️ GPS kuzatuv FAOL"** belgisi ko'rinib
turadi — ya'ni xodim kuzatuv faol ekanini har doim ko'radi. Tizim marshrutdan
chetga chiqish, ish vaqtidan tashqari harakat, uzoq to'xtash va signal
uzilishi kabi anomaliyalarni avtomatik aniqlab, admin panelida signal
sifatida ko'rsatadi.

## Ishga tushirish

```bash
cd gps-monitoring
npm install

# Majburiy muhit o'zgaruvchilari:
export ADMIN_PASSWORD="kuchli-parol"      # majburiy
export SESSION_SECRET="tasodifiy-uzun-satr" # majburiy
# Ixtiyoriy:
export ADMIN_USERNAME="admin"             # standart: admin
export PORT=3000                          # standart: 3000
export DB_PATH="./data/app.db"            # standart: ./data/app.db

npm start
```

So'ng brauzerda `http://localhost:3000/admin/login` ni oching va yuqoridagi
login/parol bilan kiring.

### Qanday ishlaydi
1. Admin panelda yangi xodim qo'shadi (ism, telefon, lavozim).
2. Tizim rozilik havolasini generatsiya qiladi va SMS matnini yuboradi
   (hozircha konsolga chiqaradi — pastga qarang).
3. Xodim havolani ochib "Roziman" bosadi — shundan keyingina joylashuv
   qabul qilinadi.
4. Admin xaritada joylashuvlarni, "Signallar" bo'limida esa anomaliyalarni
   ko'radi. Har bir xodimga "Zona sozlash" orqali ruxsat etilgan hudud va
   ish soatlari belgilanadi.

### Offline ishlash
Xodim telefoni doimiy internetga ulangan bo'lishi shart emas. Joylashuvlar
avval brauzer xotirasida (localStorage) navbatga saqlanadi va internet
mavjud bo'lganda (har o'qishda va brauzerning `online` hodisasida) serverga
partiya sifatida, vaqt tartibida yuboriladi. Ma'lumot faqat server qabul
qilgandan keyin navbatdan o'chiriladi.

## Testlar

```bash
npm test
```

## SMS provayderini ulash

Hozirgi bosqichda SMS yuborilmaydi — rozilik havolasi va matni **konsolga**
chiqariladi (`[SMS -> +998... ] ...`). Haqiqiy provayder (masalan Eskiz.uz)
ulash uchun **faqat bitta funksiyani** o'zgartirish kifoya:
`src/sms.js` dagi `sendSms(phone, message)`.

## Muhim: maxfiylik chegaralari

- Ushbu tizim **mikrofon yoki audio yozib olishni o'z ichiga olmaydi** va
  bunday funksiya qo'shilmasligi kerak. Faqat joylashuv ma'lumoti yig'iladi.
- Kuzatuv faqat xodim rozilik bergandan keyin boshlanadi va u kuzatuv faol
  ekanini ko'rib turadi. Xodim bilmaydigan yoki yashirin kuzatuv bu
  tizimning maqsadi emas.

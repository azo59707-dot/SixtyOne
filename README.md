# SixtyOne Tournament — دليل الرفع على Railway

## الخطوات (5 خطوات فقط)

---

### 1. سجّل في Railway
- افتح: https://railway.app
- اضغط "Login" → "Login with GitHub"
- إذا ما عندك GitHub، أنشئ حساب مجاني على https://github.com

---

### 2. أنشئ تطبيق Discord
- افتح: https://discord.com/developers/applications
- اضغط "New Application" → أدخل اسم أي
- اذهب لـ "OAuth2" من الشريط الجانبي
- انسخ **Client ID** و **Client Secret**
- في "Redirects" اضغط "Add Redirect" ← اتركه فارغاً الحين، راح ترجع تحطه بعد ما تعرف رابط Railway

---

### 3. ارفع الكود على GitHub
- افتح https://github.com/new وأنشئ Repository جديد
- حمّل ملفات المشروع كلها (sixtyone folder)
- أو استخدم GitHub Desktop إذا ما تعرف command line

---

### 4. ارفع على Railway
- في Railway اضغط "New Project" → "Deploy from GitHub repo"
- اختر الـ Repository اللي رفعته
- بعد ما ينشر، اضغط على المشروع → "Settings" → انسخ الـ **Domain** (مثل: sixtyone-production.up.railway.app)
- اذهب لـ "Variables" وأضف:

```
DISCORD_CLIENT_ID=        (من خطوة 2)
DISCORD_CLIENT_SECRET=    (من خطوة 2)
DISCORD_REDIRECT_URI=     https://YOUR_DOMAIN/auth/discord/callback
SESSION_SECRET=           أي_نص_عشوائي_طويل_هنا_123456789
ADMIN_DISCORD_IDS=        (Discord ID حقتك - اشرح أدناه)
```

---

### 5. عرّف Discord ID حقتك
- افتح Discord → Settings → Advanced → تفعّل "Developer Mode"
- اضغط على اسمك بالقائمة اليسرى → "Copy User ID"
- حط هذا الـ ID في متغير ADMIN_DISCORD_IDS

---

### 6. أضف Redirect في Discord Developer
- ارجع لـ https://discord.com/developers/applications
- اختر تطبيقك → OAuth2 → Redirects
- أضف: `https://YOUR_DOMAIN/auth/discord/callback`
- احفظ

---

## جاهز! 🎮

افتح رابط الموقع وستشاهد:
- الموقع يعمل بشكل كامل
- سجّل دخولك عبر Discord
- زر "الأدمن" راح يظهر لك (لأنك أنت الأدمن)
- من لوحة الأدمن: عدّل اسم البطولة، الفرق، النقاط، الجوائز، المباريات

---

## ملاحظات
- قاعدة البيانات تُحفظ تلقائياً على السيرفر
- الموقع مجاني على Railway (500 ساعة شهرياً)
- إذا واجهت مشكلة، تواصل مع المطور

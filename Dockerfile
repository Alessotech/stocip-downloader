# استخدم صورة رسمية من Node.js مع دعم Alpine لتقليل الحجم
FROM node:20-alpine

# تثبيت التبعيات اللازمة لـ Puppeteer
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    freetype-dev \
    harfbuzz \
    ca-certificates \
    ttf-freefont

# تعيين متغير البيئة لـ Puppeteer
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# إنشاء مجلد العمل داخل الحاوية
WORKDIR /app

# نسخ ملفات التعريف والتبعيات
COPY package*.json ./

# تثبيت التبعيات
RUN npm install

# نسخ باقي ملفات المشروع
COPY . .

# تعيين المنفذ الذي يستمع له التطبيق
EXPOSE 3000

# الأمر الافتراضي لتشغيل التطبيق
CMD ["npm", "start"]

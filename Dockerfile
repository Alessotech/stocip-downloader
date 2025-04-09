# استخدم صورة رسمية من Microsoft Playwright تحتوي على المتصفحات مثبتة
FROM mcr.microsoft.com/playwright:v1.51.1-focal

# إعداد مجلد العمل داخل الحاوية
WORKDIR /app

# نسخ ملفات التعريف الخاصة بالمشروع
COPY package*.json ./

# تثبيت التبعيات من npm
RUN npm install

# تحميل المتصفحات الخاصة بـ Playwright (Chromium, Firefox, WebKit)
RUN npx playwright install --with-deps

# نسخ باقي ملفات المشروع
COPY . .

# فتح المنفذ 3000 لأن التطبيق يستخدمه
EXPOSE 3000

# الأمر الذي يشغل التطبيق عند بدء الحاوية
CMD ["npm", "start"]

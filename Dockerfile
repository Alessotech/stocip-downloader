# استخدم نسخة رسمية موجودة من Microsoft Playwright
FROM mcr.microsoft.com/playwright:v1.42.1-focal

# تعيين مجلد العمل
WORKDIR /app

# نسخ ملفات package وتثبيت التبعيات
COPY package*.json ./
RUN npm install

# تحميل المتصفحات
RUN npx playwright install --with-deps

# نسخ باقي ملفات المشروع
COPY . .

# تعيين المنفذ
EXPOSE 3000

# تشغيل التطبيق
CMD ["npm", "start"]

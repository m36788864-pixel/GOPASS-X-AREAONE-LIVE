# =====================================================================
# GOPASS (PHP เว็บกดบัตร) + AREAONE-LIVE (Node เว็บดูไลฟ์) — 1 คอนเทนเนอร์
#
#   - เว็บกดบัตร (GOPASS PHP)  เสิร์ฟที่  /            โดย Apache + PHP
#   - เว็บดูไลฟ์ (AREAONE-LIVE) เสิร์ฟที่  /live/       โดย Node (proxy ผ่าน Apache)
#
# Deploy บน Render: ใช้ Dockerfile นี้ทั้งคู่ใน Web Service เดียว
# แล้วตั้ง env vars (ดู README > "Deploy บน Render แบบ 1 service"):
#   DATABASE_URL, INTEGRATION_SECRET, LIVE_API_SECRET, TDL_*, ADMIN_USER/ADMIN_PASS, ...
# =====================================================================

FROM php:8.2-apache

# --- 1. Apache modules: rewrite (.htaccess ของ GOPASS) + proxy (ส่ง /live/ ไป Node) + headers ---
RUN a2enmod rewrite proxy proxy_http headers

# --- 2. PHP extension: curl (ใช้เรียก API ข้ามเว็บ) ---
RUN apt-get update && apt-get install -y \
    libcurl4-openssl-dev \
    && docker-php-ext-install curl \
    && rm -rf /var/lib/apt/lists/*

# --- 3. Node.js 20 สำหรับเว็บไลฟ์ AREAONE-LIVE ---
RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends curl ca-certificates gnupg; \
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -; \
    apt-get install -y nodejs; \
    rm -rf /var/lib/apt/lists/*

# --- 4. คัดลอกแอป + เตรียมโฟลเดอร์สำหรับข้อมูลรันไทม์ ---
COPY . /var/www/html/

RUN mkdir -p /var/www/html/data /var/www/html/uploads \
    && chown -R www-data:www-data /var/www/html/data /var/www/html/uploads \
    && chmod -R 775 /var/www/html/data /var/www/html/uploads

# --- 5. ติดตั้ง dependencies ของเว็บไลฟ์ (ไม่มี package-lock.json จึงใช้ npm install) ---
RUN cd /var/www/html/live && npm install --omit=dev --no-audit --no-fund

# --- 6. Apache: เปิด .htaccess + proxy /live/ -> Node (พอร์ต 3000 ในคอนเทนเนอร์) ---
COPY docker-live-apache.conf /etc/apache2/conf-available/live-proxy.conf
RUN a2enconf live-proxy \
    && printf '<Directory /var/www/html>\n    AllowOverride All\n    Require all granted\n</Directory>\n' > /etc/apache2/conf-available/gopass-dir.conf \
    && a2enconf gopass-dir

ENV NODE_ENV=production

# --- 7. Entrypoint: รัน Node (background + auto-restart) แล้ว Apache เป็น process หลัก ---
COPY docker-start.sh /usr/local/bin/gopass-start
RUN chmod +x /usr/local/bin/gopass-start

EXPOSE 80

CMD ["gopass-start"]
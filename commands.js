// commands.js
// Handler untuk command .get, .ssweb

const axios = require('axios');
const puppeteer = require('puppeteer');

let browser = null;

/**
 * Dapatkan instance browser Puppeteer (singleton).
 * Di Railway/Nixpacks, chromium disediakan oleh sistem — path-nya diambil dari env var.
 */
async function getBrowser() {
    if (!browser) {
        const launchOptions = {
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',  // Penting untuk container dengan RAM terbatas
                '--disable-gpu',
            ],
            headless: 'new',
        };

        // Jika ada env var dari Nixpacks/Railway, pakai Chromium sistem
        if (process.env.PUPPETEER_EXECUTABLE_PATH) {
            launchOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
        }

        browser = await puppeteer.launch(launchOptions);
    }
    return browser;
}

/**
 * .get <url> — GET request ke URL, kirim response body sebagai teks.
 */
async function handleGet(sock, jid, url) {
    if (!url) {
        return sock.sendMessage(jid, { text: '❌ Masukkan URL!\nContoh: *.get https://api.github.com/users/github*' });
    }

    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url;
    }

    try {
        await sock.sendMessage(jid, { text: '⏳ Mengambil data...' });
        const response = await axios.get(url, { timeout: 15000 });
        const data = typeof response.data === 'object' ? JSON.stringify(response.data, null, 2) : String(response.data);

        // Kirim seluruh data sebagai 1 pesan utuh tanpa dipotong
        await sock.sendMessage(jid, { text: data });
    } catch (err) {
        await sock.sendMessage(jid, { text: `❌ Error: ${err.message}` });
    }
}

/**
 * .ssweb <url> [full] — Screenshot sebuah website.
 * Tambahkan "full" di akhir untuk full-page screenshot.
 */
async function handleSsweb(sock, jid, text) {
    if (!text) {
        return sock.sendMessage(jid, { text: '❌ Masukkan URL!\nContoh: *.ssweb https://google.com*\nFull page: *.ssweb https://google.com full*' });
    }

    const parts = text.trim().split(/\s+/);
    let url = parts[0];
    const isFullPage = parts.includes('full');

    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url;
    }

    try {
        await sock.sendMessage(jid, { text: `⏳ Sedang mengambil screenshot${isFullPage ? ' (full page)' : ''}...` });
        const b = await getBrowser();
        const page = await b.newPage();
        await page.setViewport({ width: 1280, height: 720 });
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
        const screenshot = await page.screenshot({ type: 'png', fullPage: isFullPage });
        await page.close();

        await sock.sendMessage(jid, {
            image: screenshot,
            caption: `📸 Screenshot dari: ${url}${isFullPage ? ' (full page)' : ''}`,
        });
    } catch (err) {
        console.error('SSWeb error:', err);
        await sock.sendMessage(jid, { text: `❌ Gagal mengambil screenshot: ${err.message}` });
    }
}

/**
 * Tutup browser Puppeteer (dipanggil saat shutdown).
 */
async function closeBrowser() {
    if (browser) {
        await browser.close();
        browser = null;
    }
}

module.exports = { handleGet, handleSsweb, closeBrowser };

const axios = require('axios');
const puppeteer = require('puppeteer');

let browser = null;

async function getBrowser() {
    if (!browser) {
        browser = await puppeteer.launch({
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
            headless: 'new'
        });
    }
    return browser;
}

async function handleGet(sock, jid, url) {
    if (!url) {
        return sock.sendMessage(jid, { text: 'Masukkan URL! Contoh: .get https://api.github.com/users/github' });
    }
    
    try {
        const response = await axios.get(url);
        const data = typeof response.data === 'object' ? JSON.stringify(response.data, null, 2) : response.data;
        await sock.sendMessage(jid, { text: data.substring(0, 4000) });
    } catch (err) {
        await sock.sendMessage(jid, { text: `Error: ${err.message}` });
    }
}

async function handleSsweb(sock, jid, url) {
    if (!url) {
        return sock.sendMessage(jid, { text: 'Masukkan URL! Contoh: .ssweb https://google.com' });
    }

    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url;
    }

    try {
        await sock.sendMessage(jid, { text: 'Sedang mengambil screenshot...' });
        const b = await getBrowser();
        const page = await b.newPage();
        await page.setViewport({ width: 1280, height: 720 });
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
        const screenshot = await page.screenshot({ type: 'png' });
        await page.close();

        await sock.sendMessage(jid, { image: screenshot, caption: `Screenshot dari: ${url}` });
    } catch (err) {
        console.error('SSWeb error:', err);
        await sock.sendMessage(jid, { text: `Gagal mengambil screenshot: ${err.message}` });
    }
}

async function closeBrowser() {
    if (browser) {
        await browser.close();
        browser = null;
    }
}

module.exports = { handleGet, handleSsweb, closeBrowser };

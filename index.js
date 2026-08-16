// index.js
// Bot WhatsApp pribadi (mode self-bot, jalan di nomor utama kamu sendiri).
// Bot HANYA memproses command yang KAMU ketik sendiri di chat "Chat Diri Sendiri".
// Pesan dari orang lain maupun dari grup tidak pernah diproses sebagai command,
// kecuali fitur RVO yang berjalan otomatis di background.

const http = require('http');
const {
  makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
  jidNormalizedUser,
} = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const pino = require('pino');
const QRCode = require('qrcode');
const readline = require('readline');

const config = require('./config');
const { handleGet, handleSsweb, closeBrowser } = require('./commands');
const { handleTiktok } = require('./downloader');
const { handleStatusHD } = require('./status');
const { handleRVO } = require('./rvo');
const { handleSticker, handleToImg } = require('./sticker');
const { getBodyText, formatUptime } = require('./utils');
const { saveChat, getHistory, formatHistory, cleanOldLogs } = require('./chatlog');

const usePairingCode = process.argv.includes('--pairing-code');
const startTime = Date.now();

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((resolve) => rl.question(q, resolve));

// =============================================
// Health Check Server (agar Railway tidak kill)
// =============================================
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
  const uptime = formatUptime((Date.now() - startTime) / 1000);
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    status: 'ok',
    bot: config.botName,
    uptime,
  }));
}).listen(PORT, () => {
  console.log(`Health check server berjalan di port ${PORT}`);
});



// =============================================
// Bot utama
// =============================================
async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState(config.sessionDir);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: 'silent' }),
    markOnlineOnConnect: false,
    printQRInTerminal: false,
  });

  // --- Login: QR code (default) atau pairing code ---
  if (usePairingCode && !sock.authState.creds.registered) {
    const phoneNumber = config.botNumber
      ? config.botNumber
      : (await ask('Masukkan nomor WhatsApp kamu (contoh: 628123456789): ')).trim();

    setTimeout(async () => {
      try {
        const code = await sock.requestPairingCode(phoneNumber.replace(/[^0-9]/g, ''));
        console.log(`\n==========================================`);
        console.log(`  Kode pairing kamu: ${code}`);
        console.log(`==========================================`);
        console.log('Buka WhatsApp > Perangkat Tertaut > Tautkan dengan nomor telepon\n');
      } catch (err) {
        console.error('Gagal mendapatkan pairing code:', err.message || err);
      }
    }, 4000);
  }

  // --- Connection events ---
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr && !usePairingCode) {
      console.log('\nScan QR code ini dengan WhatsApp (Perangkat Tertaut > Tautkan Perangkat):\n');
      console.log(await QRCode.toString(qr, { type: 'terminal', small: true }));
    }

    if (connection === 'close') {
      const statusCode = new Boom(lastDisconnect?.error)?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      console.log(
        'Koneksi terputus.',
        shouldReconnect ? 'Menyambung ulang dalam 3 detik...' : 'Logout — hapus folder session lalu jalankan ulang.'
      );
      if (shouldReconnect) {
        // Delay sebelum reconnect untuk menghindari spam
        setTimeout(() => startBot(), 3000);
      }
    } else if (connection === 'open') {
      console.log(`\n${config.botName} berhasil terhubung ke WhatsApp!`);
      console.log(`Ketik command di chat "Chat Diri Sendiri", contoh: ${config.prefix}menu`);
      console.log(`RVO (Anti View Once): ${rvoEnabled ? 'AKTIF ✅' : 'NONAKTIF ❌'}\n`);

      // Bersihkan log chat yang lebih tua dari 7 hari
      cleanOldLogs(7);
    }
  });

  sock.ev.on('creds.update', saveCreds);

  // --- Message handler ---
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    try {
      if (type !== 'notify') return;
      const msg = messages[0];
      if (!msg?.message) return;

      // === CATAT RIWAYAT CHAT ===
      try {
        const SKIP_KEYS = ['messageContextInfo', 'senderKeyDistributionMessage', 'protocolMessage', 'senderKeyDistributionMessage'];
        const msgType = Object.keys(msg.message).find((k) => !SKIP_KEYS.includes(k)) || 'unknown';
        const MEDIA_TYPES = { imageMessage: 'image', videoMessage: 'video', audioMessage: 'audio', stickerMessage: 'sticker', documentMessage: 'document' };
        const chatType = MEDIA_TYPES[msgType] || 'text';
        const bodyText = getBodyText(msg);
        const senderJid = msg.key.remoteJid;
        const isGroup = senderJid?.endsWith('@g.us');
        const participant = isGroup ? (msg.key.participant || senderJid) : senderJid;

        saveChat({
          from: msg.key.fromMe ? 'Saya' : (participant?.split('@')[0] || 'unknown'),
          to: msg.key.fromMe ? (senderJid?.split('@')[0] || 'unknown') : 'Saya',
          type: chatType,
          body: bodyText || (chatType !== 'text' ? `[${chatType}]` : ''),
          chatJid: senderJid,
          fromMe: msg.key.fromMe || false,
        });
      } catch (logErr) {
        // Jangan sampai error logging menghentikan bot
        console.error('Error saat mencatat chat:', logErr);
      }


      // === FILTER UTAMA (mode self-bot) ===
      // Hanya proses pesan yang dikirim oleh pemilik bot (fromMe)
      // Command bisa diketik di chat mana saja (pribadi, grup, atau self-chat)
      if (!msg.key.fromMe) return;

      // Parse body dari berbagai tipe pesan (termasuk caption gambar/video)
      const body = getBodyText(msg);
      if (!body.startsWith(config.prefix)) return;

      const [rawCmd, ...args] = body.slice(config.prefix.length).trim().split(/\s+/);
      const cmd = rawCmd.toLowerCase();
      const text = args.join(' ');
      const jid = msg.key.remoteJid;

      // === COMMAND ROUTER ===
      switch (cmd) {
        // --- Utilitas ---
        case 'get':
          await handleGet(sock, jid, text);
          break;

        case 'ssweb':
          await handleSsweb(sock, jid, text);
          break;

        case 'tt':
          await handleTiktok(sock, jid, text, false);
          break;

        case 'tthd':
          await handleTiktok(sock, jid, text, true);
          break;

        case 'ping': {
          const uptime = formatUptime((Date.now() - startTime) / 1000);
          const memUsage = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1);
          await sock.sendMessage(jid, {
            text: [
              `🏓 *Pong!*`,
              ``,
              `⏱️ Uptime: ${uptime}`,
              `💾 RAM: ${memUsage} MB`,
              `📦 Node: ${process.version}`,
              `🤖 Baileys: v6`,
            ].join('\n'),
          });
          break;
        }

        case 'owner':
          await sock.sendMessage(jid, {
            text: [
              `👤 *Info Owner*`,
              ``,
              `Nama: ALDY`,
              `Nomor: ${config.botNumber}`,
              `Bot: ${config.botName} v2.0`,
            ].join('\n'),
          });
          break;

        // --- Media & Sticker ---
        case 'sticker':
        case 's':
          await handleSticker(sock, msg);
          break;

        case 'toimg':
          await handleToImg(sock, msg);
          break;

        // --- Status ---
        case 'statushd':
          await handleStatusHD(sock, msg, text);
          break;

        // --- RVO (Manual) ---
        case 'rvo':
          await handleRVO(sock, msg);
          break;

        // --- Riwayat Chat ---
        case 'riwayat':
        case 'history': {
          const count = parseInt(text) || 20;
          const logs = getHistory(Math.min(count, 50));
          const formatted = formatHistory(logs);
          await sock.sendMessage(jid, { text: formatted });
          break;
        }

        case 'hapuslog': {
          cleanOldLogs(0); // Hapus semua log
          await sock.sendMessage(jid, { text: '🗑️ Semua riwayat chat telah dihapus.' });
          break;
        }

        // --- Menu ---
        case 'menu':
        case 'help': {
          const p = config.prefix;
          const menuText = [
            `╔══════════════════╗`,
            `║  *${config.botName}*  ║`,
            `╚══════════════════╝`,
            ``,
            `📌 *Utilitas*`,
            `├ ${p}ping — Cek bot hidup`,
            `├ ${p}owner — Info owner`,
            `├ ${p}get <url> — HTTP GET request`,
            `└ ${p}ssweb <url> [full] — Screenshot web`,
            ``,
            `📥 *Downloader*`,
            `├ ${p}tt <url> — Download TikTok Biasa`,
            `└ ${p}tthd <url> — Download TikTok HD`,
            ``,
            `🎨 *Media & Sticker*`,
            `├ ${p}sticker — Gambar → Sticker`,
            `└ ${p}toimg — Sticker → Gambar`,
            ``,
            `📸 *Status*`,
            `└ ${p}statushd [caption] — Upload status HD`,
            ``,
            `🔓 *Anti View Once*`,
            `└ ${p}rvo — Reply pesan sekali lihat → simpan`,
            ``,
            `📋 *Riwayat Chat*`,
            `├ ${p}riwayat [jumlah] — Lihat riwayat`,
            `└ ${p}hapuslog — Hapus semua log`,
          ].join('\n');

          await sock.sendMessage(jid, { text: menuText });
          break;
        }

        default:
          // Command tidak dikenali — abaikan saja
          break;
      }
    } catch (err) {
      console.error('Error saat proses pesan:', err);
    }
  });
}

// =============================================
// Global error handlers & shutdown
// =============================================
process.on('uncaughtException', (err) => console.error('Uncaught exception:', err));
process.on('unhandledRejection', (err) => console.error('Unhandled rejection:', err));
process.on('SIGINT', async () => {
  console.log('\nMenutup bot...');
  await closeBrowser();
  process.exit(0);
});

startBot();

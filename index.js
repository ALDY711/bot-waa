// index.js
// Bot WhatsApp pribadi (mode self-bot, jalan di nomor utama kamu sendiri).
// Bot HANYA memproses command yang KAMU ketik sendiri di chat "Chat Diri Sendiri".
// Pesan dari orang lain maupun dari grup tidak pernah diproses sebagai command.

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
const { handleStatusHD } = require('./status');
const { handleRVO } = require('./rvo');

const usePairingCode = process.argv.includes('--pairing-code');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((resolve) => rl.question(q, resolve));

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState(config.sessionDir);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: 'silent' }),
    // false: akun tidak ikut ditandai "online" hanya karena bot ini connect,
    // dan HP kamu tetap dapat notifikasi WhatsApp seperti biasa.
    markOnlineOnConnect: false,
  });

  // --- Login: QR code (default) atau pairing code (jalankan `npm run pairing`) ---
  if (usePairingCode && !sock.authState.creds.registered) {
    if (config.customPairingCode && config.customPairingCode.length !== 8) {
      console.error(
        `Kode pairing custom di config.js harus PERSIS 8 karakter (sekarang ${config.customPairingCode.length}). ` +
        'Perbaiki nilainya, atau kosongkan jadi \'\' untuk pakai kode otomatis.'
      );
      process.exit(1);
    }

    const phoneNumber = config.botNumber
      ? config.botNumber
      : (await ask('Masukkan nomor WhatsApp kamu (contoh: 628123456789): ')).trim();

    const code = await sock.requestPairingCode(phoneNumber, config.customPairingCode || undefined);
    console.log(`\nKode pairing kamu: ${code}`);
    console.log('Buka WhatsApp > Perangkat Tertaut > Tautkan dengan nomor telepon\n');
  }

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
        shouldReconnect ? 'Menyambung ulang...' : 'Logout — hapus folder session lalu jalankan ulang.'
      );
      if (shouldReconnect) startBot();
    } else if (connection === 'open') {
      console.log('Bot berhasil terhubung ke WhatsApp!');
      console.log(`Ketik command di chat "Chat Diri Sendiri" (chat dengan nomor kamu sendiri), contoh: ${config.prefix}menu`);
    }
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('messages.upsert', async ({ messages }) => {
    try {
      const msg = messages[0];
      if (!msg?.message) return;

      // === FITUR RVO (Membaca pesan view once dari orang lain) ===
      if (!msg.key.fromMe) {
        await handleRVO(sock, msg);
      }

      // === FILTER UTAMA (mode self-bot di nomor utama) ===
      // 1) Hanya proses pesan yang KAMU ketik sendiri dari HP/perangkat kamu — bukan dari orang lain.
      //    (Pesan masuk dari orang lain/grup tetap "lewat" di sini, tapi baris ini langsung menghentikannya.)
      if (!msg.key.fromMe) return;

      // 2) Hanya proses kalau diketik di chat "Chat Diri Sendiri" (chat dengan nomor kamu sendiri) —
      //    bukan di chat/grup lain. Ini mencegah hasil command (misal screenshot) "nyasar" terkirim
      //    ke lawan bicara kamu kalau kamu kebetulan mengetik ".sesuatu" di chat biasa.
      const selfJid = jidNormalizedUser(sock.user.id);
      const chatJid = jidNormalizedUser(msg.key.remoteJid);
      if (chatJid !== selfJid) return;

      const body = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
      if (!body.startsWith(config.prefix)) return;

      const [rawCmd, ...args] = body.slice(config.prefix.length).trim().split(/\s+/);
      const cmd = rawCmd.toLowerCase();
      const text = args.join(' ');
      const jid = msg.key.remoteJid;

      if (cmd === 'get') {
        await handleGet(sock, jid, text);
      } else if (cmd === 'ssweb') {
        await handleSsweb(sock, jid, text);
      } else if (cmd === 'statushd') {
        await handleStatusHD(sock, msg, text);
      } else if (cmd === 'menu' || cmd === 'help') {
        await sock.sendMessage(jid, {
          text: `*Menu Bot Pribadi*\n\n${config.prefix}get <url>\n${config.prefix}ssweb <url>\n${config.prefix}statushd <caption (opsional)>`,
        });
      }
    } catch (err) {
      console.error('Error saat proses pesan:', err);
    }
  });
}

process.on('uncaughtException', (err) => console.error('Uncaught exception:', err));
process.on('unhandledRejection', (err) => console.error('Unhandled rejection:', err));
process.on('SIGINT', async () => {
  console.log('\nMenutup bot...');
  await closeBrowser();
  process.exit(0);
});

startBot();

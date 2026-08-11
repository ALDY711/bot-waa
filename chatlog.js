// chatlog.js
// Modul untuk menyimpan dan mengambil riwayat chat.
// Data disimpan dalam file JSON per hari di folder ./chatlogs/

const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, 'chatlogs');

// Pastikan folder chatlogs ada
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

/**
 * Dapatkan path file log untuk tanggal tertentu.
 */
function getLogPath(date) {
  const dateStr = date.toISOString().slice(0, 10); // YYYY-MM-DD
  return path.join(LOG_DIR, `${dateStr}.json`);
}

/**
 * Baca log dari file. Return array kosong jika belum ada.
 */
function readLog(date) {
  const filePath = getLogPath(date);
  if (!fs.existsSync(filePath)) return [];
  try {
    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

/**
 * Simpan satu entry chat ke log hari ini.
 * @param {object} entry
 * @param {string} entry.from - Pengirim (nomor atau 'Saya')
 * @param {string} entry.to - Penerima (nomor, grup, atau 'Saya')
 * @param {string} entry.type - Tipe pesan: 'text', 'image', 'video', 'sticker', 'audio', 'document'
 * @param {string} entry.body - Isi teks / caption
 * @param {string} entry.chatJid - JID chat asal
 * @param {boolean} entry.fromMe - Apakah pesan dari bot owner
 */
function saveChat(entry) {
  const now = new Date();
  const logPath = getLogPath(now);
  const logs = readLog(now);

  logs.push({
    timestamp: now.toISOString(),
    waktu: now.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }),
    from: entry.from,
    to: entry.to,
    type: entry.type,
    body: entry.body || '',
    chatJid: entry.chatJid,
    fromMe: entry.fromMe,
  });

  // Batasi maksimum 5000 pesan per hari agar file tidak terlalu besar
  if (logs.length > 5000) {
    logs.splice(0, logs.length - 5000);
  }

  fs.writeFileSync(logPath, JSON.stringify(logs, null, 2), 'utf8');
}

/**
 * Ambil riwayat chat terakhir.
 * @param {number} count - Jumlah pesan terakhir yang ingin diambil (default 20)
 * @param {string} [filterJid] - Opsional, filter hanya chat dari JID tertentu
 * @returns {Array} Array of log entries
 */
function getHistory(count = 20, filterJid = null) {
  const today = new Date();
  let allLogs = [];

  // Cari di hari ini dan kemarin (jika kurang)
  for (let i = 0; i < 3 && allLogs.length < count; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const dayLogs = readLog(date);
    allLogs = [...dayLogs, ...allLogs];
  }

  // Urutkan berdasarkan timestamp (terbaru di bawah)
  allLogs.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  // Filter berdasarkan JID jika diminta
  if (filterJid) {
    allLogs = allLogs.filter((log) => log.chatJid === filterJid);
  }

  // Ambil N pesan terakhir
  return allLogs.slice(-count);
}

/**
 * Format riwayat chat menjadi teks yang mudah dibaca untuk dikirim ke WhatsApp.
 * @param {Array} logs - Array of log entries
 * @returns {string}
 */
function formatHistory(logs) {
  if (logs.length === 0) return '📭 Tidak ada riwayat chat.';

  const lines = logs.map((log) => {
    const sender = log.fromMe ? '🟢 Saya' : `🔵 ${log.from}`;
    const typeIcon = {
      text: '💬',
      image: '🖼️',
      video: '🎥',
      sticker: '🎭',
      audio: '🎵',
      document: '📄',
    }[log.type] || '💬';

    const bodyPreview = log.body
      ? (log.body.length > 60 ? log.body.substring(0, 60) + '...' : log.body)
      : `[${log.type}]`;

    return `${log.waktu}\n${sender} ${typeIcon} ${bodyPreview}`;
  });

  return `📋 *Riwayat Chat* (${logs.length} pesan terakhir)\n\n${lines.join('\n\n')}`;
}

/**
 * Hapus log yang lebih tua dari N hari (pembersihan otomatis).
 * @param {number} keepDays - Simpan log selama berapa hari (default 7)
 */
function cleanOldLogs(keepDays = 7) {
  try {
    const files = fs.readdirSync(LOG_DIR);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - keepDays);

    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      const dateStr = file.replace('.json', '');
      const fileDate = new Date(dateStr);
      if (fileDate < cutoff) {
        fs.unlinkSync(path.join(LOG_DIR, file));
        console.log(`Chatlog lama dihapus: ${file}`);
      }
    }
  } catch (err) {
    console.error('Error saat membersihkan log lama:', err);
  }
}

module.exports = { saveChat, getHistory, formatHistory, cleanOldLogs };

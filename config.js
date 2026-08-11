// Konfigurasi bot

module.exports = {
  // Nama bot — ditampilkan di menu dan pesan sambutan.
  botName: 'WA Bot Pribadi',

  // Awalan (prefix) command. Dengan prefix ".", command ditulis ".get" atau ".ssweb"
  prefix: '.',

  // Nomor WhatsApp yang dipakai bot, format internasional tanpa "+"/spasi/strip.
  // Cuma dipakai saat login via `npm run pairing`, supaya tidak perlu ketik manual tiap kali.
  // (Ini BUKAN filter privasi — filter privasi tetap otomatis dari sesi login, lihat index.js)
  botNumber: '62881026633190',

  // Folder untuk menyimpan sesi login WhatsApp.
  // JANGAN hapus folder ini setelah login berhasil, dan JANGAN pernah membagikannya ke siapa pun —
  // isinya setara dengan akses penuh ke akun WhatsApp yang dipakai bot.
  sessionDir: './session',

  // Fitur Anti View Once (RVO).
  // true  = otomatis menangkap dan menyimpan pesan "sekali lihat" dari orang lain.
  // false = fitur RVO dinonaktifkan.
  rvoEnabled: true,
};

// Konfigurasi bot

module.exports = {
  // Awalan (prefix) command. Dengan prefix ".", command ditulis ".get" atau ".ssweb"
  prefix: '.',

  // Nomor WhatsApp yang dipakai bot, format internasional tanpa "+"/spasi/strip.
  // Cuma dipakai saat login via `npm run pairing`, supaya tidak perlu ketik manual tiap kali.
  // (Ini BUKAN filter privasi — filter privasi tetap otomatis dari sesi login, lihat index.js)
  botNumber: '62881026633190',

  // Kode pairing custom pilihan kamu sendiri — HARUS PERSIS 8 karakter (huruf/angka).
  // Kosongkan jadi '' kalau mau kode di-generate otomatis oleh WhatsApp tiap login.
  customPairingCode: 'ALDY1045',

  // Folder untuk menyimpan sesi login WhatsApp.
  // JANGAN hapus folder ini setelah login berhasil, dan JANGAN pernah membagikannya ke siapa pun —
  // isinya setara dengan akses penuh ke akun WhatsApp yang dipakai bot.
  sessionDir: './session',
};

const fs = require('fs');
const path = require('path');
const os = require('os');
const { downloadMedia } = require('./utils');

/**
 * .addkatalog <Nama Produk> <Harga> <Deskripsi>
 * Contoh: .addkatalog Kaos Polos Hitam 150000 Kaos berbahan katun 100% premium
 * 
 * Fungsi ini akan mencari angka pertama di dalam teks sebagai "Harga".
 * Kata-kata sebelum harga akan menjadi "Nama Produk".
 * Kata-kata setelah harga akan menjadi "Deskripsi".
 */
async function handleAddCatalog(sock, msg, text) {
  const jid = msg.key.remoteJid;

  try {
    if (!text || text.trim() === '') {
      await sock.sendMessage(jid, { 
        text: '❌ Format salah.\n\nGunakan: *.addkatalog <Nama Produk> <Harga> <Deskripsi>*\n\nContoh: *.addkatalog Kaos Polos 50000 Kaos katun nyaman*' 
      }, { quoted: msg });
      return;
    }

    // Parsing command dengan memisahkan spasi
    const parts = text.trim().split(/\s+/);
    
    // Cari index dari harga (angka pertama)
    let priceIndex = -1;
    for (let i = 0; i < parts.length; i++) {
        // Cek jika pure angka, hapus titik atau koma jika user nulis 150.000
        const numStr = parts[i].replace(/[.,]/g, '');
        const num = parseInt(numStr, 10);
        if (!isNaN(num) && num > 0 && numStr.match(/^\d+$/)) {
            priceIndex = i;
            break;
        }
    }

    if (priceIndex === -1 || priceIndex === 0) {
        await sock.sendMessage(jid, { 
          text: '❌ Harga tidak ditemukan atau salah letak.\n\nContoh yang benar: *.addkatalog Baju Kaos 150000 Baju bahan katun*' 
        }, { quoted: msg });
        return;
    }

    // Ekstrak data produk
    const name = parts.slice(0, priceIndex).join(' ');
    // Ambil harga dan bersihkan dari titik (misal 150.000 jadi 150000)
    const price = parseInt(parts[priceIndex].replace(/[.,]/g, ''), 10);
    const description = parts.slice(priceIndex + 1).join(' ') || 'Tidak ada deskripsi';

    // Ambil media (gambar)
    const media = await downloadMedia(msg);
    if (!media || media.mediaType !== 'image') {
      await sock.sendMessage(jid, { 
        text: '❌ Anda harus mengirim foto atau me-reply foto dengan caption *.addkatalog ...*' 
      }, { quoted: msg });
      return;
    }

    await sock.sendMessage(jid, { text: `⏳ Sedang mengunggah *${name}* ke katalog...` }, { quoted: msg });

    // Baileys memerlukan file path lokal untuk upload gambar katalog. 
    // Jadi kita simpan buffer ke temp file.
    const tmpFile = path.join(os.tmpdir(), `product-${Date.now()}.jpg`);
    fs.writeFileSync(tmpFile, media.buffer);

    try {
      const productData = {
          name: name,
          description: description,
          price: price * 1000, 
          currency: 'IDR',
          originCountryCode: 'ID', // Wajib diisi sesuai screenshot (Negara asal)
          isHidden: false,
          images: [ media.buffer ] // Langsung lempar buffer, Baileys akan mengubahnya jadi stream
      };

      // Eksekusi Baileys API
      const result = await sock.productCreate(productData);

      // Berhasil
      const successMsg = `✅ *Produk Berhasil Diunggah!*\n\n` +
                         `🛍️ *Nama:* ${name}\n` +
                         `💰 *Harga:* Rp ${price.toLocaleString('id-ID')}\n` +
                         `📝 *Deskripsi:* ${description}\n\n` +
                         `*ID Katalog:* ${result?.id || 'OK'}`;
      await sock.sendMessage(jid, { text: successMsg }, { quoted: msg });
    } catch (apiError) {
      // Jika terjadi error dari API WA (misalnya nomor bukan WA Business)
      console.error('Error dari API WA:', apiError);
      
      // Jika errornya Cannot read properties of undefined (reading 'attrs')
      // Itu berarti API mereturn success/result, tapi isinya pesan error (tidak ada node 'product').
      // Paling sering terjadi karena NOMOR YANG DIGUNAKAN BUKAN WHATSAPP BUSINESS.
      let hint = apiError.message;
      if (hint.includes('attrs')) {
        hint = 'Gagal memproses data katalog dari WhatsApp. Pastikan nomor yang ditautkan di bot ini adalah akun WhatsApp Business resmi (bukan WA biasa).';
      }
      throw new Error(hint);
    } finally {
      // Hapus file temporary agar tidak memenuhi storage
      if (fs.existsSync(tmpFile)) {
        fs.unlinkSync(tmpFile);
      }
    }

  } catch (err) {
    console.error('Katalog Upload Error:', err);
    await sock.sendMessage(jid, { text: `❌ Gagal mengunggah produk: ${err.message || 'Error internal Baileys'}` }, { quoted: msg });
  }
}

async function handleGetCatalog(sock, msg) {
  const jid = msg.key.remoteJid;
  try {
    await sock.sendMessage(jid, { text: '⏳ Mengambil data katalog...' }, { quoted: msg });
    
    // Ambil katalog dari nomor bot sendiri
    const botJid = sock.user.id.split(':')[0] + '@s.whatsapp.net';
    // RAW Query ke WhatsApp untuk mendapatkan data mentah katalog
    const result = await sock.query({
        tag: 'iq',
        attrs: {
            to: 's.whatsapp.net',
            type: 'get',
            xmlns: 'w:biz:catalog'
        },
        content: [
            {
                tag: 'product_catalog',
                attrs: {
                    jid: botJid,
                    allow_shop_source: 'true'
                },
                content: [
                    { tag: 'limit', attrs: {}, content: Buffer.from('10') },
                    { tag: 'width', attrs: {}, content: Buffer.from('100') },
                    { tag: 'height', attrs: {}, content: Buffer.from('100') }
                ]
            }
        ]
    });
    
    console.log('=== DATA RAW IQ DARI WA ===');
    console.log(JSON.stringify(result, null, 2));
    
    await sock.sendMessage(jid, { text: `✅ Berhasil hit API. Cek terminal untuk melihat JSON mentahnya.` }, { quoted: msg });
  } catch (err) {
    console.error('Get Katalog Error:', err);
    await sock.sendMessage(jid, { text: `❌ Gagal mengambil katalog: ${err.message}` }, { quoted: msg });
  }
}

module.exports = { handleAddCatalog, handleGetCatalog };

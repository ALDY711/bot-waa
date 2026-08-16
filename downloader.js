const axios = require('axios');

const { generateWAMessageContent, generateWAMessageFromContent } = require('@whiskeysockets/baileys');

// ...
async function handleTiktok(sock, jid, text, isHd = false) {
    if (!text) {
        return sock.sendMessage(jid, { text: '❌ Masukkan URL TikTok!\nContoh: *.tt https://vt.tiktok.com/xxxxxx*\nUntuk HD: *.tthd https://vt.tiktok.com/xxxxxx*' });
    }

    const args = text.trim().split(/\s+/);
    let url = args.find(a => a.startsWith('http'));

    if (!url) {
         return sock.sendMessage(jid, { text: '❌ URL TikTok tidak ditemukan dalam pesan.' });
    }

    try {
        await sock.sendMessage(jid, { text: `⏳ Sedang mengambil data TikTok${isHd ? ' (Mode HD)' : ''} dari API Anda...` });
        
        const response = await axios.get('https://api-anime-production-0c19.up.railway.app/tiktok/all', {
            params: {
                url: url
            }
        });

        const data = response.data;
        if (!data.success) {
            return sock.sendMessage(jid, { text: `❌ Gagal mengambil data: ${data.message || 'Video tidak ditemukan.'}` });
        }

        const result = data.data;
        const title = result.caption || 'TikTok Video';
        const author = result.author || 'Unknown';
        
        // Handle Photo Slide
        if (result.images && result.images.length > 0) {
            await sock.sendMessage(jid, { text: `📸 Ditemukan ${result.images.length} foto. Memproses WA Carousel (Maksimal 10 foto pertama)...` });
            
            try {
                // WA Carousel dibatasi maksimal 10 kartu
                const carouselImages = result.images.slice(0, 10);
                const cards = [];
                
                for (let i = 0; i < carouselImages.length; i++) {
                    const imgUrl = carouselImages[i];
                    
                    // 1. Upload media ke WA server dengan tipe image
                    const prep = await generateWAMessageContent(
                        { image: { url: imgUrl } },
                        { upload: sock.waUploadToServer }
                    );

                    // 2. Buat struktur kartu (card)
                    cards.push({
                        header: {
                            title: `Slide ${i + 1}`,
                            hasMediaAttachment: true,
                            imageMessage: prep.imageMessage
                        },
                        body: { text: "Lihat gambar penuh" },
                        nativeFlowMessage: {
                            buttons: [
                                {
                                    name: "cta_url",
                                    buttonParamsJson: JSON.stringify({
                                        display_text: "Buka Gambar Asli",
                                        url: imgUrl,
                                        merchant_url: imgUrl
                                    })
                                }
                            ]
                        }
                    });
                }

                // 3. Bangun pesan interaktif utama
                const interactiveMsgContent = {
                    viewOnceMessage: {
                        message: {
                            messageContextInfo: {
                                deviceListMetadata: {},
                                deviceListMetadataVersion: 2
                            },
                            interactiveMessage: {
                                header: {
                                    title: "Tiktok Slide",
                                    hasMediaAttachment: false
                                },
                                body: { text: `🎵 *${title}*\n👤 Author: ${author}` },
                                footer: { text: 'TikTok Downloader' },
                                carouselMessage: {
                                    cards: cards,
                                    messageVersion: 1
                                }
                            }
                        }
                    }
                };

                // 4. Generate & Relay Message
                const msg = generateWAMessageFromContent(jid, interactiveMsgContent, { userJid: sock.user.id });
                await sock.relayMessage(jid, msg.message, { messageId: msg.key.id });

                // 5. Jika foto lebih dari 10, kirim sisanya secara normal
                if (result.images.length > 10) {
                    await sock.sendMessage(jid, { text: `⚠️ Mengirim ${result.images.length - 10} foto sisanya secara normal...` });
                    for (let i = 10; i < result.images.length; i++) {
                        await sock.sendMessage(jid, {
                            image: { url: result.images[i] },
                            caption: `Foto ${i + 1}/${result.images.length}`
                        });
                    }
                }

            } catch (carouselErr) {
                console.error("Carousel error:", carouselErr);
                await sock.sendMessage(jid, { text: "❌ Gagal membuat Carousel WA. Mengirim foto satu per satu sebagai cadangan..." });
                
                // Fallback normal
                for (let i = 0; i < result.images.length; i++) {
                    await sock.sendMessage(jid, {
                        image: { url: result.images[i] },
                        caption: `Foto ${i + 1}/${result.images.length}\n${title}`
                    });
                }
            }

            // Kirim audionya juga jika ada
            if (result.audio) {
                await sock.sendMessage(jid, {
                    audio: { url: result.audio },
                    mimetype: 'audio/mp4',
                });
            }
            return;
        }

        // Pilih URL video
        let videoUrl = result.video;
        let isActuallyHd = false;
        
        if (isHd && result.videoHD) {
            videoUrl = result.videoHD;
            isActuallyHd = true;
        }

        if (!videoUrl) {
             return sock.sendMessage(jid, { text: `❌ Link media tidak ditemukan di respon API Anda.` });
        }

        let caption = `🎵 *${title}*\n`;
        caption += `👤 Author: ${author}\n`;
        if (isActuallyHd) {
            caption += `\n✨ Resolusi HD`;
        }

        await sock.sendMessage(jid, {
            video: { url: videoUrl },
            caption: caption
        });

    } catch (err) {
        console.error('TikTok downloader error:', err);
        await sock.sendMessage(jid, { text: `❌ Terjadi kesalahan: ${err.message}` });
    }
}

module.exports = { handleTiktok };

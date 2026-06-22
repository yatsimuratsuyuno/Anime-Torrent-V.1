export default new class SeaDex {
  url = atob('aHR0cHM6Ly9yZWxlYXNlcy5tb2UvYXBpL2NvbGxlY3Rpb25zL2VudHJpZXMvcmVjb3Jkcw==')

  /** @type {import('./').SearchFunction} */
  async single({ anilistId, titles, episode, episodeCount, fetch: hayaseFetch }) {
    // Validasi input
    if (!anilistId) throw new Error('AniList ID tidak ditemukan. Pastikan anime terdaftar di AniList.')
    if (!titles?.length) throw new Error('Judul anime tidak tersedia.')

    try {
      const res = await fetch(
        `${this.url}?page=1&perPage=1&filter=alID%3D%22${anilistId}%22&skipTotal=1&expand=trs`
      )

      if (!res.ok) {
        throw new Error(`SeaDex API error: HTTP ${res.status}`)
      }

      /** @type {import('./types').Seadex} */
      const { items } = await res.json()

      if (!items?.length || !items[0]?.expand?.trs?.length) {
        return [] // Gak ada hasil, return kosong (bukan error)
      }

      const { trs } = items[0].expand

      return trs
        .filter(torrent => {
          // Skip redacted hash
          if (torrent.infoHash === '<redacted>') return false
          
          // Skip single file spam untuk series panjang
          if (episodeCount && episodeCount > 1 && torrent.files?.length === 1) {
            return false
          }

          // Filter episode kalau ada
          if (episode && torrent.files?.length > 1) {
            const epPattern = new RegExp(
              `(?:^|[^0-9])${String(episode).padStart(2, '0')}(?:[^0-9]|$)|` +
              `(?:^|[^0-9])${episode}(?:[^0-9]|$)`
            )
            // Cek apakah ada file yang match nomor episode
            const hasEpisode = torrent.files.some(file => 
              epPattern.test(file.name || '')
            )
            if (!hasEpisode) return false
          }

          return true
        })
        .map(torrent => {
          // Hitung total size dengan aman
          const size = torrent.files?.reduce((prev, curr) => 
            prev + (curr.length || 0), 0
          ) || 0

          // Generate title yang informatif
          let title = ''
          if (torrent.files?.length === 1) {
            title = torrent.files[0].name || `${titles[0]} - Episode ${episode || '??'}`
          } else {
            const group = torrent.releaseGroup ? `[${torrent.releaseGroup}] ` : ''
            const dualAudio = torrent.dualAudio ? 'Dual Audio ' : ''
            const epInfo = episode ? `- ${String(episode).padStart(2, '0')}` : '(Batch)'
            title = `${group}${titles[0]} ${dualAudio}${epInfo}`.trim()
          }

          return {
            hash: torrent.infoHash,
            link: torrent.infoHash, // infoHash sebagai magnet link
            title,
            size,
            type: torrent.isBest ? 'best' : 'alt',
            date: new Date(torrent.created),
            seeders: 0, // SeaDex gak nyediain peer count
            leechers: 0,
            downloads: 0,
            accuracy: 'high'
          }
        })
        .sort((a, b) => {
          // Prioritaskan 'best' di atas 'alt'
          if (a.type === 'best' && b.type !== 'best') return -1
          if (a.type !== 'best' && b.type === 'best') return 1
          // Lalu sort by date terbaru
          return b.date - a.date
        })
    } catch (error) {
      // Handle network errors
      if (error.message.includes('fetch')) {
        throw new Error(
          'Gagal menghubungi SeaDex API.\n' +
          'Pastikan releases.moe dapat diakses dari jaringan Anda.\n' +
          'Error: ' + error.message
        )
      }
      throw error
    }
  }

  /** @type {import('./').SearchFunction} */
  async batch(query) {
    // Batch: cari semua episode, jangan filter per episode
    const batchQuery = { ...query }
    delete batchQuery.episode
    return this.single(batchQuery)
  }

  /** @type {import('./').SearchFunction} */
  async movie(query) {
    // Movie: gak ada episode number
    const movieQuery = { ...query }
    delete movieQuery.episode
    movieQuery.episodeCount = 1 // Movie cuma 1 file
    return this.single(movieQuery)
  }

  async test() {
    try {
      // Test dengan ID anime populer (One Piece = 21)
      const res = await fetch(
        `${this.url}?page=1&perPage=1&filter=alID%3D%2221%22&skipTotal=1&expand=trs`,
        { signal: AbortSignal.timeout(10000) } // Timeout 10 detik
      )

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`)
      }

      const data = await res.json()

      // Validasi struktur response
      if (!data || !Array.isArray(data.items)) {
        throw new Error('Response tidak valid: items bukan array')
      }

      if (data.items.length === 0) {
        throw new Error('Response kosong, API mungkin berubah')
      }

      const item = data.items[0]
      if (!item.expand?.trs || !Array.isArray(item.expand.trs)) {
        throw new Error('Struktur data trs tidak sesuai')
      }

      return true
    } catch (error) {
      // Error yang user-friendly
      if (error.name === 'TimeoutError' || error.name === 'AbortError') {
        throw new Error('SeaDex API timeout. Server mungkin lambat atau tidak dapat dijangkau.')
      }
      
      if (error.message.includes('fetch') || error.message.includes('NetworkError')) {
        throw new Error(
          'Tidak dapat terhubung ke SeaDex (releases.moe).\n' +
          'Kemungkinan penyebab:\n' +
          '• Situs diblokir oleh ISP\n' +
          '• Server sedang down\n' +
          '• Tidak ada koneksi internet\n\n' +
          'Coba gunakan VPN atau cek kembali nanti.'
        )
      }

      throw new Error(`SeaDex test gagal: ${error.message}`)
    }
  }
}()
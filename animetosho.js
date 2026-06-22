const QUALITIES = ['1080', '720', '540', '480']

export default new class Tosho {
  url = atob('aHR0cHM6Ly9mZWVkLmFuaW1ldG9zaG8ub3JnL2pzb24=')

  buildQuery({ resolution, exclusions }) {
    const parts = ['&qx=1']
    
    // Build exclusion query dengan aman
    if (exclusions?.length) {
      const exclusionStr = exclusions.join('"|"')
      parts.push(`&q=!("${exclusionStr}")`)
    }
    
    // Filter resolusi yang tidak diinginkan
    if (resolution && QUALITIES.includes(resolution)) {
      const excl = QUALITIES.filter(q => q !== resolution)
      if (excl.length) {
        parts.push(`!(*${excl.join('*|*')}*)`)
      }
    }
    
    return parts.join('')
  }

  /**
   * @param {import('./types').Tosho[]} entries
   * @param {Object} options
   * @returns {import('./').TorrentResult[]}
   **/
  map(entries, { batch = false, episode } = {}) {
    return entries
      .filter(entry => {
        // Filter episode number untuk single
        if (!batch && episode && entry.title) {
          const epPattern = new RegExp(
            `(?:^|[^0-9])${String(episode).padStart(2, '0')}(?:[^0-9]|$)|` +
            `(?:^|[^0-9])${episode}(?:[^0-9]|$)`
          )
          return epPattern.test(entry.title) || epPattern.test(entry.torrent_name || '')
        }
        return true
      })
      .map(entry => {
        // AnimeTosho kadang ngasih nilai seeders/leechers gede banget (bug)
        // Angka 30000+ biasanya berarti data gak valid
        const seeders = (entry.seeders || 0) >= 30000 ? 0 : (entry.seeders || 0)
        const leechers = (entry.leechers || 0) >= 30000 ? 0 : (entry.leechers || 0)
        
        // Tentukan akurasi: HIGH kalau ada anidb_fid (pasti match)
        const accuracy = entry.anidb_fid ? 'high' : 'medium'
        
        // Tentukan type
        let type = undefined
        if (batch) {
          type = 'batch'
        } else if (entry.title?.toLowerCase().includes('batch') || 
                   entry.torrent_name?.toLowerCase().includes('batch')) {
          type = 'batch'
        }

        return {
          title: entry.title || entry.torrent_name || 'Unknown',
          link: entry.magnet_uri || '',
          seeders,
          leechers,
          downloads: entry.torrent_downloaded_count || 0,
          hash: entry.info_hash || '',
          size: entry.total_size || 0,
          accuracy,
          type,
          date: new Date((entry.timestamp || 0) * 1000)
        }
      })
      .sort((a, b) => {
        // Sort: seeders terbanyak dulu
        if (b.seeders !== a.seeders) return b.seeders - a.seeders
        // Lalu date terbaru
        return b.date - a.date
      })
  }

  /** @type {import('./').SearchFunction} */
  async single({ anidbEid, episode, resolution, exclusions, fetch: hayaseFetch }) {
    if (!anidbEid) {
      throw new Error('AniDB Episode ID tidak tersedia. Pastikan anime terdaftar di AniDB.')
    }

    try {
      const query = this.buildQuery({ resolution, exclusions })
      const url = `${this.url}?eid=${anidbEid}${query}`
      const res = await fetch(url)

      if (!res.ok) {
        throw new Error(`AnimeTosho API error: HTTP ${res.status}`)
      }

      /** @type {import('./types').Tosho[]} */
      const data = await res.json()

      if (!Array.isArray(data)) {
        throw new Error('AnimeTosho mengembalikan format data yang tidak sesuai')
      }

      if (data.length === 0) return []

      return this.map(data, { episode })
    } catch (error) {
      if (error.message.includes('fetch') || error.message.includes('NetworkError')) {
        throw new Error(
          'Gagal menghubungi AnimeTosho.\n' +
          'Situs mungkin diblokir atau sedang down.\n' +
          'Coba gunakan VPN atau cek kembali nanti.'
        )
      }
      throw error
    }
  }

  /** @type {import('./').SearchFunction} */
  async batch({ anidbAid, resolution, episodeCount, exclusions, fetch: hayaseFetch }) {
    if (!anidbAid) {
      throw new Error('AniDB Anime ID tidak tersedia.')
    }
    if (episodeCount == null) {
      throw new Error('Jumlah episode tidak diketahui. Tidak bisa mencari batch.')
    }

    try {
      const query = this.buildQuery({ resolution, exclusions })
      const url = `${this.url}?order=size-d&aid=${anidbAid}${query}`
      const res = await fetch(url)

      if (!res.ok) {
        throw new Error(`AnimeTosho API error: HTTP ${res.status}`)
      }

      const rawData = await res.json()
      if (!Array.isArray(rawData)) {
        throw new Error('AnimeTosho mengembalikan format data yang tidak sesuai')
      }

      // Filter batch: file count >= episode count ATAU title mengandung "batch"
      const data = rawData.filter(entry => {
        const isBatchByFiles = entry.num_files >= episodeCount
        const isBatchByTitle = 
          entry.title?.toLowerCase().includes('batch') ||
          entry.torrent_name?.toLowerCase().includes('batch')
        return isBatchByFiles || isBatchByTitle
      })

      if (data.length === 0) return []

      return this.map(data, { batch: true })
    } catch (error) {
      if (error.message.includes('fetch') || error.message.includes('NetworkError')) {
        throw new Error(
          'Gagal menghubungi AnimeTosho.\n' +
          'Situs mungkin diblokir atau sedang down.\n' +
          'Coba gunakan VPN atau cek kembali nanti.'
        )
      }
      throw error
    }
  }

  /** @type {import('./').SearchFunction} */
  async movie({ anidbAid, resolution, exclusions, fetch: hayaseFetch }) {
    if (!anidbAid) {
      throw new Error('AniDB Anime ID tidak tersedia untuk film ini.')
    }

    try {
      const query = this.buildQuery({ resolution, exclusions })
      const url = `${this.url}?aid=${anidbAid}${query}`
      const res = await fetch(url)

      if (!res.ok) {
        throw new Error(`AnimeTosho API error: HTTP ${res.status}`)
      }

      /** @type {import('./types').Tosho[]} */
      const data = await res.json()

      if (!Array.isArray(data)) {
        throw new Error('AnimeTosho mengembalikan format data yang tidak sesuai')
      }

      if (data.length === 0) return []

      // Filter: movie biasanya dikit file-nya
      const movieData = data.filter(entry => 
        entry.num_files <= 5 || // Movie usually 1-3 files
        entry.title?.toLowerCase().includes('movie') ||
        entry.torrent_name?.toLowerCase().includes('movie')
      )

      return this.map(movieData.length ? movieData : data)
    } catch (error) {
      if (error.message.includes('fetch') || error.message.includes('NetworkError')) {
        throw new Error(
          'Gagal menghubungi AnimeTosho.\n' +
          'Situs mungkin diblokir atau sedang down.\n' +
          'Coba gunakan VPN atau cek kembali nanti.'
        )
      }
      throw error
    }
  }

  async test() {
    try {
      // Test dengan ID One Piece (aid=69)
      const res = await fetch(`${this.url}?aid=69&limit=1`, {
        signal: AbortSignal.timeout(10000) // Timeout 10 detik
      })

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`)
      }

      const data = await res.json()

      // Validasi struktur response
      if (!Array.isArray(data)) {
        throw new Error('Response bukan array. Format API mungkin berubah.')
      }

      if (data.length === 0) {
        throw new Error('Tidak ada hasil untuk query test. API mungkin bermasalah.')
      }

      // Validasi field penting
      const item = data[0]
      if (!item.info_hash && !item.magnet_uri) {
        throw new Error('Data torrent tidak lengkap (info_hash/magnet_uri tidak ada)')
      }

      return true
    } catch (error) {
      if (error.name === 'TimeoutError' || error.name === 'AbortError') {
        throw new Error(
          'AnimeTosho API timeout.\n' +
          'Server lambat atau tidak dapat dijangkau.\n' +
          'Coba lagi nanti atau gunakan VPN.'
        )
      }

      if (error.message.includes('fetch') || error.message.includes('NetworkError')) {
        throw new Error(
          'Tidak dapat terhubung ke AnimeTosho.\n\n' +
          'Kemungkinan:\n' +
          '• Situs diblokir ISP\n' +
          '• Server down\n' +
          '• Tidak ada internet\n\n' +
          'Solusi: Gunakan VPN atau coba extension lain (Nyaa/SubsPlease).'
        )
      }

      throw new Error(`AnimeTosho test gagal: ${error.message}`)
    }
  }
}()
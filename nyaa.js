export default new class Nyaa {
  base = 'https://torrent-search-api-livid.vercel.app/api/nyaasi/'

  /** @type {import('./').SearchFunction} */
  async single({ titles, episode, exclusions = [], resolution }) {
    if (!titles?.length) return []

    try {
      // JANGAN tambah episode ke query - bikin hasil gak akurat
      const query = titles[0].replace(/[^\w\s-]/g, ' ').trim()
      const url = `${this.base}${encodeURIComponent(query)}`

      const res = await fetch(url)
      if (!res.ok) return []

      const data = await res.json()
      if (!Array.isArray(data)) return []

      return this.map(data).filter(item => {
        const title = item.title.toLowerCase()

        // Filter exclusions (codec, source, dll)
        if (exclusions.some(e => title.includes(e.toLowerCase()))) {
          return false
        }

        // Filter resolusi kalau ditentukan
        if (resolution && !title.includes(resolution + 'p')) {
          return false
        }

        // Filter episode number - INI PENTING BANGET!
        if (episode) {
          const epNum = String(episode).padStart(2, '0')
          const patterns = [
            new RegExp(`(?:^|[^0-9])${epNum}(?:[^0-9]|$)`),        // - 02 atau E02
            new RegExp(`(?:^|[^0-9])${episode}(?:[^0-9]|$)`),       // - 2
            new RegExp(`(?:ep|e)${epNum}(?:[^0-9]|$)`, 'i'),        // EP02
            new RegExp(`#[${epNum}]`, 'i')                           // #02
          ]
          
          if (!patterns.some(pattern => pattern.test(title))) {
            return false
          }

          // Exclude batch releases untuk single search
          if (/(?:batch|complete|e\d{2,3}[-_]\d{2,3}|season)/i.test(title)) {
            return false
          }
        }

        return true
      })
    } catch {
      return []
    }
  }

  /** @type {import('./').SearchFunction} */
  async batch(query) {
    if (!query?.titles?.length) return []
    
    // Batch: jangan filter episode, tapi cari yang batch
    const batchQuery = { ...query }
    delete batchQuery.episode
    
    try {
      const title = batchQuery.titles[0].replace(/[^\w\s-]/g, ' ').trim()
      const url = `${this.base}${encodeURIComponent(title + ' batch')}`

      const res = await fetch(url)
      if (!res.ok) return []

      const data = await res.json()
      if (!Array.isArray(data)) return []

      return this.map(data).filter(item => {
        const title = item.title.toLowerCase()
        
        // Filter exclusions
        if (batchQuery.exclusions?.some(e => title.includes(e.toLowerCase()))) {
          return false
        }

        // Cari yang bener-bener batch
        return /(?:batch|complete|e\d{2,3}[-_]\d{2,3}|season)/i.test(title)
      })
    } catch {
      return []
    }
  }

  /** @type {import('./').SearchFunction} */
  async movie(query) {
    if (!query?.titles?.length) return []
    
    // Movie: tanpa episode number
    const movieQuery = { ...query }
    delete movieQuery.episode
    
    return this.single(movieQuery)
  }

  buildQuery(title, episode) {
    let query = title.replace(/[^\w\s-]/g, ' ').trim()
    // Episode ditambahkan hanya untuk single search
    if (episode) query += ` ${String(episode).padStart(2, '0')}`
    return query
  }

  map(data) {
    return data
      .filter(item => {
        // Skip entries tanpa magnet link
        if (!item.Magnet) return false
        
        // Skip entries dengan judul kosong
        if (!item.Name || item.Name.trim() === '') return false
        
        return true
      })
      .map(item => {
        const hash = item.Magnet?.match(/btih:([a-fA-F0-9]{40})/)?.[1] || ''
        const title = item.Name || ''
        
        // Deteksi tipe batch
        const isBatch = /(?:batch|complete|e\d{2,3}[-_]\d{2,3}|season)/i.test(title)

        return {
          title,
          link: item.Magnet || '',
          hash,
          seeders: this.safeInt(item.Seeders),
          leechers: this.safeInt(item.Leechers),
          downloads: this.safeInt(item.Downloads),
          size: this.parseSize(item.Size),
          date: this.parseDate(item.DateUploaded),
          // JANGAN set type 'alt' - biarin undefined aja
          type: isBatch ? 'batch' : undefined,
          accuracy: 'medium'
        }
      })
      .sort((a, b) => {
        // Sort by seeders > date
        if (b.seeders !== a.seeders) return b.seeders - a.seeders
        return b.date - a.date
      })
  }

  // Helper: parse integer dengan aman
  safeInt(value) {
    const num = parseInt(value)
    return isNaN(num) || num < 0 ? 0 : num
  }

  // Helper: parse size dengan aman
  parseSize(sizeStr) {
    if (!sizeStr || typeof sizeStr !== 'string') return 0
    
    const match = sizeStr.match(/([\d.]+)\s*(KiB|MiB|GiB|KB|MB|GB)/i)
    if (!match) return 0

    const value = parseFloat(match[1])
    if (isNaN(value)) return 0
    
    const unit = match[2].toUpperCase()

    switch (unit) {
      case 'KIB':
      case 'KB': return Math.round(value * 1024)
      case 'MIB':
      case 'MB': return Math.round(value * 1024 * 1024)
      case 'GIB':
      case 'GB': return Math.round(value * 1024 * 1024 * 1024)
      default: return 0
    }
  }

  // Helper: parse date dengan aman
  parseDate(dateStr) {
    if (!dateStr) return new Date()
    
    try {
      const date = new Date(dateStr)
      return isNaN(date.getTime()) ? new Date() : date
    } catch {
      return new Date()
    }
  }

  async test() {
    try {
      const res = await fetch(this.base + 'one piece', {
        signal: AbortSignal.timeout(10000)
      })

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`)
      }

      const data = await res.json()

      // Validasi format response
      if (!Array.isArray(data)) {
        throw new Error('Response bukan array. Format API mungkin berubah.')
      }

      if (data.length === 0) {
        throw new Error('Query test tidak mengembalikan hasil.')
      }

      // Validasi struktur item
      const item = data[0]
      if (!item.Name) {
        throw new Error('Struktur data tidak sesuai (Name tidak ditemukan).')
      }

      if (!item.Magnet && !item.Torrent) {
        throw new Error('Struktur data tidak sesuai (Magnet/Torrent tidak ditemukan).')
      }

      // Coba parse 1 item
      const result = this.map([item])
      if (result.length === 0) {
        throw new Error('Gagal memproses data dari API.')
      }

      return true
    } catch (error) {
      if (error.name === 'TimeoutError' || error.name === 'AbortError') {
        throw new Error(
          'Nyaa API timeout.\n' +
          'Server proxy lambat atau tidak merespons.\n' +
          'Coba lagi nanti.'
        )
      }

      if (error.message.includes('fetch') || error.message.includes('NetworkError')) {
        throw new Error(
          'Tidak dapat terhubung ke Nyaa API proxy.\n\n' +
          'Kemungkinan:\n' +
          '• Proxy server down\n' +
          '• Internet bermasalah\n' +
          '• Diblokir oleh ISP\n\n' +
          'Coba gunakan VPN atau extension lain (AnimeTosho/SubsPlease).'
        )
      }

      throw new Error(`Nyaa extension test gagal: ${error.message}`)
    }
  }
}()
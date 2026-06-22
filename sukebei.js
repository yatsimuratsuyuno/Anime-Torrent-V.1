export default new class Sukebei {
  base = 'https://sukebei.nyaa.si/api/v2'

  /** @type {import('./').SearchFunction} */
  async single({ titles, episode, exclusions = [], resolution }) {
    if (!titles?.length) return []

    try {
      const query = titles[0].replace(/[^\w\s-]/g, ' ').trim()
      const params = new URLSearchParams({
        q: query,
        s: 'seeders',
        o: 'desc'
      })
      const url = `${this.base}/search?${params}`

      const res = await fetch(url, {
        headers: { 'Accept': 'application/json' }
      })
      if (!res.ok) return []

      const data = await res.json()
      if (!data?.torrents || !Array.isArray(data.torrents)) return []

      return this.map(data.torrents).filter(item => {
        const title = item.title.toLowerCase()

        // Filter exclusions
        if (exclusions.some(e => title.includes(e.toLowerCase()))) {
          return false
        }

        // Filter resolusi
        if (resolution && !title.includes(resolution + 'p')) {
          return false
        }

        // Filter episode
        if (episode) {
          const epNum = String(episode).padStart(2, '0')
          const patterns = [
            new RegExp(`(?:^|[^0-9])${epNum}(?:[^0-9]|$)`),
            new RegExp(`(?:^|[^0-9])${episode}(?:[^0-9]|$)`),
            new RegExp(`(?:ep|e)${epNum}(?:[^0-9]|$)`, 'i')
          ]
          
          if (!patterns.some(p => p.test(title))) return false
          
          // Exclude batch
          if (/(?:batch|complete|e\d{2,3}[-_]\d{2,3})/i.test(title)) return false
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
    
    const batchQuery = { ...query }
    delete batchQuery.episode
    
    try {
      const title = batchQuery.titles[0].replace(/[^\w\s-]/g, ' ').trim()
      const params = new URLSearchParams({
        q: title,
        s: 'size',
        o: 'desc'
      })
      const url = `${this.base}/search?${params}`

      const res = await fetch(url, {
        headers: { 'Accept': 'application/json' }
      })
      if (!res.ok) return []

      const data = await res.json()
      if (!data?.torrents) return []

      return this.map(data.torrents).filter(item => {
        const title = item.title.toLowerCase()
        
        if (batchQuery.exclusions?.some(e => title.includes(e.toLowerCase()))) {
          return false
        }

        return /(?:batch|complete|e\d{2,3}[-_]\d{2,3}|collection)/i.test(title)
      })
    } catch {
      return []
    }
  }

  /** @type {import('./').SearchFunction} */
  async movie(query) {
    if (!query?.titles?.length) return []
    
    const movieQuery = { ...query }
    delete movieQuery.episode
    
    return this.single(movieQuery)
  }

  map(torrents) {
    return torrents
      .filter(item => {
        if (!item.hash && !item.magnet) return false
        if (!item.name || item.name.trim() === '') return false
        return true
      })
      .map(item => {
        const title = item.name || ''
        const isBatch = /(?:batch|complete|e\d{2,3}[-_]\d{2,3}|collection)/i.test(title)

        return {
          title,
          link: item.magnet || `magnet:?xt=urn:btih:${item.hash}`,
          hash: item.hash || '',
          seeders: this.safeInt(item.seeders),
          leechers: this.safeInt(item.leechers),
          downloads: this.safeInt(item.downloads),
          size: this.safeInt(item.filesize),
          date: new Date(item.timestamp * 1000 || Date.now()),
          type: isBatch ? 'batch' : undefined,
          accuracy: 'medium'
        }
      })
      .sort((a, b) => b.seeders - a.seeders || b.date - a.date)
  }

  safeInt(value) {
    const num = parseInt(value)
    return isNaN(num) || num < 0 ? 0 : num
  }

  async test() {
    try {
      const res = await fetch(`${this.base}/search?q=test&limit=1`, {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(10000)
      })

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`)
      }

      const data = await res.json()

      if (!data?.torrents || !Array.isArray(data.torrents)) {
        throw new Error('Response bukan format API Nyaa. API mungkin berubah.')
      }

      if (data.torrents.length === 0) {
        throw new Error('Tidak ada hasil. API mungkin bermasalah.')
      }

      const item = data.torrents[0]
      if (!item.name) {
        throw new Error('Struktur data tidak sesuai (name tidak ditemukan).')
      }

      const result = this.map([item])
      if (result.length === 0) {
        throw new Error('Gagal memproses data.')
      }

      return true
    } catch (error) {
      if (error.name === 'TimeoutError' || error.name === 'AbortError') {
        throw new Error(
          'Sukebei API timeout.\n' +
          'Server lambat atau tidak merespons.\n' +
          'Coba lagi nanti.'
        )
      }

      if (error.message.includes('fetch') || error.message.includes('NetworkError')) {
        throw new Error(
          'Tidak dapat terhubung ke Sukebei.\n\n' +
          'Kemungkinan:\n' +
          '• Situs diblokir ISP\n' +
          '• Server down\n' +
          '• Internet bermasalah\n\n' +
          'Gunakan VPN untuk mengakses Sukebei.'
        )
      }

      throw new Error(`Sukebei test gagal: ${error.message}`)
    }
  }
}()
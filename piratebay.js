export default new class PirateBay {
  base = 'https://torrent-search-api-livid.vercel.app/api/piratebay/'

  /** @type {import('./').SearchFunction} */
  async single({ titles, episode, exclusions = [], resolution }) {
    if (!titles?.length) return []

    try {
      const query = titles[0].replace(/[^\w\s-]/g, ' ').trim()
      const url = `${this.base}${encodeURIComponent(query)}`

      const res = await fetch(url)
      if (!res.ok) return []

      const data = await res.json()
      if (!Array.isArray(data)) return []

      return this.map(data).filter(item => {
        const title = item.title.toLowerCase()

        // Filter exclusions
        if (exclusions.some(e => title.includes(e.toLowerCase()))) {
          return false
        }

        // Filter resolusi
        if (resolution && !title.includes(resolution + 'p')) {
          return false
        }

        // Filter episode - PENTING!
        if (episode) {
          const epNum = String(episode).padStart(2, '0')
          const patterns = [
            new RegExp(`(?:^|[^0-9])${epNum}(?:[^0-9]|$)`),
            new RegExp(`(?:^|[^0-9])${episode}(?:[^0-9]|$)`),
            new RegExp(`(?:ep|e)${epNum}(?:[^0-9]|$)`, 'i'),
            new RegExp(`#${epNum}`, 'i')
          ]
          
          if (!patterns.some(pattern => pattern.test(title))) {
            return false
          }

          // Exclude batch
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
    
    const batchQuery = { ...query }
    delete batchQuery.episode
    
    try {
      const title = batchQuery.titles[0].replace(/[^\w\s-]/g, ' ').trim()
      const url = `${this.base}${encodeURIComponent(title + ' complete')}`

      const res = await fetch(url)
      if (!res.ok) return []

      const data = await res.json()
      if (!Array.isArray(data)) return []

      return this.map(data).filter(item => {
        const title = item.title.toLowerCase()
        
        if (batchQuery.exclusions?.some(e => title.includes(e.toLowerCase()))) {
          return false
        }

        return /(?:batch|complete|season|collection)/i.test(title)
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

  map(data) {
    return data
      .filter(item => {
        if (!item.Magnet) return false
        if (!item.Name || item.Name.trim() === '') return false
        return true
      })
      .map(item => {
        const hash = item.Magnet?.match(/btih:([a-fA-F0-9]{40})/)?.[1] || ''
        const title = item.Name || ''
        
        const isBatch = /(?:batch|complete|season|collection)/i.test(title)

        return {
          title,
          link: item.Magnet || '',
          hash,
          seeders: this.safeInt(item.Seeders),
          leechers: this.safeInt(item.Leechers),
          downloads: this.safeInt(item.Downloads),
          size: this.parseSize(item.Size),
          date: this.parseDate(item.DateUploaded),
          type: isBatch ? 'batch' : undefined,
          accuracy: 'low' // PirateBay emang low accuracy
        }
      })
      .sort((a, b) => b.seeders - a.seeders || b.date - a.date)
  }

  safeInt(value) {
    const num = parseInt(value)
    return isNaN(num) || num < 0 ? 0 : num
  }

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
      const res = await fetch(this.base + 'ubuntu', {
        signal: AbortSignal.timeout(10000)
      })

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`)
      }

      const data = await res.json()

      if (!Array.isArray(data)) {
        throw new Error('Response bukan array. API mungkin berubah.')
      }

      if (data.length === 0) {
        throw new Error('Tidak ada hasil. API mungkin bermasalah.')
      }

      const item = data[0]
      if (!item.Name && !item.Magnet) {
        throw new Error('Struktur data tidak dikenali.')
      }

      const result = this.map([item])
      if (result.length === 0) {
        throw new Error('Gagal memproses data.')
      }

      return true
    } catch (error) {
      if (error.name === 'TimeoutError' || error.name === 'AbortError') {
        throw new Error('PirateBay API timeout. Server lambat.')
      }

      if (error.message.includes('fetch') || error.message.includes('NetworkError')) {
        throw new Error(
          'Tidak dapat terhubung ke PirateBay API.\n\n' +
          'Kemungkinan:\n' +
          '• Proxy server down\n' +
          '• Internet bermasalah\n' +
          '• Diblokir ISP\n\n' +
          'PirateBay sering diblokir. Gunakan extension lain yang lebih stabil.'
        )
      }

      throw new Error(`PirateBay test gagal: ${error.message}`)
    }
  }
}()
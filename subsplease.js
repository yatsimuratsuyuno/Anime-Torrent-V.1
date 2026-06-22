export default new class SubsPlease {
  base = 'https://subsplease.org/api/'

  /** @type {import('./').SearchFunction} */
  async single({ titles, episode, exclusions = [], resolution }) {
    if (!titles?.length) return []

    try {
      // SubsPlease lebih akurat kalau search pake judul bersih
      const query = titles[0].replace(/[^\w\s-]/g, ' ').trim()
      const url = `${this.base}?f=search&tz=UTC&s=${encodeURIComponent(query)}`

      const res = await fetch(url)
      if (!res.ok) return []

      const data = await res.json()

      if (!data || typeof data !== 'object' || Object.keys(data).length === 0) {
        return []
      }

      let results = this.map(data)

      // Filter episode kalau ada
      if (episode) {
        results = results.filter(item => {
          const epStr = String(episode)
          const epPadded = String(episode).padStart(2, '0')
          
          // Ekstrak nomor episode dari title "[Show] - 1130"
          const epMatch = item.title.match(/-\s*(\d+)/)
          if (epMatch) {
            const foundEp = epMatch[1]
            return foundEp === epStr || foundEp === epPadded
          }
          
          return false
        })

        // Hapus batch dari hasil single
        results = results.filter(item => item.type !== 'batch')
      }

      // Filter exclusions
      if (exclusions.length) {
        results = results.filter(item => {
          const title = item.title.toLowerCase()
          return !exclusions.some(e => title.includes(e.toLowerCase()))
        })
      }

      // Filter resolusi
      if (resolution) {
        results = results.filter(item => {
          return item.title.toLowerCase().includes(resolution + 'p')
        })
      }

      return results
    } catch {
      return []
    }
  }

  /** @type {import('./').SearchFunction} */
  async batch(query) {
    if (!query?.titles?.length) return []
    
    try {
      const title = query.titles[0].replace(/[^\w\s-]/g, ' ').trim()
      const url = `${this.base}?f=search&tz=UTC&s=${encodeURIComponent(title)}`

      const res = await fetch(url)
      if (!res.ok) return []

      const data = await res.json()

      if (!data || typeof data !== 'object') return []

      // Batch: cari yang punya multiple episode
      const batchData = {}
      let hasMultiple = false

      for (const key in data) {
        batchData[key] = data[key]
        if (Object.keys(batchData).length > 1) {
          hasMultiple = true
          break
        }
      }

      // Kalau cuma 1 episode, bukan batch
      if (!hasMultiple && Object.keys(data).length <= 1) {
        return []
      }

      let results = this.map(data, true)

      // Filter exclusions
      if (query.exclusions?.length) {
        results = results.filter(item => {
          const t = item.title.toLowerCase()
          return !query.exclusions.some(e => t.includes(e.toLowerCase()))
        })
      }

      return results
    } catch {
      return []
    }
  }

  /** @type {import('./').SearchFunction} */
  async movie(query) {
    if (!query?.titles?.length) return []
    
    try {
      const title = query.titles[0].replace(/[^\w\s-]/g, ' ').trim()
      const url = `${this.base}?f=search&tz=UTC&s=${encodeURIComponent(title)}`

      const res = await fetch(url)
      if (!res.ok) return []

      const data = await res.json()

      if (!data || typeof data !== 'object') return []

      return this.map(data, false, true)
    } catch {
      return []
    }
  }

  map(data, isBatch = false, isMovie = false) {
    const results = []
    
    for (const key in data) {
      const item = data[key]
      
      // Skip kalau gak ada downloads
      if (!item.downloads || !Array.isArray(item.downloads)) continue

      for (const download of item.downloads) {
        const hash = download.magnet?.match(/btih:([a-fA-F0-9]{40})/)?.[1]
        if (!hash) continue

        const res = download.res || '?'
        const title = `${item.show} - ${item.episode} (${res}p) [SubsPlease]`

        // Tentukan type
        let type = undefined
        if (isBatch) type = 'batch'

        results.push({
          title,
          link: download.magnet,
          hash,
          seeders: 0,    // SubsPlease API gak kasih peer info
          leechers: 0,
          downloads: 0,
          size: this.parseSize(download.size),
          date: new Date(item.release_date || Date.now()),
          type,
          accuracy: 'high' // SubsPlease akurasinya tinggi karena official
        })
      }
    }

    return results.sort((a, b) => {
      // Sort by date terbaru dulu
      if (b.date - a.date !== 0) return b.date - a.date
      // Lalu resolusi tertinggi
      const resA = parseInt(a.title.match(/(\d+)p/)?.[1] || '0')
      const resB = parseInt(b.title.match(/(\d+)p/)?.[1] || '0')
      return resB - resA
    })
  }

  parseSize(sizeStr) {
    if (!sizeStr || typeof sizeStr !== 'string') return 0
    
    // SubsPlease format: "1.4 GiB" atau "734 MiB"
    const match = sizeStr.match(/([\d.]+)\s*(GiB|MiB|KiB|GB|MB|KB)/i)
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

  async test() {
    try {
      // Test dengan One Piece (selalu ada di SubsPlease)
      const res = await fetch(
        `${this.base}?f=search&tz=UTC&s=One%20Piece`,
        { signal: AbortSignal.timeout(10000) }
      )

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`)
      }

      const data = await res.json()

      if (!data || typeof data !== 'object') {
        throw new Error('Response bukan object. API mungkin berubah.')
      }

      if (Object.keys(data).length === 0) {
        throw new Error('Tidak ada hasil. API mungkin bermasalah.')
      }

      // Validasi struktur item
      const firstItem = data[Object.keys(data)[0]]
      if (!firstItem.show || !firstItem.downloads) {
        throw new Error('Struktur data tidak sesuai.')
      }

      if (!Array.isArray(firstItem.downloads) || firstItem.downloads.length === 0) {
        throw new Error('Data downloads kosong.')
      }

      // Test mapping
      const result = this.map(data)
      if (result.length === 0) {
        throw new Error('Gagal memproses data (magnet tidak ditemukan).')
      }

      return true
    } catch (error) {
      if (error.name === 'TimeoutError' || error.name === 'AbortError') {
        throw new Error('SubsPlease API timeout. Server lambat atau tidak merespons.')
      }

      if (error.message.includes('fetch') || error.message.includes('NetworkError')) {
        throw new Error(
          'Tidak dapat terhubung ke SubsPlease.\n\n' +
          'Kemungkinan:\n' +
          '• Situs diblokir ISP\n' +
          '• Server down\n' +
          '• Internet bermasalah\n\n' +
          'SubsPlease biasanya stabil. Coba lagi nanti.'
        )
      }

      throw new Error(`SubsPlease test gagal: ${error.message}`)
    }
  }
}()
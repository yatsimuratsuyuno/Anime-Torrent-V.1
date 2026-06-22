export default new class TokyoTosho {
  base = 'https://www.tokyotosho.info/rss.php'

  /** @type {import('./').SearchFunction} */
  async single({ titles, episode, exclusions = [], resolution }) {
    if (!titles?.length) return []

    try {
      const query = titles[0].replace(/[^\w\s-]/g, ' ').trim()
      const url = `${this.base}?terms=${encodeURIComponent(query)}`

      const res = await fetch(url)
      if (!res.ok) return []

      const text = await res.text()
      if (!text || text.length < 100) return []

      let results = this.parseRSS(text)

      // Filter episode
      if (episode) {
        const epNum = String(episode).padStart(2, '0')
        results = results.filter(item => {
          const title = item.title.toLowerCase()
          const patterns = [
            new RegExp(`(?:^|[^0-9])${epNum}(?:[^0-9]|$)`),
            new RegExp(`(?:^|[^0-9])${episode}(?:[^0-9]|$)`),
            new RegExp(`(?:ep|e)${epNum}(?:[^0-9]|$)`, 'i'),
            new RegExp(`#${epNum}`, 'i')
          ]
          
          if (!patterns.some(p => p.test(title))) return false
          
          // Exclude batch
          if (/(?:batch|complete|all\s*episodes|vol|volume)/i.test(title)) return false
          
          return true
        })
      }

      // Filter exclusions
      if (exclusions.length) {
        results = results.filter(item => {
          const t = item.title.toLowerCase()
          return !exclusions.some(e => t.includes(e.toLowerCase()))
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
      const url = `${this.base}?terms=${encodeURIComponent(title + ' batch')}`

      const res = await fetch(url)
      if (!res.ok) return []

      const text = await res.text()
      let results = this.parseRSS(text)

      // Filter cuma batch
      results = results.filter(item => {
        const t = item.title.toLowerCase()
        return /(?:batch|complete|all\s*episodes|vol|volume|collection)/i.test(t)
      })

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
    
    const movieQuery = { ...query }
    delete movieQuery.episode
    
    return this.single(movieQuery)
  }

  parseRSS(text) {
    const results = []
    
    // Regex yang lebih robust
    const itemRegex = /<item>([\s\S]*?)<\/item>/g
    const titleRegex = /<title><!\[CDATA\[(.*?)\]\]><\/title>/
    const linkRegex = /<link>(.*?)<\/link>/
    const descRegex = /<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/
    const pubDateRegex = /<pubDate>(.*?)<\/pubDate>/
    const categoryRegex = /<category>(.*?)<\/category>/g
    
    let match
    while ((match = itemRegex.exec(text)) !== null) {
      try {
        const itemContent = match[1]
        
        const titleMatch = itemContent.match(titleRegex)
        const linkMatch = itemContent.match(linkRegex)
        const descMatch = itemContent.match(descRegex)
        const pubDateMatch = itemContent.match(pubDateRegex)

        if (!titleMatch || !descMatch) continue

        const title = titleMatch[1]
        const description = descMatch[1]
        
        // Extract magnet link
        const magnetMatch = description.match(/magnet:\?xt=urn:btih:([a-fA-F0-9]{40})[^"'\s]*/i)
        if (!magnetMatch) continue

        const magnet = magnetMatch[0]
        const hash = magnetMatch[1].toLowerCase()

        // Extract size (format: "Size: 1.4 GiB" atau "1.4GB")
        const sizeMatch = description.match(/Size:\s*([\d.]+\s*(?:KiB|MiB|GiB|KB|MB|GB))/i)
        const size = sizeMatch ? this.parseSize(sizeMatch[1]) : 0

        // Extract date dari <pubDate> (format RSS standard)
        let date = new Date()
        if (pubDateMatch) {
          const parsed = new Date(pubDateMatch[1])
          if (!isNaN(parsed.getTime())) date = parsed
        }

        // Cek kategori
        const categories = []
        let catMatch
        while ((catMatch = categoryRegex.exec(itemContent)) !== null) {
          categories.push(catMatch[1].toLowerCase())
        }

        // Deteksi batch
        const isBatch = /(?:batch|complete|all\s*episodes|vol|volume|collection)/i.test(title)

        // Skip item tanpa hash
        if (!hash) continue

        results.push({
          title,
          link: magnet,
          hash,
          seeders: 0, // RSS gak nyediain peer info
          leechers: 0,
          downloads: 0,
          size,
          date,
          type: isBatch ? 'batch' : undefined,
          accuracy: 'medium'
        })
      } catch {
        // Skip item yang gagal diparse
        continue
      }
    }

    return results.sort((a, b) => b.date - a.date)
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

  async test() {
    try {
      const res = await fetch(this.base + '?terms=one%20piece', {
        signal: AbortSignal.timeout(15000) // RSS bisa lambat
      })

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`)
      }

      const text = await res.text()

      if (!text || text.length < 100) {
        throw new Error('Response kosong atau terlalu pendek.')
      }

      // Cek apakah ini valid RSS
      if (!text.includes('<rss') && !text.includes('<channel>')) {
        throw new Error('Response bukan RSS feed. API mungkin berubah.')
      }

      // Cek ada item
      if (!text.includes('<item>')) {
        throw new Error('Tidak ada item di RSS feed.')
      }

      // Test parsing
      const results = this.parseRSS(text)
      if (results.length === 0) {
        throw new Error(
          'Berhasil mendapatkan RSS tapi tidak bisa mengekstrak hasil.\n' +
          'Mungkin format RSS sudah berubah.'
        )
      }

      // Validasi hasil
      const first = results[0]
      if (!first.hash || !first.link) {
        throw new Error('Hasil parse tidak memiliki hash/magnet link.')
      }

      return true
    } catch (error) {
      if (error.name === 'TimeoutError' || error.name === 'AbortError') {
        throw new Error(
          'TokyoTosho RSS timeout.\n' +
          'Server lambat atau tidak merespons.\n' +
          'Coba lagi nanti.'
        )
      }

      if (error.message.includes('fetch') || error.message.includes('NetworkError')) {
        throw new Error(
          'Tidak dapat terhubung ke TokyoTosho.\n\n' +
          'Kemungkinan:\n' +
          '• Situs diblokir\n' +
          '• Server down\n' +
          '• Internet bermasalah\n\n' +
          'TokyoTosho sering lambat. Gunakan extension lain dulu.'
        )
      }

      throw new Error(`TokyoTosho test gagal: ${error.message}`)
    }
  }
}()
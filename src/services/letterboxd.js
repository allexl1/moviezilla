export const letterboxd = {
  async fetchUserWatchlist(username) {
    if (!username) return [];
    try {
      const res = await fetch(`/api/letterboxd/${encodeURIComponent(username)}`);
      if (!res.ok) throw new Error(`Status ${res.status}`);
      const xmlText = await res.text();

      const parser = new DOMParser();
      const xml = parser.parseFromString(xmlText, 'application/xml');
      const items = Array.from(xml.querySelectorAll('item'));

      return items.map((item) => {
        const title = item.querySelector('title')?.textContent || 'Untitled';
        const link = item.querySelector('link')?.textContent || '';
        const description = item.querySelector('description')?.textContent || '';
        
        // Extract poster from CDATA / img tags inside description
        const posterMatch = description.match(/src="([^"]+)"/);
        const poster = posterMatch ? posterMatch[1] : null;

        // Clean title & year (Letterboxd format: "Movie Name, Year")
        const parts = title.split(', ');
        const cleanTitle = parts.slice(0, -1).join(', ') || title;
        const year = parts[parts.length - 1] || '';

        return {
          id: link || title,
          title: cleanTitle,
          name: cleanTitle,
          release_date: year,
          poster_path: poster,
          media_type: 'movie',
          source: 'letterboxd'
        };
      });
    } catch (err) {
      console.warn('Failed to parse Letterboxd RSS:', err);
      return [];
    }
  }
};

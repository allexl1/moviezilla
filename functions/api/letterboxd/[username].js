export async function onRequestGet(context) {
  const { params } = context;
  const username = encodeURIComponent(String(params?.username || '').trim());

  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'public, max-age=1800', // Cache for 30 minutes
  };

  if (!username) {
    return new Response(JSON.stringify({ error: 'Username is required' }), {
      status: 400,
      headers,
    });
  }

  try {
    const rssUrl = `https://letterboxd.com/${username}/watchlist/rss/`;
    const res = await fetch(rssUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MovieZilla/2.0)',
      },
    });

    if (!res.ok) {
      return new Response(JSON.stringify({ error: `Letterboxd returned status ${res.status}` }), {
        status: res.status,
        headers,
      });
    }

    const xml = await res.text();

    // Regex extract titles and years from Letterboxd RSS items
    const items = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match;

    while ((match = itemRegex.exec(xml)) !== null) {
      const block = match[1];
      const titleMatch = /<letterboxd:filmTitle>([\s\S]*?)<\/letterboxd:filmTitle>/.exec(block);
      const yearMatch = /<letterboxd:filmYear>([\s\S]*?)<\/letterboxd:filmYear>/.exec(block);
      const linkMatch = /<link>([\s\S]*?)<\/link>/.exec(block);

      if (titleMatch) {
        items.push({
          title: titleMatch[1].trim(),
          year: yearMatch ? yearMatch[1].trim() : '',
          link: linkMatch ? linkMatch[1].trim() : '',
        });
      }
    }

    return new Response(JSON.stringify({ username, count: items.length, items }), {
      status: 200,
      headers,
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers,
    });
  }
}

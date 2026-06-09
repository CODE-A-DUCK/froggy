interface YouTubeStats {
  views: string | null;
  date: string | null;
  likes: string | null;
}

interface CacheEntry {
  data: YouTubeStats;
  timestamp: number;
}

const statsCache = new Map<string, CacheEntry>();
const CACHE_TTL = 1000 * 60 * 60 * 24; // 24小時快取

export async function getYouTubeStats(identifier: string): Promise<YouTubeStats> {
  const now = Date.now();
  const cached = statsCache.get(identifier);

  if (cached && (now - cached.timestamp < CACHE_TTL)) {
    return cached.data;
  }
  try {
    const res = await fetch(`https://www.youtube.com/watch?v=${identifier}`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36",
        "Accept-Language": "zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7",
      },
    });

    if (!res.ok) return { views: null, date: null, likes: null };
    const html = await res.text();
    const match = html.match(/var ytInitialData = (\{.*?\});/);

    if (!match || !match[1]) return { views: null, date: null, likes: null };

    const data = JSON.parse(match[1]);
    const videoDetails = data.contents?.twoColumnWatchNextResults?.results?.results?.contents?.[0]?.videoPrimaryInfoRenderer;

    let viewsStr = videoDetails?.viewCount?.videoViewCountRenderer?.viewCount?.simpleText ||
      videoDetails?.viewCount?.videoViewCountRenderer?.shortViewCount?.simpleText;

    if (viewsStr) {
      viewsStr = viewsStr.replace(/觀看次數：?/g, '').replace(/次/g, '').replace(/views?/ig, '').trim();
    }

    let dateStr = videoDetails?.dateText?.simpleText;
    if (dateStr) {
      dateStr = dateStr.replace(/Premiered\s*/i, '').trim();
    }

    const actions = videoDetails?.videoActions?.menuRenderer?.topLevelButtons;
    let likesStr = null;

    if (actions) {
      const likeButton = actions.find((a: any) => a.segmentedLikeDislikeButtonViewModel);
      if (likeButton) {
        likesStr = likeButton.segmentedLikeDislikeButtonViewModel?.likeButtonViewModel?.likeButtonViewModel?.toggleButtonViewModel?.toggleButtonViewModel?.defaultButtonViewModel?.buttonViewModel?.title;
      } else {
        const standardLike = actions.find((a: any) => a.toggleButtonRenderer?.defaultIcon?.iconType === 'LIKE');
        if (standardLike) {
          likesStr = standardLike.toggleButtonRenderer?.defaultText?.accessibility?.accessibilityData?.label;
        }
      }
    }

    if (likesStr) {
      likesStr = likesStr.replace(/喜歡次數：?/g, '').replace(/likes?/ig, '').replace(/和\s*[^個]+/g, '').trim();
    }

    const result: YouTubeStats = {
      views: viewsStr || null,
      date: dateStr || null,
      likes: likesStr || null
    };

    statsCache.set(identifier, { data: result, timestamp: now });

    // 定期清理過期的快取，避免記憶體洩漏
    if (statsCache.size > 1000) {
      for (const [key, value] of statsCache.entries()) {
        if (now - value.timestamp > CACHE_TTL) {
          statsCache.delete(key);
        }
      }
    }

    return result;
  } catch (err) {
    console.error("[YouTubeStats] Error fetching stats:", err);
    return { views: null, date: null, likes: null };
  }
}

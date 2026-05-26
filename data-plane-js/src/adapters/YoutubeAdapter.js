import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class YoutubeAdapter {
  async getMetadata(query) {
    const isUrl = query.startsWith('http');
    const searchArg = isUrl ? `"${query}"` : `ytsearch1:"${query}"`;
    
    try {
      const { stdout } = await execAsync(
        `yt-dlp ${searchArg} --dump-json --no-playlist --flat-playlist`
      );
      const data = JSON.parse(stdout);
      
      return {
        title: data.title,
        url: data.webpage_url || data.original_url || data.url,
        duration: data.duration,
        thumbnail: data.thumbnail,
        uploader: data.uploader || data.artist,
        view_count: data.view_count,
        like_count: data.like_count,
        upload_date: data.upload_date,
        description: data.description,
      };
    } catch (err) {
      console.error('[YoutubeAdapter] Error getting metadata:', err);
      throw err;
    }
  }

  async getStreamUrl(url) {
    try {
      const { stdout } = await execAsync(
        `yt-dlp -g -f "bestaudio/best" "${url}"`
      );
      return stdout.trim();
    } catch (err) {
      console.error('[YoutubeAdapter] Error getting stream URL:', err);
      throw err;
    }
  }
}

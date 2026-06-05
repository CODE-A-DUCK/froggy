export function formatUserFacingError(errorMsg: string | null | undefined): string {
  if (!errorMsg) return "發生未知錯誤";

  if (errorMsg.includes("FFMPEG_STALLED") || errorMsg.includes("音樂串流卡住"))
    return "播放串流中斷，請重試。";

  if (
    errorMsg.includes("confirm your age") ||
    errorMsg.includes("age-restricted") ||
    errorMsg.includes("Sign in to confirm your age")
  )
    return "此歌曲有年齡限制。";

  if (errorMsg.includes("Music Premium members"))
    return "此影片僅限 Premium 會員收聽。";

  if (
    errorMsg.includes("Video unavailable") ||
    errorMsg.includes("Private video")
  )
    return "影片無法使用或已設為私人。";

  if (errorMsg.includes("copyright claim"))
    return "影片因版權問題無法播放。";

  if (errorMsg.includes("ffmpeg exited with code"))
    return "播放程序發生錯誤。";

  return "此連結不支援或格式錯誤。\n若要搜尋歌曲，請使用 `/search`。";
}

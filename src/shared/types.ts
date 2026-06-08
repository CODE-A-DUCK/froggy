// 直接共用類別

export interface TrackEvent {
  guild_id: string;
  title?: string;
  source_url?: string;
  uploader?: string;
  duration?: number;
  position?: number;
  thumbnail?: string;
  views?: string | null;
  likes?: string | null;
  upload_date?: string | null;
  is_paused?: boolean;
  loop_state?: number;
  controller_user_id?: string;
  interaction_token?: string | null;
  text_channel_id?: string;
  is_update?: boolean;
  error?: string;
}

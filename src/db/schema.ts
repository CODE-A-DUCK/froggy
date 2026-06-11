import type { Generated, Insertable, Selectable, Updateable } from "kysely";

export interface Database {
  music_library: MusicLibraryTable;
  guild_config: GuildConfigTable;
}

export interface MusicLibraryTable {
  id: Generated<number>;
  user_id: string;
  title: string;
  url: string;
  added_at: Generated<Date>;
}

export type MusicLibrary = Selectable<MusicLibraryTable>;
export type NewMusicLibrary = Insertable<MusicLibraryTable>;
export type MusicLibraryUpdate = Updateable<MusicLibraryTable>;

export interface GuildConfigTable {
  guild_id: string;
  verify_role_id: string | null;
  kick_on_fail: boolean | null;
}

export type GuildConfig = Selectable<GuildConfigTable>;
export type NewGuildConfig = Insertable<GuildConfigTable>;
export type GuildConfigUpdate = Updateable<GuildConfigTable>;

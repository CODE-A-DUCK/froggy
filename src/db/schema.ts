import { Generated, Insertable, Selectable, Updateable } from 'kysely';

export interface Database {
  music_library: MusicLibraryTable;
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

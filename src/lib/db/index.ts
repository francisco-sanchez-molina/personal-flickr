/**
 * Re-export everything that used to live in `src/lib/db.ts`. Consumers
 * keep importing from `~/lib/db` and stay unaware of the directory
 * structure underneath.
 *
 * Side-effect imports establish the load order: `connection` opens the
 * database, `schema` runs migrations, then each entity module declares
 * its prepared statements. Most entity modules also import `./schema`
 * themselves (defensive) so they're independently safe to import too.
 */
import "./connection";
import "./schema";

export { db } from "./connection";

export type { Photo, PhotoUpsert } from "./photo";
export { photoQueries } from "./photo";

export type { Gallery, GallerySummary } from "./gallery";
export { galleryQueries } from "./gallery";

export type { Tag, TagSummary } from "./tag";
export { tagQueries } from "./tag";

export type { SmartAlbum, SmartFilter } from "./smart-album";
export { smartAlbumQueries, runSmartFilter } from "./smart-album";

export type { PhotoShare } from "./share";
export { shareQueries } from "./share";

export { search } from "./search";

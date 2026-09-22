import {ReviewStore} from '../lib/review-store';
// Explicit owner invocation only. Never imported from application startup.
const [path,confirmation]=process.argv.slice(2);
if(!path||confirmation!=='--confirm-additive-photo-migration')throw Error('Usage: tsx scripts/migrate-review-photos.ts <absolute-private-reviews.sqlite> --confirm-additive-photo-migration');
ReviewStore.migratePhotos(path);
console.log('Additive photo asset migration complete. Legacy rows and review_meta version retained.');

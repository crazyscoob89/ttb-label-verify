import { ReviewStore, reviewPath } from '../lib/review-store';
if(process.argv[2]!=='--create-new-private-review-store')throw Error('Explicit --create-new-private-review-store required. Never resets an existing store.');
ReviewStore.provision(reviewPath(process.env));
console.log('Provisioned new private review store. Shared demo identity only.');

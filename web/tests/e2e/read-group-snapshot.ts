import {DatabaseSync} from 'node:sqlite';
import {checkedPhotoRecord,type CompletePhotoComparison} from '../../lib/photo-record';
/** Read the immutable server snapshot after the browser has rendered the result.
 * This avoids replaying multipart uploads or racing Chromium's discarded response
 * body when the UI closes its completed fetch signal. No network interception. */
export function latestGroupSnapshot(path:string):{result:CompletePhotoComparison;comparisonId:string}{
 const db=new DatabaseSync(path,{readOnly:true});
 try{const row=db.prepare('SELECT id,record FROM snapshots ORDER BY rowid DESC LIMIT 1').get();if(!row)throw Error('No durable snapshot');const result=JSON.parse(String(row.record));if(!checkedPhotoRecord(result))throw Error('Invalid durable photo record');return {result,comparisonId:String(row.id)};}
 finally{db.close();}
}

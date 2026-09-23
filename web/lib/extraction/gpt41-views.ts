import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { MAX_IMAGE_BYTES, MAX_IMAGE_PIXELS, sanitizeImage } from '../intake';
import { MAX_GROUP_REQUEST_BYTES, photoIdSchema } from '../photo-contracts';

export type DetailRectangle = {left:number;top:number;width:number;height:number};
export type Gpt41DetailView = {
  bytes:Buffer;
  tag:{revision:'same-photo-quadrants-jpeg95-v2';photoId:string;view:'detail';sourceImageSha256:string;imageSha256:string;crop:DetailRectangle};
};
const hash=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');

/** Dimensions only: no label detection, product names, OCR or selected text ROIs.
 * Four corners, each 60% of BOTH axes, with 20% overlap along each axis.
 * Unlike full-width strips, this increases character scale at a fixed input
 * short-side resolution (~1/0.6); no provider preprocessing telemetry is assumed.
 * The exact full image remains for context; small images keep their prior path.
 */
export function gpt41DetailRectangles(width:number,height:number):DetailRectangle[] {
  if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||width*height>MAX_IMAGE_PIXELS)throw Error('Image pixel bound');
  if(width<768||height<=2048||height<width*2)return [];
  const w=Math.ceil(width*3/5),h=Math.ceil(height*3/5);
  return [0,height-h].flatMap(top=>[0,width-w].map(left=>({left,top,width:w,height:h})));
}

/** Caller owns a validated immutable normalized full photo. Crops are additional
 * same-photo views, never replacement evidence or independent photo identities.
 * Sequential bounded decodes; JPEG95 4:4:4 is a deterministic LOSSY derivative,
 * not a change to stored originals/normalized bytes. No resize or sharpening.
 * Reject (do not silently drop details or shrink text) if any budget is exceeded.
 */
export async function gpt41DetailViews(image:Buffer,photoId:string,width:number,height:number,signal?:AbortSignal):Promise<Gpt41DetailView[]> {
  photoIdSchema.parse(photoId);
  const rectangles=gpt41DetailRectangles(width,height),result:Gpt41DetailView[]=[];
  if(!rectangles.length)return result;
  const sourceImageSha256=hash(image);
  let totalBytes=image.length;
  for(const crop of rectangles){
    signal?.throwIfAborted();
    const source=sharp(image,{failOn:'warning',limitInputPixels:MAX_IMAGE_PIXELS,sequentialRead:true});
    const meta=await source.metadata();
    if(meta.width!==width||meta.height!==height||(meta.pages??1)!==1||(meta.orientation??1)!==1)throw Error('Invalid normalized dimensions');
    const bytes=await source.extract(crop).jpeg({quality:95,chromaSubsampling:'4:4:4'}).toBuffer();
    signal?.throwIfAborted();
    totalBytes+=bytes.length;
    if(bytes.length>MAX_IMAGE_BYTES||Math.ceil(totalBytes/3)*4>MAX_GROUP_REQUEST_BYTES-64*1024)throw Error('Detail byte bound');
    // Same sanitation policy as the full source; never use its re-encode as evidence.
    const checked=await sanitizeImage({filename:'detail.jpeg',mime:'image/jpeg',bytes});
    if(checked.width!==crop.width||checked.height!==crop.height)throw Error('Detail dimension mismatch');
    result.push({bytes,tag:{revision:'same-photo-quadrants-jpeg95-v2',photoId,view:'detail',sourceImageSha256,imageSha256:hash(bytes),crop}});
  }
  signal?.throwIfAborted();return result;
}

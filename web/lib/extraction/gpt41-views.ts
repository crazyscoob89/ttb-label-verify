import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { MAX_IMAGE_BYTES, MAX_IMAGE_PIXELS, sanitizeImage } from '../intake';
import { MAX_GROUP_REQUEST_BYTES, photoIdSchema } from '../photo-contracts';

export type DetailRectangle = {left:number;top:number;width:number;height:number};
export type Gpt41DetailView = {
  bytes:Buffer;
  tag:{revision:'same-photo-overlap-v1';photoId:string;view:'detail';sourceImageSha256:string;imageSha256:string;crop:DetailRectangle};
};
const hash=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');

/** Dimensions only: no label detection, product names, OCR or selected text ROIs.
 * Keep the whole short axis and 60% of the long axis, covering both ends with
 * 20% overlap. Small images retain the existing full-photo path. These views are
 * an attention aid, NOT a promise of higher provider pixel density: GPT-4.1's
 * short-side scaling can give the same density to full-width crops.
 */
export function gpt41DetailRectangles(width:number,height:number):DetailRectangle[] {
  if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||width*height>MAX_IMAGE_PIXELS)throw Error('Image pixel bound');
  if(width<768||height<=2048||height<width*2)return [];
  const span=Math.ceil(height*3/5);
  return [{left:0,top:0,width,height:span},{left:0,top:height-span,width,height:span}];
}

/** Caller owns a validated immutable normalized full photo. Crops are additional
 * same-photo views, never replacement evidence or independent photo identities.
 * Sequential bounded decodes; extract-only PNG preserves source decoded pixels.
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
    const bytes=await source.extract(crop).png({adaptiveFiltering:true,compressionLevel:6}).toBuffer();
    signal?.throwIfAborted();
    totalBytes+=bytes.length;
    if(bytes.length>MAX_IMAGE_BYTES||Math.ceil(totalBytes/3)*4>MAX_GROUP_REQUEST_BYTES-64*1024)throw Error('Detail byte bound');
    // Same sanitation policy as the full source; never use its re-encode as evidence.
    const checked=await sanitizeImage({filename:'detail.png',mime:'image/png',bytes});
    if(checked.width!==crop.width||checked.height!==crop.height)throw Error('Detail dimension mismatch');
    result.push({bytes,tag:{revision:'same-photo-overlap-v1',photoId,view:'detail',sourceImageSha256,imageSha256:hash(bytes),crop}});
  }
  signal?.throwIfAborted();return result;
}

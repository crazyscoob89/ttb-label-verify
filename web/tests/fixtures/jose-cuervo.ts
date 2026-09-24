import type { Application } from '../../lib/contracts';
import type { ExtractionEvidence, Observation } from '../../lib/extraction/schema';
import type { PhotoSetEvidence } from '../../lib/photo-contracts';
import { WARNING_REFERENCE } from '../../lib/rules';

// Transcribed from Alex's supplied UI incident (doc_d96d01a43cba_message.txt),
// NOT a retained provider response or an independently verified image extraction.
// Commodity/import flags were not serialized in the paste; distilled-spirits and
// imported=true below are explicit test assumptions, not recovered app metadata.
export const readable = (text:string):Observation => ({status:'readable',text,reason:'Reported visible text in supplied José Cuervo incident.'});
export const missing:Observation = {status:'missing',text:null,reason:'Warning not visible on front label'};
export const application:Application = {
 applicationId:'00003',applicationVersion:'1',brand:'Jose Cuervo',classType:'Tequila',abv:40,netContents:'1.75L',producerName:'La Rojena',producerAddress:'Jose Cuervo No.73, Tequila, Jalisco, 46400 Mexico',commodity:'distilled-spirits',imported:true,origin:{kind:'imported',country:'Mexico'},
};
export function incident():PhotoSetEvidence {
 const front:ExtractionEvidence={schemaVersion:1,brand:readable('Jose Cuervo'),classType:readable('Tequila Gold'),abv:{status:'unreadable',text:null,reason:'ABV not clearly visible in this front view'},netContents:readable('1.75 L'),producer:{name:readable('Jose Cuervo'),address:readable('Tequila, Mexico')},origin:readable('Hecho en Mexico'),warning:{heading:missing,body:missing,headingBold:null,bodyBold:null}};
 const back:ExtractionEvidence=structuredClone(front);
 back.netContents={status:'missing',text:null,reason:'No contributing net contents evidence reported for back.'};
 back.producer.address=readable('La Rojeña Jose Cuervo No. 73, Tequila, Jalisco, 46400 Mexico');
 back.origin=readable('Product of Mexico');
 back.warning={heading:readable(`${WARNING_REFERENCE.heading} ${WARNING_REFERENCE.body.toUpperCase()}`),body:{status:'missing',text:null,reason:'Body not populated; whole warning reported in heading.'},headingBold:true,bodyBold:null};
 return {schemaVersion:2,photos:[{photoId:'9c7b9132-2420-4523-985c-eadbba027c07',evidence:front},{photoId:'3bbb2551-e7d9-453a-b2fa-253258b6f8b8',evidence:back}]};
}

import {application,incident,readable} from './jose-cuervo';

// Reconstruction of the supplied UI paste, not the original provider JSON.
// Preserve the older scaffold and semantic-history.json verbatim. Unlike that
// scaffold, the paste names both views as net-contents sources. Back ABV/raw
// missing-body reasons were not serialized: inherited reasons are assumptions.
// Commodity/import flags remain the explicit assumptions in jose-cuervo.ts.
export const reportedWarning='GOVERNMENT WARNING: (1) ACCORDING TO THE SURGEON GENERAL, WOMEN SHOULD NOT DRINK ALCOHOLIC BEVERAGES DURING PREGNANCY BECAUSE OF THE RISK OF BIRTH DEFECTS. (2) CONSUMPTION OF ALCOHOLIC BEVERAGES IMPAIRS YOUR ABILITY TO DRIVE A CAR OR OPERATE MACHINERY, AND MAY CAUSE HEALTH PROBLEMS.';
export const incidentSources=[
 {role:'front',filename:'Jose Cuervo Front.jpeg',cacheName:'img_1db078dbf401.jpeg',bytes:102600,sha256:'498be58051837c0212dde09a37490cf21c9ffa412e31b1c2f8c6b820bac4e5db'},
 {role:'back',filename:'Jose Cuervo Back.jpeg',cacheName:'img_d88b4939cf8b.jpeg',bytes:113072,sha256:'735f6260d974f97ae95c3fc5c7739426ef1cb1a83316b4df96de8e2d8f5016ce'},
] as const;
export function bottleIncident(fictional=false){
 const evidence=incident(),app=structuredClone(application);
 evidence.photos[1].evidence.netContents=readable('1.75 L');
 evidence.photos[1].evidence.warning.heading=readable(reportedWarning);
 if(fictional){
  // A different invented bottle/entity proves the policy is not brand-specific.
  app.applicationId='FICTIONAL-AGAVE';app.brand='Cerro Claro';app.producerName='Destileria del Valle';
  app.producerAddress='Calle del Valle No.73, Tequila, Jalisco, 46400 Mexico';
  for(const p of evidence.photos){p.evidence.brand=readable(app.brand);p.evidence.producer.name=readable(app.brand);}
  evidence.photos[1].evidence.producer.address=readable('Destilería del Valle Calle del Valle No. 73, Tequila, Jalisco, 46400 Mexico');
 }
 return {application:app,evidence};
}

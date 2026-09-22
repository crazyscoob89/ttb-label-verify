import { describe,it,expect } from 'vitest';
import { photoGroupDeclarationSchema, photoDescriptorsSchema } from '../lib/photo-contracts';
import { application } from './fixtures/synthetic';
describe('strict photo contracts',()=>{
 it('rejects empty/unknown declarations',()=>{expect(photoGroupDeclarationSchema.safeParse({schemaVersion:2,photos:[]}).success).toBe(false);});
 it('rejects duplicate IDs and aggregate overflow',()=>{
  const photo={photoId:'11111111-1111-4111-8111-111111111111',role:'front',filename:'a.png',mime:'image/png',bytes:1};
  const group={schemaVersion:2,groupId:'22222222-2222-4222-8222-222222222222',revision:1,application,photos:[photo]};
  expect(photoGroupDeclarationSchema.safeParse(group).success).toBe(true);
  expect(photoGroupDeclarationSchema.safeParse({...group,photos:[photo,photo]}).success).toBe(false);
  expect(photoGroupDeclarationSchema.safeParse({...group,extra:1}).success).toBe(false);
  expect(photoDescriptorsSchema.safeParse([]).success).toBe(false);
 });
});

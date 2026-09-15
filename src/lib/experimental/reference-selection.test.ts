import { describe, expect, it } from 'vitest';
import { selectAvailableReference } from './reference-selection';
describe('available reference selection', () => {
  const elder = { id: 1, photo: Buffer.from('saved image') };
  const dad: { id: number; photo: Buffer | null } = { id: 5, photo: null };
  it('uses an available image when the requested persona has none', () => {
    expect(selectAvailableReference(dad, [dad, elder])).toBe(elder);
  });
  it('keeps a requested reference when available', () => {
    const own = { ...dad, photo: Buffer.from('own image') };
    expect(selectAvailableReference(own, [elder])).toBe(own);
  });
  it('is deterministic, ignores empty images, and never invents a character', () => {
    expect(selectAvailableReference(null, [{id:9,photo:Buffer.from('other')}, elder])).toBe(elder);
    expect(selectAvailableReference(dad, [{id:1,photo:Buffer.alloc(0)}])).toBeNull();
  });
});

describe('gender-specific references',()=>{
 const elder={id:1,name:'African Elder',handle:'elder-emeka',photo:Buffer.from('male reference')};
 const woman={id:7,name:'Suburban Mom',handle:'rosa-gut-calm',photo:Buffer.from('female reference')};
 it('chooses the matching photo instead of the first photo or conflicting requested persona',()=>{
  expect(selectAvailableReference(elder,[elder,woman],'female')).toBe(woman);
  expect(selectAvailableReference(woman,[elder,woman],'male')).toBe(elder);
  expect(selectAvailableReference(woman,[elder,woman],'female')).toBe(woman);
 });
 it('returns no photo when only the opposite or unknown references exist',()=>{
  expect(selectAvailableReference(elder,[elder,{id:9,name:'Custom',photo:Buffer.from('unknown')}],'female')).toBeNull();
 });
});
it('explicit description selects a named reference and refuses unrelated or ambiguous fallbacks',()=>{
 const elder={id:1,name:'African Elder',photo:Buffer.from('photo')};
 const dad={id:2,name:'Latino Dad',photo:Buffer.from('photo')};
 expect(selectAvailableReference(elder,[elder,dad],'male','Latino Dad with a beard')).toBe(dad);
 expect(selectAvailableReference(elder,[elder,dad],'male','unknown character')).toBeNull();
 expect(selectAvailableReference(elder,[elder,dad],'male','African Elder or Latino Dad')).toBeNull();
 expect(selectAvailableReference(elder,[elder,dad],'female','Latino Dad')).toBeNull();
});

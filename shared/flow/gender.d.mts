export type CharacterGender = 'male' | 'female';
export function normalizeCharacterGender(value: unknown): CharacterGender | null;
export function assetGender(name: string, profiles?: {character:string;voiceName:string;aliases:string[];type:string}[], presets?: Record<string,{type:string}>): CharacterGender | null;
export function lockGenderProfile<T extends {character:string;type:string}>(profile:T, gender:unknown, profiles:T[]): T & {genderLock?:CharacterGender};
export function applyGenderLock(prompt:string, gender:unknown):string;

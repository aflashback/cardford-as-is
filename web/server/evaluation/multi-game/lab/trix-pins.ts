import assert from 'node:assert/strict';

const variants=['basic-solo','basic-partners','complex-solo','complex-partners'] as const;

/** Public DTO versions and gameplay rules are independently pinned. */
export function trixPinForPublicSchema(variantId:string,publicSchemaVersion:string) {
 assert.ok(variants.some(variant=>variant===variantId),'Unsupported Trix variant');
 const partners=variantId.endsWith('partners');
 assert.ok(publicSchemaVersion==='1.0.0'||publicSchemaVersion==='1.2.0'||publicSchemaVersion==='1.1.0'&&partners,'Unsupported exact Trix public schema/variant pin');
 const moduleVersion=publicSchemaVersion==='1.0.0'?'2.0.0':publicSchemaVersion==='1.1.0'?'2.1.0':'2.2.0';
 const ruleVersion=publicSchemaVersion==='1.0.0'||!partners?'1.0.0':'1.1.0';
 return {gameId:'trix',variantId,moduleVersion,ruleProfileId:`trix-${variantId}-${ruleVersion}`,stateSchemaVersion:publicSchemaVersion,observationSchemaVersion:publicSchemaVersion,publicSchemaVersion,eventSchemaVersion:'1.0.0'};
}

export const trixNativeProfiles=variants.flatMap(variant=>[
 trixPinForPublicSchema(variant,'1.0.0'),
 ...(variant.endsWith('partners')?[trixPinForPublicSchema(variant,'1.1.0')]:[]),
 trixPinForPublicSchema(variant,'1.2.0'),
]);

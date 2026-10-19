import type { ModulePin } from '../../web/shared/contracts.ts';
import type { TrixScenarioPlayerPacket, TrixScenarioCampaignPlan } from './types.generated.d.mts';
export type { TrixScenarioPlayerPacket, TrixScenarioCampaignPlan, TrixScenarioPlayResponse, TrixScenarioDeclarationResponse } from './types.generated.d.mts';
export interface NativeRules { name: string; description: string; text: string; objective: string }
export function canonical(value: unknown): string;
export function digest(value: unknown): string;
export function displayCard(card: string, seat?: number): string;
export function nativeCard(card: string): string;
export function projectPlayerPacket(nativePacket: unknown, pin: ModulePin, revision: number, invocationId: string, rules: NativeRules): TrixScenarioPlayerPacket;
export function renderPrompt(packet: TrixScenarioPlayerPacket, phase: string, options?: { templateRoot?: string }): { bytes: Buffer; sha256: string };
export function resolveResponse(nativePacket: unknown, parsedResponse: unknown): string;
export function validatePlayerPacket(packet: unknown): TrixScenarioPlayerPacket;
export function validateCampaign(plan: unknown): TrixScenarioCampaignPlan;

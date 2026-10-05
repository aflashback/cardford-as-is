import { createRegistration, createRegistry, type InstalledHandlers } from '../game/kernel/registry.ts';
import { heartsModule, heartsAdapters, heartsDescriptor } from './hearts/module.ts';
import { spadesModuleFor, spadesAdaptersFor, spadesDescriptorFor } from './spades/module.ts';

/** Concrete typed branches only. No service receives an erased private state union. */
export const installedRegistrations = Object.freeze([
  createRegistration(heartsDescriptor, heartsModule, heartsAdapters),
  createRegistration(spadesDescriptorFor('solo'), spadesModuleFor('solo'), spadesAdaptersFor('solo')),
  createRegistration(
    spadesDescriptorFor('partners'),
    spadesModuleFor('partners'),
    spadesAdaptersFor('partners'),
  ),
]);
/** Pure facade and existing practice-table capabilities; HTTP V2 activation remains M04. */
export const installedHandlers: InstalledHandlers = Object.freeze({
  engine: Object.freeze(['actor', 'sealed', 'automatic', 'chance', 'round-boundary']),
  ui: Object.freeze(['hearts-table', 'spades-table']),
  schemas: Object.freeze([
    'hearts-state-v2',
    'hearts-observation-v2',
    'hearts-public-v2',
    'hearts-event-v2',
    'spades-state-2.0.0',
    'spades-observation-2.0.0',
    'spades-public-2.0.0',
    'spades-event-2.0.0',
  ]),
});
export const registeredSessions = createRegistry(installedRegistrations, installedHandlers);
export const createRegisteredSession = registeredSessions.createRegisteredSession;
export const decodeRegisteredDocument = registeredSessions.decodeDocument;

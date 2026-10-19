/* Generated from auth.schema.json. Do not edit; run npm run contracts:auth:generate. */

/**
 * Public authentication bootstrap. Provider tokens and identity credentials never enter this contract.
 */
export type AuthStatusView =
  | {
      mode: 'keycloak';
      authenticated: false;
      loginUrl: '/auth/login';
      logoutUrl: '/auth/logout';
      accountUrl: string;
      refreshUrl: '/auth/refresh';
      state: 'signed-out' | 'reauthentication-required';
    }
  | {
      mode: 'keycloak';
      authenticated: false;
      loginUrl: '/auth/login';
      logoutUrl: '/auth/logout';
      accountUrl: string;
      csrfToken: string;
      refreshUrl: '/auth/refresh';
      state: 'renewal-required';
      session: SessionLease;
    }
  | {
      mode: 'keycloak';
      authenticated: true;
      loginUrl: '/auth/login';
      logoutUrl: '/auth/logout';
      accountUrl: string;
      csrfToken: string;
      account: AuthenticatedPlayer;
      refreshUrl: '/auth/refresh';
      state: 'authenticated';
      session: SessionLease;
    };

export interface SessionLease {
  id: string;
  serverTime: string;
  accessExpiresAt: string;
  idleExpiresAt: string;
  absoluteExpiresAt: string;
}
export interface AuthenticatedPlayer {
  id: string;
  displayName: string;
  plan: 'free' | 'paid';
}

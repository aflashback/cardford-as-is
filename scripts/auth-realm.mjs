// Realm setup uses browser executions. Privileged magic-link/login-token REST APIs are never app login paths.
export function realmDefinition(c) {
  const execution = (authenticator, requirement = 'REQUIRED', priority = 10, extra = {}) => ({ authenticator, authenticatorFlow: false, requirement, priority, ...extra });
  const subflow = (flowAlias, requirement = 'REQUIRED', priority = 10) => ({ flowAlias, authenticatorFlow: true, requirement, priority });
  const flow = (alias, topLevel, authenticationExecutions, providerId = 'basic-flow') => ({ alias, topLevel, builtIn: false, providerId, authenticationExecutions });
  return {
    realm: 'cardford', displayName: 'CardFord local', enabled: true, sslRequired: 'all',
    registrationAllowed: true, registrationEmailAsUsername: true, loginWithEmailAllowed: true,
    duplicateEmailsAllowed: false, editUsernameAllowed: false, resetPasswordAllowed: false,
    rememberMe: false, verifyEmail: false, loginTheme: 'cardford', accountTheme: 'cardford',
    bruteForceProtected: true, permanentLockout: false, failureFactor: 5, waitIncrementSeconds: 60,
    minimumQuickLoginWaitSeconds: 60, maxFailureWaitSeconds: 900, maxDeltaTimeSeconds: 3600,
    accessTokenLifespan: 900, accessCodeLifespan: 60, accessCodeLifespanLogin: 300,
    ssoSessionIdleTimeout: 90 * 86400, ssoSessionMaxLifespan: 180 * 86400,
    revokeRefreshToken: true, refreshTokenMaxReuse: 0,
    eventsEnabled: true, eventsExpiration: 604800, adminEventsEnabled: true, adminEventsDetailsEnabled: false,
    smtpServer: { host: c.resources.gateway, port: '1026', from: 'noreply@cardford.test', fromDisplayName: 'CardFord local', auth: 'false', ssl: 'false', starttls: 'false' },
    browserFlow: 'cardford-browser', registrationFlow: 'cardford-registration',
    authenticatorConfig: [{ alias: 'cardford-email-otp', config: { 'ext-magic-create-nonexistent-user': 'false', 'ext-magic-email-otp-subject-with-code': 'false' } }],
    authenticationFlows: [
      flow('cardford-browser', true, [execution('auth-cookie', 'ALTERNATIVE', 10), subflow('cardford-email-forms', 'ALTERNATIVE', 20)]),
      flow('cardford-email-forms', false, [execution('auth-username-form', 'REQUIRED', 10), execution('cardford-bounded-email-otp', 'REQUIRED', 20, { authenticatorConfig: 'cardford-email-otp' }), subflow('cardford-second-factor', 'CONDITIONAL', 30)]),
      flow('cardford-second-factor', false, [execution('conditional-user-configured', 'REQUIRED', 10), execution('auth-otp-form', 'ALTERNATIVE', 20), execution('auth-recovery-authn-code-form', 'ALTERNATIVE', 30)]),
      flow('cardford-registration', true, [{ ...subflow('cardford-registration-form'), authenticator: 'registration-page-form' }, execution('cardford-bounded-email-otp', 'REQUIRED', 20, { authenticatorConfig: 'cardford-email-otp' })]),
      flow('cardford-registration-form', false, [execution('registration-user-creation', 'REQUIRED', 10)], 'form-flow'),
    ],
    requiredActions: [
      { alias: 'CONFIGURE_TOTP', name: 'Configure OTP', providerId: 'CONFIGURE_TOTP', enabled: true, defaultAction: false, priority: 10 },
      { alias: 'CONFIGURE_RECOVERY_AUTHN_CODES', name: 'Recovery Authentication Codes', providerId: 'CONFIGURE_RECOVERY_AUTHN_CODES', enabled: true, defaultAction: false, priority: 20 },
      { alias: 'VERIFY_EMAIL', name: 'Verify Email', providerId: 'VERIFY_EMAIL', enabled: true, defaultAction: false, priority: 30 },
    ],
    clients: [{ clientId: c.clientId, name: 'CardFord', enabled: true, protocol: 'openid-connect', publicClient: false,
      secret: c.clientSecret, standardFlowEnabled: true, implicitFlowEnabled: false, directAccessGrantsEnabled: false,
      serviceAccountsEnabled: false, fullScopeAllowed: false, rootUrl: c.origin, baseUrl: c.origin,
      redirectUris: [`${c.origin}/auth/callback`], webOrigins: [c.origin],
      attributes: { 'pkce.code.challenge.method': 'S256', 'post.logout.redirect.uris': `${c.origin}/`,
        'client.session.idle.timeout': String(90 * 86400), 'client.session.max.lifespan': String(180 * 86400),
        'backchannel.logout.url': 'https://cardford-db:4444/auth/backchannel-logout',
        'backchannel.logout.session.required': 'true' },
      defaultClientScopes: ['profile', 'email', 'roles', 'basic', 'web-origins'], optionalClientScopes: [],
    }],
    users: ['player', 'second'].map(name => ({ username: `${name}@cardford.test`, email: `${name}@cardford.test`, emailVerified: false, enabled: true, firstName: name, lastName: 'Local' })),
  };
}

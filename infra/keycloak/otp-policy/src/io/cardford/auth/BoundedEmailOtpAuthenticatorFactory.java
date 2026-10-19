package io.cardford.auth;

import io.phasetwo.keycloak.magic.auth.EmailOtpAuthenticatorFactory;
import org.keycloak.authentication.Authenticator;
import org.keycloak.models.KeycloakSession;

public final class BoundedEmailOtpAuthenticatorFactory extends EmailOtpAuthenticatorFactory {
    @Override public String getId() { return "cardford-bounded-email-otp"; }
    @Override public String getDisplayType() { return "CardFord bounded Email OTP"; }
    @Override public String getHelpText() { return "Phase Two email OTP with an absolute 300-second lifetime, five attempts and 60-second resend cooldown."; }
    @Override public Authenticator create(KeycloakSession session) { return new BoundedEmailOtpAuthenticator(); }
}

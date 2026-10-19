package io.cardford.auth;

import io.phasetwo.keycloak.magic.auth.EmailOtpAuthenticator;
import jakarta.ws.rs.core.MultivaluedMap;
import org.keycloak.authentication.AuthenticationFlowContext;
import org.keycloak.authentication.AuthenticationFlowError;
import org.keycloak.common.util.Time;

/**
 * Policy wrapper only: the unmodified Phase Two provider still generates, sends and verifies codes.
 * The code's birth time belongs to this authentication session and cannot slide on form refresh.
 */
public final class BoundedEmailOtpAuthenticator extends EmailOtpAuthenticator {
    private static final String CODE = "user-auth-note-otp-code";
    private static final String ISSUED = "cardford-email-otp-issued";
    private static final String SENT = "cardford-email-otp-last-sent";
    private static final String ATTEMPTS = "cardford-email-otp-attempts";
    private long note(AuthenticationFlowContext context, String name) {
        try { return Long.parseLong(context.getAuthenticationSession().getAuthNote(name)); }
        catch (RuntimeException ignored) { return 0; }
    }
    private String code(AuthenticationFlowContext context) { return context.getAuthenticationSession().getAuthNote(CODE); }
    private void invalidate(AuthenticationFlowContext context) {
        context.getAuthenticationSession().removeAuthNote(CODE);
        context.getAuthenticationSession().removeAuthNote(ISSUED);
        context.getAuthenticationSession().removeAuthNote(ATTEMPTS);
    }
    private void recordNewCode(AuthenticationFlowContext context) {
        if (code(context) != null && note(context, ISSUED) == 0) {
            String now = Long.toString(Time.currentTime());
            context.getAuthenticationSession().setAuthNote(ISSUED, now);
            context.getAuthenticationSession().setAuthNote(SENT, now);
            context.getAuthenticationSession().setAuthNote(ATTEMPTS, "0");
        }
    }
    private void challenge(AuthenticationFlowContext context, String message, boolean failure) {
        var response = context.form().setExecution(context.getExecution().getId()).setError(message).createForm("otp-form.ftl");
        if (failure) context.failureChallenge(AuthenticationFlowError.INVALID_CREDENTIALS, response);
        else context.challenge(response);
    }
    @Override public void authenticate(AuthenticationFlowContext context) {
        long now = Time.currentTime();
        if (code(context) != null && EmailOtpPolicy.expired(note(context, ISSUED), now)) invalidate(context);
        if (code(context) == null && !EmailOtpPolicy.maySend(note(context, SENT), now)) {
            challenge(context, "Please wait 60 seconds before requesting another code.", false); return;
        }
        super.authenticate(context);
        recordNewCode(context);
    }
    @Override public void action(AuthenticationFlowContext context) {
        long now = Time.currentTime();
        MultivaluedMap<String,String> form = context.getHttpRequest().getDecodedFormParameters();
        if (form.containsKey("resend")) {
            if (!EmailOtpPolicy.maySend(note(context, SENT), now)) {
                challenge(context, "Please wait 60 seconds before requesting another code.", false); return;
            }
            invalidate(context);
            super.action(context);
            recordNewCode(context); return;
        }
        if (code(context) == null || EmailOtpPolicy.expired(note(context, ISSUED), now)) {
            invalidate(context);
            challenge(context, "This code has expired. Request a new code.", false); return;
        }
        String candidate = form.getFirst("otp");
        if (!code(context).equals(candidate)) {
            int attempts = (int) Math.min(EmailOtpPolicy.MAX_ATTEMPTS, note(context, ATTEMPTS) + 1);
            context.getAuthenticationSession().setAuthNote(ATTEMPTS, Integer.toString(attempts));
            if (EmailOtpPolicy.exhausted(attempts)) {
                invalidate(context);
                challenge(context, "Too many attempts. Request a new code after 60 seconds.", true); return;
            }
        }
        super.action(context);
        // The provider owns email verification and removes its code on success. Never issue another here.
        if (code(context) == null) invalidate(context);
    }
}

package io.cardford.auth;

/** Small policy object shared by the browser authenticator and a dependency-free executable test. */
public final class EmailOtpPolicy {
    public static final long LIFETIME_SECONDS = 300;
    public static final long RESEND_SECONDS = 60;
    public static final int MAX_ATTEMPTS = 5;
    private EmailOtpPolicy() {}
    public static boolean expired(long issuedAt, long now) { return issuedAt <= 0 || now < issuedAt || now - issuedAt >= LIFETIME_SECONDS; }
    public static boolean maySend(long lastSent, long now) { return lastSent <= 0 || (now >= lastSent && now - lastSent >= RESEND_SECONDS); }
    public static boolean exhausted(int attempts) { return attempts >= MAX_ATTEMPTS; }
}

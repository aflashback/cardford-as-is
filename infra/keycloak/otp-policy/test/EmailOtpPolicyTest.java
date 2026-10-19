import io.cardford.auth.EmailOtpPolicy;

public final class EmailOtpPolicyTest {
    private static void require(boolean value) { if (!value) throw new AssertionError("Email OTP policy failed"); }
    public static void main(String[] args) {
        require(!EmailOtpPolicy.expired(1000, 1299));
        require(EmailOtpPolicy.expired(1000, 1300));
        require(EmailOtpPolicy.expired(1000, 1400));
        require(EmailOtpPolicy.expired(1000, 999));
        require(EmailOtpPolicy.expired(0, 1000));
        require(!EmailOtpPolicy.maySend(1000, 1059));
        require(EmailOtpPolicy.maySend(1000, 1060));
        require(!EmailOtpPolicy.maySend(1000, 999));
        require(EmailOtpPolicy.maySend(0, 1000));
        require(!EmailOtpPolicy.exhausted(4));
        require(EmailOtpPolicy.exhausted(5));
        require(EmailOtpPolicy.exhausted(6));
        System.out.println("Email OTP policy: 12 focused boundary assertions passed.");
    }
}

package http

import (
	"context"
	"net/http/httptest"
	"strings"
	"testing"
)

// Access can expire after the auth adapter's preflight, during a gameplay call.
// The shared transport must preserve renewable expiry and the remembered cookie.
func TestAuthRenewalRequiredTransportPreservesCookie(t *testing.T) {
	h := localHandler(t, func(context.Context, Request) (Response, error) {
		return Response{}, &LocalError{Status: 401, Code: "session_renewal_required"}
	}, LocalOptions{})
	w := httptest.NewRecorder()
	h.ServeHTTP(w, localRequest("GET", "/api/identity", ""))
	if w.Code != 401 || !strings.Contains(w.Body.String(), `"code":"session_renewal_required"`) {
		t.Fatalf("renewable expiry became terminal/unavailable: %d %s", w.Code, w.Body.String())
	}
	if len(w.Result().Cookies()) != 0 {
		t.Fatal("renewable access expiry cleared the remembered credential")
	}
}

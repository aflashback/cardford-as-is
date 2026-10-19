package http

import (
	"net/http/httptest"
	"testing"
)

func TestCoachUIRoutesStayAuthenticatedAndBounded(t *testing.T) {
	for _, c := range []struct{ method, path, input, output string }{
		{"GET", "/api/platform/coach", "", "CoachUIStatusView"},
		{"POST", "/api/platform/coach/sessions", "CoachUIStartRequest", "CoachUISessionView"},
		{"GET", "/api/platform/coach/sessions/session-1", "", "CoachUISessionView"},
		{"POST", "/api/platform/coach/items", "CoachUIItemRequest", "CoachUISessionView"},
		{"GET", "/api/platform/coach/items/item-1/replay", "", "CoachUIReplayView"},
		{"POST", "/api/platform/coach/feedback", "CoachUIFeedbackRequest", "CoachUIFeedbackView"},
	} {
		route, _, ok := matchLocalRoute(httptest.NewRequest(c.method, c.path, nil))
		if !ok || route.public || route.input != c.input || route.output != c.output {
			t.Fatalf("missing authenticated route %s %s: %+v", c.method, c.path, route)
		}
	}
	for _, path := range []string{"/api/platform/coach/items/a/b/replay", "/api/platform/coach/sessions/a/b"} {
		if _, _, ok := matchLocalRoute(httptest.NewRequest("GET", path, nil)); ok {
			t.Fatalf("accepted malformed resource %s", path)
		}
	}
}

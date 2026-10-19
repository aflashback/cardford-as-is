package contracts

import (
	"encoding/json"
	"testing"
)

func TestTrixTwoAnnouncementContract(t *testing.T) {
	for _, raw := range []string{
		`{"status":"hidden","counts":[1,1,1,1]}`,
		`{"status":"revealed","cards":[{"seat":0,"card":"C2"},{"seat":1,"card":"D2"},{"seat":2,"card":"H2"},{"seat":3,"card":"S2"}]}`,
	} {
		if err := Validate("TrixTwoAnnouncements", json.RawMessage(raw)); err != nil {
			t.Fatal(err)
		}
	}
	for _, raw := range []string{
		`null`, `{"status":"hidden","counts":[1,1,1]}`, `{"status":"hidden","counts":[1,1,1,5]}`,
		`{"status":"hidden","counts":[1,1,1,1],"cards":[]}`,
		`{"status":"hidden","counts":[1,1,1,1],"owners":[0,1,2,3]}`,
		`{"status":"revealed","cards":[]}`, `{"status":"revealed","counts":[1,1,1,1],"cards":[]}`,
		`{"status":"revealed","cards":[{"seat":0,"card":"CK"},{"seat":1,"card":"D2"},{"seat":2,"card":"H2"},{"seat":3,"card":"S2"}]}`,
	} {
		if err := Validate("TrixTwoAnnouncements", json.RawMessage(raw)); err == nil {
			t.Fatalf("accepted malformed announcement: %s", raw)
		}
	}
}

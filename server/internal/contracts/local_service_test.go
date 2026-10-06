package contracts

import "testing"

func TestLocalServiceClosedContracts(t *testing.T) {
	tests := []struct {
		name, raw string
		valid     bool
	}{
		{"LocalServiceNewSessionRequest", `{"commandId":"start","selector":{"gameId":"hearts","variantId":"solo","moduleVersion":"1.0.0","ruleProfileId":"hearts-training-1.0.0"},"expectedActiveGameId":null,"expectedRevision":null,"controlLeaseToken":null}`, true},
		{"LocalServiceNewSessionRequest", `{"commandId":"start","ownerId":"forged","selector":{"gameId":"hearts","variantId":"solo","moduleVersion":"1.0.0","ruleProfileId":"hearts-training-1.0.0"},"expectedActiveGameId":null,"expectedRevision":null,"controlLeaseToken":null}`, false},
		{"LocalServiceControlRequest", `{"commandId":"control","gameId":"game","expectedRevision":0,"expectedControlGeneration":1}`, true},
		{"LocalServiceControlRequest", `{"commandId":"control","gameId":"game","expectedRevision":9007199254740992,"expectedControlGeneration":1}`, false},
		{"LocalServiceSessionView", `{"serviceSchemaVersion":"1.0.0","activeGameId":null,"session":null}`, true},
		{"LocalServiceNode", `{"kind":"chance","phase":"draw","requestId":"draw-2","request":{"deck":["SA"]}}`, false},
		{"LocalServiceActionRequest", `{"commandId":"act","gameId":"game","expectedRevision":0,"controlLeaseToken":"lease","candidateId":"play:C2","preparedDecisionId":"prepared","preparedWorkIds":["prepared"]}`, true},
		{"LocalServiceActionRequest", `{"commandId":"act","gameId":"game","expectedRevision":0,"controlLeaseToken":"lease","candidateId":"play:C2","preparedDecisionId":"prepared","seat":2}`, false},
		{"LocalServicePrepareRequest", `{"gameId":"game","expectedRevision":0,"controlLeaseToken":"lease","purpose":"bot-action"}`, true},
		{"LocalServicePrepareRequest", `{"gameId":"game","expectedRevision":0,"controlLeaseToken":"lease","purpose":"bot-action","commandId":"unbound"}`, false},
	}
	for _, test := range tests {
		t.Run(test.name+test.raw, func(t *testing.T) {
			err := Validate(test.name, []byte(test.raw))
			if (err == nil) != test.valid {
				t.Fatalf("valid=%v, error=%v", test.valid, err)
			}
		})
	}
}

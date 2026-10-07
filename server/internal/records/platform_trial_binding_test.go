package records

import (
	"encoding/json"
	"testing"
)

func TestPlatformTrialBindingRequiresOriginalIDsAndCompletedResult(t *testing.T) {
	j := PlatformTrialJob{CommandID: "command", GameID: "game", SourceRevision: 1, LiveRevision: 2, Status: "running", Request: json.RawMessage(`{"commandId":"command","gameId":"game","expectedRevision":2,"controlLeaseToken":"fixture","decisionId":"game:decision:1","trialId":"trial","alternativeCandidateId":"play:C2"}`)}
	if err := validatePlatformTrialBinding(j); err != nil {
		t.Fatal(err)
	}
	result := json.RawMessage(`{"trialId":"trial","decisionId":"game:decision:1","label":"Possible continuation","liveRevision":2,"frames":[]}`)
	for _, test := range []struct {
		name   string
		change func(*PlatformTrialJob)
	}{
		{"completed without output", func(v *PlatformTrialJob) { v.Status = "completed" }},
		{"running with output", func(v *PlatformTrialJob) { v.Result = result }},
		{"substituted game", func(v *PlatformTrialJob) { v.GameID = "other" }},
		{"substituted source", func(v *PlatformTrialJob) { v.SourceRevision = 0 }},
		{"substituted live revision", func(v *PlatformTrialJob) { v.LiveRevision = 3 }},
	} {
		t.Run(test.name, func(t *testing.T) {
			bad := j
			test.change(&bad)
			if validatePlatformTrialBinding(bad) == nil {
				t.Fatal("invalid binding accepted")
			}
		})
	}
	j.Status = "completed"
	j.Result = result
	if err := validatePlatformTrialBinding(j); err != nil {
		t.Fatal(err)
	}
	j.Result = json.RawMessage(`{"trialId":"another-trial","decisionId":"game:decision:1","label":"Possible continuation","liveRevision":2,"frames":[]}`)
	if validatePlatformTrialBinding(j) == nil {
		t.Fatal("another trial's saved output accepted")
	}
}

func TestPlatformAssistanceConsumesHelpAtNextChoiceIncludingForced(t *testing.T) {
	choices := map[int64]string{3: "forced", 10: "choice", 20: "choice"}
	help := map[int64]int{1: 3, 4: 1, 8: 2, 21: 3}
	levels := PlatformAssistance(choices, help)
	if levels[3] != 3 || levels[10] != 2 || levels[20] != 0 {
		t.Fatalf("help was shifted or applied retroactively: %v", levels)
	}
}

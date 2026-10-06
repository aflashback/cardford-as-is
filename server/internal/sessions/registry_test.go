package sessions

import (
	"cardford/server/internal/contracts"
	"cardford/server/internal/gamekernel"
	"encoding/json"
	"reflect"
	"testing"
)

func testRegistry(t *testing.T) *Registry {
	t.Helper()
	r, err := NewRegistry()
	if err != nil {
		t.Fatal(err)
	}
	return r
}
func testSelector(mode string) Selector {
	if mode == "hearts" {
		return Selector{"hearts", "solo", "2.0.0", "hearts-training-1.0.0"}
	}
	if mode == "spades-solo" {
		return Selector{"spades", "solo", "2.0.0", "spades-solo-training-1.0.0"}
	}
	return Selector{"spades", "partners", "2.0.0", "spades-training-1.0.0"}
}
func testMaterial(t *testing.T) json.RawMessage {
	t.Helper()
	deck := []string{}
	for _, s := range []string{"C", "D", "H", "S"} {
		for _, r := range []string{"2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"} {
			deck = append(deck, s+r)
		}
	}
	raw, err := json.Marshal(map[string]any{"kind": "deal", "deck": deck})
	if err != nil {
		t.Fatal(err)
	}
	return raw
}
func testStart(t *testing.T, r *Registry, mode string) gamekernel.BoundSession {
	t.Helper()
	s, err := r.CreateRegisteredSession(testSelector(mode), json.RawMessage(`{"id":"session-test","dealer":0}`), testMaterial(t))
	if err != nil {
		t.Fatal(err)
	}
	return s
}
func TestRegistryExactCapabilitiesAndPolicySupport(t *testing.T) {
	r := testRegistry(t)
	handlers := DefaultHandlers()
	if len(r.Catalog(handlers.Engine, handlers.UI)) != 3 {
		t.Fatal("missing installed catalog")
	}
	catalog := r.Catalog(handlers.Engine, handlers.UI)
	catalog[0].Variants[0].Competition.Competitors[0].Seats[0] = 3
	if r.Catalog(handlers.Engine, handlers.UI)[0].Variants[0].Competition.Competitors[0].Seats[0] != 0 {
		t.Fatal("catalog mutation escaped")
	}
	if len(r.Catalog([]string{"actor"}, handlers.UI)) != 0 {
		t.Fatal("catalog enabled without complete lifecycle")
	}
	missing := DefaultHandlers()
	missing.Engine = []string{"actor", "automatic", "chance", "round-boundary"}
	if _, err := NewRegistryWithHandlers(missing); err == nil {
		t.Fatal("sealed capability silently omitted")
	}
	missing = DefaultHandlers()
	missing.Schemas = missing.Schemas[1:]
	if _, err := NewRegistryWithHandlers(missing); err == nil {
		t.Fatal("schema silently omitted")
	}
	missing = DefaultHandlers()
	missing.UI = []string{"spades-table"}
	restricted, err := NewRegistryWithHandlers(missing)
	if err != nil {
		t.Fatal(err)
	}
	if len(restricted.Catalog(handlers.Engine, handlers.UI)) != 2 {
		t.Fatal("uninstalled UI exposed Hearts")
	}
	if _, err = restricted.CreateRegisteredSession(testSelector("hearts"), []byte(`{"id":"x","dealer":0}`), testMaterial(t)); err == nil {
		t.Fatal("created missing UI branch")
	}
	for _, mode := range []string{"hearts", "spades-solo", "spades-partners"} {
		selector := testSelector(mode)
		policy := "spades-tactics-2.1.0"
		if mode == "hearts" {
			policy = "hearts-baseline-1.0.0"
		}
		support, err := r.PolicySupport(selector, policy)
		if err != nil || !support.Executable {
			t.Fatalf("default policy: %+v %v", support, err)
		}
		for _, optional := range []string{"unknown", "spades-plan-1.0.0", "hearts-plan-1.0.0", "local-baseline-1.0.0"} {
			support, err = r.PolicySupport(selector, optional)
			if err != nil || support.Executable || support.Reason != "unsupported-policy-pin" {
				t.Fatalf("optional policy silently executed: %+v %v", support, err)
			}
		}
		wrong := "hearts-baseline-1.0.0"
		if mode == "hearts" {
			wrong = "spades-tactics-2.1.0"
		}
		support, err = r.PolicySupport(selector, wrong)
		if err != nil || support.Executable {
			t.Fatal("wrong-game policy enabled")
		}
		selector.ModuleVersion = "1.0.0"
		if _, err = r.PolicySupport(selector, policy); err == nil {
			t.Fatal("V1 repinned")
		}
	}
}

func TestRegistryDocumentMetadataAndStrictImport(t *testing.T) {
	r := testRegistry(t)
	s := testStart(t, r, "spades-solo")
	raw, err := s.SerializePrivate()
	if err != nil {
		t.Fatal(err)
	}
	var doc document
	if err = json.Unmarshal(raw, &doc); err != nil {
		t.Fatal(err)
	}
	prepared, err := s.Prepare(1, "spades-tactics-2.1.0")
	if err != nil {
		t.Fatal(err)
	}
	doc.Journal = journal{Version: "2.0.0", Revision: 1, Entries: []journalEntry{{Revision: 1, CommandID: "original", Operation: json.RawMessage(`{"kind":"actor","seat":1,"candidateId":"bid:1"}`)}}}
	doc.Audits = audits{Version: "2.0.0", Entries: []analysisAudit{{ID: "original-advice", PolicyID: prepared.PolicyID, InputDigest: prepared.InputDigest, ObservationSchemaVersion: prepared.ObservationSchemaVersion, Analysis: prepared.Analysis}}}
	saved, err := json.Marshal(doc)
	if err != nil {
		t.Fatal(err)
	}
	s, err = r.DecodeDocument(saved)
	if err != nil {
		t.Fatal(err)
	}
	tx, err := s.Commit(1, "bid:1")
	if err != nil {
		t.Fatal(err)
	}
	next, err := tx.Next.SerializePrivate()
	if err != nil {
		t.Fatal(err)
	}
	var nextDoc document
	if err = json.Unmarshal(next, &nextDoc); err != nil {
		t.Fatal(err)
	}
	// JSON object member order and numeric spelling are not historical policy
	// meaning. Preserve all original values and every ordered evidence array.
	metadata := func(j journal, a audits) any {
		raw, err := json.Marshal(map[string]any{"journal": j, "audits": a})
		if err != nil {
			t.Fatal(err)
		}
		value, err := contracts.ParseJSON(raw)
		if err != nil {
			t.Fatal(err)
		}
		return value
	}
	if !reflect.DeepEqual(metadata(nextDoc.Journal, nextDoc.Audits), metadata(doc.Journal, doc.Audits)) {
		t.Fatal("transition rewrote original journal/advice")
	}
	for name, mutate := range map[string]func(map[string]any){
		"unknown envelope": func(m map[string]any) { m["unexpected"] = true },
		"unknown journal":  func(m map[string]any) { m["journal"].(map[string]any)["unexpected"] = true },
		"wrong state pin":  func(m map[string]any) { m["pin"].(map[string]any)["stateSchemaVersion"] = "3.0.0" },
		"wrong competition": func(m map[string]any) {
			m["competition"].(map[string]any)["competitors"].([]any)[0].(map[string]any)["id"] = "other"
		},
		"wrong controller":       func(m map[string]any) { m["controllers"].([]any)[1].(map[string]any)["kind"] = "human" },
		"wrong journal revision": func(m map[string]any) { m["journal"].(map[string]any)["revision"] = 2 },
		"wrong audit digest": func(m map[string]any) {
			m["audits"].(map[string]any)["entries"].([]any)[0].(map[string]any)["inputDigest"] = "bad"
		},
		"wrong audit pin": func(m map[string]any) {
			m["audits"].(map[string]any)["entries"].([]any)[0].(map[string]any)["observationSchemaVersion"] = "1.0.0"
		},
	} {
		t.Run(name, func(t *testing.T) {
			var m map[string]any
			if err := json.Unmarshal(saved, &m); err != nil {
				t.Fatal(err)
			}
			mutate(m)
			bad, err := json.Marshal(m)
			if err != nil {
				t.Fatal(err)
			}
			if _, err = r.DecodeDocument(bad); err == nil {
				t.Fatal("accepted tampered document")
			}
		})
	}
}

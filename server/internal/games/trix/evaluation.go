package trix

import (
	"cardford/server/internal/gamekernel"
	"context"
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"math/rand/v2"
	"reflect"
	"sort"
)

// RequestEvaluationConfig is an offline fixed-work profile, not a live selector.
// Streams derive exclusively from the semantic actor observation and exact rule
// pin. Neither an original aggregate nor its deal seed can cross this boundary.
type RequestEvaluationConfig struct {
	Version              string    `json:"version"`
	Worlds               int       `json:"worlds"`
	MaxSamplerOperations int       `json:"maxSamplerOperations"`
	MaxSteps             int       `json:"maxSteps"`
	Policies             [4]string `json:"policies"`
	Stream               string    `json:"stream"`
}
type EvaluationWork struct {
	SamplerOperations int `json:"samplerOperations"`
	Steps             int `json:"steps"`
	Worlds            int `json:"worlds"`
	Attempts          int `json:"attempts"`
}
type RequestEvaluationResult struct {
	Version      string         `json:"version"`
	Status       string         `json:"status"`
	InputDigest  string         `json:"inputDigest"`
	RulePin      gamekernel.Pin `json:"rulePin"`
	CandidateIDs []string       `json:"candidateIds"`
	Values       [][]float64    `json:"values"`
	Work         EvaluationWork `json:"work"`
	Limitations  []string       `json:"limitations"`
}

func DefaultRequestEvaluationConfig() RequestEvaluationConfig {
	return RequestEvaluationConfig{Version: "trix-request-evaluation-1.0.0", Worlds: 2, MaxSamplerOperations: 2000000, MaxSteps: 100000, Policies: [4]string{PolicyID, PolicyID, PolicyID, PolicyID}, Stream: "comparison"}
}
func (c RequestEvaluationConfig) Validate() error {
	if c.Version != "trix-request-evaluation-1.0.0" || c.Worlds < 1 || c.Worlds > 128 || c.MaxSamplerOperations < 1 || c.MaxSamplerOperations > 16000000 || c.MaxSteps < 1 || c.MaxSteps > 1000000 || c.Stream != "comparison" {
		return fmt.Errorf("invalid Trix fixed-work evaluation configuration")
	}
	for _, id := range c.Policies {
		if !SupportsPolicy(id) {
			return fmt.Errorf("unsupported Trix continuation policy")
		}
	}
	return nil
}

var errEvaluationBudget = errors.New("Trix evaluation fixed work exhausted")

type evaluationMeter struct {
	ctx    context.Context
	config RequestEvaluationConfig
	work   *EvaluationWork
}

func (m *evaluationMeter) sample() error {
	if e := m.ctx.Err(); e != nil {
		return e
	}
	if m.work.SamplerOperations >= m.config.MaxSamplerOperations {
		return errEvaluationBudget
	}
	m.work.SamplerOperations++
	return nil
}
func (m *evaluationMeter) step() error {
	if e := m.ctx.Err(); e != nil {
		return e
	}
	if m.work.Steps >= m.config.MaxSteps {
		return errEvaluationBudget
	}
	m.work.Steps++
	return nil
}
func evaluationProfile(pin gamekernel.Pin, o Observation) (Config, error) {
	installed, err := PinForPublicSchema(o.VariantID, pin.PublicSchemaVersion)
	if err != nil || pin != installed || pin.GameID != "trix" || pin.VariantID != o.VariantID || (o.publicSchemaVersion != "" && o.publicSchemaVersion != pin.PublicSchemaVersion) || (o.LayoutHistory != nil) != (pin.PublicSchemaVersion == "1.2.0") {
		return Config{}, fmt.Errorf("unsupported exact Trix evaluation pin")
	}
	c := Config{ID: o.ID, Variant: o.VariantID}
	if pin.RuleProfileID == "trix-"+o.VariantID+"-1.1.0" {
		c.ProfileVersion = "1.1.0"
	}
	if pin.PublicSchemaVersion == "1.2.0" {
		c.LayoutHistoryVersion = "1.0.0"
	}
	return c, nil
}
func evaluationDigest(o Observation, pin gamekernel.Pin) [32]byte {
	o.ID = "semantic-observation"
	raw, _ := json.Marshal(struct {
		Pin         gamekernel.Pin `json:"pin"`
		Observation Observation    `json:"observation"`
	}{pin, o})
	return sha256.Sum256(raw)
}

// EvaluateRequest compares every native legal action on common feasible worlds.
// Future choices are made from Observe(world, actor), never from world.Hands.
// Public declarations are sequential: each declarer sees earlier declarations.
func EvaluateRequest(ctx context.Context, o Observation, pin gamekernel.Pin, c RequestEvaluationConfig) (out RequestEvaluationResult, err error) {
	out = RequestEvaluationResult{Version: c.Version, Status: "incomplete", CandidateIDs: []string{}, Values: [][]float64{}, Limitations: []string{
		"Request-end residual margin: own team minus opposing team for Partners, own minus mean opponents for Solo; future request-pool and kingdom value are excluded.",
		"Uniform allocations conditional on public hard constraints and a bounded native-history witness; this is not a behavioral belief model or strength proof.",
		"Finite sampled values are conditional diagnostics; observed ranges are not confidence intervals or unique-best evidence.",
		"Every alternative shares each sampled world; continuation decisions use only each future actor's observation.",
	}}
	if ctx == nil {
		return out, fmt.Errorf("evaluation context required")
	}
	if err = c.Validate(); err != nil {
		return out, err
	}
	config, e := evaluationProfile(pin, o)
	if e != nil {
		return out, e
	}
	if e = ValidateLayoutHistoryObservation(o); e != nil {
		return out, e
	}
	out.RulePin = pin
	if o.GameID != "trix" || !validVariant(o.VariantID) || o.ID == "" || o.Seat < 0 || o.Seat > 3 || o.Owner < 0 || o.Owner > 3 || o.Turn == nil || *o.Turn != o.Seat || o.HandCounts[o.Seat] != len(o.Hand) || len(o.Hand) > 13 || o.DealNumber < 1 || o.DealNumber > 4*len(requests(o.VariantID)) || o.Kingdom < 1 || o.Kingdom > 4 || len(o.Tricks) > 13 || len(o.Trick) > 3 || len(o.Passes) > 156 || len(o.Declarations) > 4 || len(o.FinishOrder) > 4 || len(o.RemainingRequests) > 5 || len(o.Ledger) > 4096 || len(o.WithheldBonuses) > 512 {
		return out, fmt.Errorf("invalid or oversized active Trix observation")
	}
	// Native Legal assumes typed valid card identities. Check this boundary
	// before invoking it, hashing, or allocating based on public history.
	deck := Deck()
	for _, card := range o.Hand {
		if !contains(deck, card) {
			return out, fmt.Errorf("invalid actor card")
		}
	}
	for _, t := range append(append([]Trick{}, o.Tricks...), Trick{Plays: o.Trick}) {
		if len(t.Plays) > 4 {
			return out, fmt.Errorf("oversized public trick")
		}
		for _, play := range t.Plays {
			if !contains(deck, play.Card) {
				return out, fmt.Errorf("invalid public card")
			}
		}
	}
	digest := evaluationDigest(o, pin)
	out.InputDigest = hex.EncodeToString(digest[:])
	legal := Legal(o)
	if len(legal) == 0 {
		return out, fmt.Errorf("no legal Trix alternatives")
	}
	for _, a := range legal {
		out.CandidateIDs = append(out.CandidateIDs, ActionID(a))
	}
	meter := &evaluationMeter{ctx: ctx, config: c, work: &out.Work}
	finish := func(e error) (RequestEvaluationResult, error) {
		if errors.Is(e, errEvaluationBudget) {
			out.Limitations = append(out.Limitations, e.Error())
			return out, nil
		}
		return out, e
	}
	sampler, e := newEvaluationSampler(o, config, meter)
	if e != nil {
		return finish(e)
	}
	for world := 0; world < c.Worlds; world++ {
		// Each ordinal has its own observation-derived stream. Rejected allocations
		// and replay search consume the same explicit sampler-operation allowance.
		seed := sha256.Sum256(append(digest[:], []byte(fmt.Sprintf("/%s/%d", c.Stream, world))...))
		rng := rand.New(rand.NewPCG(binary.LittleEndian.Uint64(seed[:8]), binary.LittleEndian.Uint64(seed[8:16])))
		s, e := sampler.world(rng)
		if e != nil {
			return finish(e)
		}
		base := evaluationScore(s, o.Seat)
		row := make([]float64, 0, len(legal))
		for _, root := range legal {
			if e = meter.step(); e != nil {
				return finish(e)
			}
			branch, e := Apply(s, o.Seat, root)
			if e != nil {
				return out, e
			}
			for branch.Phase != "round-complete" {
				if e = meter.step(); e != nil {
					return finish(e)
				}
				actor := branch.Turn
				action, e := DecideWithPolicy(Observe(branch, actor), c.Policies[actor])
				if e != nil {
					return out, e
				}
				branch, e = Apply(branch, actor, action)
				if e != nil {
					return out, e
				}
			}
			row = append(row, evaluationScore(branch, o.Seat)-base)
		}
		// Never publish a partly compared world as if its candidates were paired.
		out.Values = append(out.Values, row)
		out.Work.Worlds++
	}
	out.Status = "completed"
	return out, nil
}
func evaluationScore(s State, seat int) float64 {
	own, others := 0.0, 0.0
	values := scores(s, s.DealNumber, 0)
	for _, v := range values {
		member := false
		for _, id := range v.Seats {
			if id == seat {
				member = true
			}
		}
		if member {
			own = float64(v.Total)
		} else {
			others += float64(v.Total)
		}
	}
	return own - others/float64(len(values)-1)
}

type evaluationSampler struct {
	o          Observation
	config     Config
	meter      *evaluationMeter
	cards      []string
	masks      []uint8
	public     map[string]int
	memo       map[[4]int]uint64
	capacities [4]int
}

func newEvaluationSampler(o Observation, c Config, m *evaluationMeter) (*evaluationSampler, error) {
	if e := ValidateLayoutHistoryObservation(o); e != nil {
		return nil, e
	}
	p := &evaluationSampler{o: o, config: c, meter: m, public: map[string]int{}, memo: map[[4]int]uint64{}}
	known := map[string]bool{}
	deck := map[string]bool{}
	for _, card := range Deck() {
		deck[card] = true
	}
	mark := func(card string, seat int) error {
		if e := m.sample(); e != nil {
			return e
		}
		if !deck[card] || known[card] {
			return fmt.Errorf("invalid or repeated public/own Trix card")
		}
		known[card] = true
		p.public[card] = seat
		return nil
	}
	for _, card := range o.Hand {
		if e := mark(card, o.Seat); e != nil {
			return nil, e
		}
	}
	var void [4][4]bool
	for _, t := range append(append([]Trick{}, o.Tricks...), Trick{Plays: o.Trick}) {
		for _, play := range t.Plays {
			if play.Seat < 0 || play.Seat > 3 {
				return nil, fmt.Errorf("invalid public seat")
			}
			if e := mark(play.Card, play.Seat); e != nil {
				return nil, e
			}
			if len(t.Plays) > 0 && play.Card[0] != t.Plays[0].Card[0] {
				void[play.Seat][suitIndex(t.Plays[0].Card)] = true
			}
		}
	}
	for _, card := range o.Hand {
		if void[o.Seat][suitIndex(card)] {
			return nil, fmt.Errorf("own remaining card contradicts observed void")
		}
	}
	if len(o.Board) != 4 {
		return nil, fmt.Errorf("invalid Trix board")
	}
	for i, r := range o.Board {
		if r.Suit != []string{"C", "D", "H", "S"}[i] || r.Low == 0 && r.High != 0 || r.Low != 0 && (r.Low < 2 || r.Low > 11 || r.High < 11 || r.High > 14) {
			return nil, fmt.Errorf("invalid Trix board bounds")
		}
		for _, card := range Deck() {
			if r.Low > 0 && card[:1] == r.Suit && rank(card) >= r.Low && rank(card) <= r.High {
				if e := mark(card, -1); e != nil {
					return nil, e
				}
			}
		}
	}
	if o.LayoutHistory != nil {
		for _, turn := range o.LayoutHistory.Turns {
			if turn.Kind == "layout-card" {
				p.public[turn.Card] = turn.Seat
			}
		}
	}
	forced := map[string]int{}
	for _, d := range o.Declarations {
		if d.Seat < 0 || d.Seat > 3 {
			return nil, fmt.Errorf("invalid declaration seat")
		}
		for _, card := range d.Cards {
			if !deck[card] || o.Request == nil || !eligibleDouble(*o.Request, card) {
				return nil, fmt.Errorf("invalid declaration card")
			}
			if seat, ok := forced[card]; ok && seat != d.Seat {
				return nil, fmt.Errorf("conflicting declared ownership")
			}
			forced[card] = d.Seat
		}
	}
	if o.DealNumber == 1 {
		forced["H7"] = o.Owner
	}
	if a := o.TwoAnnouncements; a != nil {
		if c.ProfileVersion != "1.1.0" || o.Request == nil || *o.Request != "trix" {
			return nil, fmt.Errorf("announcement outside current Partners layout")
		}
		if a.Status == "revealed" {
			if len(a.Cards) != 4 || a.Counts != nil {
				return nil, fmt.Errorf("invalid revealed twos")
			}
			seen := map[string]bool{}
			for _, v := range a.Cards {
				if !contains(twoCards[:], v.Card) || v.Seat < 0 || v.Seat > 3 || seen[v.Card] {
					return nil, fmt.Errorf("invalid two owner")
				}
				seen[v.Card] = true
				forced[v.Card] = v.Seat
			}
		} else if a.Status == "hidden" {
			if a.Counts == nil || len(a.Cards) > 0 {
				return nil, fmt.Errorf("invalid hidden twos")
			}
			n := 0
			for _, v := range a.Counts {
				if v < 0 || v > 4 {
					return nil, fmt.Errorf("invalid hidden two count")
				}
				n += v
			}
			if n != 4 {
				return nil, fmt.Errorf("invalid hidden two total")
			}
		} else {
			return nil, fmt.Errorf("unknown twos announcement")
		}
	}
	for card, seat := range forced {
		if actual, ok := p.public[card]; ok && actual >= 0 && actual != seat {
			return nil, fmt.Errorf("public card ownership contradiction")
		}
	}
	for seat, count := range o.HandCounts {
		if count < 0 || count > 13 {
			return nil, fmt.Errorf("invalid hand count")
		}
		if seat != o.Seat {
			p.capacities[seat] = count
		}
	}
	lastMoves := -1
	for _, pass := range o.Passes {
		if e := m.sample(); e != nil {
			return nil, e
		}
		moves, ok := evaluationBoardCount(pass.Board)
		if !ok || pass.Seat < 0 || pass.Seat > 3 || moves < lastMoves {
			return nil, fmt.Errorf("invalid layout pass chronology")
		}
		lastMoves = moves
		for _, card := range o.Hand {
			if pass.Seat == o.Seat && placeable(pass.Board, card) {
				return nil, fmt.Errorf("own remaining card contradicts recorded pass")
			}
		}
	}
	for _, card := range Deck() {
		if e := m.sample(); e != nil {
			return nil, e
		}
		if known[card] {
			continue
		}
		mask := uint8(0)
		for seat := 0; seat < 4; seat++ {
			if seat == o.Seat || void[seat][suitIndex(card)] {
				continue
			}
			if owner, ok := forced[card]; ok && owner != seat {
				continue
			}
			blocked := false
			for _, pass := range o.Passes {
				if pass.Seat == seat && placeable(pass.Board, card) {
					blocked = true
					break
				}
			}
			if !blocked {
				mask |= 1 << seat
			}
		}
		if mask == 0 {
			return nil, fmt.Errorf("no feasible owner for public-unseen card")
		}
		p.cards = append(p.cards, card)
		p.masks = append(p.masks, mask)
	}
	n := 0
	for _, v := range p.capacities {
		n += v
	}
	if n != len(p.cards) {
		return nil, fmt.Errorf("Trix card conservation mismatch")
	}
	count, e := p.count(p.capacities)
	if e != nil {
		return nil, e
	}
	if count == 0 {
		return nil, fmt.Errorf("no allocation satisfies public constraints")
	}
	return p, nil
}
func suitIndex(card string) int {
	switch card[0] {
	case 'C':
		return 0
	case 'D':
		return 1
	case 'H':
		return 2
	default:
		return 3
	}
}
func (p *evaluationSampler) count(left [4]int) (uint64, error) {
	if e := p.meter.sample(); e != nil {
		return 0, e
	}
	remaining := 0
	for _, v := range left {
		remaining += v
	}
	if remaining == 0 {
		return 1, nil
	}
	if n, ok := p.memo[left]; ok {
		return n, nil
	}
	index := len(p.cards) - remaining
	sum := uint64(0)
	for seat := 0; seat < 4; seat++ {
		if left[seat] == 0 || p.masks[index]&(1<<seat) == 0 {
			continue
		}
		next := left
		next[seat]--
		n, e := p.count(next)
		if e != nil {
			return 0, e
		}
		if ^uint64(0)-sum < n {
			return 0, fmt.Errorf("allocation count overflow")
		}
		sum += n
	}
	p.memo[left] = sum
	return sum, nil
}
func (p *evaluationSampler) world(rng *rand.Rand) (State, error) {
	for {
		if e := p.meter.sample(); e != nil {
			return State{}, e
		}
		p.meter.work.Attempts++
		hands := [4][]string{}
		hands[p.o.Seat] = append([]string{}, p.o.Hand...)
		left := p.capacities
		for i, card := range p.cards {
			if e := p.meter.sample(); e != nil {
				return State{}, e
			}
			total, e := p.count(left)
			if e != nil {
				return State{}, e
			}
			ticket := rng.Uint64N(total)
			for seat := 0; seat < 4; seat++ {
				if left[seat] == 0 || p.masks[i]&(1<<seat) == 0 {
					continue
				}
				next := left
				next[seat]--
				n, e := p.count(next)
				if e != nil {
					return State{}, e
				}
				if ticket < n {
					hands[seat] = append(hands[seat], card)
					left = next
					break
				}
				ticket -= n
			}
		}
		for seat := range hands {
			sort.Slice(hands[seat], func(i, j int) bool { return cardLess(hands[seat][i], hands[seat][j]) })
		}
		state, ok, e := p.reconstruct(hands, rng)
		if e != nil {
			return State{}, e
		}
		if ok {
			return state, nil
		}
	}
}
func evaluationBoardCount(board []Row) (int, bool) {
	if len(board) != 4 {
		return 0, false
	}
	n := 0
	for i, r := range board {
		if r.Suit != []string{"C", "D", "H", "S"}[i] || r.Low == 0 && r.High != 0 || r.Low != 0 && (r.Low < 2 || r.Low > 11 || r.High < 11 || r.High > 14) {
			return 0, false
		}
		if r.Low > 0 {
			n += r.High - r.Low + 1
		}
	}
	return n, true
}
func (p *evaluationSampler) initial(hands [4][]string) State {
	o := p.o
	s := State{Config: p.config, Phase: "choose-request", Turn: o.Owner, Kingdom: o.Kingdom, DealNumber: o.DealNumber, Owner: o.Owner, Hands: hands, RemainingRequests: []string{}, Trick: []Play{}, Tricks: []Trick{}, Declarations: []Declaration{}, Board: []Row{{Suit: "C"}, {Suit: "D"}, {Suit: "H"}, {Suit: "S"}}, FinishOrder: []int{}, Passes: []LayoutPass{}, Ledger: []LedgerEntry{}, WithheldBonuses: []WithheldBonus{}}
	if p.config.LayoutHistoryVersion == "1.0.0" {
		s.LayoutHistory = &LayoutHistory{Version: "1.0.0", Status: "available", Turns: []LayoutTurn{}}
	}
	for _, r := range requests(o.VariantID) {
		if contains(o.RemainingRequests, r) || o.Request != nil && *o.Request == r {
			s.RemainingRequests = append(s.RemainingRequests, r)
		}
	}
	for _, entry := range o.Ledger {
		if entry.DealNumber != o.DealNumber {
			s.Ledger = append(s.Ledger, entry)
		}
	}
	for _, entry := range o.WithheldBonuses {
		if entry.DealNumber != o.DealNumber {
			s.WithheldBonuses = append(s.WithheldBonuses, entry)
		}
	}
	return s
}
func (p *evaluationSampler) matches(s State) bool {
	have, want := Observe(s, p.o.Seat), p.o
	a, _ := json.Marshal(have)
	b, _ := json.Marshal(want)
	return string(a) == string(b)
}
func (p *evaluationSampler) reconstruct(hands [4][]string, rng *rand.Rand) (State, bool, error) {
	if p.o.Phase == "layout" {
		return p.layoutWitness(hands, rng)
	}
	initial := hands
	for _, t := range append(append([]Trick{}, p.o.Tricks...), Trick{Plays: p.o.Trick}) {
		for _, play := range t.Plays {
			initial[play.Seat] = append(initial[play.Seat], play.Card)
		}
	}
	for seat := range initial {
		if len(initial[seat]) != 13 {
			return State{}, false, fmt.Errorf("initial hand conservation mismatch")
		}
		sort.Slice(initial[seat], func(i, j int) bool { return cardLess(initial[seat][i], initial[seat][j]) })
	}
	if p.o.DealNumber == 1 && !contains(initial[p.o.Owner], "H7") {
		return State{}, false, nil
	}
	s := p.initial(initial)
	if e := validateState(s); e != nil {
		return State{}, false, e
	}
	apply := func(a Action) error {
		if e := p.meter.sample(); e != nil {
			return e
		}
		var e error
		s, e = Apply(s, s.Turn, a)
		return e
	}
	if p.o.Request != nil {
		if e := apply(Action{Kind: "choose-request", Request: *p.o.Request}); e != nil {
			return State{}, false, e
		}
	}
	for _, d := range p.o.Declarations {
		if s.Turn != d.Seat {
			return State{}, false, fmt.Errorf("invalid declaration chronology")
		}
		if e := apply(Action{Kind: "declare-doubles", Cards: d.Cards}); e != nil {
			if errors.Is(e, errEvaluationBudget) || p.meter.ctx.Err() != nil {
				return State{}, false, e
			}
			return State{}, false, nil
		}
	}
	for _, t := range append(append([]Trick{}, p.o.Tricks...), Trick{Plays: p.o.Trick}) {
		for _, play := range t.Plays {
			if s.Turn != play.Seat {
				return State{}, false, fmt.Errorf("invalid public play chronology")
			}
			if e := apply(Action{Kind: "play-card", Card: play.Card}); e != nil {
				if errors.Is(e, errEvaluationBudget) || p.meter.ctx.Err() != nil {
					return State{}, false, e
				}
				return State{}, false, nil
			}
		}
	}
	if !p.matches(s) {
		return State{}, false, fmt.Errorf("public observation disagrees with native replay")
	}
	return s, true, nil
}

// layoutWitness reconstructs one original-hand/public-move witness. Public
// board snapshots timestamp passes; a card assigned to a seat later in this
// search must also have been unavailable at every earlier pass by that seat.
// Witness count is never a sampling weight.
func (p *evaluationSampler) layoutWitness(remaining [4][]string, rng *rand.Rand) (State, bool, error) {
	o := p.o
	if o.LayoutHistory != nil {
		for range o.LayoutHistory.Turns {
			if e := p.meter.sample(); e != nil {
				return State{}, false, e
			}
		}
		s, ok, e := replayLayoutHistory(o, p.config, remaining)
		return s, ok && e == nil && p.matches(s), e
	}
	target, _ := evaluationBoardCount(o.Board)
	original := remaining
	need := [4]int{}
	for seat := range need {
		need[seat] = 13 - len(remaining[seat])
	}
	actions := []Action{}
	owners := []int{}
	var found State
	var search func([]Row, int, int, int, [4]int, []int) (bool, error)
	search = func(board []Row, turn, placed, passIndex int, used [4]int, finished []int) (bool, error) {
		if e := p.meter.sample(); e != nil {
			return false, e
		}
		if placed == target && passIndex == len(o.Passes) {
			if turn != *o.Turn || !reflect.DeepEqual(board, o.Board) || !reflect.DeepEqual(finished, o.FinishOrder) || used != need {
				return false, nil
			}
			sorted := [4][]string{}
			for seat := range original {
				sorted[seat] = append([]string{}, original[seat]...)
				sort.Slice(sorted[seat], func(i, j int) bool { return cardLess(sorted[seat][i], sorted[seat][j]) })
			}
			if o.DealNumber == 1 && !contains(original[o.Owner], "H7") {
				return false, nil
			}
			s := p.initial(sorted)
			var e error
			s, e = Apply(s, s.Turn, Action{Kind: "choose-request", Request: "trix"})
			if e != nil {
				return false, e
			}
			for i, a := range actions {
				if e = p.meter.sample(); e != nil {
					return false, e
				}
				s, e = Apply(s, owners[i], a)
				if e != nil {
					return false, nil
				}
			}
			if p.matches(s) {
				found = s
				return true, nil
			}
			return false, nil
		}
		next := func(seat int, counts [4]int) int {
			for i := 0; i < 4; i++ {
				seat = NextSeat(seat)
				if len(remaining[seat]) > 0 || counts[seat] < need[seat] {
					return seat
				}
			}
			return seat
		}
		if passIndex < len(o.Passes) {
			pass := o.Passes[passIndex]
			at, _ := evaluationBoardCount(pass.Board)
			if placed > at {
				return false, nil
			}
			if placed == at {
				if turn != pass.Seat || !reflect.DeepEqual(board, pass.Board) {
					return false, nil
				}
				for _, card := range remaining[turn] {
					if placeable(board, card) {
						return false, nil
					}
				}
				actions = append(actions, Action{Kind: "layout-pass"})
				owners = append(owners, turn)
				ok, e := search(board, next(turn, used), placed, passIndex+1, used, finished)
				actions = actions[:len(actions)-1]
				owners = owners[:len(owners)-1]
				return ok, e
			}
		}
		if used[turn] >= need[turn] {
			return false, nil
		}
		choices := []string{}
		for _, card := range Deck() {
			if e := p.meter.sample(); e != nil {
				return false, e
			}
			if !placeable(board, card) {
				continue
			}
			r := o.Board[suitIndex(card)]
			if r.Low == 0 || rank(card) < r.Low || rank(card) > r.High {
				continue
			}
			blocked := false
			if o.DealNumber == 1 && card == "H7" && turn != o.Owner {
				continue
			}
			if a := o.TwoAnnouncements; a != nil && a.Status == "revealed" {
				for _, v := range a.Cards {
					if v.Card == card && v.Seat != turn {
						blocked = true
					}
				}
			}
			for i := 0; i < passIndex; i++ {
				pass := o.Passes[i]
				if pass.Seat == turn && placeable(pass.Board, card) {
					blocked = true
				}
			}
			if !blocked {
				choices = append(choices, card)
			}
		}
		rng.Shuffle(len(choices), func(i, j int) { choices[i], choices[j] = choices[j], choices[i] })
		for _, card := range choices {
			original[turn] = append(original[turn], card)
			counts := used
			counts[turn]++
			b := append([]Row{}, board...)
			i := suitIndex(card)
			v := rank(card)
			if b[i].Low == 0 {
				b[i].Low = v
				b[i].High = v
			} else if v < b[i].Low {
				b[i].Low = v
			} else {
				b[i].High = v
			}
			f := append([]int{}, finished...)
			if len(remaining[turn]) == 0 && counts[turn] == need[turn] {
				f = append(f, turn)
				if len(f) > len(o.FinishOrder) || f[len(f)-1] != o.FinishOrder[len(f)-1] {
					original[turn] = original[turn][:len(original[turn])-1]
					continue
				}
			}
			actions = append(actions, Action{Kind: "layout-card", Card: card})
			owners = append(owners, turn)
			ok, e := search(b, next(turn, counts), placed+1, passIndex, counts, f)
			actions = actions[:len(actions)-1]
			owners = owners[:len(owners)-1]
			original[turn] = original[turn][:len(original[turn])-1]
			if ok || e != nil {
				return ok, e
			}
		}
		return false, nil
	}
	ok, e := search([]Row{{Suit: "C"}, {Suit: "D"}, {Suit: "H"}, {Suit: "S"}}, o.Owner, 0, 0, [4]int{}, []int{})
	return found, ok, e
}
